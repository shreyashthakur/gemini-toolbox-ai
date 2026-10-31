import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { TOOL_DECLARATIONS, executeTool } from './tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY || '';

async function runLiveTest() {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('⚠️ GEMINI_API_KEY is not configured in gemini-toolbox/.env');
    console.log('Please set GEMINI_API_KEY=<real_key> in gemini-toolbox/.env to run live tests.');
    process.exit(2);
  }

  console.log('🔑 GEMINI_API_KEY detected. Starting live Gemini API audit with model: gemini-3.8-flash...\n');

  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3.8-flash';
  const config = {
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    systemInstruction:
      'You are Gemini Toolbox AI. Always invoke the calculate, convert_units, or calculate_percentage tool when a calculation, conversion, or percentage is requested. Use the exact tool result in your final response.',
  };

  // Helper function to run one agent turn with tool execution loop
  async function runAgentTurn(conversationHistory: Array<{ role: 'user' | 'model'; parts: any[] }>, userPrompt: string) {
    const contents: any[] = [...conversationHistory, { role: 'user', parts: [{ text: userPrompt }] }];
    let round = 0;
    const toolsExecuted: any[] = [];

    while (round < 5) {
      round++;
      const response = await ai.models.generateContent({ model, contents, config });
      const calls = response.functionCalls;

      if (!calls || calls.length === 0) {
        return {
          text: response.text || '',
          toolsExecuted,
          updatedHistory: [...contents, { role: 'model', parts: [{ text: response.text || '' }] }],
        };
      }

      // Add model function call turn
      contents.push(response.candidates?.[0]?.content || {
        role: 'model',
        parts: calls.map((c) => ({ functionCall: c })),
      });

      // Execute tools
      const toolParts: any[] = [];
      for (const call of calls) {
        const result = await executeTool(call.name || '', call.args || {});
        toolsExecuted.push({ toolName: call.name, args: call.args, result: result.data, success: result.success });
        toolParts.push({
          functionResponse: {
            name: call.name,
            response: { output: result.data || result.error },
            id: call.id,
          },
        });
      }

      contents.push({ role: 'user', parts: toolParts });
    }

    return { text: '', toolsExecuted, updatedHistory: contents };
  }

  let history: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  // TEST 1: Math calculation
  console.log('👉 [TEST 1] Testing prompt: "Calculate 125 * 48 + 360 / 6"');
  const t1 = await runAgentTurn(history, 'Calculate 125 * 48 + 360 / 6');
  console.log('   Tools invoked:', t1.toolsExecuted.map((t) => `${t.toolName}(${JSON.stringify(t.args)})`).join(', '));
  console.log('   Tool output:', JSON.stringify(t1.toolsExecuted.map((t) => t.result)));
  console.log('   Gemini response:', t1.text.slice(0, 150), '...\n');
  const calcSuccess = t1.toolsExecuted.some((t) => t.toolName === 'calculate' && t.result?.result === 6060);
  if (!calcSuccess) {
    console.error('❌ TEST 1 Failed: Expected calculate tool to return 6060');
    process.exit(1);
  }
  console.log('✅ TEST 1 Passed: calculate tool executed and returned 6060.\n');
  history = t1.updatedHistory;

  // TEST 2: Unit conversion
  console.log('👉 [TEST 2] Testing prompt: "Convert 5 kilometers to miles."');
  const t2 = await runAgentTurn(history, 'Convert 5 kilometers to miles.');
  console.log('   Tools invoked:', t2.toolsExecuted.map((t) => `${t.toolName}(${JSON.stringify(t.args)})`).join(', '));
  console.log('   Tool output:', JSON.stringify(t2.toolsExecuted.map((t) => t.result)));
  console.log('   Gemini response:', t2.text.slice(0, 150), '...\n');
  const convSuccess = t2.toolsExecuted.some((t) => t.toolName === 'convert_units' && Math.abs(t.result?.converted_value - 3.10686) < 0.01);
  if (!convSuccess) {
    console.error('❌ TEST 2 Failed: Expected convert_units tool to return ~3.10686 miles');
    process.exit(1);
  }
  console.log('✅ TEST 2 Passed: convert_units tool executed and returned 3.10686.\n');
  history = t2.updatedHistory;

  // TEST 3: Percentage calculation
  console.log('👉 [TEST 3] Testing prompt: "Calculate 18% of 2500."');
  const t3 = await runAgentTurn(history, 'Calculate 18% of 2500.');
  console.log('   Tools invoked:', t3.toolsExecuted.map((t) => `${t.toolName}(${JSON.stringify(t.args)})`).join(', '));
  console.log('   Tool output:', JSON.stringify(t3.toolsExecuted.map((t) => t.result)));
  console.log('   Gemini response:', t3.text.slice(0, 150), '...\n');
  const pctSuccess = t3.toolsExecuted.some((t) => t.toolName === 'calculate_percentage' && t.result?.result === 450);
  if (!pctSuccess) {
    console.error('❌ TEST 3 Failed: Expected calculate_percentage tool to return 450');
    process.exit(1);
  }
  console.log('✅ TEST 3 Passed: calculate_percentage tool executed and returned 450.\n');
  history = t3.updatedHistory;

  // TEST 4: Follow-up question verifying context
  console.log('👉 [TEST 4] Testing follow-up context prompt: "Now what was the first math calculation we did earlier, and what was its result?"');
  const t4 = await runAgentTurn(history, 'Now what was the first math calculation we did earlier, and what was its result?');
  console.log('   Gemini response:', t4.text);
  const mentions6060 = t4.text.includes('6060') || t4.text.includes('6,060');
  if (!mentions6060) {
    console.error('❌ TEST 4 Failed: Expected context to retain 6060');
    process.exit(1);
  }
  console.log('✅ TEST 4 Passed: Context retained and previous calculation correctly referenced.\n');

  console.log('🎉 ALL LIVE GEMINI API TESTS PASSED WITH GEMINI-3.8-FLASH!');
}

runLiveTest().catch((err) => {
  console.error('Live test error:', err);
  process.exit(1);
});


import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { TOOL_DECLARATIONS, executeTool } from './tools';
import { generateContentWithResilience } from './geminiResilience';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY || '';

interface TestResult {
  name: string;
  passed: boolean;
  modelUsed: string;
  fallbackUsed: boolean;
  toolInvoked?: string;
  toolResult?: any;
  error?: string;
}

async function runLiveAudit() {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.log('⚠️ GEMINI_API_KEY is not configured in gemini-toolbox/.env');
    console.log('Please set GEMINI_API_KEY=<real_key> in gemini-toolbox/.env to run live tests.');
    process.exit(2);
  }

  console.log('================================================================');
  console.log('  GEMINI TOOLBOX AI — LIVE API AUDIT & FUNCTION CALLING VERIFICATION');
  console.log('================================================================');
  console.log('Primary Model:  gemini-3.8-flash (with exponential backoff retries)');
  console.log('Fallback Model: gemini-3.1-flash-lite (automatic on 503 high demand)');
  console.log('Resilience:     3 retries with exponential backoff (~1s, ~2s, ~4s + jitter)\n');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 60000,
      retryOptions: {
        attempts: 1, // Single retry controller via exponential backoff in test
      },
    },
  });
  const primaryModel = 'gemini-3.8-flash';
  const fallbackModel = 'gemini-3.1-flash-lite';

  const config = {
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    httpOptions: {
      timeout: 60000,
      retryOptions: {
        attempts: 1,
      },
    },
    systemInstruction:
      'You are Gemini Toolbox AI. Always invoke the calculate, convert_units, or calculate_percentage tool when a calculation, conversion, or percentage is requested. Always cite the exact tool result in your final response.',
  };

  const results: TestResult[] = [];

  // Helper function to run one agent turn with tool execution loop
  async function runAgentTurn(conversationHistory: Array<{ role: 'user' | 'model'; parts: any[] }>, userPrompt: string) {
    const contents: any[] = [...conversationHistory, { role: 'user', parts: [{ text: userPrompt }] }];
    let round = 0;
    const toolsExecuted: any[] = [];
    let usedModel = primaryModel;
    let fallbackUsed = false;

    while (round < 5) {
      round++;
      const genResult = await generateContentWithResilience(ai, {
        primaryModel,
        fallbackModel,
        contents,
        config,
        onStatus: (st) => {
          console.log(`   ℹ️ [RESILIENCE EVENT] ${st.message}`);
        },
      });

      usedModel = genResult.usedModel;
      if (genResult.fallbackUsed) fallbackUsed = true;

      const response = genResult.response;
      const calls = response.functionCalls;

      if (!calls || calls.length === 0) {
        return {
          text: response.text || '',
          toolsExecuted,
          usedModel,
          fallbackUsed,
          updatedHistory: [...contents, { role: 'model', parts: [{ text: response.text || '' }] }],
        };
      }

      // Add model function call turn
      contents.push(response.candidates?.[0]?.content || {
        role: 'model',
        parts: calls.map((c) => ({ functionCall: c })),
      });

      // Execute each tool
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

    return { text: '', toolsExecuted, usedModel, fallbackUsed, updatedHistory: contents };
  }

  let history: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  // --------------------------------------------------------------------------
  // TEST 1: Math Calculator Tool
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 1] Testing math calculation: "Calculate 125 * 48 + 360 / 6"');
  try {
    const t1 = await runAgentTurn(history, 'Calculate 125 * 48 + 360 / 6');
    const calcCall = t1.toolsExecuted.find((t) => t.toolName === 'calculate');
    const calcResult = calcCall?.result?.result;
    const passed = Boolean(calcCall && calcResult === 6060);

    results.push({
      name: 'Calculator Tool (125 * 48 + 360 / 6 -> 6060)',
      passed,
      modelUsed: t1.usedModel,
      fallbackUsed: t1.fallbackUsed,
      toolInvoked: calcCall?.toolName,
      toolResult: calcResult,
    });

    console.log(`   Model Used:      ${t1.usedModel}${t1.fallbackUsed ? ' (Fallback engaged)' : ' (Primary)'}`);
    console.log(`   Tool Invoked:    ${calcCall?.toolName || 'None'}`);
    console.log(`   Tool Arguments:  ${JSON.stringify(calcCall?.args || {})}`);
    console.log(`   Tool Output:     ${JSON.stringify(calcCall?.result || {})}`);
    console.log(`   Gemini Response: ${t1.text.replace(/\n+/g, ' ').slice(0, 140)}...`);
    console.log(`   Status:          ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    if (passed) history = t1.updatedHistory;
  } catch (err: any) {
    console.error('   ❌ FAIL:', err.message);
    results.push({
      name: 'Calculator Tool',
      passed: false,
      modelUsed: primaryModel,
      fallbackUsed: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST 2: Unit Converter Tool
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 2] Testing unit conversion: "Convert 5 kilometers to miles."');
  try {
    const t2 = await runAgentTurn(history, 'Convert 5 kilometers to miles.');
    const convCall = t2.toolsExecuted.find((t) => t.toolName === 'convert_units');
    const convValue = convCall?.result?.converted_value;
    const passed = Boolean(convCall && typeof convValue === 'number' && Math.abs(convValue - 3.10686) < 0.05);

    results.push({
      name: 'Unit Converter Tool (5 km -> ~3.10686 miles)',
      passed,
      modelUsed: t2.usedModel,
      fallbackUsed: t2.fallbackUsed,
      toolInvoked: convCall?.toolName,
      toolResult: convValue,
    });

    console.log(`   Model Used:      ${t2.usedModel}${t2.fallbackUsed ? ' (Fallback engaged)' : ' (Primary)'}`);
    console.log(`   Tool Invoked:    ${convCall?.toolName || 'None'}`);
    console.log(`   Tool Arguments:  ${JSON.stringify(convCall?.args || {})}`);
    console.log(`   Tool Output:     ${JSON.stringify(convCall?.result || {})}`);
    console.log(`   Gemini Response: ${t2.text.replace(/\n+/g, ' ').slice(0, 140)}...`);
    console.log(`   Status:          ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    if (passed) history = t2.updatedHistory;
  } catch (err: any) {
    console.error('   ❌ FAIL:', err.message);
    results.push({
      name: 'Unit Converter Tool',
      passed: false,
      modelUsed: primaryModel,
      fallbackUsed: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST 3: Percentage Calculator Tool
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 3] Testing percentage calculation: "Calculate 18% of 2500."');
  try {
    const t3 = await runAgentTurn(history, 'Calculate 18% of 2500.');
    const pctCall = t3.toolsExecuted.find((t) => t.toolName === 'calculate_percentage');
    const pctResult = pctCall?.result?.result;
    const passed = Boolean(pctCall && pctResult === 450);

    results.push({
      name: 'Percentage Tool (18% of 2500 -> 450)',
      passed,
      modelUsed: t3.usedModel,
      fallbackUsed: t3.fallbackUsed,
      toolInvoked: pctCall?.toolName,
      toolResult: pctResult,
    });

    console.log(`   Model Used:      ${t3.usedModel}${t3.fallbackUsed ? ' (Fallback engaged)' : ' (Primary)'}`);
    console.log(`   Tool Invoked:    ${pctCall?.toolName || 'None'}`);
    console.log(`   Tool Arguments:  ${JSON.stringify(pctCall?.args || {})}`);
    console.log(`   Tool Output:     ${JSON.stringify(pctCall?.result || {})}`);
    console.log(`   Gemini Response: ${t3.text.replace(/\n+/g, ' ').slice(0, 140)}...`);
    console.log(`   Status:          ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    if (passed) history = t3.updatedHistory;
  } catch (err: any) {
    console.error('   ❌ FAIL:', err.message);
    results.push({
      name: 'Percentage Tool',
      passed: false,
      modelUsed: primaryModel,
      fallbackUsed: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST 4: Contextual Follow-up Memory
  // --------------------------------------------------------------------------
  console.log('👉 [TEST 4] Testing contextual memory follow-up');
  try {
    const t4 = await runAgentTurn(history, 'What was the result of the first math calculation we evaluated earlier?');
    const passed = t4.text.includes('6060') || t4.text.includes('6,060');

    results.push({
      name: 'Contextual Memory Retention',
      passed,
      modelUsed: t4.usedModel,
      fallbackUsed: t4.fallbackUsed,
    });

    console.log(`   Model Used:      ${t4.usedModel}${t4.fallbackUsed ? ' (Fallback engaged)' : ' (Primary)'}`);
    console.log(`   Gemini Response: ${t4.text.replace(/\n+/g, ' ').slice(0, 160)}...`);
    console.log(`   Status:          ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
  } catch (err: any) {
    console.error('   ❌ FAIL:', err.message);
    results.push({
      name: 'Contextual Memory Retention',
      passed: false,
      modelUsed: primaryModel,
      fallbackUsed: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // AUDIT SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log('                   AUDIT SUMMARY TABLE');
  console.log('================================================================');
  for (const r of results) {
    const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${statusIcon} | ${r.name}`);
    console.log(`       Model: ${r.modelUsed} (Fallback: ${r.fallbackUsed}) | Tool: ${r.toolInvoked || 'N/A'}`);
  }
  console.log('================================================================');

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    console.error('\n❌ Audit completed with failures.');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL LIVE GEMINI API AND AGENT TOOL TESTS PASSED SUCCESSFULLY!');
  }
}

runLiveAudit().catch((err) => {
  console.error('Live audit execution failed:', err);
  process.exit(1);
});

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { TOOL_DECLARATIONS, executeTool, ToolExecutionRecord } from './tools';
import {
  generateContentWithResilience,
  generateContentStreamWithResilience,
  formatFriendlyErrorMessage,
  isTransientError,
} from './geminiResilience';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'gemini-toolbox-ai',
    },
    timeout: 60000,
    retryOptions: {
      attempts: 1, // Single retry control managed by exponential backoff & fallback in geminiResilience
    },
  },
});

function normalizeContents(contents: Array<{ role: 'user' | 'model'; parts: any[] }>) {
  const normalized: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const item of contents) {
    if (!item.parts || item.parts.length === 0) continue;
    const role: 'user' | 'model' = item.role === 'model' ? 'model' : 'user';

    if (normalized.length === 0) {
      if (role === 'model') continue;
      normalized.push({ role, parts: [...item.parts] });
    } else {
      const prev = normalized[normalized.length - 1];
      if (prev.role === role) {
        prev.parts.push(...item.parts);
      } else {
        normalized.push({ role, parts: [...item.parts] });
      }
    }
  }

  return normalized;
}

function buildToolEnabledConfig(systemInstruction?: string, temperature?: number) {
  const baseSystemPrompt = `You are Gemini Toolbox AI, an advanced intelligent agent assistant equipped with real-world tool execution capabilities:
1. "calculate": Safely evaluate arithmetic and math expressions (+, -, *, /, %, ^, sqrt, abs, round, sin, cos, tan, log). Never guess exact numbers or rely on mental arithmetic for complex math. Always invoke "calculate".
2. "convert_units": Convert measurements between Kilometers and Miles, Meters and Feet, Kilograms and Pounds, Celsius and Fahrenheit, and Liters and Milliliters.
3. "calculate_percentage": Perform percentage calculations:
   - "percentage_of": find X% of Y (e.g. 18% of 2500)
   - "percentage_change": find percentage increase/decrease from X to Y (e.g. change from 250 to 400)
   - "what_percentage": find what percentage X is of Y (e.g. 50 out of 200)

RULES FOR TOOL EXECUTION:
- When a user query requires arithmetic, unit conversion, or percentage calculation, you MUST call the corresponding tool first.
- Wait for the tool response before outputting your final response.
- Once the tool result is provided, formulate a friendly, articulate, and complete answer that cites the tool's result and explains the calculation clearly.`;

  const finalInstruction = systemInstruction && systemInstruction.trim()
    ? `${baseSystemPrompt}\n\nUser Persona Instructions:\n${systemInstruction.trim()}`
    : baseSystemPrompt;

  const config: any = {
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    systemInstruction: finalInstruction,
    httpOptions: {
      timeout: 60000,
      retryOptions: {
        attempts: 1,
      },
    },
  };

  if (typeof temperature === 'number') {
    config.temperature = Math.max(0, Math.min(2, temperature));
  }

  return config;
}

export function isSimpleGreeting(query: string): boolean {
  if (!query) return false;
  const clean = query.trim().toLowerCase().replace(/[?!.,]+$/g, '').trim();
  const greetings = [
    'hi',
    'hello',
    'hey',
    'howdy',
    'greetings',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'how are you doing',
    'what can you do',
    'who are you',
    'what is your name',
    'tell me about yourself',
    'help',
    'what are your capabilities',
    'thanks',
    'thank you',
    'bye',
    'goodbye',
  ];
  return greetings.includes(clean);
}

export function queryRequiresTools(query: string): boolean {
  if (!query || !query.trim()) return false;
  if (isSimpleGreeting(query)) return false;

  const lower = query.toLowerCase();

  // Mathematical equations, operators, or keywords
  if (/\d+\s*[\+\-\*\/\%\^×÷]\s*\d+/.test(lower)) return true;
  if (/\b(calculate|compute|solve|evaluate)\b/i.test(lower)) return true;
  if (/\b(convert|conversion)\b/i.test(lower)) return true;
  if (/\b(km|kilometer|mile|meter|feet|foot|kg|kilogram|pound|lb|celsius|fahrenheit|liter|ml|milliliter)s?\b/i.test(lower)) return true;
  if (/\b(percent|percentage)\b/i.test(lower) || lower.includes('%')) return true;
  if (/\bsqrt\s*\(|\bsin\s*\(|\bcos\s*\(|\btan\s*\(|\blog\s*\(/i.test(lower)) return true;

  if (/\b\d+\b/.test(lower) && (lower.includes('plus') || lower.includes('minus') || lower.includes('times') || lower.includes('divided') || lower.includes('multiplied') || lower.includes('sum') || lower.includes('add') || lower.includes('subtract') || lower.includes('ratio') || lower.includes('increase') || lower.includes('decrease'))) {
    return true;
  }

  return false;
}

function buildConversationalConfig(systemInstruction?: string, temperature?: number) {
  const basePrompt = `You are Gemini Toolbox AI, an articulate, friendly, and helpful AI assistant equipped with specialized agent tools (calculation, unit conversion, and percentage analysis). Answer warmly, clearly, and concisely.`;

  const instruction = systemInstruction && systemInstruction.trim()
    ? `${basePrompt}\n\nUser Persona Instructions:\n${systemInstruction.trim()}`
    : basePrompt;

  const config: any = {
    systemInstruction: instruction,
    httpOptions: {
      timeout: 60000,
      retryOptions: { attempts: 1 },
    },
  };

  if (typeof temperature === 'number') {
    config.temperature = Math.max(0, Math.min(2, temperature));
  }

  return config;
}

function resolveModelName(requestedModel?: string): string {
  if (!requestedModel) return 'gemini-3.8-flash';
  const clean = requestedModel.toLowerCase().trim();
  if (clean === 'gemini-3.8-flash' || clean.includes('3.8')) return 'gemini-3.8-flash';
  if (clean === 'gemini-3.1-flash-lite' || clean.includes('lite')) return 'gemini-3.1-flash-lite';
  if (clean === 'gemini-2.5-pro' || clean.includes('pro')) return 'gemini-2.5-pro';
  if (clean === 'gemini-2.5-flash' || clean === 'gemini-flash-latest') return 'gemini-2.5-flash';
  return 'gemini-3.8-flash';
}

function parsePayloadMessages(rawMessages: any[]): Array<{ role: 'user' | 'model'; parts: any[] }> {
  return rawMessages.map((m: any) => {
    const role: 'user' | 'model' = m.role === 'model' ? 'model' : 'user';
    const parts: any[] = [];

    if (m.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        if (att.mimeType?.startsWith('image/') && att.base64) {
          const rawBase64 = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64;
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: rawBase64,
            },
          });
        } else if (att.content) {
          parts.push({
            text: `[Attached file: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``,
          });
        }
      }
    }

    if (m.content && typeof m.content === 'string' && m.content.trim()) {
      parts.push({ text: m.content.trim() });
    }

    return { role, parts };
  });
}

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    appName: 'Gemini Toolbox',
    version: '1.0.0',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== ''),
    defaultModel: 'gemini-3.8-flash',
    fallbackModel: 'gemini-3.1-flash-lite',
    tools: ['calculate', 'convert_units', 'calculate_percentage'],
  });
});

app.get('/api/tools', (_req, res) => {
  res.json({
    tools: [
      {
        id: 'calculate',
        name: 'Mathematical Calculator',
        description: 'Safe mathematical expression evaluation with PEMDAS, powers, roots, trigonometry, and logarithms.',
        input: 'expression: string',
        examples: ['125 * 48 + 360 / 6', '2500 * 0.18', '(500 + 300) / 4', 'sqrt(144) + 8'],
        status: 'Active',
      },
      {
        id: 'convert_units',
        name: 'Unit Converter',
        description: 'Converts between Kilometers ↔ Miles, Meters ↔ Feet, Kilograms ↔ Pounds, Celsius ↔ Fahrenheit, and Liters ↔ Milliliters.',
        input: 'value: number, from_unit: string, to_unit: string',
        examples: ['5 kilometers to miles', '100 celsius to fahrenheit', '70 kg to lbs', '2 liters to milliliters'],
        status: 'Active',
      },
      {
        id: 'calculate_percentage',
        name: 'Percentage Calculator',
        description: 'Computes X% of Y, percentage increase/decrease from X to Y, and what percentage X is of Y.',
        input: 'operation: string, value1: number, value2: number',
        examples: ['18% of 2500', 'Percentage increase from 250 to 400', 'What percentage is 50 of 200'],
        status: 'Active',
      },
    ],
  });
});

// Non-streaming endpoint with retry and fallback
app.post('/api/chat', async (req, res) => {
  const reqStart = Date.now();
  const { messages, model, systemInstruction, temperature } = req.body;

  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
    return res.status(400).json({
      error: 'GEMINI_API_KEY is not configured on the server. Please add your GEMINI_API_KEY in the .env file to enable live Gemini API calls and agent tools.',
    });
  }

  const rawContents = Array.isArray(messages) ? messages : [];
  const contents = normalizeContents(parsePayloadMessages(rawContents));

  if (contents.length === 0) {
    return res.status(400).json({ error: 'No valid message content provided. Please enter a non-empty message.' });
  }

  const targetModel = resolveModelName(model);
  const fallbackModel = targetModel === 'gemini-3.8-flash' ? 'gemini-3.1-flash-lite' : undefined;

  const lastUserMessage = [...contents].reverse().find((c) => c.role === 'user');
  const latestUserText = lastUserMessage?.parts
    ?.filter((p: any) => p.text)
    ?.map((p: any) => p.text)
    ?.join(' ') || '';
  const needsTools = queryRequiresTools(latestUserText);

  // Fast path for simple conversational requests
  if (!needsTools) {
    try {
      const config = buildConversationalConfig(systemInstruction, temperature);
      const genResult = await generateContentWithResilience(ai, {
        primaryModel: targetModel,
        fallbackModel,
        contents,
        config,
      });

      console.log(`[CHAT NON-STREAM COMPLETE] Conversational in ${Date.now() - reqStart}ms | Model: ${genResult.usedModel}`);
      return res.json({
        text: genResult.response.text || '',
        toolExecutions: [],
        modelUsed: genResult.usedModel,
        fallbackUsed: genResult.fallbackUsed,
      });
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      return res.status(isTransientError(error) ? 503 : 500).json({ error: formatFriendlyErrorMessage(error) });
    }
  }

  const config = buildToolEnabledConfig(systemInstruction, temperature);
  const MAX_ROUNDS = 5;
  let round = 0;
  const currentContents: any[] = [...contents];
  const executedTools: ToolExecutionRecord[] = [];
  let finalModelUsed = targetModel;
  let fallbackWasUsed = false;

  try {
    while (round < MAX_ROUNDS) {
      round++;
      const genResult = await generateContentWithResilience(ai, {
        primaryModel: targetModel,
        fallbackModel,
        contents: currentContents,
        config,
      });

      finalModelUsed = genResult.usedModel;
      if (genResult.fallbackUsed) fallbackWasUsed = true;

      const response = genResult.response;
      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        // Model generated final textual response
        return res.json({
          text: response.text || '',
          toolExecutions: executedTools,
          modelUsed: finalModelUsed,
          fallbackUsed: fallbackWasUsed,
        });
      }

      // Add model turn containing function calls to contents
      const candidateContent = response.candidates?.[0]?.content;
      if (candidateContent) {
        currentContents.push(candidateContent);
      } else {
        currentContents.push({
          role: 'model',
          parts: functionCalls.map((fc) => ({
            functionCall: {
              name: fc.name,
              args: fc.args,
              id: fc.id,
            },
          })),
        });
      }

      // Execute each requested tool call
      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
        const execId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const toolExecution = await executeTool(call.name || '', call.args || {});

        if (toolExecution.success) {
          executedTools.push({
            id: execId,
            toolName: call.name || 'unknown',
            args: call.args || {},
            result: toolExecution.data,
            status: 'Successful',
            timestamp: Date.now(),
          });
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                output: toolExecution.data,
              },
              id: call.id,
            },
          });
        } else {
          executedTools.push({
            id: execId,
            toolName: call.name || 'unknown',
            args: call.args || {},
            error: toolExecution.error,
            status: 'Error',
            timestamp: Date.now(),
          });
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                error: toolExecution.error,
              },
              id: call.id,
            },
          });
        }
      }

      // Add tool responses as user turn
      currentContents.push({
        role: 'user',
        parts: toolResponseParts,
      });
    }

    // If max rounds reached, do a final text generation without tools
    const finalGenResult = await generateContentWithResilience(ai, {
      primaryModel: targetModel,
      fallbackModel,
      contents: currentContents,
      config: { ...config, tools: [] },
    });

    res.json({
      text: finalGenResult.response.text || '',
      toolExecutions: executedTools,
      modelUsed: finalGenResult.usedModel,
      fallbackUsed: fallbackWasUsed || finalGenResult.fallbackUsed,
    });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    res.status(isTransientError(error) ? 503 : 500).json({ error: formatFriendlyErrorMessage(error) });
  }
});

// Streaming endpoint with retry, fallback and live status events
app.post('/api/chat/stream', async (req, res) => {
  const reqStart = Date.now();
  const { messages, model, systemInstruction, temperature } = req.body;

  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.write(
      `data: ${JSON.stringify({
        error: 'GEMINI_API_KEY is not configured on the server. Please add your GEMINI_API_KEY in the .env file to enable live Gemini API calls and agent tools.',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const rawContents = Array.isArray(messages) ? messages : [];
  const contents = normalizeContents(parsePayloadMessages(rawContents));

  if (contents.length === 0) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.write(
      `data: ${JSON.stringify({
        error: 'No valid message content provided. Please enter a non-empty message.',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const targetModel = resolveModelName(model);
  const fallbackModel = targetModel === 'gemini-3.8-flash' ? 'gemini-3.1-flash-lite' : undefined;

  const lastUserMessage = [...contents].reverse().find((c) => c.role === 'user');
  const latestUserText = lastUserMessage?.parts
    ?.filter((p: any) => p.text)
    ?.map((p: any) => p.text)
    ?.join(' ') || '';
  const needsTools = queryRequiresTools(latestUserText);

  console.log(`[CHAT STREAM START] Time: ${new Date().toISOString()} | Query: "${latestUserText.slice(0, 60)}" | Target: ${targetModel} | NeedsTools: ${needsTools}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let isClientDisconnected = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      isClientDisconnected = true;
    }
  });

  let firstTokenEmitted = false;
  const executedTools: ToolExecutionRecord[] = [];
  let activeModel = targetModel;
  let finalModelUsed = targetModel;
  let fallbackWasUsed = false;

  const sendEvent = (data: any) => {
    if (!isClientDisconnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    if (!needsTools) {
      // Direct conversational streaming - fast path
      const config = buildConversationalConfig(systemInstruction, temperature);
      const streamResult = await generateContentStreamWithResilience(ai, {
        primaryModel: activeModel,
        fallbackModel,
        contents,
        config,
        onStatus: (st) => {
          sendEvent({
            type: 'status',
            message: st.message,
            model: st.model,
            isFallback: st.isFallback,
          });
        },
        onChunk: (chunk) => {
          if (!firstTokenEmitted) {
            firstTokenEmitted = true;
            console.log(`[FIRST TOKEN RECEIVED] TTFB: ${Date.now() - reqStart}ms`);
          }
          sendEvent({ type: 'text', text: chunk });
        },
      });

      finalModelUsed = streamResult.usedModel;
      fallbackWasUsed = streamResult.fallbackUsed;
    } else {
      // Tool-enabled flow with multi-turn execution
      const toolConfig = buildToolEnabledConfig(systemInstruction, temperature);
      const MAX_ROUNDS = 5;
      let round = 0;
      const currentContents: any[] = [...contents];

      while (round < MAX_ROUNDS) {
        if (isClientDisconnected) break;
        round++;

        const streamResult = await generateContentStreamWithResilience(ai, {
          primaryModel: activeModel,
          fallbackModel,
          contents: currentContents,
          config: toolConfig,
          onStatus: (st) => {
            sendEvent({
              type: 'status',
              message: st.message,
              model: st.model,
              isFallback: st.isFallback,
            });
          },
          onChunk: (chunk) => {
            if (!firstTokenEmitted) {
              firstTokenEmitted = true;
              console.log(`[FIRST TOKEN RECEIVED] TTFB: ${Date.now() - reqStart}ms`);
            }
            sendEvent({ type: 'text', text: chunk });
          },
        });

        activeModel = streamResult.usedModel;
        finalModelUsed = streamResult.usedModel;
        if (streamResult.fallbackUsed) fallbackWasUsed = true;

        const functionCalls = streamResult.functionCalls;
        if (!functionCalls || functionCalls.length === 0) {
          // Model finished generating textual answer
          break;
        }

        // Add candidate content or model turn with function calls
        if (streamResult.candidateContent) {
          currentContents.push(streamResult.candidateContent);
        } else {
          currentContents.push({
            role: 'model',
            parts: functionCalls.map((fc) => ({
              functionCall: {
                name: fc.name,
                args: fc.args,
                id: fc.id,
              },
            })),
          });
        }

        // Execute tools
        const toolResponseParts: any[] = [];
        for (const call of functionCalls) {
          if (isClientDisconnected) break;
          const execId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const toolStart = Date.now();
          console.log(`[TOOL START] ${call.name} with args:`, call.args);

          sendEvent({
            type: 'tool_start',
            id: execId,
            toolName: call.name,
            args: call.args || {},
          });

          const toolExecution = await executeTool(call.name || '', call.args || {});
          console.log(`[TOOL COMPLETE] ${call.name} in ${Date.now() - toolStart}ms | Success: ${toolExecution.success}`);

          if (toolExecution.success) {
            const rec: ToolExecutionRecord = {
              id: execId,
              toolName: call.name || 'unknown',
              args: call.args || {},
              result: toolExecution.data,
              status: 'Successful',
              timestamp: Date.now(),
            };
            executedTools.push(rec);

            sendEvent({
              type: 'tool_result',
              ...rec,
            });

            toolResponseParts.push({
              functionResponse: {
                name: call.name,
                response: {
                  output: toolExecution.data,
                },
                id: call.id,
              },
            });
          } else {
            const rec: ToolExecutionRecord = {
              id: execId,
              toolName: call.name || 'unknown',
              args: call.args || {},
              error: toolExecution.error,
              status: 'Error',
              timestamp: Date.now(),
            };
            executedTools.push(rec);

            sendEvent({
              type: 'tool_result',
              ...rec,
            });

            toolResponseParts.push({
              functionResponse: {
                name: call.name,
                response: {
                  error: toolExecution.error,
                },
                id: call.id,
              },
            });
          }
        }

        currentContents.push({
          role: 'user',
          parts: toolResponseParts,
        });
      }
    }

    if (!isClientDisconnected && !res.writableEnded) {
      sendEvent({
        type: 'complete',
        toolExecutions: executedTools,
        model: finalModelUsed,
        isFallback: fallbackWasUsed,
      });
      res.write('data: [DONE]\n\n');
    }
  } catch (error: any) {
    console.error('Gemini stream error:', error);
    if (!isClientDisconnected && !res.writableEnded) {
      const errorMsg = formatFriendlyErrorMessage(error);
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
  } finally {
    const totalDuration = Date.now() - reqStart;
    console.log(`[CHAT STREAM FINISHED] Duration: ${totalDuration}ms | Model: ${finalModelUsed} | Fallback: ${fallbackWasUsed}`);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Gemini Toolbox Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

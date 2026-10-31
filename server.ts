import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { TOOL_DECLARATIONS, executeTool, ToolExecutionRecord } from './tools';
import {
  generateContentWithResilience,
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
  const config = buildToolEnabledConfig(systemInstruction, temperature);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let isClientDisconnected = false;
  req.on('close', () => {
    isClientDisconnected = true;
  });

  const MAX_ROUNDS = 5;
  let round = 0;
  const currentContents: any[] = [...contents];
  const executedTools: ToolExecutionRecord[] = [];
  let finalModelUsed = targetModel;
  let fallbackWasUsed = false;

  try {
    while (round < MAX_ROUNDS) {
      if (isClientDisconnected) break;
      round++;

      const genResult = await generateContentWithResilience(ai, {
        primaryModel: targetModel,
        fallbackModel,
        contents: currentContents,
        config,
        onStatus: (st) => {
          if (!isClientDisconnected) {
            res.write(
              `data: ${JSON.stringify({
                type: 'status',
                message: st.message,
                model: st.model,
                isFallback: st.isFallback,
              })}\n\n`
            );
          }
        },
      });

      finalModelUsed = genResult.usedModel;
      if (genResult.fallbackUsed) fallbackWasUsed = true;

      const checkResponse = genResult.response;
      const functionCalls = checkResponse.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        // Emit final text
        const finalText = checkResponse.text || '';
        if (finalText && !isClientDisconnected) {
          res.write(`data: ${JSON.stringify({ type: 'text', text: finalText })}\n\n`);
        }
        break;
      }

      // Add model turn with function calls to contents
      const candidateContent = checkResponse.candidates?.[0]?.content;
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

      // Execute each tool and broadcast real-time events
      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
        if (isClientDisconnected) break;
        const execId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        res.write(
          `data: ${JSON.stringify({
            type: 'tool_start',
            id: execId,
            toolName: call.name,
            args: call.args || {},
          })}\n\n`
        );

        const toolExecution = await executeTool(call.name || '', call.args || {});

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

          res.write(
            `data: ${JSON.stringify({
              type: 'tool_result',
              ...rec,
            })}\n\n`
          );

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

          res.write(
            `data: ${JSON.stringify({
              type: 'tool_result',
              ...rec,
            })}\n\n`
          );

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

    if (!isClientDisconnected) {
      res.write(
        `data: ${JSON.stringify({
          type: 'complete',
          toolExecutions: executedTools,
          modelUsed: finalModelUsed,
          fallbackUsed: fallbackWasUsed,
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error: any) {
    console.error('Gemini stream error:', error);
    if (!isClientDisconnected) {
      const errorMsg = formatFriendlyErrorMessage(error);
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.write('data: [DONE]\n\n');
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

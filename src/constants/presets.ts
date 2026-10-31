import { ModelOption, PersonaPreset } from '../types/chat';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'Flagship fast, high-intelligence model with native agent tool use and deep reasoning.',
    badge: 'Default',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini Flash Lite',
    description: 'Ultra-low latency responses with minimal compute footprint.',
    badge: 'Fast',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Deep analytical capabilities, complex logic, and multi-step reasoning.',
    badge: 'Advanced',
  },
];

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'general',
    name: 'Gemini Toolbox Assistant',
    description: 'Balanced, articulate AI assistant with real agent tool calling.',
    systemPrompt:
      'You are Gemini Toolbox AI, an intelligent assistant equipped with specialized agent tools: calculate (for safe math expressions), convert_units (for unit conversion), and calculate_percentage (for percentage of, percentage change, and ratios). Always invoke the appropriate tool to compute exact values before formulating your final response.',
  },
  {
    id: 'developer',
    name: 'Software Engineer',
    description: 'Production-ready code, strict types, architecture, and edge cases.',
    systemPrompt:
      'You are a senior software engineer. Provide robust, production-grade code with TypeScript, handle edge cases, explain architectural trade-offs concisely, and use available tools for any calculations.',
  },
  {
    id: 'math-analyst',
    name: 'Quantitative Analyst',
    description: 'High-precision mathematical problem solver with step-by-step logic.',
    systemPrompt:
      'You are an expert quantitative analyst. Always use the calculate, convert_units, and calculate_percentage tools to verify numerical calculations with 100% precision. Present clear formulas and structured breakdowns.',
  },
  {
    id: 'concise',
    name: 'Executive Summary',
    description: 'Bullet points, numerical precision, and zero filler text.',
    systemPrompt:
      'You are an executive analyst. Respond in compact, bulleted format with high information density. Emphasize key facts, metrics, and actionable takeaways.',
  },
];

export interface SuggestedPrompt {
  id: string;
  category: string;
  title: string;
  prompt: string;
  tool?: string;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'calc-eval',
    category: 'Calculator Tool',
    title: 'Evaluate Expression',
    prompt: 'Calculate 125 * 48 + 360 / 6',
    tool: 'calculate',
  },
  {
    id: 'unit-conv',
    category: 'Converter Tool',
    title: 'Distance Conversion',
    prompt: 'Convert 5 kilometers to miles.',
    tool: 'convert_units',
  },
  {
    id: 'pct-calc',
    category: 'Percentage Tool',
    title: 'Percentage of Base',
    prompt: 'Calculate 18% of 2500.',
    tool: 'calculate_percentage',
  },
  {
    id: 'pct-explain',
    category: 'Tool & Reasoning',
    title: 'Calculate & Explain',
    prompt: 'Calculate 12% of 850 and explain the result.',
    tool: 'calculate_percentage',
  },
  {
    id: 'pct-increase',
    category: 'Percentage Tool',
    title: 'Percentage Increase',
    prompt: 'What is the percentage increase from 250 to 400?',
    tool: 'calculate_percentage',
  },
  {
    id: 'compound-interest',
    category: 'General AI',
    title: 'Financial Concepts',
    prompt: 'Explain how compound interest works.',
  },
];

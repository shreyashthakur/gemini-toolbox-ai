# Gemini Toolbox AI — Demonstration & Evaluation Guide

**Challenge 2: Build with Gemini — AI Chatbot Challenge**  
**Project:** Gemini Toolbox AI  
**Repository:** [AI-Chatbot-Challenge-Build-with-Gemini-API-Agents](https://github.com/abhishek-nexgen-dev/AI-Chatbot-Challenge-Build-with-Gemini-API-Agents)

---

## 1. Project Overview

**Gemini Toolbox** is a production-grade, full-stack AI chatbot and autonomous agent system powered by Google Gemini (using the official `@google/genai` SDK).

Unlike static chat assistants that hallucinate calculations or rely on unverified mental arithmetic, **Gemini Toolbox** incorporates real backend agent function calling. When a user presents a mathematical calculation, unit conversion, or percentage operation, Gemini intelligently determines that a specialized tool is required, calls the tool on the backend, receives the validated structured tool output, and incorporates the verified result into a natural, conversational response.

---

## 2. Architecture & Design Principles

### Server-Side Gemini API Architecture
- **Model:** Centralized on `gemini-3.8-flash` (Google's latest flagship model with native agent function calling). Deprecated models like `gemini-2.0-flash` have been removed.
- **Zero API Key Exposure:** The `GEMINI_API_KEY` is loaded exclusively on the Node.js/Express backend from environment variables (`.env`). It is never transmitted to, bundled into, or accessible from client browser code.
- **Official SDK:** Implemented using Google's official `@google/genai` SDK (`GoogleGenAI`).
- **Autonomous Tool Negotiation Loop:** When Gemini issues a `FunctionCall`, the backend executes the corresponding tool, wraps the result in a valid `FunctionResponse` part with role `user`, and resumes the conversation loop with Gemini until a complete final answer is formulated (with a safety threshold of max 5 rounds to prevent runaway loops).
- **Dual Communication Modes:** Supports both Server-Sent Events (SSE) streaming (`/api/chat/stream`) with real-time tool state updates, and standard JSON REST endpoints (`/api/chat`).
- **Resilient Error Handling:** Gracefully detects missing API credentials, empty or whitespace messages, division by zero, invalid units, and network interruptions without crashing or revealing sensitive system traces.

---

## 3. Implemented Agent Tools

| Tool Name | Backend Function | Description | Supported Operations / Units |
|---|---|---|---|
| **Calculator** | `calculate` | Safe mathematical expression parser and evaluator (no `eval()` or `Function()`). | Arithmetic (`+`, `-`, `*`, `/`, `%`, `^`), parentheses, unary negatives, `sqrt`, `abs`, `round`, `floor`, `ceil`, `sin`, `cos`, `tan`, `log`. Division-by-zero protection. |
| **Unit Converter** | `convert_units` | Precise measurement conversion between imperial and metric systems. | **Length:** Kilometers ↔ Miles, Meters ↔ Feet<br/>**Weight:** Kilograms ↔ Pounds<br/>**Temperature:** Celsius ↔ Fahrenheit<br/>**Volume:** Liters ↔ Milliliters |
| **Percentage Calculator** | `calculate_percentage` | Financial and statistical percentage operations. | **1. `percentage_of`:** Find X% of Y (e.g. 18% of 2500 = 450)<br/>**2. `percentage_change`:** Increase/decrease from X to Y (e.g. 250 to 400 = +60%)<br/>**3. `what_percentage`:** What % X is of Y (e.g. 50 of 200 = 25%) |

---

## 4. Environment Setup & Configuration

### Prerequisites
- Node.js v18+ (tested on Node.js v24)
- npm

### Environment Variable Configuration
1. Create a `.env` file in the `gemini-toolbox` directory (or use `.env.example` as a template):
```bash
GEMINI_API_KEY=your_actual_gemini_api_key_here
PORT=3000
```
*(Note: `.env` is ignored by Git in `.gitignore` to prevent secret leakage).*

---

## 5. Running the Application

### Install Dependencies
```bash
cd gemini-toolbox
npm install --legacy-peer-deps
```

### Run Unit Tests
Verify all tools, safe math parsing, and dispatcher logic:
```bash
npm test
```

### Start the Development Server (Full-Stack Frontend + Backend)
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Production Build & Launch
```bash
npm run build
npm start
```

---

## 6. Demonstration Prompts & Expected Results

Use these test cases during evaluation to verify real agent function calling:

### Test 1: General Assistant Capabilities
- **Prompt:** `"Hello! What can you do?"`
- **Expected Behavior:** Gemini introduces itself as **Gemini Toolbox AI**, highlighting its conversational intelligence and active agent tools (safe math calculation, unit conversion, and percentage analysis).
- **Tool Executed:** None (direct natural language response).

### Test 2: Math Calculation Tool
- **Prompt:** `"Calculate 125 multiplied by 48 plus 360 divided by 6."`
- **Tool Executed:** `calculate`
- **Input Parameters:** `{"expression": "125 * 48 + 360 / 6"}`
- **Tool Result:** `6060` (Formatted: `6,060`)
- **Status:** `Successful`
- **Gemini's Response:** Confirms the calculation with steps: $(125 \times 48 = 6000)$ and $(360 \div 6 = 60)$, yielding $6000 + 60 = 6060$.

### Test 3: Unit Converter Tool
- **Prompt:** `"Convert 5 kilometers into miles."`
- **Tool Executed:** `convert_units`
- **Input Parameters:** `{"value": 5, "from_unit": "kilometers", "to_unit": "miles"}`
- **Tool Result:** `3.10686 miles`
- **Status:** `Successful`
- **Gemini's Response:** Explains that 5 kilometers converts to approximately 3.10686 miles ($1\text{ km} \approx 0.621371\text{ miles}$).

### Test 4: Percentage Calculator Tool
- **Prompt:** `"What is 18 percent of 2500?"`
- **Tool Executed:** `calculate_percentage`
- **Input Parameters:** `{"operation": "percentage_of", "value1": 18, "value2": 2500}`
- **Tool Result:** `450`
- **Status:** `Successful`
- **Gemini's Response:** Accurately states that 18% of 2,500 equals 450.

### Test 5: Tool Calculation with Detailed Explanation
- **Prompt:** `"Calculate 12% of 850 and explain the result."`
- **Tool Executed:** `calculate_percentage`
- **Input Parameters:** `{"operation": "percentage_of", "value1": 12, "value2": 850}`
- **Tool Result:** `102`
- **Status:** `Successful`
- **Gemini's Response:** Evaluates $12\% \times 850 = 102$ and provides a clear breakdown of $(850 \times 0.12 = 102)$.

### Test 6: Empty Message Validation
- **Prompt:** `"   "` (spaces or blank text)
- **Expected Behavior:** Input is rejected client-side immediately; the send button remains disabled and no API request is sent. If submitted directly to the server, returns HTTP 400 Bad Request.

### Test 7: Multi-Turn Contextual Follow-up
- **Follow-up Prompt:** `"Now convert that result from kilometers to miles."` (after previous calculation)
- **Expected Behavior:** Gemini preserves conversation history, identifies the prior numeric result, and invokes `convert_units` using the previous context.

---

## 7. Two-Minute Judging Demonstration Script

| Time | Action | Demonstration Script / Talking Points |
|---|---|---|
| **0:00 - 0:25** | Open http://localhost:3000 | *"Welcome judges! This is **Gemini Toolbox AI**, built for the Build with Gemini AI Chatbot Challenge. Notice our dark theme aesthetic, conversation sidebar with active tool indicators, and the prompt cards highlighting our backend agent capabilities."* |
| **0:25 - 0:50** | Click `"Calculate 125 multiplied by 48 plus 360 divided by 6"` | *"Watch the real-time agent execution: Gemini recognizes this requires exact mathematical evaluation and invokes our backend `calculate` tool. Notice the Tool Execution Card appearing in real time, displaying the input parameters, successful execution status, and exact result of 6,060 before Gemini formulates its verified answer."* |
| **0:50 - 1:15** | Send `"Convert 5 kilometers into miles"` | *"Next, we demonstrate multi-dimensional unit conversion. Gemini invokes the `convert_units` tool. Our custom math engine safely converts kilometers to 3.10686 miles without rounding errors or hallucinations, with the structured formula visible in the collapsible payload viewer."* |
| **1:15 - 1:35** | Send `"What is 18 percent of 2500?"` | *"Now we test our financial tool: `calculate_percentage`. Gemini selects the `percentage_of` operation, obtaining 450 with 100% precision. The tool execution card displays the exact computation parameters."* |
| **1:35 - 2:00** | Highlight Security & Architecture | *"Under the hood, all Gemini requests run server-side using the official `@google/genai` SDK. The API key is never exposed to the client. Our mathematical parser is custom-built with zero `eval()` vulnerabilities, complete division-by-zero protection, and seamless SSE streaming. Thank you!"* |

---

## 8. Known Limitations & Future Roadmap
- Additional unit domains (e.g., energy, currency with real-time Forex feeds).
- Multi-step equation graphing with interactive charts.
- Function execution sandboxing for user-submitted custom formulas.


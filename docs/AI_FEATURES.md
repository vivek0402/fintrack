# AI / LLM Usage in FinTrack

This document maps every place the backend calls an LLM (via Groq, Gemini, NVIDIA NIM,
or the `aiComplete()` router), what feature it powers, and which model/provider serves it.

Most AI-powered endpoints live in `backend/src/routes/ai.js` and are mounted under
`/api/ai/*`. The routing/model config lives in `backend/src/utils/ai.js`.

Additional AI-powered routes:
- `backend/src/routes/agents.js` → mounted at `/api/ai/agent`
- `backend/src/routes/opportunities.js` → mounted at `/api/ai/opportunities`
- `backend/src/routes/insights.js` → mounted at `/api/insights` (uses `aiComplete` for benchmarks)
- `backend/src/routes/pdfImport.js` → mounted at `/api/import` (uses `aiComplete` for statement parsing)

## How the AI router works (`backend/src/utils/ai.js`)

- `aiComplete(routeKey, messages, overrides?)` is the single entry point used by
  almost all AI features.
- Each `routeKey` maps to a `ROUTES` config entry: `{ provider, model, maxTokens, temp }`.
- `provider` is one of:
  - `groq1` — primary Groq API key (`GROQ_API_KEY`)
  - `groq2` — secondary Groq API key (`GROQ_API_KEY_2`, falls back to `GROQ_API_KEY`)
  - `gemini` — Google Gemini (`gemini-2.0-flash`, `GEMINI_API_KEY`)
  - `nim` — NVIDIA NIM, OpenAI-compatible API (`NVIDIA_API_KEY`)
- On a 429/rate-limit error, `aiComplete` automatically retries using
  `FALLBACK_CHAIN`:
  - `groq1` → `groq2` → `gemini`
  - `groq2` → `groq1` → `gemini`
  - `gemini` → `groq1` → `groq2`
  - `nim` → `groq1` → `gemini` (also used if `NVIDIA_API_KEY` is missing or the NIM call errors)
- Groq models used (from `MODELS`):
  - `LLAMA70B` = `llama-3.3-70b-versatile`
  - `LLAMA4` = `meta-llama/llama-4-scout-17b-16e-instruct`
  - `LLAMA8B` = `llama-3.1-8b-instant`
  - `QWEN32B` = `qwen/qwen3-32b`
  - `DEEPSEEK` = `deepseek-r1-distill-llama-70b` (defined but not currently referenced by any route)
- NIM models used (from `MODELS`):
  - `DEEPSEEK_V4_FLASH` = `deepseek-ai/deepseek-v4-flash`
  - `MINIMAX_M27` = `minimaxai/minimax-m2.7`
  - `NEMOTRON_49B` = `nvidia/llama-3.3-nemotron-super-49b-v1.5`
  - `LLAMA_3B` = `meta/llama-3.2-3b-instruct`
  - `LLAMA_VISION_11B` = `meta/llama-3.2-11b-vision-instruct` (vision only)
- `<think>...</think>` reasoning blocks (emitted by Qwen/DeepSeek-style models) are
  stripped from every response before it's returned.

### Vision (image) calls — separate path

`/api/ai/parse-image` does **not** go through `aiComplete()`. It calls
`getVisionModel()` (from `backend/src/utils/gemini.js`), which tries NIM's
`llama-3.2-11b-vision-instruct` first (if `NVIDIA_API_KEY` is set) and falls back to
Gemini `gemini-2.0-flash` multimodal on error or missing key.

---

## Feature-by-feature map

| # | Endpoint | Route key (`aiComplete`) | Provider / Model | Feature |
|---|----------|---------------------------|-------------------|---------|
| 1 | `POST /api/ai/parse-sms` | `parse-sms` | groq1 / LLAMA8B | **SMS Transaction Parser** — extracts structured transaction data (amount, type, merchant, date) from a bank SMS/notification text |
| 2 | `POST /api/ai/report` | `report` | nim / MINIMAX_M27 | **Monthly/Period Report Summary** — generates a short natural-language summary of spending for a report |
| 3 | `POST /api/ai/afford`, `POST /api/ai/predict` (alias) | `afford` | nim / DEEPSEEK_V4_FLASH | **"Can I Afford This?" Predictor** — evaluates whether a planned purchase fits the user's budget/cash flow |
| 4 | `POST /api/ai/chat` | `chat` | groq1 / LLAMA70B | **AI Finance Chat Assistant** — conversational Q&A about the user's finances |
| 5 | `GET /api/ai/detect-patterns`, `GET /api/ai/recurring` (alias) | `recurring` | nim / DEEPSEEK_V4_FLASH | **Recurring Transaction Detection** — analyzes the last 3 months of transactions to spot recurring bills/subscriptions not yet tracked |
| 6 | `POST /api/ai/parse-image` | *(direct vision call, not `aiComplete`)* | nim / LLAMA_VISION_11B (Gemini vision fallback) | **Receipt/Bill Image Parser** — OCR + extraction of transaction details from an uploaded receipt/screenshot |
| 7 | `POST /api/ai/parse-split` | `parse-split` | groq1 / LLAMA8B | **Split Expense Text Parser** — parses free-text descriptions of shared/split expenses into structured data |
| 8 | `GET /api/ai/salary-intelligence` | `salary-intelligence` | nim / DEEPSEEK_V4_FLASH | **Salary Intelligence Insights** — analyzes income patterns and provides salary-related insights |
| 9 | `POST /api/ai/personality` | `personality` | nim / NEMOTRON_49B | **Financial Personality Profile** — generates a personality-style summary of the user's spending/saving behavior |
| 10 | `GET /api/ai/regret-patterns` | `regret-patterns` | nim / LLAMA_3B | **Regret Pattern Analysis** — analyzes transactions marked "regretted" to identify spending regret patterns |
| 11 | `POST /api/ai/life-event` | `life-event` | nim / MINIMAX_M27 | **Life Event Financial Planning** — generates guidance/plans for major life events (e.g. moving, new job, having a child) |
| 12 | `GET /api/ai/forecast-calendar` | `forecast-insight` | nim / LLAMA_3B | **Spending Forecast Calendar** — SQL computes forecast numbers; AI generates a 3-sentence natural-language insight about the forecast (falls back to a hardcoded string if AI fails) |
| 13 | `POST /api/ai/health-report` | `health-report` | nim / MINIMAX_M27 | **Financial Health Report Card** — generates a holistic financial health assessment/report |
| 14 | `POST /api/ai/quick-add` | `quick-add` | groq2 / LLAMA8B | **Quick-Add Transaction Parser** — parses a short free-text entry (e.g. "coffee 150") into a structured transaction |
| 15 | `GET /api/ai/tax-estimate` | `tax-estimate` | nim / DEEPSEEK_V4_FLASH | **Tax Estimate** — estimates tax liability/insights based on income & transaction data |
| 16 | `POST /api/ai/salary-allocation` | `salary-allocation` | nim / DEEPSEEK_V4_FLASH | **Salary Allocation Plan** — generates a recommended budget allocation plan for incoming salary |

All `nim`-provider routes fall back to `groq1` → `gemini` if `NVIDIA_API_KEY` is unset or the NIM call fails.

---

---

## Specialized AI Agents (`backend/src/routes/agents.js`)

Four domain agents, each receiving full financial context (loans, investments, tax, transactions)
injected into every message. Uses `aiComplete()` with the `chat` route key (groq1 / LLAMA70B).

| Agent type | Specialization |
|---|---|
| `debt_coach` | Loan prioritization, EMI prepayment strategy, credit utilization, payoff plans |
| `investment_advisor` | Portfolio review, asset allocation, SIP, FIRE progress |
| `tax_planner` | 80C optimization, Old vs New regime, advance tax, ITR readiness |
| `budget_master` | Category budgeting, spending patterns, savings habits |

Endpoints:
- `POST /api/ai/agent/message` — send a message to an agent; creates/continues a conversation
- `GET  /api/ai/agent/conversations` — list all past conversations for the user
- `GET  /api/ai/agent/conversations/:id` — get full message history for a conversation
- `DELETE /api/ai/agent/conversations/:id` — delete a conversation

Conversations are persisted in the `agent_conversations` table with `messages` stored as JSONB.

---

## AI Opportunities (`backend/src/routes/opportunities.js`)

Analyzes the user's full financial snapshot (bank balances, loans, investments, tax 80C, credit utilization)
and uses `aiComplete()` to identify actionable optimization opportunities. Opportunities are stored in
the `opportunities` table and can be dismissed or marked as acted on.

Endpoints:
- `POST /api/ai/opportunities/detect` — run opportunity detection (AI-powered analysis)
- `GET  /api/ai/opportunities` — list all detected opportunities for the user
- `PATCH /api/ai/opportunities/:id/dismiss` — dismiss an opportunity
- `PATCH /api/ai/opportunities/:id/acted-on` — mark an opportunity as acted on

---

## Non-AI / utility endpoints (for completeness)

- `POST /api/ai/predict` — internal alias, rewrites to `/afford` (see #3 above)
- `GET /api/ai/recurring` — internal alias, rewrites to `/detect-patterns` (see #5 above)

---

## PDF Bank Statement Import (`backend/src/routes/pdfImport.js`)

Uses `pdf-parse` to extract text from an uploaded bank statement PDF, then calls `aiComplete()`
with a structured prompt to extract individual transactions. Results are returned as a transaction list
for the user to review and confirm before bulk-inserting.

Endpoint: `POST /api/import/bank-statement`

---

## Unused / dead config

Two entries exist in `ROUTES` (`backend/src/utils/ai.js`) but are **not** referenced
by any `aiComplete()` call site in `ai.js`:

- `'forecast'` (groq1 / QWEN32B)
- `'forecast-calendar'` (groq1 / QWEN32B)

The actual `/api/ai/forecast-calendar` endpoint uses the `'forecast-insight'` route
key instead (see #12). These two entries can likely be removed, or were placeholders
for a previous implementation of the forecast feature.

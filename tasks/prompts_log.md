# Prompts Log

## Prompt 0 — Task setup
Created /tasks folder and todo.md for NIM migration.
Status: Complete.

## Prompt 1: NIM provider migration
Status: Complete.

**Summary:** Integrated NVIDIA NIM as a 4th LLM provider in `backend/src/utils/ai.js`:
- Added `nimClient` (using the `openai` SDK, newly installed — `groq-sdk` failed against NIM's gateway with a 404).
- Added 5 new MODELS constants (DEEPSEEK_V4_FLASH, MINIMAX_M27, NEMOTRON_49B, LLAMA_3B, LLAMA_VISION_11B).
- Added `nim` branch to `executeOnProvider` with an explicit `NVIDIA_API_KEY` guard.
- Added `nim: ['groq1', 'gemini']` to FALLBACK_CHAIN, fixed a pre-existing fallback-model bug so nim→groq1 doesn't leak NIM model names to Groq.
- Migrated 11 routes (recurring, afford, tax-estimate, salary-allocation, salary-intelligence, health-report, life-event, report, personality, regret-patterns, forecast-insight) to NIM. Left `chat`, `parse-sms`, `quick-add`, `parse-split`, `forecast`, `forecast-calendar` untouched.
- Swapped `getVisionModel()` in `gemini.js` to call NIM Llama 3.2 11B Vision with a Gemini fallback, preserving the existing `generateContent(parts) -> {response:{text()}}` contract used by `routes/ai.js`.
- Added `NVIDIA_API_KEY` to `backend/.env`.
- Smoke-tested all new NIM models directly and via `aiComplete()`; verified fallback fires when the key is missing. `npm test` — 4 suites / 22 tests passing.
- See `tasks/lessons.md` for gotchas (groq-sdk vs openai SDK, reasoning-model token budgets, fallback-model fix).

# FinTrack Phase 6: AI Financial OS (v0.16)
## Todo
- [x] P0: Task tracking setup
- [x] P1: Database migrations (038-040)
- [x] P2: Backend — 4 specialized AI agents with data injection
- [x] P3: Backend — opportunity detection engine
- [x] P4: Backend — weekly briefing generation + cron job
- [x] P5: Backend — peer benchmarking + behavioral finance analytics
- [x] P6: Frontend — /ai-advisor page (4-agent chat interface)
- [x] P7: Frontend — opportunity + briefing dashboard widgets + /insights page

## Note
Spec says migrations "035-037" but those numbers are already used
(035_tax_profiles.sql / 036_advance_tax_payments.sql / 037_documents.sql from Phase 5).
Used 038-040 for Phase 6 instead.

## Features
Specialized AI agents (F21) — 4 agents, opportunity detection engine (F24), weekly
AI financial briefing (F22), peer benchmarking insights (F23), behavioral finance
layer (F25).
New routes: /api/ai/agent, /api/ai/opportunities, /api/ai/briefing, /api/insights.
New pages: /ai-advisor (upgrade of existing chat), /insights.
Depends on: All previous phases. The agents work best with complete data —
investments (Phase 1), loans (Phase 3), tax profile (Phase 5), and planning
scenarios (Phase 4) all feed agent context.

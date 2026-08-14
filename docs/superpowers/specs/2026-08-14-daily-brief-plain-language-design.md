# Daily Brief — Plain-Language Rewrite

**Date:** 2026-08-14
**Status:** Approved

---

## Goal

Rewrite the Daily Brief card (dashboard home screen) so it reads like a person
explaining your money to you, not a stats dashboard. Cut every chip and
sentence that restates a number instead of saying something useful.

---

## Problem

The card currently shows:
- A narrative sentence stacking 3-4 numbers/percentages per sentence
  ("₹938 under... ₹14,093 drop... 67% above...") in analyst phrasing
  ("echoing," "same five-day stretch," "trailing average")
- 10 metric chips (already trimmed to 3-visible + "Show 7 more" in the prior
  pass, see `3cd4f45`), several of which just restate the narrative in
  pill form
- An amber "Today:" action box that falls back to generic filler
  (streak nudges, "log a transaction") when nothing urgent is happening

This reads as overwhelming and technical rather than insightful. A user
opening the app first thing in the morning should get "you're fine, here's
the one thing worth knowing" — not a dashboard readout.

**Out of scope for this pass** (explicitly deferred):
- Real behavioral pattern-detection (day-of-week habits, category creep,
  repeat-purchase detection) — this is a separate future project requiring
  new backend analysis, not a rewording of existing numbers.
- Income-spike detection and the "did you get a new job / bonus / start a
  business?" prompt — separate standalone feature, brainstormed later.

---

## Design

### 1. Backend — narrative prompt rewrite

File: `backend/src/routes/ai.js`, `generateDailyBriefing()` (~line 1727)

The prompt already asks for "warm, encouraging" tone but the model still
defaults to report phrasing because nothing in the prompt forbids it. Add
explicit constraints:

- At most **one number per sentence**, stated in plain rupee terms (no
  "%", no "vs.", no "trailing N-month average" — say "your usual rent" or
  "more than usual" instead of a percentage where the exact figure isn't
  the point)
- Ban report/analyst phrasing outright: no "echoing," no "same N-day
  stretch," no "trailing average," no semicolons
- Instruct the model to write as if texting a friend a quick update, not
  summarizing a dashboard
- Keep what already works: 2-3 sentences, 65-word cap, "weave in at most
  one TRENDS item + one WATCH FOR item, don't enumerate every input"

Data inputs to the prompt are unchanged (today's pace, rent-vs-usual, week
comparison, risk flags) — this phase only changes the instructions for how
to phrase them, not what data feeds it.

**Fallback on LLM failure** (existing behavior, unchanged): the plain
template fallback at line 1749 (`Here's your daily brief: ...`) already
reads plainly enough — no change needed there.

### 2. Frontend — two anchor chips, no toggle

File: `frontend/app/dashboard/page.tsx` (~line 544-618)

Replace the current 3-primary/7-secondary/"Show more" toggle structure
(added in `3cd4f45`) with exactly **two fixed chips, no toggle**:

- **Today** — plain budget status, e.g. "₹938 left today" rather than
  "Pace Check: ₹1,266/day"
- **Heads up** — merges Bills Due Soon + Watch For into one slot: shows the
  bill or risk flag if either exists, else "Nothing urgent"

This removes the `dailyBriefPointsExpanded` state, the `primaryKeys`
filter, and the "Show N more" button entirely — that structure solved the
10-chip overload problem, which no longer exists once the other 8 chips
(Yesterday's Spend, Today So Far, Same Day Last Week, Week vs Last Week,
Month Trend, Logging Streak, Top Opportunity) are removed rather than
hidden. If someone wants raw historical numbers, that's what the
Insights/Analytics pages are for.

**Backend change required:** `buildDailyBriefPoints()` (~line 1544) needs
two new merged point shapes (`today_status`, `heads_up`) instead of — or
alongside — the existing 10-point array, since the frontend chip logic
should render server-computed values, not re-derive them client-side. The
existing 10-point array can stay for the narrative prompt's internal use
(numberLines/trendLines/watchLines sections) but the frontend only renders
the two new merged points.

### 3. Action box — gated to genuinely urgent items only

File: `backend/src/routes/ai.js`, `rankActionCandidates()` (~line 1653)

Keep the amber "Today:" box, but only surface it when the winning
candidate is a real bill or a severe risk:
- `bills_due_soon.count > 0`
- `severeForecast` (forecast_budget_warning, high `over_pct`)
- `spike` (spending_spike risk flag)

Drop the low-priority fallback candidates entirely (generic streak nudges,
"log a transaction to start a streak," opportunity plugs, the
under-budget-and-streak praise message). On a quiet day, the box simply
doesn't render — no filler.

`dailyBrief.action_of_the_day` becomes nullable-in-practice (it already is
nullable in the type; the frontend's existing `{dailyBrief.action_of_the_day && (...)}`
conditional at line ~641 already handles this — no frontend change needed
here beyond what falls out of part 2).

---

## Data Flow

```
getDailyBriefData()          (unchanged — same SQL queries)
        │
        ▼
buildDailyBriefPoints()      (unchanged 10-point array, PLUS new
        │                     today_status + heads_up merged points)
        │
        ├──► narrative prompt (rewritten instructions, same inputs)
        │         │
        │         ▼
        │    aiComplete('daily-briefing', ...)
        │
        └──► rankActionCandidates()  (trimmed candidate list —
                   │                   urgent-only, no filler fallback)
                   ▼
              action_of_the_day (nullable)
        │
        ▼
daily_briefings row: { points, narrative, action_of_the_day }
        │
        ▼
Frontend renders: narrative + [Today, Heads up] chips + action box (if present)
```

---

## Error Handling

- LLM call failure: existing plain-template fallback stays as-is (already
  reads acceptably plain).
- `today_status` / `heads_up` computed server-side from data that's always
  present (pace, bills, risk_flags) — no new null-handling needed beyond
  what `buildDailyBriefPoints()` already does for those source fields.
- Cache/unchanged-points diff logic (line 1702) is unaffected — it compares
  the full points JSON, and the two new merged points participate in that
  diff like any other point.

---

## Testing

- Unit test for the new `today_status`/`heads_up` point-builder logic
  (backend/tests/utils.ai.test.js or ai.dailyBriefing.routes.test.js,
  following existing conventions in that file): verify merged output for
  (a) no bills/no risk → "Nothing urgent", (b) bill due → bill wins,
  (c) risk flag but no bill → risk wins.
- Manual check of 3-5 real narrative generations against the "one number
  per sentence, no report phrasing" rule — this is a prompt-quality check,
  not something a unit test can assert reliably.
- Frontend: confirm the two-chip row renders correctly with/without an
  action box present, and that removing `dailyBriefPointsExpanded` doesn't
  leave dead state or unused imports (`TrendingDown`/`TrendingUp` icons are
  still used by the two remaining chips if either carries a trend).

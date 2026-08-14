# Smart Transaction Emoji

**Date:** 2026-08-14
**Status:** Approved

---

## Goal

Replace the single fixed icon FinTrack shows for every transaction in a
category (e.g. every Food & Dining transaction shows 🍽️, whether it's pizza
or coffee) with a per-transaction icon derived from the transaction's own
description, scoped by its category to avoid cross-category ambiguity (e.g.
"Apple" means 🍎 in Food & Dining but 📱 in Shopping/Subscriptions).

Applies everywhere a transaction icon renders — not just the dashboard's
Recent Transactions list, which is where the gap was first noticed.

---

## Problem

Every transaction icon today is `tx.category_icon || '💳'` — a static emoji
fixed at category-creation time (`DEFAULT_CATEGORIES` in
`backend/src/routes/auth.js`, or whatever a user picks when creating a
category). Two transactions in the same category always show the identical
icon regardless of what they actually were, which reads as generic/dumb once
you have more than a few transactions in a category.

---

## Design

### 1. `getSmartIcon()` — `frontend/lib/utils.ts`

```ts
export function getSmartIcon(
  description: string | null | undefined,
  categoryName: string | null | undefined,
  categoryIcon: string | null | undefined
): string {
  const desc = (description || '').toLowerCase();
  const table = categoryName ? CATEGORY_KEYWORD_ICONS[categoryName] : null;

  if (table) {
    for (const [keyword, icon] of table) {
      if (desc.includes(keyword)) return icon;
    }
  }

  return categoryIcon || '💳';
}
```

- Case-insensitive **substring** match against `description` (not a tokenizer
  — "pizzeria" still matches "pizza"; acceptable false-positive rate for a
  cosmetic feature).
- **First match wins**, in the order keywords are listed per category (see
  §2) — later, more specific entries should be listed before broader ones
  where a real ordering conflict exists (none currently do; noted for future
  additions).
- Keyword tables are looked up **only within the transaction's own
  category** — a transaction with no `category_name` (uncategorized) skips
  keyword matching entirely and falls straight to `categoryIcon || '💳'`,
  same as today's behavior.
- No new component, no new API field. Pure function, unit-testable in
  isolation with plain string inputs — no DOM, no network.

### 2. Keyword dictionary — `CATEGORY_KEYWORD_ICONS`, same file

A `Record<string, Array<[string, string]>>` keyed by the exact category
names FinTrack seeds by default (`DEFAULT_CATEGORIES` in
`backend/src/routes/auth.js`). User-created custom categories (any name not
in this table) simply get no keyword table — `getSmartIcon` falls back to
`categoryIcon` for them, which is correct/expected (there's no way to
pre-populate keywords for a category name we don't know in advance).

```ts
const CATEGORY_KEYWORD_ICONS: Record<string, Array<[string, string]>> = {
  'Food & Dining': [
    ['pizza', '🍕'], ['coffee', '☕'], ['cafe', '☕'], ['tea', '🍵'],
    ['burger', '🍔'], ['biryani', '🍛'], ['sweet', '🍬'], ['ice cream', '🍦'],
    ['bakery', '🥐'], ['zomato', '🛵'], ['swiggy', '🛵'], ['grocery', '🛒'],
    ['groceries', '🛒'], ['milk', '🥛'], ['restaurant', '🍽️'], ['breakfast', '🍳'],
  ],
  'Transportation': [
    ['uber', '🚕'], ['ola', '🚕'], ['cab', '🚕'], ['taxi', '🚕'],
    ['petrol', '⛽'], ['fuel', '⛽'], ['diesel', '⛽'], ['metro', '🚇'],
    ['train', '🚆'], ['bus', '🚌'], ['parking', '🅿️'], ['auto', '🛺'],
  ],
  'Shopping': [
    ['amazon', '📦'], ['flipkart', '📦'], ['myntra', '👕'], ['clothes', '👕'],
    ['shirt', '👕'], ['shoes', '👟'], ['phone', '📱'], ['laptop', '💻'],
    ['furniture', '🛋️'],
  ],
  'Entertainment': [
    ['movie', '🎬'], ['cinema', '🎬'], ['netflix', '📺'], ['prime video', '📺'],
    ['hotstar', '📺'], ['spotify', '🎵'], ['game', '🎮'], ['concert', '🎤'],
  ],
  'Healthcare': [
    ['doctor', '🏥'], ['hospital', '🏥'], ['medicine', '💊'], ['pharmacy', '💊'],
    ['dentist', '🦷'], ['gym', '🏋️'], ['fitness', '🏋️'],
  ],
  'Education': [
    ['course', '📚'], ['tuition', '🎓'], ['book', '📖'], ['exam', '📝'],
  ],
  'Utilities': [
    ['electricity', '⚡'], ['power bill', '⚡'], ['water bill', '💧'],
    ['wifi', '📶'], ['internet', '📶'], ['recharge', '📱'], ['gas cylinder', '🔥'],
  ],
  'Rent & Housing': [
    ['rent', '🏠'], ['maintenance', '🔧'], ['deposit', '🏦'],
  ],
  'Salary': [
    ['salary', '💰'], ['bonus', '🎁'], ['freelance', '💼'],
  ],
  'Investments': [
    ['mutual fund', '📈'], ['sip', '📈'], ['stock', '📈'], ['gold', '🪙'],
    ['fixed deposit', '🏦'], ['fd', '🏦'],
  ],
  'Personal Care': [
    ['salon', '💇'], ['haircut', '💇'], ['spa', '🧖'], ['cosmetics', '💄'],
  ],
  'Family & Kids': [
    ['school fee', '🎒'], ['toy', '🧸'], ['daycare', '🍼'],
  ],
  'Travel': [
    ['flight', '✈️'], ['hotel', '🏨'], ['airbnb', '🏨'], ['booking.com', '🏨'],
  ],
  'Subscriptions': [
    ['netflix', '📺'], ['spotify', '🎵'], ['prime', '📦'], ['apple', '📱'],
    ['icloud', '📱'], ['youtube', '📺'],
  ],
  'Gifts & Donations': [
    ['gift', '🎁'], ['donation', '❤️'], ['charity', '❤️'],
  ],
};
```

### 3. Call sites — replace `tx.category_icon || '💳'`

Corrected after deeper code reading (the original draft over-matched on a
`category_icon` grep without checking what each usage actually represents):

| File | Applies? | Why |
|---|---|---|
| `frontend/app/dashboard/page.tsx` | Yes | Recent Transactions list — one icon per transaction, `tx.category_icon \|\| '💳'` |
| `frontend/app/transactions/page.tsx` | Yes | Main transaction list — per-transaction icon, with a trend-arrow fallback when there's no `category_icon` at all (see below) |
| `frontend/app/budgets/page.tsx` | **No** | `category_icon` here is on a *budget card* (one per category), not a transaction — there's no single transaction description to match against. Out of scope. |
| `frontend/components/ui/TransactionRow.tsx` | **No** | Not imported anywhere in the app (confirmed via repo-wide search) — dead code. Out of scope; not worth fixing a component nobody renders. |

Both real call sites already have `tx.description` and `tx.category_name`
available (already returned by the backend's transaction list queries — no
API change). Import `getSmartIcon` from `@/lib/utils` in each file.

**`transactions/page.tsx` has a different fallback shape than dashboard's
`tx.category_icon || '💳'`** — it shows a trend arrow (▲/▼) instead of 💳
when there's no category icon at all:

```tsx
{tx.category_icon
    ? <span style={{ fontSize: '16px' }}>{tx.category_icon}</span>
    : isInc
        ? <TrendingUp  size={14} color="var(--color-inc)" />
        : <TrendingDown size={14} color="var(--color-exp)" />
}
```

Only the *inside* of the truthy branch changes (`tx.category_icon` →
`getSmartIcon(...)`); the trend-arrow fallback for transactions with no
category at all stays exactly as-is. This is a deliberate exception to
"getSmartIcon always returns a string, including a 💳 fallback" — at this
one call site, `getSmartIcon` is only invoked when `category_icon` is
already known truthy, so its own internal 💳 fallback never actually
triggers there.

---

## Non-Goals (explicitly out of scope)

- **No backend/database change.** No new column, no migration, no batch
  job. This was a real option (discussed and rejected) — computing at
  render time means every transaction, old or new, gets the smart icon the
  moment it's displayed, with zero backfill step needed.
- **No LLM/AI-based icon selection.** Discussed and rejected: adds API cost
  and latency to every transaction creation, and would still need a
  separate backfill pass for existing transactions. Keyword matching is
  free, instant, and (per this design's category-scoping) accurate enough
  for a cosmetic feature.
- **No editing/overriding a transaction's computed icon by the user.** If
  this turns out to matter later, it's a separate feature (would need a
  real per-transaction icon-override column, unlike this design).
- **No changes to category-level default icons.** `DEFAULT_CATEGORIES` and
  the category creation/edit flow are untouched.

---

## Testing

- Unit tests for `getSmartIcon()` (pure function, easy to test in
  isolation): keyword match within the correct category, no match falls
  back to `categoryIcon`, no category falls back to `categoryIcon`, no
  category and no categoryIcon falls back to `💳`, case-insensitivity,
  cross-category ambiguity resolved correctly (e.g. "Apple Store" in
  Shopping vs "apple" nowhere in the Food & Dining table).
- No existing test coverage exists for the 2 call-site files (no component
  test harness for this codebase's frontend, consistent with prior work on
  this project) — verified via `tsc --noEmit` plus a manual visual check,
  same convention as previous frontend-only changes in this project.
- No test runner (Jest/Vitest/etc.) is configured for the frontend at all
  — confirmed via `package.json` and a repo search. Setting one up is out
  of scope for this feature; `getSmartIcon()` is verified via a disposable
  Node scratch script during implementation (see the plan), not a
  permanent test file.

# Smart Transaction Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single fixed per-category icon on transaction rows with a per-transaction icon derived from the transaction's own description, matched against a category-scoped keyword table.

**Architecture:** A pure function `getSmartIcon()` plus a `CATEGORY_KEYWORD_ICONS` lookup table added to `frontend/lib/utils.ts`. Two real call sites get updated to use it (`dashboard/page.tsx` and `transactions/page.tsx`) — `budgets/page.tsx` and `TransactionRow.tsx` were ruled out during spec review (category-level icon and dead code, respectively). No backend or database changes.

**Tech Stack:** Next.js/React frontend, TypeScript, inline styles. No test framework is configured for the frontend (confirmed via `package.json`) — `getSmartIcon()` is verified with a disposable Node scratch script, not a permanent test file.

**Spec:** `docs/superpowers/specs/2026-08-14-smart-transaction-emoji-design.md`

---

### Task 1: Add `getSmartIcon()` and the keyword dictionary

**Files:**
- Modify: `frontend/lib/utils.ts` (append to end of file, 143 lines currently)

- [ ] **Step 1: Append the keyword dictionary and function**

Add this to the end of `frontend/lib/utils.ts`:

```ts
// Per-category keyword → emoji tables for getSmartIcon(). Keyed by the exact
// category names FinTrack seeds by default (DEFAULT_CATEGORIES in
// backend/src/routes/auth.js). A user-created category with a name not in
// this table simply has no keyword table -- getSmartIcon falls back to
// categoryIcon for it, which is correct (there's no way to pre-populate
// keywords for a category name we don't know about in advance).
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

// Picks a per-transaction icon from its description, scoped to its own
// category to avoid cross-category ambiguity (e.g. "Apple" means 🍎 in
// Food & Dining but 📱 in Shopping/Subscriptions). Falls back to the
// category's static icon, then to a generic card icon -- same fallback
// chain every call site already used before this function existed.
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

- [ ] **Step 2: Verify with a disposable scratch script (no test framework exists for this frontend)**

Create a temporary file `frontend/scratch-verify-smart-icon.mjs` (this file is NOT committed — delete it in Step 4):

```js
// Inline copy of the matching algorithm for a quick sanity check without a
// TypeScript build step. Mirrors getSmartIcon() in lib/utils.ts exactly.
const CATEGORY_KEYWORD_ICONS = {
  'Food & Dining': [['pizza', '🍕'], ['coffee', '☕'], ['grocery', '🛒']],
  'Shopping': [['apple', '📱'], ['phone', '📱']],
};

function getSmartIcon(description, categoryName, categoryIcon) {
  const desc = (description || '').toLowerCase();
  const table = categoryName ? CATEGORY_KEYWORD_ICONS[categoryName] : null;
  if (table) {
    for (const [keyword, icon] of table) {
      if (desc.includes(keyword)) return icon;
    }
  }
  return categoryIcon || '💳';
}

const cases = [
  // [description, categoryName, categoryIcon, expected]
  ['Domino\'s Pizza order',    'Food & Dining', '🍽️', '🍕'],
  ['Starbucks Coffee',         'Food & Dining', '🍽️', '☕'],
  ['Big Bazaar groceries run', 'Food & Dining', '🍽️', '🛒'],
  ['Apple Store purchase',     'Shopping',       '🛍️', '📱'],
  ['Random unmatched thing',   'Food & Dining', '🍽️', '🍽️'],   // no keyword -> categoryIcon
  ['Anything',                 null,             null, '💳'],   // no category -> generic
  ['PIZZA IN CAPS',            'Food & Dining', '🍽️', '🍕'],   // case-insensitive
];

let failures = 0;
for (const [desc, cat, icon, expected] of cases) {
  const got = getSmartIcon(desc, cat, icon);
  const pass = got === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  "${desc}" (${cat}) -> ${got} (expected ${expected})`);
}
console.log(failures === 0 ? `\nAll ${cases.length} cases passed.` : `\n${failures} of ${cases.length} cases FAILED.`);
process.exit(failures === 0 ? 0 : 1);
```

Run: `cd frontend && node scratch-verify-smart-icon.mjs`
Expected: `All 7 cases passed.` and exit code 0.

If any case fails, the algorithm (not this scratch copy) has a bug — fix
`getSmartIcon` in `lib/utils.ts` and re-run until all 7 pass. This scratch
script exercises the same substring-match, category-scoping, and fallback
chain logic as the real function; it's a hand-copy rather than an import
because there's no bundler/ts-node set up to run a `.ts` file directly with
plain `node`.

- [ ] **Step 3: Type-check the real file**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean pass).

- [ ] **Step 4: Delete the scratch script and commit**

```bash
rm frontend/scratch-verify-smart-icon.mjs
git add frontend/lib/utils.ts
git commit -m "feat(transactions): add getSmartIcon for per-transaction category-scoped emoji"
```

---

### Task 2: Wire up the dashboard's Recent Transactions

**Files:**
- Modify: `frontend/app/dashboard/page.tsx:9` (import)
- Modify: `frontend/app/dashboard/page.tsx:1022-1024` (icon render)

- [ ] **Step 1: Add the import**

Current (line 9):

```ts
import { getCurrentMonthYear, fmt } from '@/lib/utils';
```

Replace with:

```ts
import { getCurrentMonthYear, fmt, getSmartIcon } from '@/lib/utils';
```

- [ ] **Step 2: Replace the icon render**

Current (lines 1022-1024):

```tsx
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px' }}>
                                            {tx.category_icon || '💳'}
                                        </div>
```

Replace with:

```tsx
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px' }}>
                                            {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                                        </div>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean pass).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat(dashboard): use getSmartIcon for Recent Transactions icons"
```

---

### Task 3: Wire up the main Transactions list

**Files:**
- Modify: `frontend/app/transactions/page.tsx:22` (import)
- Modify: `frontend/app/transactions/page.tsx:612-619` (icon render)

This call site has a different fallback shape than the dashboard's — it
shows a trend arrow instead of 💳 when there's no `category_icon` at all.
Only the truthy branch changes; the arrow fallback stays exactly as-is.

- [ ] **Step 1: Add the import**

Current (line 22):

```ts
import { exportToCSV, formatCurrency, fmt as fmtBase } from '@/lib/utils';
```

Replace with:

```ts
import { exportToCSV, formatCurrency, fmt as fmtBase, getSmartIcon } from '@/lib/utils';
```

- [ ] **Step 2: Replace the icon render**

Current (lines 612-619):

```tsx
                                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0, background: isInc ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {tx.category_icon
                                            ? <span style={{ fontSize: '16px' }}>{tx.category_icon}</span>
                                            : isInc
                                                ? <TrendingUp  size={14} color="var(--color-inc)" />
                                                : <TrendingDown size={14} color="var(--color-exp)" />
                                        }
                                    </div>
```

Replace with:

```tsx
                                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0, background: isInc ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {tx.category_icon
                                            ? <span style={{ fontSize: '16px' }}>{getSmartIcon(tx.description, tx.category_name, tx.category_icon)}</span>
                                            : isInc
                                                ? <TrendingUp  size={14} color="var(--color-inc)" />
                                                : <TrendingDown size={14} color="var(--color-exp)" />
                                        }
                                    </div>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean pass).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/transactions/page.tsx
git commit -m "feat(transactions): use getSmartIcon on the main transaction list"
```

---

### Task 4: Manual verification

Not a coded task — no component test harness exists for either changed
page, so this closes the loop the way prior frontend-only work in this
project has (type-check + eyeball check).

- [ ] **Step 1: Start the frontend dev server** (or use a deployed
  environment) and open the dashboard.

- [ ] **Step 2: Confirm Recent Transactions shows varied icons** for
  transactions with descriptions matching known keywords (e.g. a "Pizza"
  or "Zomato" transaction in Food & Dining should show 🍕 or 🛵, not the
  category's default 🍽️), and that transactions with no keyword match
  still show the category's default icon.

- [ ] **Step 3: Confirm the same on the full Transactions page**
  (`/transactions`), and that a transaction with no category at all still
  shows the trend arrow (▲ green for income, ▼ for expense), not 💳 or a
  keyword-matched icon.

- [ ] **Step 4: Confirm nothing changed on the Budgets page** — budget
  cards should still show their plain category icon, unaffected by this
  change.

# Missing Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore seven missing/broken features identified by diffing the current codebase against the design system spec and inspecting every navigable page.

**Architecture:** All changes are frontend-only except Tasks 4–6, which each add one `PUT` backend route + frontend API method + inline edit UI. No new pages, no new files unless strictly necessary.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Express/Node.js, PostgreSQL (via `pool.js`), Axios (`frontend/lib/api.ts`)

---

## Gap Summary

| # | Feature | Where broken |
|---|---------|-------------|
| 1 | Design-system fonts (Cabinet Grotesk, Satoshi, DM Mono) not loaded | `globals.css:1`, `layout.tsx` |
| 2 | Design-system CSS token values out of sync with DESIGN.md | `globals.css` `:root` block |
| 3 | AI Chat sends empty history — multi-turn context lost | `ai-chat/page.tsx:66` |
| 4 | Recurring transactions — no edit (no backend PUT, no frontend API, no UI) | `recurring.js`, `api.ts`, `recurring/page.tsx` |
| 5 | Goals — no edit (no backend PUT, no frontend API, no UI) | `goals.js`, `api.ts`, `goals/page.tsx` |
| 6 | Budgets — no edit UI (backend already upserts; frontend missing edit form) | `budgets/page.tsx` |
| 7 | AI Chat page not reachable from any nav entry | `BottomNav.tsx`, `Sidebar.tsx` |

---

## File Map

| File | Change |
|------|--------|
| `frontend/app/globals.css` | Replace font import; update CSS token values; add `--bg-border-strong` |
| `frontend/app/layout.tsx` | Add Fontshare + Google Fonts `<link>` tags |
| `frontend/app/ai-chat/page.tsx` | Pass real `messages` array as history (one-line fix) |
| `frontend/components/layout/BottomNav.tsx` | Add AI Chat entry to TOOLS section |
| `frontend/components/layout/Sidebar.tsx` | Add AI Chat nav item |
| `backend/src/routes/recurring.js` | Add `PUT /:id` route |
| `frontend/lib/api.ts` | Add `recurringAPI.update()`, `goalsAPI.update()` |
| `frontend/app/recurring/page.tsx` | Add inline edit state + form |
| `backend/src/routes/goals.js` | Add `PUT /:id` route |
| `frontend/app/goals/page.tsx` | Add inline edit state + form |
| `frontend/app/budgets/page.tsx` | Add inline edit state + form (reuses existing create endpoint) |

---

## Task 1: Design System — Load New Fonts

**Files:**
- Modify: `frontend/app/globals.css:1`
- Modify: `frontend/app/layout.tsx` (inside `<head>`)

- [x] **Step 1: Replace font import in globals.css**

Open `frontend/app/globals.css`. Replace line 1:
```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&display=swap');
```
with:
```css
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&f[]=cabinet-grotesk@400,500,700,800,900&display=swap');
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap');
```

- [x] **Step 2: Add preconnect + font links to layout.tsx**

In `frontend/app/layout.tsx`, inside `<head>` (after the theme script), add:
```tsx
<link rel="preconnect" href="https://api.fontshare.com" />
<link
  href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&f[]=cabinet-grotesk@400,500,700,800,900&display=swap"
  rel="stylesheet"
/>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap"
  rel="stylesheet"
/>
```

- [x] **Step 3: Verify fonts load in browser**

Run `npm run dev` in `frontend/`. Open DevTools → Network tab, filter by "fontshare" and "google" — both font requests should return 200.

- [x] **Step 4: Commit**

```bash
git add frontend/app/globals.css frontend/app/layout.tsx
git commit -m "feat: load Cabinet Grotesk, Satoshi, DM Mono fonts per design system"
```

---

## Task 2: Design System — Update CSS Tokens

**Files:**
- Modify: `frontend/app/globals.css` (`:root` block, lines 11–71)

DESIGN.md specifies these exact values. Current `globals.css` has drifted. Apply all deltas in one edit.

- [x] **Step 1: Update `:root` token values**

In `frontend/app/globals.css`, update the `:root, [data-theme="dark"]` block to match DESIGN.md exactly:

```css
:root,
[data-theme="dark"] {
  --bg-primary:         #080c18;
  --bg-secondary:       #0d1425;
  --bg-card:            #111a30;
  --bg-hover:           #192140;
  --bg-border:          #1e2d4a;
  --bg-border-strong:   #2a3d5e;

  --text-primary:       #f0f4ff;
  --text-secondary:     #8899bb;
  --text-muted:         #4a5d7e;
```
Leave all accent, shadow, gradient, and animation variables as-is (they already match DESIGN.md).

- [x] **Step 2: Add missing `--bg-border-strong` usages check**

Run in project root:
```bash
grep -r "bg-border-strong" frontend/
```
Expected: no matches yet (variable is defined but not yet used — that's fine; it's available for future use).

- [x] **Step 3: Visual smoke-test**

Open the app at `/dashboard`. Confirm the background is noticeably darker and more blue-shifted. No layout breaks.

- [x] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: sync CSS design tokens with DESIGN.md spec"
```

---

## Task 3: Fix AI Chat Conversation History

**Files:**
- Modify: `frontend/app/ai-chat/page.tsx:66`

The bug is on line 66: `history: []` is hardcoded. The correct value is the messages **before** the current message (i.e., `messages`, the old state before the new user message was appended).

- [x] **Step 1: Fix the history payload**

In `frontend/app/ai-chat/page.tsx`, in the `handleSend` function, change:
```ts
{ message: trimmed, history: [] },
```
to:
```ts
{ message: trimmed, history: messages },
```

`messages` is the state array **before** `setMessages` appends the new user message, so it correctly represents prior turns.

- [x] **Step 2: Manual test**

1. Open `/ai-chat`
2. Send: "My name is Alex"
3. Send: "What's my name?"
4. Verify the AI replies with "Alex" — proving history is being passed.

- [x] **Step 3: Commit**

```bash
git add frontend/app/ai-chat/page.tsx
git commit -m "fix: pass conversation history to AI chat API for multi-turn context"
```

---

## Task 4: Recurring Transactions — Add Edit Feature

**Files:**
- Modify: `backend/src/routes/recurring.js` — add `PUT /:id`
- Modify: `frontend/lib/api.ts` — add `recurringAPI.update()`
- Modify: `frontend/app/recurring/page.tsx` — add edit state + form

### 4a — Backend: PUT /api/recurring/:id

- [x] **Step 1: Add PUT route to `backend/src/routes/recurring.js`**

Insert before the `module.exports` line:
```js
router.put('/:id', async (req, res) => {
    try {
        const { type, amount, description, frequency, day_of_month, category_id } = req.body;
        if (!type || !amount || !description || !frequency)
            return res.status(400).json({ error: 'Type, amount, description and frequency are required.' });

        const result = await pool.query(
            `UPDATE recurring_transactions
             SET type=$1, amount=$2, description=$3, frequency=$4,
                 day_of_month=$5, category_id=$6, updated_at=NOW()
             WHERE id=$7 AND user_id=$8 RETURNING *`,
            [type, amount, description, frequency, day_of_month || null, category_id || null, req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });
        res.json({ recurring: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});
```

- [x] **Step 2: Test the backend route**

```bash
# From project root, with the backend running:
curl -X PUT http://localhost:5000/api/recurring/SOME_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","amount":"500","description":"Test edit","frequency":"monthly"}'
```
Expected: `{"recurring": {...}}` with updated fields.

### 4b — Frontend API

- [x] **Step 3: Add `update` to `recurringAPI` in `frontend/lib/api.ts`**

In the `recurringAPI` object (after the `create` method), add:
```ts
update: (id: string, data: { type: string; amount: number; description: string; frequency: string; day_of_month?: number; category_id?: string }) =>
    api.put(`/api/recurring/${id}`, data),
```

### 4c — Frontend UI

- [x] **Step 4: Add edit state to `frontend/app/recurring/page.tsx`**

After the `form` state declaration (around line 25), add:
```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editForm, setEditForm] = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '', frequency: 'monthly', day_of_month: '', category_id: '' });
const [editLoading, setEditLoading] = useState(false);
const [editError, setEditError] = useState('');
```

- [x] **Step 5: Add `handleEdit` and `handleEditSubmit` functions**

After `handleToggle`, add:
```ts
const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setEditError(''); setEditLoading(true);
    try {
        await recurringAPI.update(editingId!, {
            type: editForm.type,
            amount: parseFloat(editForm.amount),
            description: editForm.description,
            frequency: editForm.frequency,
            day_of_month: editForm.day_of_month ? parseInt(editForm.day_of_month) : undefined,
            category_id: editForm.category_id || undefined,
        });
        setEditingId(null); fetchData();
    } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
    finally { setEditLoading(false); }
};
```

- [x] **Step 6: Add an Edit button and inline form to each recurring item**

Find the recurring item card render (search for the trash/delete button in the list). Add an Edit (pencil) icon button next to delete. When clicked:
```ts
onClick={() => {
    setEditingId(r.id);
    setEditForm({
        type: r.type,
        amount: String(r.amount),
        description: r.description,
        frequency: r.frequency,
        day_of_month: r.day_of_month ? String(r.day_of_month) : '',
        category_id: r.category_id || '',
    });
}}
```

Below each card, conditionally render the edit form when `editingId === r.id`. The form fields mirror the create form (type, amount, description, frequency, day_of_month, category). Submit calls `handleEditSubmit`. A Cancel button sets `editingId(null)`.

Add `Pencil` to the lucide-react import line.

- [x] **Step 7: Manual test**

1. Create a recurring transaction
2. Click the edit pencil icon
3. Change the amount and description
4. Submit — the card should update without a page reload

- [x] **Step 8: Commit**

```bash
git add backend/src/routes/recurring.js frontend/lib/api.ts frontend/app/recurring/page.tsx
git commit -m "feat: add edit functionality for recurring transactions"
```

---

## Task 5: Goals — Add Edit Feature

**Files:**
- Modify: `backend/src/routes/goals.js` — add `PUT /:id`
- Modify: `frontend/lib/api.ts` — add `goalsAPI.update()`
- Modify: `frontend/app/goals/page.tsx` — add edit state + form

### 5a — Backend

- [x] **Step 1: Add PUT route to `backend/src/routes/goals.js`**

Before `module.exports`:
```js
router.put('/:id', async (req, res) => {
    try {
        const { name, target_amount, deadline, color } = req.body;
        if (!name || !target_amount)
            return res.status(400).json({ error: 'Name and target amount are required.' });

        const result = await pool.query(
            `UPDATE goals
             SET name=$1, target_amount=$2, deadline=$3, color=$4, updated_at=NOW()
             WHERE id=$5 AND user_id=$6 RETURNING *`,
            [name, target_amount, deadline || null, color || '#10b981', req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });
        res.json({ goal: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});
```

- [x] **Step 2: Test the backend route**

```bash
curl -X PUT http://localhost:5000/api/goals/SOME_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Laptop","target_amount":"120000","color":"#3b82f6"}'
```
Expected: `{"goal": {...}}` with updated fields.

### 5b — Frontend API

- [x] **Step 3: Add `update` to `goalsAPI` in `frontend/lib/api.ts`**

In the `goalsAPI` object, after `create`:
```ts
update: (id: string, data: { name: string; target_amount: number; deadline?: string; color?: string }) =>
    api.put(`/api/goals/${id}`, data),
```

### 5c — Frontend UI

- [x] **Step 4: Add edit state to `frontend/app/goals/page.tsx`**

After the `form` state (line ~34), add:
```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editForm, setEditForm] = useState({ name: '', target_amount: '', deadline: '', color: '#10b981' });
const [editLoading, setEditLoading] = useState(false);
const [editError, setEditError] = useState('');
```

- [x] **Step 5: Add `handleEditSubmit` function**

After `handleCreate`:
```ts
const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setEditError(''); setEditLoading(true);
    try {
        await goalsAPI.update(editingId!, {
            name: editForm.name,
            target_amount: parseFloat(editForm.target_amount),
            deadline: editForm.deadline || undefined,
            color: editForm.color,
        });
        setEditingId(null); fetchGoals();
    } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
    finally { setEditLoading(false); }
};
```

- [x] **Step 6: Add Edit button + inline form to each goal card**

Add a `Pencil` icon button to each goal's action row. When clicked:
```ts
onClick={() => {
    setEditingId(g.id);
    setEditForm({ name: g.name, target_amount: String(g.target_amount), deadline: g.deadline?.split('T')[0] || '', color: g.color || '#10b981' });
}}
```

Below each goal card, when `editingId === g.id`, render an inline edit form with fields: Goal Name (text), Target Amount (number), Deadline (DatePicker), Color (GOAL_COLORS pill selector). Submit calls `handleEditSubmit`. Cancel sets `editingId(null)`.

Add `Pencil` to lucide-react import.

- [x] **Step 7: Manual test**

1. Create a goal
2. Click the edit icon
3. Change name, target, and color
4. Submit — the goal card should reflect the new values

- [x] **Step 8: Commit**

```bash
git add backend/src/routes/goals.js frontend/lib/api.ts frontend/app/goals/page.tsx
git commit -m "feat: add edit functionality for goals"
```

---

## Task 6: Budgets — Add Edit UI

**Files:**
- Modify: `frontend/app/budgets/page.tsx` only

The backend already handles updates via `ON CONFLICT … DO UPDATE` in the `POST /api/budgets` endpoint. The frontend just needs an edit form that re-submits with the same `category_id` and a new `amount`.

- [x] **Step 1: Add edit state to `frontend/app/budgets/page.tsx`**

After `formError` state (around line 33), add:
```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [editAmount, setEditAmount] = useState('');
const [editLoading, setEditLoading] = useState(false);
const [editError, setEditError] = useState('');
```

- [x] **Step 2: Add `handleEditSave` function**

After `handleDelete`:
```ts
const handleEditSave = async (budget: any) => {
    if (!editAmount) { setEditError('Enter an amount.'); return; }
    setEditLoading(true); setEditError('');
    try {
        await budgetsAPI.create({
            category_id: budget.category_id,
            amount: parseFloat(editAmount),
            month: currentMonth,
            year: currentYear,
        });
        setEditingId(null); fetchBudgets();
    } catch (err: any) { setEditError(err.response?.data?.error || 'Failed to update.'); }
    finally { setEditLoading(false); }
};
```

- [x] **Step 3: Add Edit button + inline input to each budget row**

In the budget list render, add a `Pencil` icon button next to the delete button. When clicked:
```ts
onClick={() => { setEditingId(b.id); setEditAmount(String(parseFloat(b.amount))); setEditError(''); }}
```

When `editingId === b.id`, replace the amount display with:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <input
        type="number"
        min="1"
        value={editAmount}
        onChange={e => setEditAmount(e.target.value)}
        style={{ width: '100px', padding: '4px 8px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        autoFocus
    />
    <Button size="sm" onClick={() => handleEditSave(b)} isLoading={editLoading}>Save</Button>
    <button onClick={() => { setEditingId(null); setEditError(''); }}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
        Cancel
    </button>
</div>
```

Add `Pencil` to lucide-react import.

- [x] **Step 4: Manual test**

1. Create a budget for a category (e.g. Food, ₹5000)
2. Click the edit pencil
3. Change amount to ₹8000 and save
4. The budget bar should update to reflect ₹8000 limit

- [x] **Step 5: Commit**

```bash
git add frontend/app/budgets/page.tsx
git commit -m "feat: add inline edit for budget amounts"
```

---

## Task 7: Add AI Chat to Navigation

**Files:**
- Modify: `frontend/components/layout/BottomNav.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx`

### 7a — BottomNav

- [x] **Step 1: Add AI Chat to BottomNav TOOLS section**

In `frontend/components/layout/BottomNav.tsx`, find the `moreSections` array. In the `TOOLS` section items array, add before `{ href: '/profile', ... }`:
```ts
{ href: '/ai-chat', icon: MessageSquare, label: 'AI Chat' },
```

Add `MessageSquare` to the lucide-react import line.

### 7b — Sidebar

- [x] **Step 2: Add AI Chat to Sidebar navItems**

In `frontend/components/layout/Sidebar.tsx`, find `navItems`. Add after `{ href: '/personality', ... }`:
```ts
{ href: '/ai-chat', icon: MessageSquare, label: 'AI Chat' },
```

Add `MessageSquare` to the lucide-react import (it already has `Brain` in the import — add `MessageSquare` to the same line).

- [x] **Step 3: Manual test**

1. Open the app on mobile — tap More → TOOLS — verify "AI Chat" appears and navigates to `/ai-chat`
2. Open on desktop — verify "AI Chat" appears in the sidebar between Personality and Settings

- [x] **Step 4: Commit**

```bash
git add frontend/components/layout/BottomNav.tsx frontend/components/layout/Sidebar.tsx
git commit -m "feat: add AI Chat to navigation (BottomNav + Sidebar)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Design fonts: Task 1
- ✅ CSS tokens: Task 2
- ✅ AI Chat history bug: Task 3
- ✅ Recurring edit: Task 4 (backend + API + UI)
- ✅ Goals edit: Task 5 (backend + API + UI)
- ✅ Budgets edit: Task 6 (UI only — backend already upserts)
- ✅ AI Chat navigation: Task 7

**Placeholder scan:** None found.

**Type consistency:**
- `recurringAPI.update` signature matches PUT route body fields
- `goalsAPI.update` signature matches PUT route body fields
- `budgetsAPI.create` is reused intentionally — the backend upserts by `(user_id, category_id, month, year)` unique key, so re-POSTing updates it cleanly

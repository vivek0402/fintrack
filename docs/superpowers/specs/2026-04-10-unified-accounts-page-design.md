# Unified Accounts Page — Design Spec
**Date:** 2026-04-10  
**Status:** Approved

---

## Problem

There is no `/accounts` page. Bank accounts live inside the Profile page (`BankAccountsSection`). Credit cards and wallets have no representation in the app at all. Users cannot see their full financial position — bank balances, card debt, and wallet cash — in one view.

---

## Goal

A single scrollable `/accounts` page that shows all account types together, grouped by type, with a net-worth figure at the top. Modelled after CRED/Fi account screens. No tabs.

---

## Approach

**Single monolithic page file** — `frontend/app/accounts/page.tsx` handles all three groups. Modals rendered via `createPortal`. Credit cards and wallets get their own backend routes and migrations. Matches every other page's pattern in the codebase.

---

## Data Model

### New table: `credit_cards`
```sql
CREATE TABLE credit_cards (
    id                   SERIAL PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name            TEXT NOT NULL,
    card_name            TEXT NOT NULL,
    last_four            CHAR(4),
    credit_limit         NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    billing_date         INTEGER CHECK (billing_date BETWEEN 1 AND 28),  -- day of month
    due_days             INTEGER DEFAULT 20,                              -- days after billing date
    network              TEXT DEFAULT 'Visa',                            -- Visa/Mastercard/Amex/RuPay
    color                TEXT DEFAULT '#6366f1',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### New table: `wallets`
```sql
CREATE TABLE wallets (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '👛',
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Altered table: `bank_accounts`
Two nullable columns added via migration, non-breaking:
- `account_type TEXT DEFAULT 'Savings'` — Savings / Current / Salary / FD
- `last_four CHAR(4)` — masked display only

---

## Backend

### Migrations (in order)
| File | Purpose |
|------|---------|
| `016_credit_cards.sql` | Create `credit_cards` table + user index |
| `017_wallets.sql` | Create `wallets` table + user index |
| `018_bank_accounts_type_lastfour.sql` | `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type`, `last_four` |

### New routes
**`/api/credit-cards`** — all behind `authMiddleware`
- `GET /` — return all cards for user, ordered by created_at
- `POST /` — create card; required: bank_name, card_name; optional: last_four, credit_limit, outstanding_balance, billing_date, due_days, network, color
- `PUT /:id` — full update of any field
- `DELETE /:id` — delete, ownership check

**`/api/wallets`** — all behind `authMiddleware`
- `GET /` — return all wallets for user
- `POST /` — create; required: name, emoji, balance
- `PUT /:id` — update name, emoji, or balance
- `DELETE /:id` — delete, ownership check

### Existing routes
`/api/accounts` — **untouched**. The new `account_type` and `last_four` columns are returned automatically by the existing SELECT *.

### Registration in `index.js`
```js
app.use('/api/credit-cards', require('./routes/creditCards'));
app.use('/api/wallets',       require('./routes/wallets'));
```

### Frontend API (`frontend/lib/api.ts`)
Two new exported objects appended:
```ts
export const creditCardsAPI = {
    getAll: () => api.get('/api/credit-cards'),
    create: (data) => api.post('/api/credit-cards', data),
    update: (id, data) => api.put(`/api/credit-cards/${id}`, data),
    delete: (id) => api.delete(`/api/credit-cards/${id}`),
};

export const walletsAPI = {
    getAll: () => api.get('/api/wallets'),
    create: (data) => api.post('/api/wallets', data),
    update: (id, data) => api.put(`/api/wallets/${id}`, data),
    delete: (id) => api.delete(`/api/wallets/${id}`),
};
```

---

## Frontend Page: `frontend/app/accounts/page.tsx`

### Layout (top to bottom, no tabs)

**1. Header block**
- "Accounts" in Cabinet Grotesk 700, ~22px
- Subtitle "All your money in one place" in Satoshi, `var(--text-muted)`
- Net worth figure: `DM Mono`, 40px, `var(--accent-mint)` if ≥ 0 else `var(--accent-rose)`
- Net worth formula: `SUM(bank current_balance) + SUM(wallet balance) - SUM(credit outstanding_balance)`

**2. Bank Accounts group**
- Section label "Bank Accounts" + group total right-aligned (DM Mono, mint)
- Each account card:
  - 4px left border in account's `color`
  - Left: `name` (Satoshi 500), `account_type` pill (small, `--bg-hover`), masked `••••  XXXX` if `last_four` set
  - Right: `current_balance` in DM Mono, edit icon (pencil), delete icon (trash) — icon buttons
  - Min height 60px, `--bg-card` background, `--bg-border` border, 12px radius
- "+ Add Bank Account" ghost button at bottom of group

**3. Credit Cards group**
- Section label "Credit Cards" + total outstanding right-aligned in `var(--accent-rose)`
- Each card row (collapsed by default, expands on tap):
  - Left: bank name + card name, `••••  XXXX`
  - Right: outstanding in rose, due-date pill
  - Due-date pill logic: compute next due date from `billing_date` + `due_days`. If days remaining > 7 → mint bg; 3–7 → amber bg; < 3 or overdue → rose bg. Shows "Due in N days" or "Overdue"
  - Utilization bar: thin (4px height), `--bg-hover` track, rose fill at `(outstanding/limit * 100)%`, capped at 100%
  - Expanded state (accordion): shows credit limit, utilization %, and "Update Outstanding" button that opens inline edit
  - Edit/delete icons on card row
- "+ Add Credit Card" ghost button

**4. Wallets & UPI group**
- Section label "Wallets" + total right-aligned (mint)
- Each wallet: emoji + name + balance right-aligned in DM Mono
- Tapping the balance opens an inline edit field (input replaces balance text, blur/enter confirms, calls PUT)
- Edit/delete icons
- "+ Add Wallet" ghost button

### Modals (all via `createPortal`)

**Bank Account modal** (add + edit)
- Fields: Name (text), Account Type (select: Savings/Current/Salary/FD), Last Four (4-digit input, optional), Starting Balance (number), Balance As-Of Date (date, optional)
- On edit: pre-fills all fields; PATCH via `accountsAPI.update`

**Credit Card modal** (add + edit)
- Fields: Card Name, Bank Name, Last Four, Credit Limit, Outstanding Balance, Billing Date (1–28), Due Days After Billing, Network (select: Visa/Mastercard/Amex/RuPay), Color (6 preset swatches)
- POST / PUT via `creditCardsAPI`

**Wallet modal** (add + edit)
- Fields: Name (text), Emoji (text, single emoji picker row with 8 presets), Balance (number)
- POST / PUT via `walletsAPI`

All modals: overlay z-index 9999, box z-index 10000, Escape closes, body overflow hidden while open. Existing `Modal` component from `components/ui/Modal.tsx` used where the field count fits; inline portal used for credit card (more complex layout).

### State management
All in component-local `useState`. Parallel `useEffect` fetches on mount: accounts, credit cards, wallets simultaneously. Each fetch independent — one failing does not clear others. Toast for success/error.

### Confirmation on delete
Delete confirm dialog uses `createPortal` inline (not the Modal component), matching the one-time-expenses pattern.

---

## Navigation

### Sidebar (`frontend/components/layout/Sidebar.tsx`)
Add to `navItems` after Transactions:
```ts
{ href: '/accounts', icon: Wallet, label: 'Accounts' }
```
Import `Wallet` from `lucide-react` (available in existing import block).

### BottomNav (`frontend/components/layout/BottomNav.tsx`)
Add to FINANCE section in `moreSections`:
```ts
{ href: '/accounts', icon: Wallet, label: 'Accounts' }
```
Same `Wallet` import.

One-Time Expenses — **no change**. Stays in GROUPS & SPLITS exactly where it is.

---

## Design Tokens Used

| Token | Usage |
|-------|-------|
| `--accent-mint` | Positive balances, net worth when positive, bank totals, wallet totals |
| `--accent-rose` | Credit outstanding, negative net worth, due pills ≤3 days |
| `--accent-amber` | Due pills 3–7 days |
| `--accent-indigo` | Interactive buttons, focus rings |
| `--bg-card` | Account card backgrounds |
| `--bg-border` | Card borders, utilization bar track |
| `--bg-hover` | Account type pills, icon hover state |
| `--text-muted` | Section subtitles, masked numbers |
| `DM Mono` | All currency figures, masked numbers |
| `Cabinet Grotesk 700` | Page heading |
| `Satoshi` | All other UI text |

---

## Out of Scope

- Transaction history per account on this page (that lives on `/transactions` with account filter)
- Credit card bill payment integration (real payment gateway)
- Import from bank statement / PDF
- Multi-currency per account
- Credit card reward points tracking
- One-Time Expenses — stays at its own `/one-time-expenses` page, not referenced here

---

## File Checklist

| File | Action |
|------|--------|
| `backend/src/db/migrations/016_credit_cards.sql` | Create |
| `backend/src/db/migrations/017_wallets.sql` | Create |
| `backend/src/db/migrations/018_bank_accounts_type_lastfour.sql` | Create |
| `backend/src/routes/creditCards.js` | Create |
| `backend/src/routes/wallets.js` | Create |
| `backend/src/index.js` | Add 2 route registrations |
| `frontend/lib/api.ts` | Add `creditCardsAPI`, `walletsAPI` |
| `frontend/app/accounts/page.tsx` | Create |
| `frontend/components/layout/Sidebar.tsx` | Add Accounts nav item |
| `frontend/components/layout/BottomNav.tsx` | Add Accounts to More sheet |

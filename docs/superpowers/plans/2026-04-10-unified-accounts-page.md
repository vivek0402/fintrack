# Unified Accounts Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single scrollable `/accounts` page that groups bank accounts, credit cards, and wallets with a net-worth header — backed by two new DB tables and backend routes.

**Architecture:** Three DB migrations add the new tables and extend bank_accounts. Two new Express route files follow the same auth-middleware pattern as `accounts.js`. The frontend page is one self-contained file using local state, parallel fetches, and createPortal for all modals.

**Tech Stack:** PostgreSQL (migrations), Express + Node.js (backend), Next.js 15 App Router + React + TypeScript (frontend), inline styles + CSS vars, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-10-unified-accounts-page-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/src/db/migrations/016_credit_cards.sql` | credit_cards table |
| Create | `backend/src/db/migrations/017_wallets.sql` | wallets table |
| Create | `backend/src/db/migrations/018_bank_accounts_type_lastfour.sql` | Add account_type + last_four to bank_accounts |
| Create | `backend/src/routes/creditCards.js` | CRUD for /api/credit-cards |
| Create | `backend/src/routes/wallets.js` | CRUD for /api/wallets |
| Modify | `backend/src/index.js` | Register 2 new routes |
| Modify | `frontend/lib/api.ts` | Add creditCardsAPI + walletsAPI |
| Create | `frontend/app/accounts/page.tsx` | Unified accounts page |
| Modify | `frontend/components/layout/Sidebar.tsx` | Add Accounts nav item |
| Modify | `frontend/components/layout/BottomNav.tsx` | Add Accounts to More sheet |

---

## Task 1: Migration — credit_cards table

**Files:**
- Create: `backend/src/db/migrations/016_credit_cards.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- backend/src/db/migrations/016_credit_cards.sql
CREATE TABLE IF NOT EXISTS credit_cards (
    id                   SERIAL PRIMARY KEY,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_name            TEXT NOT NULL,
    card_name            TEXT NOT NULL,
    last_four            CHAR(4),
    credit_limit         NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    billing_date         INTEGER CHECK (billing_date BETWEEN 1 AND 28),
    due_days             INTEGER NOT NULL DEFAULT 20,
    network              TEXT NOT NULL DEFAULT 'Visa',
    color                TEXT NOT NULL DEFAULT '#6366f1',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON credit_cards(user_id);
```

- [ ] **Step 2: Verify migration runs without error**

Restart the backend (`npm run dev` in `backend/`) and check the console for:
```
✅ Migration applied: 016_credit_cards.sql
```
If you see `❌ Migration failed`, check the error — most likely a syntax issue in the SQL.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/016_credit_cards.sql
git commit -m "feat: add credit_cards table migration"
```

---

## Task 2: Migration — wallets table

**Files:**
- Create: `backend/src/db/migrations/017_wallets.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- backend/src/db/migrations/017_wallets.sql
CREATE TABLE IF NOT EXISTS wallets (
    id         SERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '👛',
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
```

- [ ] **Step 2: Verify migration runs**

Restart backend, check console for:
```
✅ Migration applied: 017_wallets.sql
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/017_wallets.sql
git commit -m "feat: add wallets table migration"
```

---

## Task 3: Migration — extend bank_accounts

**Files:**
- Create: `backend/src/db/migrations/018_bank_accounts_type_lastfour.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- backend/src/db/migrations/018_bank_accounts_type_lastfour.sql
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'Savings';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS last_four    CHAR(4);
```

- [ ] **Step 2: Verify migration runs**

Restart backend, check console for:
```
✅ Migration applied: 018_bank_accounts_type_lastfour.sql
```
The existing `GET /api/accounts` route uses `SELECT a.*` so the two new columns are returned automatically — no route change needed.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/018_bank_accounts_type_lastfour.sql
git commit -m "feat: add account_type and last_four columns to bank_accounts"
```

---

## Task 4: Backend route — credit cards

**Files:**
- Create: `backend/src/routes/creditCards.js`

- [ ] **Step 1: Create the route file**

```js
// backend/src/routes/creditCards.js
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

router.use(auth);

// GET /api/credit-cards
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM credit_cards WHERE user_id = $1 ORDER BY created_at ASC`,
            [req.user.id]
        );
        res.json({ cards: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch credit cards' });
    }
});

// POST /api/credit-cards
router.post('/', async (req, res) => {
    try {
        const {
            bank_name, card_name,
            last_four        = null,
            credit_limit     = 0,
            outstanding_balance = 0,
            billing_date     = null,
            due_days         = 20,
            network          = 'Visa',
            color            = '#6366f1',
        } = req.body;

        if (!bank_name?.trim()) return res.status(400).json({ error: 'bank_name is required' });
        if (!card_name?.trim()) return res.status(400).json({ error: 'card_name is required' });

        const { rows } = await pool.query(
            `INSERT INTO credit_cards
                (user_id, bank_name, card_name, last_four, credit_limit, outstanding_balance, billing_date, due_days, network, color)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [req.user.id, bank_name.trim(), card_name.trim(), last_four || null,
             credit_limit, outstanding_balance, billing_date || null, due_days, network, color]
        );
        res.status(201).json({ card: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create credit card' });
    }
});

// PUT /api/credit-cards/:id
router.put('/:id', async (req, res) => {
    try {
        const { rows: existing } = await pool.query(
            `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Card not found' });

        const {
            bank_name, card_name, last_four,
            credit_limit, outstanding_balance,
            billing_date, due_days, network, color,
        } = req.body;

        const { rows } = await pool.query(
            `UPDATE credit_cards SET
                bank_name           = COALESCE($1, bank_name),
                card_name           = COALESCE($2, card_name),
                last_four           = COALESCE($3, last_four),
                credit_limit        = COALESCE($4, credit_limit),
                outstanding_balance = COALESCE($5, outstanding_balance),
                billing_date        = COALESCE($6, billing_date),
                due_days            = COALESCE($7, due_days),
                network             = COALESCE($8, network),
                color               = COALESCE($9, color),
                updated_at          = NOW()
             WHERE id = $10 AND user_id = $11
             RETURNING *`,
            [bank_name, card_name, last_four || null,
             credit_limit, outstanding_balance,
             billing_date || null, due_days, network, color,
             req.params.id, req.user.id]
        );
        res.json({ card: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update credit card' });
    }
});

// DELETE /api/credit-cards/:id
router.delete('/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM credit_cards WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Card not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete credit card' });
    }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/creditCards.js
git commit -m "feat: add /api/credit-cards CRUD route"
```

---

## Task 5: Backend route — wallets

**Files:**
- Create: `backend/src/routes/wallets.js`

- [ ] **Step 1: Create the route file**

```js
// backend/src/routes/wallets.js
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

router.use(auth);

// GET /api/wallets
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC`,
            [req.user.id]
        );
        res.json({ wallets: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

// POST /api/wallets
router.post('/', async (req, res) => {
    try {
        const { name, emoji = '👛', balance = 0 } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const { rows } = await pool.query(
            `INSERT INTO wallets (user_id, name, emoji, balance)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [req.user.id, name.trim(), emoji, balance]
        );
        res.status(201).json({ wallet: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// PUT /api/wallets/:id
router.put('/:id', async (req, res) => {
    try {
        const { rows: existing } = await pool.query(
            `SELECT id FROM wallets WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Wallet not found' });

        const { name, emoji, balance } = req.body;

        const { rows } = await pool.query(
            `UPDATE wallets SET
                name       = COALESCE($1, name),
                emoji      = COALESCE($2, emoji),
                balance    = COALESCE($3, balance),
                updated_at = NOW()
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
            [name, emoji, balance, req.params.id, req.user.id]
        );
        res.json({ wallet: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
});

// DELETE /api/wallets/:id
router.delete('/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM wallets WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Wallet not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete wallet' });
    }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/wallets.js
git commit -m "feat: add /api/wallets CRUD route"
```

---

## Task 6: Register routes in index.js

**Files:**
- Modify: `backend/src/index.js:175-176` (after the existing accounts/one-time-expenses lines)

- [ ] **Step 1: Add the two route registrations**

In `backend/src/index.js`, find this block:
```js
app.use('/api/accounts',          require('./routes/accounts'));
app.use('/api/one-time-expenses', require('./routes/oneTimeExpenses'));
```

Add two lines immediately after:
```js
app.use('/api/credit-cards',      require('./routes/creditCards'));
app.use('/api/wallets',           require('./routes/wallets'));
```

- [ ] **Step 2: Verify routes respond**

Restart the backend. Using curl or a REST client, confirm:
```
GET /api/credit-cards   →  401 (no token) — route is registered
GET /api/wallets        →  401 (no token) — route is registered
```
A 404 means the route wasn't registered. A 401 means it's wired correctly and auth is working.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.js
git commit -m "feat: register credit-cards and wallets routes"
```

---

## Task 7: Add API clients to frontend/lib/api.ts

**Files:**
- Modify: `frontend/lib/api.ts` (append before `export default api`)

- [ ] **Step 1: Add the two API objects**

In `frontend/lib/api.ts`, find the final line `export default api;` and insert before it:

```ts
export const creditCardsAPI = {
    getAll: () => api.get('/api/credit-cards'),
    create: (data: {
        bank_name: string; card_name: string; last_four?: string | null;
        credit_limit?: number; outstanding_balance?: number;
        billing_date?: number | null; due_days?: number;
        network?: string; color?: string;
    }) => api.post('/api/credit-cards', data),
    update: (id: number, data: {
        bank_name?: string; card_name?: string; last_four?: string | null;
        credit_limit?: number; outstanding_balance?: number;
        billing_date?: number | null; due_days?: number;
        network?: string; color?: string;
    }) => api.put(`/api/credit-cards/${id}`, data),
    delete: (id: number) => api.delete(`/api/credit-cards/${id}`),
};

export const walletsAPI = {
    getAll: () => api.get('/api/wallets'),
    create: (data: { name: string; emoji?: string; balance?: number }) =>
        api.post('/api/wallets', data),
    update: (id: number, data: { name?: string; emoji?: string; balance?: number }) =>
        api.put(`/api/wallets/${id}`, data),
    delete: (id: number) => api.delete(`/api/wallets/${id}`),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add creditCardsAPI and walletsAPI to frontend api client"
```

---

## Task 8: Create frontend/app/accounts/page.tsx

**Files:**
- Create: `frontend/app/accounts/page.tsx`

- [ ] **Step 1: Create the page file**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, ChevronDown, ChevronUp, X, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/authStore';
import { accountsAPI, creditCardsAPI, walletsAPI } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankAccount {
    id: number;
    name: string;
    icon: string;
    color: string;
    account_type: string;
    last_four: string | null;
    starting_balance: number;
    current_balance: number;
    is_default: boolean;
    balance_as_of: string | null;
}

interface CreditCard {
    id: number;
    bank_name: string;
    card_name: string;
    last_four: string | null;
    credit_limit: number;
    outstanding_balance: number;
    billing_date: number | null;
    due_days: number;
    network: string;
    color: string;
}

interface Wallet {
    id: number;
    name: string;
    emoji: string;
    balance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
    return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function getDueDays(billingDate: number | null, dueDays: number): number | null {
    if (!billingDate) return null;
    const today = new Date();
    // Compute this month's due date
    const billing = new Date(today.getFullYear(), today.getMonth(), billingDate);
    const due = new Date(billing);
    due.setDate(due.getDate() + dueDays);
    // If already passed, compute next month's due date
    if (due < today) {
        const nextBilling = new Date(today.getFullYear(), today.getMonth() + 1, billingDate);
        const nextDue = new Date(nextBilling);
        nextDue.setDate(nextDue.getDate() + dueDays);
        return Math.round((nextDue.getTime() - today.getTime()) / 86400000);
    }
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['Savings', 'Current', 'Salary', 'FD'];
const NETWORKS      = ['Visa', 'Mastercard', 'Amex', 'RuPay'];
const CARD_COLORS   = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
const WALLET_EMOJIS = ['👛', '💰', '📱', '🏧', '💳', '🪙', '💵', '🏦'];

const emptyBankForm = () => ({ name: '', account_type: 'Savings', last_four: '', starting_balance: '', balance_as_of: '' });
const emptyCardForm = () => ({ bank_name: '', card_name: '', last_four: '', credit_limit: '', outstanding_balance: '0', billing_date: '', due_days: '20', network: 'Visa', color: '#6366f1' });
const emptyWalletForm = () => ({ name: '', emoji: '👛', balance: '' });

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    // Data
    const [banks,   setBanks]   = useState<BankAccount[]>([]);
    const [cards,   setCards]   = useState<CreditCard[]>([]);
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [mounted, setMounted] = useState(false);

    // Modal open state
    const [showBankModal,   setShowBankModal]   = useState(false);
    const [showCardModal,   setShowCardModal]   = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);

    // What we're editing (null = add mode)
    const [editingBank,   setEditingBank]   = useState<BankAccount | null>(null);
    const [editingCard,   setEditingCard]   = useState<CreditCard | null>(null);
    const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);

    // Form values
    const [bankForm,   setBankForm]   = useState(emptyBankForm());
    const [cardForm,   setCardForm]   = useState(emptyCardForm());
    const [walletForm, setWalletForm] = useState(emptyWalletForm());

    // UI state
    const [expandedCardId,        setExpandedCardId]        = useState<number | null>(null);
    const [editingWalletBalanceId, setEditingWalletBalanceId] = useState<number | null>(null);
    const [walletBalanceInput,     setWalletBalanceInput]    = useState('');
    const [deleteConfirm,          setDeleteConfirm]         = useState<{ type: 'bank' | 'card' | 'wallet'; id: number; name: string } | null>(null);
    const [saving,  setSaving]  = useState(false);
    const [toast,   setToast]   = useState('');

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 2500);
    };

    const fetchAll = useCallback(async () => {
        const [banksRes, cardsRes, walletsRes] = await Promise.allSettled([
            accountsAPI.getAll(),
            creditCardsAPI.getAll(),
            walletsAPI.getAll(),
        ]);
        if (banksRes.status   === 'fulfilled') setBanks(banksRes.value.data.accounts);
        if (cardsRes.status   === 'fulfilled') setCards(cardsRes.value.data.cards);
        if (walletsRes.status === 'fulfilled') setWallets(walletsRes.value.data.wallets);
    }, []);

    useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

    // ── Derived totals ──────────────────────────────────────────────────────

    const totalBanks   = banks.reduce((s, b) => s + Number(b.current_balance), 0);
    const totalCards   = cards.reduce((s, c) => s + Number(c.outstanding_balance), 0);
    const totalWallets = wallets.reduce((s, w) => s + Number(w.balance), 0);
    const netWorth     = totalBanks + totalWallets - totalCards;

    // ── Bank handlers ───────────────────────────────────────────────────────

    const openAddBank = () => {
        setEditingBank(null);
        setBankForm(emptyBankForm());
        setShowBankModal(true);
    };

    const openEditBank = (b: BankAccount) => {
        setEditingBank(b);
        setBankForm({
            name:             b.name,
            account_type:     b.account_type || 'Savings',
            last_four:        b.last_four || '',
            starting_balance: String(b.starting_balance),
            balance_as_of:    b.balance_as_of ? String(b.balance_as_of).split('T')[0] : '',
        });
        setShowBankModal(true);
    };

    const saveBank = async () => {
        if (!bankForm.name.trim()) return;
        setSaving(true);
        try {
            const data = {
                name:             bankForm.name.trim(),
                account_type:     bankForm.account_type,
                last_four:        bankForm.last_four || null,
                starting_balance: parseFloat(bankForm.starting_balance) || 0,
                balance_as_of:    bankForm.balance_as_of || null,
            };
            if (editingBank) {
                await accountsAPI.update(editingBank.id, data);
            } else {
                await accountsAPI.create(data);
            }
            await fetchAll();
            setShowBankModal(false);
            showToast(editingBank ? 'Account updated' : 'Account added');
        } catch { showToast('Failed to save account'); }
        setSaving(false);
    };

    // ── Credit card handlers ────────────────────────────────────────────────

    const openAddCard = () => {
        setEditingCard(null);
        setCardForm(emptyCardForm());
        setShowCardModal(true);
    };

    const openEditCard = (c: CreditCard) => {
        setEditingCard(c);
        setCardForm({
            bank_name:           c.bank_name,
            card_name:           c.card_name,
            last_four:           c.last_four || '',
            credit_limit:        String(c.credit_limit),
            outstanding_balance: String(c.outstanding_balance),
            billing_date:        c.billing_date ? String(c.billing_date) : '',
            due_days:            String(c.due_days),
            network:             c.network,
            color:               c.color,
        });
        setShowCardModal(true);
    };

    const saveCard = async () => {
        if (!cardForm.bank_name.trim() || !cardForm.card_name.trim()) return;
        setSaving(true);
        try {
            const data = {
                bank_name:           cardForm.bank_name.trim(),
                card_name:           cardForm.card_name.trim(),
                last_four:           cardForm.last_four || null,
                credit_limit:        parseFloat(cardForm.credit_limit) || 0,
                outstanding_balance: parseFloat(cardForm.outstanding_balance) || 0,
                billing_date:        parseInt(cardForm.billing_date) || null,
                due_days:            parseInt(cardForm.due_days) || 20,
                network:             cardForm.network,
                color:               cardForm.color,
            };
            if (editingCard) {
                await creditCardsAPI.update(editingCard.id, data);
            } else {
                await creditCardsAPI.create(data);
            }
            await fetchAll();
            setShowCardModal(false);
            showToast(editingCard ? 'Card updated' : 'Card added');
        } catch { showToast('Failed to save card'); }
        setSaving(false);
    };

    // ── Wallet handlers ─────────────────────────────────────────────────────

    const openAddWallet = () => {
        setEditingWallet(null);
        setWalletForm(emptyWalletForm());
        setShowWalletModal(true);
    };

    const openEditWallet = (w: Wallet) => {
        setEditingWallet(w);
        setWalletForm({ name: w.name, emoji: w.emoji, balance: String(w.balance) });
        setShowWalletModal(true);
    };

    const saveWallet = async () => {
        if (!walletForm.name.trim()) return;
        setSaving(true);
        try {
            const data = {
                name:    walletForm.name.trim(),
                emoji:   walletForm.emoji,
                balance: parseFloat(walletForm.balance) || 0,
            };
            if (editingWallet) {
                await walletsAPI.update(editingWallet.id, data);
            } else {
                await walletsAPI.create(data);
            }
            await fetchAll();
            setShowWalletModal(false);
            showToast(editingWallet ? 'Wallet updated' : 'Wallet added');
        } catch { showToast('Failed to save wallet'); }
        setSaving(false);
    };

    const startWalletBalanceEdit = (w: Wallet) => {
        setEditingWalletBalanceId(w.id);
        setWalletBalanceInput(String(w.balance));
    };

    const saveWalletBalance = async (w: Wallet) => {
        try {
            await walletsAPI.update(w.id, { name: w.name, emoji: w.emoji, balance: parseFloat(walletBalanceInput) || 0 });
            await fetchAll();
        } catch { showToast('Failed to update balance'); }
        setEditingWalletBalanceId(null);
    };

    // ── Delete ──────────────────────────────────────────────────────────────

    const confirmDelete = (type: 'bank' | 'card' | 'wallet', id: number, name: string) => {
        setDeleteConfirm({ type, id, name });
    };

    const executeDelete = async () => {
        if (!deleteConfirm) return;
        try {
            if      (deleteConfirm.type === 'bank')   await accountsAPI.delete(deleteConfirm.id);
            else if (deleteConfirm.type === 'card')   await creditCardsAPI.delete(deleteConfirm.id);
            else                                       await walletsAPI.delete(deleteConfirm.id);
            await fetchAll();
            showToast('Deleted');
        } catch { showToast('Failed to delete'); }
        setDeleteConfirm(null);
    };

    // ── Shared inline styles ────────────────────────────────────────────────

    const inputStyle: React.CSSProperties = {
        width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)',
        borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14,
        outline: 'none', boxSizing: 'border-box', fontFamily: 'Satoshi, DM Sans, sans-serif',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px',
        textTransform: 'uppercase', marginBottom: 6, display: 'block',
    };
    const ghostBtn: React.CSSProperties = {
        width: '100%', padding: 12, border: '1px dashed var(--bg-border-strong)',
        borderRadius: 10, background: 'transparent', color: 'var(--text-muted)', fontSize: 13,
        fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    };
    const sectionHead: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
    };
    const sectionTitle: React.CSSProperties = {
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1.5px',
        textTransform: 'uppercase', fontFamily: 'Satoshi, DM Sans, sans-serif',
    };
    const modalOverlay: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    };
    const modalBox: React.CSSProperties = {
        background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 16,
        width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex',
        flexDirection: 'column', zIndex: 10000,
    };
    const modalHeader: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px', borderBottom: '1px solid var(--bg-border)', flexShrink: 0,
    };
    const modalFooter: React.CSSProperties = {
        padding: '16px 24px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: 8,
    };
    const cancelBtn: React.CSSProperties = {
        flex: 1, padding: 10, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)',
        borderRadius: 10, color: 'var(--text-secondary)', fontSize: 14,
        fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: 'pointer', fontWeight: 600,
    };
    const iconBtn: React.CSSProperties = {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: 4, display: 'flex',
    };

    if (isLoading) return null;

    return (
        <AppLayout>
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 120px' }}>

                {/* Toast */}
                {toast && mounted && createPortal(
                    <div style={{
                        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                        color: 'var(--text-primary)', padding: '10px 20px', borderRadius: 10,
                        fontSize: 13, fontFamily: 'Satoshi, DM Sans, sans-serif',
                        zIndex: 20000, whiteSpace: 'nowrap',
                    }}>
                        {toast}
                    </div>,
                    document.body
                )}

                {/* ── Header ── */}
                <div style={{ marginBottom: 32 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                        Accounts
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>
                        All your money in one place
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'Satoshi, DM Sans, sans-serif', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 600 }}>
                        Net Worth
                    </p>
                    <span style={{
                        fontSize: 40, fontFamily: 'DM Mono, monospace', fontWeight: 500,
                        color: netWorth >= 0 ? 'var(--accent-mint)' : 'var(--accent-rose)',
                        letterSpacing: '-1px',
                    }}>
                        {netWorth < 0 ? '-' : ''}{fmt(netWorth)}
                    </span>
                </div>

                {/* ── Bank Accounts ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Bank Accounts</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-mint)' }}>
                            {fmt(totalBanks)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {banks.map(b => (
                            <div key={b.id} style={{
                                display: 'flex', alignItems: 'center',
                                background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                borderRadius: 12, overflow: 'hidden',
                                borderLeft: `4px solid ${b.color || 'var(--accent-indigo)'}`,
                            }}>
                                <div style={{ flex: 1, padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>
                                            {b.name}
                                        </span>
                                        <span style={{
                                            fontSize: 10, padding: '2px 7px',
                                            background: 'var(--bg-hover)', borderRadius: 4,
                                            color: 'var(--text-secondary)',
                                            fontFamily: 'Satoshi, DM Sans, sans-serif', fontWeight: 500,
                                        }}>
                                            {b.account_type || 'Savings'}
                                        </span>
                                    </div>
                                    {b.last_four && (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                                            ••••&nbsp;&nbsp;{b.last_four}
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
                                    <span style={{ fontSize: 15, fontFamily: 'DM Mono, monospace', fontWeight: 500, color: 'var(--text-primary)' }}>
                                        {fmt(b.current_balance)}
                                    </span>
                                    <button style={iconBtn} onClick={() => openEditBank(b)}><Pencil size={14} /></button>
                                    <button style={iconBtn} onClick={() => confirmDelete('bank', b.id, b.name)}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <button style={ghostBtn} onClick={openAddBank}><Plus size={14} />Add Bank Account</button>
                    </div>
                </div>

                {/* ── Credit Cards ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Credit Cards</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-rose)' }}>
                            {fmt(totalCards)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cards.map(c => {
                            const dueDays  = getDueDays(c.billing_date, c.due_days);
                            const utilPct  = c.credit_limit > 0
                                ? Math.min(100, (Number(c.outstanding_balance) / Number(c.credit_limit)) * 100)
                                : 0;
                            const isExpanded = expandedCardId === c.id;

                            const pillColor = dueDays === null ? 'var(--text-muted)'
                                : dueDays > 7  ? 'var(--accent-mint)'
                                : dueDays >= 3 ? 'var(--accent-amber)'
                                :                'var(--accent-rose)';
                            const pillBg = dueDays === null ? 'var(--bg-hover)'
                                : dueDays > 7  ? 'var(--accent-mint-bg)'
                                : dueDays >= 3 ? 'var(--accent-amber-bg)'
                                :                'var(--accent-rose-bg)';

                            return (
                                <div key={c.id} style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                    borderRadius: 12, overflow: 'hidden',
                                    borderLeft: `4px solid ${c.color}`,
                                }}>
                                    {/* Card row — tapping expands */}
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 8px', cursor: 'pointer' }}
                                        onClick={() => setExpandedCardId(isExpanded ? null : c.id)}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>
                                                    {c.bank_name} {c.card_name}
                                                </span>
                                                {c.last_four && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                                                        ••{c.last_four}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 15, fontFamily: 'DM Mono, monospace', fontWeight: 500, color: 'var(--accent-rose)' }}>
                                                    {fmt(c.outstanding_balance)}
                                                </span>
                                                {dueDays !== null && (
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 7px', borderRadius: 999,
                                                        background: pillBg, color: pillColor,
                                                        fontFamily: 'Satoshi, DM Sans, sans-serif', fontWeight: 600,
                                                    }}>
                                                        {dueDays < 0 ? 'Overdue' : dueDays === 0 ? 'Due today' : `Due in ${dueDays}d`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <button
                                                style={iconBtn}
                                                onClick={e => { e.stopPropagation(); openEditCard(c); }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                style={iconBtn}
                                                onClick={e => { e.stopPropagation(); confirmDelete('card', c.id, `${c.bank_name} ${c.card_name}`); }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            {isExpanded
                                                ? <ChevronUp size={14} color="var(--text-muted)" />
                                                : <ChevronDown size={14} color="var(--text-muted)" />
                                            }
                                        </div>
                                    </div>

                                    {/* Utilization bar */}
                                    <div style={{ height: 3, background: 'var(--bg-hover)', margin: '0 14px 10px' }}>
                                        <div style={{
                                            height: '100%', width: `${utilPct}%`,
                                            background: 'var(--accent-rose)', borderRadius: 2,
                                            transition: 'width 0.3s ease',
                                        }} />
                                    </div>

                                    {/* Expanded details */}
                                    {isExpanded && (
                                        <div style={{ padding: '8px 14px 14px', borderTop: '1px solid var(--bg-border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>Credit Limit</span>
                                                <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{fmt(c.credit_limit)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>Utilization</span>
                                                <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: utilPct > 70 ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
                                                    {utilPct.toFixed(0)}%
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => openEditCard(c)}
                                                style={{
                                                    width: '100%', padding: 9,
                                                    background: 'var(--bg-hover)', border: '1px solid var(--bg-border)',
                                                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                                                    fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: 'pointer', fontWeight: 500,
                                                }}
                                            >
                                                Update Outstanding
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <button style={ghostBtn} onClick={openAddCard}><Plus size={14} />Add Credit Card</button>
                    </div>
                </div>

                {/* ── Wallets ── */}
                <div style={{ marginBottom: 36 }}>
                    <div style={sectionHead}>
                        <span style={sectionTitle}>Wallets & UPI</span>
                        <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--accent-mint)' }}>
                            {fmt(totalWallets)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {wallets.map(w => (
                            <div key={w.id} style={{
                                display: 'flex', alignItems: 'center',
                                background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                borderRadius: 12, padding: '14px',
                            }}>
                                <span style={{ fontSize: 22, marginRight: 12 }}>{w.emoji}</span>
                                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>
                                    {w.name}
                                </span>
                                {editingWalletBalanceId === w.id ? (
                                    <input
                                        autoFocus
                                        type="number"
                                        value={walletBalanceInput}
                                        onChange={e => setWalletBalanceInput(e.target.value)}
                                        onBlur={() => saveWalletBalance(w)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter')  saveWalletBalance(w);
                                            if (e.key === 'Escape') setEditingWalletBalanceId(null);
                                        }}
                                        style={{
                                            width: 100, textAlign: 'right',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--accent-indigo)',
                                            borderRadius: 6, padding: '4px 8px',
                                            color: 'var(--text-primary)', fontSize: 14,
                                            fontFamily: 'DM Mono, monospace', outline: 'none',
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => startWalletBalanceEdit(w)}
                                        title="Tap to edit balance"
                                        style={{
                                            fontSize: 15, fontFamily: 'DM Mono, monospace',
                                            fontWeight: 500, color: 'var(--text-primary)',
                                            cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                                        }}
                                    >
                                        {fmt(w.balance)}
                                    </span>
                                )}
                                <button style={{ ...iconBtn, marginLeft: 8 }} onClick={() => openEditWallet(w)}><Pencil size={14} /></button>
                                <button style={iconBtn} onClick={() => confirmDelete('wallet', w.id, w.name)}><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <button style={ghostBtn} onClick={openAddWallet}><Plus size={14} />Add Wallet</button>
                    </div>
                </div>

                {/* ═══════════════════ MODALS ═══════════════════ */}

                {/* Bank Account Modal */}
                {showBankModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowBankModal(false)}>
                        <div style={modalBox} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingBank ? 'Edit Account' : 'Add Bank Account'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowBankModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Account Name *</label>
                                    <input style={inputStyle} value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Savings" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Account Type</label>
                                    <select style={inputStyle} value={bankForm.account_type} onChange={e => setBankForm(f => ({ ...f, account_type: e.target.value }))}>
                                        {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Last 4 Digits (optional)</label>
                                    <input style={inputStyle} value={bankForm.last_four} maxLength={4} placeholder="1234"
                                        onChange={e => setBankForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Current Balance (₹)</label>
                                    <input style={inputStyle} type="number" value={bankForm.starting_balance} onChange={e => setBankForm(f => ({ ...f, starting_balance: e.target.value }))} placeholder="0" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Balance As Of (optional)</label>
                                    <input style={inputStyle} type="date" value={bankForm.balance_as_of} onChange={e => setBankForm(f => ({ ...f, balance_as_of: e.target.value }))} />
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowBankModal(false)}>Cancel</button>
                                <button
                                    onClick={saveBank}
                                    disabled={saving || !bankForm.name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !bankForm.name.trim() ? 'var(--bg-border)' : 'var(--accent-indigo)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingBank ? 'Save Changes' : 'Add Account'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Credit Card Modal */}
                {showCardModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowCardModal(false)}>
                        <div style={modalBox} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingCard ? 'Edit Card' : 'Add Credit Card'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowCardModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Bank Name *</label>
                                        <input style={inputStyle} value={cardForm.bank_name} onChange={e => setCardForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="HDFC" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Card Name *</label>
                                        <input style={inputStyle} value={cardForm.card_name} onChange={e => setCardForm(f => ({ ...f, card_name: e.target.value }))} placeholder="Millennia" />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Last 4 Digits</label>
                                        <input style={inputStyle} value={cardForm.last_four} maxLength={4} placeholder="5678"
                                            onChange={e => setCardForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Network</label>
                                        <select style={inputStyle} value={cardForm.network} onChange={e => setCardForm(f => ({ ...f, network: e.target.value }))}>
                                            {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Credit Limit (₹)</label>
                                        <input style={inputStyle} type="number" value={cardForm.credit_limit} onChange={e => setCardForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="100000" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Outstanding (₹)</label>
                                        <input style={inputStyle} type="number" value={cardForm.outstanding_balance} onChange={e => setCardForm(f => ({ ...f, outstanding_balance: e.target.value }))} placeholder="0" />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Billing Date (1–28)</label>
                                        <input style={inputStyle} type="number" min={1} max={28} value={cardForm.billing_date} onChange={e => setCardForm(f => ({ ...f, billing_date: e.target.value }))} placeholder="5" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Due Days After</label>
                                        <input style={inputStyle} type="number" value={cardForm.due_days} onChange={e => setCardForm(f => ({ ...f, due_days: e.target.value }))} placeholder="20" />
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Card Color</label>
                                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                        {CARD_COLORS.map(col => (
                                            <button
                                                key={col}
                                                onClick={() => setCardForm(f => ({ ...f, color: col }))}
                                                style={{ width: 28, height: 28, borderRadius: '50%', background: col, border: cardForm.color === col ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowCardModal(false)}>Cancel</button>
                                <button
                                    onClick={saveCard}
                                    disabled={saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !cardForm.bank_name.trim() || !cardForm.card_name.trim() ? 'var(--bg-border)' : 'var(--accent-indigo)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingCard ? 'Save Changes' : 'Add Card'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Wallet Modal */}
                {showWalletModal && mounted && createPortal(
                    <div style={modalOverlay} onClick={() => setShowWalletModal(false)}>
                        <div style={{ ...modalBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                            <div style={modalHeader}>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                    {editingWallet ? 'Edit Wallet' : 'Add Wallet'}
                                </span>
                                <button style={{ background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }} onClick={() => setShowWalletModal(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Emoji</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                        {WALLET_EMOJIS.map(em => (
                                            <button
                                                key={em}
                                                onClick={() => setWalletForm(f => ({ ...f, emoji: em }))}
                                                style={{ fontSize: 22, background: walletForm.emoji === em ? 'var(--bg-hover)' : 'transparent', border: `2px solid ${walletForm.emoji === em ? 'var(--accent-indigo)' : 'transparent'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
                                            >
                                                {em}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Wallet Name *</label>
                                    <input style={inputStyle} value={walletForm.name} onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))} placeholder="PhonePe, Paytm, Cash…" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Balance (₹)</label>
                                    <input style={inputStyle} type="number" value={walletForm.balance} onChange={e => setWalletForm(f => ({ ...f, balance: e.target.value }))} placeholder="0" />
                                </div>
                            </div>
                            <div style={modalFooter}>
                                <button style={cancelBtn} onClick={() => setShowWalletModal(false)}>Cancel</button>
                                <button
                                    onClick={saveWallet}
                                    disabled={saving || !walletForm.name.trim()}
                                    style={{ flex: 2, padding: 10, background: saving || !walletForm.name.trim() ? 'var(--bg-border)' : 'var(--accent-indigo)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontFamily: 'Satoshi, DM Sans, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                                >
                                    {saving ? 'Saving…' : editingWallet ? 'Save Changes' : 'Add Wallet'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Delete Confirm */}
                {deleteConfirm && mounted && createPortal(
                    <>
                        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)' }} />
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 14, padding: 28, zIndex: 10000, width: 340, maxWidth: '90vw' }}>
                            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'Cabinet Grotesk, Sora, sans-serif' }}>
                                Delete {deleteConfirm.name}?
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>
                                This action cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>Cancel</button>
                                <button onClick={executeDelete} style={{ flex: 1, background: 'var(--accent-rose)', border: 'none', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'Satoshi, DM Sans, sans-serif' }}>Delete</button>
                            </div>
                        </div>
                    </>,
                    document.body
                )}

            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Step 3: Smoke test in browser**

Navigate to `http://localhost:3000/accounts`. You should see:
- The "Accounts" header with "Net Worth" (₹0 if no data yet)
- Three section headings: Bank Accounts, Credit Cards, Wallets & UPI
- Three ghost "+ Add …" buttons
- Clicking each button opens a modal with the correct fields

- [ ] **Step 4: Commit**

```bash
git add frontend/app/accounts/page.tsx
git commit -m "feat: unified accounts page with bank, credit card, and wallet groups"
```

---

## Task 9: Add Accounts to Sidebar

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Wallet to the import**

Find the existing lucide-react import line:
```ts
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    TrendingUp, LogOut, CalendarDays, RefreshCw,
    Settings, Flag, FileText, Sparkles, Users, Brain, CalendarClock,
    ChevronLeft, ChevronRight, FolderOpen, MessageSquare, Receipt, Banknote,
} from 'lucide-react';
```

Add `Wallet` to it:
```ts
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    TrendingUp, LogOut, CalendarDays, RefreshCw,
    Settings, Flag, FileText, Sparkles, Users, Brain, CalendarClock,
    ChevronLeft, ChevronRight, FolderOpen, MessageSquare, Receipt, Banknote,
    Wallet,
} from 'lucide-react';
```

- [ ] **Step 2: Add Accounts entry to navItems**

Find:
```ts
const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
```

Add the Accounts item after Transactions:
```ts
const navItems = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/accounts',     icon: Wallet,          label: 'Accounts' },
```

- [ ] **Step 3: Verify in browser**

The sidebar should now show a Wallet icon between Transactions and Calendar, labelled "Accounts" when expanded. Clicking it navigates to `/accounts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx
git commit -m "feat: add Accounts nav item to sidebar"
```

---

## Task 10: Add Accounts to BottomNav More sheet

**Files:**
- Modify: `frontend/components/layout/BottomNav.tsx`

- [ ] **Step 1: Add Wallet to the import**

Find:
```ts
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    CalendarDays, Target, Trophy, BarChart2, RefreshCw, Settings, X, LogOut,
    Users, FolderOpen, ChevronRight, TrendingUp, Brain, MessageSquare,
    Receipt, Banknote,
} from 'lucide-react';
```

Add `Wallet`:
```ts
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    CalendarDays, Target, Trophy, BarChart2, RefreshCw, Settings, X, LogOut,
    Users, FolderOpen, ChevronRight, TrendingUp, Brain, MessageSquare,
    Receipt, Banknote, Wallet,
} from 'lucide-react';
```

- [ ] **Step 2: Add Accounts to the FINANCE section**

Find the FINANCE section in `moreSections`:
```ts
{
    label: 'FINANCE',
    items: [
        { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
        { href: '/budgets',  icon: Target,       label: 'Budgets' },
        { href: '/goals',    icon: Trophy,       label: 'Goals' },
        { href: '/reports',  icon: BarChart2,    label: 'Reports' },
    ],
},
```

Add Accounts as the first item:
```ts
{
    label: 'FINANCE',
    items: [
        { href: '/accounts', icon: Wallet,      label: 'Accounts' },
        { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
        { href: '/budgets',  icon: Target,       label: 'Budgets' },
        { href: '/goals',    icon: Trophy,       label: 'Goals' },
        { href: '/reports',  icon: BarChart2,    label: 'Reports' },
    ],
},
```

- [ ] **Step 3: Verify on mobile viewport**

Open DevTools, set to mobile viewport, navigate to any page. Tap "More". The sheet should show Accounts at the top of the FINANCE section with a Wallet icon. Tapping it closes the sheet and navigates to `/accounts`.

- [ ] **Step 4: Final commit and push**

```bash
git add frontend/components/layout/BottomNav.tsx
git commit -m "feat: add Accounts to BottomNav More sheet"
git add .
git commit -m "feat: unified accounts page grouped by type — bank, credit cards, wallets"
git push
```

---

## Self-Review Checklist

| Spec requirement | Covered in task |
|-----------------|----------------|
| credit_cards table | Task 1 |
| wallets table | Task 2 |
| account_type + last_four on bank_accounts | Task 3 |
| /api/credit-cards CRUD | Task 4 |
| /api/wallets CRUD | Task 5 |
| Route registration in index.js | Task 6 |
| creditCardsAPI + walletsAPI in api.ts | Task 7 |
| Net worth header (bank + wallet − cards) | Task 8 (page header) |
| Bank group: left border, type pill, masked number, balance | Task 8 |
| Credit card group: outstanding, due pill, utilization bar, expand | Task 8 |
| Wallet group: emoji, inline balance edit | Task 8 |
| Three add/edit modals via createPortal | Task 8 |
| Delete confirm dialog via createPortal | Task 8 |
| No tabs anywhere | Task 8 (single scroll) |
| Sidebar Accounts item | Task 9 |
| BottomNav Accounts item in FINANCE | Task 10 |
| One-Time Expenses nav unchanged | No change needed — already in place |
| Existing /api/accounts route untouched | Tasks 1–7 — never touch accounts.js |

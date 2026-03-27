# Expense Groups with Integrated Bill Splitting

**Date**: 2026-03-26
**Feature**: Expense Groups — separate from the existing Splits feature
**Commit**: `feat: expense groups with integrated bill splitting and settlement`

---

## Overview

Build a complete Expense Groups feature: users create named groups (with emoji, budget, members), link existing transactions to a group, log group splits (with per-member custom/equal shares), and settle debts via a greedy debt-simplification algorithm.

---

## Task 1 — DB Migration

**File**: `backend/src/db/migrations/005_expense_groups.sql`

```sql
-- Add group_id to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id INTEGER;

CREATE TABLE IF NOT EXISTS expense_groups (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '👥',
    description TEXT,
    budget      NUMERIC(12,2),
    currency    TEXT NOT NULL DEFAULT 'INR',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
    id         SERIAL PRIMARY KEY,
    group_id   INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_splits (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    paid_by     TEXT NOT NULL,
    date        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_split_shares (
    id        SERIAL PRIMARY KEY,
    split_id  INTEGER NOT NULL REFERENCES group_splits(id) ON DELETE CASCADE,
    member    TEXT NOT NULL,
    amount    NUMERIC(12,2) NOT NULL,
    settled   BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_expense_groups_user ON expense_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_splits_group  ON group_splits(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group  ON transactions(group_id);
```

**Run**: `psql $DATABASE_URL -f backend/src/db/migrations/005_expense_groups.sql`

---

## Task 2 — Backend Route

**File**: `backend/src/routes/groups.js`

```javascript
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/groups — list all groups with stats
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id AND t.user_id = $1) AS total_spent
             FROM expense_groups g
             WHERE g.user_id = $1
             ORDER BY g.created_at DESC`,
            [req.user.id]
        );
        res.json({ groups: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/groups — create group
router.post('/', async (req, res) => {
    try {
        const { name, emoji = '👥', description, budget, currency = 'INR', members = [] } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `INSERT INTO expense_groups (user_id, name, emoji, description, budget, currency)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [req.user.id, name, emoji, description || null, budget || null, currency]
            );
            const group = rows[0];
            if (members.length) {
                for (const m of members) {
                    await client.query(
                        `INSERT INTO group_members (group_id, name, email) VALUES ($1,$2,$3)`,
                        [group.id, m.name, m.email || null]
                    );
                }
            }
            await client.query('COMMIT');
            // Fetch with member_count
            const full = await pool.query(
                `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count, 0 AS total_spent
                 FROM expense_groups g WHERE g.id = $1`, [group.id]
            );
            res.status(201).json({ group: full.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// GET /api/groups/:id — group detail with members, transactions, splits
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id AND t.user_id = $1) AS total_spent
             FROM expense_groups g WHERE g.id = $2 AND g.user_id = $1`,
            [req.user.id, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const [members, transactions, splits] = await Promise.all([
            pool.query(`SELECT * FROM group_members WHERE group_id = $1 ORDER BY name`, [req.params.id]),
            pool.query(`SELECT * FROM transactions WHERE group_id = $1 AND user_id = $2 ORDER BY date DESC`, [req.params.id, req.user.id]),
            pool.query(`SELECT gs.*, json_agg(gss ORDER BY gss.id) AS shares
                        FROM group_splits gs
                        JOIN group_split_shares gss ON gss.split_id = gs.id
                        WHERE gs.group_id = $1
                        GROUP BY gs.id ORDER BY gs.date DESC`, [req.params.id]),
        ]);

        res.json({
            group: rows[0],
            members: members.rows,
            transactions: transactions.rows,
            splits: splits.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch group' });
    }
});

// PATCH /api/groups/:id — update group
router.patch('/:id', async (req, res) => {
    try {
        const { name, emoji, description, budget, currency, members } = req.body;
        const { rows } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE expense_groups SET
                    name = COALESCE($1, name), emoji = COALESCE($2, emoji),
                    description = COALESCE($3, description), budget = COALESCE($4, budget),
                    currency = COALESCE($5, currency), updated_at = NOW()
                 WHERE id = $6`,
                [name, emoji, description, budget, currency, req.params.id]
            );
            if (Array.isArray(members)) {
                await client.query(`DELETE FROM group_members WHERE group_id = $1`, [req.params.id]);
                for (const m of members) {
                    await client.query(
                        `INSERT INTO group_members (group_id, name, email) VALUES ($1,$2,$3)`,
                        [req.params.id, m.name, m.email || null]
                    );
                }
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        const updated = await pool.query(
            `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id AND t.user_id = $1) AS total_spent
             FROM expense_groups g WHERE g.id = $2`,
            [req.user.id, req.params.id]
        );
        res.json({ group: updated.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// DELETE /api/groups/:id
router.delete('/:id', async (req, res) => {
    try {
        // Unlink transactions first
        await pool.query(`UPDATE transactions SET group_id = NULL WHERE group_id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
        const { rowCount } = await pool.query(
            `DELETE FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Group not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// POST /api/groups/:id/transactions/:txId — link transaction to group
router.post('/:id/transactions/:txId', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE transactions SET group_id = $1 WHERE id = $2 AND user_id = $3`,
            [req.params.id, req.params.txId, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to link transaction' });
    }
});

// DELETE /api/groups/:id/transactions/:txId — unlink transaction
router.delete('/:id/transactions/:txId', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE transactions SET group_id = NULL WHERE id = $1 AND user_id = $2 AND group_id = $3`,
            [req.params.txId, req.user.id, req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Transaction not found in group' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to unlink transaction' });
    }
});

// POST /api/groups/:id/splits — add a split to the group
router.post('/:id/splits', async (req, res) => {
    try {
        const { description, total_amount, paid_by, date, shares } = req.body;
        if (!description || !total_amount || !paid_by || !shares || !Array.isArray(shares)) {
            return res.status(400).json({ error: 'description, total_amount, paid_by, and shares are required' });
        }
        // Verify group ownership
        const { rows } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const splitResult = await client.query(
                `INSERT INTO group_splits (group_id, description, total_amount, paid_by, date)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [req.params.id, description, total_amount, paid_by, date || new Date().toISOString().split('T')[0]]
            );
            const split = splitResult.rows[0];
            for (const s of shares) {
                await client.query(
                    `INSERT INTO group_split_shares (split_id, member, amount) VALUES ($1,$2,$3)`,
                    [split.id, s.member, s.amount]
                );
            }
            await client.query('COMMIT');
            // Return split with shares
            const full = await pool.query(
                `SELECT gs.*, json_agg(gss ORDER BY gss.id) AS shares
                 FROM group_splits gs JOIN group_split_shares gss ON gss.split_id = gs.id
                 WHERE gs.id = $1 GROUP BY gs.id`, [split.id]
            );
            res.status(201).json({ split: full.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create split' });
    }
});

// PATCH /api/groups/:id/splits/:splitId/shares/:shareId/settle — toggle settle
router.patch('/:id/splits/:splitId/shares/:shareId/settle', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT gss.id, gss.settled FROM group_split_shares gss
             JOIN group_splits gs ON gs.id = gss.split_id
             JOIN expense_groups g ON g.id = gs.group_id
             WHERE gss.id = $1 AND gs.id = $2 AND g.id = $3 AND g.user_id = $4`,
            [req.params.shareId, req.params.splitId, req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Share not found' });

        const newSettled = !rows[0].settled;
        const updated = await pool.query(
            `UPDATE group_split_shares SET settled = $1, settled_at = $2 WHERE id = $3 RETURNING *`,
            [newSettled, newSettled ? new Date() : null, req.params.shareId]
        );
        res.json({ share: updated.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to toggle settlement' });
    }
});

// GET /api/groups/:id/settlements — greedy debt simplification
router.get('/:id/settlements', async (req, res) => {
    try {
        const { rows: group } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!group.length) return res.status(404).json({ error: 'Group not found' });

        const { rows: shares } = await pool.query(
            `SELECT gss.member, gs.paid_by, gss.amount, gss.settled
             FROM group_split_shares gss
             JOIN group_splits gs ON gs.id = gss.split_id
             WHERE gs.group_id = $1 AND gss.settled = FALSE`,
            [req.params.id]
        );

        // Build net balance map: positive = owed money, negative = owes money
        const balance = {};
        for (const s of shares) {
            if (s.member === s.paid_by) continue;
            balance[s.paid_by] = (balance[s.paid_by] || 0) + parseFloat(s.amount);
            balance[s.member]  = (balance[s.member]  || 0) - parseFloat(s.amount);
        }

        // Greedy simplification
        const creditors = Object.entries(balance).filter(([,v]) => v > 0).map(([n,v]) => ({ name: n, amount: v }));
        const debtors   = Object.entries(balance).filter(([,v]) => v < 0).map(([n,v]) => ({ name: n, amount: -v }));
        creditors.sort((a,b) => b.amount - a.amount);
        debtors.sort((a,b) => b.amount - a.amount);

        const transactions = [];
        let ci = 0, di = 0;
        while (ci < creditors.length && di < debtors.length) {
            const settle = Math.min(creditors[ci].amount, debtors[di].amount);
            transactions.push({ from: debtors[di].name, to: creditors[ci].name, amount: parseFloat(settle.toFixed(2)) });
            creditors[ci].amount -= settle;
            debtors[di].amount   -= settle;
            if (creditors[ci].amount < 0.01) ci++;
            if (debtors[di].amount   < 0.01) di++;
        }

        res.json({ settlements: transactions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to calculate settlements' });
    }
});

module.exports = router;
```

---

## Task 3 — Register Route in index.js

**File**: `backend/src/index.js`
After line `app.use('/api/splits', require('./routes/splits'));`, add:

```javascript
app.use('/api/groups', require('./routes/groups'));
```

---

## Task 4 — Frontend API Client

**File**: `frontend/lib/api.ts`
Add after `splitsAPI`:

```typescript
export const groupsAPI = {
    getAll: () => api.get('/api/groups'),
    create: (data: { name: string; emoji?: string; description?: string; budget?: number; currency?: string; members?: { name: string; email?: string }[] }) =>
        api.post('/api/groups', data),
    get: (id: string) => api.get(`/api/groups/${id}`),
    update: (id: string, data: object) => api.patch(`/api/groups/${id}`, data),
    delete: (id: string) => api.delete(`/api/groups/${id}`),
    linkTransaction: (id: string, txId: string) => api.post(`/api/groups/${id}/transactions/${txId}`),
    unlinkTransaction: (id: string, txId: string) => api.delete(`/api/groups/${id}/transactions/${txId}`),
    addSplit: (id: string, data: { description: string; total_amount: number; paid_by: string; date?: string; shares: { member: string; amount: number }[] }) =>
        api.post(`/api/groups/${id}/splits`, data),
    settleShare: (id: string, splitId: string, shareId: string) =>
        api.patch(`/api/groups/${id}/splits/${splitId}/shares/${shareId}/settle`),
    settlements: (id: string) => api.get(`/api/groups/${id}/settlements`),
};
```

---

## Task 5 — Sidebar Nav Item

**File**: `frontend/components/layout/Sidebar.tsx`

1. Add `FolderOpen` to the lucide-react import.
2. In `navItems`, add after the Splits entry:

```typescript
{ href: '/groups', icon: FolderOpen, label: 'Groups' },
```

---

## Task 6 — Transaction List Group Badge

**File**: `frontend/components/transactions/TransactionList.tsx`

Find the transaction row JSX (near the description/amount area). After the existing description span, add:

```tsx
{tx.group_name && (
    <span style={{
        fontSize: '0.65rem', fontWeight: 600,
        background: 'rgba(99,102,241,0.12)',
        color: '#818cf8',
        borderRadius: '4px',
        padding: '1px 6px',
        marginLeft: '6px',
        whiteSpace: 'nowrap',
    }}>
        {tx.group_name}
    </span>
)}
```

Also update the `getAll` query in `backend/src/routes/transactions.js` to LEFT JOIN expense_groups and return `g.name AS group_name`:

```javascript
// In the SELECT for /api/transactions GET all:
// Change:
`SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
 FROM transactions t
 LEFT JOIN categories c ON c.id = t.category_id
 WHERE t.user_id = $1 ...`
// To:
`SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
        g.name AS group_name
 FROM transactions t
 LEFT JOIN categories c ON c.id = t.category_id
 LEFT JOIN expense_groups g ON g.id = t.group_id
 WHERE t.user_id = $1 ...`
```

---

## Task 7 — Groups Page

**File**: `frontend/app/groups/page.tsx`

Complete page — list view → click → detail view with 3 tabs.

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { groupsAPI, transactionsAPI } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency } from '@/lib/utils';
import {
    Plus, FolderOpen, Users, X, Check, ChevronRight,
    ArrowLeft, Trash2, PlusCircle, SplitSquareHorizontal,
    Wallet, TrendingDown,
} from 'lucide-react';

const EMOJIS = ['👥','🏠','✈️','🎉','🍕','💼','🏋️','🎮','🛒','💊','📚','🌿'];

// ─── Types ───────────────────────────────────────────────────────────────────
interface Member { id?: number; name: string; email?: string }
interface Group {
    id: number; name: string; emoji: string; description?: string;
    budget?: number; currency: string;
    member_count: number; total_spent: number;
}
interface Transaction { id: number; description: string; amount: number; date: string; type: string; group_name?: string }
interface Share { id: number; member: string; amount: number; settled: boolean }
interface Split { id: number; description: string; total_amount: number; paid_by: string; date: string; shares: Share[] }
interface Settlement { from: string; to: string; amount: number }

export default function GroupsPage() {
    const { user } = useAuthStore();
    const currency = user?.currency || 'INR';

    // List state
    const [groups, setGroups] = useState<Group[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    // Detail state
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [splits, setSplits] = useState<Split[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [activeTab, setActiveTab] = useState<'transactions' | 'splits' | 'settle'>('transactions');
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Create/Edit modal
    const [showModal, setShowModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [formName, setFormName] = useState('');
    const [formEmoji, setFormEmoji] = useState('👥');
    const [formDesc, setFormDesc] = useState('');
    const [formBudget, setFormBudget] = useState('');
    const [formMembers, setFormMembers] = useState<Member[]>([{ name: '' }]);
    const [saving, setSaving] = useState(false);

    // Add Split modal
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [splitDesc, setSplitDesc] = useState('');
    const [splitTotal, setSplitTotal] = useState('');
    const [splitPaidBy, setSplitPaidBy] = useState('');
    const [splitDate, setSplitDate] = useState(new Date().toISOString().split('T')[0]);
    const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
    const [splitCustom, setSplitCustom] = useState<Record<string, string>>({});
    const [savingSplit, setSavingSplit] = useState(false);

    // Add Transaction modal
    const [showTxModal, setShowTxModal] = useState(false);
    const [txSearch, setTxSearch] = useState('');
    const [txResults, setTxResults] = useState<Transaction[]>([]);
    const [linkingTx, setLinkingTx] = useState(false);

    // Load list
    const loadGroups = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await groupsAPI.getAll();
            setGroups(res.data.groups);
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    // Load detail
    const openGroup = useCallback(async (g: Group) => {
        setSelectedGroup(g);
        setActiveTab('transactions');
        setLoadingDetail(true);
        try {
            const res = await groupsAPI.get(String(g.id));
            setMembers(res.data.members);
            setTransactions(res.data.transactions);
            setSplits(res.data.splits);
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const loadSettlements = useCallback(async () => {
        if (!selectedGroup) return;
        const res = await groupsAPI.settlements(String(selectedGroup.id));
        setSettlements(res.data.settlements);
    }, [selectedGroup]);

    useEffect(() => {
        if (activeTab === 'settle') loadSettlements();
    }, [activeTab, loadSettlements]);

    // Open create modal
    const openCreate = () => {
        setEditingGroup(null);
        setFormName(''); setFormEmoji('👥'); setFormDesc(''); setFormBudget('');
        setFormMembers([{ name: '' }]);
        setShowModal(true);
    };

    // Open edit modal
    const openEdit = (g: Group, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingGroup(g);
        setFormName(g.name); setFormEmoji(g.emoji); setFormDesc(g.description || '');
        setFormBudget(g.budget ? String(g.budget) : '');
        setFormMembers(members.length ? members : [{ name: '' }]);
        setShowModal(true);
    };

    const saveGroup = async () => {
        if (!formName.trim()) return;
        setSaving(true);
        const validMembers = formMembers.filter(m => m.name.trim());
        const payload = {
            name: formName.trim(), emoji: formEmoji,
            description: formDesc || undefined,
            budget: formBudget ? parseFloat(formBudget) : undefined,
            currency,
            members: validMembers,
        };
        try {
            if (editingGroup) {
                await groupsAPI.update(String(editingGroup.id), payload);
            } else {
                await groupsAPI.create(payload);
            }
            setShowModal(false);
            await loadGroups();
            if (selectedGroup && editingGroup?.id === selectedGroup.id) {
                await openGroup({ ...selectedGroup, ...payload } as Group);
            }
        } finally {
            setSaving(false);
        }
    };

    const deleteGroup = async (g: Group, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Delete "${g.name}"? Transactions will be unlinked.`)) return;
        await groupsAPI.delete(String(g.id));
        if (selectedGroup?.id === g.id) setSelectedGroup(null);
        await loadGroups();
    };

    // Add split
    const saveSplit = async () => {
        if (!selectedGroup || !splitDesc || !splitTotal || !splitPaidBy) return;
        setSavingSplit(true);
        const allMembers = [...members.map(m => m.name), 'Me'].filter(Boolean);
        let shares: { member: string; amount: number }[];
        if (splitMode === 'equal') {
            const each = parseFloat(splitTotal) / allMembers.length;
            shares = allMembers.map(m => ({ member: m, amount: parseFloat(each.toFixed(2)) }));
        } else {
            shares = allMembers.map(m => ({ member: m, amount: parseFloat(splitCustom[m] || '0') }));
        }
        try {
            await groupsAPI.addSplit(String(selectedGroup.id), {
                description: splitDesc, total_amount: parseFloat(splitTotal),
                paid_by: splitPaidBy, date: splitDate, shares,
            });
            setShowSplitModal(false);
            setSplitDesc(''); setSplitTotal(''); setSplitPaidBy(''); setSplitCustom({});
            await openGroup(selectedGroup);
        } finally {
            setSavingSplit(false);
        }
    };

    // Settle share
    const settleShare = async (split: Split, share: Share) => {
        if (!selectedGroup) return;
        await groupsAPI.settleShare(String(selectedGroup.id), String(split.id), String(share.id));
        await openGroup(selectedGroup);
        if (activeTab === 'settle') await loadSettlements();
    };

    // Link transaction
    const searchTx = async (q: string) => {
        setTxSearch(q);
        if (q.length < 2) { setTxResults([]); return; }
        const res = await transactionsAPI.search(q);
        setTxResults(res.data.transactions || []);
    };

    const linkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        setLinkingTx(true);
        try {
            await groupsAPI.linkTransaction(String(selectedGroup.id), String(tx.id));
            setShowTxModal(false);
            setTxSearch(''); setTxResults([]);
            await openGroup(selectedGroup);
        } finally {
            setLinkingTx(false);
        }
    };

    const unlinkTx = async (tx: Transaction) => {
        if (!selectedGroup) return;
        await groupsAPI.unlinkTransaction(String(selectedGroup.id), String(tx.id));
        await openGroup(selectedGroup);
    };

    // ─── Shared styles ────────────────────────────────────────────────────────
    const card = {
        background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
        borderRadius: '14px', padding: '20px',
    };
    const pill = (active: boolean) => ({
        padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 500,
        border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent-blue)' : 'var(--bg-secondary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        transition: 'all 0.15s',
    });

    // ─── List view ────────────────────────────────────────────────────────────
    if (!selectedGroup) {
        return (
            <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Expense Groups</h1>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Track shared expenses with friends & family</p>
                    </div>
                    <button onClick={openCreate} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'var(--accent-blue)', color: '#fff',
                        border: 'none', borderRadius: '10px', padding: '9px 16px',
                        fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                        <Plus size={15} /> New Group
                    </button>
                </div>

                {loadingList ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Loading…</div>
                ) : groups.length === 0 ? (
                    <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
                        <FolderOpen size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>No groups yet. Create one to start splitting expenses.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {groups.map(g => {
                            const pct = g.budget ? Math.min(100, (g.total_spent / g.budget) * 100) : null;
                            return (
                                <div key={g.id} onClick={() => openGroup(g)} style={{
                                    ...card, cursor: 'pointer', transition: 'border-color 0.15s',
                                    display: 'flex', alignItems: 'center', gap: '16px',
                                }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)'}
                                >
                                    <div style={{ fontSize: '2rem', lineHeight: 1 }}>{g.emoji}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{g.name}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '1px 6px' }}>
                                                {g.member_count} member{g.member_count !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        {pct !== null && (
                                            <div style={{ marginBottom: '4px' }}>
                                                <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '2px', background: pct >= 90 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-yellow)' : 'var(--accent-green)', transition: 'width 0.4s' }} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                    {formatCurrency(g.total_spent, currency)} / {formatCurrency(g.budget!, currency)} budget
                                                </span>
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            Spent: {formatCurrency(g.total_spent, currency)}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                        <button onClick={e => openEdit(g, e)} style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                                            ✏️
                                        </button>
                                        <button onClick={e => deleteGroup(g, e)} style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex', alignItems: 'center' }}>
                                            <Trash2 size={14} />
                                        </button>
                                        <ChevronRight size={18} color="var(--text-muted)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Create/Edit Modal */}
                {showModal && <GroupModal
                    editing={editingGroup}
                    formName={formName} setFormName={setFormName}
                    formEmoji={formEmoji} setFormEmoji={setFormEmoji}
                    formDesc={formDesc} setFormDesc={setFormDesc}
                    formBudget={formBudget} setFormBudget={setFormBudget}
                    formMembers={formMembers} setFormMembers={setFormMembers}
                    saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)}
                />}
            </div>
        );
    }

    // ─── Detail view ──────────────────────────────────────────────────────────
    const allMemberNames = [...members.map(m => m.name), 'Me'];
    const totalSplits = splits.reduce((s, sp) => s + parseFloat(String(sp.total_amount)), 0);
    const unsettledCount = splits.reduce((s, sp) => s + sp.shares.filter(sh => !sh.settled).length, 0);

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
            {/* Back + header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button onClick={() => setSelectedGroup(null)} style={{ background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                    <ArrowLeft size={18} />
                </button>
                <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{selectedGroup.emoji}</span>
                <div>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{selectedGroup.name}</h1>
                    {selectedGroup.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{selectedGroup.description}</p>}
                </div>
                <button onClick={e => openEdit(selectedGroup, e)} style={{ marginLeft: 'auto', background: 'var(--bg-secondary)', border: 'none', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Edit</button>
            </div>

            {/* 4 stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Members', value: String(members.length), icon: <Users size={16} /> },
                    { label: 'Transactions', value: String(transactions.length), icon: <Wallet size={16} /> },
                    { label: 'Total Splits', value: formatCurrency(totalSplits, currency), icon: <SplitSquareHorizontal size={16} /> },
                    { label: 'Unsettled', value: String(unsettledCount), icon: <TrendingDown size={16} />, accent: unsettledCount > 0 },
                ].map(t => (
                    <div key={t.label} style={{ ...card, padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ color: t.accent ? 'var(--accent-red)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
                            {t.icon} {t.label}
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: t.accent ? 'var(--accent-red)' : 'var(--text-primary)' }}>{t.value}</span>
                    </div>
                ))}
            </div>

            {/* Budget bar */}
            {selectedGroup.budget && (
                <div style={{ ...card, marginBottom: '20px', padding: '14px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Budget</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatCurrency(selectedGroup.total_spent, currency)} / {formatCurrency(selectedGroup.budget, currency)}</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100,(selectedGroup.total_spent/selectedGroup.budget)*100)}%`, borderRadius: '3px', background: selectedGroup.total_spent/selectedGroup.budget >= 0.9 ? 'var(--accent-red)' : 'var(--accent-green)', transition: 'width 0.4s' }} />
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['transactions','splits','settle'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={pill(activeTab === t)}>
                        {t === 'transactions' ? 'Transactions' : t === 'splits' ? 'Splits' : 'Settle Up'}
                    </button>
                ))}
            </div>

            {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading…</div>
            ) : (
                <>
                    {/* Transactions tab */}
                    {activeTab === 'transactions' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                <button onClick={() => setShowTxModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '9px', padding: '7px 14px', fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                    <PlusCircle size={14} /> Add Existing
                                </button>
                            </div>
                            {transactions.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transactions linked. Add one above.</div>
                            ) : transactions.map(tx => (
                                <div key={tx.id} style={{ ...card, marginBottom: '8px', display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{tx.description}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tx.date}</p>
                                    </div>
                                    <span style={{ fontWeight: 600, color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)', marginRight: '12px' }}>
                                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                                    </span>
                                    <button onClick={() => unlinkTx(tx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Splits tab */}
                    {activeTab === 'splits' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                <button onClick={() => setShowSplitModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-blue)', border: 'none', borderRadius: '9px', padding: '7px 14px', fontSize: '0.8rem', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>
                                    <Plus size={14} /> Add Split
                                </button>
                            </div>
                            {splits.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No splits yet.</div>
                            ) : splits.map(sp => (
                                <div key={sp.id} style={{ ...card, marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{sp.description}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Paid by {sp.paid_by} · {sp.date}</p>
                                        </div>
                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(sp.total_amount, currency)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {(sp.shares || []).map(sh => (
                                            <div key={sh.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{sh.member}</span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>{formatCurrency(sh.amount, currency)}</span>
                                                <button onClick={() => settleShare(sp, sh)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: sh.settled ? 'rgba(52,211,153,0.1)' : 'var(--bg-hover)', border: 'none', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: sh.settled ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                    {sh.settled ? <><Check size={11} /> Settled</> : 'Settle'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Settle Up tab */}
                    {activeTab === 'settle' && (
                        <div>
                            {settlements.length === 0 ? (
                                <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--accent-green)', fontSize: '0.9rem' }}>
                                    <Check size={28} style={{ marginBottom: '8px' }} />
                                    <p style={{ margin: 0, fontWeight: 600 }}>All settled up!</p>
                                </div>
                            ) : settlements.map((s, i) => (
                                <div key={i} style={{ ...card, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '0.9rem' }}>{s.from}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>owes</span>
                                    <span style={{ fontWeight: 600, color: 'var(--accent-green)', fontSize: '0.9rem' }}>{s.to}</span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(s.amount, currency)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Create/Edit Modal */}
            {showModal && <GroupModal
                editing={editingGroup}
                formName={formName} setFormName={setFormName}
                formEmoji={formEmoji} setFormEmoji={setFormEmoji}
                formDesc={formDesc} setFormDesc={setFormDesc}
                formBudget={formBudget} setFormBudget={setFormBudget}
                formMembers={formMembers} setFormMembers={setFormMembers}
                saving={saving} onSave={saveGroup} onClose={() => setShowModal(false)}
            />}

            {/* Add Split Modal */}
            {showSplitModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowSplitModal(false); }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Add Split</h3>
                            <button onClick={() => setShowSplitModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                        </div>
                        {[
                            { label: 'Description', value: splitDesc, set: setSplitDesc, placeholder: 'Dinner, Uber, etc.' },
                            { label: 'Total Amount', value: splitTotal, set: setSplitTotal, placeholder: '0.00', type: 'number' },
                            { label: 'Date', value: splitDate, set: setSplitDate, type: 'date' },
                        ].map(f => (
                            <div key={f.label} style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type || 'text'} placeholder={f.placeholder}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                            </div>
                        ))}
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Paid By</label>
                            <select value={splitPaidBy} onChange={e => setSplitPaidBy(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                <option value="">Select…</option>
                                {allMemberNames.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Split Mode</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {(['equal','custom'] as const).map(m => (
                                    <button key={m} onClick={() => setSplitMode(m)} style={pill(splitMode === m)}>
                                        {m === 'equal' ? 'Equal' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {splitMode === 'custom' && (
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Custom Amounts</label>
                                {allMemberNames.map(n => (
                                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{n}</span>
                                        <input type="number" value={splitCustom[n] || ''} onChange={e => setSplitCustom(p => ({ ...p, [n]: e.target.value }))}
                                            placeholder="0.00" style={{ width: '90px', padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={saveSplit} disabled={savingSplit || !splitDesc || !splitTotal || !splitPaidBy}
                            style={{ width: '100%', padding: '11px', background: 'var(--accent-blue)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: savingSplit ? 0.6 : 1 }}>
                            {savingSplit ? 'Adding…' : 'Add Split'}
                        </button>
                    </div>
                </div>
            )}

            {/* Add Transaction Modal */}
            {showTxModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    onClick={e => { if (e.target === e.currentTarget) { setShowTxModal(false); setTxSearch(''); setTxResults([]); } }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Link Transaction</h3>
                            <button onClick={() => { setShowTxModal(false); setTxSearch(''); setTxResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                        </div>
                        <input value={txSearch} onChange={e => searchTx(e.target.value)} placeholder="Search transactions…"
                            style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box', marginBottom: '12px' }} />
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {txResults.map(tx => (
                                <div key={tx.id} onClick={() => !linkingTx && linkTx(tx)} style={{ padding: '10px 12px', borderRadius: '9px', cursor: 'pointer', marginBottom: '4px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{tx.description}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tx.date}</p>
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        {formatCurrency(tx.amount, currency)}
                                    </span>
                                </div>
                            ))}
                            {txSearch.length >= 2 && txResults.length === 0 && (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No results found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Group Create/Edit Modal (extracted) ──────────────────────────────────────
function GroupModal({ editing, formName, setFormName, formEmoji, setFormEmoji, formDesc, setFormDesc, formBudget, setFormBudget, formMembers, setFormMembers, saving, onSave, onClose }: {
    editing: Group | null;
    formName: string; setFormName: (v: string) => void;
    formEmoji: string; setFormEmoji: (v: string) => void;
    formDesc: string; setFormDesc: (v: string) => void;
    formBudget: string; setFormBudget: (v: string) => void;
    formMembers: Member[]; setFormMembers: (v: Member[]) => void;
    saving: boolean; onSave: () => void; onClose: () => void;
}) {
    const EMOJIS = ['👥','🏠','✈️','🎉','🍕','💼','🏋️','🎮','🛒','💊','📚','🌿'];

    const addMember = () => setFormMembers([...formMembers, { name: '' }]);
    const removeMember = (i: number) => setFormMembers(formMembers.filter((_, idx) => idx !== i));
    const updateMember = (i: number, field: keyof Member, val: string) => {
        const updated = [...formMembers];
        updated[i] = { ...updated[i], [field]: val };
        setFormMembers(updated);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{editing ? 'Edit Group' : 'New Group'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                </div>

                {/* Emoji picker */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Emoji</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {EMOJIS.map(e => (
                            <button key={e} onClick={() => setFormEmoji(e)} style={{
                                width: '36px', height: '36px', borderRadius: '8px', fontSize: '1.1rem', border: formEmoji === e ? '2px solid var(--accent-blue)' : '1px solid var(--bg-border)',
                                background: formEmoji === e ? 'var(--bg-hover)' : 'var(--bg-secondary)', cursor: 'pointer',
                            }}>{e}</button>
                        ))}
                    </div>
                </div>

                {/* Name */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Name *</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Trip to Goa, Flat Expenses…"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Description */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Description</label>
                    <input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Budget */}
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Budget (optional)</label>
                    <input type="number" value={formBudget} onChange={e => setFormBudget(e.target.value)} placeholder="0.00"
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Members */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Members</label>
                    {formMembers.map((m, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <input value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Name"
                                style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                            <input value={m.email || ''} onChange={e => updateMember(i, 'email', e.target.value)} placeholder="Email (opt)"
                                style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                            {formMembers.length > 1 && (
                                <button onClick={() => removeMember(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                            )}
                        </div>
                    ))}
                    <button onClick={addMember} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.8rem', padding: '2px 0' }}>
                        <Plus size={13} /> Add member
                    </button>
                </div>

                <button onClick={onSave} disabled={saving || !formName.trim()} style={{ width: '100%', padding: '11px', background: 'var(--accent-blue)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Group'}
                </button>
            </div>
        </div>
    );
}
```

---

## Task 8 — Final Commit

```bash
git add backend/src/db/migrations/005_expense_groups.sql \
        backend/src/routes/groups.js \
        backend/src/index.js \
        frontend/lib/api.ts \
        frontend/components/layout/Sidebar.tsx \
        frontend/components/transactions/TransactionList.tsx \
        frontend/app/groups/page.tsx && \
git commit -m "feat: expense groups with integrated bill splitting and settlement" && \
git push
```

---

## Execution Order

1. Run migration SQL
2. Write `backend/src/routes/groups.js`
3. Edit `backend/src/index.js` (register route)
4. Edit `frontend/lib/api.ts` (add groupsAPI)
5. Edit `frontend/components/layout/Sidebar.tsx` (FolderOpen import + nav item)
6. Edit `backend/src/routes/transactions.js` + `frontend/components/transactions/TransactionList.tsx` (group_name join + badge)
7. Write `frontend/app/groups/page.tsx`
8. Commit + push

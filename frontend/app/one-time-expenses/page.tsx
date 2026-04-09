'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/authStore';

const CATEGORIES = ['Travel', 'Event', 'Electronics', 'Medical', 'Education',
  'Home', 'Vehicle', 'Gift', 'Investment', 'Other'];

const CATEGORY_EMOJI: Record<string, string> = {
  Travel: '✈️', Event: '🎉', Electronics: '💻', Medical: '🏥',
  Education: '📚', Home: '🏠', Vehicle: '🚗', Gift: '🎁',
  Investment: '📈', Other: '🧾',
};

const CATEGORY_COLORS: Record<string, string> = {
  Travel: '#3b82f6', Event: '#f59e0b', Electronics: '#8b5cf6', Medical: '#ef4444',
  Education: '#06b6d4', Home: '#10b981', Vehicle: '#f97316', Gift: '#ec4899',
  Investment: '#22c55e', Other: '#a855f7',
};

const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Other'];

function fmt(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const API = process.env.NEXT_PUBLIC_API_URL;

interface ExpenseItem {
  id: string;
  expense_id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  payment_method: string;
  notes?: string;
}

interface OneTimeExpense {
  id: string;
  title: string;
  category: string;
  icon: string;
  color: string;
  notes?: string;
  start_date?: string;
  end_date?: string;
  bank_account_id?: number;
  bank_account_name?: string;
  bank_name?: string;
  total_amount: number;
  item_count: number;
  items: ExpenseItem[];
}

interface Account {
  id: number;
  name: string;
  bank_name?: string;
}

const emptyExpenseForm = () => ({
  title: '',
  category: 'Other',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  bank_account_id: '',
  notes: '',
});

const emptyItemForm = () => ({
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  payment_method: 'Cash',
  category: 'Other',
});

export default function OneTimeExpensesPage() {
  const router = useRouter();
  const { user, isLoading, loadFromStorage } = useAuthStore();

  const [expenses, setExpenses]           = useState<OneTimeExpense[]>([]);
  const [accounts, setAccounts]           = useState<Account[]>([]);
  const [loading, setLoading]             = useState(true);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [itemForm, setItemForm]           = useState(emptyItemForm());
  const [addingItem, setAddingItem]       = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [editingExp, setEditingExp]       = useState<OneTimeExpense | null>(null);
  const [expForm, setExpForm]             = useState(emptyExpenseForm());
  const [savingExp, setSavingExp]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OneTimeExpense | null>(null);
  const [toast, setToast]                 = useState('');
  const [isMobile, setIsMobile]           = useState(false);

  useEffect(() => { loadFromStorage(); }, []);
  useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getHeaders = useCallback(() => {
    const token = useAuthStore.getState().token;
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [eRes, aRes] = await Promise.all([
        fetch(`${API}/api/one-time-expenses`, { headers: getHeaders() }),
        fetch(`${API}/api/accounts`,          { headers: getHeaders() }),
      ]);
      const [eData, aData] = await Promise.all([eRes.json(), aRes.json()]);
      setExpenses(eData.expenses || []);
      setAccounts(aData.accounts  || []);
    } catch (err) {
      console.error(err);
    }
  }, [getHeaders]);

  useEffect(() => {
    if (!user) return;
    fetchAll().finally(() => setLoading(false));
  }, [user, fetchAll]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Parent expense CRUD ───────────────────────────────────────────────────

  const openAddExpense = () => {
    setEditingExp(null);
    setExpForm(emptyExpenseForm());
    setShowModal(true);
  };

  const openEditExpense = (exp: OneTimeExpense, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingExp(exp);
    setExpForm({
      title:          exp.title,
      category:       exp.category,
      start_date:     exp.start_date || '',
      end_date:       exp.end_date   || '',
      bank_account_id: exp.bank_account_id ? String(exp.bank_account_id) : '',
      notes:          exp.notes || '',
    });
    setShowModal(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expForm.title) return;
    setSavingExp(true);
    try {
      const body = {
        title:          expForm.title,
        category:       expForm.category,
        start_date:     expForm.start_date  || null,
        end_date:       expForm.end_date    || null,
        bank_account_id: expForm.bank_account_id ? parseInt(expForm.bank_account_id, 10) : null,
        notes:          expForm.notes || null,
      };

      if (editingExp) {
        const res  = await fetch(`${API}/api/one-time-expenses/${editingExp.id}`, {
          method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
        });
        const data = await res.json();
        setExpenses(prev => prev.map(ex => ex.id === editingExp.id ? { ...ex, ...data.expense } : ex));
        showToast('Expense updated');
      } else {
        const res  = await fetch(`${API}/api/one-time-expenses`, {
          method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
        });
        const data = await res.json();
        const newExp: OneTimeExpense = { ...data.expense, items: [], total_amount: 0, item_count: 0 };
        setExpenses(prev => [newExp, ...prev]);
        setExpandedId(newExp.id);
        showToast('Expense created — add items below');
      }
      setShowModal(false);
      setEditingExp(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingExp(false);
    }
  };

  const handleDeleteExpense = async (exp: OneTimeExpense) => {
    try {
      await fetch(`${API}/api/one-time-expenses/${exp.id}`, {
        method: 'DELETE', headers: getHeaders(),
      });
      setExpenses(prev => prev.filter(e => e.id !== exp.id));
      if (expandedId === exp.id) setExpandedId(null);
      setDeleteConfirm(null);
      showToast(
        exp.total_amount > 0 && exp.bank_account_name
          ? `Deleted — ${fmt(exp.total_amount)} restored to ${exp.bank_account_name}`
          : 'Expense deleted'
      );
    } catch (err) {
      console.error(err);
    }
  };

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  const handleAddItem = async (expenseId: string) => {
    if (!itemForm.description || !itemForm.amount || !itemForm.date) return;
    setAddingItem(true);
    try {
      const res  = await fetch(`${API}/api/one-time-expenses/${expenseId}/items`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          description:    itemForm.description,
          amount:         parseFloat(itemForm.amount),
          date:           itemForm.date,
          payment_method: itemForm.payment_method,
          category:       itemForm.category,
        }),
      });
      const data = await res.json();
      setExpenses(prev => prev.map(ex => {
        if (ex.id !== expenseId) return ex;
        const newItems = [...ex.items, data.item];
        return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0), item_count: newItems.length };
      }));
      setItemForm(emptyItemForm());
    } catch (err) {
      console.error(err);
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = async (expenseId: string, itemId: string) => {
    try {
      await fetch(`${API}/api/one-time-expenses/${expenseId}/items/${itemId}`, {
        method: 'DELETE', headers: getHeaders(),
      });
      setExpenses(prev => prev.map(ex => {
        if (ex.id !== expenseId) return ex;
        const newItems = ex.items.filter(i => i.id !== itemId);
        return { ...ex, items: newItems, total_amount: newItems.reduce((s, i) => s + Number(i.amount), 0), item_count: newItems.length };
      }));
    } catch (err) {
      console.error(err);
    }
  };

  // ── Computed values ───────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();
  const totalSpent  = expenses.reduce((s, e) => s + Number(e.total_amount), 0);
  const thisYear    = expenses
    .filter(e => {
      const d = e.start_date || e.items?.[0]?.date;
      return d ? new Date(d).getFullYear() === currentYear : false;
    })
    .reduce((s, e) => s + Number(e.total_amount), 0);

  const formatDateRange = (exp: OneTimeExpense) => {
    if (!exp.start_date) return '';
    const s = new Date(exp.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    if (!exp.end_date || exp.end_date === exp.start_date) return s;
    const en = new Date(exp.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${s} – ${en}`;
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const modalStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: 'var(--bg-card)',
    borderRadius: '20px 20px 0 0',
    borderTop: '1px solid var(--bg-border)',
    padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
    zIndex: 1000, maxHeight: '92vh', overflowY: 'auto',
  } : {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'var(--bg-card)',
    borderRadius: '16px',
    border: '1px solid var(--bg-border)',
    padding: '28px', zIndex: 1000,
    width: '480px', maxHeight: '90vh', overflowY: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-secondary)',
    border: '1px solid var(--bg-border)', borderRadius: '8px',
    padding: '10px 12px', color: 'var(--text-primary)',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600,
    color: 'var(--text-secondary)', letterSpacing: '0.5px',
    textTransform: 'uppercase', marginBottom: '6px', display: 'block',
  };

  const itemInputStyle: React.CSSProperties = {
    background: 'var(--bg-hover)', border: '1px solid var(--bg-border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  if (isLoading) return null;

  return (
    <AppLayout>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 120px' }}>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)',
            color: 'var(--accent-green)', padding: '10px 20px', borderRadius: '10px',
            fontSize: '14px', fontWeight: 500, zIndex: 2000, whiteSpace: 'nowrap',
          }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'Sora, sans-serif' }}>
              One-Time Expenses
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Trips, events, big purchases — tracked separately
            </p>
          </div>
          <button
            onClick={openAddExpense}
            style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + New Expense
          </button>
        </div>

        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'TOTAL SPENT', value: fmt(totalSpent), color: 'var(--accent-purple)' },
            { label: 'THIS YEAR',   value: fmt(thisYear),   color: 'var(--accent-blue)'   },
            { label: 'ENTRIES',     value: String(expenses.length), color: 'var(--text-primary)' },
          ].map(tile => (
            <div key={tile.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px', margin: '0 0 6px', fontWeight: 600 }}>{tile.label}</p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: tile.color, margin: 0, fontFamily: 'Sora, sans-serif' }}>{tile.value}</p>
            </div>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</div>
        ) : expenses.length === 0 ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✈️</div>
            <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'Sora, sans-serif' }}>No one-time expenses yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 auto 24px', maxWidth: 340 }}>
              Log trips, events, or big purchases separately. Add items day by day and watch the total build up.
            </p>
            <button
              onClick={openAddExpense}
              style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              + Create Your First Expense
            </button>
          </div>
        ) : (
          expenses.map(exp => {
            const catColor     = CATEGORY_COLORS[exp.category] || '#a855f7';
            const isExpanded   = expandedId === exp.id;
            const isAddingItem = addingItemFor === exp.id;
            const dateRange    = formatDateRange(exp);

            return (
              <div
                key={exp.id}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${isExpanded ? 'var(--accent-blue)' : 'var(--bg-border)'}`,
                  borderRadius: 14, marginBottom: 12, overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Card header — click to expand */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                >
                  {/* Icon */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: catColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                    {CATEGORY_EMOJI[exp.category] || '🧾'}
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.title}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: catColor + '22', color: catColor }}>{exp.category}</span>
                      {dateRange && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dateRange}</span>}
                      {exp.bank_account_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>via {exp.bank_account_name}</span>}
                    </div>
                  </div>

                  {/* Total + actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'Sora, sans-serif' }}>
                      {fmt(Number(exp.total_amount))}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {isExpanded ? '▲' : '▼'} {exp.item_count} item{exp.item_count !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={e => openEditExpense(exp, e)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 6px', fontSize: '13px', lineHeight: 1 }}
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(exp); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', padding: '2px 4px', fontSize: '13px', lineHeight: 1 }}
                        title="Delete"
                      >🗑️</button>
                    </div>
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--bg-border)' }}>

                    {/* Item table */}
                    {exp.items.length > 0 && (
                      <div style={{ overflowX: 'auto', marginTop: 12 }}>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 32px', gap: 12, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', paddingBottom: 8, borderBottom: '1px solid var(--bg-border)', minWidth: 480 }}>
                          <span>Date</span><span>What</span><span>How Paid</span>
                          <span style={{ textAlign: 'right' }}>Amount</span><span />
                        </div>

                        {/* Rows */}
                        {exp.items.map(item => (
                          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 32px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--bg-border)', gap: 12, minWidth: 480 }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                              {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden' }}>
                              <span style={{ fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.description}
                              </span>
                              {item.category && item.category !== 'Other' && (
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-hover)', color: 'var(--text-secondary)', marginLeft: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {item.category}
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.payment_method}</span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-red)', textAlign: 'right' }}>{fmt(Number(item.amount))}</span>
                            <button
                              onClick={() => handleDeleteItem(exp.id, item.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Remove"
                            >✕</button>
                          </div>
                        ))}

                        {/* Total row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 700, color: 'var(--accent-purple)' }}>
                          <span style={{ fontSize: '13px' }}>Total</span>
                          <span style={{ fontSize: '16px', fontFamily: 'Sora, sans-serif' }}>{fmt(Number(exp.total_amount))}</span>
                        </div>
                      </div>
                    )}

                    {/* Add item button or inline form */}
                    {!isAddingItem ? (
                      <button
                        onClick={() => { setAddingItemFor(exp.id); setItemForm(emptyItemForm()); }}
                        style={{ marginTop: exp.items.length > 0 ? 12 : 16, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-hover)', border: '1px dashed var(--bg-border)', borderRadius: 8, padding: '8px 14px', fontSize: '13px', fontWeight: 500, color: 'var(--accent-blue)', cursor: 'pointer' }}
                      >
                        + Add Item
                      </button>
                    ) : (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ overflowX: 'auto' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px 140px 140px 80px', gap: 8, padding: '12px 0', borderTop: '1px solid var(--bg-border)', minWidth: 660 }}>
                            <input
                              style={itemInputStyle}
                              placeholder="What did you spend on?"
                              value={itemForm.description}
                              onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                              autoFocus
                            />
                            <input
                              style={itemInputStyle}
                              type="date"
                              value={itemForm.date}
                              onChange={e => setItemForm(f => ({ ...f, date: e.target.value }))}
                            />
                            <div style={{ position: 'relative' }}>
                              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }}>₹</span>
                              <input
                                style={{ ...itemInputStyle, paddingLeft: 24 }}
                                type="number" min="0" step="1" placeholder="Amount"
                                value={itemForm.amount}
                                onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))}
                              />
                            </div>
                            <select
                              style={itemInputStyle}
                              value={itemForm.payment_method}
                              onChange={e => setItemForm(f => ({ ...f, payment_method: e.target.value }))}
                            >
                              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select
                              style={itemInputStyle}
                              value={itemForm.category}
                              onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
                            </select>
                            <button
                              onClick={() => handleAddItem(exp.id)}
                              disabled={addingItem || !itemForm.description || !itemForm.amount}
                              style={{ background: addingItem ? 'var(--bg-border)' : 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontSize: '13px', fontWeight: 600, cursor: addingItem ? 'not-allowed' : 'pointer' }}
                            >
                              {addingItem ? '…' : '✓ Add'}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => setAddingItemFor(null)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', marginTop: 4, padding: '2px 0' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <>
          <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 999, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--bg-border)', padding: '28px', zIndex: 1000, width: 360, maxWidth: '90vw' }}>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'Sora, sans-serif' }}>
              Delete {deleteConfirm.title}?
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
              {deleteConfirm.total_amount > 0 && deleteConfirm.bank_account_name
                ? `This will restore ${fmt(Number(deleteConfirm.total_amount))} to your bank balance.`
                : 'This action cannot be undone.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: 10, padding: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleDeleteExpense(deleteConfirm)} style={{ flex: 1, background: 'var(--accent-red)', border: 'none', borderRadius: 10, padding: '10px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit modal backdrop */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 999, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div style={modalStyle}>
          {isMobile && <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg-border)', margin: '0 auto 16px' }} />}
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', fontFamily: 'Sora, sans-serif' }}>
            {editingExp ? 'Edit Expense' : 'New One-Time Expense'}
          </h2>

          <form onSubmit={handleSaveExpense}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label style={labelStyle}>Expense Name *</label>
                <input style={inputStyle} placeholder="e.g. Goa Trip, MacBook Pro" value={expForm.title} onChange={e => setExpForm(f => ({ ...f, title: e.target.value }))} required />
              </div>

              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input style={inputStyle} type="date" value={expForm.start_date} onChange={e => setExpForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input style={inputStyle} type="date" value={expForm.end_date} onChange={e => setExpForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Bank Account</label>
                <select style={inputStyle} value={expForm.bank_account_id} onChange={e => setExpForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                  <option value="">No account (cash)</option>
                  {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}{a.bank_name ? ` — ${a.bank_name}` : ''}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} placeholder="Optional notes…" value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: 10, padding: '12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={savingExp} style={{ flex: 2, background: savingExp ? 'var(--bg-border)' : 'var(--accent-blue)', border: 'none', borderRadius: 10, padding: '12px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: savingExp ? 'not-allowed' : 'pointer' }}>
                  {savingExp ? 'Saving…' : editingExp ? 'Save Changes' : 'Create Expense'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}

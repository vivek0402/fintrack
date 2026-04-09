'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';

const CATEGORIES = ['Travel', 'Event', 'Electronics', 'Medical', 'Education',
  'Home', 'Vehicle', 'Gift', 'Investment', 'Other'];

const CATEGORY_ICONS: Record<string, string> = {
  Travel: '✈️', Event: '🎉', Electronics: '💻', Medical: '🏥',
  Education: '📚', Home: '🏠', Vehicle: '🚗', Gift: '🎁',
  Investment: '📈', Other: '🧾',
};

const CATEGORY_COLORS: Record<string, string> = {
  Travel: '#3b82f6', Event: '#f59e0b', Electronics: '#8b5cf6', Medical: '#ef4444',
  Education: '#06b6d4', Home: '#10b981', Vehicle: '#f97316', Gift: '#ec4899',
  Investment: '#22c55e', Other: '#a855f7',
};

function fmt(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const today = new Date().toISOString().split('T')[0];
const API = process.env.NEXT_PUBLIC_API_URL;

interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string;
  bank_account_id?: string;
  bank_account_name?: string;
  bank_name?: string;
  tags?: string[];
  icon?: string;
  color?: string;
}

interface Account {
  id: string;
  name: string;
  bank_name?: string;
}

const emptyForm = {
  title: '',
  amount: '',
  category: 'Other',
  date: today,
  bank_account_id: '',
  notes: '',
};

export default function OneTimeExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [router]);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/one-time-expenses`, { headers: getHeaders() });
      const data = await res.json();
      setExpenses(data.expenses || []);
    } catch (err) {
      console.error(err);
    }
  }, [getHeaders]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/accounts`, { headers: getHeaders() });
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      console.error(err);
    }
  }, [getHeaders]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    Promise.all([fetchExpenses(), fetchAccounts()]).finally(() => setLoading(false));
  }, [fetchExpenses, fetchAccounts]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const openAdd = () => {
    setEditingExpense(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditingExpense(e);
    setForm({
      title: e.title,
      amount: String(e.amount),
      category: e.category,
      date: e.date.split('T')[0],
      bank_account_id: e.bank_account_id || '',
      notes: e.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingExpense(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.amount || !form.date) return;
    setSubmitting(true);
    try {
      const body = {
        title: form.title,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date,
        bank_account_id: form.bank_account_id || null,
        notes: form.notes || null,
      };
      if (editingExpense) {
        await fetch(`${API}/api/one-time-expenses/${editingExpense.id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(body),
        });
        showToast('Expense updated');
      } else {
        await fetch(`${API}/api/one-time-expenses`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(body),
        });
        showToast('Expense added — bank balance updated');
      }
      closeModal();
      await fetchExpenses();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API}/api/one-time-expenses/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      setDeleteConfirmId(null);
      await fetchExpenses();
      showToast('Expense deleted — bank balance restored');
    } catch (err) {
      console.error(err);
    }
  };

  // Summaries
  const currentYear = new Date().getFullYear();
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const thisYear = expenses.filter(e => new Date(e.date).getFullYear() === currentYear)
    .reduce((s, e) => s + Number(e.amount), 0);

  // Group by year
  const grouped: Record<string, Expense[]> = {};
  for (const e of expenses) {
    const yr = String(new Date(e.date).getFullYear());
    if (!grouped[yr]) grouped[yr] = [];
    grouped[yr].push(e);
  }
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  const deleteTarget = expenses.find(e => e.id === deleteConfirmId);

  const modalStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    background: 'var(--bg-card)',
    borderRadius: '20px 20px 0 0',
    borderTop: '1px solid var(--bg-border)',
    padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
    zIndex: 1000,
    maxHeight: '92vh',
    overflowY: 'auto',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'var(--bg-card)',
    borderRadius: '16px',
    border: '1px solid var(--bg-border)',
    padding: '28px',
    zIndex: 1000,
    width: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--bg-border)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    marginBottom: '6px',
    display: 'block',
  };

  return (
    <AppLayout>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 120px' }}>

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
              Large irregular spends — trips, events, purchases
            </p>
          </div>
          <button
            onClick={openAdd}
            style={{
              background: 'var(--accent-blue)', color: '#fff',
              border: 'none', borderRadius: '10px',
              padding: '10px 18px', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            + Add Expense
          </button>
        </div>

        {/* Summary tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'TOTAL SPENT', value: fmt(totalSpent), color: 'var(--accent-purple)' },
            { label: 'THIS YEAR', value: fmt(thisYear), color: 'var(--accent-blue)' },
            { label: 'COUNT', value: String(expenses.length), color: 'var(--text-primary)' },
          ].map(tile => (
            <div key={tile.label} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--bg-border)',
              borderRadius: 12,
              padding: '14px 16px',
            }}>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px', margin: '0 0 6px', fontWeight: 600 }}>
                {tile.label}
              </p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: tile.color, margin: 0, fontFamily: 'Sora, sans-serif' }}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>

        {/* Expense list */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading…</div>
        ) : expenses.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
            borderRadius: 16, padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              No one-time expenses yet
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
              Track big purchases, trips, or events separately from your monthly budget
            </p>
            <button
              onClick={openAdd}
              style={{
                background: 'var(--accent-blue)', color: '#fff',
                border: 'none', borderRadius: 10, padding: '10px 20px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Add Your First Expense
            </button>
          </div>
        ) : (
          years.map(yr => (
            <div key={yr}>
              <p style={{
                fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '1.5px', textTransform: 'uppercase',
                margin: '20px 0 10px',
              }}>
                {yr}
              </p>
              {grouped[yr].map(exp => {
                const catColor = CATEGORY_COLORS[exp.category] || '#a855f7';
                const isConfirmDelete = deleteConfirmId === exp.id;
                return (
                  <div key={exp.id} style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: 12, padding: '16px 20px',
                    marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {/* Icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: catColor + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}>
                        {CATEGORY_ICONS[exp.category] || '🧾'}
                      </div>

                      {/* Middle */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exp.title}
                          </span>
                          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-red)', flexShrink: 0 }}>
                            -{fmt(Number(exp.amount))}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                              borderRadius: 20, background: catColor + '22', color: catColor,
                            }}>
                              {exp.category}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {exp.bank_account_name ? `via ${exp.bank_account_name}` : 'No account linked'}
                          </span>
                        </div>

                        {exp.notes && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0', fontStyle: 'italic' }}>
                            {exp.notes}
                          </p>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                          {!isConfirmDelete ? (
                            <>
                              <button
                                onClick={() => openEdit(exp)}
                                style={{
                                  background: 'none', border: 'none',
                                  color: 'var(--text-secondary)', fontSize: '12px',
                                  cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(exp.id)}
                                style={{
                                  background: 'none', border: 'none',
                                  color: 'var(--accent-red)', fontSize: '12px',
                                  cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                                }}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                This will restore {fmt(Number(exp.amount))} to your bank balance. Delete?
                              </span>
                              <button
                                onClick={() => handleDelete(exp.id)}
                                style={{
                                  background: 'var(--accent-red)', color: '#fff',
                                  border: 'none', borderRadius: 6,
                                  padding: '4px 12px', fontSize: '12px',
                                  fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                Yes, Delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{
                                  background: 'none', border: 'none',
                                  color: 'var(--text-muted)', fontSize: '12px',
                                  cursor: 'pointer', padding: '4px 8px',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Modal backdrop */}
      {showModal && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            backgroundColor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={modalStyle}>
          {isMobile && (
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--bg-border)', margin: '0 auto 16px' }} />
          )}
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', fontFamily: 'Sora, sans-serif' }}>
            {editingExpense ? 'Edit Expense' : 'Add One-Time Expense'}
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Title */}
              <div>
                <label style={labelStyle}>Title *</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. Goa Trip, New Laptop"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount *</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', fontSize: '14px',
                  }}>₹</span>
                  <input
                    style={{ ...inputStyle, paddingLeft: 28 }}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  style={inputStyle}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date *</label>
                <input
                  style={inputStyle}
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>

              {/* Bank Account */}
              <div>
                <label style={labelStyle}>Bank Account</label>
                <select
                  style={inputStyle}
                  value={form.bank_account_id}
                  onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                >
                  <option value="">No account (cash)</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` — ${a.bank_name}` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    flex: 1, background: 'var(--bg-secondary)',
                    border: '1px solid var(--bg-border)', borderRadius: 10,
                    padding: '12px', fontSize: '14px', fontWeight: 600,
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 2, background: submitting ? 'var(--bg-border)' : 'var(--accent-blue)',
                    border: 'none', borderRadius: 10,
                    padding: '12px', fontSize: '14px', fontWeight: 600,
                    color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving…' : editingExpense ? 'Save Changes' : 'Add Expense'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppLayout>
  );
}

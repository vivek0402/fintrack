'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { accountsAPI } from '@/lib/api';

interface BankAccount {
    id: number;
    name: string;
    icon: string;
    color: string;
    starting_balance: number;
    current_balance: number;
    total_income: number;
    total_expenses: number;
    transaction_count: number;
    is_default: boolean;
}

const ICONS = ['🏦', '💳', '💰', '🏧', '💵', '🪙', '📱', '🏢'];
const COLORS = ['#6366f1', '#00e5a0', '#f59e0b', '#a855f7', '#f43f5e', '#ec4899'];

const DEFAULT_FORM = { name: '', icon: '🏦', color: '#6366f1', starting_balance: '', current_balance_override: '', is_default: false };

function fmt(n: number) {
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function BankAccountsSection() {
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
    const [form, setForm] = useState<typeof DEFAULT_FORM>({ ...DEFAULT_FORM });
    const [saving, setSaving] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [mounted, setMounted] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(''), 4000);
        return () => clearTimeout(t);
    }, [successMsg]);

    const fetchAccounts = () => {
        accountsAPI.getAll()
            .then(res => setAccounts(res.data.accounts))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchAccounts(); }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openAdd = () => {
        setEditAccount(null);
        setForm({ ...DEFAULT_FORM });
        setShowModal(true);
    };

    const openEdit = (a: BankAccount) => {
        setEditAccount(a);
        setForm({
            name: a.name,
            icon: a.icon,
            color: a.color,
            starting_balance: String(a.starting_balance),
            current_balance_override: String(Math.round(Number(a.current_balance))),
            is_default: a.is_default,
        });
        setMenuOpenId(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            let startingBalance = parseFloat(String(form.starting_balance)) || 0;

            // When editing, if user entered a "current balance" override, back-calculate starting_balance
            // so all historical transactions still count: starting_balance = desired_current - total_income + total_expenses
            if (editAccount && (form as any).current_balance_override !== '') {
                const desired = parseFloat(String((form as any).current_balance_override));
                if (!isNaN(desired)) {
                    startingBalance = desired - Number(editAccount.total_income) + Number(editAccount.total_expenses);
                }
            }

            const payload = {
                name: form.name.trim(),
                icon: form.icon,
                color: form.color,
                starting_balance: startingBalance,
                balance_as_of: null, // always clear — we compute balance via starting_balance instead
                is_default: form.is_default,
            };
            if (editAccount) {
                const res = await accountsAPI.update(editAccount.id, payload);
                if (payload.is_default) {
                    const n = res.data.transactions_linked ?? 0;
                    setSuccessMsg(n > 0 ? `✓ Set as default. ${n} existing transactions linked to this account.` : '✓ Set as default account.');
                }
            } else {
                const res = await accountsAPI.create(payload);
                if (payload.is_default) {
                    const n = res.data.transactions_linked ?? 0;
                    setSuccessMsg(n > 0 ? `✓ Set as default. ${n} existing transactions linked to this account.` : '✓ Set as default account.');
                }
            }
            setShowModal(false);
            fetchAccounts();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (id: number) => {
        setMenuOpenId(null);
        try {
            const res = await accountsAPI.setDefault(id);
            const n = res.data.transactions_linked ?? 0;
            setSuccessMsg(n > 0 ? `✓ Set as default. ${n} existing transactions linked to this account.` : '✓ Set as default account.');
            fetchAccounts();
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id: number) => {
        setMenuOpenId(null);
        if (!window.confirm('Delete this account? Linked transactions will be unlinked.')) return;
        try {
            await accountsAPI.delete(id);
            fetchAccounts();
        } catch (err) {
            console.error(err);
        }
    };

    const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

    return (
        <div className="glass-surface" style={{
            borderRadius: '16px',
            padding: '24px',
            marginTop: '24px',
        }}>
            {/* Success toast */}
            {successMsg && (
                <div style={{
                    backgroundColor: 'rgba(0,229,160,0.1)',
                    border: '1px solid rgba(0,229,160,0.2)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: 'var(--color-inc)',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    {successMsg}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                        Bank Accounts
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        Track your real bank balances
                    </p>
                </div>
                <button
                    onClick={openAdd}
                    style={{
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        fontSize: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                        fontFamily: 'var(--font-body)',
                    }}
                >
                    + Add Account
                </button>
            </div>

            {/* Summary row */}
            {accounts.length >= 2 && (
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total across all accounts:</span>
                    <span style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: totalBalance >= 0 ? 'var(--color-inc)' : 'var(--color-exp)',
                    }}>
                        {fmt(totalBalance)}
                    </span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                    {[1, 2].map(i => (
                        <div key={i} style={{ flex: 1, height: '160px', borderRadius: '12px', backgroundColor: 'var(--glass-fill-1)', border: '1px solid var(--border-subtle)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && accounts.length === 0 && (
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '32px 0' }}>
                    <span style={{ fontSize: '32px' }}>🏦</span>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No accounts added yet</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Add your bank accounts to track real balances</p>
                    <button
                        onClick={openAdd}
                        style={{
                            marginTop: '8px',
                            backgroundColor: 'var(--accent)',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '13px',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                        }}
                    >
                        + Add your first account
                    </button>
                </div>
            )}

            {/* Cards grid */}
            {!loading && accounts.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                    marginTop: '16px',
                }}>
                    {accounts.map(account => {
                        const net = Number(account.current_balance) - Number(account.starting_balance);
                        return (
                            <div
                                key={account.id}
                                style={{
                                    backgroundColor: 'var(--glass-fill-1)',
                                    border: '1px solid var(--glass-border)',
                                    borderLeft: `3px solid ${account.color}`,
                                    borderRadius: '12px',
                                    padding: '16px',
                                    position: 'relative',
                                }}
                            >
                                {/* Top row */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: '18px', flexShrink: 0 }}>{account.icon}</span>
                                        <span style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {account.name}
                                        </span>
                                    </div>
                                    {/* 3-dot menu */}
                                    <div style={{ position: 'relative', flexShrink: 0 }} ref={menuOpenId === account.id ? menuRef : undefined}>
                                        <button
                                            onClick={() => setMenuOpenId(menuOpenId === account.id ? null : account.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--text-muted)',
                                                cursor: 'pointer',
                                                fontSize: '16px',
                                                padding: '2px 4px',
                                                lineHeight: 1,
                                            }}
                                        >
                                            ⋮
                                        </button>
                                        {menuOpenId === account.id && (
                                            <div style={{
                                                position: 'absolute',
                                                right: 0,
                                                top: '100%',
                                                zIndex: 50,
                                                backgroundColor: 'var(--glass-sheet-surface)',
                                                backdropFilter: 'var(--glass-blur)',
                                                WebkitBackdropFilter: 'var(--glass-blur)',
                                                border: '1px solid var(--glass-border)',
                                                borderRadius: '8px',
                                                padding: '4px',
                                                minWidth: '140px',
                                                boxShadow: 'var(--shadow-modal)',
                                            }}>
                                                <button onClick={() => openEdit(account)} style={menuItemStyle}>Edit</button>
                                                {!account.is_default && (
                                                    <button onClick={() => handleSetDefault(account.id)} style={menuItemStyle}>Set as Default</button>
                                                )}
                                                <button onClick={() => handleDelete(account.id)} style={{ ...menuItemStyle, color: 'var(--color-exp)' }}>Delete</button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Default badge */}
                                {account.is_default && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        backgroundColor: 'rgba(99,102,241,0.12)',
                                        border: '1px solid rgba(99,102,241,0.25)',
                                        borderRadius: '20px',
                                        padding: '1px 8px',
                                        fontSize: '11px',
                                        color: 'var(--accent)',
                                        marginTop: '4px',
                                    }}>
                                        Default
                                    </div>
                                )}

                                {/* Divider */}
                                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '12px 0' }} />

                                {/* Current balance */}
                                <p style={{
                                    fontSize: '22px',
                                    fontWeight: 700,
                                    color: Number(account.current_balance) >= 0 ? 'var(--color-inc)' : 'var(--color-exp)',
                                    margin: 0,
                                }}>
                                    {fmt(Number(account.current_balance))}
                                </p>

                                {/* Starting balance */}
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Started at {fmt(Number(account.starting_balance))}
                                </p>

                                {/* Net change */}
                                <p style={{
                                    fontSize: '12px',
                                    color: net >= 0 ? 'var(--color-inc)' : 'var(--color-exp)',
                                    margin: '2px 0 0 0',
                                }}>
                                    {net >= 0 ? '▲ +' : '▼ '}{fmt(Math.abs(net))} net change
                                </p>

                                {/* Income / Expenses stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-inc)', margin: 0 }}>{fmt(Number(account.total_income))}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>income</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', margin: 0 }}>{fmt(Number(account.total_expenses))}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>expenses</p>
                                    </div>
                                </div>

                                {/* Transaction count */}
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
                                    {Number(account.transaction_count)} transaction{Number(account.transaction_count) !== 1 ? 's' : ''} linked
                                </p>
                            </div>
                        );
                    })}

                    {/* Add Account card */}
                    <div
                        onClick={openAdd}
                        style={{
                            backgroundColor: 'transparent',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: '12px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            minHeight: '160px',
                        }}
                    >
                        <div style={{
                            width: '36px',
                            height: '36px',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                            fontSize: '20px',
                        }}>
                            +
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Add Account</span>
                    </div>
                </div>
            )}

            {/* Add / Edit Modal */}
            {showModal && mounted && createPortal(
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    boxSizing: 'border-box',
                }}
                    onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
                >
                    <div className="glass-surface glass-sheet" style={{
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '440px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        margin: '0',
                    }}>
                        {/* Modal header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '20px 24px 16px',
                            borderBottom: '1px solid var(--border-subtle)',
                            flexShrink: 0,
                        }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                                {editAccount ? 'Edit Account' : 'Add Account'}
                            </h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 4px' }}>×</button>
                        </div>

                        {/* Modal body */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* Icon picker */}
                            <div>
                                <label style={labelStyle}>Icon</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                    {ICONS.map(ic => (
                                        <button
                                            key={ic}
                                            onClick={() => setForm(f => ({ ...f, icon: ic }))}
                                            style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '8px',
                                                border: form.icon === ic ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                                                backgroundColor: 'var(--glass-fill-1)',
                                                fontSize: '18px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            {ic}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Account name */}
                            <div>
                                <label style={labelStyle}>Account Name <span style={{ color: 'var(--color-exp)' }}>*</span></label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. SBI Savings, HDFC Salary, Cash Wallet"
                                    style={inputStyle}
                                />
                            </div>

                            {/* Balance field — different UX for add vs edit */}
                            {editAccount ? (
                                <div>
                                    <label style={labelStyle}>Current Real Balance</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{
                                            position: 'absolute',
                                            left: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--text-muted)',
                                            fontSize: '14px',
                                            pointerEvents: 'none',
                                        }}>₹</span>
                                        <input
                                            type="number"
                                            value={(form as any).current_balance_override}
                                            onChange={e => setForm(f => ({ ...f, current_balance_override: e.target.value } as any))}
                                            placeholder="Enter your real balance right now"
                                            style={{ ...inputStyle, paddingLeft: '26px' }}
                                        />
                                    </div>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                        Check your bank app and enter the actual balance. All your recorded transactions will still count.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label style={labelStyle}>Opening Balance</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{
                                            position: 'absolute',
                                            left: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--text-muted)',
                                            fontSize: '14px',
                                            pointerEvents: 'none',
                                        }}>₹</span>
                                        <input
                                            type="number"
                                            value={form.starting_balance}
                                            onChange={e => setForm(f => ({ ...f, starting_balance: e.target.value as any }))}
                                            placeholder="0"
                                            style={{ ...inputStyle, paddingLeft: '26px' }}
                                        />
                                    </div>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                        Your balance before you started recording transactions (can be 0)
                                    </p>
                                </div>
                            )}

                            {/* Color picker */}
                            <div>
                                <label style={labelStyle}>Card color</label>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                    {COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setForm(f => ({ ...f, color: c }))}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                backgroundColor: c,
                                                border: 'none',
                                                cursor: 'pointer',
                                                outline: form.color === c ? '2px solid #fff' : 'none',
                                                outlineOffset: '2px',
                                                flexShrink: 0,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Default toggle */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Set as default account</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                            New transactions will be linked to this account by default
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setForm(f => ({ ...f, is_default: !f.is_default }))}
                                        style={{
                                            width: '36px',
                                            height: '20px',
                                            borderRadius: '10px',
                                            backgroundColor: form.is_default ? 'var(--accent)' : 'var(--glass-fill-3)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            flexShrink: 0,
                                            transition: 'background-color 0.2s',
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: form.is_default ? '18px' : '2px',
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '50%',
                                            backgroundColor: '#fff',
                                            transition: 'left 0.2s',
                                        }} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div style={{
                            display: 'flex',
                            gap: '10px',
                            padding: '16px 24px 20px',
                            borderTop: '1px solid var(--border-subtle)',
                            flexShrink: 0,
                        }}>
                            <button onClick={() => setShowModal(false)} style={cancelBtnStyle}>Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name.trim()}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: saving || !form.name.trim() ? 'rgba(99,102,241,0.5)' : 'var(--accent)',
                                    color: '#fff',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
                                    fontFamily: 'var(--font-body)',
                                }}
                            >
                                {saving ? 'Saving…' : editAccount ? 'Save Changes' : 'Add Account'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
                input[type=number]::-webkit-inner-spin-button,
                input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>
        </div>
    );
}

const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--glass-fill-1)',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    boxSizing: 'border-box',
};

const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
    fontFamily: 'var(--font-body)',
};

const cancelBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--glass-border)',
    backgroundColor: 'var(--glass-fill-1)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
};

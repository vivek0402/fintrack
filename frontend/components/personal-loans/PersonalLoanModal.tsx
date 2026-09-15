'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { personalLoansAPI, accountsAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
// Matches Input.tsx's own field chrome so these read as the same control,
// but as a plain labelled <input> -- Input.tsx renders its label as a sibling
// with no htmlFor/id, so it isn't reachable via getByLabelText, and
// DatePicker's trigger is a clickable div (not a form control), so it can
// never receive a native change event. Both need a real accessible input here.
const inputBase: React.CSSProperties = { width: '100%', background: 'var(--glass-fill-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', padding: '10px 12px', boxSizing: 'border-box' };

export function PersonalLoanModal({ isOpen, onClose, onSuccess }: Props) {
    const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
    const [counterpartyName, setCounterpartyName] = useState('');
    const [amount, setAmount] = useState('');
    const [dateGiven, setDateGiven] = useState(todayIST());
    const [dueDate, setDueDate] = useState('');
    const [interestType, setInterestType] = useState<'none' | 'flat' | 'percent_per_month'>('none');
    const [interestRate, setInterestRate] = useState('');
    const [notes, setNotes] = useState('');
    const [accountId, setAccountId] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        accountsAPI.getAll().then(res => {
            const list = res.data.accounts || [];
            setAccounts(list);
            const def = list.find((a: any) => a.is_default) ?? list[0];
            if (def) setAccountId(def.id);
        }).catch(() => setAccounts([]));
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) return;
        setDirection('lent'); setCounterpartyName(''); setAmount('');
        setDateGiven(todayIST()); setDueDate(''); setInterestType('none'); setInterestRate(''); setNotes('');
        setError('');
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!counterpartyName.trim() || !amount || !dateGiven) return;
        setLoading(true); setError('');
        try {
            await personalLoansAPI.create({
                direction,
                counterparty_name: counterpartyName.trim(),
                principal_amount: parseFloat(amount),
                date_given: dateGiven,
                due_date: dueDate || undefined,
                interest_type: interestType !== 'none' ? interestType : undefined,
                interest_rate: interestType !== 'none' && interestRate ? parseFloat(interestRate) : undefined,
                notes: notes || undefined,
                account_id: accountId ?? undefined,
            });
            toast.success(direction === 'lent' ? 'Loan recorded' : 'Borrowed amount recorded');
            onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Personal Loan"
            footer={
                <button type="submit" form="personal-loan-form" disabled={loading}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                    {loading ? 'Saving…' : 'Add loan'}
                </button>
            }>
            <form id="personal-loan-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>Type</label>
                    <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                        {(['lent', 'borrowed'] as const).map(d => (
                            <button key={d} type="button" onClick={() => setDirection(d)}
                                style={{ flex: 1, padding: '9px 0', borderRadius: '9px', fontSize: '0.8rem', fontWeight: direction === d ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', border: `1px solid ${direction === d ? 'var(--accent-border)' : 'transparent'}`, background: direction === d ? 'var(--accent-subtle)' : 'transparent', color: direction === d ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {d === 'lent' ? 'Lent' : 'Borrowed'}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label htmlFor="pl-name" style={labelStyle}>Who</label>
                    <input id="pl-name" type="text" placeholder="e.g. Priya" style={inputBase} value={counterpartyName} onChange={e => setCounterpartyName(e.target.value)} required />
                </div>

                <div>
                    <label htmlFor="pl-amount" style={labelStyle}>Amount</label>
                    <input id="pl-amount" type="number" min="0.01" step="any" style={inputBase} value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label htmlFor="pl-date-given" style={labelStyle}>Date given</label>
                        <input id="pl-date-given" type="date" style={inputBase} value={dateGiven} onChange={e => setDateGiven(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="pl-due-date" style={labelStyle}>Due date (optional)</label>
                        <input id="pl-due-date" type="date" min={dateGiven} style={inputBase} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                </div>

                {accounts.length > 0 && (
                    <div>
                        <label htmlFor="pl-account" style={labelStyle}>Account (optional — affects its balance)</label>
                        <select id="pl-account" value={accountId ?? ''} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)} style={{ ...inputBase, cursor: 'pointer' }}>
                            <option value="">Don&apos;t track against an account</option>
                            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label htmlFor="pl-interest-type" style={labelStyle}>Interest</label>
                        <select id="pl-interest-type" value={interestType} onChange={e => setInterestType(e.target.value as any)} style={{ ...inputBase, cursor: 'pointer' }}>
                            <option value="none">None</option>
                            <option value="flat">Flat amount</option>
                            <option value="percent_per_month">% per month</option>
                        </select>
                    </div>
                    {interestType !== 'none' && (
                        <div>
                            <label htmlFor="pl-interest-rate" style={labelStyle}>Interest rate</label>
                            <input id="pl-interest-rate" type="number" min="0" step="any" style={inputBase} value={interestRate} onChange={e => setInterestRate(e.target.value)} />
                        </div>
                    )}
                </div>

                <div>
                    <label htmlFor="pl-notes" style={labelStyle}>Notes (optional)</label>
                    <textarea id="pl-notes" rows={2} style={{ ...inputBase, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {error && <div style={{ fontSize: '0.8rem', color: 'var(--color-exp)' }}>{error}</div>}
            </form>
        </Modal>
    );
}

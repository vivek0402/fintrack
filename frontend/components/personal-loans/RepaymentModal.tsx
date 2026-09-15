'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { personalLoansAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

interface LoanLike {
    id: string;
    counterparty_name: string;
    direction: 'lent' | 'borrowed';
    outstanding_amount: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    loan: LoanLike | null;
}

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
// Same reasoning as PersonalLoanModal.tsx: Input.tsx's label has no htmlFor/id
// and DatePicker's trigger is a non-native div, so neither is reachable via
// getByLabelText/fireEvent.change -- use plain labelled native inputs instead.
const inputBase: React.CSSProperties = { width: '100%', background: 'var(--glass-fill-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', padding: '10px 12px', boxSizing: 'border-box' };

export function RepaymentModal({ isOpen, onClose, onSuccess, loan }: Props) {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(todayIST());
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && loan) {
            setAmount(String(loan.outstanding_amount));
            setDate(todayIST());
            setNotes(''); setError('');
        }
    }, [isOpen, loan]);

    if (!loan) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const value = parseFloat(amount);
        if (!value || value <= 0) return;
        if (value > loan.outstanding_amount + 0.01) {
            setError(`Amount can't exceed the ₹${loan.outstanding_amount.toLocaleString('en-IN')} outstanding.`);
            return;
        }
        setLoading(true);
        try {
            await personalLoansAPI.addRepayment(loan.id, { amount: value, date, notes: notes || undefined });
            toast.success('Repayment recorded');
            onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const verb = loan.direction === 'lent' ? 'from' : 'to';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record repayment ${verb} ${loan.counterparty_name}`}
            footer={
                <button type="submit" form="repayment-form" disabled={loading}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                    {loading ? 'Saving…' : 'Record repayment'}
                </button>
            }>
            <form id="repayment-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label htmlFor="repay-amount" style={labelStyle}>Amount</label>
                    <input id="repay-amount" type="number" min="0.01" step="any" style={inputBase} value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <div>
                    <label htmlFor="repay-date" style={labelStyle}>Date</label>
                    <input id="repay-date" type="date" style={inputBase} value={date} onChange={e => setDate(e.target.value)} required />
                </div>
                <div>
                    <label htmlFor="repay-notes" style={labelStyle}>Notes (optional)</label>
                    <textarea id="repay-notes" rows={2} style={{ ...inputBase, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 25%, transparent)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-exp)', fontFamily: 'var(--font-body)' }}>
                        {error}
                    </div>
                )}
            </form>
        </Modal>
    );
}

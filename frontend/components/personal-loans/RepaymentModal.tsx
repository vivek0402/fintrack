'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TONE_TEXT } from '@/components/ui/CardParts';
import { personalLoansAPI, accountsAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { toast } from '@/store/toastStore';
import { Field, selectStyle, textareaStyle } from './fields';

interface LoanLike {
    id: string;
    counterparty_name: string;
    direction: 'lent' | 'borrowed';
    outstanding_amount: number | string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    loan: LoanLike | null;
}

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function RepaymentModal({ isOpen, onClose, onSuccess, loan }: Props) {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(todayIST());
    const [notes, setNotes] = useState('');
    const [accountId, setAccountId] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // outstanding_amount comes back from the API as a Postgres NUMERIC string,
    // not a JS number -- normalize once here so every comparison below is
    // against a real number, not a string that would silently coerce wrong.
    const outstandingAmount = loan ? parseFloat(String(loan.outstanding_amount)) : 0;

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
        if (isOpen && loan) {
            setAmount(String(outstandingAmount));
            setDate(todayIST());
            setNotes(''); setError('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, loan]);

    if (!loan) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const value = parseFloat(amount);
        if (!value || value <= 0) return;
        if (value > outstandingAmount + 0.01) {
            setError(`Amount can't exceed the ₹${outstandingAmount.toLocaleString('en-IN')} outstanding.`);
            return;
        }
        setLoading(true);
        try {
            await personalLoansAPI.addRepayment(loan.id, { amount: value, date, notes: notes || undefined, account_id: accountId ?? undefined });
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="repayment-form" isLoading={loading}>Record repayment</Button>
                </div>
            }>
            <form id="repayment-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input label="Amount" type="number" min="0.01" step="any" value={amount} onChange={e => setAmount(e.target.value)} required />
                <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                {accounts.length > 0 && (
                    <Field label="Account (optional, changes its balance)" htmlFor="repay-account">
                        <select id="repay-account" value={accountId ?? ''} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
                            <option value="">Don&apos;t track against an account</option>
                            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="Notes (optional)" htmlFor="repay-notes">
                    <textarea id="repay-notes" rows={2} style={textareaStyle} value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}
            </form>
        </Modal>
    );
}

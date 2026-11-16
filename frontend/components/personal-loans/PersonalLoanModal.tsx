'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { TONE_TEXT } from '@/components/ui/CardParts';
import { personalLoansAPI, accountsAPI } from '@/lib/api';
import { type } from '@/lib/typography';
import { toast } from '@/store/toastStore';
import { Field, selectStyle, textareaStyle } from './fields';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

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
        setAccountId(null);
        setError('');
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!counterpartyName.trim() || !amount || !dateGiven) return;
        if (interestType !== 'none' && (!interestRate || parseFloat(interestRate) <= 0)) {
            setError('Enter an interest rate, or set interest to None.');
            return;
        }
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
        <Modal isOpen={isOpen} onClose={onClose} title="Add a personal loan"
            footer={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="personal-loan-form" isLoading={loading}>Add loan</Button>
                </div>
            }>
            <form id="personal-loan-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Tabs
                    tabs={[{ key: 'lent', label: 'I lent money' }, { key: 'borrowed', label: 'I borrowed money' }]}
                    active={direction}
                    onChange={k => setDirection(k as 'lent' | 'borrowed')}
                />

                <Input label="Who" type="text" placeholder="e.g. Priya" value={counterpartyName} onChange={e => setCounterpartyName(e.target.value)} required />

                <Input label="Amount" type="number" min="0.01" step="any" value={amount} onChange={e => setAmount(e.target.value)} required />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <Input label="Date given" type="date" value={dateGiven} onChange={e => setDateGiven(e.target.value)} required />
                    <Input label="Due date (optional)" type="date" min={dateGiven} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>

                {accounts.length > 0 && (
                    <Field label="Account (optional, changes its balance)" htmlFor="pl-account">
                        <select id="pl-account" value={accountId ?? ''} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
                            <option value="">Don&apos;t track against an account</option>
                            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </Field>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'start' }}>
                    <Field label="Interest" htmlFor="pl-interest-type">
                        <select id="pl-interest-type" value={interestType} onChange={e => setInterestType(e.target.value as any)} style={selectStyle}>
                            <option value="none">None</option>
                            <option value="flat">Flat amount</option>
                            <option value="percent_per_month">% per month</option>
                        </select>
                    </Field>
                    {interestType !== 'none' && (
                        <Input label="Interest rate" type="number" min="0" step="any" required value={interestRate} onChange={e => setInterestRate(e.target.value)} />
                    )}
                </div>

                <Field label="Notes (optional)" htmlFor="pl-notes">
                    <textarea id="pl-notes" rows={2} style={textareaStyle} value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>

                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}
            </form>
        </Modal>
    );
}

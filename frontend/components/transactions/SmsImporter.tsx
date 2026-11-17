'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { aiAPI, transactionsAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Field, textareaStyle } from '@/components/personal-loans/fields';
import { type } from '@/lib/typography';

type Step = 'paste' | 'parsing' | 'review' | 'success';

interface ParsedSms {
    type: 'income' | 'expense';
    amount: number;
    description: string;
    date: string;
    notes: string;
    category?: string;
}

interface SmsImporterProps {
    onClose: () => void;
    onSuccess?: () => void;
}

const TYPE_TABS = [
    { key: 'expense', label: 'Expense' },
    { key: 'income', label: 'Income' },
];

export function SmsImporter({ onClose, onSuccess }: SmsImporterProps) {
    const router = useRouter();

    const [step, setStep] = useState<Step>('paste');
    const [smsText, setSmsText] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [parsed, setParsed] = useState<ParsedSms | null>(null);

    const reset = () => {
        setSmsText('');
        setError('');
        setParsed(null);
        setStep('paste');
    };

    const handleParse = async () => {
        if (!smsText.trim()) return;
        setStep('parsing');
        setError('');
        try {
            const res = await aiAPI.parseSMS(smsText.trim());
            const p = res.data.parsed;
            setParsed({
                type: p.type === 'income' ? 'income' : 'expense',
                amount: Number(p.amount) || 0,
                description: p.description || '',
                date: p.date || new Date().toISOString().split('T')[0],
                notes: p.notes || '',
                category: p.category || undefined,
            });
            setStep('review');
        } catch (err: any) {
            setError(err.response?.data?.error || "Couldn't read that message. Try pasting just the transaction line, or add it manually.");
            setStep('paste');
        }
    };

    const updateParsed = (patch: Partial<ParsedSms>) => {
        setParsed(p => p ? { ...p, ...patch } : p);
    };

    const handleConfirm = async () => {
        if (!parsed) return;
        setSaving(true);
        setError('');
        try {
            await transactionsAPI.create({
                type: parsed.type,
                amount: parsed.amount,
                description: parsed.description,
                notes: parsed.notes || null,
                date: parsed.date,
                source: 'sms',
            });
            setStep('success');
            onSuccess?.();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save transaction.');
        } finally {
            setSaving(false);
        }
    };

    // ── STEP: paste ──────────────────────────────────────────────────────────
    if (step === 'paste') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Field label="Paste your bank or UPI SMS" htmlFor="sms-text">
                    <textarea
                        id="sms-text"
                        value={smsText}
                        onChange={e => setSmsText(e.target.value)}
                        placeholder="For example: Rs.450 debited from a/c XX1234 for UPI to Swiggy on 12-06-26"
                        rows={5}
                        style={textareaStyle}
                    />
                </Field>

                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}

                <Button onClick={handleParse} disabled={!smsText.trim()} style={{ width: '100%' }}>
                    Read message
                </Button>

                <div style={{ alignSelf: 'center' }}>
                    <TextAction quiet onClick={onClose}>Skip, I will add it manually</TextAction>
                </div>
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px var(--space-4)' }}>
                <p style={{ ...type.body, margin: 0 }}>Reading your message</p>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review' && parsed) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <p style={{ ...type.meta, margin: 0 }}>
                    {`Check the details before saving.${parsed.category ? ` Suggested category: ${parsed.category}.` : ''}`}
                </p>

                {error && <p role="alert" style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>}

                <Input label="Description" type="text" value={parsed.description} onChange={e => updateParsed({ description: e.target.value })} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <Input label="Amount" type="number" min="0" step="0.01" value={parsed.amount} onChange={e => updateParsed({ amount: parseFloat(e.target.value) || 0 })} />
                    <Input label="Date" type="date" value={parsed.date} onChange={e => updateParsed({ date: e.target.value })} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span style={type.label}>Type</span>
                    <Tabs tabs={TYPE_TABS} active={parsed.type} onChange={key => updateParsed({ type: key === 'income' ? 'income' : 'expense' })} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                    <TextAction quiet onClick={onClose}>Cancel</TextAction>
                    <Button onClick={handleConfirm} isLoading={saving} disabled={!parsed.description || parsed.amount <= 0}>
                        Save transaction
                    </Button>
                </div>
            </div>
        );
    }

    // ── STEP: success ────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px var(--space-4)', gap: 'var(--space-4)', textAlign: 'center' }}>
            <p style={{ ...type.title, margin: 0 }}>Transaction saved.</p>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <Button onClick={() => { onClose(); router.push('/transactions'); }}>
                    View transactions
                </Button>
                <Button variant="secondary" onClick={reset}>
                    Add another
                </Button>
            </div>
        </div>
    );
}

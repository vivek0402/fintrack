'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { aiAPI, transactionsAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';

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

const inputSt: React.CSSProperties = {
    width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8,
    padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)',
};
const labelSt: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block', fontFamily: 'var(--font-body)',
};

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                    <label style={labelSt}>Paste your bank/UPI SMS</label>
                    <textarea
                        value={smsText}
                        onChange={e => setSmsText(e.target.value)}
                        placeholder="e.g. Rs.450 debited from a/c XX1234 for UPI to Swiggy on 12-06-26"
                        rows={5}
                        style={{ ...inputSt, resize: 'vertical', fontFamily: 'var(--font-body)' }}
                    />
                </div>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <Button onClick={handleParse} disabled={!smsText.trim()} style={{ width: '100%' }}>
                    Read message
                </Button>

                <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', alignSelf: 'center' }}>
                    Skip — I'll add it manually
                </button>
            </div>
        );
    }

    // ── STEP: parsing ────────────────────────────────────────────────────────
    if (step === 'parsing') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', gap: 12 }}>
                <Loader2 size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Reading your message…
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // ── STEP: review ─────────────────────────────────────────────────────────
    if (step === 'review' && parsed) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Check the details before saving{parsed.category ? <> — suggested category: <strong style={{ color: 'var(--text-primary)' }}>{parsed.category}</strong></> : null}.
                </p>

                {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                <div>
                    <label style={labelSt}>Description</label>
                    <input type="text" value={parsed.description} onChange={e => updateParsed({ description: e.target.value })} style={inputSt} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <label style={labelSt}>Amount</label>
                        <input type="number" min="0" step="0.01" value={parsed.amount} onChange={e => updateParsed({ amount: parseFloat(e.target.value) || 0 })} style={inputSt} />
                    </div>
                    <div>
                        <label style={labelSt}>Date</label>
                        <input type="date" value={parsed.date} onChange={e => updateParsed({ date: e.target.value })} style={inputSt} />
                    </div>
                </div>

                <div>
                    <label style={labelSt}>Type</label>
                    <button
                        type="button"
                        onClick={() => updateParsed({ type: parsed.type === 'income' ? 'expense' : 'income' })}
                        style={{
                            padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', width: '100%',
                            background: parsed.type === 'income' ? 'color-mix(in srgb, var(--color-inc) 14%, transparent)' : 'color-mix(in srgb, var(--color-exp) 14%, transparent)',
                            color: parsed.type === 'income' ? 'var(--color-inc)' : 'var(--color-exp)',
                        }}
                    >
                        {parsed.type === 'income' ? 'Income' : 'Expense'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Cancel
                    </button>
                    <Button onClick={handleConfirm} isLoading={saving} disabled={!parsed.description || parsed.amount <= 0}>
                        Save transaction
                    </Button>
                </div>
            </div>
        );
    }

    // ── STEP: success ────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 16, textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--color-inc)' }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                Transaction saved.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
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

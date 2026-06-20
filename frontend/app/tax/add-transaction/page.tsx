'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { taxAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const ASSET_TYPE_LABELS: Record<string, string> = {
    equity: 'Equity',
    debt: 'Debt',
    gold: 'Gold',
    real_estate: 'Real Estate',
    other: 'Other',
};

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS);

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
    buy: 'Buy',
    sell: 'Sell',
};

const TRANSACTION_TYPES = Object.keys(TRANSACTION_TYPE_LABELS);

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    fontFamily: 'var(--font-body)',
};

export default function AddCapitalTransactionPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [form, setForm] = useState({
        asset_name: '',
        asset_type: 'equity',
        transaction_type: 'sell',
        units: '',
        price_per_unit: '',
        transaction_date: '',
    });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    if (isLoading || !user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const units = parseFloat(form.units);
        const price = parseFloat(form.price_per_unit);

        if (!form.asset_name.trim()) { setError('Asset name is required.'); return; }
        if (!Number.isFinite(units) || units <= 0) { setError('Units must be greater than 0.'); return; }
        if (!Number.isFinite(price) || price < 0) { setError('Price per unit must be 0 or greater.'); return; }
        if (!form.transaction_date) { setError('Transaction date is required.'); return; }

        setSaving(true);
        try {
            await taxAPI.addCapitalTransaction({
                asset_name: form.asset_name.trim(),
                asset_type: form.asset_type,
                transaction_type: form.transaction_type,
                units,
                price_per_unit: price,
                transaction_date: form.transaction_date,
            });
            router.push('/tax');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to add transaction.');
        } finally {
            setSaving(false);
        }
    };

    return (
            <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                <button
                    type="button"
                    onClick={() => router.push('/tax')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-body)', padding: 0, alignSelf: 'flex-start' }}
                >
                    <ArrowLeft size={15} /> Back to Tax Intelligence
                </button>

                <div>
                    <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Add Capital Transaction
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Log a buy or sell so capital gains can be calculated automatically.
                    </p>
                </div>

                <Card>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Asset Name</label>
                            <input
                                type="text"
                                value={form.asset_name}
                                onChange={e => setForm(f => ({ ...f, asset_name: e.target.value }))}
                                placeholder="e.g. HDFC Bank Ltd, SBI Bluechip Fund"
                                style={inputStyle}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Asset Type</label>
                                <select
                                    value={form.asset_type}
                                    onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}
                                    style={inputStyle}
                                >
                                    {ASSET_TYPES.map(t => (
                                        <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Transaction Type</label>
                                <select
                                    value={form.transaction_type}
                                    onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))}
                                    style={inputStyle}
                                >
                                    {TRANSACTION_TYPES.map(t => (
                                        <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={labelStyle}>Units</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={form.units}
                                    onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                                    placeholder="0"
                                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Price per Unit (₹)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={form.price_per_unit}
                                    onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))}
                                    placeholder="0"
                                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={labelStyle}>Date</label>
                            <input
                                type="date"
                                value={form.transaction_date}
                                onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                            />
                        </div>

                        {error && <p style={{ fontSize: 12, color: 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-body)' }}>{error}</p>}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                            <Button type="button" variant="secondary" onClick={() => router.push('/tax')}>Cancel</Button>
                            <Button type="submit" isLoading={saving}>Save Transaction</Button>
                        </div>
                    </form>
                </Card>
            </div>
    );
}

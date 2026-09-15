'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { personalLoansAPI } from '@/lib/api';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loanId: string | null;
    onRepay: (loan: Loan) => void;
}

type Loan = {
    id: string; direction: 'lent' | 'borrowed'; counterparty_name: string;
    principal_amount: number | string; repaid_amount: number | string; outstanding_amount: number | string;
    date_given: string; due_date: string | null; interest_type: 'none' | 'flat' | 'percent_per_month';
    interest_rate: number | string | null; notes: string | null;
    status: 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';
};

type Repayment = { id: string; amount: number | string; date: string; notes: string | null };

const STATUS_LABEL: Record<Loan['status'], string> = {
    outstanding: 'Outstanding', partially_repaid: 'Partially repaid', repaid: 'Repaid', written_off: 'Written off',
};

// Same discipline as every other component in this feature: principal/repaid/
// outstanding/interest_rate arrive as Postgres NUMERIC strings, not numbers.
function num(v: number | string | null | undefined): number {
    if (v === null || v === undefined) return 0;
    return typeof v === 'string' ? parseFloat(v) : v;
}

function formatDate(d: string) {
    const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const rowLabel: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' };
const rowValue: React.CSSProperties = { fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 };

export function LoanDetailModal({ isOpen, onClose, loanId, onRepay }: Props) {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [repayments, setRepayments] = useState<Repayment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !loanId) { setLoan(null); setRepayments([]); return; }
        setLoading(true); setError('');
        personalLoansAPI.get(loanId)
            .then(res => { setLoan(res.data.loan); setRepayments(res.data.repayments || []); })
            .catch(() => setError('Could not load this loan.'))
            .finally(() => setLoading(false));
    }, [isOpen, loanId]);

    const settled = loan?.status === 'repaid' || loan?.status === 'written_off';
    const principal = num(loan?.principal_amount);
    const repaid = num(loan?.repaid_amount);
    const outstanding = num(loan?.outstanding_amount);
    const pct = principal > 0 ? (repaid / principal) * 100 : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={loan ? loan.counterparty_name : 'Loan details'}
            footer={loan && !settled ? (
                <button type="button" onClick={() => { onRepay(loan); onClose(); }}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Record repayment
                </button>
            ) : undefined}>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <Skeleton height={20} /><Skeleton height={60} /><Skeleton height={100} />
                </div>
            ) : error ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-exp)' }}>{error}</div>
            ) : loan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Badge>{STATUS_LABEL[loan.status]}</Badge>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: loan.direction === 'lent' ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                            ₹{Math.round(outstanding).toLocaleString('en-IN')}
                        </div>
                    </div>
                    {!settled && <ProgressBar pct={pct} />}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div><span style={rowLabel}>Principal</span><div style={rowValue}>₹{Math.round(principal).toLocaleString('en-IN')}</div></div>
                        <div><span style={rowLabel}>Repaid</span><div style={rowValue}>₹{Math.round(repaid).toLocaleString('en-IN')}</div></div>
                        <div><span style={rowLabel}>Date given</span><div style={rowValue}>{formatDate(loan.date_given)}</div></div>
                        <div><span style={rowLabel}>Due date</span><div style={rowValue}>{loan.due_date ? formatDate(loan.due_date) : '—'}</div></div>
                        {loan.interest_type !== 'none' && (
                            <div>
                                <span style={rowLabel}>Interest</span>
                                <div style={rowValue}>{num(loan.interest_rate)}{loan.interest_type === 'percent_per_month' ? '%/mo' : ' flat'}</div>
                            </div>
                        )}
                    </div>

                    {loan.notes && (
                        <div>
                            <span style={rowLabel}>Notes</span>
                            <div style={{ ...rowValue, fontWeight: 400, marginTop: '4px' }}>{loan.notes}</div>
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>Repayment history</div>
                        {repayments.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No repayments yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {repayments.map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-sm)' }}>
                                        <div>
                                            <div style={rowValue}>{formatDate(r.date)}</div>
                                            {r.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.notes}</div>}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                            ₹{Math.round(num(r.amount)).toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

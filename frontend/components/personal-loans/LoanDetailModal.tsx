'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Rows, Stat, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { personalLoansAPI } from '@/lib/api';
import { fmt, formatDate } from '@/lib/utils';
import { type } from '@/lib/typography';
import { isOverdue, isSettled, num } from '@/lib/personalLoans';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loanId: string | null;
    onRepay: (loan: Loan) => void;
    /** Shown for active loans when given. The dialog closes after the loan is written off. */
    onWriteOff?: (loan: Loan) => void;
    /** Shown for settled loans when given. The dialog closes after the loan is deleted. */
    onDelete?: (loan: Loan) => void;
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function interestText(loan: Loan): string {
    if (loan.interest_type === 'none') return 'None';
    const rate = num(loan.interest_rate);
    return loan.interest_type === 'percent_per_month' ? `${rate}% per month` : `₹${rate} flat`;
}

export function LoanDetailModal({ isOpen, onClose, loanId, onRepay, onWriteOff, onDelete }: Props) {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [repayments, setRepayments] = useState<Repayment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState<'writeoff' | 'delete' | null>(null);

    useEffect(() => {
        setConfirming(null);
        if (!isOpen || !loanId) { setLoan(null); setRepayments([]); return; }
        setLoading(true); setError('');
        personalLoansAPI.get(loanId)
            .then(res => { setLoan(res.data.loan); setRepayments(res.data.repayments || []); })
            .catch(() => setError('Could not load this loan.'))
            .finally(() => setLoading(false));
    }, [isOpen, loanId]);

    const settled = loan ? isSettled(loan) : false;
    const overdue = loan ? isOverdue(loan) : false;
    const outstanding = num(loan?.outstanding_amount);

    const rowLabel = type.body;
    const rowValue: React.CSSProperties = { ...type.bodyStrong, marginLeft: 'auto', textAlign: 'right', minWidth: 0 };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={loan ? loan.counterparty_name : 'Loan details'}
            footer={loan && !settled ? (
                <Button type="button" onClick={() => { onRepay(loan); onClose(); }} style={{ width: '100%' }}>Record repayment</Button>
            ) : undefined}>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <Skeleton height={20} /><Skeleton height={60} /><Skeleton height={100} />
                </div>
            ) : error ? (
                <p style={{ ...type.meta, color: TONE_TEXT.bad, margin: 0 }}>{error}</p>
            ) : loan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <p style={{ ...type.meta, margin: 0 }}>
                        {loan.direction === 'lent' ? 'They owe you' : 'You owe them'} · {STATUS_LABEL[loan.status]}
                        {overdue && loan.due_date && <span style={{ color: TONE_TEXT.bad }}> · Overdue since {formatDate(loan.due_date)}</span>}
                    </p>

                    <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                        <Stat className="dash-stat" label="Outstanding" value={fmt(outstanding)} sub={`Of ${fmt(num(loan.principal_amount))}`} />
                        <Stat className="dash-stat" label="Repaid" value={fmt(num(loan.repaid_amount))} sub={plural(repayments.length, 'repayment')} />
                    </div>

                    <Rows>
                        <div><span style={rowLabel}>Given</span><span style={rowValue}>{formatDate(loan.date_given)}</span></div>
                        <div><span style={rowLabel}>{loan.due_date ? 'Due' : 'No due date'}</span>{loan.due_date && <span style={rowValue}>{formatDate(loan.due_date)}</span>}</div>
                        <div><span style={rowLabel}>Interest</span><span style={rowValue}>{interestText(loan)}</span></div>
                        {loan.notes && <div style={{ alignItems: 'flex-start' }}><span style={rowLabel}>Notes</span><span style={{ ...type.body, color: 'var(--text-primary)', marginLeft: 'auto', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{loan.notes}</span></div>}
                    </Rows>

                    <div>
                        <p style={{ ...type.label, margin: '0 0 var(--space-2)' }}>Repayments</p>
                        {repayments.length === 0 ? (
                            <p style={{ ...type.meta, margin: 0 }}>No repayments yet.</p>
                        ) : (
                            <Rows>
                                {repayments.map(r => (
                                    <div key={r.id}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ ...type.bodyStrong, margin: 0 }}>{formatDate(r.date)}</p>
                                            {r.notes && <p style={{ ...type.meta, margin: 0 }}>{r.notes}</p>}
                                        </div>
                                        <span style={{ ...type.num, flexShrink: 0 }}>{fmt(num(r.amount))}</span>
                                    </div>
                                ))}
                            </Rows>
                        )}
                    </div>

                    {!settled && onWriteOff && (
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-3)' }}>
                            {confirming === 'writeoff' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                    <p style={{ ...type.meta, margin: 0 }}>Write off {fmt(outstanding)}? The loan will be marked as written off.</p>
                                    <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                                        <TextAction tone="danger" onClick={() => { onWriteOff(loan); onClose(); }}>Confirm</TextAction>
                                        <TextAction quiet onClick={() => setConfirming(null)}>Cancel</TextAction>
                                    </div>
                                </div>
                            ) : (
                                <TextAction quiet onClick={() => setConfirming('writeoff')}>Write off</TextAction>
                            )}
                        </div>
                    )}

                    {settled && onDelete && (
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-3)' }}>
                            {confirming === 'delete' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                    <p style={{ ...type.meta, margin: 0 }}>Delete this loan? It cannot be restored after the undo window.</p>
                                    <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                                        <TextAction tone="danger" onClick={() => { onDelete(loan); onClose(); }}>Delete</TextAction>
                                        <TextAction quiet onClick={() => setConfirming(null)}>Cancel</TextAction>
                                    </div>
                                </div>
                            ) : (
                                <TextAction quiet tone="danger" onClick={() => setConfirming('delete')}>Delete this loan</TextAction>
                            )}
                        </div>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { personalLoansAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, Stat, TONE_TEXT } from '@/components/ui/CardParts';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PersonalLoanModal } from '@/components/personal-loans/PersonalLoanModal';
import { RepaymentModal } from '@/components/personal-loans/RepaymentModal';
import { LoanDetailModal } from '@/components/personal-loans/LoanDetailModal';
import { toast } from '@/store/toastStore';
import { fmt, formatDate } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { isOverdue, netPosition, num, overdueFirst, positionSentence, splitLoans, sumOutstanding } from '@/lib/personalLoans';

type Loan = {
    id: string; direction: 'lent' | 'borrowed'; counterparty_name: string;
    principal_amount: number | string; repaid_amount: number | string; outstanding_amount: number | string;
    due_date: string | null; status: 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';
};

const STATUS_LABEL: Record<Loan['status'], string> = {
    outstanding: 'Outstanding', partially_repaid: 'Partially repaid', repaid: 'Repaid', written_off: 'Written off',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A row that opens the loan's details on tap, Enter or Space. */
function openProps(onOpen: () => void) {
    return {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onOpen,
        // Only react to the row's own key presses, not ones bubbling from a button inside it.
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
        },
    };
}

const rowColumn: React.CSSProperties = { flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-1)', cursor: 'pointer' };

function ActiveLoanRow({ loan, onOpen, onRepay }: { loan: Loan; onOpen: (id: string) => void; onRepay: (l: Loan) => void }) {
    const principal = num(loan.principal_amount);
    const repaid = num(loan.repaid_amount);
    const pct = principal > 0 ? (repaid / principal) * 100 : 0;
    const overdue = isOverdue(loan);
    return (
        <div {...openProps(() => onOpen(loan.id))} style={rowColumn}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                <p style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0, margin: 0 }}>{loan.counterparty_name}</p>
                <button type="button" className="fin-link fin-link-quiet fin-row-hover-action fin-row-hover-action-touch"
                    aria-label={`Record repayment for ${loan.counterparty_name}`}
                    onClick={e => { e.stopPropagation(); onRepay(loan); }}>
                    Record repayment
                </button>
                <span style={{ ...type.num, flexShrink: 0 }}>{fmt(num(loan.outstanding_amount))}</span>
            </div>
            <p style={{ ...type.meta, margin: 0 }}>
                {STATUS_LABEL[loan.status]}
                {overdue && loan.due_date
                    ? <span style={{ color: TONE_TEXT.bad }}> · Overdue since {formatDate(loan.due_date)}</span>
                    : loan.due_date ? ` · due ${formatDate(loan.due_date)}` : ' · no due date'}
            </p>
            <ProgressBar pct={pct} height={4} color="var(--text-secondary)" />
        </div>
    );
}

function SettledSection({ loans, open, onToggle, onOpen, divider }: { loans: Loan[]; open: boolean; onToggle: () => void; onOpen: (id: string) => void; divider: boolean }) {
    return (
        <div style={divider ? { borderTop: '1px solid var(--glass-border)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)' } : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', minWidth: 0 }}>
                    <p style={{ ...type.bodyStrong, margin: 0 }}>Settled</p>
                    <p style={{ ...type.meta, margin: 0 }}>{plural(loans.length, 'loan')}</p>
                </div>
                <TextAction quiet onClick={onToggle} aria-expanded={open}>{open ? 'Hide' : 'Show'}</TextAction>
            </div>
            {open && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                    <Rows>
                        {loans.map(l => (
                            <div key={l.id} {...openProps(() => onOpen(l.id))} style={{ cursor: 'pointer' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{l.counterparty_name}</p>
                                    <p style={{ ...type.meta, margin: 0 }}>{STATUS_LABEL[l.status]}</p>
                                </div>
                                <span style={{ ...type.num, flexShrink: 0 }}>{fmt(num(l.principal_amount))}</span>
                            </div>
                        ))}
                    </Rows>
                </div>
            )}
        </div>
    );
}

export default function PersonalLoansPage() {
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [repayLoan, setRepayLoan] = useState<Loan | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Set<string>>(new Set());
    const [detailLoanId, setDetailLoanId] = useState<string | null>(null);
    const [showSettled, setShowSettled] = useState(false);

    const refresh = useCallback(() => {
        setLoading(true); setLoadError(false);
        personalLoansAPI.getAll()
            .then(res => setLoans(res.data.loans || []))
            .catch(() => { toast.error('Could not load personal loans'); setLoadError(true); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleWriteOff = async (loan: Loan) => {
        try {
            await personalLoansAPI.writeOff(loan.id);
            toast.success('Marked as written off');
            refresh();
        } catch { toast.error('Could not write off this loan'); }
    };

    const handleDelete = (loan: Loan) => {
        const id = loan.id;
        // Optimistically hide the row, then give the user an undo window before
        // actually deleting -- same pattern as goals/page.tsx and TransactionList.
        setPendingDelete(prev => new Set([...prev, id]));

        let cancelled = false;
        toast.undo('Loan deleted', () => {
            cancelled = true;
            setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
        });

        setTimeout(async () => {
            if (cancelled) return;
            try {
                await personalLoansAPI.delete(id);
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
                refresh();
            } catch {
                toast.error('Failed to delete loan');
                setPendingDelete(prev => { const s = new Set(prev); s.delete(id); return s; });
            }
        }, 4000);
    };

    const visibleLoans = loans.filter(l => !pendingDelete.has(l.id));
    const { owedToYou: lentRaw, youOwe: borrowedRaw, settled } = splitLoans(visibleLoans);
    const owedToYou = overdueFirst(lentRaw);
    const youOwe = overdueFirst(borrowedRaw);

    const owedTotal = sumOutstanding(owedToYou);
    const oweTotal = sumOutstanding(youOwe);
    const net = netPosition(owedToYou, youOwe);
    const netRounded = Math.round(net);
    const netText = netRounded > 0 ? `+${fmt(netRounded)}` : netRounded < 0 ? `−${fmt(-netRounded)}` : fmt(0);
    const overdueLoans = [...owedToYou, ...youOwe].filter(l => isOverdue(l));
    const firstOverdue = overdueLoans[0];
    const hasActive = owedToYou.length + youOwe.length > 0;

    const settledSection = (divider: boolean) => (
        <SettledSection loans={settled} open={showSettled} onToggle={() => setShowSettled(v => !v)} onOpen={setDetailLoanId} divider={divider} />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>
            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>Money you have lent or borrowed</p>
                    <h1 style={{ ...type.heading, margin: 0 }}>Personal loans</h1>
                </div>
                <div className="fin-page-actions">
                    <Button type="button" onClick={() => setShowAdd(true)}>Add loan</Button>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <SkeletonCard height={160} /><SkeletonCard height={120} />
                </div>
            ) : loadError ? (
                <Card>
                    <CardHeader title="Couldn't load your personal loans" sub="Check your connection and try again."
                        action={<Button type="button" variant="secondary" onClick={refresh}>Try again</Button>} flush />
                </Card>
            ) : loans.length === 0 ? (
                <Card>
                    <CardHeader title="No personal loans yet" sub="Track money you've lent to or borrowed from friends and family."
                        action={<Button type="button" onClick={() => setShowAdd(true)}>Add loan</Button>} flush />
                </Card>
            ) : (
                <>
                    <Card>
                        <p style={{ ...type.label, margin: 0 }}>Net position</p>
                        <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{netText}</p>
                        <p style={{ ...type.meta, margin: '6px 0 0' }}>{positionSentence(net, hasActive, overdueLoans.length)}</p>
                        <div className="dash-stats">
                            <Stat className="dash-stat" label="Owed to you" value={fmt(owedTotal)} sub={plural(owedToYou.length, 'loan')} />
                            <Stat className="dash-stat" label="You owe" value={fmt(oweTotal)} sub={plural(youOwe.length, 'loan')} />
                            <Stat className="dash-stat" label="Overdue" value={String(overdueLoans.length)}
                                sub={firstOverdue && firstOverdue.due_date ? `${firstOverdue.counterparty_name}, since ${formatDate(firstOverdue.due_date)}` : 'None'} />
                        </div>
                    </Card>

                    {hasActive && (
                        <div className="fin-two">
                            {owedToYou.length > 0 && (
                                <Card>
                                    <CardHeader title="Owed to you" sub="Overdue first" action={<span style={type.num}>{fmt(owedTotal)}</span>} />
                                    <Rows>
                                        {owedToYou.map(l => <ActiveLoanRow key={l.id} loan={l} onOpen={setDetailLoanId} onRepay={setRepayLoan} />)}
                                    </Rows>
                                </Card>
                            )}
                            {youOwe.length > 0 && (
                                <Card>
                                    <CardHeader title="You owe" sub="What you have borrowed" action={<span style={type.num}>{fmt(oweTotal)}</span>} />
                                    <Rows>
                                        {youOwe.map(l => <ActiveLoanRow key={l.id} loan={l} onOpen={setDetailLoanId} onRepay={setRepayLoan} />)}
                                    </Rows>
                                    {settled.length > 0 && settledSection(true)}
                                </Card>
                            )}
                        </div>
                    )}

                    {settled.length > 0 && youOwe.length === 0 && (
                        <Card>{settledSection(false)}</Card>
                    )}
                </>
            )}

            <PersonalLoanModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={refresh} />
            <RepaymentModal isOpen={!!repayLoan} onClose={() => setRepayLoan(null)} onSuccess={refresh} loan={repayLoan} />
            <LoanDetailModal isOpen={!!detailLoanId} onClose={() => setDetailLoanId(null)} loanId={detailLoanId} onRepay={setRepayLoan}
                onWriteOff={handleWriteOff} onDelete={handleDelete} />
        </div>
    );
}

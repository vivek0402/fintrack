'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Ban, Handshake } from 'lucide-react';
import { personalLoansAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PersonalLoanModal } from '@/components/personal-loans/PersonalLoanModal';
import { RepaymentModal } from '@/components/personal-loans/RepaymentModal';
import { toast } from '@/store/toastStore';

type Loan = {
    id: string; direction: 'lent' | 'borrowed'; counterparty_name: string;
    principal_amount: number | string; repaid_amount: number | string; outstanding_amount: number | string;
    due_date: string | null; status: 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';
};

const STATUS_LABEL: Record<Loan['status'], string> = {
    outstanding: 'Outstanding', partially_repaid: 'Partially repaid', repaid: 'Repaid', written_off: 'Written off',
};

// principal_amount / repaid_amount / outstanding_amount all come back from the
// API as Postgres NUMERIC strings (e.g. "4000.00"), not JS numbers -- normalize
// before any arithmetic or comparison. See RepaymentModal.tsx for the bug this
// guards against ("4000.00" + 0.01 silently string-concatenates).
function num(v: number | string): number {
    return typeof v === 'string' ? parseFloat(v) : v;
}

function isOverdue(loan: Loan) {
    if (!loan.due_date || loan.status === 'repaid' || loan.status === 'written_off') return false;
    return new Date(loan.due_date) < new Date(new Date().toDateString());
}

function LoanRow({ loan, onRepay, onWriteOff, onDelete }: { loan: Loan; onRepay: (l: Loan) => void; onWriteOff: (l: Loan) => void; onDelete: (l: Loan) => void }) {
    const principal = num(loan.principal_amount);
    const repaid = num(loan.repaid_amount);
    const outstanding = num(loan.outstanding_amount);
    const pct = principal > 0 ? (repaid / principal) * 100 : 0;
    const settled = loan.status === 'repaid' || loan.status === 'written_off';
    return (
        <GCard style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{loan.counterparty_name}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                        <Badge>{STATUS_LABEL[loan.status]}</Badge>
                        {isOverdue(loan) && <Badge color="var(--color-exp)" bg="var(--color-exp-subtle)">Overdue</Badge>}
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: loan.direction === 'lent' ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                    ₹{Math.round(outstanding).toLocaleString('en-IN')}
                </div>
            </div>
            {!settled && <ProgressBar pct={pct} />}
            {!settled && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onRepay(loan)} style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-border)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Record repayment
                    </button>
                    <button onClick={() => onWriteOff(loan)} aria-label="Write off" style={{ width: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Ban size={15} />
                    </button>
                </div>
            )}
            {settled && (
                <button onClick={() => onDelete(loan)} aria-label="Delete" style={{ alignSelf: 'flex-end', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                </button>
            )}
        </GCard>
    );
}

export default function PersonalLoansPage() {
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [repayLoan, setRepayLoan] = useState<Loan | null>(null);

    const refresh = useCallback(() => {
        setLoading(true);
        personalLoansAPI.getAll()
            .then(res => setLoans(res.data.loans || []))
            .catch(() => toast.error('Could not load personal loans'))
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

    const handleDelete = async (loan: Loan) => {
        try {
            await personalLoansAPI.delete(loan.id);
            toast.success('Deleted');
            refresh();
        } catch { toast.error('Could not delete'); }
    };

    const active = loans.filter(l => l.status === 'outstanding' || l.status === 'partially_repaid');
    const settled = loans.filter(l => l.status === 'repaid' || l.status === 'written_off');
    const owedToYou = active.filter(l => l.direction === 'lent');
    const youOwe = active.filter(l => l.direction === 'borrowed');

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: 'var(--space-6) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>Personal Loans</h1>
                <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <Plus size={15} /> Add
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <Skeleton height={80} /><Skeleton height={80} />
                </div>
            ) : loans.length === 0 ? (
                <EmptyState icon={Handshake} title="No personal loans yet" subtitle="Track money you've lent to or borrowed from friends and family." />
            ) : (
                <>
                    {owedToYou.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>Owed to you</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {owedToYou.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                    {youOwe.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>You owe</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {youOwe.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                    {settled.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>Settled</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {settled.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                </>
            )}

            <PersonalLoanModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={refresh} />
            <RepaymentModal isOpen={!!repayLoan} onClose={() => setRepayLoan(null)} onSuccess={refresh} loan={repayLoan} />
        </div>
    );
}

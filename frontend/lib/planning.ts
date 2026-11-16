import { fmt } from '@/lib/utils';

/**
 * Pure logic behind the Financial plan page: the month-one waterfall, the
 * wording of drift rows and the small label helpers.
 */

// Small rounding slack absorbs the engine's per-line Math.round(); anything
// larger is a real reconciliation problem, not display noise.
export const TOLERANCE = 2;

export interface WaterfallRowData {
    label: string;
    amount: number;
    running: number;
    note?: string;
}

export interface Waterfall {
    rows: WaterfallRowData[];
    fixedCosts: number;
    savedAndInvested: number;
    savedPct: number;
    endingBalance: number;
    balanced: boolean;
    deficit: boolean;
}

export function monthlyWaterfall(
    plan: { goal_amount: number | null; goal_name?: string | null; loan_principal: number | null; loan_moratorium_months?: number | null },
    expenses: { name: string; amount: number }[],
    month1: { income: number; loanPayment: number; goalPayment: number; emergencyFundContribution: number; sipContribution: number; deficit?: boolean },
): Waterfall {
    const hasGoal = plan.goal_amount !== null;
    const hasLoan = plan.loan_principal !== null;
    const inMoratorium = hasLoan && (plan.loan_moratorium_months ?? 0) >= 1;

    let running = month1.income;
    const rows: WaterfallRowData[] = [];

    for (const e of expenses) {
        running -= e.amount;
        rows.push({ label: e.name, amount: e.amount, running });
    }
    if (hasLoan) {
        running -= month1.loanPayment;
        rows.push({
            label: 'Loan payment',
            amount: month1.loanPayment,
            running,
            note: inMoratorium ? 'Interest only, moratorium in effect' : undefined,
        });
    }
    if (hasGoal) {
        running -= month1.goalPayment;
        rows.push({ label: `Goal: ${plan.goal_name}`, amount: month1.goalPayment, running });
    }
    running -= month1.emergencyFundContribution;
    rows.push({ label: 'Emergency fund', amount: month1.emergencyFundContribution, running });
    running -= month1.sipContribution;
    rows.push({ label: 'SIP and investments', amount: month1.sipContribution, running });

    const fixedCosts = expenses.reduce((sum, e) => sum + e.amount, 0);
    const savedAndInvested = (hasGoal ? month1.goalPayment : 0) + month1.emergencyFundContribution + month1.sipContribution;
    const savedPct = month1.income > 0 ? Math.round((savedAndInvested / month1.income) * 100) : 0;
    const deficit = !!month1.deficit;

    return {
        rows,
        fixedCosts,
        savedAndInvested,
        savedPct,
        endingBalance: running,
        balanced: Math.abs(running) <= TOLERANCE && !deficit,
        deficit,
    };
}

/** "₹40,000 to ₹46,200 (+16%)". A real minus for decreases, no sign at zero. */
export function driftLabel(oldAmount: number, newAmount: number, pct: number): string {
    const rounded = Math.round(pct);
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${fmt(oldAmount)} to ${fmt(newAmount)} (${sign}${Math.abs(rounded)}%)`;
}

export function riskLabel(profile: string): string {
    switch (profile) {
        case 'safety': return 'Safety first';
        case 'growth': return 'Growth first';
        default: return 'Balanced';
    }
}

/** The loan card's moratorium sentence, or null when there is no moratorium. */
export function moratoriumNote(plan: { loan_moratorium_months?: number | null }): string | null {
    const n = plan.loan_moratorium_months ?? 0;
    if (!(n > 0)) return null;
    return `Interest only for the first ${n} month${n > 1 ? 's' : ''}. The full EMI begins in month ${n + 1}.`;
}

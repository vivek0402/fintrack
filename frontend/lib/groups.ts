/**
 * Pure logic for the Groups page. "Me" is the signed-in user's own member name
 * inside a split; every other name is someone else in the group.
 */

export interface ShareLike { member: string; amount: number; settled: boolean }
export interface SplitLike { paid_by: string; shares: ShareLike[] }

export interface GroupBalances {
    /** What you still owe others: your unsettled share of splits someone else paid. */
    youOwe: number;
    /** What others still owe you: their unsettled shares of splits you paid. */
    owedToYou: number;
    /** Unsettled shares across every split. */
    unsettledCount: number;
}

export function groupBalances(splits: SplitLike[]): GroupBalances {
    const unsettledCount = splits.reduce((s, sp) => s + sp.shares.filter(sh => !sh.settled).length, 0);
    const youOwe = splits.reduce((sum, sp) => {
        const myShare = sp.shares.find(sh => sh.member === 'Me');
        if (myShare && !myShare.settled && sp.paid_by !== 'Me') sum += myShare.amount;
        return sum;
    }, 0);
    const owedToYou = splits.reduce((sum, sp) => {
        if (sp.paid_by === 'Me') sum += sp.shares.filter(sh => sh.member !== 'Me' && !sh.settled).reduce((s, sh) => s + sh.amount, 0);
        return sum;
    }, 0);
    return { youOwe, owedToYou, unsettledCount };
}

/** One sentence under the balance figure. `net` is owedToYou minus youOwe. */
export function balanceSentence(net: number, youOwe: number, owedToYou: number): string {
    if (youOwe === 0 && owedToYou === 0) return 'Nothing is pending.';
    if (net > 0.004) return 'You are owed this by the others once the pending splits are settled.';
    if (net < -0.004) return 'You owe this to the others until the pending splits are settled.';
    return 'You are all square.';
}

/** Splits with an unsettled share first. Stable, and does not mutate the input. */
export function sortSplitsPendingFirst<T extends { shares: { settled: boolean }[] }>(splits: T[]): T[] {
    const pending = (sp: T) => sp.shares.some(sh => !sh.settled);
    return [...splits.filter(pending), ...splits.filter(sp => !pending(sp))];
}

/** Percent of the budget spent, or null when the group has no budget. */
export function budgetPct(spent: number | string, budget: number | string | null | undefined): number | null {
    const b = Number(budget);
    if (!budget || !Number.isFinite(b) || b <= 0) return null;
    return (Number(spent) / b) * 100;
}

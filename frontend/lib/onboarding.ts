/** Pure helpers for the onboarding wizard (app/onboarding/page.tsx). */

/** "Step 2 of 4: Appearance". The Welcome step (index 0) is not counted. */
export function stepProgress(step: number, labels: string[]): string {
    return `Step ${step} of ${labels.length - 1}: ${labels[step]}`;
}

/** Share of the progress bar that is filled, 0 to 100. */
export function progressPercent(step: number, labels: string[]): number {
    return ((step + 1) / labels.length) * 100;
}

/** Label of the final button on the budgets step. */
export function budgetButtonLabel(count: number): string {
    return count > 0
        ? `Set ${count} budget${count > 1 ? 's' : ''} and finish`
        : 'Skip and go to the dashboard';
}

/** "Imported 3 transactions so far." */
export function importedLabel(count: number): string {
    return `Imported ${count} transaction${count !== 1 ? 's' : ''} so far.`;
}

import { describe, it, expect } from 'vitest';
import { stepProgress, progressPercent, budgetButtonLabel, importedLabel } from './onboarding';

const LABELS = ['Welcome', 'Currency', 'Appearance', 'Budgets'];

describe('onboarding helpers', () => {
    it('describes the current step without counting Welcome', () => {
        expect(stepProgress(1, LABELS)).toBe('Step 1 of 3: Currency');
        expect(stepProgress(3, LABELS)).toBe('Step 3 of 3: Budgets');
    });
    it('keeps the bar formula', () => {
        expect(progressPercent(0, LABELS)).toBe(25);
        expect(progressPercent(3, LABELS)).toBe(100);
    });
    it('labels the budget button', () => {
        expect(budgetButtonLabel(0)).toBe('Skip and go to the dashboard');
        expect(budgetButtonLabel(1)).toBe('Set 1 budget and finish');
        expect(budgetButtonLabel(3)).toBe('Set 3 budgets and finish');
    });
    it('pluralises imported count', () => {
        expect(importedLabel(1)).toBe('Imported 1 transaction so far.');
        expect(importedLabel(5)).toBe('Imported 5 transactions so far.');
    });
});

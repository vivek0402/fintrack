import { describe, it, expect } from 'vitest';
import { buildMoreAlerts, daysUntil } from './useMoreAlerts';

const today = new Date(2026, 9, 10); // 10 Oct 2026

describe('daysUntil', () => {
    it('counts whole calendar days, ignoring time of day', () => {
        expect(daysUntil('2026-10-10', today)).toBe(0);
        expect(daysUntil('2026-10-13T00:00:00.000Z', today)).toBe(3);
        expect(daysUntil('2026-10-08', today)).toBe(-2);
    });
});

describe('buildMoreAlerts', () => {
    it('is empty when nothing needs attention', () => {
        expect(buildMoreAlerts({
            budgets: [{ amount: '1000', spent: '400', category_name: 'Food' }],
            goals: [{ name: 'Trip', saved_amount: '10', target_amount: '100' }],
            cards: [{ card_name: 'HDFC', statement_remaining: 5000, statement_due_date: '2026-10-25' }],
            today,
        })).toEqual([]);
    });

    it('flags a card bill due within 5 days, most urgent first', () => {
        const [a] = buildMoreAlerts({
            cards: [
                { card_name: 'ICICI', statement_remaining: 2000, statement_due_date: '2026-10-14' },
                { card_name: 'HDFC', statement_remaining: 8000, statement_due_date: '2026-10-11' },
                { card_name: 'Paid', statement_remaining: 0, statement_due_date: '2026-10-11' },
            ],
            today,
        });
        expect(a).toMatchObject({ href: '/accounts', badge: 'Due 1d', tone: 'bad', urgent: true });
        expect(a.line).toBe('HDFC bill: ₹8,000 due tomorrow · 1 more card due');
    });

    it('flags budgets over limit with the worst one named', () => {
        const [a] = buildMoreAlerts({
            budgets: [
                { amount: '1000', spent: '1200', category_name: 'Transport' },
                { amount: '5000', spent: '6840', category_name: 'Food & Dining' },
                { amount: '0', spent: '50', category_name: 'No limit' },
            ],
            today,
        });
        expect(a).toMatchObject({ href: '/budgets', badge: '2 over', urgent: true });
        expect(a.line).toBe('Food & Dining is ₹1,840 over budget · 1 more over');
    });

    it('flags overdue personal loans and nearly-reached goals as non-urgent', () => {
        const alerts = buildMoreAlerts({
            loans: [
                { counterparty_name: 'Ravi', direction: 'lent', outstanding_amount: '3000.00', due_date: '2026-10-01', status: 'outstanding' },
                { counterparty_name: 'Old', direction: 'lent', outstanding_amount: '0', due_date: '2026-09-01', status: 'repaid' },
            ],
            goals: [{ name: 'Laptop', saved_amount: '95000', target_amount: '100000' }],
            today,
        });
        expect(alerts.map(a => a.href)).toEqual(['/personal-loans', '/goals']);
        expect(alerts[0].line).toBe('Ravi owes you ₹3,000, past due');
        expect(alerts[1]).toMatchObject({ badge: '1 near', tone: 'good', urgent: false });
        expect(alerts.some(a => a.urgent)).toBe(false);
    });

    it('orders by urgency: overdue card, card due, budgets, loans, goals', () => {
        const alerts = buildMoreAlerts({
            goals: [{ name: 'G', saved_amount: '99', target_amount: '100' }],
            budgets: [{ amount: '10', spent: '20', category_name: 'X' }],
            cards: [{ card_name: 'C', statement_remaining: 100, statement_due_date: '2026-10-05' }],
            today,
        });
        expect(alerts.map(a => a.href)).toEqual(['/accounts', '/budgets', '/goals']);
        expect(alerts[0].badge).toBe('Overdue');
    });
});

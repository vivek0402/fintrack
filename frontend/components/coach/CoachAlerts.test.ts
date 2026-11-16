import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAlerts } from './CoachAlerts';

const DAY = 24 * 60 * 60 * 1000;

describe('buildAlerts actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Day 20 of the month, so the big-week branch (needs 7+ days elapsed) is live.
    vi.setSystemTime(new Date(2026, 5, 20, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  const summary = { total_income: 1000, total_expenses: 1500 };

  it('gives budget alerts an Adjust limit link to /budgets', () => {
    const alerts = buildAlerts(summary, [{ id: 'b1', category_id: 'c1', name: 'Food', amount: '100', spent: '90' }], [], []);
    const a = alerts.find(x => x.id === 'budget-c1');
    expect(a?.actionLabel).toBe('Adjust limit');
    expect(a?.href).toBe('/budgets');
  });

  it('gives goal alerts a View goal link to /goals', () => {
    const goal: any = {
      id: 'g1', name: 'Trip', target_amount: '1000', saved_amount: '100',
      deadline: new Date(Date.now() + 20 * DAY).toISOString(),
    };
    const alerts = buildAlerts(summary, [], [goal], []);
    const a = alerts.find(x => x.id === 'goal-g1');
    expect(a?.actionLabel).toBe('View goal');
    expect(a?.href).toBe('/goals');
  });

  it('gives recurring-due alerts a View link to the recurring tab', () => {
    const rec = { id: 'r1', description: 'Rent', amount: '500', is_active: true, next_due: new Date(Date.now() + 1 * DAY).toISOString() };
    const alerts = buildAlerts(summary, [], [], [rec]);
    const a = alerts.find(x => x.id === 'rec-r1');
    expect(a?.actionLabel).toBe('View');
    expect(a?.href).toBe('/budgets?tab=recurring');
  });

  it('gives the big-week alert a See budgets link to /budgets', () => {
    const alerts = buildAlerts(summary, [], [], []);
    const a = alerts.find(x => x.id === 'big-week');
    expect(a?.actionLabel).toBe('See budgets');
    expect(a?.href).toBe('/budgets');
  });
});

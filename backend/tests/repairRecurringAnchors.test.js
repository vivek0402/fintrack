const { planRecurringRepairs, parseArgs, monthsBetween } = require('../scripts/repair-recurring-anchors');

// An item first due Jan 31 under the old overflow math: Jan 31, Mar 3,
// Apr 3, ... then migration 076 pinned it to the 3rd.
const drifted = { id: 'r1', user_id: 'u1', description: 'Rent', amount: '1000.00', day_of_month: 3, next_due_date: '2027-05-03' };
const driftedPostings = ['2027-01-31', '2027-03-03', '2027-04-03'];

describe('planRecurringRepairs', () => {
    test('re-anchors a drifted item on its first posting day, moving next due later in the same month', () => {
        const plan = planRecurringRepairs([drifted], { r1: driftedPostings });
        expect(plan.reanchor).toEqual([expect.objectContaining({
            id: 'r1', from_day: 3, to_day: 31, from_next_due: '2027-05-03', to_next_due: '2027-05-31',
        })]);
    });

    test('lists the skipped month but never proposes posting it', () => {
        const plan = planRecurringRepairs([drifted], { r1: driftedPostings });
        expect(plan.missedMonths).toEqual([expect.objectContaining({ id: 'r1', months: ['2027-02'] })]);
    });

    test('clamps the new next due date to a short month', () => {
        const item = { ...drifted, next_due_date: '2027-06-03' };
        const plan = planRecurringRepairs([item], { r1: driftedPostings });
        expect(plan.reanchor[0].to_next_due).toBe('2027-06-30');
    });

    test('leaves items alone when the first posting is not on the 29th-31st', () => {
        const item = { ...drifted, day_of_month: 10, next_due_date: '2027-05-10' };
        const plan = planRecurringRepairs([item], { r1: ['2027-01-10', '2027-02-10'] });
        expect(plan.reanchor).toEqual([]);
    });

    test('a correctly anchored day-31 item (clamped in February) is not touched', () => {
        const item = { ...drifted, day_of_month: 31, next_due_date: '2027-04-30' };
        const plan = planRecurringRepairs([item], { r1: ['2027-01-31', '2027-02-28', '2027-03-31'] });
        expect(plan.reanchor).toEqual([]);
        expect(plan.missedMonths).toEqual([]);
    });

    test('idempotent: once re-anchored, a re-run proposes nothing', () => {
        const fixed = { ...drifted, day_of_month: 31, next_due_date: '2027-05-31' };
        expect(planRecurringRepairs([fixed], { r1: driftedPostings }).reanchor).toEqual([]);
    });

    test('--exclude moves a proposal to the excluded list', () => {
        const plan = planRecurringRepairs([drifted], { r1: driftedPostings }, { exclude: new Set(['r1']) });
        expect(plan.reanchor).toEqual([]);
        expect(plan.excluded).toHaveLength(1);
    });

    test('items with no postings are skipped', () => {
        expect(planRecurringRepairs([drifted], {}).reanchor).toEqual([]);
    });
});

describe('helpers', () => {
    test('monthsBetween is inclusive and crosses years', () => {
        expect(monthsBetween('2026-11-30', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    });

    test('parseArgs rejects unknown flags and non-UUID users', () => {
        expect(() => parseArgs(['--nope'])).toThrow();
        expect(() => parseArgs(['--user', 'x'])).toThrow();
        expect(parseArgs(['--apply', '--exclude', 'a,b'])).toEqual(expect.objectContaining({ apply: true }));
    });
});

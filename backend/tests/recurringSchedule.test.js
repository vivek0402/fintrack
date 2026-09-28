const { nextRecurringDate, firstRecurringDueDate } = require('../src/utils/recurringSchedule');

const monthly = (day_of_month) => ({ frequency: 'monthly', day_of_month });

// Follow an item through `n` occurrences starting at `start`.
function chain(item, start, n) {
    const out = [start];
    for (let i = 1; i < n; i++) out.push(nextRecurringDate(item, out[i - 1]));
    return out;
}

describe('nextRecurringDate: monthly with day_of_month', () => {
    test('day 31 clamps to short months and returns to 31 (non-leap year)', () => {
        expect(chain(monthly(31), '2027-01-31', 8)).toEqual([
            '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30',
            '2027-05-31', '2027-06-30', '2027-07-31', '2027-08-31',
        ]);
    });

    test('day 31 in a leap year lands on Feb 29', () => {
        expect(chain(monthly(31), '2028-01-31', 3)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
    });

    test('day 30: Feb clamps, then back to the 30th', () => {
        expect(chain(monthly(30), '2027-01-30', 4)).toEqual(['2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30']);
        expect(chain(monthly(30), '2028-01-30', 3)).toEqual(['2028-01-30', '2028-02-29', '2028-03-30']);
    });

    test('day 29: Feb 28 in a non-leap year, Feb 29 in a leap year', () => {
        expect(chain(monthly(29), '2027-01-29', 3)).toEqual(['2027-01-29', '2027-02-28', '2027-03-29']);
        expect(chain(monthly(29), '2028-01-29', 3)).toEqual(['2028-01-29', '2028-02-29', '2028-03-29']);
    });

    test('30-day months: day 31 -> Apr 30 -> May 31 (no month skipped)', () => {
        expect(nextRecurringDate(monthly(31), '2026-03-31')).toBe('2026-04-30');
        expect(nextRecurringDate(monthly(31), '2026-04-30')).toBe('2026-05-31');
    });

    test('crosses the year boundary', () => {
        expect(nextRecurringDate(monthly(31), '2026-12-31')).toBe('2027-01-31');
        expect(nextRecurringDate(monthly(15), '2026-12-15')).toBe('2027-01-15');
    });

    test('an already-drifted row (day_of_month set) snaps back to its anchor', () => {
        // Old code turned Jan 31 into Mar 3; the next step goes to Apr 30.
        expect(nextRecurringDate(monthly(31), '2027-03-03')).toBe('2027-04-30');
    });

    test('accepts a pg DATE value (JS Date at local midnight)', () => {
        expect(nextRecurringDate(monthly(31), new Date(2027, 0, 31))).toBe('2027-02-28');
    });
});

describe('nextRecurringDate: monthly without day_of_month', () => {
    test('anchors on the current due date and clamps (Jan 31 -> Feb 28, not Mar 3)', () => {
        expect(nextRecurringDate(monthly(null), '2027-01-31')).toBe('2027-02-28');
        expect(nextRecurringDate(monthly(undefined), '2026-03-31')).toBe('2026-04-30');
        expect(nextRecurringDate(monthly(null), '2026-06-10')).toBe('2026-07-10');
    });

    test('limitation: with no stored anchor, a clamped date stays clamped', () => {
        expect(chain(monthly(null), '2027-01-31', 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-28']);
    });
});

describe('nextRecurringDate: daily and weekly', () => {
    test('daily and weekly step calendar days across month/year/leap boundaries', () => {
        expect(nextRecurringDate({ frequency: 'daily' }, '2026-12-31')).toBe('2027-01-01');
        expect(nextRecurringDate({ frequency: 'daily' }, '2028-02-28')).toBe('2028-02-29');
        expect(nextRecurringDate({ frequency: 'weekly' }, '2026-12-28')).toBe('2027-01-04');
        expect(nextRecurringDate({ frequency: 'weekly' }, '2027-02-25')).toBe('2027-03-04');
    });

    test('unknown frequency throws instead of leaving the date unchanged', () => {
        expect(() => nextRecurringDate({ frequency: 'yearly' }, '2026-01-01')).toThrow(/Unsupported/);
    });
});

describe('firstRecurringDueDate', () => {
    test('monthly day still ahead this month -> this month', () => {
        expect(firstRecurringDueDate(monthly(20), '2026-09-10')).toBe('2026-09-20');
    });

    test('monthly day today or passed -> next month', () => {
        expect(firstRecurringDueDate(monthly(10), '2026-09-10')).toBe('2026-10-10');
        expect(firstRecurringDueDate(monthly(5), '2026-12-10')).toBe('2027-01-05');
    });

    test('day 31 created in a short month clamps instead of overflowing', () => {
        // Old code: setUTCDate(31) in February -> Mar 3.
        expect(firstRecurringDueDate(monthly(31), '2027-02-10')).toBe('2027-02-28');
        expect(firstRecurringDueDate(monthly(31), '2027-02-28')).toBe('2027-03-31');
        // Old code: Jan 31 + setUTCMonth(+1) -> Mar 3.
        expect(firstRecurringDueDate(monthly(30), '2027-01-31')).toBe('2027-02-28');
    });

    test('weekly -> a week out, daily/monthly-without-day -> tomorrow', () => {
        expect(firstRecurringDueDate({ frequency: 'weekly' }, '2026-12-28')).toBe('2027-01-04');
        expect(firstRecurringDueDate({ frequency: 'daily' }, '2026-12-31')).toBe('2027-01-01');
        expect(firstRecurringDueDate(monthly(null), '2026-09-10')).toBe('2026-09-11');
    });
});

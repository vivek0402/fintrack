const {
    istDateStr,
    istMonthYear,
    istDayOfMonth,
    istDaysInMonth,
    istMonthStart,
    istPriorMonthStart,
    istNextMonthStart,
    istMonthsAgoStart,
    mondayOf,
} = require('../src/utils/istDate');

describe('istDateStr', () => {
    test('a moment already tomorrow in IST but still today in UTC reports the IST date', () => {
        // 2026-01-15 01:00 IST == 2026-01-14 19:30 UTC. A UTC-based dateStr
        // would report 2026-01-14 here -- almost 5.5 hours into "tomorrow"
        // for every user of this India-only app. Same case the daily-brief
        // regression test pins for the relocated `dateStr` export.
        const ts = new Date('2026-01-14T19:30:00.000Z');
        expect(istDateStr(ts)).toBe('2026-01-15');
    });

    test('a moment still today in both IST and UTC agrees with the UTC date', () => {
        const ts = new Date('2026-01-15T10:00:00.000Z'); // 2026-01-15 15:30 IST
        expect(istDateStr(ts)).toBe('2026-01-15');
    });
});

describe('istMonthYear', () => {
    test('a moment already in the next IST month but still the prior UTC month', () => {
        // 2026-01-31 19:00 UTC == 2026-02-01 00:30 IST.
        const ts = new Date('2026-01-31T19:00:00.000Z');
        expect(istMonthYear(ts)).toEqual({ month: 2, year: 2026 });
    });

    test('a normal mid-month moment', () => {
        const ts = new Date('2026-06-15T10:00:00.000Z'); // 2026-06-15 15:30 IST
        expect(istMonthYear(ts)).toEqual({ month: 6, year: 2026 });
    });
});

describe('istDayOfMonth', () => {
    test('the Jan-31-UTC/Feb-1-IST boundary moment reports day 1, not 31', () => {
        const ts = new Date('2026-01-31T19:00:00.000Z');
        expect(istDayOfMonth(ts)).toBe(1);
    });
});

describe('istDaysInMonth', () => {
    test('February in a leap year has 29 days', () => {
        const ts = new Date('2028-02-10T10:00:00.000Z');
        expect(istDaysInMonth(ts)).toBe(29);
    });

    test('February in a non-leap year has 28 days', () => {
        const ts = new Date('2026-02-10T10:00:00.000Z');
        expect(istDaysInMonth(ts)).toBe(28);
    });

    test('a 31-day month reports 31', () => {
        const ts = new Date('2026-01-10T10:00:00.000Z');
        expect(istDaysInMonth(ts)).toBe(31);
    });
});

describe('istMonthStart', () => {
    test('a mid-month moment resolves to the correct YYYY-MM-01', () => {
        const ts = new Date('2026-06-15T10:00:00.000Z');
        expect(istMonthStart(ts)).toBe('2026-06-01');
    });

    test('the Jan-31-UTC/Feb-1-IST boundary moment resolves to February', () => {
        const ts = new Date('2026-01-31T19:00:00.000Z');
        expect(istMonthStart(ts)).toBe('2026-02-01');
    });
});

describe('istPriorMonthStart', () => {
    test('a moment in February resolves to January\'s start', () => {
        const ts = new Date('2026-02-15T10:00:00.000Z');
        expect(istPriorMonthStart(ts)).toBe('2026-01-01');
    });

    test('a moment in January resolves to the PREVIOUS YEAR\'s December start', () => {
        const ts = new Date('2026-01-15T10:00:00.000Z');
        expect(istPriorMonthStart(ts)).toBe('2025-12-01');
    });
});

describe('istNextMonthStart', () => {
    test('a moment in November resolves to December\'s start', () => {
        const ts = new Date('2026-11-15T10:00:00.000Z');
        expect(istNextMonthStart(ts)).toBe('2026-12-01');
    });

    test('a moment in December resolves to the NEXT YEAR\'s January start', () => {
        const ts = new Date('2026-12-15T10:00:00.000Z');
        expect(istNextMonthStart(ts)).toBe('2027-01-01');
    });
});

describe('istMonthsAgoStart', () => {
    test('3 months back from February rolls over into the previous year\'s November', () => {
        const ts = new Date('2026-02-15T10:00:00.000Z'); // Feb 2026
        expect(istMonthsAgoStart(3, ts)).toBe('2025-11-01');
    });

    test('a simple same-year case: 3 months back from June is March', () => {
        const ts = new Date('2026-06-15T10:00:00.000Z');
        expect(istMonthsAgoStart(3, ts)).toBe('2026-03-01');
    });

    test('negative n (reaching into the future) agrees with istNextMonthStart for n=-1', () => {
        const ts = new Date('2026-11-15T10:00:00.000Z');
        expect(istMonthsAgoStart(-1, ts)).toBe(istNextMonthStart(ts));
    });

    test('negative n across a year boundary agrees with istNextMonthStart', () => {
        const ts = new Date('2026-12-15T10:00:00.000Z');
        expect(istMonthsAgoStart(-1, ts)).toBe(istNextMonthStart(ts));
        expect(istMonthsAgoStart(-1, ts)).toBe('2027-01-01');
    });

    test('n=1 agrees with istPriorMonthStart', () => {
        const ts = new Date('2026-01-15T10:00:00.000Z');
        expect(istMonthsAgoStart(1, ts)).toBe(istPriorMonthStart(ts));
        expect(istMonthsAgoStart(1, ts)).toBe('2025-12-01');
    });
});

describe('mondayOf', () => {
    test('a moment already Monday in IST but still Sunday in UTC returns the CURRENT week\'s Monday', () => {
        // 2026-01-04 is a Sunday (UTC calendar). 19:00 UTC + 5:30 = 00:30 IST
        // on 2026-01-05, which is a Monday -- so IST is already into the new
        // week while UTC is still on the old one. The buggy UTC-based
        // mondayOf this replaces would anchor on Sunday 2026-01-04 and walk
        // back to the PRIOR week's Monday (2025-12-29) instead of returning
        // 2026-01-05, the week that has actually already started in IST.
        const ts = new Date('2026-01-04T19:00:00.000Z');
        expect(mondayOf(ts)).toBe('2026-01-05');
    });

    test('a normal mid-week moment resolves to that week\'s Monday', () => {
        // 2026-01-07 is a Wednesday; its week's Monday is 2026-01-05.
        const ts = new Date('2026-01-07T10:00:00.000Z');
        expect(mondayOf(ts)).toBe('2026-01-05');
    });
});

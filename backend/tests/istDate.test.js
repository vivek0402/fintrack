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
    istMostRecentDayOfMonth,
    istAddDays,
    istDaysBetween,
    calendarDateStr,
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

describe('istMostRecentDayOfMonth', () => {
    test('this month\'s day already occurred: returns it unchanged', () => {
        expect(istMostRecentDayOfMonth(5, '2026-06-20')).toBe('2026-06-05');
    });

    test('this month\'s day has not happened yet: rolls back to last month', () => {
        expect(istMostRecentDayOfMonth(25, '2026-06-20')).toBe('2026-05-25');
    });

    test('the day exactly today counts as already occurred, not future', () => {
        expect(istMostRecentDayOfMonth(20, '2026-06-20')).toBe('2026-06-20');
    });

    test('rolling back crosses a year boundary correctly', () => {
        expect(istMostRecentDayOfMonth(10, '2026-01-05')).toBe('2025-12-10');
    });

    // A calendar-invalid-but-lexicographically-valid intermediate string
    // (February has no 31st) is intentional, not a bug -- '2026-02-31' still
    // compares correctly as "after" any real February date, so the rollback
    // fires, and istAddMonths then resolves the result to a real day in the
    // TARGET month (January), which does have a 31st, rather than clamping
    // against the nonexistent February date.
    test('day that does not exist in the current month (e.g. 31 in February) still rolls back correctly', () => {
        expect(istMostRecentDayOfMonth(31, '2026-02-15')).toBe('2026-01-31');
    });

    test('defaults todayStr to the real current IST date when omitted', () => {
        // Just prove it doesn't throw and produces a sane, non-future result.
        expect(istMostRecentDayOfMonth(1) <= istDateStr()).toBe(true);
    });

    // Same spirit as istAddMonths's own IST-boundary test: a moment where
    // the UTC calendar day is still Jan 31 but IST has already rolled into
    // Feb 1. A naive implementation reading day/month/year off a raw
    // (UTC or server-local) Date -- today.getMonth() = January (0), day 1
    // <= 31 -- would return Jan 1, a WHOLE MONTH stale, not just hours off.
    // This function instead takes the already-resolved IST calendar-date
    // string (istDateStr(ts)) and correctly returns Feb 1 -- today's
    // occurrence, not last month's.
    test('IST-vs-naive-UTC boundary: picks the correct month, not a UTC-lagged one', () => {
        const ts = new Date('2026-01-31T19:00:00.000Z'); // 2026-02-01 00:30 IST
        const todayIst = istDateStr(ts);
        expect(todayIst).toBe('2026-02-01');
        expect(istMostRecentDayOfMonth(1, todayIst)).toBe('2026-02-01');

        // What a naive UTC-field-based computation would have produced
        // instead, for contrast -- the exact bug this fix avoids.
        const naiveUtcResult = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}-01`;
        expect(naiveUtcResult).toBe('2026-01-01');
        expect(istMostRecentDayOfMonth(1, todayIst)).not.toBe(naiveUtcResult);
    });
});

describe('istAddDays', () => {
    test('adds and subtracts whole calendar days', () => {
        expect(istAddDays('2026-09-28', 3)).toBe('2026-10-01');
        expect(istAddDays('2026-09-28', -7)).toBe('2026-09-21');
        expect(istAddDays('2026-09-28', 0)).toBe('2026-09-28');
    });

    test('crosses month, year and leap-day boundaries', () => {
        expect(istAddDays('2026-12-30', 3)).toBe('2027-01-02');
        expect(istAddDays('2027-01-02', -3)).toBe('2026-12-30');
        expect(istAddDays('2028-02-28', 1)).toBe('2028-02-29');
        expect(istAddDays('2027-02-28', 1)).toBe('2027-03-01');
    });

    test('"today + 3" between 00:00 and 05:30 IST uses the IST date, not the UTC one', () => {
        // 2026-01-15 01:00 IST == 2026-01-14 19:30 UTC.
        const ts = new Date('2026-01-14T19:30:00.000Z');
        expect(istAddDays(istDateStr(ts), 3)).toBe('2026-01-18');
        // The old `new Date(Date.now() + 3 days).toISOString()` form gives the UTC answer.
        expect(new Date(ts.getTime() + 3 * 86400000).toISOString().split('T')[0]).toBe('2026-01-17');
    });

    test('just before and just after IST midnight', () => {
        expect(istAddDays(istDateStr(new Date('2026-03-31T18:29:59.000Z')), 1)).toBe('2026-04-01'); // 23:59:59 IST Mar 31
        expect(istAddDays(istDateStr(new Date('2026-03-31T18:30:00.000Z')), 1)).toBe('2026-04-02'); // 00:00 IST Apr 1
        expect(istAddDays(istDateStr(new Date('2026-03-31T23:59:00.000Z')), 1)).toBe('2026-04-02'); // 05:29 IST Apr 1
        expect(istAddDays(istDateStr(new Date('2026-04-01T00:00:00.000Z')), 1)).toBe('2026-04-02'); // 05:30 IST Apr 1
    });
});

describe('istDaysBetween', () => {
    test('whole calendar days, negative when the target is earlier', () => {
        expect(istDaysBetween('2026-09-28', '2026-10-05')).toBe(7);
        expect(istDaysBetween('2026-09-28', '2026-09-28')).toBe(0);
        expect(istDaysBetween('2026-09-28', '2026-09-26')).toBe(-2);
        expect(istDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
        expect(istDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    });

    test('"days left" between 00:00 and 05:30 IST counts from the IST date', () => {
        // 2026-01-15 02:00 IST == 2026-01-14 20:30 UTC; a deadline on Jan 16 is 1 day away in IST.
        const ts = new Date('2026-01-14T20:30:00.000Z');
        expect(istDaysBetween(istDateStr(ts), '2026-01-16')).toBe(1);
        // A UTC-date-based count would say 2.
        expect(istDaysBetween(ts.toISOString().split('T')[0], '2026-01-16')).toBe(2);
    });
});

describe('calendarDateStr', () => {
    test('a pg DATE value (JS Date at local midnight) keeps its calendar day', () => {
        expect(calendarDateStr(new Date(2026, 9, 5))).toBe('2026-10-05');
        expect(calendarDateStr(new Date(2027, 0, 1))).toBe('2027-01-01');
    });

    test('strings are cut to their date part', () => {
        expect(calendarDateStr('2026-10-05')).toBe('2026-10-05');
        expect(calendarDateStr('2026-10-05T00:00:00.000Z')).toBe('2026-10-05');
    });
});

describe('istDayOfMonth / istDaysInMonth between 00:00 and 05:30 IST', () => {
    test('the first IST hours of a month already count as that month', () => {
        // 2026-05-01 03:00 IST == 2026-04-30 21:30 UTC.
        const ts = new Date('2026-04-30T21:30:00.000Z');
        expect(istDayOfMonth(ts)).toBe(1);
        expect(istDaysInMonth(ts)).toBe(31); // May, not April's 30
        expect(istDaysInMonth(ts) - istDayOfMonth(ts)).toBe(30);
    });

    test('last IST day of a month, early morning', () => {
        // 2026-09-30 01:00 IST == 2026-09-29 19:30 UTC -> 0 days left, not 1.
        const ts = new Date('2026-09-29T19:30:00.000Z');
        expect(istDaysInMonth(ts) - istDayOfMonth(ts)).toBe(0);
    });
});

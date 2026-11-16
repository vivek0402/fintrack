import { describe, it, expect } from 'vitest';
import { daysLeft, goalStatus, monthlyNeeded, groupGoals, goalsSummary, type GoalItem } from './goals';

const today = new Date(2026, 10, 16, 15, 30); // 16 Nov 2026, mid-afternoon

const goal = (o: Partial<GoalItem>): GoalItem => ({
    id: 'g', name: 'Laptop', target_amount: 1000, saved_amount: 0, deadline: undefined, ...o,
});

describe('daysLeft', () => {
    it('counts whole days and ignores the time of day', () => {
        expect(daysLeft('2026-11-17', today)).toBe(1);
        expect(daysLeft('2026-11-16', today)).toBe(0);
        expect(daysLeft('2026-12-16', today)).toBe(30);
    });
    it('goes negative once passed', () => {
        expect(daysLeft('2026-11-10', today)).toBe(-6);
    });
    it('reads only the first 10 characters of an ISO string', () => {
        expect(daysLeft('2026-11-20T18:30:00.000Z', today)).toBe(4);
    });
    it('is null with no or unparseable deadline', () => {
        expect(daysLeft(undefined, today)).toBeNull();
        expect(daysLeft(null, today)).toBeNull();
        expect(daysLeft('', today)).toBeNull();
        expect(daysLeft('soon', today)).toBeNull();
    });
});

describe('goalStatus', () => {
    it('is reached at exactly the target and above', () => {
        expect(goalStatus(goal({ saved_amount: 1000 }), today)).toBe('reached');
        expect(goalStatus(goal({ saved_amount: 1200 }), today)).toBe('reached');
        expect(goalStatus(goal({ saved_amount: 999 }), today)).toBe('progress');
    });
    it('needs attention when the deadline has passed', () => {
        expect(goalStatus(goal({ saved_amount: 900, deadline: '2026-11-10' }), today)).toBe('attention');
    });
    it('needs attention inside 60 days and under half saved, not at exactly half', () => {
        expect(goalStatus(goal({ saved_amount: 499, deadline: '2026-12-20' }), today)).toBe('attention');
        expect(goalStatus(goal({ saved_amount: 500, deadline: '2026-12-20' }), today)).toBe('progress');
    });
    it('treats exactly 60 days as inside and 61 as outside', () => {
        expect(goalStatus(goal({ deadline: '2027-01-15' }), today)).toBe('attention'); // 60 days
        expect(goalStatus(goal({ deadline: '2027-01-16' }), today)).toBe('progress'); // 61 days
    });
    it('is progress with no deadline, and counts junk amounts as 0', () => {
        expect(goalStatus(goal({}), today)).toBe('progress');
        expect(goalStatus(goal({ saved_amount: 'oops' }), today)).toBe('progress');
    });
});

describe('monthlyNeeded', () => {
    it('spreads what is left over the months to the deadline', () => {
        expect(monthlyNeeded(goal({ saved_amount: 400, deadline: '2027-02-14' }), today)).toBeCloseTo(600 / (90 / 30));
    });
    it('never divides by less than one month', () => {
        expect(monthlyNeeded(goal({ saved_amount: 400, deadline: '2026-11-21' }), today)).toBe(600);
    });
    it('is null with no deadline, a passed or same-day deadline, or when reached', () => {
        expect(monthlyNeeded(goal({}), today)).toBeNull();
        expect(monthlyNeeded(goal({ deadline: '2026-11-10' }), today)).toBeNull();
        expect(monthlyNeeded(goal({ deadline: '2026-11-16' }), today)).toBeNull();
        expect(monthlyNeeded(goal({ saved_amount: 1000, deadline: '2027-01-01' }), today)).toBeNull();
    });
});

describe('groupGoals', () => {
    it('sorts attention soonest first with passed deadlines leading', () => {
        const list = [
            goal({ id: 'a', deadline: '2026-12-10' }),
            goal({ id: 'b', deadline: '2026-11-01' }),
            goal({ id: 'c', deadline: '2026-11-30' }),
        ];
        expect(groupGoals(list, today).attention.map(g => g.id)).toEqual(['b', 'c', 'a']);
    });
    it('sorts progress soonest first with deadline-less goals last', () => {
        const list = [
            goal({ id: 'none' }),
            goal({ id: 'late', deadline: '2027-09-01', saved_amount: 600 }),
            goal({ id: 'soon', deadline: '2027-03-01', saved_amount: 600 }),
        ];
        expect(groupGoals(list, today).progress.map(g => g.id)).toEqual(['soon', 'late', 'none']);
    });
    it('sorts reached by highest target and keeps groups apart', () => {
        const list = [
            goal({ id: 'small', target_amount: 100, saved_amount: 100 }),
            goal({ id: 'big', target_amount: 5000, saved_amount: 5000 }),
            goal({ id: 'open' }),
        ];
        const g = groupGoals(list, today);
        expect(g.reached.map(x => x.id)).toEqual(['big', 'small']);
        expect(g.progress.map(x => x.id)).toEqual(['open']);
        expect(g.attention).toEqual([]);
    });
});

describe('goalsSummary', () => {
    it('is all zeros for an empty list', () => {
        expect(goalsSummary([], today)).toEqual({
            totalSaved: 0, totalTarget: 0, toGo: 0, pct: 0, neededMonthly: 0, next: null, reachedCount: 0, count: 0,
        });
    });
    it('adds up totals, percentage, reached count and monthly need', () => {
        const list = [
            goal({ id: 'a', target_amount: '1000', saved_amount: '250', deadline: '2027-02-14' }),
            goal({ id: 'b', target_amount: 500, saved_amount: 500 }),
            goal({ id: 'c', target_amount: 500, saved_amount: 0 }),
        ];
        const s = goalsSummary(list, today);
        expect(s.totalSaved).toBe(750);
        expect(s.totalTarget).toBe(2000);
        expect(s.toGo).toBe(1250);
        expect(s.pct).toBe(38);
        expect(s.reachedCount).toBe(1);
        expect(s.count).toBe(3);
        expect(s.neededMonthly).toBeCloseTo(750 / 3);
    });
    it('caps the percentage at 100 and never reports a negative to-go', () => {
        const s = goalsSummary([goal({ target_amount: 100, saved_amount: 250 })], today);
        expect(s.pct).toBe(100);
        expect(s.toGo).toBe(0);
    });
    it('picks the incomplete goal with the soonest non-passed deadline', () => {
        const list = [
            goal({ id: 'passed', name: 'Old', deadline: '2026-10-01' }),
            goal({ id: 'done', name: 'Done', saved_amount: 1000, deadline: '2026-11-18' }),
            goal({ id: 'far', name: 'Far', deadline: '2027-06-05' }),
            goal({ id: 'near', name: 'Near', deadline: '2026-12-20' }),
        ];
        expect(goalsSummary(list, today).next).toEqual({ name: 'Near', daysLeft: 34, label: '20 Dec' });
    });
    it('appends the year to the next label when it is not the current year', () => {
        const s = goalsSummary([goal({ name: 'Trip', deadline: '2027-03-05' })], today);
        expect(s.next?.label).toBe('5 Mar 2027');
    });
    it('has no next goal when none has an upcoming deadline', () => {
        expect(goalsSummary([goal({}), goal({ deadline: '2026-01-01' })], today).next).toBeNull();
    });
});

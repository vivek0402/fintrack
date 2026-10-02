import { describe, it, expect, beforeEach } from 'vitest';
import { pinnedMorePages, recordMoreVisit, DEFAULT_PINS } from './morePins';

const PAGES = ['/budgets', '/goals', '/accounts', '/ai-advisor', '/net-worth'];

beforeEach(() => localStorage.clear());

describe('More pinned shortcuts', () => {
    it('starts with Budgets, Goals and Accounts', () => {
        expect(pinnedMorePages()).toEqual(DEFAULT_PINS);
    });

    it('promotes the most-visited More pages, topping up with defaults', () => {
        for (let i = 0; i < 3; i++) recordMoreVisit('/ai-advisor', PAGES);
        recordMoreVisit('/net-worth/', PAGES);
        recordMoreVisit('/dashboard', PAGES);          // a main tab: not counted
        expect(pinnedMorePages()).toEqual(['/ai-advisor', '/net-worth', '/budgets']);
    });

    it('never pins the same page twice', () => {
        recordMoreVisit('/goals', PAGES);
        expect(pinnedMorePages()).toEqual(['/goals', '/budgets', '/accounts']);
    });

    it('survives corrupt storage', () => {
        localStorage.setItem('fintrack-more-visits', '{not json');
        expect(pinnedMorePages()).toEqual(DEFAULT_PINS);
    });
});

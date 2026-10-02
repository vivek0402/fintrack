import { describe, it, expect, beforeEach } from 'vitest';
import { usesBankAccount, suggestAccount, rememberAccount, descKey } from './accountMemory';

const accounts = [{ id: 1, is_default: true }, { id: 2 }, { id: 3 }];

beforeEach(() => localStorage.clear());

describe('usesBankAccount', () => {
    it('only UPI, debit card, net banking and income touch a bank balance', () => {
        expect(usesBankAccount('expense', 'UPI')).toBe(true);
        expect(usesBankAccount('expense', 'Debit Card')).toBe(true);
        expect(usesBankAccount('expense', 'Net Banking')).toBe(true);
        expect(usesBankAccount('income', 'Cash')).toBe(true);
        expect(usesBankAccount('expense', 'Cash')).toBe(false);
        expect(usesBankAccount('expense', 'Credit Card')).toBe(false);
        expect(usesBankAccount('expense', 'Wallet')).toBe(false);
    });
});

describe('suggestAccount', () => {
    const ask = (description: string, paymentMethod = 'UPI', type = 'expense') =>
        suggestAccount('u1', { description, type, paymentMethod }, accounts);

    it('falls back to the default account', () => {
        expect(ask('Swiggy')).toEqual({ id: 1, why: 'your default' });
    });

    it('prefers the account last used for this description, then for this method', () => {
        rememberAccount('u1', { description: 'Swiggy', type: 'expense', paymentMethod: 'UPI', accountId: 2 });
        rememberAccount('u1', { description: 'Rent', type: 'expense', paymentMethod: 'Net Banking', accountId: 3 });
        expect(ask('swiggy!!')).toEqual({ id: 2, why: 'last used for swiggy!!' });   // description, case/punctuation-insensitive
        expect(ask('Uber')).toEqual({ id: 2, why: 'usual for UPI' });              // method memory
        expect(ask('Electricity', 'Net Banking')).toEqual({ id: 3, why: 'usual for Net Banking' });
        expect(ask('Salary', 'Cash', 'income')).toEqual({ id: 1, why: 'your default' });
    });

    it('ignores a remembered account that no longer exists', () => {
        rememberAccount('u1', { description: 'Swiggy', type: 'expense', paymentMethod: 'UPI', accountId: 99 });
        expect(ask('Swiggy')).toEqual({ id: 1, why: 'your default' });
    });

    it('keeps memories per user', () => {
        rememberAccount('u2', { description: 'Swiggy', type: 'expense', paymentMethod: 'UPI', accountId: 3 });
        expect(ask('Swiggy')?.id).toBe(1);
    });

    it('treats very short descriptions as no description', () => {
        expect(descKey('ab')).toBe('');
        expect(descKey('  Big   Bazaar! ')).toBe('big bazaar');
    });
});

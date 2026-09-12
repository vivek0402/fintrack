import { describe, it, expect } from 'vitest';
import { guessCategoryIcon } from './categoryIcons';

describe('guessCategoryIcon', () => {
    it('matches a keyword mirroring a default category name', () => {
        expect(guessCategoryIcon('Petrol')).toBe('⛽');
        expect(guessCategoryIcon('Groceries')).toBe('🛒');
    });

    it('matches a category beyond the seeded defaults', () => {
        expect(guessCategoryIcon('Pet Care')).toBe('🐾');
        expect(guessCategoryIcon('Gym Membership')).toBe('🏋️');
    });

    it('is case-insensitive', () => {
        expect(guessCategoryIcon('RENT')).toBe('🏠');
    });

    it('does not let "car" match inside "Personal Care"', () => {
        expect(guessCategoryIcon('Personal Care')).toBe('💆');
    });

    it('falls back to the generic box for an unrecognized name', () => {
        expect(guessCategoryIcon("Kevin's Fund")).toBe('📦');
    });

    it('falls back to the generic box for an empty name', () => {
        expect(guessCategoryIcon('   ')).toBe('📦');
    });
});

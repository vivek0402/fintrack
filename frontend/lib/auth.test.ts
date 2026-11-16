import { describe, it, expect } from 'vitest';
import { passwordStrength } from './auth';

describe('passwordStrength', () => {
    it('is level 0 with no label for an empty password', () => {
        expect(passwordStrength('')).toEqual({ level: 0, label: '' });
    });
    it('is too short under 6 characters', () => {
        expect(passwordStrength('abcde')).toEqual({ level: 1, label: 'Too short' });
    });
    it('is fair at 6 or 7 characters', () => {
        expect(passwordStrength('abcdef').label).toBe('Fair');
        expect(passwordStrength('abcdefg').level).toBe(2);
    });
    it('is good at 8+ characters without a digit and symbol', () => {
        expect(passwordStrength('abcdefgh')).toEqual({ level: 3, label: 'Good' });
        expect(passwordStrength('abcdefg1').level).toBe(3);
        expect(passwordStrength('abcdefg!').level).toBe(3);
    });
    it('is strong at 8+ characters with a digit and a symbol', () => {
        expect(passwordStrength('abcdef1!')).toEqual({ level: 4, label: 'Strong' });
    });
});

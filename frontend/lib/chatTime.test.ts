import { describe, it, expect } from 'vitest';
import { timeAgo } from './chatTime';

const now = new Date('2026-11-16T12:00:00Z').getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('timeAgo', () => {
    it('says just now under a minute', () => expect(timeAgo(ago(30_000), now)).toBe('just now'));
    it('uses minutes', () => expect(timeAgo(ago(5 * 60_000), now)).toBe('5m ago'));
    it('uses hours', () => expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h ago'));
    it('uses days under a week', () => expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d ago'));
    it('formats older dates', () => expect(timeAgo(ago(10 * 86_400_000), now)).toMatch(/Nov/));
});

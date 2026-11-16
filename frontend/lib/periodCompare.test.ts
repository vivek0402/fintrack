import { describe, it, expect } from 'vitest';
import { compareToPrevious } from './periodCompare';

describe('compareToPrevious', () => {
    it('says there is nothing to compare when the delta is null', () => {
        expect(compareToPrevious(null, 'October')).toBe('No earlier month to compare');
    });
    it('says same when the change is under half a percent', () => {
        expect(compareToPrevious(0.4, 'October')).toBe('Same as October');
        expect(compareToPrevious(-0.49, 'October')).toBe('Same as October');
        expect(compareToPrevious(0, 'October')).toBe('Same as October');
    });
    it('rounds a rise and names the previous month', () => {
        expect(compareToPrevious(12.4, 'October')).toBe('12% more than October');
        expect(compareToPrevious(0.5, 'October')).toBe('1% more than October');
    });
    it('rounds a fall and names the previous month', () => {
        expect(compareToPrevious(-33.6, 'December')).toBe('34% less than December');
    });
});

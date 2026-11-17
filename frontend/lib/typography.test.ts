import { describe, it, expect } from 'vitest';
import { chartText } from './typography';

describe('chartText', () => {
    it('mirrors the --text-micro / --text-caption / --text-body pixel sizes', () => {
        expect(chartText.micro).toBe(11);
        expect(chartText.caption).toBe(12);
        expect(chartText.body).toBe(14);
    });
});

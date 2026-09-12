const { tokenize, featurize, istHour } = require('../src/utils/txClassifier');

describe('tokenize', () => {
    test('lowercases, splits on punctuation, drops 1-char and numeric tokens, adds bigrams', () => {
        expect(tokenize('Swiggy Order #9182 - late')).toEqual([
            'swiggy', 'order', 'late',
            'swiggy_order', 'order_late',
        ]);
    });

    test('strips trailing digits from merchant-style tokens', () => {
        expect(tokenize('order9182')).toEqual(['order']);
        expect(tokenize('a1 b22')).toEqual([]);
    });

    test('handles empty input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize(undefined)).toEqual([]);
    });
});

describe('istHour', () => {
    test('converts a UTC timestamp to the IST hour', () => {
        expect(istHour('2026-09-12T18:45:00Z')).toBe(0);   // 00:15 IST next day
        expect(istHour('2026-09-12T06:00:00Z')).toBe(11);
    });
    test('returns null for missing/invalid', () => {
        expect(istHour(null)).toBeNull();
        expect(istHour('nope')).toBeNull();
    });
});

describe('featurize', () => {
    test('emits word, amount-bucket, weekday, hour-bucket and type features', () => {
        const f = featurize({ description: 'Swiggy', amount: 450, date: '2026-09-12', type: 'expense', hour: 21 });
        expect(f).toEqual(['w:swiggy', 'amt:8', 'dow:6', 'hr:5', 'type:expense']);
    });

    test('accepts a Date object for date and skips absent fields', () => {
        const f = featurize({ description: 'Rent', amount: 'abc', date: new Date('2026-09-14T00:00:00Z'), type: 'expense' });
        expect(f).toEqual(['w:rent', 'dow:1', 'type:expense']);
    });
});

const { tokenize, featurize, istHour, createModel, createTarget, train, untrain, predict, labelsFor, learn } = require('../src/utils/txClassifier');

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

    test('reads a local-midnight Date the same as its YYYY-MM-DD string', () => {
        const local = new Date(2026, 8, 14); // pg returns DATE columns this way
        expect(featurize({ date: local })).toEqual(featurize({ date: '2026-09-14' }));
        expect(featurize({ date: local })).toEqual(['dow:1']);
    });
});

describe('train / predict', () => {
    test('predicts the class whose features it has seen', () => {
        const t = createTarget();
        train(t, ['w:swiggy', 'amt:8'], 'food');
        train(t, ['w:zomato', 'amt:8'], 'food');
        train(t, ['w:uber', 'amt:7'], 'travel');
        const out = predict(t, ['w:swiggy']);
        expect(out[0].label).toBe('food');
        expect(out[0].prob).toBeGreaterThan(0.6);
        expect(out.map(o => o.label).sort()).toEqual(['food', 'travel']);
        expect(out.reduce((s, o) => s + o.prob, 0)).toBeCloseTo(1, 6);
    });

    test('ignores features never seen and falls back to class priors', () => {
        const t = createTarget();
        train(t, ['w:a'], 'x');
        train(t, ['w:a'], 'x');
        train(t, ['w:b'], 'y');
        const out = predict(t, ['w:unknown']);
        expect(out[0].label).toBe('x');
    });

    test('returns [] on an empty target', () => {
        expect(predict(createTarget(), ['w:a'])).toEqual([]);
    });

    test('untrain reverses train exactly and prunes empty entries', () => {
        const t = createTarget();
        train(t, ['w:a', 'amt:3'], 'x');
        untrain(t, ['w:a', 'amt:3'], 'x');
        expect(t).toEqual(createTarget());
    });

    test('untrain never drives counts negative', () => {
        const t = createTarget();
        untrain(t, ['w:a'], 'x');
        expect(t).toEqual(createTarget());
    });
});

describe('labelsFor', () => {
    test('uses category_id and (expense-only) payment_method', () => {
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI' })).toEqual({ category: 'c1', payment: 'UPI' });
        expect(labelsFor({ category_id: 'c1', type: 'income', payment_method: 'Cash' })).toEqual({ category: 'c1', payment: null });
        expect(labelsFor({ category_id: null, type: 'expense', payment_method: 'UPI' })).toEqual({ category: null, payment: 'UPI' });
    });
    test('skips transfers and card payments entirely', () => {
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI', tags: ['transfer'] })).toEqual({ category: null, payment: null });
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI', tags: ['credit_card_payment'] })).toEqual({ category: null, payment: null });
    });
});

describe('learn', () => {
    test('trains both targets from a transaction row and sign -1 undoes it', () => {
        const m = createModel();
        const tx = { description: 'Swiggy', amount: '450.00', date: '2026-09-12', type: 'expense', category_id: 'c1', payment_method: 'UPI', created_at: '2026-09-12T15:30:00Z' };
        learn(m, tx);
        expect(m.category.total).toBe(1);
        expect(m.payment.total).toBe(1);
        expect(predict(m.category, featurize({ description: 'swiggy' }))[0].label).toBe('c1');
        learn(m, tx, -1);
        expect(m).toEqual(createModel());
    });
});

const { scoreCandidate, findPaymentCandidates } = require('../src/utils/cardPaymentMatch');

const card = { bank_name: 'HDFC', card_name: 'Regalia', last_four: '4321' };

describe('scoreCandidate', () => {
    test('exact amount with the card in the description is the strongest match', () => {
        expect(scoreCandidate({ amount: '2600.00', description: 'CC PAYMENT HDFC REGALIA' }, { amount: 2600, card }))
            .toEqual({ score: 5, reason: 'Same amount · card in description' });
    });

    test('exact amount alone still counts', () => {
        expect(scoreCandidate({ amount: 2600, description: 'NEFT 88123' }, { amount: 2600, card }))
            .toEqual({ score: 3, reason: 'Same amount' });
    });

    test('a close amount needs card wording to count', () => {
        expect(scoreCandidate({ amount: 2550, description: 'Credit card bill' }, { amount: 2600, card }))
            .toEqual({ score: 2, reason: 'Close amount · card payment in description' });
        expect(scoreCandidate({ amount: 2550, description: 'Groceries' }, { amount: 2600, card })).toBeNull();
    });

    test('matches the last four digits', () => {
        expect(scoreCandidate({ amount: 2600, description: 'Card xx4321 payment' }, { amount: 2600, card }).score).toBe(5);
    });

    test('unrelated amounts never match', () => {
        expect(scoreCandidate({ amount: 9999, description: 'HDFC credit card' }, { amount: 2600, card })).toBeNull();
    });
});

describe('findPaymentCandidates', () => {
    test('ranks by score, then by closeness to the due date, and caps at 3', async () => {
        const rows = [
            { id: 'a', amount: '2600', date: '2026-08-20', description: 'NEFT', account_id: 9, account_name: 'HDFC Savings' },
            { id: 'b', amount: '2600', date: '2026-09-03', description: 'CC PAYMENT HDFC REGALIA', account_id: 9, account_name: 'HDFC Savings' },
            { id: 'c', amount: '2600', date: '2026-09-04', description: 'IMPS', account_id: 9, account_name: 'HDFC Savings' },
            { id: 'd', amount: '120', date: '2026-09-04', description: 'Chai', account_id: 9, account_name: 'HDFC Savings' },
            { id: 'e', amount: '2600', date: '2026-08-17', description: 'UPI', account_id: 9, account_name: 'HDFC Savings' },
        ];
        const db = { query: jest.fn().mockResolvedValue({ rows }) };
        const out = await findPaymentCandidates(db, 'u1', card, { from: '2026-08-16', to: '2026-09-11', amount: 2600, dueDate: '2026-09-04' });
        expect(out.map(c => c.id)).toEqual(['b', 'c', 'a']);
        expect(out[0]).toMatchObject({ amount: 2600, account_name: 'HDFC Savings', reason: 'Same amount · card in description' });
        expect(db.query.mock.calls[0][1]).toEqual(['u1', '2026-08-16', '2026-09-11']);
    });

    test('includes imported debits that have no bank account', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [
            { id: 'imp', amount: '2600', date: '2026-09-03', description: 'CC PAYMENT HDFC', account_id: null, account_name: null, source: 'pdf_import' },
        ] }) };
        const out = await findPaymentCandidates(db, 'u1', card, { from: '2026-08-16', to: '2026-09-11', amount: 2600 });
        expect(out[0]).toMatchObject({ id: 'imp', account_id: null, account_name: null, source: 'pdf_import' });
        expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN bank_accounts');
    });
});

const { buildCardDueAlerts, amountDueOnStatement, isCardInDueWindow, fetchCardPaymentsSince } = require('../src/utils/cardDueAlerts');

const TODAY = '2026-09-27';

function card(overrides = {}) {
    return {
        id: 7,
        bank_name: 'HDFC',
        card_name: 'Regalia',
        statement_balance: 45250,
        due_days: 20,
        last_statement_close_date: '2026-09-10',
        statement_due_date: '2026-09-30',
        ...overrides,
    };
}

describe('buildCardDueAlerts', () => {
    test('due in 3 days and unpaid -> alert with full amount', () => {
        const alerts = buildCardDueAlerts([card()], new Map(), TODAY);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].title).toBe('💳 HDFC Regalia bill due in 3 days');
        // ICU renders en-IN short September as "Sep" or "Sept" depending on
        // the Node/ICU version, so allow either.
        expect(alerts[0].body).toMatch(/^₹45,250 unpaid, due 30 Sept?\. Pay and record it in FinTrack to avoid late fees\.$/);
    });

    test('due in 4 days -> no alert', () => {
        expect(buildCardDueAlerts([card({ statement_due_date: '2026-10-01' })], new Map(), TODAY)).toEqual([]);
    });

    test('due yesterday -> no alert', () => {
        expect(buildCardDueAlerts([card({ statement_due_date: '2026-09-26' })], new Map(), TODAY)).toEqual([]);
    });

    test('fully paid -> no alert', () => {
        expect(buildCardDueAlerts([card()], new Map([[7, 45250]]), TODAY)).toEqual([]);
    });

    test('overpaid -> no alert', () => {
        expect(buildCardDueAlerts([card()], new Map([[7, 50000]]), TODAY)).toEqual([]);
    });

    test('paid to within a rupee rounding -> no alert', () => {
        expect(buildCardDueAlerts([card({ statement_balance: 45250.4 })], new Map([[7, 45250]]), TODAY)).toEqual([]);
    });

    test('partially paid -> alert with remaining of total', () => {
        const alerts = buildCardDueAlerts([card()], new Map([[7, 20000]]), TODAY);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].body).toMatch(/^₹25,250 of ₹45,250 still unpaid, due /);
    });

    test('accepts a plain object for paid amounts and numeric strings from pg', () => {
        const alerts = buildCardDueAlerts([card({ statement_balance: '1000.00' })], { 7: '400.00' }, TODAY);
        expect(alerts[0].body).toMatch(/^₹600 of ₹1,000 still unpaid/);
    });

    test('zero statement balance -> no alert', () => {
        expect(buildCardDueAlerts([card({ statement_balance: 0 })], new Map(), TODAY)).toEqual([]);
    });

    test('negative (credit) statement balance -> no alert', () => {
        expect(buildCardDueAlerts([card({ statement_balance: -500 })], new Map(), TODAY)).toEqual([]);
    });

    test('card with no billing cycle (null statement fields) -> no alert', () => {
        const c = card({ statement_balance: null, statement_due_date: null, last_statement_close_date: null });
        expect(buildCardDueAlerts([c], new Map(), TODAY)).toEqual([]);
    });

    test('alert key is cc_due:{cardId}:{dueDate}', () => {
        const [alert] = buildCardDueAlerts([card()], new Map(), TODAY);
        expect(alert.alertKey).toBe('cc_due:7:2026-09-30');
        expect(alert.cardId).toBe(7);
    });

    test('data carries type and deep link to the accounts screen (all string values)', () => {
        const [alert] = buildCardDueAlerts([card()], new Map(), TODAY);
        expect(alert.data).toEqual({ type: 'bill', deepLink: '/accounts', card_id: '7' });
    });

    test('wording: today / tomorrow / in N days', () => {
        const title = (due) => buildCardDueAlerts([card({ statement_due_date: due })], new Map(), TODAY)[0].title;
        expect(title('2026-09-27')).toBe('💳 HDFC Regalia bill due today');
        expect(title('2026-09-28')).toBe('💳 HDFC Regalia bill due tomorrow');
        expect(title('2026-09-29')).toBe('💳 HDFC Regalia bill due in 2 days');
        expect(title('2026-09-30')).toBe('💳 HDFC Regalia bill due in 3 days');
    });

    test('day counting crosses month and year boundaries', () => {
        const alerts = buildCardDueAlerts([card({ statement_due_date: '2027-01-02' })], new Map(), '2026-12-31');
        expect(alerts[0].title).toBe('💳 HDFC Regalia bill due in 2 days');
    });

    test('only matching cards alert when several are passed', () => {
        const cards = [
            card({ id: 1 }),
            card({ id: 2, statement_due_date: '2026-10-15' }),
            card({ id: 3 }),
        ];
        const alerts = buildCardDueAlerts(cards, new Map([[3, 45250]]), TODAY);
        expect(alerts.map(a => a.cardId)).toEqual([1]);
    });

    // statement_balance from fetchCreditCardsWithCycleBreakdown includes the
    // card's full remaining active-EMI principal; the real bill does not.
    describe('card with an active EMI', () => {
        // Real bill 12,000 + 36,000 blocked EMI principal.
        const emiCard = (over = {}) => card({ statement_balance: 48000, emi_blocked_principal: 36000, ...over });

        test('real bill fully paid, EMI principal still outstanding -> no alert', () => {
            expect(buildCardDueAlerts([emiCard()], new Map([[7, 12000]]), TODAY)).toEqual([]);
        });

        test('unpaid -> alert shows the bill amount without the EMI principal', () => {
            const [alert] = buildCardDueAlerts([emiCard()], new Map(), TODAY);
            expect(alert.body).toMatch(/^₹12,000 unpaid, due /);
            expect(alert.body).not.toContain('48,000');
        });

        test('partially paid -> remaining and total both exclude the EMI principal', () => {
            const [alert] = buildCardDueAlerts([emiCard()], new Map([[7, 5000]]), TODAY);
            expect(alert.body).toMatch(/^₹7,000 of ₹12,000 still unpaid/);
        });

        test('statement is nothing but blocked EMI principal -> no alert', () => {
            expect(buildCardDueAlerts([emiCard({ statement_balance: 36000 })], new Map(), TODAY)).toEqual([]);
        });

        test('accepts emi_blocked_principal as a numeric string', () => {
            const [alert] = buildCardDueAlerts([emiCard({ emi_blocked_principal: '36000.00' })], new Map(), TODAY);
            expect(alert.body).toMatch(/^₹12,000 unpaid/);
        });
    });

    test('no configured due period (due_days null or <= 0) -> no alert', () => {
        // Without due_days the computed due date is just the close date,
        // which would read as a misleading "due today".
        const onCloseDay = { statement_due_date: TODAY, last_statement_close_date: TODAY };
        expect(buildCardDueAlerts([card({ ...onCloseDay, due_days: null })], new Map(), TODAY)).toEqual([]);
        expect(buildCardDueAlerts([card({ ...onCloseDay, due_days: 0 })], new Map(), TODAY)).toEqual([]);
        expect(buildCardDueAlerts([card({ ...onCloseDay, due_days: -5 })], new Map(), TODAY)).toEqual([]);
    });

    test('rounds amounts to whole rupees, no decimals', () => {
        const [alert] = buildCardDueAlerts([card({ statement_balance: 1234567.89 })], new Map(), TODAY);
        expect(alert.body).toMatch(/^₹12,34,568 unpaid/);
    });
});

describe('amountDueOnStatement', () => {
    test('subtracts blocked EMI principal from statement_balance', () => {
        expect(amountDueOnStatement({ statement_balance: 48000, emi_blocked_principal: 36000 })).toBe(12000);
    });

    test('treats a missing emi_blocked_principal as 0', () => {
        expect(amountDueOnStatement({ statement_balance: 5000 })).toBe(5000);
    });

    test('null when the card has no billing cycle', () => {
        expect(amountDueOnStatement({ statement_balance: null, emi_blocked_principal: 0 })).toBeNull();
    });
});

describe('isCardInDueWindow', () => {
    test('true only for a positive bill due within [today, today+3] with a due period', () => {
        expect(isCardInDueWindow(card(), TODAY)).toBe(true);
        expect(isCardInDueWindow(card({ statement_due_date: '2026-10-01' }), TODAY)).toBe(false);
        expect(isCardInDueWindow(card({ statement_due_date: '2026-09-26' }), TODAY)).toBe(false);
        expect(isCardInDueWindow(card({ statement_balance: 0 }), TODAY)).toBe(false);
        expect(isCardInDueWindow(card({ statement_balance: 5000, emi_blocked_principal: 5000 }), TODAY)).toBe(false);
        expect(isCardInDueWindow(card({ due_days: null }), TODAY)).toBe(false);
        expect(isCardInDueWindow(card({ statement_due_date: null, statement_balance: null }), TODAY)).toBe(false);
    });
});

describe('fetchCardPaymentsSince', () => {
    const fakePool = (result) => ({ query: jest.fn().mockResolvedValue(result) });

    test('queries only tagged card-side payments strictly after the close date', async () => {
        const pool = fakePool({ rows: [{ paid: '0' }] });
        await fetchCardPaymentsSince(pool, 'u1', 7, '2026-09-10');

        const [sql, params] = pool.query.mock.calls[0];
        const norm = sql.replace(/\s+/g, ' ');
        expect(norm).toMatch(/user_id = \$1/);
        expect(norm).toMatch(/credit_card_id = \$2/);
        expect(norm).toMatch(/type = 'income'/);
        expect(norm).toMatch(/'credit_card_payment' = ANY\(tags\)/);
        // Strictly greater: statement_balance already nets anything dated on
        // or before the close date, so >= would double-count a close-day payment.
        expect(norm).toMatch(/date > \$3/);
        expect(norm).not.toMatch(/date >= /);
        expect(params).toEqual(['u1', 7, '2026-09-10']);
    });

    test('converts a numeric-string SUM from pg into a number', async () => {
        await expect(fetchCardPaymentsSince(fakePool({ rows: [{ paid: '12500.50' }] }), 'u1', 7, '2026-09-10'))
            .resolves.toBe(12500.5);
    });

    test('null or missing result -> 0', async () => {
        await expect(fetchCardPaymentsSince(fakePool({ rows: [{ paid: null }] }), 'u1', 7, '2026-09-10')).resolves.toBe(0);
        await expect(fetchCardPaymentsSince(fakePool({ rows: [] }), 'u1', 7, '2026-09-10')).resolves.toBe(0);
    });
});

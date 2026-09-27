const { buildCardDueAlerts } = require('../src/utils/cardDueAlerts');

const TODAY = '2026-09-27';

function card(overrides = {}) {
    return {
        id: 7,
        bank_name: 'HDFC',
        card_name: 'Regalia',
        statement_balance: 45250,
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
        expect(alerts[0].body).toMatch(/^₹45,250 unpaid, due 30 Sept?\. Pay it and mark it as paid in FinTrack to avoid late fees\.$/);
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

    test('rounds amounts to whole rupees, no decimals', () => {
        const [alert] = buildCardDueAlerts([card({ statement_balance: 1234567.89 })], new Map(), TODAY);
        expect(alert.body).toMatch(/^₹12,34,568 unpaid/);
    });
});

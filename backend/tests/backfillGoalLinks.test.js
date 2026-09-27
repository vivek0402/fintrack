const {
    planGoalLinks, formatPlan, planToJson, parseArgs, applyLinks, CANDIDATE_SQL,
} = require('../scripts/backfill-goal-links');

const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GOA = { id: 'g-goa', name: 'Goa Trip', saved_amount: '12000.00' };
const LAPTOP = { id: 'g-laptop', name: 'Laptop', saved_amount: '50000.00' };
const CAR = { id: 'g-car', name: 'Car', saved_amount: '90000.00' };
const CAR_SERVICE = { id: 'g-car-svc', name: 'Car Service', saved_amount: '9000.00' };
const TV = { id: 'g-tv', name: 'TV', saved_amount: '30000.00' };
const goalsByUser = { [U1]: [GOA, LAPTOP, CAR, CAR_SERVICE, TV], [U2]: [{ id: 'g-u2', name: 'Goa Trip', saved_amount: '500.00' }] };

let seq = 0;
function tx(overrides = {}) {
    seq++;
    return {
        id: `tx-${seq}`, user_id: U1, type: 'expense', amount: '2500.00',
        description: 'Goa trip savings', date: '2026-09-01', created_at: '2026-09-01T10:00:00',
        goal_id: null, tags: [], transfer_group_id: null, personal_loan_id: null, group_id: null,
        source: 'manual', is_investment_category: false, system_origin: null,
        ...overrides,
    };
}
const plan = rows => planGoalLinks(rows, goalsByUser, { cutoff: '2026-08-16' });

describe('planGoalLinks', () => {
    test('links a row whose description names exactly one goal', () => {
        const row = tx();
        const p = plan([row]);
        expect(p.links).toEqual([{
            tx_id: row.id, user_id: U1, date: '2026-09-01', amount: 2500,
            description: 'Goa trip savings', goal_id: 'g-goa', goal_name: 'Goa Trip',
        }]);
        expect(p.ambiguous).toEqual([]);
        expect(p.skipped).toEqual({});
    });

    test('matches only against the same user\'s goals', () => {
        const p = plan([tx({ user_id: U2, amount: '400' })]);
        expect(p.links[0]).toMatchObject({ user_id: U2, goal_id: 'g-u2' });
    });

    test('two matching goal names is ambiguous and never linked', () => {
        const p = plan([tx({ description: 'Car service fund' })]);
        expect(p.links).toEqual([]);
        expect(p.ambiguous).toHaveLength(1);
        expect(p.ambiguous[0].goal_names).toEqual(['Car', 'Car Service']);
        expect(p.skipped).toEqual({ ambiguous: 1 });
    });

    test('goal names shorter than 3 characters are ignored', () => {
        // "TV" would match "tv stand" but is too short to trust.
        const p = plan([tx({ description: 'TV stand' })]);
        expect(p.links).toEqual([]);
        expect(p.skipped).toEqual({ no_match: 1 });
        // ...and it doesn't turn a single real match into an ambiguous one.
        const p2 = plan([tx({ description: 'Laptop for tv room', amount: '100' })]);
        expect(p2.links[0].goal_id).toBe('g-laptop');
    });

    test('matching is case-insensitive and trims the description', () => {
        const p = plan([tx({ description: '   LAPTOP fund  ' })]);
        expect(p.links[0].goal_id).toBe('g-laptop');
    });

    test.each([
        ['tag transfer', { tags: ['transfer'] }, 'transfer'],
        ['tag credit_card_payment', { tags: ['credit_card_payment'] }, 'transfer'],
        ['transfer_group_id set', { transfer_group_id: 'grp-1' }, 'transfer'],
        ['investment category', { is_investment_category: true }, 'investment'],
        ['personal-loan leg', { personal_loan_id: 'pl-1' }, 'personal_loan'],
        ['sms source', { source: 'sms' }, 'source'],
        ['pdf_import source', { source: 'pdf_import' }, 'source'],
        ['cams_import source', { source: 'cams_import' }, 'source'],
        ['recurring cron row', { system_origin: 'recurring' }, 'system_generated'],
        ['card EMI installment', { system_origin: 'card_emi_installment' }, 'system_generated'],
        ['card EMI fee', { tags: ['credit_card_emi_fee'] }, 'system_generated'],
        ['group split', { group_id: 4, tags: ['group-split'] }, 'system_generated'],
        ['not an expense', { type: 'income' }, 'not_expense'],
    ])('excludes %s', (_label, overrides, reason) => {
        const p = plan([tx(overrides)]);
        expect(p.links).toEqual([]);
        expect(p.ambiguous).toEqual([]);
        expect(p.skipped).toEqual({ [reason]: 1 });
    });

    test('rows created before the cutoff are skipped (created_at, not date)', () => {
        const p = plan([
            tx({ created_at: '2026-08-15T23:59:59', date: '2026-09-01' }),
            tx({ created_at: '2026-08-16T00:00:00', date: '2026-08-01' }),
        ]);
        expect(p.skipped).toEqual({ before_cutoff: 1 });
        expect(p.links).toHaveLength(1);
        expect(p.links[0].date).toBe('2026-08-01');
    });

    test('rows already linked to a goal are skipped (idempotent re-run)', () => {
        const p = plan([tx({ goal_id: 'g-goa' })]);
        expect(p.links).toEqual([]);
        expect(p.skipped).toEqual({ already_linked: 1 });
    });

    test('an amount above the goal\'s current saved_amount is skipped and listed as exceeds-goal', () => {
        const p = plan([tx({ amount: '12000.01' }), tx({ amount: '12000.00' })]);
        expect(p.links).toHaveLength(1);
        expect(p.exceedsGoal).toEqual([expect.objectContaining({ amount: 12000.01, goal_id: 'g-goa', goal_saved_amount: 12000 })]);
        expect(p.skipped).toEqual({ exceeds_goal: 1 });
    });

    test('accepts goals as a Map too', () => {
        const p = planGoalLinks([tx()], new Map(Object.entries(goalsByUser)), { cutoff: '2026-08-16' });
        expect(p.links).toHaveLength(1);
    });
});

describe('report output', () => {
    const fixture = () => plan([
        tx({ id: 'tx-a', description: 'Goa trip savings', amount: '2500.00', date: '2026-08-20' }),
        tx({ id: 'tx-b', description: 'laptop fund', amount: '10000.50', date: '2026-09-03' }),
        tx({ id: 'tx-c', description: 'Car service fund', amount: '1500.00', date: '2026-09-05' }),
        tx({ id: 'tx-d', description: 'Goa trip savings', amount: '15000.00', date: '2026-09-10' }),
        tx({ id: 'tx-e', description: 'Goa trip', source: 'sms' }),
        tx({ id: 'tx-f', description: 'Swiggy' }),
    ]);
    const emails = { [U1]: 'asha@example.com' };

    test('dry-run text: totals, skipped reasons, per-user table, ambiguous and exceeds lists', () => {
        const text = formatPlan(fixture(), emails);
        expect(text).toMatchInlineSnapshot(`
"Scanned 6 unlinked expense row(s).
Candidates: 2
Ambiguous:  1
Skipped:    4
     1  ambiguous (2+ goal names match)
     1  amount exceeds goal's saved_amount
     1  source not the add-transaction form
     1  no goal name in description

User aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (asha@example.com): 2 link(s)
tx id  date        amount      description       goal
-----  ----------  ----------  ----------------  --------
tx-a   2026-08-20  ₹2,500      Goa trip savings  Goa Trip
tx-b   2026-09-03  ₹10,000.50  laptop fund       Laptop

Ambiguous, NOT touched:
user              tx id  date        amount  description       matching goals
----------------  -----  ----------  ------  ----------------  -----------------
asha@example.com  tx-c   2026-09-05  ₹1,500  Car service fund  Car | Car Service

Skipped: exceeds goal (amount > goal's current saved_amount), NOT touched:
user              tx id  date        amount   description       goal      goal saved
----------------  -----  ----------  -------  ----------------  --------  ----------
asha@example.com  tx-d   2026-09-10  ₹15,000  Goa trip savings  Goa Trip  ₹12,000"
`);
    });

    test('--json shape carries the same data', () => {
        const json = planToJson(fixture(), emails, { mode: 'dry-run' });
        expect(json.mode).toBe('dry-run');
        expect(json.totals).toEqual({
            scanned: 6, candidates: 2, ambiguous: 1,
            skipped: { ambiguous: 1, exceeds_goal: 1, source: 1, no_match: 1 },
        });
        expect(json.users).toEqual([{ user_id: U1, email: 'asha@example.com', links: expect.any(Array) }]);
        expect(json.users[0].links.map(l => l.tx_id)).toEqual(['tx-a', 'tx-b']);
        expect(json.ambiguous[0].tx_id).toBe('tx-c');
        expect(json.exceeds_goal[0].tx_id).toBe('tx-d');
    });
});

describe('parseArgs', () => {
    test('defaults to a dry run', () => {
        expect(parseArgs([])).toEqual({ apply: false, json: false, user: null });
    });
    test('reads --apply, --json and --user', () => {
        expect(parseArgs(['--json', '--user', U1, '--apply'])).toEqual({ apply: true, json: true, user: U1 });
    });
    test('rejects a non-uuid --user and unknown flags', () => {
        expect(() => parseArgs(['--user', '42'])).toThrow(/uuid/);
        expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
    });
});

describe('applyLinks', () => {
    const links = [
        { tx_id: 't1', user_id: U1, goal_id: 'g-goa' },
        { tx_id: 't2', user_id: U1, goal_id: 'g-laptop' },
    ];
    function fakePool(rowCounts) {
        const calls = [];
        const client = {
            query: jest.fn(async (sql, params) => {
                calls.push([sql, params]);
                if (sql.startsWith('UPDATE')) return { rowCount: rowCounts.shift() };
                return {};
            }),
            release: jest.fn(),
        };
        return { pool: { connect: async () => client }, calls, client };
    }

    test('writes only goal_id, in one transaction, and returns the count', async () => {
        const { pool, calls, client } = fakePool([1, 1]);
        await expect(applyLinks(pool, links)).resolves.toBe(2);
        expect(calls.map(([sql]) => sql)).toEqual([
            'BEGIN',
            'UPDATE transactions SET goal_id = $1 WHERE id = $2 AND user_id = $3 AND goal_id IS NULL',
            'UPDATE transactions SET goal_id = $1 WHERE id = $2 AND user_id = $3 AND goal_id IS NULL',
            'COMMIT',
        ]);
        expect(calls[1][1]).toEqual(['g-goa', 't1', U1]);
        expect(calls.some(([sql]) => /savings_goals/.test(sql))).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });

    test('rolls back everything when any row count differs from the plan', async () => {
        const { pool, calls } = fakePool([1, 0]); // t2 was linked/changed since the plan
        await expect(applyLinks(pool, links)).rejects.toThrow(/Rolled back/);
        expect(calls.map(([sql]) => sql)).toContain('ROLLBACK');
        expect(calls.map(([sql]) => sql)).not.toContain('COMMIT');
    });
});

describe('CANDIDATE_SQL', () => {
    test('prefilters on the cutoff/unlinked expense rows and stays parameterized', () => {
        expect(CANDIDATE_SQL).toMatch(/t\.type = 'expense'/);
        expect(CANDIDATE_SQL).toMatch(/t\.goal_id IS NULL/);
        expect(CANDIDATE_SQL).toMatch(/t\.created_at >= \$1::date/);
        expect(CANDIDATE_SQL).toMatch(/\$2::uuid IS NULL OR t\.user_id = \$2::uuid/);
    });
});

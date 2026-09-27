// Only main() requires the pool; the mock stands in for it there, including
// db/pool.js's habit of printing "Connected to PostgreSQL" via console.log.
jest.mock('../src/db/pool', () => ({ query: jest.fn(), end: jest.fn(), connect: jest.fn() }));

const {
    main, planGoalLinks, excludeFromPlan, selectLinksToApply, formatPlan, planToJson, parseArgs, applyLinks,
    normalize, matchTier, utcNaive, CANDIDATE_SQL, GOAL_LINKING_SHIPPED_UTC,
} = require('../scripts/backfill-goal-links');

const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BEFORE = '2026-09-27T10:00:00Z';
const WINDOW = { before: BEFORE };

const goal = (id, name, saved = '100000.00') => ({ id, name, saved_amount: saved });

let seq = 0;
function tx(overrides = {}) {
    seq++;
    return {
        id: `tx-${seq}`, user_id: U1, type: 'expense', amount: '2500.00',
        description: 'Savings for Goa trip', date: '2026-09-01',
        created_at: '2026-09-01T10:00:00.000',
        goal_id: null, tags: [], transfer_group_id: null, personal_loan_id: null, group_id: null,
        source: 'manual', is_investment_category: false, system_origin: null,
        ...overrides,
        updated_at: overrides.updated_at || overrides.created_at || '2026-09-01T10:00:00.000',
    };
}
const planFor = (goals, rows, window = WINDOW) => planGoalLinks(rows, { [U1]: goals }, window);
// Where a single description lands against a single goal set.
function classify(goals, description, overrides = {}) {
    const p = planFor(goals, [tx({ description, ...overrides })]);
    if (p.links.length) return { tier: 'link', goal: p.links[0].goal_name };
    if (p.review.length) return { tier: 'review', goal: p.review[0].goal_name, reasons: p.review[0].reasons };
    if (p.ambiguous.length) return { tier: 'ambiguous', goals: p.ambiguous[0].goal_names };
    return { tier: 'skipped', skipped: p.skipped };
}

describe('normalize / matchTier', () => {
    test('normalize lower-cases, strips punctuation and collapses whitespace', () => {
        expect(normalize('  Paid EMI,   emergency-fund!! ')).toBe('paid emi emergency fund');
    });
    test('exact after filler removal on both sides; bare when no extra filler; whole-word otherwise', () => {
        expect(matchTier('transfer to emergency fund', 'Emergency Fund')).toBe('exact');
        expect(matchTier('laptop fund', 'Laptop')).toBe('exact');
        expect(matchTier('laptop', 'Laptop')).toBe('bare');
        expect(matchTier('emergency fund', 'Emergency Fund')).toBe('bare');
        expect(matchTier('fund emergency', 'Emergency Fund')).toBe('bare');
        expect(matchTier('car service', 'Car')).toBe('name');
        expect(matchTier('carpool', 'Car')).toBeNull();
    });
});

describe('planGoalLinks: tiers', () => {
    const CAR = goal('g-car', 'Car');
    const TRIP = goal('g-trip', 'Trip');
    const GOA = goal('g-goa', 'Goa Trip');
    const EMERGENCY = goal('g-em', 'Emergency Fund');
    const SAVINGS = goal('g-sav', 'Savings');
    const HOUSE = goal('g-house', 'House Down Payment Fund');

    const LAPTOP = goal('g-lap', 'Laptop');

    test.each([
        ['Transfer to Emergency Fund', EMERGENCY],
        ['Savings for Goa trip', GOA],
        ['  savings -- GOA   trip!  ', GOA],
        ['Laptop fund', LAPTOP],
        ['Savings for house down payment', HOUSE],
        ['House Down Payment Fund SIP', HOUSE],
        ['Transferred to car fund', CAR],
    ])('true positive auto-links: %p', (description, g) => {
        expect(classify([g], description)).toEqual({ tier: 'link', goal: g.name });
    });

    test.each([
        ['Laptop', LAPTOP],                   // probably the ₹78k purchase itself
        ['Emergency Fund', EMERGENCY],        // just the goal name, filler and all
        ['Emergency', EMERGENCY],
        ['Goa Trip', GOA],
        ['Car', CAR],
        ['House Down Payment Fund', HOUSE],
    ])('a description that is just the goal\'s own words goes to review as bare_goal_name: %p', (description, g) => {
        expect(classify([g], description)).toEqual({ tier: 'review', goal: g.name, reasons: ['bare_goal_name'] });
    });

    test.each([
        ['Car service', CAR],
        ['Trip to office by Uber', TRIP],
        ['Paid EMI, emergency fund untouched', EMERGENCY],
        ['Savings', SAVINGS],                 // goal core is all filler -> never exact
        ['Transfer to savings', SAVINGS],
        ['House down payment fund for mom', HOUSE],
    ])('name appears but not exact goes to review, never auto: %p', (description, g) => {
        expect(classify([g], description)).toEqual({ tier: 'review', goal: g.name, reasons: ['name_match_not_exact'] });
    });

    test.each([
        ['Carpool', CAR],
        ['scarf', CAR],
        ['Tripadvisor booking', TRIP],
        ['Swiggy', GOA],
    ])('no whole-word match is skipped: %p', (description, g) => {
        expect(classify([g], description)).toEqual({ tier: 'skipped', skipped: { no_match: 1 } });
    });

    test('goal names shorter than 3 characters are ignored', () => {
        expect(classify([goal('g-tv', 'TV')], 'TV')).toEqual({ tier: 'skipped', skipped: { no_match: 1 } });
    });

    test('matches only against the same user\'s goals', () => {
        const p = planGoalLinks([tx({ user_id: U2 })], { [U1]: [GOA], [U2]: [] }, WINDOW);
        expect(p.skipped).toEqual({ no_match: 1 });
    });

    test('2+ goals matching in either tier is ambiguous and never applied', () => {
        expect(classify([CAR, goal('g-cs', 'Car Service')], 'Car service'))
            .toEqual({ tier: 'ambiguous', goals: ['Car', 'Car Service'] });
        expect(classify([GOA, TRIP], 'Goa trip')).toEqual({ tier: 'ambiguous', goals: ['Goa Trip', 'Trip'] });
    });
});

describe('planGoalLinks: exclusions and window', () => {
    const GOA = goal('g-goa', 'Goa Trip');

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
        ['tags NULL', { tags: null }, 'tags_null'],
        ['not an expense', { type: 'income' }, 'not_expense'],
        ['already linked', { goal_id: 'g-goa' }, 'already_linked'],
    ])('excludes %s', (_label, overrides, reason) => {
        const p = planFor([GOA], [tx(overrides)]);
        expect(p.links).toEqual([]);
        expect(p.review).toEqual([]);
        expect(p.skipped).toEqual({ [reason]: 1 });
    });

    test('default lower bound is the feature commit instant, inclusive (UTC-naive created_at)', () => {
        expect(GOAL_LINKING_SHIPPED_UTC).toBe('2026-08-16T15:40:22Z');
        const p = planFor([GOA], [
            tx({ id: 'early', created_at: '2026-08-16T15:40:21.999' }),
            tx({ id: 'at', created_at: '2026-08-16T15:40:22.000' }),
        ]);
        expect(p.skipped).toEqual({ outside_window: 1 });
        expect(p.links.map(l => l.tx_id)).toEqual(['at']);
    });

    test('upper bound (--before) is exclusive', () => {
        const p = planFor([GOA], [
            tx({ id: 'last', created_at: '2026-09-27T09:59:59.999' }),
            tx({ id: 'at', created_at: '2026-09-27T10:00:00.000' }),
            tx({ id: 'after-fix', created_at: '2026-09-30T08:00:00.000' }),
        ], { before: BEFORE });
        expect(p.links.map(l => l.tx_id)).toEqual(['last']);
        expect(p.skipped).toEqual({ outside_window: 2 });
    });

    test('an explicit --after overrides the default and zoned inputs compare in UTC', () => {
        const p = planFor([GOA], [tx({ id: 'a', created_at: '2026-09-01T04:29:59.000' }), tx({ id: 'b', created_at: '2026-09-01T04:30:00.000' })],
            { after: '2026-09-01T10:00:00+05:30', before: BEFORE });
        expect(p.links.map(l => l.tx_id)).toEqual(['b']);
    });

    test('requires opts.before', () => {
        expect(() => planGoalLinks([], {}, {})).toThrow(/before/);
    });
});

describe('planGoalLinks: review reasons', () => {
    test('rows edited more than 5 seconds after creation go to review', () => {
        const GOA = goal('g-goa', 'Goa Trip');
        const p = planFor([GOA], [
            tx({ id: 'quick', updated_at: '2026-09-01T10:00:05.000' }),
            tx({ id: 'edited', updated_at: '2026-09-01T10:00:05.001' }),
        ]);
        expect(p.links.map(l => l.tx_id)).toEqual(['quick']);
        expect(p.review).toEqual([expect.objectContaining({ tx_id: 'edited', reasons: ['edited_after_create'] })]);
    });

    test('a single row above the goal\'s saved_amount goes to review (per-row check)', () => {
        const p = planFor([goal('g-goa', 'Goa Trip', '2000.00')], [tx({ amount: '2000.01' })]);
        expect(p.links).toEqual([]);
        expect(p.review[0].reasons).toEqual(['exceeds_goal']);
    });

    test('cumulative cap: if a goal\'s Will-link rows sum above saved_amount, all of them move to review', () => {
        const GOA = goal('g-goa', 'Goa Trip', '5000.00');
        const LAPTOP = goal('g-lap', 'Laptop', '5000.00');
        const p = planFor([GOA, LAPTOP], [
            tx({ id: 'g1', amount: '3000' }),
            tx({ id: 'g2', amount: '2500' }),     // 5500 > 5000
            tx({ id: 'l1', description: 'Laptop fund', amount: '2500' }),
            tx({ id: 'l2', description: 'Laptop fund', amount: '2500' }), // exactly 5000, fine
        ]);
        expect(p.links.map(l => l.tx_id)).toEqual(['l1', 'l2']);
        expect(p.review.map(r => [r.tx_id, r.reasons])).toEqual([
            ['g1', ['exceeds_goal_total']],
            ['g2', ['exceeds_goal_total']],
        ]);
    });
});

describe('selectLinksToApply (--include)', () => {
    const GOA = goal('g-goa', 'Goa Trip');
    const CAR = goal('g-car', 'Car');
    const plan = () => planFor([GOA, CAR, goal('g-cs', 'Car Service')], [
        tx({ id: 'auto' }),
        tx({ id: 'rev', description: 'Goa trip hotel' }),
        tx({ id: 'amb', description: 'Car service' }),
    ]);

    test('applies Will link only by default', () => {
        expect(selectLinksToApply(plan())).toEqual([{ tx_id: 'auto', user_id: U1, goal_id: 'g-goa' }]);
    });
    test('adds review rows named in --include', () => {
        expect(selectLinksToApply(plan(), ['rev']).map(l => l.tx_id)).toEqual(['auto', 'rev']);
    });
    test('rejects ids that are not in Needs review (ambiguous, already Will link, unknown)', () => {
        expect(() => selectLinksToApply(plan(), ['amb'])).toThrow(/not in "Needs review": amb/);
        expect(() => selectLinksToApply(plan(), ['auto'])).toThrow(/auto/);
        expect(() => selectLinksToApply(plan(), ['rev', 'nope'])).toThrow(/nope/);
    });

    describe('excludeFromPlan (--exclude)', () => {
        test('removes ids from Will link and Needs review and lists them as excluded', () => {
            const p = excludeFromPlan(plan(), ['auto', 'rev']);
            expect(p.links).toEqual([]);
            expect(p.review).toEqual([]);
            expect(p.excluded.map(r => r.tx_id)).toEqual(['auto', 'rev']);
            expect(selectLinksToApply(p)).toEqual([]);
        });
        test('an excluded review row can no longer be --include\'d', () => {
            expect(() => selectLinksToApply(excludeFromPlan(plan(), ['rev']), ['rev'])).toThrow(/rev/);
        });
        test('no --exclude leaves the plan as is, with an empty excluded list', () => {
            const p = excludeFromPlan(plan(), []);
            expect(p.links.map(l => l.tx_id)).toEqual(['auto']);
            expect(p.excluded).toEqual([]);
        });
        test('errors on ids in neither Will link nor Needs review (ambiguous, unknown)', () => {
            expect(() => excludeFromPlan(plan(), ['amb'])).toThrow(/not in "Will link" or "Needs review": amb/);
            expect(() => excludeFromPlan(plan(), ['auto', 'nope'])).toThrow(/nope/);
        });
    });
});

describe('report output', () => {
    const goals = [
        goal('g-em', 'Emergency Fund', '20000.00'), goal('g-goa', 'Goa Trip', '12000.00'),
        goal('g-lap', 'Laptop', '90000.00'), goal('g-car', 'Car'), goal('g-cs', 'Car Service'),
    ];
    const rows = () => [
        tx({ id: 'tx-a', description: 'Transfer to Emergency Fund', amount: '5000', date: '2026-08-20' }),
        tx({ id: 'tx-b', description: 'Savings for Goa trip', amount: '2500.50', date: '2026-09-03' }),
        tx({ id: 'tx-c', description: 'Paid EMI, emergency fund untouched', amount: '1500', date: '2026-09-05' }),
        tx({ id: 'tx-d', description: 'Car service', amount: '800', date: '2026-09-06' }),
        tx({ id: 'tx-e', description: 'Goa trip', source: 'sms' }),
        tx({ id: 'tx-f', description: 'Carpool' }),
        tx({ id: 'tx-g', description: 'Laptop', amount: '78000', date: '2026-09-12' }),
        tx({ id: 'tx-h', description: 'Laptop fund', amount: '4000', date: '2026-09-14' }),
    ];
    const fixture = () => excludeFromPlan(planFor(goals, rows()), ['tx-b']);
    const emails = { [U1]: 'asha@example.com' };

    test('dry-run text: window header, Will link / Needs review / Ambiguous / Excluded / Skipped', () => {
        const text = formatPlan(fixture(), emails, { ...WINDOW, timezone: 'UTC' }, { include: ['tx-c'] });
        expect(text).toMatchInlineSnapshot(`
"Window (created_at, UTC): 2026-08-16T15:40:22.000Z <= created_at < 2026-09-27T10:00:00.000Z
DB session TimeZone: UTC
Scanned 8 unlinked expense row(s): 2 will link, 2 need review, 1 ambiguous, 2 skipped.
Will apply 3 row(s): 2 Will link + 1 --include, 1 excluded.

== Will link (2) ==
User aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (asha@example.com)
tx id  date        amount  description                 goal
-----  ----------  ------  --------------------------  --------------
tx-a   2026-08-20  ₹5,000  Transfer to Emergency Fund  Emergency Fund
tx-h   2026-09-14  ₹4,000  Laptop fund                 Laptop

== Needs review, not applied unless --include (2) ==
incl  user              tx id  date        amount   description                         goal            goal saved  why
----  ----------------  -----  ----------  -------  ----------------------------------  --------------  ----------  ------------------------------------------------------
yes   asha@example.com  tx-c   2026-09-05  ₹1,500   Paid EMI, emergency fund untouched  Emergency Fund  ₹20,000     name appears but description has other words
      asha@example.com  tx-g   2026-09-12  ₹78,000  Laptop                              Laptop          ₹90,000     description is just the goal name (maybe the purchase)

== Ambiguous, never applied (1) ==
user              tx id  date        amount  description  matching goals
----------------  -----  ----------  ------  -----------  -----------------
asha@example.com  tx-d   2026-09-06  ₹800    Car service  Car | Car Service

== Excluded by --exclude, never applied (1) ==
user              tx id  date        amount     description           goal
----------------  -----  ----------  ---------  --------------------  --------
asha@example.com  tx-b   2026-09-03  ₹2,500.50  Savings for Goa trip  Goa Trip

== Skipped (counts by reason) ==
    1  source not the add-transaction form
    1  no goal name in description"
`);
    });

    test('--json carries the same data, the window and the excluded rows', () => {
        const json = planToJson(fixture(), emails, WINDOW, { mode: 'dry-run' });
        expect(json.window).toEqual({ after: '2026-08-16T15:40:22.000Z', before: '2026-09-27T10:00:00.000Z' });
        expect(json.totals).toEqual({
            scanned: 8, will_link: 2, needs_review: 2, ambiguous: 1,
            skipped: { source: 1, no_match: 1 },
        });
        expect(json.will_link[0].links.map(l => l.tx_id)).toEqual(['tx-a', 'tx-h']);
        expect(json.needs_review.map(r => [r.tx_id, r.reasons])).toEqual([
            ['tx-c', ['name_match_not_exact']],
            ['tx-g', ['bare_goal_name']],
        ]);
        expect(json.ambiguous[0].tx_id).toBe('tx-d');
        expect(json.excluded.map(r => r.tx_id)).toEqual(['tx-b']);
    });

    describe('main --json', () => {
        const pool = require('../src/db/pool');
        let stdoutSpy, errorSpy, originalLog;

        beforeEach(() => {
            originalLog = console.log;
            let connected = false;
            pool.query.mockReset();
            pool.end.mockReset();
            pool.query.mockImplementation(async (sql) => {
                if (!connected) { connected = true; console.log('✅ Connected to PostgreSQL'); }
                if (sql.includes("current_setting('TimeZone')")) return { rows: [{ tz: 'UTC' }] };
                if (sql.includes('FROM transactions t')) return { rows: rows() };
                if (sql.includes('FROM savings_goals')) return { rows: goals.map(g => ({ ...g, user_id: U1 })) };
                if (sql.includes('FROM users')) return { rows: [{ id: U1, email: 'asha@example.com' }] };
                throw new Error(`unexpected query ${sql}`);
            });
            stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        });
        afterEach(() => {
            stdoutSpy.mockRestore();
            errorSpy.mockRestore();
            console.log = originalLog;
        });

        test('stdout gets only the JSON; the pool\'s connect message goes to stderr', async () => {
            await main(['--before', BEFORE, '--json', '--exclude', 'tx-b', '--include', 'tx-c']);

            expect(stdoutSpy).toHaveBeenCalledTimes(1);
            const out = JSON.parse(stdoutSpy.mock.calls[0][0]);
            expect(out).toMatchObject({ mode: 'dry-run', will_apply: 3, exclude: ['tx-b'], include: ['tx-c'] });
            expect(errorSpy).toHaveBeenCalledWith('✅ Connected to PostgreSQL');
            expect(console.log).toBe(originalLog); // restored afterwards
            expect(pool.end).toHaveBeenCalled();
            expect(pool.connect).not.toHaveBeenCalled(); // dry run: no write transaction
        });

        test('a bad --exclude id errors before anything is written', async () => {
            await expect(main(['--before', BEFORE, '--json', '--apply', '--exclude', 'tx-d'])).rejects.toThrow(/tx-d/);
            expect(pool.connect).not.toHaveBeenCalled();
            expect(stdoutSpy).not.toHaveBeenCalled();
            expect(console.log).toBe(originalLog);
        });
    });
});

describe('parseArgs', () => {
    test('refuses to run without --before and says what to pass', () => {
        expect(() => parseArgs([])).toThrow(/--before is required.*goal_id fix was deployed to Render/);
    });
    test('requires a zoned ISO timestamp', () => {
        expect(() => parseArgs(['--before', '2026-09-27 10:00'])).toThrow(/ISO timestamp with a zone/);
        expect(() => parseArgs(['--before', '2026-09-27T10:00:00'])).toThrow(/zone/);
    });
    test('defaults --after to the feature commit and reads the rest', () => {
        const args = parseArgs(['--before', '2026-09-27T15:30:00+05:30', '--json', '--user', U1, '--apply', '--include', 'a, b']);
        expect(args.before.toISOString()).toBe('2026-09-27T10:00:00.000Z');
        expect(args.after.toISOString()).toBe('2026-08-16T15:40:22.000Z');
        expect(args).toMatchObject({ apply: true, json: true, user: U1, include: ['a', 'b'] });
    });
    test('reads --exclude, and allows --include/--exclude on a dry run (workflow step 3)', () => {
        const args = parseArgs(['--before', BEFORE, '--exclude', 'x,y', '--include', 'a']);
        expect(args).toMatchObject({ apply: false, exclude: ['x', 'y'], include: ['a'] });
        expect(parseArgs(['--before', BEFORE]).exclude).toEqual([]);
    });
    test('rejects an id in both --include and --exclude, and empty id lists', () => {
        expect(() => parseArgs(['--before', BEFORE, '--include', 'a,b', '--exclude', 'b'])).toThrow(/both --include and --exclude: b/);
        expect(() => parseArgs(['--before', BEFORE, '--exclude', ' , '])).toThrow(/--exclude needs/);
    });
    test('rejects --after not before --before, bad --user, unknown flags', () => {
        expect(() => parseArgs(['--before', BEFORE, '--after', BEFORE])).toThrow(/earlier/);
        expect(() => parseArgs(['--before', BEFORE, '--user', '42'])).toThrow(/uuid/);
        expect(() => parseArgs(['--before', BEFORE, '--force'])).toThrow(/Unknown argument/);
    });
    test('utcNaive renders the UTC wall-clock time without a zone', () => {
        expect(utcNaive(new Date('2026-08-16T21:10:22+05:30'))).toBe('2026-08-16 15:40:22.000');
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
        const { pool, calls } = fakePool([1, 0]);
        await expect(applyLinks(pool, links)).rejects.toThrow(/Rolled back/);
        expect(calls.map(([sql]) => sql)).toContain('ROLLBACK');
        expect(calls.map(([sql]) => sql)).not.toContain('COMMIT');
    });
});

describe('CANDIDATE_SQL', () => {
    test('prefilters on a half-open timestamp window, non-NULL tags, and stays parameterized', () => {
        expect(CANDIDATE_SQL).toMatch(/t\.type = 'expense'/);
        expect(CANDIDATE_SQL).toMatch(/t\.goal_id IS NULL/);
        expect(CANDIDATE_SQL).toMatch(/t\.tags IS NOT NULL/);
        expect(CANDIDATE_SQL).toMatch(/t\.created_at >= \$1::timestamp/);
        expect(CANDIDATE_SQL).toMatch(/t\.created_at < \$2::timestamp/);
        expect(CANDIDATE_SQL).toMatch(/\$3::uuid IS NULL OR t\.user_id = \$3::uuid/);
        expect(CANDIDATE_SQL).toMatch(/t\.updated_at/);
    });
});

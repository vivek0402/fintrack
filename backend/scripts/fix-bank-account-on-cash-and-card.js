// One-off repair: take cash, wallet and credit-card spending off bank accounts.
//
// Until the "Paid from" fix, the add-transaction form put EVERY new
// transaction on the user's default (or first) bank account, whatever the
// payment method. Bank balances count every transaction with an account_id
// (routes/accounts.js), so cash spending lowered the default bank's balance
// and card purchases were counted against the bank as well as the card. Now
// only UPI, debit card, net banking and income carry an account. This script
// clears account_id on the past expenses that never should have had one.
//
// Run from backend/, pointed at PRODUCTION via DATABASE_URL (e.g. from a
// Render shell). The local DB is not prod.
//
//   1. Dry run:  node scripts/fix-bank-account-on-cash-and-card.js
//      Read the totals and the "Balances that change" list.
//   2. Apply:    node scripts/fix-bank-account-on-cash-and-card.js --apply
//
// Other flags: --user <uuid> (one user only), --json (JSON on stdout).
//
// Rows changed (everything else is left alone):
//   - type = 'expense' with account_id set, and
//   - payment_method is Cash, Wallet or Credit Card, or credit_card_id is set
//   - NOT a transfer or card-bill-payment leg (transfer_group_id, or tagged
//     transfer / credit_card_payment): those name their account on purpose
//   - NOT a goal contribution or personal-loan leg: those move money between
//     the user's own pots, where the account can be deliberate
// Income is never touched (the form always sent income without a payment
// method, so the server stored 'Cash' -- the account there is real).
//
// --apply runs ONE DB transaction and rolls back unless every UPDATE hits
// exactly the planned rows. Idempotent: changed rows no longer have an
// account_id, so a re-run finds nothing.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NON_BANK_METHODS = ['Cash', 'Wallet', 'Credit Card'];

const CANDIDATES_SQL = `
    SELECT t.id, t.user_id, t.amount, t.payment_method, t.credit_card_id, t.account_id,
           a.name AS account_name, u.email
    FROM transactions t
    JOIN bank_accounts a ON a.id = t.account_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.type = 'expense'
      AND t.account_id IS NOT NULL
      AND (t.payment_method = ANY($1::text[]) OR t.credit_card_id IS NOT NULL)
      AND t.transfer_group_id IS NULL
      AND NOT (COALESCE(t.tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
      AND t.goal_id IS NULL
      AND t.personal_loan_id IS NULL
      AND ($2::uuid IS NULL OR t.user_id = $2)
    ORDER BY t.user_id, t.account_id, t.date`;

const round2 = (x) => Math.round(x * 100) / 100;
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

function parseArgs(argv) {
    const opts = { apply: false, json: false, user: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') opts.apply = true;
        else if (a === '--json') opts.json = true;
        else if (a === '--user') {
            opts.user = argv[++i];
            if (!UUID_RE.test(opts.user || '')) throw new Error('--user needs a user id (uuid)');
        } else throw new Error(`Unknown flag: ${a}`);
    }
    return opts;
}

/** What would change: totals by kind, and each account's balance increase. */
function buildPlan(rows) {
    const byKind = {};
    const byAccount = new Map();
    for (const r of rows) {
        const kind = r.credit_card_id != null || r.payment_method === 'Credit Card' ? 'Credit card' : r.payment_method;
        const amount = Number(r.amount) || 0;
        byKind[kind] = byKind[kind] || { count: 0, total: 0 };
        byKind[kind].count++;
        byKind[kind].total = round2(byKind[kind].total + amount);
        const k = `${r.user_id}:${r.account_id}`;
        const acc = byAccount.get(k) || { user_id: r.user_id, email: r.email || null, account_id: r.account_id, account_name: r.account_name, count: 0, increase: 0 };
        acc.count++;
        acc.increase = round2(acc.increase + amount);
        byAccount.set(k, acc);
    }
    return { ids: rows.map(r => r.id), total: rows.length, byKind, accounts: [...byAccount.values()] };
}

function formatPlan(plan, { apply }) {
    const out = [];
    out.push(apply ? 'APPLYING.' : 'DRY RUN, nothing changed.');
    if (!plan.total) { out.push('No cash, wallet or card spending is on a bank account. Nothing to do.'); return out.join('\n'); }
    out.push(`Transactions to take off a bank account: ${plan.total}`);
    for (const [kind, v] of Object.entries(plan.byKind)) out.push(`  ${kind.padEnd(12)} ${String(v.count).padStart(5)}   ${inr(v.total)}`);
    out.push('Balances that go up (this spending no longer counts against them):');
    for (const a of plan.accounts) out.push(`  ${(a.email || a.user_id)} · ${a.account_name}: +${inr(a.increase)} (${a.count} transactions)`);
    if (!apply) out.push('Run again with --apply to make these changes.');
    return out.join('\n');
}

async function applyPlan(pool, plan) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const res = await client.query(
            `UPDATE transactions SET account_id = NULL, updated_at = NOW()
             WHERE id = ANY($1::uuid[]) AND account_id IS NOT NULL AND type = 'expense'`,
            [plan.ids]);
        if (res.rowCount !== plan.ids.length) {
            await client.query('ROLLBACK');
            throw new Error(`Expected to update ${plan.ids.length} rows but would update ${res.rowCount}. Rolled back, nothing changed.`);
        }
        await client.query('COMMIT');
        return res.rowCount;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

async function main(argv = process.argv.slice(2)) {
    const opts = parseArgs(argv);
    const pool = require('../src/db/pool');
    try {
        const { rows } = await pool.query(CANDIDATES_SQL, [NON_BANK_METHODS, opts.user]);
        const plan = buildPlan(rows);
        if (opts.json) process.stdout.write(JSON.stringify({ apply: opts.apply, ...plan }, null, 2) + '\n');
        else console.log(formatPlan(plan, opts));
        if (opts.apply && plan.total) {
            const n = await applyPlan(pool, plan);
            (opts.json ? console.error : console.log)(`Done: ${n} transactions taken off their bank account.`);
        }
    } finally {
        await pool.end?.();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err.message || err);
        process.exit(1);
    });
}

module.exports = { parseArgs, buildPlan, formatPlan, applyPlan, CANDIDATES_SQL, NON_BANK_METHODS };

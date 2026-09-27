// One-off repair: link past goal contributions to their savings goal.
//
// From goal linking shipping (9ce4a77, 2026-08-16) until the fix in
// routes/transactions.js, POST /api/transactions applied a goal contribution
// to savings_goals.saved_amount but never stored goal_id on the transaction
// row. So deleting/editing those rows never reversed the contribution, and
// savings-rate treated them as spending. The row records nothing about which
// goal it was, so the only signal left is the description text. This script
// matches it conservatively and only ever sets transactions.goal_id. It never
// touches saved_amount: those contributions were already applied at creation.
//
// Run from backend/, pointed at PRODUCTION via DATABASE_URL (e.g. from a
// Render shell, where DATABASE_URL is already set). The local DB is not prod.
//
//   node scripts/backfill-goal-links.js                 # dry run, writes nothing
//   node scripts/backfill-goal-links.js --json          # dry run as JSON
//   node scripts/backfill-goal-links.js --user <uuid>   # limit to one user
//   node scripts/backfill-goal-links.js --apply         # write the planned links
//
// Always read the dry run first. --apply writes every planned link in ONE DB
// transaction and rolls back if any UPDATE doesn't hit exactly one row.
// Idempotent: linked rows have goal_id set, so a re-run won't pick them up.
//
// A row is linked only when ALL of these hold:
//   - type = 'expense', goal_id IS NULL, created_at on/after 2026-08-16
//   - source = 'manual'. The goal picker lives only in TransactionModal, which
//     never sends `source`, so the route stamps 'manual'. 'sms' rows come from
//     SmsImporter's direct POST (no goal picker); 'pdf_import'/'cams_import'
//     come from their own import routes.
//   - not produced by a server-side writer that also defaults to 'manual':
//     recurring cron (same user + description + amount as a recurring rule),
//     card-EMI installments/purchase/fee rows, one-time-expense items,
//     expense splits, group splits
//   - not a transfer (tags transfer/credit_card_payment, or transfer_group_id),
//     not an investment-category row, not a personal-loan leg
//   - the trimmed, lower-cased description contains the lower-cased name of
//     EXACTLY ONE of that user's goals (names under 3 chars are ignored).
//     Two or more matches = ambiguous, listed and never touched.
//   - amount <= the goal's current saved_amount (else "skipped: exceeds goal")

const GOAL_LINKING_SHIPPED = '2026-08-16';
const MIN_GOAL_NAME_LENGTH = 3;
const ADD_FORM_SOURCES = ['manual'];
const TRANSFER_TAGS = ['transfer', 'credit_card_payment'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SKIP_REASONS = {
    not_expense: 'not an expense',
    already_linked: 'already linked to a goal',
    before_cutoff: `created before ${GOAL_LINKING_SHIPPED}`,
    transfer: 'transfer / card payment',
    investment: 'investment category',
    personal_loan: 'personal-loan leg',
    source: 'source not the add-transaction form',
    system_generated: 'posted by a server-side writer (recurring/EMI/split/one-time)',
    no_match: 'no goal name in description',
    ambiguous: 'ambiguous (2+ goal names match)',
    exceeds_goal: "amount exceeds goal's saved_amount",
};

// 'YYYY-MM-DD' from a date/timestamp string (as CANDIDATE_SQL returns them) or a Date.
function ymd(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
}

// Why a row can't be a goal contribution made through the add form, or null.
function exclusionReason(tx, cutoff) {
    if (tx.type !== 'expense') return 'not_expense';
    if (tx.goal_id) return 'already_linked';
    if (!(ymd(tx.created_at) >= cutoff)) return 'before_cutoff';
    const tags = Array.isArray(tx.tags) ? tx.tags : [];
    if (tx.transfer_group_id || tags.some(t => TRANSFER_TAGS.includes(t))) return 'transfer';
    if (tx.is_investment_category) return 'investment';
    if (tx.personal_loan_id) return 'personal_loan';
    if (!ADD_FORM_SOURCES.includes(tx.source)) return 'source';
    if (tx.system_origin || tx.group_id || tags.includes('group-split') || tags.includes('credit_card_emi_fee'))
        return 'system_generated';
    return null;
}

/**
 * Pure matcher: decides which transactions to link to which goal.
 * @param transactions rows with id, user_id, type, amount, description, date,
 *   created_at, goal_id, tags, transfer_group_id, personal_loan_id, group_id,
 *   source, is_investment_category, system_origin
 * @param goalsByUser  { [userId]: [{ id, name, saved_amount }] } (or a Map)
 * @param opts         { cutoff: 'YYYY-MM-DD' }
 * @returns {{ links, ambiguous, exceedsGoal, skipped, scanned }}
 */
function planGoalLinks(transactions, goalsByUser, opts = {}) {
    const cutoff = opts.cutoff || GOAL_LINKING_SHIPPED;
    const goalsFor = userId => (goalsByUser instanceof Map ? goalsByUser.get(userId) : goalsByUser[userId]) || [];
    const plan = { links: [], ambiguous: [], exceedsGoal: [], skipped: {}, scanned: 0 };
    const skip = reason => { plan.skipped[reason] = (plan.skipped[reason] || 0) + 1; };

    for (const tx of transactions) {
        plan.scanned++;
        const reason = exclusionReason(tx, cutoff);
        if (reason) { skip(reason); continue; }

        const description = String(tx.description || '').trim().toLowerCase();
        const matches = goalsFor(tx.user_id).filter(g => {
            const name = String(g.name || '').trim().toLowerCase();
            return name.length >= MIN_GOAL_NAME_LENGTH && description.includes(name);
        });
        const base = {
            tx_id: tx.id,
            user_id: tx.user_id,
            date: ymd(tx.date),
            amount: parseFloat(tx.amount),
            description: tx.description,
        };

        if (matches.length === 0) { skip('no_match'); continue; }
        if (matches.length > 1) {
            skip('ambiguous');
            plan.ambiguous.push({ ...base, goal_names: matches.map(g => g.name) });
            continue;
        }
        const goal = matches[0];
        const link = { ...base, goal_id: goal.id, goal_name: goal.name };
        if (base.amount > parseFloat(goal.saved_amount)) {
            skip('exceeds_goal');
            plan.exceedsGoal.push({ ...link, goal_saved_amount: parseFloat(goal.saved_amount) });
            continue;
        }
        plan.links.push(link);
    }
    return plan;
}

function formatInr(n) {
    const digits = Number.isInteger(Number(n)) ? 0 : 2;
    return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function table(rows, columns) {
    const widths = columns.map(c => Math.max(c.label.length, ...rows.map(r => String(c.get(r)).length)));
    const line = cells => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
    return [line(columns.map(c => c.label)), line(widths.map(w => '-'.repeat(w))), ...rows.map(r => line(columns.map(c => c.get(r))))].join('\n');
}

const LINK_COLUMNS = [
    { label: 'tx id', get: r => r.tx_id },
    { label: 'date', get: r => r.date },
    { label: 'amount', get: r => formatInr(r.amount) },
    { label: 'description', get: r => r.description },
    { label: 'goal', get: r => r.goal_name },
];

function groupByUser(rows) {
    const byUser = new Map();
    for (const r of rows) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id).push(r);
    }
    return byUser;
}

// JSON-friendly view of a plan; `emails` is { [userId]: email }.
function planToJson(plan, emails = {}, extra = {}) {
    return {
        ...extra,
        totals: {
            scanned: plan.scanned,
            candidates: plan.links.length,
            ambiguous: plan.ambiguous.length,
            skipped: plan.skipped,
        },
        users: [...groupByUser(plan.links)].map(([userId, links]) => ({ user_id: userId, email: emails[userId] || null, links })),
        ambiguous: plan.ambiguous,
        exceeds_goal: plan.exceedsGoal,
    };
}

function formatPlan(plan, emails = {}) {
    const out = [];
    out.push(`Scanned ${plan.scanned} unlinked expense row(s).`);
    out.push(`Candidates: ${plan.links.length}`);
    out.push(`Ambiguous:  ${plan.ambiguous.length}`);
    const skippedEntries = Object.entries(plan.skipped);
    out.push(`Skipped:    ${skippedEntries.reduce((s, [, n]) => s + n, 0)}`);
    for (const [reason, n] of skippedEntries) out.push(`  ${String(n).padStart(4)}  ${SKIP_REASONS[reason] || reason}`);

    for (const [userId, links] of groupByUser(plan.links)) {
        out.push('', `User ${userId} (${emails[userId] || 'unknown email'}): ${links.length} link(s)`, table(links, LINK_COLUMNS));
    }
    if (plan.ambiguous.length) {
        out.push('', 'Ambiguous, NOT touched:', table(plan.ambiguous, [
            { label: 'user', get: r => emails[r.user_id] || r.user_id },
            ...LINK_COLUMNS.slice(0, 4),
            { label: 'matching goals', get: r => r.goal_names.join(' | ') },
        ]));
    }
    if (plan.exceedsGoal.length) {
        out.push('', "Skipped: exceeds goal (amount > goal's current saved_amount), NOT touched:", table(plan.exceedsGoal, [
            { label: 'user', get: r => emails[r.user_id] || r.user_id },
            ...LINK_COLUMNS,
            { label: 'goal saved', get: r => formatInr(r.goal_saved_amount) },
        ]));
    }
    return out.join('\n');
}

function parseArgs(argv) {
    const args = { apply: false, json: false, user: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--json') args.json = true;
        else if (a === '--user') {
            args.user = argv[++i];
            if (!UUID_RE.test(args.user || '')) throw new Error('--user needs a user id (uuid).');
        } else throw new Error(`Unknown argument: ${a}. Usage: node scripts/backfill-goal-links.js [--user <uuid>] [--json] [--apply]`);
    }
    return args;
}

// Every column planGoalLinks needs, plus a system_origin flag for rows a
// server-side writer inserted with the default source 'manual'.
const CANDIDATE_SQL = `
    SELECT t.id, t.user_id, t.type, t.amount, t.description, t.date::text AS date,
           to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           t.goal_id, t.tags, t.transfer_group_id, t.personal_loan_id, t.group_id, t.source,
           COALESCE(c.is_investment_category, false) AS is_investment_category,
           CASE
             WHEN EXISTS (SELECT 1 FROM credit_card_emi_installments i WHERE i.transaction_id = t.id) THEN 'card_emi_installment'
             WHEN EXISTS (SELECT 1 FROM credit_card_emis e WHERE e.source_transaction_id = t.id) THEN 'card_emi_purchase'
             WHEN EXISTS (SELECT 1 FROM one_time_expense_items o WHERE o.transaction_id = t.id) THEN 'one_time_expense'
             WHEN EXISTS (SELECT 1 FROM expense_splits s WHERE s.transaction_id = t.id) THEN 'expense_split'
             WHEN EXISTS (SELECT 1 FROM recurring_transactions r
                          WHERE r.user_id = t.user_id AND r.type = t.type AND r.amount = t.amount
                            AND LOWER(TRIM(r.description)) = LOWER(TRIM(t.description))) THEN 'recurring'
           END AS system_origin
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense'
      AND t.goal_id IS NULL
      AND t.created_at >= $1::date
      AND ($2::uuid IS NULL OR t.user_id = $2::uuid)
    ORDER BY t.user_id, t.created_at, t.id`;

async function applyLinks(pool, links) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let updated = 0;
        for (const link of links) {
            const { rowCount } = await client.query(
                'UPDATE transactions SET goal_id = $1 WHERE id = $2 AND user_id = $3 AND goal_id IS NULL',
                [link.goal_id, link.tx_id, link.user_id]
            );
            if (rowCount !== 1)
                throw new Error(`Row ${link.tx_id} updated ${rowCount} row(s), expected 1. Rolled back, nothing written.`);
            updated += rowCount;
        }
        if (updated !== links.length)
            throw new Error(`Updated ${updated} row(s) but planned ${links.length}. Rolled back, nothing written.`);
        await client.query('COMMIT');
        return updated;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    // Required here, not at the top, so tests can import the pure helpers
    // without touching the database module.
    const pool = require('../src/db/pool');
    try {
        const { rows: transactions } = await pool.query(CANDIDATE_SQL, [GOAL_LINKING_SHIPPED, args.user]);
        const userIds = [...new Set(transactions.map(t => t.user_id))];

        const goalsByUser = {};
        const emails = {};
        if (userIds.length) {
            const { rows: goals } = await pool.query(
                'SELECT id, user_id, name, saved_amount FROM savings_goals WHERE user_id = ANY($1::uuid[])',
                [userIds]
            );
            for (const g of goals) (goalsByUser[g.user_id] ||= []).push(g);
            const { rows: users } = await pool.query('SELECT id, email FROM users WHERE id = ANY($1::uuid[])', [userIds]);
            for (const u of users) emails[u.id] = u.email;
        }

        const plan = planGoalLinks(transactions, goalsByUser, { cutoff: GOAL_LINKING_SHIPPED });
        let updated = null;
        if (args.apply && plan.links.length) updated = await applyLinks(pool, plan.links);
        else if (args.apply) updated = 0;

        if (args.json) {
            console.log(JSON.stringify(planToJson(plan, emails, {
                mode: args.apply ? 'apply' : 'dry-run',
                cutoff: GOAL_LINKING_SHIPPED,
                user: args.user,
                ...(updated !== null ? { updated } : {}),
            }), null, 2));
        } else {
            console.log(`\n=== Goal-link backfill (${args.apply ? 'APPLY' : 'DRY RUN, nothing written'}) ===\n`);
            console.log(formatPlan(plan, emails));
            if (updated !== null) console.log(`\nUpdated ${updated} transaction(s). savings_goals was not touched.`);
            else if (plan.links.length) console.log('\nRe-run with --apply to write these links.');
            console.log('');
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { planGoalLinks, formatPlan, planToJson, parseArgs, applyLinks, CANDIDATE_SQL, GOAL_LINKING_SHIPPED };

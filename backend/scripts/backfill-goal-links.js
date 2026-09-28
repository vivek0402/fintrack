// One-off repair: link past goal contributions to their savings goal.
//
// From goal linking shipping (9ce4a77, 2026-08-16 15:40:22 UTC) until the
// goal_id fix in routes/transactions.js was deployed, POST /api/transactions
// applied a goal contribution to savings_goals.saved_amount but never stored
// goal_id on the transaction row. So deleting/editing those rows never
// reversed the contribution, and savings-rate treated them as spending. The
// row records nothing about which goal it was, so the only signal left is the
// description text. This script matches it conservatively and only ever sets
// transactions.goal_id. It never touches saved_amount: those contributions
// were already applied at creation.
//
// Run from backend/, pointed at PRODUCTION via DATABASE_URL (e.g. from a
// Render shell, where DATABASE_URL is already set). The local DB is not prod.
//
// Recommended workflow:
//   1. Dry run:   node scripts/backfill-goal-links.js --before <deploy time>
//   2. Read the "Will link" list (and "Needs review") row by row.
//   3. Dry-run again with --exclude <txid,...> for any Will-link row that
//      looks wrong and --include <txid,...> for review rows you're sure of.
//      Check the "Excluded" section and the "Will apply" count.
//   4. Only then add --apply, with exactly the same flags:
//      node scripts/backfill-goal-links.js --before <deploy time> \
//          --exclude <txid,...> --include <txid,...> --apply
//
// Other flags: --json (pure JSON on stdout; logs go to stderr),
// --user <uuid> (one user only), --after <ISO> (see below).
//
// --before is REQUIRED: the time the goal_id fix was deployed to Render, with
// an explicit zone (e.g. 2026-09-27T10:15:00Z or 2026-09-27T15:45:00+05:30).
// After that deploy every POSTed contribution stores goal_id, so a later
// unlinked row that names a goal was never a contribution.
// --after is optional and defaults to the feature commit, 2026-08-16T15:40:22Z.
//
// Time zones: transactions.created_at is TIMESTAMP WITHOUT TIME ZONE written
// by the DB's NOW(), i.e. wall-clock time in the DB session's TimeZone. This
// script assumes that is UTC (as it is on Supabase), passes the window to SQL
// as UTC-naive timestamps, and refuses to run if the session TimeZone isn't UTC.
//
// --apply writes "Will link" (minus --exclude ids) plus any --include ids
// that are in "Needs review", in ONE DB transaction, and rolls
// back if any UPDATE doesn't hit exactly one row. Idempotent: linked rows have
// goal_id set, so a re-run won't pick them up.
//
// Candidate rows (anything else is skipped, counted by reason):
//   - type = 'expense', goal_id IS NULL, after <= created_at < before
//   - tags IS NOT NULL: POST /api/transactions always writes at least '{}'
//   - source = 'manual'. The goal picker lives only in TransactionModal, which
//     never sends `source`, so the route stamps 'manual'. 'sms' rows come from
//     SmsImporter's direct POST (no goal picker); 'pdf_import'/'cams_import'
//     come from their own import routes.
//   - not produced by a server-side writer that also defaults to 'manual'
//     (recurring cron, card-EMI rows, one-time-expense items, splits, group
//     splits), not a transfer, investment-category or personal-loan row.
//
// Matching (text normalized: lower-case, punctuation stripped, whitespace
// collapsed; goal names under 3 chars ignored):
//   - Will link: the description minus filler words (to, for, savings, fund,
//     ...) EXACTLY equals the goal name minus filler words, that goal-name
//     core is non-empty, AND the description adds contribution wording (more
//     filler words than the goal name has). "Transfer to Emergency Fund" and
//     "Laptop fund" link; a bare "Laptop" is probably the purchase itself,
//     since the goal picker never fills in the description.
//   - Needs review: the description is just the goal's own words
//     (bare_goal_name), or the goal name appears as a whole word/phrase but
//     isn't an exact match, or the row was edited after creation, or its
//     amount (or the goal's total of Will-link rows) exceeds saved_amount.
//   - Ambiguous: 2+ goals match in either tier. Never applied.

const GOAL_LINKING_SHIPPED_UTC = '2026-08-16T15:40:22Z'; // 9ce4a77, 21:10:22 +05:30
const MIN_GOAL_NAME_LENGTH = 3;
const EDIT_GRACE_MS = 5000;
const ADD_FORM_SOURCES = ['manual'];
const TRANSFER_TAGS = ['transfer', 'credit_card_payment'];
const FILLER_WORDS = new Set([
    'to', 'for', 'towards', 'transfer', 'transferred', 'save', 'saved', 'saving', 'savings',
    'deposit', 'contribution', 'add', 'added', 'goal', 'fund', 'sip', 'into',
]);
const UTC_ZONES = new Set(['utc', 'etc/utc', 'gmt', 'etc/gmt', 'zulu', 'universal', 'etc/universal', 'etc/zulu']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONED_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

const SKIP_REASONS = {
    not_expense: 'not an expense',
    already_linked: 'already linked to a goal',
    outside_window: 'created outside the window',
    tags_null: 'tags NULL (not written by POST /api/transactions)',
    transfer: 'transfer / card payment',
    investment: 'investment category',
    personal_loan: 'personal-loan leg',
    source: 'source not the add-transaction form',
    system_generated: 'posted by a server-side writer (recurring/EMI/split/one-time)',
    no_match: 'no goal name in description',
};

const REVIEW_REASONS = {
    bare_goal_name: 'description is just the goal name (maybe the purchase)',
    name_match_not_exact: 'name appears but description has other words',
    edited_after_create: 'edited after creation',
    exceeds_goal: "amount > goal's saved_amount",
    exceeds_goal_total: "goal's Will-link total > saved_amount",
};

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function withoutFiller(normalized) {
    return normalized.split(' ').filter(w => w && !FILLER_WORDS.has(w)).join(' ');
}

function fillerCount(normalized) {
    return normalized.split(' ').filter(w => FILLER_WORDS.has(w)).length;
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One normalized description vs one goal name:
//   'exact' - same non-filler words AND extra contribution wording
//             ("laptop fund" vs "Laptop")
//   'bare'  - same non-filler words and no filler beyond the goal name's own
//             ("laptop" vs "Laptop", "emergency fund" vs "Emergency Fund"):
//             as likely to be the purchase as a contribution
//   'name'  - goal name appears as a whole word/phrase, other words differ
//   null    - no match
function matchTier(normDescription, goalName) {
    const normGoal = normalize(goalName);
    if (normGoal.length < MIN_GOAL_NAME_LENGTH) return null;
    const goalCore = withoutFiller(normGoal);
    if (goalCore && withoutFiller(normDescription) === goalCore)
        return fillerCount(normDescription) > fillerCount(normGoal) ? 'exact' : 'bare';
    const wholeWord = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(normGoal)}(?![\\p{L}\\p{N}])`, 'iu');
    return wholeWord.test(normDescription) ? 'name' : null;
}

// Milliseconds since epoch. Naive strings (as CANDIDATE_SQL returns them) are UTC.
function toMs(value) {
    if (value instanceof Date) return value.getTime();
    const s = String(value || '');
    return Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s}Z`);
}

function ymd(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value || '').slice(0, 10);
}

// Why a row can't be a goal contribution made through the add form, or null.
function exclusionReason(tx, afterMs, beforeMs) {
    if (tx.type !== 'expense') return 'not_expense';
    if (tx.goal_id) return 'already_linked';
    const created = toMs(tx.created_at);
    if (!(created >= afterMs && created < beforeMs)) return 'outside_window';
    if (tx.tags === null || tx.tags === undefined) return 'tags_null';
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
 *   created_at, updated_at, goal_id, tags, transfer_group_id,
 *   personal_loan_id, group_id, source, is_investment_category, system_origin
 * @param goalsByUser  { [userId]: [{ id, name, saved_amount }] } (or a Map)
 * @param opts         { after, before } ISO strings or Dates; before required
 * @returns {{ links, review, ambiguous, skipped, scanned }}
 */
function planGoalLinks(transactions, goalsByUser, opts = {}) {
    const afterMs = toMs(opts.after || GOAL_LINKING_SHIPPED_UTC);
    const beforeMs = toMs(opts.before);
    if (!Number.isFinite(beforeMs)) throw new Error('planGoalLinks needs opts.before.');
    const goalsFor = userId => (goalsByUser instanceof Map ? goalsByUser.get(userId) : goalsByUser[userId]) || [];
    const plan = { links: [], review: [], ambiguous: [], skipped: {}, scanned: 0 };
    const skip = reason => { plan.skipped[reason] = (plan.skipped[reason] || 0) + 1; };
    const matched = [];

    for (const tx of transactions) {
        plan.scanned++;
        const reason = exclusionReason(tx, afterMs, beforeMs);
        if (reason) { skip(reason); continue; }

        const normDescription = normalize(tx.description);
        const hits = goalsFor(tx.user_id)
            .map(goal => ({ goal, tier: matchTier(normDescription, goal.name) }))
            .filter(h => h.tier);
        const base = {
            tx_id: tx.id,
            user_id: tx.user_id,
            date: ymd(tx.date),
            amount: parseFloat(tx.amount),
            description: tx.description,
        };

        if (hits.length === 0) { skip('no_match'); continue; }
        if (hits.length > 1) {
            plan.ambiguous.push({ ...base, goal_names: hits.map(h => h.goal.name) });
            continue;
        }
        const { goal, tier } = hits[0];
        const reasons = [];
        if (tier === 'bare') reasons.push('bare_goal_name');
        else if (tier !== 'exact') reasons.push('name_match_not_exact');
        if (tx.updated_at && toMs(tx.updated_at) > toMs(tx.created_at) + EDIT_GRACE_MS) reasons.push('edited_after_create');
        if (base.amount > parseFloat(goal.saved_amount)) reasons.push('exceeds_goal');
        matched.push({ ...base, goal_id: goal.id, goal_name: goal.name, goal_saved_amount: parseFloat(goal.saved_amount), reasons });
    }

    // Cumulative cap: a goal can't have received more than it now holds.
    const autoTotals = new Map();
    for (const m of matched) {
        if (m.reasons.length === 0) autoTotals.set(m.goal_id, (autoTotals.get(m.goal_id) || 0) + m.amount);
    }
    for (const m of matched) {
        if (m.reasons.length === 0 && autoTotals.get(m.goal_id) > m.goal_saved_amount + 1e-9) m.reasons.push('exceeds_goal_total');
        if (m.reasons.length === 0) {
            const link = { ...m };
            delete link.reasons;
            plan.links.push(link);
        } else {
            plan.review.push(m);
        }
    }
    return plan;
}

// Removes --exclude ids from "Will link" / "Needs review" and lists them
// under plan.excluded. Throws (so nothing is written) if an id is in neither.
function excludeFromPlan(plan, excludeIds = []) {
    const ids = new Set(excludeIds);
    const known = new Set([...plan.links, ...plan.review].map(r => r.tx_id));
    const bad = [...ids].filter(id => !known.has(id));
    if (bad.length)
        throw new Error(`--exclude ids not in "Will link" or "Needs review": ${bad.join(', ')}. Nothing written.`);
    return {
        ...plan,
        links: plan.links.filter(r => !ids.has(r.tx_id)),
        review: plan.review.filter(r => !ids.has(r.tx_id)),
        excluded: [...plan.links, ...plan.review].filter(r => ids.has(r.tx_id)),
    };
}

// The rows --apply writes: every "Will link" row plus the named review rows.
// Throws (so nothing is written) if an --include id isn't in "Needs review".
function selectLinksToApply(plan, includeIds = []) {
    const reviewById = new Map(plan.review.map(r => [r.tx_id, r]));
    const bad = includeIds.filter(id => !reviewById.has(id));
    if (bad.length)
        throw new Error(`--include ids not in "Needs review": ${bad.join(', ')}. Nothing written.`);
    const included = [...new Set(includeIds)].map(id => reviewById.get(id));
    return [...plan.links, ...included].map(r => ({ tx_id: r.tx_id, user_id: r.user_id, goal_id: r.goal_id }));
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

const TX_COLUMNS = [
    { label: 'tx id', get: r => r.tx_id },
    { label: 'date', get: r => r.date },
    { label: 'amount', get: r => formatInr(r.amount) },
    { label: 'description', get: r => r.description },
];

function groupByUser(rows) {
    const byUser = new Map();
    for (const r of rows) {
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id).push(r);
    }
    return byUser;
}

function isoWindow(window) {
    return {
        after: new Date(toMs(window.after || GOAL_LINKING_SHIPPED_UTC)).toISOString(),
        before: new Date(toMs(window.before)).toISOString(),
    };
}

// JSON-friendly view of a plan; `emails` is { [userId]: email }.
function planToJson(plan, emails = {}, window = {}, extra = {}) {
    return {
        ...extra,
        window: isoWindow(window),
        totals: {
            scanned: plan.scanned,
            will_link: plan.links.length,
            needs_review: plan.review.length,
            ambiguous: plan.ambiguous.length,
            skipped: plan.skipped,
        },
        will_link: [...groupByUser(plan.links)].map(([userId, links]) => ({ user_id: userId, email: emails[userId] || null, links })),
        needs_review: plan.review.map(r => ({ ...r, email: emails[r.user_id] || null })),
        ambiguous: plan.ambiguous.map(r => ({ ...r, email: emails[r.user_id] || null })),
        excluded: (plan.excluded || []).map(r => ({ ...r, email: emails[r.user_id] || null })),
    };
}

// opts.include: --include ids (marked in the review table and counted in
// the "Will apply" line; call selectLinksToApply first to validate them).
function formatPlan(plan, emails = {}, window = {}, opts = {}) {
    const include = new Set(opts.include || []);
    const w = isoWindow(window);
    const who = r => emails[r.user_id] || r.user_id;
    const out = [];
    out.push(`Window (created_at, UTC): ${w.after} <= created_at < ${w.before}`);
    if (window.timezone) out.push(`DB session TimeZone: ${window.timezone}`);
    out.push(`Scanned ${plan.scanned} unlinked expense row(s): ${plan.links.length} will link, `
        + `${plan.review.length} need review, ${plan.ambiguous.length} ambiguous, `
        + `${Object.values(plan.skipped).reduce((s, n) => s + n, 0)} skipped.`);
    out.push(`Will apply ${plan.links.length + include.size} row(s): ${plan.links.length} Will link + ${include.size} --include`
        + `${plan.excluded ? `, ${plan.excluded.length} excluded` : ''}.`);

    out.push('', `== Will link (${plan.links.length}) ==`);
    if (!plan.links.length) out.push('(none)');
    for (const [userId, links] of groupByUser(plan.links)) {
        out.push(`User ${userId} (${emails[userId] || 'unknown email'})`,
            table(links, [...TX_COLUMNS, { label: 'goal', get: r => r.goal_name }]));
    }

    out.push('', `== Needs review, not applied unless --include (${plan.review.length}) ==`);
    out.push(plan.review.length ? table(plan.review, [
        { label: 'incl', get: r => (include.has(r.tx_id) ? 'yes' : '') },
        { label: 'user', get: who }, ...TX_COLUMNS,
        { label: 'goal', get: r => r.goal_name },
        { label: 'goal saved', get: r => formatInr(r.goal_saved_amount) },
        { label: 'why', get: r => r.reasons.map(x => REVIEW_REASONS[x] || x).join('; ') },
    ]) : '(none)');

    out.push('', `== Ambiguous, never applied (${plan.ambiguous.length}) ==`);
    out.push(plan.ambiguous.length ? table(plan.ambiguous, [
        { label: 'user', get: who }, ...TX_COLUMNS,
        { label: 'matching goals', get: r => r.goal_names.join(' | ') },
    ]) : '(none)');

    if (plan.excluded) {
        out.push('', `== Excluded by --exclude, never applied (${plan.excluded.length}) ==`);
        out.push(plan.excluded.length ? table(plan.excluded, [
            { label: 'user', get: who }, ...TX_COLUMNS,
            { label: 'goal', get: r => r.goal_name },
        ]) : '(none)');
    }

    out.push('', '== Skipped (counts by reason) ==');
    const skipped = Object.entries(plan.skipped);
    if (!skipped.length) out.push('(none)');
    for (const [reason, n] of skipped) out.push(`${String(n).padStart(5)}  ${SKIP_REASONS[reason] || reason}`);
    return out.join('\n');
}

function parseTimestamp(flag, value) {
    if (!value || !ZONED_ISO_RE.test(value) || !Number.isFinite(Date.parse(value)))
        throw new Error(`${flag} needs an ISO timestamp with a zone, e.g. 2026-09-27T10:15:00Z or 2026-09-27T15:45:00+05:30.`);
    return new Date(value);
}

const USAGE = 'Usage: node scripts/backfill-goal-links.js --before <ISO> [--after <ISO>] [--user <uuid>] '
    + '[--exclude <txid,...>] [--include <txid,...>] [--json] [--apply]';

function parseIdList(flag, value) {
    const ids = String(value || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) throw new Error(`${flag} needs a comma-separated list of transaction ids.`);
    return ids;
}

function parseArgs(argv) {
    const args = { apply: false, json: false, user: null, include: [], exclude: [], after: new Date(GOAL_LINKING_SHIPPED_UTC), before: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--json') args.json = true;
        else if (a === '--user') {
            args.user = argv[++i];
            if (!UUID_RE.test(args.user || '')) throw new Error('--user needs a user id (uuid).');
        } else if (a === '--before') args.before = parseTimestamp('--before', argv[++i]);
        else if (a === '--after') args.after = parseTimestamp('--after', argv[++i]);
        else if (a === '--include') args.include = parseIdList('--include', argv[++i]);
        else if (a === '--exclude') args.exclude = parseIdList('--exclude', argv[++i]);
        else throw new Error(`Unknown argument: ${a}. ${USAGE}`);
    }
    if (!args.before)
        throw new Error('--before is required: pass the time the goal_id fix was deployed to Render '
            + '(ISO with zone, e.g. --before 2026-09-27T10:15:00Z). Rows after that deploy were never unlinked contributions.');
    if (args.after >= args.before) throw new Error('--after must be earlier than --before.');
    const both = args.include.filter(id => args.exclude.includes(id));
    if (both.length) throw new Error(`ids in both --include and --exclude: ${both.join(', ')}.`);
    return args;
}

// UTC-naive 'YYYY-MM-DD HH:MM:SS.mmm' for comparing against created_at.
function utcNaive(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

// Every column planGoalLinks needs, plus a system_origin flag for rows a
// server-side writer inserted with the default source 'manual'.
// `tags IS NOT NULL` is belt-and-braces on top of the system_generated checks:
// POST /api/transactions always writes tags (at least '{}'), while the
// recurring cron, expense splits, one-time expenses, card-EMI installments,
// personal-loan legs and PDF import leave it NULL. (Card payments, EMI fees and
// group splits do set tags, but those are excluded by their tags/columns.)
const CANDIDATE_SQL = `
    SELECT t.id, t.user_id, t.type, t.amount, t.description, t.date::text AS date,
           to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS created_at,
           to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS updated_at,
           t.goal_id, t.tags, t.transfer_group_id, t.personal_loan_id, t.group_id, t.source,
           COALESCE(c.is_investment_category, false) AS is_investment_category,
           CASE
             WHEN EXISTS (SELECT 1 FROM credit_card_emi_installments i WHERE i.transaction_id = t.id) THEN 'card_emi_installment'
             WHEN EXISTS (SELECT 1 FROM credit_card_emis e WHERE e.source_transaction_id = t.id) THEN 'card_emi_purchase'
             WHEN EXISTS (SELECT 1 FROM one_time_expense_items o WHERE o.transaction_id = t.id) THEN 'one_time_expense'
             WHEN EXISTS (SELECT 1 FROM expense_splits s WHERE s.transaction_id = t.id) THEN 'expense_split'
             WHEN t.recurring_id IS NOT NULL THEN 'recurring'
             WHEN EXISTS (SELECT 1 FROM recurring_transactions r
                          WHERE r.user_id = t.user_id AND r.type = t.type AND r.amount = t.amount
                            AND LOWER(TRIM(r.description)) = LOWER(TRIM(t.description))) THEN 'recurring'
           END AS system_origin
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense'
      AND t.goal_id IS NULL
      AND t.tags IS NOT NULL
      AND t.created_at >= $1::timestamp
      AND t.created_at < $2::timestamp
      AND ($3::uuid IS NULL OR t.user_id = $3::uuid)
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

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    // --json: stdout carries ONLY the final JSON. Anything else that logs to
    // stdout (e.g. db/pool.js's "Connected to PostgreSQL") goes to stderr.
    const originalLog = console.log;
    if (args.json) console.log = console.error;
    // Required here, not at the top, so tests can import the pure helpers
    // without touching the database module.
    const pool = require('../src/db/pool');
    try {
        const { rows: [{ tz }] } = await pool.query(`SELECT current_setting('TimeZone') AS tz`);
        if (!UTC_ZONES.has(String(tz).toLowerCase()))
            throw new Error(`DB session TimeZone is ${tz}, not UTC. created_at can't be compared to the window safely. Nothing done.`);

        const window = { after: args.after, before: args.before, timezone: tz };
        const { rows: transactions } = await pool.query(CANDIDATE_SQL, [utcNaive(args.after), utcNaive(args.before), args.user]);
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

        const plan = excludeFromPlan(planGoalLinks(transactions, goalsByUser, window), args.exclude);
        // Validates --include even on a dry run, so step 3 of the workflow
        // catches a bad id before --apply.
        const toApply = selectLinksToApply(plan, args.include);
        let updated = null;
        if (args.apply) updated = toApply.length ? await applyLinks(pool, toApply) : 0;

        if (args.json) {
            process.stdout.write(`${JSON.stringify(planToJson(plan, emails, window, {
                mode: args.apply ? 'apply' : 'dry-run',
                timezone: tz,
                user: args.user,
                include: args.include,
                exclude: args.exclude,
                will_apply: toApply.length,
                ...(updated !== null ? { updated } : {}),
            }), null, 2)}\n`);
        } else {
            console.log(`\n=== Goal-link backfill (${args.apply ? 'APPLY' : 'DRY RUN, nothing written'}) ===\n`);
            console.log(formatPlan(plan, emails, window, { include: args.include }));
            if (updated !== null) console.log(`\nUpdated ${updated} transaction(s). savings_goals was not touched.`);
            else console.log('\nNothing written. When the lists look right, re-run with the same flags plus --apply.');
            console.log('');
        }
    } finally {
        await pool.end();
        console.log = originalLog;
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exitCode = 1;
    });
}

module.exports = {
    main, planGoalLinks, excludeFromPlan, selectLinksToApply, formatPlan, planToJson, parseArgs, applyLinks,
    normalize, matchTier, utcNaive, CANDIDATE_SQL, GOAL_LINKING_SHIPPED_UTC,
};

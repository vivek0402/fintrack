// One-off repair: put drifted monthly recurring items back on their day.
//
// Before the recurring-schedule fix (2026-09-29), a monthly item with no
// day_of_month anchored only on its current due date, and the old date math
// overflowed short months: an item first due on the 31st posted Jan 31, then
// Mar 3, then Apr 3 ... and stayed on the 3rd. Migration 076 pinned every
// such item to the day it is due on NOW, which stops further drift but keeps
// the drifted day. The table stores no start date, so the only record of the
// original day is the item's own postings: the recurring cron copies the
// item's user, type, amount, description, category and notes onto each
// transaction, dated to the due date.
//
// For each active monthly item this finds its earliest matching posting.
// If that was on the 29th-31st and the item is now anchored on an earlier
// day, it proposes:
//   day_of_month  = the original day
//   next_due_date = that day in the month the item is next due (clamped),
//                   which is never earlier than the current next_due_date,
//                   so nothing posts twice.
// It also lists months since the first posting with no matching posting at
// all (the months the old code skipped). It never posts them: add any you
// want by hand. A match on description/amount can be a coincidence (e.g. the
// amount was edited), which is why the default is a dry run.
//
// Run from backend/, pointed at PRODUCTION via DATABASE_URL (e.g. a Render
// shell). The local DB is not prod.
//   1. Dry run:  node scripts/repair-recurring-anchors.js
//   2. Read the "Will re-anchor" list. Re-run with --exclude <id,...> for
//      any item that looks wrong.
//   3. Then add --apply with the same flags.
// Other flags: --user <uuid> (one user only).
//
// --apply updates every proposal in ONE DB transaction, each guarded on the
// row still having the day_of_month/next_due_date the plan read, and rolls
// back if any update misses. Idempotent: a re-anchored item's earliest
// posting day equals its anchor, so a re-run proposes nothing for it.

const { istAddMonths, calendarDateStr } = require('../src/utils/istDate');

const MIN_ORIGINAL_DAY = 29; // only 29-31 can overflow a short month
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEMS_SQL = `
    SELECT id, user_id, type, amount, description, category_id, notes,
           day_of_month, next_due_date
    FROM recurring_transactions
    WHERE frequency = 'monthly' AND is_active = true
      AND ($1::uuid IS NULL OR user_id = $1)
    ORDER BY user_id, id
`;

// Every posting that matches an item exactly, oldest first. Only the date is
// needed; a LATERAL keeps it one query for all items.
const POSTINGS_SQL = `
    SELECT r.id AS recurring_id, t.date
    FROM recurring_transactions r
    JOIN LATERAL (
        SELECT t.date FROM transactions t
        WHERE t.user_id = r.user_id AND t.type = r.type AND t.amount = r.amount
          AND t.description = r.description
          AND t.category_id IS NOT DISTINCT FROM r.category_id
          AND t.notes IS NOT DISTINCT FROM r.notes
          AND t.date <= r.next_due_date
    ) t ON true
    WHERE r.frequency = 'monthly' AND r.is_active = true
      AND ($1::uuid IS NULL OR r.user_id = $1)
    ORDER BY r.id, t.date
`;

const UPDATE_SQL = `
    UPDATE recurring_transactions
    SET day_of_month = $1, next_due_date = $2
    WHERE id = $3 AND user_id = $4
      AND day_of_month IS NOT DISTINCT FROM $5 AND next_due_date = $6
`;

const pad2 = n => String(n).padStart(2, '0');
const dayOf = dateStr => Number(dateStr.split('-')[2]);
const monthOf = dateStr => dateStr.slice(0, 7);

// `day` in the month of `dateStr`, clamped to that month's length.
function dayInMonth(dateStr, day) {
    const [y, m] = dateStr.split('-');
    return istAddMonths(`${y}-${m}-${pad2(day)}`, 0);
}

// 'YYYY-MM' of every month from `fromDate` to `toDate` (both 'YYYY-MM-DD'),
// inclusive.
function monthsBetween(fromDate, toDate) {
    const out = [];
    let cursor = `${monthOf(fromDate)}-01`;
    while (monthOf(cursor) <= monthOf(toDate)) {
        out.push(monthOf(cursor));
        cursor = istAddMonths(cursor, 1);
    }
    return out;
}

/**
 * Pure planner.
 * @param items    recurring_transactions rows (monthly, active)
 * @param postingsById  { [recurringId]: ['YYYY-MM-DD', ...] } oldest first (or a Map)
 * @param opts     { exclude: Set<string> }
 * @returns {{ reanchor, excluded, missedMonths, scanned }}
 */
function planRecurringRepairs(items, postingsById, opts = {}) {
    const exclude = opts.exclude || new Set();
    const postingsFor = id => (postingsById instanceof Map ? postingsById.get(id) : postingsById[id]) || [];
    const plan = { reanchor: [], excluded: [], missedMonths: [], scanned: 0 };

    for (const item of items) {
        plan.scanned++;
        const dates = postingsFor(item.id).map(d => calendarDateStr(d));
        if (!dates.length) continue;
        const nextDue = calendarDateStr(item.next_due_date);

        const posted = new Set(dates.map(monthOf));
        const missed = monthsBetween(dates[0], nextDue).filter(m => !posted.has(m) && m !== monthOf(nextDue));
        if (missed.length) plan.missedMonths.push({ id: item.id, user_id: item.user_id, description: item.description, months: missed });

        const originalDay = dayOf(dates[0]);
        const currentDay = Number(item.day_of_month) || dayOf(nextDue);
        if (originalDay < MIN_ORIGINAL_DAY || originalDay <= currentDay) continue;

        const proposal = {
            id: item.id,
            user_id: item.user_id,
            description: item.description,
            amount: item.amount,
            first_posted: dates[0],
            from_day: item.day_of_month ?? null,
            to_day: originalDay,
            from_next_due: nextDue,
            to_next_due: dayInMonth(nextDue, originalDay),
        };
        (exclude.has(String(item.id)) ? plan.excluded : plan.reanchor).push(proposal);
    }
    return plan;
}

function parseArgs(argv) {
    const args = { apply: false, user: null, exclude: new Set() };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--user') args.user = argv[++i];
        else if (a === '--exclude') String(argv[++i] || '').split(',').filter(Boolean).forEach(id => args.exclude.add(id.trim()));
        else throw new Error(`Unknown flag: ${a}`);
    }
    if (args.user && !UUID_RE.test(args.user)) throw new Error('--user must be a UUID.');
    return args;
}

function printPlan(plan) {
    console.log(`Scanned ${plan.scanned} active monthly item(s).\n`);
    console.log(`Will re-anchor (${plan.reanchor.length}):`);
    for (const p of plan.reanchor)
        console.log(`  ${p.id}  "${p.description}" ${p.amount}: first posted ${p.first_posted}; day ${p.from_day ?? '-'} -> ${p.to_day}; next due ${p.from_next_due} -> ${p.to_next_due}`);
    if (plan.excluded.length) {
        console.log(`\nExcluded (${plan.excluded.length}):`);
        for (const p of plan.excluded) console.log(`  ${p.id}  "${p.description}"`);
    }
    console.log(`\nMonths with no posting (not posted by this script) (${plan.missedMonths.length} item(s)):`);
    for (const m of plan.missedMonths) console.log(`  ${m.id}  "${m.description}": ${m.months.join(', ')}`);
}

async function applyPlan(pool, plan) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of plan.reanchor) {
            const { rowCount } = await client.query(UPDATE_SQL, [p.to_day, p.to_next_due, p.id, p.user_id, p.from_day, p.from_next_due]);
            if (rowCount !== 1) throw new Error(`Item ${p.id} changed since the plan was read; nothing applied.`);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
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
        const { rows: items } = await pool.query(ITEMS_SQL, [args.user]);
        const { rows: postings } = await pool.query(POSTINGS_SQL, [args.user]);
        const byId = new Map();
        for (const r of postings) {
            if (!byId.has(r.recurring_id)) byId.set(r.recurring_id, []);
            byId.get(r.recurring_id).push(r.date);
        }
        const plan = planRecurringRepairs(items, byId, { exclude: args.exclude });
        printPlan(plan);
        if (!args.apply) {
            console.log('\nDry run: nothing changed. Add --apply to write the re-anchor list.');
            return;
        }
        await applyPlan(pool, plan);
        console.log(`\nApplied: ${plan.reanchor.length} item(s) re-anchored.`);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(err => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { planRecurringRepairs, parseArgs, monthsBetween, UPDATE_SQL };

// Posting due recurring_transactions occurrences, shared by the midnight cron
// (index.js) and POST /api/recurring/process so the two can't double-post.
//
// Per due row:
//   1. compute the next due date FIRST (a throw here posts nothing and leaves
//      the row untouched, instead of re-posting every night);
//   2. in one DB transaction on a pooled client, claim the occurrence with a
//      guarded UPDATE (next_due_date must still be the value we read);
//   3. only if that claimed the row (rowCount 1), INSERT the transaction dated
//      to the occurrence's due date, then COMMIT. Otherwise ROLLBACK: another
//      run already posted this occurrence.
// One occurrence per row per run, as before.

const { nextRecurringDate } = require('./recurringSchedule');
const { calendarDateStr } = require('./istDate');

const CLAIM_SQL = `UPDATE recurring_transactions SET next_due_date=$1
                   WHERE id=$2 AND user_id=$3 AND next_due_date=$4`;

const INSERT_SQL = `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, date)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)`;

/**
 * Posts one occurrence of recurring row `r`.
 * @returns {Promise<'posted'|'skipped'>} 'skipped' when another run claimed it
 * @throws on a date or DB error (the transaction is rolled back first)
 */
async function postRecurringOccurrence(pool, r) {
    const dueStr = calendarDateStr(r.next_due_date);
    const nextStr = nextRecurringDate(r, dueStr);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rowCount } = await client.query(CLAIM_SQL, [nextStr, r.id, r.user_id, dueStr]);
        if (rowCount !== 1) {
            await client.query('ROLLBACK');
            return 'skipped';
        }
        await client.query(INSERT_SQL, [r.user_id, r.category_id, r.type, r.amount, r.description, r.notes, dueStr]);
        await client.query('COMMIT');
        return 'posted';
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection already broken */ }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Posts every row in `rows`, one occurrence each. Errors are logged per row
 * and never stop the loop.
 * @returns {Promise<{ processed: number, skipped: number, failed: number, created: string[] }>}
 */
async function postDueRecurring(pool, rows, logPrefix = '[Recurring]') {
    const result = { processed: 0, skipped: 0, failed: 0, created: [] };
    for (const r of rows || []) {
        try {
            const outcome = await postRecurringOccurrence(pool, r);
            if (outcome === 'posted') {
                result.processed++;
                result.created.push(r.description);
            } else {
                result.skipped++;
            }
        } catch (err) {
            result.failed++;
            console.error(`${logPrefix} Failed to process recurring ${r.id} (${r.description}):`, err.message);
        }
    }
    return result;
}

module.exports = { postRecurringOccurrence, postDueRecurring, CLAIM_SQL, INSERT_SQL };

// Next-due-date arithmetic for recurring_transactions, shared by the midnight
// cron (index.js), POST /api/recurring/process and POST /api/recurring.
//
// Monthly items land on min(anchor day, last day of the month), where the
// anchor is day_of_month. Because the anchor is day_of_month and not the
// previous (possibly clamped) due date, a day-31 item goes Jan 31 -> Feb 28/29
// -> Mar 31 -> Apr 30 -> May 31, never skipping or drifting. The old
// setMonth(+1)-then-setDate code overflowed instead (Jan 31 -> Mar 3 -> Mar 31,
// skipping February).
//
// Monthly items always get a day_of_month: POST/PUT store the first due
// date's day when none is given (monthlyAnchorDay below), and migration 076
// pinned older rows to their next due date's day. Without one the only
// anchor would be the current due date, and a clamped date (31 -> Feb 28)
// would stay on the 28th for good. The fallback below is for rows that
// somehow still have none.
//
// Daily/weekly are plain calendar-day steps (no overflow possible). The table
// only allows daily/weekly/monthly (CHECK constraint), so there is no yearly.
// All inputs/outputs are 'YYYY-MM-DD' strings; nothing reads the server
// timezone (pg DATE values go through calendarDateStr).

const { istAddDays, istAddMonths, calendarDateStr } = require('./istDate');

function pad2(n) {
    return String(n).padStart(2, '0');
}

function validDay(day) {
    const n = Number(day);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

// 'YYYY-MM-DD' for `anchorDay` in the month `monthsAhead` months after the
// month of `dateStr`, clamped to that month's last day.
function clampedDayInMonth(dateStr, anchorDay, monthsAhead) {
    const [y, m] = dateStr.split('-');
    // istAddMonths clamps the day to the target month; the source string may
    // be calendar-invalid (e.g. YYYY-02-31) and that's fine, only y/m/d are read.
    return istAddMonths(`${y}-${m}-${pad2(anchorDay)}`, monthsAhead);
}

/**
 * The occurrence after `currentDue` for a recurring item.
 * @param {{ frequency: string, day_of_month?: number|null }} item
 * @param {string|Date} currentDue  the item's next_due_date (string or pg Date)
 * @returns {string} 'YYYY-MM-DD'
 */
function nextRecurringDate({ frequency, day_of_month }, currentDue) {
    const current = calendarDateStr(currentDue);
    if (frequency === 'daily') return istAddDays(current, 1);
    if (frequency === 'weekly') return istAddDays(current, 7);
    if (frequency === 'monthly') {
        const anchor = validDay(day_of_month) ?? Number(current.split('-')[2]);
        return clampedDayInMonth(current, anchor, 1);
    }
    throw new Error(`Unsupported recurring frequency: ${frequency}`);
}

/**
 * First due date for a new item created on `todayStr` (IST): monthly items
 * with a day_of_month get that day this month (clamped) if it is still ahead,
 * otherwise next month's; weekly is a week out; everything else tomorrow.
 */
function firstRecurringDueDate({ frequency, day_of_month }, todayStr) {
    const anchor = validDay(day_of_month);
    if (frequency === 'monthly' && anchor) {
        const thisMonth = clampedDayInMonth(todayStr, anchor, 0);
        return thisMonth > todayStr ? thisMonth : clampedDayInMonth(todayStr, anchor, 1);
    }
    if (frequency === 'weekly') return istAddDays(todayStr, 7);
    return istAddDays(todayStr, 1);
}

/**
 * day_of_month to store for an item: the given day, or for monthly items with
 * none, the day of `dueStr` (its first/next due date). Non-monthly items keep
 * whatever was given (usually null).
 */
function monthlyAnchorDay({ frequency, day_of_month }, dueStr) {
    const anchor = validDay(day_of_month);
    if (anchor || frequency !== 'monthly') return anchor;
    return Number(calendarDateStr(dueStr).split('-')[2]);
}

module.exports = { nextRecurringDate, firstRecurringDueDate, monthlyAnchorDay, validDay };

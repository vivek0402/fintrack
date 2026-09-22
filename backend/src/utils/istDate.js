// Shared IST (Asia/Kolkata) date helpers for this India-only app. Using
// UTC/server-local Date methods for "today"/"this month"/"this week"
// causes the boundary to fall at 5:30am IST instead of midnight IST -- a
// bug class first found and fixed in the daily-brief feature, then found to
// recur in several more places across ai.js, insights.js, and
// opportunities.js. Route every "what is today/this month/this week in the
// user's timezone" computation through here instead of raw Date methods.
const IST_TZ = 'Asia/Kolkata';

// 'YYYY-MM-DD' for the IST calendar date containing `d` (default: now).
function istDateStr(d = new Date()) {
    return d.toLocaleDateString('en-CA', { timeZone: IST_TZ });
}

// { month, year } (month 1-indexed) for the IST calendar date containing `d`.
function istMonthYear(d = new Date()) {
    const [year, month] = istDateStr(d).split('-').map(Number);
    return { month, year };
}

// Day-of-month (1-31) for the IST calendar date containing `d`.
function istDayOfMonth(d = new Date()) {
    return parseInt(istDateStr(d).split('-')[2], 10);
}

// Number of days in the IST calendar month containing `d`.
function istDaysInMonth(d = new Date()) {
    const { month, year } = istMonthYear(d);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// 'YYYY-MM-01' for the IST calendar month containing `d`.
function istMonthStart(d = new Date()) {
    const { month, year } = istMonthYear(d);
    return `${year}-${String(month).padStart(2, '0')}-01`;
}

// 'YYYY-MM-01' for the IST calendar month immediately BEFORE the one containing `d`.
function istPriorMonthStart(d = new Date()) {
    const { month, year } = istMonthYear(d);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
}

// 'YYYY-MM-01' for the IST calendar month immediately AFTER the one containing `d`.
function istNextMonthStart(d = new Date()) {
    const { month, year } = istMonthYear(d);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

// 'YYYY-MM-01' for the IST calendar month that is `n` months before the one
// containing `d` (n=1 behaves like istPriorMonthStart; negative n reaches
// into the future, e.g. n=-1 behaves like istNextMonthStart).
function istMonthsAgoStart(n, d = new Date()) {
    const { month, year } = istMonthYear(d);
    const totalMonths = (year * 12 + (month - 1)) - n;
    const resultYear = Math.floor(totalMonths / 12);
    const resultMonth = (totalMonths % 12) + 1;
    return `${resultYear}-${String(resultMonth).padStart(2, '0')}-01`;
}

// 'YYYY-MM-DD' for the Monday of the IST calendar week containing `d`. Day-of-
// week math is done via UTC getters against a UTC-midnight reconstruction of
// the IST calendar date string, so the result never depends on the server
// process's own timezone.
function mondayOf(d = new Date()) {
    const asUtcMidnight = new Date(`${istDateStr(d)}T00:00:00.000Z`);
    const day = asUtcMidnight.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    asUtcMidnight.setUTCDate(asUtcMidnight.getUTCDate() + diff);
    return asUtcMidnight.toISOString().split('T')[0];
}

// 'YYYY-MM-DD' for the date `n` whole months after `dateStr` ('YYYY-MM-DD'),
// clamped to the target month's last day when the source day-of-month
// doesn't exist there (e.g. Jan 31 + 1 month -> Feb 28/29) -- the standard
// EMI due-date convention. Pure integer arithmetic on the parsed
// year/month/day, same as istNextMonthStart/istPriorMonthStart above; no
// server-timezone Date object is ever constructed from `dateStr`, so this
// stays IST-safe by construction (there is no "today" involved -- the
// caller supplies the anchor date). Date.UTC is used only to look up how
// many days are in the *target* calendar month, which is timezone-
// independent (same trick istDaysInMonth already uses).
function istAddMonths(dateStr, n) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const totalMonths = year * 12 + (month - 1) + n;
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = (totalMonths % 12) + 1; // 1-indexed
    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const targetDay = Math.min(day, daysInTargetMonth);
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

// Most recent calendar occurrence of `day` (day-of-month, 1-31) that is NOT
// in the future, as a 'YYYY-MM-DD' string -- i.e. "this month's occurrence
// of `day`, unless it hasn't happened yet, in which case last month's."
// Takes `todayStr` as a 'YYYY-MM-DD' string (defaulting to istDateStr(), the
// current IST calendar date), never a `Date`, the same discipline
// istAddMonths documents for itself -- so this never reads day/month/year
// off a server-timezone Date and stays IST-safe by construction, as long as
// the caller also resolved its own "today" via istDateStr first. Factored
// out of creditCardCycles.js's computeCycleBoundaries (its current-cycle
// cursor) so creditCardBalance.js's getLastStatementCloseDate -- the same
// "most recent occurrence of a billing day-of-month" concept, previously
// duplicated with raw `new Date(...)` arithmetic -- can share it instead of
// re-deriving it.
//
// Note: the constructed 'YYYY-MM-{day}' string may be lexicographically
// valid but calendar-invalid (e.g. '...-02-31' when day=31 in February) --
// that's intentional, since it's only ever used for the string comparison
// above or fed to istAddMonths, which clamps it to a real day in the target
// month. Do not "fix" this by validating the date first.
function istMostRecentDayOfMonth(day, todayStr = istDateStr()) {
    const [ty, tm] = todayStr.split('-').map(Number);
    let result = `${ty}-${String(tm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (result > todayStr) result = istAddMonths(result, -1);
    return result;
}

module.exports = { istDateStr, istMonthYear, istDayOfMonth, istDaysInMonth, istMonthStart, istPriorMonthStart, istNextMonthStart, istMonthsAgoStart, mondayOf, istAddMonths, istMostRecentDayOfMonth };

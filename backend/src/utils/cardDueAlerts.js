// Decision logic for the "credit card bill due soon and unpaid" push and the
// "credit card bill overdue" push (both in the [Cron:CardDue] job in
// index.js). Everything except fetchCardPaymentsSince is pure (no DB/FCM
// access) so it can be unit tested directly -- the cron just wires
// fetchCreditCardsWithCycleBreakdown -> isCardInDueWindow / isCardOverdue ->
// fetchCardPaymentsSince -> buildCardDueAlerts / buildCardOverdueAlerts ->
// notifyOnce.
//
// All dates are 'YYYY-MM-DD' strings. `todayStr` must already be the IST
// calendar date (istDateStr()); nothing in here reads the server clock.

const DUE_WINDOW_DAYS = 3;

// Whole days from `fromStr` to `toStr`, both 'YYYY-MM-DD'. Anchored at UTC
// midnight so the result never depends on the server's timezone.
function daysBetween(fromStr, toStr) {
    const from = Date.parse(`${fromStr}T00:00:00.000Z`);
    const to = Date.parse(`${toStr}T00:00:00.000Z`);
    return Math.round((to - from) / 86400000);
}

function formatInr(n) {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

// "27 Sept" style, same shape the bill-due cron uses. Rendered in UTC off a
// UTC-midnight anchor so the calendar day round-trips unchanged.
function formatDueDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
        .toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function dueLabel(daysLeft) {
    if (daysLeft === 0) return 'today';
    if (daysLeft === 1) return 'tomorrow';
    return `in ${daysLeft} days`;
}

// What the bank actually bills on the last statement. statement_balance from
// fetchCreditCardsWithCycleBreakdown also carries the card's full remaining
// active-EMI principal (so it cancels out of new_charges_since_statement);
// that blocked principal is not on any real statement, so strip it here.
// Returns null when the card has no billing cycle.
function amountDueOnStatement(card) {
    if (card.statement_balance == null) return null;
    return parseFloat(card.statement_balance) - (parseFloat(card.emi_blocked_principal) || 0);
}

// True when the card has a real bill (amount due > 0) with a real due date.
// Cards with no configured due period (due_days null/<=0) are skipped: their
// computed "due date" is just the statement close date, which would produce a
// misleading "due today" / "overdue" alert.
function hasBillWithDueDate(card) {
    if (!card.statement_due_date) return false;
    if (card.due_days == null || !(Number(card.due_days) > 0)) return false;
    const amountDue = amountDueOnStatement(card);
    return amountDue != null && amountDue > 0;
}

// True when the card has a real bill whose due date falls in
// [today, today + DUE_WINDOW_DAYS].
function isCardInDueWindow(card, todayStr) {
    if (!hasBillWithDueDate(card)) return false;
    const daysLeft = daysBetween(todayStr, card.statement_due_date);
    return daysLeft >= 0 && daysLeft <= DUE_WINDOW_DAYS;
}

// True when the card has a real bill that was due exactly YESTERDAY (IST):
// the overdue alert fires once, on the first day late fees apply. Later days
// don't match, so the alert never repeats or turns up stale.
function isCardOverdue(card, todayStr) {
    if (!hasBillWithDueDate(card)) return false;
    return daysBetween(card.statement_due_date, todayStr) === 1;
}

// Bill payments recorded via POST /api/credit-cards/:id/pay (the card-side
// income leg tagged 'credit_card_payment') dated strictly AFTER sinceDate.
// Strictly after, not >=: statement_balance already nets every transaction
// dated on or before the close date, so a close-day payment counted here too
// would be double-counted.
const CARD_PAYMENTS_SINCE_QUERY = `
    SELECT COALESCE(SUM(amount), 0) AS paid
    FROM transactions
    WHERE user_id = $1 AND credit_card_id = $2 AND type = 'income'
      AND 'credit_card_payment' = ANY(tags)
      AND date > $3
`;

async function fetchCardPaymentsSince(pool, userId, cardId, sinceDate) {
    const { rows } = await pool.query(CARD_PAYMENTS_SINCE_QUERY, [userId, cardId, sinceDate]);
    return parseFloat(rows[0]?.paid) || 0;
}

// Additive per-card "what's still owed on the last statement" fields for
// GET /api/credit-cards. Same math the card-due alert uses
// (amountDueOnStatement - payments recorded after the close), kept out of
// fetchCreditCardsWithCycleBreakdown on purpose: that helper is shared with
// the card-due cron (which only queries payments for the few cards inside
// the due window) and routes/debt.js, neither of which should pay for one
// payments query per card. Cards with no billing cycle get nulls.
//   statement_amount_due  what the bank billed (EMI principal stripped)
//   statement_paid        bill payments dated after last_statement_close_date
//   statement_remaining   max(0, due - paid), exact to the paisa -- NOT
//                         rounded to whole rupees like the alert: it's the
//                         Pay Bill pre-fill, and paying ₹8,000 on an
//                         ₹8,000.40 statement leaves it not paid in full.
// All three are numbers at 2dp; anything within half a paisa of 0 is 0.
const round2 = (x) => Math.round(x * 100) / 100;

async function withStatementRemaining(pool, userId, cards) {
    return Promise.all((cards || []).map(async (card) => {
        const amountDue = amountDueOnStatement(card);
        if (amountDue == null || !card.last_statement_close_date) {
            return { ...card, statement_amount_due: null, statement_paid: null, statement_remaining: null };
        }
        const paid = await fetchCardPaymentsSince(pool, userId, card.id, card.last_statement_close_date);
        // Remaining is derived from the rounded figures so due - paid = remaining exactly as shown.
        const due2 = round2(amountDue);
        const paid2 = round2(paid);
        return {
            ...card,
            statement_amount_due: due2,
            statement_paid: paid2,
            statement_remaining: Math.max(0, round2(due2 - paid2)),
        };
    }));
}

function cardDisplayName(card) {
    return [card.bank_name, card.card_name].filter(Boolean).join(' ') || 'Credit card';
}

/**
 * @param {Array} cards  rows from fetchCreditCardsWithCycleBreakdown
 * @param {Object|Map} paidByCard  card id -> amount paid since that card's
 *        last statement close (missing = 0)
 * @param {string} todayStr  IST 'YYYY-MM-DD'
 * @returns {Array<{ cardId, alertKey, title, body, data }>}
 */
function paidFor(paidByCard, id) {
    const v = paidByCard instanceof Map ? paidByCard.get(id) : paidByCard?.[id];
    return parseFloat(v) || 0;
}

// { statementBalance, paid, remaining } for a card's last statement, or null
// when nothing is left to pay. Rounds before comparing so a payment a few
// paise short of the statement (which the ₹ formatting would show as ₹0)
// doesn't nag. Shared by the due and overdue alerts.
function unpaidStatement(card, paidByCard) {
    const statementBalance = amountDueOnStatement(card);
    const paid = paidFor(paidByCard, card.id);
    const remaining = statementBalance - paid;
    if (Math.round(remaining) <= 0) return null;
    return { statementBalance, paid, remaining };
}

function buildCardDueAlerts(cards, paidByCard, todayStr) {
    const alerts = [];
    for (const card of cards || []) {
        if (!isCardInDueWindow(card, todayStr)) continue;
        const daysLeft = daysBetween(todayStr, card.statement_due_date);

        const unpaid = unpaidStatement(card, paidByCard);
        if (!unpaid) continue;
        const { statementBalance, paid, remaining } = unpaid;

        const name = cardDisplayName(card);
        const dueOn = formatDueDate(card.statement_due_date);
        const amountText = paid > 0
            ? `${formatInr(remaining)} of ${formatInr(statementBalance)} still unpaid`
            : `${formatInr(remaining)} unpaid`;

        alerts.push({
            cardId: card.id,
            alertKey: `cc_due:${card.id}:${card.statement_due_date}`,
            title: `💳 ${name} bill due ${dueLabel(daysLeft)}`,
            body: `${amountText}, due ${dueOn}. Pay and record it in FinTrack to avoid late fees.`,
            // type/deepLink follow the frontend's push contract
            // (frontend/lib/notifications.ts: data.type is a
            // NotificationType, data.deepLink is navigated to on tap).
            // /accounts is where the card list and its Pay button live.
            data: {
                type: 'bill',
                deepLink: '/accounts',
                card_id: String(card.id),
            },
        });
    }
    return alerts;
}

/**
 * Overdue alerts: the day after the due date (IST), for statements still
 * unpaid. Same inputs and remaining-amount math as buildCardDueAlerts.
 * @returns {Array<{ cardId, alertKey, title, body, data }>}
 */
function buildCardOverdueAlerts(cards, paidByCard, todayStr) {
    const alerts = [];
    for (const card of cards || []) {
        if (!isCardOverdue(card, todayStr)) continue;

        const unpaid = unpaidStatement(card, paidByCard);
        if (!unpaid) continue;
        const { statementBalance, paid, remaining } = unpaid;

        const dueOn = formatDueDate(card.statement_due_date);
        const amountText = paid > 0
            ? `${formatInr(remaining)} of ${formatInr(statementBalance)} is still unpaid. It was due on ${dueOn}.`
            : `${formatInr(remaining)} was due on ${dueOn}.`;

        alerts.push({
            cardId: card.id,
            alertKey: `cc_overdue:${card.id}:${card.statement_due_date}`,
            title: `⚠️ ${cardDisplayName(card)} bill is overdue`,
            body: `${amountText} Pay it now to limit late fees and interest.`,
            data: {
                type: 'bill',
                deepLink: '/accounts',
                card_id: String(card.id),
            },
        });
    }
    return alerts;
}

module.exports = {
    buildCardDueAlerts,
    buildCardOverdueAlerts,
    amountDueOnStatement,
    isCardInDueWindow,
    isCardOverdue,
    fetchCardPaymentsSince,
    withStatementRemaining,
    DUE_WINDOW_DAYS,
};

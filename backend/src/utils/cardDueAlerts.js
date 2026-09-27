// Pure decision logic for the "credit card bill due soon and unpaid" push
// (the [Cron:CardDue] job in index.js). Kept free of DB/FCM access so it can
// be unit tested directly -- the cron just wires
// fetchCreditCardsWithCycleBreakdown + a payments query -> this -> notifyOnce.
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
function buildCardDueAlerts(cards, paidByCard, todayStr) {
    const getPaid = (id) => {
        const v = paidByCard instanceof Map ? paidByCard.get(id) : paidByCard?.[id];
        return parseFloat(v) || 0;
    };

    const alerts = [];
    for (const card of cards || []) {
        if (!card.statement_due_date) continue;
        const statementBalance = amountDueOnStatement(card);
        if (statementBalance == null || !(statementBalance > 0)) continue;

        const daysLeft = daysBetween(todayStr, card.statement_due_date);
        if (daysLeft < 0 || daysLeft > DUE_WINDOW_DAYS) continue;

        const paid = getPaid(card.id);
        const remaining = statementBalance - paid;
        // Round before comparing so a payment a few paise short of the
        // statement (which the ₹ formatting would show as ₹0) doesn't nag.
        if (Math.round(remaining) <= 0) continue;

        const name = cardDisplayName(card);
        const dueOn = formatDueDate(card.statement_due_date);
        const amountText = paid > 0
            ? `${formatInr(remaining)} of ${formatInr(statementBalance)} still unpaid`
            : `${formatInr(remaining)} unpaid`;

        alerts.push({
            cardId: card.id,
            alertKey: `cc_due:${card.id}:${card.statement_due_date}`,
            title: `💳 ${name} bill due ${dueLabel(daysLeft)}`,
            body: `${amountText}, due ${dueOn}. Pay it and mark it as paid in FinTrack to avoid late fees.`,
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

module.exports = { buildCardDueAlerts, amountDueOnStatement, DUE_WINDOW_DAYS };

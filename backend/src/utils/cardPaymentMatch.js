// Finding the bank-side debit for a card bill that was paid outside the app.
//
// When someone records an old statement as paid, the money usually already
// left their bank account in the app (a bank-statement or SMS import, or a
// hand-added expense). Linking that debit -- instead of adding a second one --
// avoids a double debit, and stops it being counted as spending (it gets the
// credit_card_payment tag, which is what keeps it out of totals).
//
// Candidates are bank-account expenses in a date window around the
// statement's due date that aren't already a card payment or a transfer.
// scoreCandidate ranks them; only plausible ones are returned.

const CC_WORDS = /\b(credit\s*card|cc|card\s*(payment|pymt|pmt|bill)|cred|cardpay|bill\s*pay(ment)?)\b/i;

const round2 = (x) => Math.round(x * 100) / 100;

function words(s) {
    return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
}

/**
 * Score one bank debit against the payment we're looking for. Returns null
 * when it isn't a plausible match, else { score, reason }.
 *   exact amount                         +3
 *   the card in the description          +2  (bank name / card name word / last four)
 *   generic card-payment wording         +1
 *   amount within 10% (not exact)        +1  (only counts alongside a description hit)
 * Plausible = exact amount, or a description hit with a close amount.
 */
function scoreCandidate(tx, { amount, card }) {
    const txAmount = Number(tx.amount);
    const want = Number(amount);
    const exact = Math.abs(txAmount - want) < 0.01;
    const close = !exact && want > 0 && Math.abs(txAmount - want) / want <= 0.10;

    const desc = `${tx.description || ''} ${tx.notes || ''}`;
    const descLower = desc.toLowerCase();
    const cardWords = [...words(card.bank_name), ...words(card.card_name)];
    const mentionsCard = cardWords.some(w => descLower.includes(w))
        || (card.last_four && desc.includes(String(card.last_four)));
    const ccWording = CC_WORDS.test(desc);

    if (!exact && !(close && (mentionsCard || ccWording))) return null;

    let score = 0;
    const why = [];
    if (exact) { score += 3; why.push('Same amount'); }
    else { score += 1; why.push('Close amount'); }
    if (mentionsCard) { score += 2; why.push('card in description'); }
    else if (ccWording) { score += 1; why.push('card payment in description'); }
    return { score, reason: why.join(' · ') };
}

const CANDIDATES_QUERY = `
    SELECT t.id, t.amount, t.date, t.description, t.notes, t.account_id, b.name AS account_name
    FROM transactions t
    JOIN bank_accounts b ON b.id = t.account_id AND b.user_id = t.user_id
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.account_id IS NOT NULL
      AND t.credit_card_id IS NULL
      AND t.transfer_group_id IS NULL
      AND NOT (COALESCE(t.tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])
      AND t.date >= $2 AND t.date <= $3
    ORDER BY t.date ASC
    LIMIT 200`;

/** Top matches for a payment of `amount` made between `from` and `to`. */
async function findPaymentCandidates(db, userId, card, { from, to, amount, dueDate }, limit = 3) {
    const { rows } = await db.query(CANDIDATES_QUERY, [userId, from, to]);
    const due = dueDate ? new Date(dueDate) : null;
    return rows
        .map(tx => ({ tx, m: scoreCandidate(tx, { amount, card }) }))
        .filter(x => x.m)
        .sort((a, b) => b.m.score - a.m.score
            || (due ? Math.abs(new Date(a.tx.date) - due) - Math.abs(new Date(b.tx.date) - due) : 0))
        .slice(0, limit)
        .map(({ tx, m }) => ({
            id: tx.id,
            amount: round2(Number(tx.amount)),
            date: tx.date,
            description: tx.description,
            account_id: tx.account_id,
            account_name: tx.account_name,
            score: m.score,
            reason: m.reason,
        }));
}

module.exports = { scoreCandidate, findPaymentCandidates };

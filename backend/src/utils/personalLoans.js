// Centralizes "how much is left on this personal loan" so every consumer
// (the personal-loans list, net worth) computes it the same way. Status is
// never stored -- it's derived fresh from principal, repayments and
// written_off_at every time, so a forgotten update after a repayment can
// never leave it stale (the same class of bug this codebase has hit before
// with maintained-but-not-reconciled state).
const LOAN_WITH_BALANCE_QUERY = `
    SELECT pl.*,
        COALESCE(r.repaid_amount, 0) AS repaid_amount,
        pl.principal_amount - COALESCE(r.repaid_amount, 0) AS outstanding_amount
    FROM personal_loans pl
    LEFT JOIN (
        SELECT loan_id, SUM(amount) AS repaid_amount
        FROM personal_loan_repayments
        GROUP BY loan_id
    ) r ON r.loan_id = pl.id
    WHERE pl.user_id = $1
    ORDER BY pl.created_at DESC
`;

const LOAN_WITH_BALANCE_SINGLE_QUERY = `
    SELECT pl.*,
        COALESCE(r.repaid_amount, 0) AS repaid_amount,
        pl.principal_amount - COALESCE(r.repaid_amount, 0) AS outstanding_amount
    FROM personal_loans pl
    LEFT JOIN (
        SELECT loan_id, SUM(amount) AS repaid_amount
        FROM personal_loan_repayments
        WHERE loan_id = $2
        GROUP BY loan_id
    ) r ON r.loan_id = pl.id
    WHERE pl.user_id = $1 AND pl.id = $2
`;

function deriveStatus(loan) {
    if (loan.written_off_at) return 'written_off';
    const outstanding = parseFloat(loan.outstanding_amount);
    if (outstanding <= 0) return 'repaid';
    if (parseFloat(loan.repaid_amount) > 0) return 'partially_repaid';
    return 'outstanding';
}

function withStatus(loan) {
    return { ...loan, status: deriveStatus(loan) };
}

async function fetchPersonalLoansWithBalance(pool, userId) {
    const { rows } = await pool.query(LOAN_WITH_BALANCE_QUERY, [userId]);
    return rows.map(withStatus);
}

async function fetchPersonalLoanWithBalance(pool, userId, loanId) {
    const { rows } = await pool.query(LOAN_WITH_BALANCE_SINGLE_QUERY, [userId, loanId]);
    return rows[0] ? withStatus(rows[0]) : null;
}

// Aggregate for net worth: money owed TO the user is an asset (receivable),
// money the user owes is a liability (payable). Repaid and written-off loans
// contribute zero on both sides -- the money is either back or gone.
async function fetchPersonalLoanTotals(pool, userId) {
    const loans = await fetchPersonalLoansWithBalance(pool, userId);
    let receivable = 0, payable = 0;
    for (const loan of loans) {
        if (loan.status === 'written_off' || loan.status === 'repaid') continue;
        if (loan.direction === 'lent') receivable += parseFloat(loan.outstanding_amount);
        else payable += parseFloat(loan.outstanding_amount);
    }
    return { receivable, payable };
}

module.exports = { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance, fetchPersonalLoanTotals, deriveStatus };

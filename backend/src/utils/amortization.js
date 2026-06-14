// Standard reducing-balance EMI formula
function calculateEMI(principal, monthlyRate, tenureMonths) {
    if (monthlyRate === 0) return principal / tenureMonths;
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    return (principal * monthlyRate * factor) / (factor - 1);
}

// Generates a monthly amortization schedule from today, applying prepayments by date.
function generateAmortization({ outstanding_balance, interest_rate_pct, tenure_months_remaining, emi_amount, prepayments = [] }) {
    const monthlyRate = interest_rate_pct / 12 / 100;
    let emi = emi_amount;
    if (!emi) {
        emi = calculateEMI(outstanding_balance, monthlyRate, tenure_months_remaining);
    }

    const firstMonthInterest = outstanding_balance * monthlyRate;
    if (emi <= firstMonthInterest) {
        return { invalid: true, error: 'EMI is less than or equal to the monthly interest accrual; this loan configuration would never pay off.' };
    }

    const sortedPrepayments = [...prepayments]
        .map(p => ({ date: new Date(p.date), amount: parseFloat(p.amount) }))
        .sort((a, b) => a.date - b.date);

    const schedule = [];
    let balance = outstanding_balance;
    let cumulativeInterest = 0;
    let month = 0;
    const today = new Date();
    const MAX_MONTHS = 1200; // 100 years safety cap

    while (balance > 0 && month < MAX_MONTHS) {
        month++;
        const interestComponent = balance * monthlyRate;
        let principalComponent = emi - interestComponent;
        if (principalComponent > balance) principalComponent = balance;
        let closingBalance = balance - principalComponent;
        cumulativeInterest += interestComponent;

        const scheduleDate = new Date(today.getFullYear(), today.getMonth() + month, today.getDate());

        for (const p of sortedPrepayments) {
            if (p.date.getFullYear() === scheduleDate.getFullYear() && p.date.getMonth() === scheduleDate.getMonth()) {
                closingBalance -= p.amount;
                if (closingBalance < 0) closingBalance = 0;
            }
        }

        schedule.push({
            month,
            date: scheduleDate.toISOString().split('T')[0],
            opening_balance: parseFloat(balance.toFixed(2)),
            emi: parseFloat(emi.toFixed(2)),
            interest_component: parseFloat(interestComponent.toFixed(2)),
            principal_component: parseFloat(principalComponent.toFixed(2)),
            closing_balance: parseFloat(closingBalance.toFixed(2)),
            cumulative_interest: parseFloat(cumulativeInterest.toFixed(2)),
        });

        balance = closingBalance;
    }

    const total_months = schedule.length;
    const total_interest = parseFloat(cumulativeInterest.toFixed(2));
    const total_amount_payable = parseFloat((outstanding_balance + total_interest).toFixed(2));
    const payoff_date = schedule.length > 0 ? schedule[schedule.length - 1].date : null;

    return {
        invalid: false,
        schedule,
        summary: { total_months, total_interest, total_amount_payable, payoff_date, emi: parseFloat(emi.toFixed(2)) },
    };
}

function monthsRemainingForLoan(loan) {
    const monthsElapsed = Math.max(0,
        Math.floor((Date.now() - new Date(loan.disbursement_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    );
    return Math.max(loan.tenure_months - monthsElapsed, 1);
}

module.exports = { calculateEMI, generateAmortization, monthsRemainingForLoan };

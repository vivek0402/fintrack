export interface Loan {
    id: string;
    name: string;
    type: string;
    principal_amount: number;
    disbursement_date: string;
    tenure_months: number;
    interest_rate_pct: number;
    emi_amount: number | null;
    outstanding_balance: number;
    bank_or_lender?: string;
    account_number_last4?: string;
    prepayment_penalty_pct: number;
    notes?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    months_remaining: number | null;
    total_interest_remaining: number | null;
    amortization_error?: string;
}

export interface AmortizationEntry {
    month: number;
    date: string;
    opening_balance: number;
    emi: number;
    interest_component: number;
    principal_component: number;
    closing_balance: number;
    cumulative_interest: number;
}

export interface AmortizationSummary {
    total_months: number;
    total_interest: number;
    total_amount_payable: number;
    payoff_date: string;
    emi: number;
}

export interface LoanPrepayment {
    id: string;
    loan_id: string;
    amount: number;
    prepayment_date: string;
    months_saved: number;
    interest_saved: number;
    notes?: string;
    created_at: string;
}

export const LOAN_TYPES = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'gold_loan', 'business_loan', 'other'] as const;

export const LOAN_TYPE_LABELS: Record<string, string> = {
    home_loan: 'Home Loan',
    car_loan: 'Car Loan',
    personal_loan: 'Personal Loan',
    education_loan: 'Education Loan',
    gold_loan: 'Gold Loan',
    business_loan: 'Business Loan',
    other: 'Other',
};

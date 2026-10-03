// Shapes of the money data the API returns, matched to the backend queries
// (column lists from the DB; joined/computed fields noted where they come from).

/**
 * An amount as the API sends it. Postgres `numeric` columns arrive as strings
 * ("1250.00": node-postgres doesn't parse them, so no precision is lost on
 * the way), while amounts the server or the app computed are numbers. Never
 * add or compare these directly ("100" + "50" is "10050"); read them with
 * toAmount().
 */
export type Money = string | number;

/** A Money value as a number; 0 when missing or not a number. */
export function toAmount(v: Money | null | undefined): number {
    const n = typeof v === 'number' ? v : parseFloat(v ?? '');
    return Number.isFinite(n) ? n : 0;
}

export type TxType = 'income' | 'expense';

/** A row from GET /api/transactions (transactions t + category and group joins). */
export interface Transaction {
    id: string;
    user_id?: string;
    type: TxType;
    amount: Money;
    description: string;
    notes?: string | null;
    tags?: string[] | null;
    /** 'YYYY-MM-DD' (sometimes a full ISO timestamp from older caches: use the date part). */
    date: string;
    created_at?: string | null;
    updated_at?: string | null;
    category_id: string | null;
    account_id?: number | null;
    payment_method?: string | null;
    credit_card_id?: number | null;
    group_id?: number | null;
    goal_id?: string | null;
    personal_loan_id?: string | null;
    recurring_id?: string | null;
    /** Pairs the two legs of a card bill payment / transfer. */
    transfer_group_id?: string | null;
    source?: string;
    // Joins (absent on a just-saved row until the list refetches).
    category_name?: string | null;
    category_icon?: string | null;
    category_color?: string | null;
    is_investment_category?: boolean | null;
    group_name?: string | null;
    /** Saved offline, waiting in the queue to sync (shown greyed in the list). */
    _pending?: boolean;
}

/** A row from GET /api/budgets (budgets b + category join + this month's spend). */
export interface Budget {
    id: string;
    category_id: string;
    amount: Money;
    month: number;
    year: number;
    category_name?: string | null;
    category_icon?: string | null;
    category_color?: string | null;
    spent: Money;
}

/** A row from GET /api/goals (savings_goals). */
export interface Goal {
    id: string;
    name: string;
    target_amount: Money;
    saved_amount: Money | null;
    deadline: string | null;
    color: string | null;
    icon: string | null;
    event_type?: string | null;
    created_at?: string | null;
}

/** A row from GET /api/accounts (bank_accounts + balance from linked transactions). */
export interface BankAccount {
    id: number;
    name: string;
    icon: string;
    color: string;
    account_type: string;
    last_four: string | null;
    is_default: boolean;
    balance_as_of: string | null;
    starting_balance: Money;
    total_income?: Money;
    total_expenses?: Money;
    transaction_count?: Money;
    current_balance: Money;
}

/** GET /api/analytics/summary's `summary` (all computed, so numbers). */
export interface MonthSummary {
    total_income: number;
    total_expenses: number;
    balance: number;
    savings_rate: number;
    month: number;
    year: number;
}

/** A row from GET /api/analytics/trends: one month's total for one type. */
export interface TrendRow {
    year: Money;
    month: Money;
    type: TxType;
    total: Money;
}

/** A row from GET /api/credit-cards (credit_cards + balance and statement fields). */
export interface CreditCard {
    id: number;
    bank_name: string;
    card_name: string;
    last_four: string | null;
    network: string;
    color: string;
    credit_limit: Money;
    outstanding_balance: Money;
    current_outstanding_balance?: Money;
    balance_as_of: string | null;
    billing_date: number | null;
    due_days: number;
    interest_rate_pct: Money | null;
    // Null when billing_date isn't set (no statement to compute against).
    statement_balance?: Money | null;
    last_statement_close_date?: string | null;
    statement_due_date?: string | null;
    statement_amount_due?: number | null;
    statement_paid?: number | null;
    statement_remaining?: number | null;
}

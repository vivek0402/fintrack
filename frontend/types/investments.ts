export interface Investment {
    id: string;
    type: string;
    name: string;
    ticker_or_folio?: string;
    units: number;
    purchase_price_per_unit: number;
    current_nav_or_price: number;
    purchase_date: string;
    account_label?: string;
    notes?: string;
    current_value: number;
    total_invested: number;
    unrealized_gain: number;
    unrealized_gain_pct: number;
}

export interface InvestmentSummary {
    total_invested: number;
    total_current_value: number;
    total_unrealized_gain: number;
    total_unrealized_gain_pct: number;
    by_type: { type: string; count: number; total_invested: number; total_current_value: number; unrealized_gain_pct: number }[];
    top_holdings: { id: string; name: string; type: string; current_value: number; unrealized_gain_pct: number }[];
}

export const INVESTMENT_TYPES = ['mutual_fund', 'stock', 'fd', 'ppf', 'nps', 'gold', 'crypto', 'other'] as const;

export const GROUP_LABELS: Record<string, string> = {
    mutual_fund: 'Mutual Funds',
    stock: 'Stocks',
    fd: 'Fixed Deposits',
    ppf: 'PPF',
    nps: 'NPS',
    gold: 'Gold',
    crypto: 'Crypto',
    other: 'Other',
};

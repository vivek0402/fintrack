import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            useAuthStore.getState().logout();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

export const authAPI = {
    register: (data: { full_name: string; email: string; password: string }) =>
        api.post('/api/auth/register', data),
    verifyEmail: (data: { email: string; otp: string }) =>
        api.post('/api/auth/verify-email', data),
    resendOTP: (data: { email: string; type: 'register' | 'reset_password' }) =>
        api.post('/api/auth/resend-otp', data),
    forgotPassword: (data: { email: string }) =>
        api.post('/api/auth/forgot-password', data),
    resetPassword: (data: { email: string; otp: string; new_password: string }) =>
        api.post('/api/auth/reset-password', data),
    login: (data: { email: string; password: string }) =>
        api.post('/api/auth/login', data),
    me: () => api.get('/api/auth/me'),
};

export const transactionsAPI = {
    getAll: (params?: { type?: string; month?: number; year?: number }) =>
        api.get('/api/transactions', { params }),
    search: (q: string) =>
        api.get('/api/transactions/search', { params: { q } }),
    create: (data: object) => api.post('/api/transactions', data),
    update: (id: string, data: object) => api.put(`/api/transactions/${id}`, data),
    delete: (id: string) => api.delete(`/api/transactions/${id}`),
    toggleRegret: (id: string) => api.patch(`/api/transactions/${id}/regret`),
    earliest: () => api.get('/api/transactions/earliest'),
};

export const categoriesAPI = {
    getAll: () => api.get('/api/categories'),
    create: (data: object) => api.post('/api/categories', data),
    delete: (id: string) => api.delete(`/api/categories/${id}`),
};

export const budgetsAPI = {
    getAll: (params?: { month?: number; year?: number }) =>
        api.get('/api/budgets', { params }),
    create: (data: object) => api.post('/api/budgets', data),
    delete: (id: string) => api.delete(`/api/budgets/${id}`),
};

export const analyticsAPI = {
    summary: (params?: { month?: number; year?: number }) =>
        api.get('/api/analytics/summary', { params }),
    trends: () => api.get('/api/analytics/trends'),
    yearly: (year?: number) =>
        api.get('/api/analytics/yearly', { params: { year } }),
    forecast: (params?: { month?: number; year?: number }) =>
        api.get('/api/analytics/forecast', { params }),
    report: (from: string, to: string) =>
        api.get('/api/analytics/report', { params: { from, to } }),
    paymentMethods: (params?: { month?: number; year?: number }) =>
        api.get('/api/analytics/payment-methods', { params }),
    getNetWorth: () => api.get('/api/analytics/networth'),
    getInvestmentRatio: () => api.get('/api/analytics/investment-ratio'),
    getWealthVelocity: () => api.get('/api/analytics/wealth-velocity'),
    getAssetAllocation: () => api.get('/api/analytics/asset-allocation'),
};

export interface CreateInvestmentPayload {
    type: string;
    name: string;
    ticker_or_folio?: string;
    units: number;
    purchase_price_per_unit: number;
    current_nav_or_price: number;
    purchase_date: string;
    account_label?: string;
    notes?: string;
}

export interface InvestmentDetailsPayload {
    type: string;
    name: string;
    ticker_or_folio?: string;
    units: number;
    price_per_unit: number;
    scheme_code?: string;
    account_label?: string;
    notes?: string;
}

export const investmentAPI = {
    getAll: () => api.get('/api/investments'),
    getSummary: () => api.get('/api/investments/summary'),
    create: (data: CreateInvestmentPayload) => api.post('/api/investments', data),
    update: (id: string, data: Partial<CreateInvestmentPayload>) => api.patch(`/api/investments/${id}`, data),
    delete: (id: string) => api.delete(`/api/investments/${id}`),
};

export const marketDataAPI = {
    searchMutualFunds: (q: string) => api.get('/api/market-data/mf/search', { params: { q } }),
    getLatestNav: (schemeCode: string) => api.get(`/api/market-data/mf/${schemeCode}/nav`),
};

export const profileAPI = {
    get: () => api.get('/api/profile'),
    update: (data: object) => api.put('/api/profile', data),
    changePassword: (data: object) => api.put('/api/profile/password', data),
};

export const recurringAPI = {
    getAll: () => api.get('/api/recurring'),
    create: (data: object) => api.post('/api/recurring', data),
    update: (id: string, data: { type: string; amount: number; description: string; frequency: string; day_of_month?: number; category_id?: string }) =>
        api.put(`/api/recurring/${id}`, data),
    toggle: (id: string) => api.patch(`/api/recurring/${id}/toggle`),
    delete: (id: string) => api.delete(`/api/recurring/${id}`),
    process: () => api.post('/api/recurring/process'),
};

export const notificationsAPI = {
    list: (params?: { limit?: number; unread_only?: boolean }) => api.get('/api/notifications', { params }),
    create: (data: { id: string; title: string; body?: string; type?: string; deepLink?: string }) =>
        api.post('/api/notifications', data),
    markRead: (id: string) => api.patch(`/api/notifications/${id}`),
    markAllRead: () => api.post('/api/notifications/read-all'),
    clearAll: () => api.delete('/api/notifications'),
};

export const goalsAPI = {
    getAll: () => api.get('/api/goals'),
    create: (data: object) => api.post('/api/goals', data),
    update: (id: string, data: { name: string; target_amount: number; deadline?: string; color?: string }) =>
        api.put(`/api/goals/${id}`, data),
    addFunds: (id: string, amount: number) =>
        api.patch(`/api/goals/${id}/funds`, { amount }),
    delete: (id: string) => api.delete(`/api/goals/${id}`),
};

export const aiAPI = {
    afford: (query: string) => api.post('/api/ai/afford', { query }),
    chat: (message: string, history: { role: string; content: string }[]) =>
        api.post('/api/ai/chat', { message, history }),
    parseSMS: (sms: string) => api.post('/api/ai/parse-sms', { sms }),
    detectPatterns: () => api.get('/api/ai/detect-patterns'),
    parseImage: (file: File) => {
        const formData = new FormData();
        formData.append('image', file);
        return api.post('/api/ai/parse-image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    parseSplit: (text: string) => api.post('/api/ai/parse-split', { text }),
    salaryIntelligence: () => api.get('/api/ai/salary-intelligence'),
    personality: () => api.post('/api/ai/personality'),
    regretPatterns: () => api.get('/api/ai/regret-patterns'),
    salaryAllocation: (force?: boolean) => api.post(`/api/ai/salary-allocation${force ? '?force=true' : ''}`),
    lifeEvent: (data: { event_type: string; target_amount: number; target_date: string }) =>
        api.post('/api/ai/life-event', data),
    forecastCalendar: (force?: boolean) => api.get(`/api/ai/forecast-calendar${force ? '?force=true' : ''}`),
    clearCache: (key: string) => api.delete(`/api/ai/cache/${key}`),
    healthReport: (data?: { month?: number; year?: number }) => api.post('/api/ai/health-report', data || {}),
    taxEstimate: (force?: boolean) => api.get(`/api/ai/tax-estimate${force ? '?force=true' : ''}`),
    quickAdd: (text: string) => api.post('/api/ai/quick-add', { text }),
};

export const splitsAPI = {
    getAll: () => api.get('/api/splits'),
    create: (data: { description: string; total_amount: number; participants: { name: string }[]; date?: string }) =>
        api.post('/api/splits', data),
    update: (id: string, data: { description: string; total_amount: number; participants: { name: string }[]; date?: string }) =>
        api.put(`/api/splits/${id}`, data),
    settle: (id: string, index: number) => api.patch(`/api/splits/${id}/settle/${index}`),
    delete: (id: string) => api.delete(`/api/splits/${id}`),
};

export const accountsAPI = {
    getAll: () => api.get('/api/accounts'),
    create: (data: { name: string; icon?: string; color?: string; starting_balance?: number; balance_as_of?: string | null; is_default?: boolean; account_type?: string; last_four?: string | null }) =>
        api.post('/api/accounts', data),
    update: (id: number, data: { name?: string; icon?: string; color?: string; starting_balance?: number; balance_as_of?: string | null; is_default?: boolean; account_type?: string; last_four?: string | null }) =>
        api.patch(`/api/accounts/${id}`, data),
    setDefault: (id: number) => api.patch(`/api/accounts/${id}/set-default`),
    delete: (id: number) => api.delete(`/api/accounts/${id}`),
};

export const groupsAPI = {
    getAll: () => api.get('/api/groups'),
    create: (data: { name: string; emoji?: string; description?: string; budget?: number; currency?: string; members?: { name: string; email?: string }[] }) =>
        api.post('/api/groups', data),
    get: (id: string) => api.get(`/api/groups/${id}`),
    update: (id: string, data: object) => api.patch(`/api/groups/${id}`, data),
    delete: (id: string) => api.delete(`/api/groups/${id}`),
    linkTransaction: (id: string, txId: string) => api.post(`/api/groups/${id}/transactions/${txId}`),
    unlinkTransaction: (id: string, txId: string) => api.delete(`/api/groups/${id}/transactions/${txId}`),
    addSplit: (id: string, data: { description: string; total_amount: number; paid_by: string; date?: string; shares: { member: string; amount: number }[] }) =>
        api.post(`/api/groups/${id}/splits`, data),
    updateSplit: (id: string, splitId: string, data: { description: string; total_amount: number; paid_by: string; date?: string; shares: { member: string; amount: number }[] }) =>
        api.put(`/api/groups/${id}/splits/${splitId}`, data),
    settleShare: (id: string, splitId: string, shareId: string) =>
        api.patch(`/api/groups/${id}/splits/${splitId}/shares/${shareId}/settle`),
    settlements: (id: string) => api.get(`/api/groups/${id}/settlements`),
};

export const creditCardsAPI = {
    getAll: () => api.get('/api/credit-cards'),
    create: (data: {
        bank_name: string; card_name: string; last_four?: string | null;
        credit_limit?: number; outstanding_balance?: number;
        billing_date?: number | null; due_days?: number;
        network?: string; color?: string;
    }) => api.post('/api/credit-cards', data),
    update: (id: number, data: {
        bank_name?: string; card_name?: string; last_four?: string | null;
        credit_limit?: number; outstanding_balance?: number;
        billing_date?: number | null; due_days?: number;
        network?: string; color?: string;
    }) => api.put(`/api/credit-cards/${id}`, data),
    delete: (id: number) => api.delete(`/api/credit-cards/${id}`),
};

export const walletsAPI = {
    getAll: () => api.get('/api/wallets'),
    create: (data: { name: string; emoji?: string; balance?: number }) =>
        api.post('/api/wallets', data),
    update: (id: number, data: { name?: string; emoji?: string; balance?: number }) =>
        api.put(`/api/wallets/${id}`, data),
    delete: (id: number) => api.delete(`/api/wallets/${id}`),
};

export interface ParsedTransaction {
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
}

export const importAPI = {
    uploadStatement: (file: File, bankName?: string) => {
        const form = new FormData();
        form.append('pdf', file);
        if (bankName) form.append('bank_name', bankName);
        return api.post('/api/import/bank-statement', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    confirmImport: (jobId: string, transactions: ParsedTransaction[]) =>
        api.post(`/api/import/bank-statement/${jobId}/confirm`, { transactions }),
    getHistory: () => api.get('/api/import/history'),
    uploadCams: (file: File) => {
        const form = new FormData();
        form.append('pdf', file);
        return api.post('/api/import/cams-statement', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    confirmCamsImport: (jobId: string, holdings: any[]) =>
        api.post(`/api/import/cams-statement/${jobId}/confirm`, { holdings }),
};

export const taxAPI = {
    getProfile: () => api.get('/api/tax/profile'),
    saveProfile: (data: {
        financial_year?: string; employer_name?: string; basic_salary_monthly: number;
        hra_component_monthly?: number; lta_component_annual?: number; special_allowance_monthly?: number;
        rent_paid_monthly?: number; city_type?: string; lta_claims_used_in_block?: number; preferred_regime?: string;
    }) => api.post('/api/tax/profile', data),
    getHra: () => api.get('/api/tax/hra'),
    getLta: () => api.get('/api/tax/lta'),
    getAdvanceTax: () => api.get('/api/tax/advance-tax'),
    logAdvanceTaxPayment: (data: { installment_number: number; amount_paid: number; paid_on_date: string; financial_year?: string; payment_reference?: string }) =>
        api.post('/api/tax/advance-tax/payment', data),
    getItrReadiness: () => api.get('/api/tax/itr-readiness'),
    updateItrReadiness: (key: string, value: boolean) => api.patch('/api/tax/itr-readiness', { key, value }),
    get80CSummary: (fy?: string) => api.get('/api/tax/80c-summary', { params: fy ? { fy } : {} }),
    add80C: (data: { type: string; name: string; amount: number; investment_id?: string; financial_year?: string; deduction_section?: string }) =>
        api.post('/api/tax/80c', data),
    update80C: (id: string, data: { name?: string; amount?: number }) =>
        api.patch(`/api/tax/80c/${id}`, data),
    delete80C: (id: string) => api.delete(`/api/tax/80c/${id}`),
    getCapitalGains: (fy?: string) => api.get('/api/tax/capital-gains', { params: fy ? { fy } : {} }),
    addCapitalTransaction: (data: { asset_name: string; asset_type: string; transaction_type: string; units: number; price_per_unit: number; transaction_date: string }) =>
        api.post('/api/tax/capital-transaction', data),
};

export const loanAPI = {
    getAll: (active?: boolean) => api.get('/api/loans', { params: active ? { active: 'true' } : {} }),
    create: (data: {
        name: string; type: string; principal_amount: number; disbursement_date: string; tenure_months: number;
        interest_rate_pct: number; outstanding_balance: number; emi_amount?: number; bank_or_lender?: string;
        account_number_last4?: string; prepayment_penalty_pct?: number; notes?: string;
    }) => api.post('/api/loans', data),
    update: (id: string, data: {
        name?: string; outstanding_balance?: number; interest_rate_pct?: number; emi_amount?: number;
        bank_or_lender?: string; notes?: string; is_active?: boolean;
    }) => api.patch(`/api/loans/${id}`, data),
    delete: (id: string) => api.delete(`/api/loans/${id}`),
    getAmortization: (id: string) => api.get(`/api/loans/${id}/amortization`),
    addPrepayment: (id: string, data: { amount: number; prepayment_date: string; notes?: string }) =>
        api.post(`/api/loans/${id}/prepayments`, data),
    getPrepayments: (id: string) => api.get(`/api/loans/${id}/prepayments`),
};

export const debtAPI = {
    getPayoffOptimizer: (extraPayment?: number) =>
        api.get('/api/debt/payoff-optimizer', { params: extraPayment ? { extra_monthly_payment: extraPayment } : {} }),
    getPrepaymentImpact: (loanId: string, amount: number) =>
        api.get('/api/debt/prepayment-impact', { params: { loan_id: loanId, prepayment_amount: amount } }),
    getCreditUtilization: () => api.get('/api/debt/credit-utilization'),
    getDti: () => api.get('/api/debt/dti'),
};

export const planningAPI = {
    getPlan: () => api.get('/api/planning'),
    savePlan: (data: object) => api.post('/api/planning', data),
    deletePlan: () => api.delete('/api/planning'),
    getNarrative: () => api.post('/api/planning/narrative'),
    recalculate: () => api.post('/api/planning/recalculate'),
    applyRecalculation: () => api.post('/api/planning/apply-recalculation'),
    computeFire: (params: {
        monthly_expenses?: number; expected_annual_return_pct?: number; inflation_pct?: number;
        swr_pct?: number; extra_monthly_savings?: number;
    }) => api.post('/api/planning/fire', params),
    computeSip: (params: {
        mode: 'goal_based' | 'growth_based'; target_years: number; expected_annual_return_pct?: number;
        goal_amount?: number; monthly_sip?: number;
    }) => api.post('/api/planning/sip', params),
    getCashflow: () => api.get('/api/planning/cashflow'),
    getScenarios: () => api.get('/api/planning/scenarios'),
    getScenario: (id: string) => api.get(`/api/planning/scenarios/${id}`),
    createScenario: (data: { title: string; type: string; inputs_json: object; result_json?: object }) =>
        api.post('/api/planning/scenarios', data),
    updateScenario: (id: string, data: { title?: string; inputs_json?: object; result_json?: object }) =>
        api.patch(`/api/planning/scenarios/${id}`, data),
    deleteScenario: (id: string) => api.delete(`/api/planning/scenarios/${id}`),
    simulate: (type: string, inputs: object) => api.post('/api/planning/scenarios/simulate', { type, inputs }),
};

export const milestoneAPI = {
    getAll: () => api.get('/api/milestones'),
    create: (data: {
        name: string; description?: string; target_date: string; target_amount?: number;
        current_amount?: number; parent_id?: string; priority?: number; notes?: string;
    }) => api.post('/api/milestones', data),
    update: (id: string, data: {
        name?: string; description?: string; target_date?: string; target_amount?: number;
        current_amount?: number; parent_id?: string | null; priority?: number; notes?: string; status?: string;
    }) => api.patch(`/api/milestones/${id}`, data),
    updateProgress: (id: string, data: { current_amount?: number; status?: string }) =>
        api.patch(`/api/milestones/${id}/progress`, data),
    delete: (id: string) => api.delete(`/api/milestones/${id}`),
};

export const documentAPI = {
    upload: (file: File, metadata: { name: string; type: string; financial_year?: string; description?: string }) => {
        const form = new FormData();
        form.append('file', file);
        form.append('name', metadata.name);
        form.append('type', metadata.type);
        if (metadata.financial_year) form.append('financial_year', metadata.financial_year);
        if (metadata.description) form.append('description', metadata.description);
        return api.post('/api/documents', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    getAll: (filters?: { type?: string; financial_year?: string }) =>
        api.get('/api/documents', { params: filters }),
    getDownloadUrl: (id: string) => api.get(`/api/documents/${id}/download-url`),
    delete: (id: string) => api.delete(`/api/documents/${id}`),
};

export const agentAPI = {
    sendMessage: (message: string, conversation_id?: string) =>
        api.post('/api/ai/agent/message', { message, conversation_id }),
    getConversations: () => api.get('/api/ai/agent/conversations'),
    getConversation: (id: string) => api.get(`/api/ai/agent/conversations/${id}`),
    deleteConversation: (id: string) => api.delete(`/api/ai/agent/conversations/${id}`),
};

export const opportunityAPI = {
    detect: () => api.post('/api/ai/opportunities/detect'),
    getAll: () => api.get('/api/ai/opportunities'),
    dismiss: (id: string) => api.patch(`/api/ai/opportunities/${id}/dismiss`),
    markActedOn: (id: string) => api.patch(`/api/ai/opportunities/${id}/acted-on`),
};

export const briefingAPI = {
    generate: () => api.post('/api/ai/briefing/generate'),
    getLatest: () => api.get('/api/ai/briefing/latest'),
    getHistory: () => api.get('/api/ai/briefing/history'),
};

export const dailyBriefingAPI = {
    generate: () => api.post('/api/ai/briefing/daily/generate'),
    getLatest: () => api.get('/api/ai/briefing/daily/latest'),
};

export const insightsAPI = {
    getPeerBenchmarks: () => api.get('/api/insights/peer-benchmarks'),
    getBehavioralPatterns: (force?: boolean) => api.get(`/api/insights/behavioral-patterns${force ? '?force=true' : ''}`),
};

export default api;
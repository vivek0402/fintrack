import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('fintrack_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('fintrack_token');
            localStorage.removeItem('fintrack_user');
            window.location.href = '/login';
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
};

export const profileAPI = {
    get: () => api.get('/api/profile'),
    update: (data: object) => api.put('/api/profile', data),
    changePassword: (data: object) => api.put('/api/profile/password', data),
};

export const recurringAPI = {
    getAll: () => api.get('/api/recurring'),
    create: (data: object) => api.post('/api/recurring', data),
    toggle: (id: string) => api.patch(`/api/recurring/${id}/toggle`),
    delete: (id: string) => api.delete(`/api/recurring/${id}`),
    process: () => api.post('/api/recurring/process'),
};

export const goalsAPI = {
    getAll: () => api.get('/api/goals'),
    create: (data: object) => api.post('/api/goals', data),
    addFunds: (id: string, amount: number) =>
        api.patch(`/api/goals/${id}/funds`, { amount }),
    delete: (id: string) => api.delete(`/api/goals/${id}`),
};

export const aiAPI = {
    report: () => api.post('/api/ai/report'),
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
    salaryAllocation: () => api.post('/api/ai/salary-allocation'),
    lifeEvent: (data: { event_type: string; target_amount: number; target_date: string }) =>
        api.post('/api/ai/life-event', data),
    forecastCalendar: () => api.get('/api/ai/forecast-calendar'),
    healthReport: (data?: { month?: number; year?: number }) => api.post('/api/ai/health-report', data || {}),
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
    create: (data: { name: string; icon?: string; color?: string; starting_balance?: number; is_default?: boolean }) =>
        api.post('/api/accounts', data),
    update: (id: number, data: { name?: string; icon?: string; color?: string; starting_balance?: number; is_default?: boolean }) =>
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
    settleShare: (id: string, splitId: string, shareId: string) =>
        api.patch(`/api/groups/${id}/splits/${splitId}/shares/${shareId}/settle`),
    settlements: (id: string) => api.get(`/api/groups/${id}/settlements`),
};

export default api;
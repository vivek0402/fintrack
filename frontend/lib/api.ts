import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

export default api;
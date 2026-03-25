export function formatCurrency(amount: number, currency = 'INR'): string {
    const symbols: Record<string, string> = {
        INR: '₹', USD: '$', EUR: '€', GBP: '£',
        JPY: '¥', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ',
    };
    const symbol = symbols[currency] || currency;
    if (currency === 'INR') {
        return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[month]} ${year}`;
}

export function getCurrentMonthYear() {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
}

const CATEGORY_COLORS: Record<string, string> = {
    'food': 'var(--accent-green)',
    'dining': 'var(--accent-green)',
    'groceries': 'var(--accent-green)',
    'transport': 'var(--accent-blue)',
    'travel': 'var(--accent-blue)',
    'commute': 'var(--accent-blue)',
    'shopping': 'var(--accent-purple)',
    'subscription': 'var(--accent-blue)',
    'utilities': 'var(--accent-yellow)',
    'utility': 'var(--accent-yellow)',
    'bills': 'var(--accent-yellow)',
    'health': 'var(--accent-pink)',
    'medical': 'var(--accent-pink)',
    'investment': 'var(--accent-green)',
    'salary': 'var(--accent-green)',
    'freelance': 'var(--accent-green)',
    'income': 'var(--accent-green)',
    'rent': 'var(--accent-yellow)',
    'housing': 'var(--accent-yellow)',
};

const CATEGORY_BG_COLORS: Record<string, string> = {
    'food': 'var(--accent-green-bg)',
    'dining': 'var(--accent-green-bg)',
    'groceries': 'var(--accent-green-bg)',
    'transport': 'var(--accent-blue-bg)',
    'travel': 'var(--accent-blue-bg)',
    'commute': 'var(--accent-blue-bg)',
    'shopping': 'var(--accent-purple-bg)',
    'subscription': 'var(--accent-blue-bg)',
    'utilities': 'var(--accent-yellow-bg)',
    'utility': 'var(--accent-yellow-bg)',
    'bills': 'var(--accent-yellow-bg)',
    'health': 'var(--accent-pink-bg)',
    'medical': 'var(--accent-pink-bg)',
    'investment': 'var(--accent-green-bg)',
    'salary': 'var(--accent-green-bg)',
    'freelance': 'var(--accent-green-bg)',
    'income': 'var(--accent-green-bg)',
    'rent': 'var(--accent-yellow-bg)',
    'housing': 'var(--accent-yellow-bg)',
};

export function getCategoryColor(categoryName?: string | null): string {
    if (!categoryName) return 'var(--text-muted)';
    const lower = categoryName.toLowerCase();
    for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return 'var(--text-muted)';
}

export function getCategoryBg(categoryName?: string | null): string {
    if (!categoryName) return 'var(--bg-card)';
    const lower = categoryName.toLowerCase();
    for (const [key, bg] of Object.entries(CATEGORY_BG_COLORS)) {
        if (lower.includes(key)) return bg;
    }
    return 'var(--bg-card)';
}

export function exportToCSV(transactions: any[], filename: string) {
    const headers = ['Date', 'Description', 'Type', 'Amount', 'Category', 'Notes', 'Tags'];
    const rows = transactions.map(tx => [
        formatDate(tx.date),
        `"${tx.description}"`,
        tx.type,
        tx.amount,
        tx.category_name || '',
        `"${tx.notes || ''}"`,
        (tx.tags || []).join(';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
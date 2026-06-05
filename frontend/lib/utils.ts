/** Shorthand: round + format in the user's currency (or INR if not provided). */
export function fmt(n: number, currency = 'INR'): string {
    return formatCurrency(Math.round(n), currency);
}

export function formatCurrency(amount: number, currency = 'INR'): string {
    const symbols: Record<string, string> = {
        INR: '₹', USD: '$', EUR: '€', GBP: '£',
        JPY: '¥', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ',
    };
    const symbol = symbols[currency] || currency;

    // Currencies that don't use decimal fractions
    const noDecimalCurrencies = ['INR', 'JPY'];
    const useDecimals = !noDecimalCurrencies.includes(currency);

    if (currency === 'INR') {
        return `${symbol}${amount.toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        })}`;
    }

    return `${symbol}${amount.toLocaleString('en-US', {
        minimumFractionDigits: useDecimals ? 2 : 0,
        maximumFractionDigits: useDecimals ? 2 : 0,
    })}`;
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
    'food': 'var(--color-inc)',
    'dining': 'var(--color-inc)',
    'groceries': 'var(--color-inc)',
    'transport': 'var(--accent)',
    'travel': 'var(--accent)',
    'commute': 'var(--accent)',
    'shopping': 'var(--accent-2)',
    'subscription': 'var(--accent)',
    'utilities': 'var(--color-warn)',
    'utility': 'var(--color-warn)',
    'bills': 'var(--color-warn)',
    'health': 'var(--color-exp)',
    'medical': 'var(--color-exp)',
    'investment': 'var(--color-inc)',
    'salary': 'var(--color-inc)',
    'freelance': 'var(--color-inc)',
    'income': 'var(--color-inc)',
    'rent': 'var(--color-warn)',
    'housing': 'var(--color-warn)',
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

export async function exportToCSV(transactions: any[], filename: string) {
    const headers = ['Date', 'Description', 'Type', 'Amount', 'Category', 'Notes', 'Tags'];
    const rows = transactions.map(tx => [
        formatDate(tx.date),
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        tx.type,
        tx.amount,
        tx.category_name || '',
        `"${(tx.notes || '').replace(/"/g, '""')}"`,
        (tx.tags || []).join(';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');

    // Mobile / Capacitor WebView: use Web Share API with a File object.
    // This opens the native Android share sheet — user can save to Files, email, etc.
    // The `download` attribute on <a> tags is ignored in Android WebView.
    try {
        const file = new File([csv], filename, { type: 'text/csv' });
        if (
            typeof navigator.share === 'function' &&
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] })
        ) {
            await navigator.share({ files: [file], title: filename });
            return;
        }
    } catch {
        // User cancelled share or API not supported — fall through
    }

    // Desktop fallback: data URI anchor click
    const dataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
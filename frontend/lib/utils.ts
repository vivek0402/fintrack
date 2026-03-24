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
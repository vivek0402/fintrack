/** Shorthand: round + format in the user's currency (or INR if not provided). */
export function fmt(n: number, currency = 'INR'): string {
    return formatCurrency(Math.round(n), currency);
}

// Mirrors backend/src/utils/savingsRate.js's isNonSavingsExpense/isRealIncome --
// keep both definitions in sync. An expense only counts as "real spending" (and
// income only counts as "real income") when it's not investing, not a goal
// contribution, and not an internal transfer.
export function isNonSavingsExpense(tx: { type: string; is_investment_category?: boolean; goal_id?: string | null; tags?: string[] | null }): boolean {
    if (tx.type !== 'expense') return false;
    if (tx.is_investment_category) return false;
    if (tx.goal_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

export function isRealIncome(tx: { type: string; tags?: string[] | null }): boolean {
    if (tx.type !== 'income') return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

// Narrower than isNonSavingsExpense: for components that group/plot spending
// BY category (CategoryTrajectory, SankeyFlow), where an "Investments" line
// is legitimate information, not noise -- so investment-category expenses
// are deliberately kept. Goal contributions and internal transfers still get
// excluded, since those can land under any ordinary category and would
// silently inflate that category's real-spending trend otherwise.
export function isCategorizableExpense(tx: { type: string; goal_id?: string | null; tags?: string[] | null }): boolean {
    if (tx.type !== 'expense') return false;
    if (tx.goal_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
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

// Per-category keyword → emoji tables for getSmartIcon(). Keyed by the exact
// category names FinTrack seeds by default (DEFAULT_CATEGORIES in
// backend/src/routes/auth.js). A user-created category with a name not in
// this table simply has no keyword table -- getSmartIcon falls back to
// categoryIcon for it, which is correct (there's no way to pre-populate
// keywords for a category name we don't know about in advance).
const CATEGORY_KEYWORD_ICONS: Record<string, Array<[string, string]>> = {
  'Food & Dining': [
    ['pizza', '🍕'], ['coffee', '☕'], ['cafe', '☕'], ['tea', '🍵'],
    ['burger', '🍔'], ['biryani', '🍛'], ['sweet', '🍬'], ['ice cream', '🍦'],
    ['bakery', '🥐'], ['zomato', '🛵'], ['swiggy', '🛵'], ['grocery', '🛒'],
    ['groceries', '🛒'], ['milk', '🥛'], ['restaurant', '🍽️'], ['breakfast', '🍳'],
  ],
  'Transportation': [
    ['uber', '🚕'], ['ola auto', '🛺'], ['ola', '🚕'], ['cab', '🚕'], ['taxi', '🚕'],
    ['petrol', '⛽'], ['fuel', '⛽'], ['diesel', '⛽'], ['metro', '🚇'],
    ['train', '🚆'], ['bus', '🚌'], ['parking', '🅿️'],
    ['autorickshaw', '🛺'], ['auto rickshaw', '🛺'],
  ],
  'Shopping': [
    ['amazon', '📦'], ['flipkart', '📦'], ['myntra', '👕'], ['clothes', '👕'],
    ['shirt', '👕'], ['shoes', '👟'], ['phone', '📱'], ['laptop', '💻'],
    ['furniture', '🛋️'],
  ],
  'Entertainment': [
    ['movie', '🎬'], ['cinema', '🎬'], ['netflix', '📺'], ['prime video', '📺'],
    ['hotstar', '📺'], ['spotify', '🎵'], ['game', '🎮'], ['concert', '🎤'],
  ],
  'Healthcare': [
    ['doctor', '🏥'], ['hospital', '🏥'], ['medicine', '💊'], ['pharmacy', '💊'],
    ['dentist', '🦷'], ['gym', '🏋️'], ['fitness', '🏋️'],
  ],
  'Education': [
    ['course', '📚'], ['tuition', '🎓'], ['book', '📖'], ['exam', '📝'],
  ],
  'Utilities': [
    ['electricity', '⚡'], ['power bill', '⚡'], ['water bill', '💧'],
    ['wifi', '📶'], ['internet', '📶'], ['recharge', '📱'], ['gas cylinder', '🔥'],
  ],
  'Rent & Housing': [
    ['rent', '🏠'], ['maintenance', '🔧'], ['deposit', '🏦'],
  ],
  'Salary': [
    ['salary', '💰'], ['bonus', '🎁'], ['freelance', '💼'],
  ],
  'Investments': [
    ['mutual fund', '📈'], ['sip', '📈'], ['stock', '📈'], ['gold', '🪙'],
    ['fixed deposit', '🏦'],
  ],
  'Personal Care': [
    ['salon', '💇'], ['haircut', '💇'], ['spa', '🧖'], ['cosmetics', '💄'],
  ],
  'Family & Kids': [
    ['school fee', '🎒'], ['toy', '🧸'], ['daycare', '🍼'],
  ],
  'Travel': [
    ['flight', '✈️'], ['hotel', '🏨'], ['airbnb', '🏨'], ['booking.com', '🏨'],
  ],
  'Subscriptions': [
    ['netflix', '📺'], ['spotify', '🎵'], ['prime', '📦'], ['apple', '📱'],
    ['icloud', '📱'], ['youtube', '📺'],
  ],
  'Gifts & Donations': [
    ['gift', '🎁'], ['donation', '❤️'], ['charity', '❤️'],
  ],
};

// Aliases for category names from the very first schema's global default
// categories (001_initial_schema.sql: 'Food', 'Rent', 'Transport', 'Health'
// -- seeded with user_id NULL, predating the richer per-user names above).
// Accounts old enough to reference those original rows would otherwise get
// zero keyword matching just because "Food" isn't the string "Food & Dining",
// even though the same keywords apply. Point them at the same arrays instead
// of duplicating them, so edits to one table apply to both spellings.
CATEGORY_KEYWORD_ICONS['Food'] = CATEGORY_KEYWORD_ICONS['Food & Dining'];
CATEGORY_KEYWORD_ICONS['Rent'] = CATEGORY_KEYWORD_ICONS['Rent & Housing'];
CATEGORY_KEYWORD_ICONS['Transport'] = CATEGORY_KEYWORD_ICONS['Transportation'];
CATEGORY_KEYWORD_ICONS['Health'] = CATEGORY_KEYWORD_ICONS['Healthcare'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Picks a per-transaction icon from its description, scoped to its own
// category to avoid cross-category ambiguity (e.g. "Apple" means 🍎 in
// Food & Dining but 📱 in Shopping/Subscriptions). Falls back to the
// category's static icon, then to a generic card icon -- same fallback
// chain every call site already used before this function existed.
export function getSmartIcon(
  description: string | null | undefined,
  categoryName: string | null | undefined,
  categoryIcon: string | null | undefined
): string {
  const desc = (description || '').toLowerCase();
  const table = categoryName ? CATEGORY_KEYWORD_ICONS[categoryName] : null;

  if (table) {
    for (const [keyword, icon] of table) {
      const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`);
      if (re.test(desc)) return icon;
    }
  }

  return categoryIcon || '💳';
}

// Distinguishes a real emoji from a raw lucide-react icon-name string (e.g.
// 'utensils', 'shopping-bag') that can leak through from legacy/unmigrated
// category rows. Lucide names are always plain ASCII letters/hyphens; emoji
// never are. Used as a last-line guard wherever an icon field is rendered
// directly, so a bad DB value shows a safe fallback instead of literal text.
export function looksLikeEmoji(s: string | null | undefined): boolean {
  if (!s) return false;
  return !/^[a-z][a-z-]*$/i.test(s.trim());
}

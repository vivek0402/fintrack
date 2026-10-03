// Which bank account a transaction came from (or went into), for people with
// more than one. The form suggests one instead of always using the default:
//   1. the account last used for this description (Swiggy -> ICICI)
//   2. else the account last used for this payment method (UPI -> HDFC),
//      or for income in general
//   3. else the default account (or the only/first one)
// Remembered per user, updated on every save, and synced across the user's
// devices (lib/appPrefs.ts).

import { pushAppPref } from '@/lib/appPrefs';

// Only these move money in or out of a bank account. Cash, wallets and card
// spending must not touch a bank balance (the card bill payment does that).
const BANK_METHODS = ['UPI', 'Debit Card', 'Net Banking'];

export function usesBankAccount(type: string, paymentMethod: string): boolean {
    if (type === 'income') return true;
    if (type !== 'expense') return false;
    return BANK_METHODS.includes(paymentMethod);
}

interface Memory { byDesc: Record<string, number>; byMethod: Record<string, number> }

const key = (userId: string) => `fintrack-account-memory-${userId}`;

/** Lower-case, collapse spaces, drop punctuation; '' when too short to mean anything. */
export function descKey(description: string): string {
    const k = description.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    return k.length >= 3 ? k : '';
}

const methodKey = (type: string, paymentMethod: string) => (type === 'income' ? 'income' : paymentMethod);

function read(userId: string): Memory {
    try {
        const raw = localStorage.getItem(key(userId));
        const m = raw ? JSON.parse(raw) : null;
        return { byDesc: m?.byDesc ?? {}, byMethod: m?.byMethod ?? {} };
    } catch {
        return { byDesc: {}, byMethod: {} };
    }
}

export interface AccountSuggestion { id: number; why: string }

export function suggestAccount(
    userId: string | undefined,
    { description, type, paymentMethod }: { description: string; type: string; paymentMethod: string },
    accounts: { id: number; is_default?: boolean }[],
): AccountSuggestion | null {
    if (!accounts.length) return null;
    const has = (id: unknown) => accounts.some(a => a.id === id);
    if (userId) {
        const mem = read(userId);
        const d = descKey(description);
        if (d && has(mem.byDesc[d])) return { id: mem.byDesc[d], why: `last used for ${description.trim()}` };
        const m = methodKey(type, paymentMethod);
        if (has(mem.byMethod[m])) return { id: mem.byMethod[m], why: type === 'income' ? 'where income usually goes' : `usual for ${paymentMethod}` };
    }
    const def = accounts.find(a => a.is_default) ?? accounts[0];
    return { id: def.id, why: accounts.find(a => a.is_default) ? 'your default' : 'your first account' };
}

export function rememberAccount(
    userId: string | undefined,
    { description, type, paymentMethod, accountId }: { description: string; type: string; paymentMethod: string; accountId: number },
) {
    if (!userId) return;
    const mem = read(userId);
    const d = descKey(description);
    if (d) mem.byDesc[d] = accountId;
    mem.byMethod[methodKey(type, paymentMethod)] = accountId;
    // Keep the description memory bounded: drop the oldest entries past 300.
    const keys = Object.keys(mem.byDesc);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete mem.byDesc[k];
    try { localStorage.setItem(key(userId), JSON.stringify(mem)); } catch { /* storage unavailable */ }
    pushAppPref('account_memory', mem);
}

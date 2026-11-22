// "+" opens the add dialog over whatever page you're on. Callers fire this
// event instead of navigating to /transactions?add=true, which used to leave
// you on Transactions after saving. The Transactions page owns its own dialog
// (it also does the offline-pending row), so it listens for this too; the
// layout-level GlobalAddTransaction handles every other page.
export const ADD_TRANSACTION_EVENT = 'fintrack:add-transaction';

export function requestAddTransaction(): void {
    window.dispatchEvent(new Event(ADD_TRANSACTION_EVENT));
}

export function onTransactionsPage(): boolean {
    return window.location.pathname.startsWith('/transactions');
}

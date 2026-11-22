'use client';

import { useEffect, useState } from 'react';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { ADD_TRANSACTION_EVENT, onTransactionsPage } from '@/lib/addTransactionEvent';

// The add dialog for every page except /transactions (which hosts its own).
// Saving invalidates the shared query cache, so the page underneath updates
// without you leaving it.
export function GlobalAddTransaction() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handle = () => { if (!onTransactionsPage()) setOpen(true); };
        window.addEventListener(ADD_TRANSACTION_EVENT, handle);
        return () => window.removeEventListener(ADD_TRANSACTION_EVENT, handle);
    }, []);

    return <TransactionModal isOpen={open} onClose={() => setOpen(false)} />;
}

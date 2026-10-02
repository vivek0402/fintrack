'use client';

import { AlertTriangle } from 'lucide-react';
import { creditCardsAPI } from '@/lib/api';
import { useUserQuery } from '@/hooks/queries';
import { unpaidStatementIdxs, type PayCycle } from '@/lib/cardStatement';
import { getNotPaid } from '@/lib/cardNotPaid';

/**
 * "2 older statements look unpaid. Already paid?" on a credit card, so a bill
 * paid outside the app is noticed without opening Pay Bill. Hidden when
 * nothing looks unpaid, or the user said the rest really weren't paid.
 * `notPaidTick` changes when "not paid" choices change, to re-read them.
 */
export function CardUnpaidNote({ cardId, onReview, notPaidTick = 0 }: { cardId: number; onReview: () => void; notPaidTick?: number }) {
    const cycles = useUserQuery('card-cycles', [cardId],
        async () => ((await creditCardsAPI.getCycles(cardId)).data?.cycles ?? []) as PayCycle[]).data;
    if (!cycles) return null;
    void notPaidTick;
    const count = unpaidStatementIdxs(cycles, getNotPaid(cardId)).length;
    if (count === 0) return null;
    return (
        <button type="button" onClick={onReview} data-testid={`card-unpaid-note-${cardId}`} className="pressable"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer',
                background: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 32%, transparent)',
                color: 'var(--color-warn)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
                {count} older statement{count > 1 ? 's look' : ' looks'} unpaid. Already paid?
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>Review ›</span>
        </button>
    );
}

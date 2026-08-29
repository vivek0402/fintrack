'use client';

import { X } from 'lucide-react';

const fmt = (n: number) => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

export interface SuggestionItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  type: 'over' | 'under';
  avgSpend: number;
  currentBudget: number;
  suggestedAmount: number;
}

interface Props {
  items: SuggestionItem[];
  adjusting: string | null;
  onAdjust: (item: SuggestionItem) => void;
  onDismiss: (id: string) => void;
}

export function SuggestionsBanner({ items, adjusting, onAdjust, onDismiss }: Props) {
  if (!items.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>
        Smart Suggestions
      </p>
      {items.slice(0, 3).map(item => {
        const isOver    = item.type === 'over';
        const border    = isOver ? 'var(--color-warn)' : 'var(--accent)';
        const bg        = isOver
          ? 'color-mix(in srgb, var(--color-warn) 6%, transparent)'
          : 'color-mix(in srgb, var(--accent) 6%, transparent)';
        const emoji     = isOver ? '📊' : '💡';
        const msg       = isOver
          ? `You've averaged ${fmt(item.avgSpend)}/mo on ${item.categoryName} but budget is ${fmt(item.currentBudget)}. Adjust to ${fmt(item.suggestedAmount)}?`
          : `You consistently underspend on ${item.categoryName}. Reduce from ${fmt(item.currentBudget)} to ${fmt(item.suggestedAmount)}?`;

        return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', background: bg, borderLeft: `4px solid ${border}`, borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '17px', flexShrink: 0, lineHeight: 1.2 }}>{emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>{msg}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => onAdjust(item)} disabled={adjusting === item.id}
                  style={{ padding: '5px 12px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', fontSize: '12px', fontWeight: 600, cursor: adjusting === item.id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', opacity: adjusting === item.id ? 0.7 : 1 }}>
                  {adjusting === item.id ? 'Saving…' : 'Adjust'}
                </button>
                <button type="button" onClick={() => onDismiss(item.id)}
                  style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Dismiss
                </button>
              </div>
            </div>
            <button type="button" onClick={() => onDismiss(item.id)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

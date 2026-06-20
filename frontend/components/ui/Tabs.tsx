'use client';

import { ReactNode } from 'react';

interface Tab {
    key: string;
    label: string;
}

interface TabsProps {
    tabs: Tab[];
    active: string;
    onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
    return (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {tabs.map(tab => {
                const isActive = tab.key === active;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChange(tab.key)}
                        style={{
                            padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border-subtle)',
                            background: isActive ? 'var(--accent)' : 'var(--bg-surface-1)',
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                            fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)',
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            transform: isActive ? 'scale(1.04)' : 'scale(1)',
                            transition: 'background 180ms ease, color 180ms ease, transform 180ms cubic-bezier(0.34,1.56,0.64,1), border-color 180ms ease',
                        }}
                        onMouseEnter={e => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-visible)';
                        }}
                        onMouseLeave={e => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Wraps tab body content with a keyed fade/slide-in so switching tabs feels alive instead of an instant swap. */
export function TabPanel({ tabKey, children }: { tabKey: string; children: ReactNode }) {
    return (
        <div key={tabKey} style={{ animation: 'pageEnter 280ms cubic-bezier(0.16,1,0.3,1) both' }}>
            {children}
        </div>
    );
}

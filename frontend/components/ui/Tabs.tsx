'use client';

import { CSSProperties, ReactNode } from 'react';

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
                        // Glass by default (2026-08-26): inactive pills take the
                        // `.glass-field` wash, matching every hand-rolled pill row
                        // built during the rollout -- several of which sit directly
                        // beneath this component on the same page.
                        className={isActive ? undefined : 'glass-field'}
                        style={{
                            padding: '6px 14px', borderRadius: 999, border: 'none',
                            background: isActive ? 'var(--accent)' : undefined,
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                            fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)',
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            transform: isActive ? 'scale(1.04)' : 'scale(1)',
                            transition: 'background 180ms ease, color 180ms ease, transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                        // With the border gone there is nothing for the old
                        // border-colour hover to act on, so hover lifts the fill
                        // instead -- same treatment as the Calendar cells and the
                        // AI Advisor's conversation rows.
                        onMouseEnter={e => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 10%, transparent)';
                        }}
                        onMouseLeave={e => {
                            if (!isActive) (e.currentTarget as HTMLElement).style.background = '';
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Wraps tab body content with a keyed fade/slide-in so switching tabs feels alive instead of an instant swap.
 * Pass `direction` (sign of new index - old index) for a directional slide+scale instead of the default vertical fade-in.
 */
export function TabPanel({ tabKey, children, direction }: { tabKey: string; children: ReactNode; direction?: 1 | -1 | 0 }) {
    if (direction) {
        const style: CSSProperties = {
            animation: 'panelMorphSlide 260ms cubic-bezier(0.4,0,0.2,1) both',
            ['--panel-from-x' as string]: `${direction * 24}px`,
        };
        return <div key={tabKey} style={style}>{children}</div>;
    }
    return (
        <div key={tabKey} style={{ animation: 'pageEnter 280ms cubic-bezier(0.16,1,0.3,1) both' }}>
            {children}
        </div>
    );
}

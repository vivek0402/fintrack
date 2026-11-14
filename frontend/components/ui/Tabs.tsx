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

/**
 * Page-level tabs as a quiet segmented control (DESIGN.md "The card", v4).
 * The selected tab is a raised fill, not an accent colour: accent is kept for
 * the page's primary action. Scrolls sideways if the tabs outgrow the screen.
 */
export function Tabs({ tabs, active, onChange }: TabsProps) {
    return (
        <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
            <div className="fin-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        className="fin-tab"
                        aria-pressed={tab.key === active}
                        onClick={() => onChange(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
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

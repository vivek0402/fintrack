'use client';

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
                        }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}

import { type } from '@/lib/typography';

// Same chrome as the shared Input, for the controls it cannot render itself
// (select, textarea). Matches the debt page's local helpers.
export const selectStyle: React.CSSProperties = {
    ...type.body, color: 'var(--text-primary)', width: '100%', height: 40, padding: '0 var(--space-3)',
    background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};
export const textareaStyle: React.CSSProperties = { ...selectStyle, height: 'auto', minHeight: 72, padding: 'var(--space-3)', resize: 'vertical', cursor: 'text' };

/** A labelled control the shared Input cannot render itself (select, textarea). */
export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
            <label htmlFor={htmlFor} style={type.label}>{label}</label>
            {children}
        </div>
    );
}

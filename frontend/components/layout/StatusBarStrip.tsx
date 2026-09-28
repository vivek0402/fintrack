'use client';

// Solid band behind the system status bar. The Android app runs edge-to-edge,
// so without this, scrolled page content (and the ambient glow) shows through
// under the clock and battery icons. Its height is the top safe-area inset, so
// on the web and on devices without an inset it is 0px tall and paints nothing
// (the hairline is a box-shadow, which a zero-height box does not draw).
//
// Stacking: above page content and the sticky/fixed page chrome (the bottom
// nav dock at 999 sits higher, harmlessly, since it lives at the bottom),
// but BELOW every scrim (the More panel's 998, modals and sheets at
// 9999+), so an open dialog dims the band along with the page instead of
// leaving an undimmed bar on top. The lock screen hides every body child but
// the backdrop (globals.css), this included, and draws its own top inset.
export const STATUS_BAR_STRIP_Z = 997;

export function StatusBarStrip() {
    return (
        <div
            data-status-bar-strip=""
            aria-hidden="true"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: 'var(--sa-top)',
                background: 'var(--bg-base)',
                boxShadow: '0 1px 0 var(--border-subtle)',
                zIndex: STATUS_BAR_STRIP_Z,
            }}
        />
    );
}

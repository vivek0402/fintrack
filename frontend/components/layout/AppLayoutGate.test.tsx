import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppLayoutGate } from './AppLayoutGate';

const nav = vi.hoisted(() => ({ path: '/dashboard' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('./AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-chrome">{children}</div>,
}));
vi.mock('./AmbientLighting', () => ({ AmbientLighting: () => <div data-testid="ambient" /> }));
vi.mock('@/components/lock/AppLockGate', () => ({ AppLockGate: () => <div data-testid="lock-gate" /> }));

function renderAt(path: string) {
    nav.path = path;
    render(<AppLayoutGate><p>page</p></AppLayoutGate>);
}

describe('AppLayoutGate', () => {
    it('wraps app routes in the sidebar / bottom-nav chrome', () => {
        renderAt('/dashboard');
        expect(screen.getByTestId('app-chrome')).toBeInTheDocument();
    });

    it.each(['/widget-add', '/widget-add/'])('renders %s bare, but still behind the app lock', (path) => {
        renderAt(path);
        expect(screen.queryByTestId('app-chrome')).toBeNull();
        expect(screen.getByTestId('lock-gate')).toBeInTheDocument();
        expect(screen.getByText('page')).toBeInTheDocument();
    });

    it('keeps /login bare as before', () => {
        renderAt('/login');
        expect(screen.queryByTestId('app-chrome')).toBeNull();
    });
});

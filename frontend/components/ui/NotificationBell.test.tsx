import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppNotification } from '@/lib/notifications';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let mockItems: AppNotification[] = [];
vi.mock('@/lib/notifications', () => ({
    getCachedNotifications: () => [],
    getNotifications: vi.fn(async () => ({ notifications: mockItems, unreadCount: 0 })),
    markAllRead: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
}));

import { NotificationBell } from './NotificationBell';

const item = (id: string, title: string, deepLink?: string): AppNotification => ({
    id, title, body: '', type: 'info', deepLink, readAt: '2026-09-01T00:00:00Z', createdAt: new Date().toISOString(),
});

async function clickItem(title: string) {
    render(<NotificationBell />);
    // Wait for the initial fetch to land, then open the panel.
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(await screen.findByText(title));
}

describe('NotificationBell deep links', () => {
    beforeEach(() => { push.mockReset(); });

    it('navigates to a valid internal link', async () => {
        mockItems = [item('a', 'Card due', '/accounts')];
        await clickItem('Card due');
        expect(push).toHaveBeenCalledWith('/accounts');
    });

    it.each([
        '//evil.com', 'javascript:alert(1)', 'http://evil.com', 'intent://x#Intent;end',
        'data:text/html,x', '/\\evil.com', '/\n/evil.com',
    ])('sends an invalid link (%j) to the dashboard instead', async (deepLink) => {
        mockItems = [item('b', 'Bad link', deepLink)];
        await clickItem('Bad link');
        expect(push).toHaveBeenCalledWith('/dashboard');
        expect(push).not.toHaveBeenCalledWith(deepLink);
    });

    it('does not navigate when the entry has no link', async () => {
        mockItems = [item('c', 'No link')];
        await clickItem('No link');
        expect(push).not.toHaveBeenCalled();
    });
});

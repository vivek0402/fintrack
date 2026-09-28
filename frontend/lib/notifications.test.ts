import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Listener = (payload: unknown) => void;
const listeners: Record<string, Listener> = {};

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor/push-notifications', () => ({
    PushNotifications: {
        requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
        register: vi.fn(async () => {}),
        addListener: vi.fn((event: string, cb: Listener) => { listeners[event] = cb; }),
    },
}));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: { getFCMToken: vi.fn() },
}));

vi.mock('./api', () => ({
    default: { post: vi.fn(async () => ({})) },
    notificationsAPI: {
        create: vi.fn(async () => ({})),
        list: vi.fn(),
        markAllRead: vi.fn(),
        markRead: vi.fn(),
        clearAll: vi.fn(),
    },
}));

import api, { notificationsAPI } from './api';
import { initPushNotifications, addInAppNotification } from './notifications';

describe('foreground push handler', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await initPushNotifications();
    });

    it('does not POST a copy of the push (the server already recorded it)', () => {
        listeners.pushNotificationReceived({
            title: 'Card due', body: 'Pay it', data: { type: 'bill', deepLink: '/accounts' },
        });

        expect(notificationsAPI.create).not.toHaveBeenCalled();
        expect(api.post).not.toHaveBeenCalledWith('/api/notifications', expect.anything());
    });

    it('asks the bell to refetch via the fintrack-notification event', () => {
        const handler = vi.fn();
        window.addEventListener('fintrack-notification', handler);

        listeners.pushNotificationReceived({ title: 't', body: 'b', data: {} });

        expect(handler).toHaveBeenCalledTimes(1);
        window.removeEventListener('fintrack-notification', handler);
    });
});

describe('push tap handler', () => {
    const originalLocation = window.location;

    beforeEach(async () => {
        vi.clearAllMocks();
        Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: '/start' } });
        await initPushNotifications();
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
    });

    const tap = (data: Record<string, unknown>) =>
        listeners.pushNotificationActionPerformed({ notification: { data } });

    it('navigates to a valid internal deep link', () => {
        tap({ deepLink: '/accounts' });
        expect(window.location.href).toBe('/accounts');
    });

    it('does not navigate when the push has no deep link', () => {
        tap({ type: 'bill' });
        expect(window.location.href).toBe('/start');
    });

    it.each([
        '//evil.com', '/..//evil.com', 'javascript:alert(1)', 'http://evil.com', 'intent://x#Intent;end',
        'data:text/html,x', '/\\evil.com', '/\t/evil.com',
    ])('sends an invalid deep link (%j) to the dashboard instead', (deepLink) => {
        tap({ deepLink });
        expect(window.location.href).toBe('/dashboard');
    });
});

describe('addInAppNotification', () => {
    beforeEach(() => vi.clearAllMocks());

    it('passes a valid deep link through and drops an invalid one', () => {
        addInAppNotification({ id: 'a', title: 't', body: 'b', type: 'info', deepLink: '/goals', readAt: null, createdAt: '' });
        addInAppNotification({ id: 'b', title: 't', body: 'b', type: 'info', deepLink: 'javascript:alert(1)', readAt: null, createdAt: '' });

        expect(notificationsAPI.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'a', deepLink: '/goals' }));
        expect(notificationsAPI.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'b', deepLink: undefined }));
    });
});

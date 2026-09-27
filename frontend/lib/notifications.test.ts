import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { initPushNotifications } from './notifications';

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

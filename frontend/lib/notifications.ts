import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import api, { notificationsAPI } from './api';

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    try {
      await api.post('/api/notifications/register-token', { token: token.value });
    } catch {}
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    addInAppNotification({
      id: Date.now().toString(),
      title: notification.title || 'FinTrack',
      body: notification.body || '',
      type: (notification.data?.type as NotificationType) || 'info',
      deepLink: notification.data?.deepLink,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const deepLink = action.notification.data?.deepLink;
    if (deepLink && typeof window !== 'undefined') {
      window.location.href = deepLink;
    }
  });
}

export async function syncFCMTokenFromNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { token } = await FinTrackNative.getFCMToken();
    if (token) {
      await api.post('/api/notifications/register-token', { token });
    }
  } catch {}
}

// ─── In-App Notification Center ───────────────────────────────────────────────

export type NotificationType = 'budget' | 'goal' | 'bill' | 'summary' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  deepLink?: string;
  readAt: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'fintrack-notifications';

// Instant-paint cache only — never the source of truth. Read synchronously on
// first render so the bell doesn't flash empty while the API call resolves;
// always overwritten by the next getNotifications() fetch.
export function getCachedNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const res = await notificationsAPI.list();
  const notifications: AppNotification[] = res.data.notifications || [];
  const unreadCount: number = res.data.unread_count ?? notifications.filter(n => !n.readAt).length;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications)); } catch {}
  return { notifications, unreadCount };
}

// Fire-and-forget: the backend dedups by (user_id, id) via ON CONFLICT DO
// NOTHING, so calling this repeatedly with the same deterministic id (e.g.
// from notificationTrigger's rule checks) is always safe.
export function addInAppNotification(n: AppNotification): void {
  notificationsAPI.create({ id: n.id, title: n.title, body: n.body, type: n.type, deepLink: n.deepLink }).catch(() => {});
  window.dispatchEvent(new CustomEvent('fintrack-notification', { detail: n }));
}

export async function markAllRead(): Promise<void> {
  await notificationsAPI.markAllRead();
}

export async function markRead(id: string): Promise<void> {
  await notificationsAPI.markRead(id);
}

export async function clearAll(): Promise<void> {
  await notificationsAPI.clearAll();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

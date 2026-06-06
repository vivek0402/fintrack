import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import api from './api';

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
const MAX_STORED = 50;

export function getNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function addInAppNotification(n: AppNotification): void {
  const existing = getNotifications();
  const updated = [n, ...existing].slice(0, MAX_STORED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('fintrack-notification', { detail: n }));
}

export function markAllRead(): void {
  const now = new Date().toISOString();
  const updated = getNotifications().map(n => ({ ...n, readAt: n.readAt || now }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function markRead(id: string): void {
  const updated = getNotifications().map(n =>
    n.id === id ? { ...n, readAt: new Date().toISOString() } : n
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.readAt).length;
}

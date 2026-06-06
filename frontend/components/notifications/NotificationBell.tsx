'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  AppNotification,
  clearAll,
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from '@/lib/notifications';

const TYPE_ICON: Record<string, string> = {
  budget: '📊',
  goal: '🎯',
  bill: '📅',
  summary: '📈',
  info: 'ℹ️',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    typeof window !== 'undefined' ? getNotifications() : []
  );
  const [unread, setUnread] = useState(() =>
    typeof window !== 'undefined' ? getUnreadCount() : 0
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refresh = () => {
    setNotifications(getNotifications());
    setUnread(getUnreadCount());
  };

  useEffect(() => {
    const onNew = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'fintrack-notifications') refresh();
    };
    window.addEventListener('fintrack-notification', onNew);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('fintrack-notification', onNew);
      window.removeEventListener('storage', onStorage);
    };
   
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkAllRead = () => {
    markAllRead();
    refresh();
  };

  const handleClearAll = () => {
    clearAll();
    refresh();
  };

  const handleRowClick = (n: AppNotification) => {
    markRead(n.id);
    refresh();
    if (n.deepLink) router.push(n.deepLink);
    else setOpen(false);
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: open ? 'var(--bg-alt)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border)' : 'transparent'),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, border-color 0.15s',
          flexShrink: 0,
        }}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <Bell size={18} color="var(--text-secondary)" strokeWidth={1.8} />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: 'var(--color-exp)',
            color: 'white',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            border: '1.5px solid var(--bg-card)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 44,
          right: 0,
          width: 'min(380px, calc(100vw - 32px))',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-elevated)',
          zIndex: 200,
          overflow: 'hidden',
          animation: 'notifSlideIn 150ms ease forwards',
        }}>
          <style>{`
            @keyframes notifSlideIn {
              from { opacity: 0; transform: translateY(-8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              {unread > 0 && (
                <button type="button" onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-body)', fontWeight: 600, padding: 0 }}>
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button type="button" onClick={handleClearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', padding: 0 }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <Bell size={28} color="var(--text-muted)" strokeWidth={1.4} style={{ marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleRowClick(n)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 16px',
                    background: n.readAt ? 'var(--bg-card)' : 'var(--bg-alt)',
                    border: 'none',
                    borderBottom: i < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.readAt ? 'var(--bg-card)' : 'var(--bg-alt)')}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                    {TYPE_ICON[n.type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 13,
                      fontWeight: n.readAt ? 400 : 600,
                      color: 'var(--text-primary)',
                      margin: '0 0 2px',
                      fontFamily: 'var(--font-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {n.title}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
                      {n.body}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>
                  {!n.readAt && (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 5 }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

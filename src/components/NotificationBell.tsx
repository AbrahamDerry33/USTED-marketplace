import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, PackageCheck, Truck, XCircle, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeUserNotifications,
} from '../services/notificationsService';
import type { AppNotification, NotificationEventType } from '../types/marketplace';

const EVENT_META: Record<
  NotificationEventType,
  { label: string; icon: typeof CreditCard; toneClass: string }
> = {
  paid: {
    label: 'Payment confirmed',
    icon: CreditCard,
    toneClass: 'text-emerald-900',
  },
  shipped: {
    label: 'Order shipped',
    icon: Truck,
    toneClass: 'text-sky-900',
  },
  completed: {
    label: 'Order completed',
    icon: PackageCheck,
    toneClass: 'text-emerald-900',
  },
  cancelled: {
    label: 'Order cancelled',
    icon: XCircle,
    toneClass: 'text-red-800',
  },
};

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Just now';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const { user, isVerified } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!user || !isVerified) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const unsubscribe = subscribeUserNotifications(
      user.uid,
      (items) => {
        setNotifications(items);
        setLoading(false);
      },
      () => {
        setError('Unable to load notifications.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isVerified]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  if (!user || !isVerified) {
    return null;
  }

  const handleMarkRead = async (item: AppNotification, navigateToListing: boolean) => {
    if (!item.read) {
      setBusyId(item.id);
      setError('');
      try {
        await markNotificationAsRead(item.id);
      } catch {
        setError('Could not mark notification as read.');
      } finally {
        setBusyId(null);
      }
    }

    if (navigateToListing && item.listingId) {
      setOpen(false);
      navigate(`/listings/${item.listingId}`);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    setError('');
    try {
      await markAllNotificationsAsRead(notifications);
    } catch {
      setError('Could not mark all notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications, no unread alerts'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-700 hover:bg-stone-200/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-900 text-white text-[10px] font-semibold leading-[18px] text-center tabular-nums"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Order notifications"
          className="fixed inset-x-3 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white border border-stone-200 rounded-xl shadow-lg z-40 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
              <span className="text-xs text-zinc-500 tabular-nums">
                {unreadCount} unread
              </span>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                disabled={markingAll}
                onClick={() => void handleMarkAllRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {markingAll ? 'Updating...' : 'Mark all read'}
              </button>
            )}
          </div>

          {error && (
            <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200" role="alert">
              {error}
            </p>
          )}

          <div className="max-h-[65vh] overflow-y-auto divide-y divide-stone-100">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((n) => (
                  <div key={n} className="space-y-1.5 animate-pulse">
                    <div className="h-3 w-1/3 bg-stone-200 rounded" />
                    <div className="h-4 w-3/4 bg-stone-200 rounded" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-1.5">
                <p className="text-sm font-medium text-zinc-900">No order alerts yet</p>
                <p className="text-xs text-zinc-500">
                  Alerts appear here when an order is paid, shipped, completed, or cancelled.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const meta = EVENT_META[item.eventType] || EVENT_META.paid;
                const Icon = meta.icon;
                return (
                  <div
                    key={item.id}
                    className={`px-4 py-3 transition-colors ${
                      item.read ? 'bg-white' : 'bg-emerald-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(item, true)}
                        className="flex-1 text-left space-y-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.toneClass}`} aria-hidden="true" />
                          <span className={`font-medium ${meta.toneClass}`}>{meta.label}</span>
                          <span aria-hidden="true" className="text-zinc-400">·</span>
                          <span className="text-zinc-500">{formatTimeAgo(item.createdAt)}</span>
                          {!item.read && (
                            <span className="text-[11px] font-medium text-emerald-900">· Unread</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-zinc-900 leading-snug">
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          {item.body}
                        </p>
                      </button>

                      {!item.read && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleMarkRead(item, false)}
                          aria-label={`Mark "${item.title}" as read`}
                          title="Mark as read"
                          className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-900 hover:bg-emerald-100/70 disabled:opacity-50 transition-colors"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

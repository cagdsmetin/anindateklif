import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '@/src/lib/api';

// Okunmamış bildirim sayısı için tek bir ortak kaynak: sekmeler aynı anda
// birden fazla TopHeader bağlasa da tek bir zamanlayıcı çalışır.
let unread = 0;
const subs = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

export function setUnread(n: number) {
  unread = Math.max(0, n);
  subs.forEach((f) => f(unread));
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    const nav = navigator as any;
    try {
      if (unread > 0) nav.setAppBadge?.(unread);
      else nav.clearAppBadge?.();
    } catch { /* desteklenmiyor */ }
  }
}

export async function refreshUnread() {
  try {
    const r = await api.unreadNotifications();
    setUnread(r.unread);
  } catch { /* oturum yok / ağ hatası */ }
}

function onVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') refreshUnread();
}

function start() {
  if (timer) return;
  refreshUnread();
  timer = setInterval(refreshUnread, 60_000);
  appStateSub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshUnread(); });
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
  if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
}

export function useUnreadCount(enabled = true): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    if (!enabled) return;
    subs.add(setN);
    start();
    return () => {
      subs.delete(setN);
      if (!subs.size) stop();
    };
  }, [enabled]);
  return n;
}

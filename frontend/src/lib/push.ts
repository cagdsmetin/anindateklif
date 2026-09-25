import { Platform } from 'react-native';
import { api } from '@/src/lib/api';
import { registerNativePush } from '@/src/lib/nativePush';

// Tarayıcı (Web Push / VAPID) ve telefon (Expo push) bildirim kaydı.
// iOS Safari'de web push sadece "Ana Ekrana Ekle" ile kurulan uygulamada
// çalışır (iOS 16.4+); o durumda kullanıcıya bunu anlatan durum döner.
export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'ios-install';

const isIOSWeb = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true);

export function webPushState(): PushState {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIOSWeb() && !isStandalone() ? 'ios-install' : 'unsupported';
  return Notification.permission as PushState;
}

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeWeb(): Promise<boolean> {
  const { vapidPublicKey } = await api.pushConfig();
  if (!vapidPublicKey) return false;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) as BufferSource });
  }
  await api.pushRegister({ kind: 'web', subscription: sub.toJSON(), platform: isIOSWeb() ? 'ios-web' : 'web' });
  return true;
}

/** Kullanıcı dokunuşuyla çağrılmalı (tarayıcı izin penceresi için). */
export async function enablePush(): Promise<PushState> {
  if (Platform.OS !== 'web') return registerNativePush(true);
  const st = webPushState();
  if (st === 'unsupported' || st === 'ios-install' || st === 'denied') return st;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as PushState;
  try { await subscribeWeb(); } catch { return 'unsupported'; }
  return 'granted';
}

/** Açılışta: izin zaten verilmişse aboneliği sunucuyla eşitle (sessiz). */
export async function syncPush(): Promise<void> {
  try {
    if (Platform.OS !== 'web') { await registerNativePush(false); return; }
    if (webPushState() === 'granted') await subscribeWeb();
  } catch { /* sessiz */ }
}

export async function currentPushState(): Promise<PushState> {
  if (Platform.OS !== 'web') return registerNativePush(false, true);
  return webPushState();
}

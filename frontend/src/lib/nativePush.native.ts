import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import { api } from '@/src/lib/api';
import type { PushState } from '@/src/lib/push';

// Eski mağaza sürümlerinde (expo-notifications olmadan derlenmiş) native
// modül yoktur; OTA ile gelen bu kod o durumda sessizce 'unsupported' döner.
function N(): any | null {
  if (!requireOptionalNativeModule('ExpoPushTokenManager')) return null;
  try { return require('expo-notifications'); } catch { return null; }
}

let handlerSet = false;
let lastHandled = '';

export async function registerNativePush(ask: boolean, checkOnly = false): Promise<PushState> {
  const Notifications = N();
  if (!Notifications) return 'unsupported';
  if (!handlerSet) {
    handlerSet = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bildirimler', importance: Notifications.AndroidImportance.HIGH, lightColor: '#2563EB',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (checkOnly) return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default';
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return status === 'denied' ? 'denied' : 'default';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.pushRegister({ kind: 'expo', token: data, platform: Platform.OS });
  } catch {
    return 'unsupported';
  }
  return 'granted';
}

/** Bildirime dokununca ilgili ekrana git. */
export function useNativeNotificationTaps(onLink: (link: string, id: string) => void) {
  useEffect(() => {
    const Notifications = N();
    if (!Notifications) return;
    const handle = (resp: any) => {
      const req = resp?.notification?.request;
      const d = req?.content?.data || {};
      if (!req?.identifier || req.identifier === lastHandled) return;
      lastHandled = req.identifier;
      if (d.link || d.id) onLink(String(d.link || ''), String(d.id || ''));
    };
    Notifications.getLastNotificationResponseAsync().then((r: any) => r && handle(r)).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [onLink]);
}

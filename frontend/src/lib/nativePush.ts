import type { PushState } from '@/src/lib/push';

// Web derlemesi: telefon push'u yok (bkz. nativePush.native.ts).
export async function registerNativePush(_ask: boolean, _checkOnly = false): Promise<PushState> {
  return 'unsupported';
}
export function useNativeNotificationTaps(_onLink: (link: string, id: string) => void) {}

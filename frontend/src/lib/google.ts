import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api, API_BASE_URL, GoogleConfigT } from '@/src/lib/api';

// Google ile giriş ve Takvim/İşletme bağlama akışı sunucu üzerinden yürür
// (bkz. backend "GOOGLE" bölümü). Web'de sayfa Google'a gider ve
// `returnPath` adresine geri döner; mobilde uygulama içi tarayıcı açılır ve
// uygulamanın kendi şemasıyla (anindateklif://...) geri dönülür.

let configCache: GoogleConfigT | null = null;
let configInflight: Promise<GoogleConfigT> | null = null;

export function loadGoogleConfig(): Promise<GoogleConfigT> {
  if (configCache) return Promise.resolve(configCache);
  if (!configInflight) {
    configInflight = api
      .googleConfig()
      .then((c) => (configCache = c))
      .catch(() => ({ login: false, calendar: false, business: false }))
      .finally(() => { configInflight = null; });
  }
  return configInflight;
}

export function useGoogleConfig(): GoogleConfigT | null {
  const [cfg, setCfg] = useState<GoogleConfigT | null>(configCache);
  useEffect(() => {
    let alive = true;
    loadGoogleConfig().then((c) => { if (alive) setCfg(c); });
    return () => { alive = false; };
  }, []);
  return cfg;
}

export function appReturnUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/${clean}`;
  return Linking.createURL(clean);
}

export type GoogleFlowResult = Record<string, string> | null;

// Web'de sayfa yönlenir ve bu fonksiyon dönmez (null); dönüşü ilgili ekran
// adres çubuğundaki parametrelerden okur. Mobilde dönüş parametreleri döner.
export async function runGoogleFlow(url: string, returnUrl: string): Promise<GoogleFlowResult> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return null;
  }
  const res = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (res.type !== 'success' || !res.url) return null;
  const q = Linking.parse(res.url).queryParams || {};
  const out: Record<string, string> = {};
  Object.entries(q).forEach(([k, v]) => { if (typeof v === 'string') out[k] = v; });
  return out;
}

export function googleLoginUrl(returnUrl: string, campaign?: string): string {
  const q = new URLSearchParams({ redirect: returnUrl });
  if (campaign) q.set('campaign', campaign);
  return `${API_BASE_URL}/auth/google/start?${q.toString()}`;
}

// Android'de dönüş hem openAuthSessionAsync'e hem de (derin bağlantı olarak)
// /google-auth ekranına ulaşabiliyor; tek kullanımlık kod iki kez
// harcanmasın diye aynı kod için aynı istek paylaşılır.
const exchanges = new Map<string, ReturnType<typeof api.googleExchange>>();
export function exchangeGoogleCode(code: string) {
  let p = exchanges.get(code);
  if (!p) {
    p = api.googleExchange(code);
    exchanges.set(code, p);
  }
  return p;
}

export function googleErrorMessage(code: string): string {
  switch (code) {
    case 'cancelled':
    case 'access_denied':
      return 'Google ile giriş iptal edildi.';
    case 'scope':
      return 'Gerekli izinlerin hepsi verilmedi. Lütfen tekrar deneyip tüm kutuları işaretleyin.';
    case 'exchange':
    case 'state':
    case 'redirect':
      return 'Google bağlantısı tamamlanamadı, lütfen tekrar deneyin.';
    default:
      return code;
  }
}

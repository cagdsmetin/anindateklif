import { Platform } from 'react-native';
import { storage } from '@/src/utils/storage';

// Build-time backend URL, with a hardcoded fallback so a missing/empty EXPO_PUBLIC_BACKEND_URL
// in an APK build doesn't leave the app pointing at a relative "/api" URL (which resolves to
// nothing on a native device and produces the classic "Kayıt başarısız" symptom).
const FALLBACK_BACKEND_URL = 'https://app-genesis-52.preview.emergentagent.com';
const RAW_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').trim();
const RESOLVED_BASE = RAW_BASE || FALLBACK_BACKEND_URL;
const API_BASE = RESOLVED_BASE.replace(/\/+$/, '') + '/api';

// Public: expose the resolved base for diagnostic banners / debug screens.
export const RESOLVED_BACKEND_URL = RESOLVED_BASE;
export const BACKEND_URL_MISSING = RAW_BASE.length === 0;

export const SESSION_TOKEN_KEY = 'session_token_v1';

let tokenCache: string | null = null;

export async function setSessionToken(token: string | null) {
  tokenCache = token;
  if (Platform.OS === 'web') {
    if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    else window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } else {
    if (token) await storage.secureSet(SESSION_TOKEN_KEY, token);
    else await storage.secureRemove(SESSION_TOKEN_KEY);
  }
}

export async function getSessionToken(): Promise<string | null> {
  if (tokenCache) return tokenCache;
  if (Platform.OS === 'web') {
    tokenCache = window.localStorage.getItem(SESSION_TOKEN_KEY);
  } else {
    tokenCache = (await storage.secureGet<string>(SESSION_TOKEN_KEY, '')) || null;
    if (tokenCache === '') tokenCache = null;
  }
  return tokenCache;
}

async function req(path: string, opts: RequestInit = {}) {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as any) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    await setSessionToken(null);
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API ${path} ${res.status}: ${t}`);
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; name: string; phone?: string }) =>
    req('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email: string) =>
    req('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    req('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password }) }),
  me: () => req('/auth/me'),
  updateMe: (data: Partial<Pick<UserT, 'name' | 'phone' | 'country' | 'currency' | 'tax_label' | 'onboarding_completed'>>) =>
    req('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  logout: () => req('/auth/logout', { method: 'POST' }),

  // Companies
  listCompanies: () => req('/companies'),
  createCompany: (data: any) => req('/companies', { method: 'POST', body: JSON.stringify(data) }),
  getCompany: (id: string) => req(`/companies/${id}`),
  updateCompany: (id: string, data: any) => req(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCompany: (id: string) => req(`/companies/${id}`, { method: 'DELETE' }),

  // Catalog
  listCatalog: (companyId: string) => req(`/catalog/${companyId}`),
  createCatalogItem: (data: any) => req('/catalog', { method: 'POST', body: JSON.stringify(data) }),
  bulkCreateCatalog: (companyId: string, items: any[]) =>
    req('/catalog/bulk', { method: 'POST', body: JSON.stringify({ companyId, items }) }),
  updateCatalogItem: (id: string, data: any) => req(`/catalog/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCatalogItem: (id: string) => req(`/catalog/${id}`, { method: 'DELETE' }),

  // Customers
  listCustomers: (companyId: string) => req(`/customers/${companyId}`),
  createCustomer: (data: any) => req('/customers', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) => req(`/customers/${id}`, { method: 'DELETE' }),

  // Quotes
  listQuotes: (companyId: string) => req(`/quotes/${companyId}`),
  createQuote: (data: any) => req('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateQuote: (id: string, data: any) => req(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateQuoteStatus: (id: string, durum: string) =>
    req(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ durum }) }),
  deleteQuote: (id: string) => req(`/quotes/${id}`, { method: 'DELETE' }),
};

export type UserT = {
  user_id: string;
  email: string;
  name: string;
  phone: string;
  picture: string;
  country: string;
  currency: string;
  tax_label: string;
  onboarding_completed: boolean;
};

export type BankAccountT = { id: string; banka: string; turu: string; hesapSahibi: string; iban: string };

export type SystemField = { id: string; label: string; type: 'text' | 'select' | 'number' | 'checkbox'; options: string[] };
export type SystemTypeDefT = { id: string; name: string; fields: SystemField[] };

export type CompanyT = {
  id: string;
  userId: string;
  sirketAdi: string;
  imzaMetni: string;
  logoBase64: string;
  adres: string;
  telefon: string;
  telefon2: string;
  email: string;
  website: string;
  vergiDairesi: string;
  vergiNo: string;
  ozelNotlar: string;
  banklar: BankAccountT[];
  hazirlayanEmails: string[];
  sistemTipleri: SystemTypeDefT[];
};

export type CatalogItemT = {
  id: string;
  companyId: string;
  kategori: string;
  urunAdi: string;
  aciklama: string;
  birim: string;
  birimFiyat: number;
  paraBirimi: string;
};

export type CustomerT = {
  id: string;
  companyId: string;
  firma: string;
  yetkili: string;
  telefon: string;
  email: string;
  adres: string;
};

export type QuoteItemT = {
  id: string;
  mode: 'technical' | 'manual' | 'general';
  urunAdi: string;
  sistemTipiId: string;
  sistemTipi: string;
  sistemFields: { label: string; value: string }[];
  customFields: { key: string; value: string }[];
  aciklama: string;
  adet: number;
  birim: string;
  birimFiyat: number;
};

export type QuoteEkT = { id: string; baslik: string; icerik: string };

export type QuoteT = {
  id: string;
  userId: string;
  companyId: string;
  teklifNo: string;
  tarih: string;
  gecerlilik: string;
  hazirlayanEmail: string;
  musFirma: string;
  musYetkili: string;
  musTelefon: string;
  musEmail: string;
  musAdres: string;
  projeAdi: string;
  nakliye: string;
  paraBirimi: string;
  odemeSekli: string;
  mensei: string;
  teslimGun: string;
  iskonto: number;
  kdvOrani: number;
  notlar: string;
  items: QuoteItemT[];
  ekler: QuoteEkT[];
  durum: string;
  araToplam: number;
  iskontoTutar: number;
  kdvTutar: number;
  genelToplam: number;
  createdAt: string;
};

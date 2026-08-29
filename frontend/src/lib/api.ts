import { Platform } from 'react-native';
import { storage } from '@/src/utils/storage';

// Build-time backend URL, with a hardcoded fallback so a missing/empty EXPO_PUBLIC_BACKEND_URL
// in an APK build doesn't leave the app pointing at a relative "/api" URL (which resolves to
// nothing on a native device and produces the classic "Kayıt başarısız" symptom).
//
// The fallback intentionally points at the PRODUCTION host (`*.emergent.host`) — that's the
// public URL served through Cloudflare and reachable from any mobile network. The preview
// URL (`*.preview.emergentagent.com`) is dev-only and can be unreachable from external
// networks, so it must never be baked into a distributed APK.
//
// Preview / development is unaffected because `.env` sets EXPO_PUBLIC_BACKEND_URL to the
// preview host, and this fallback only kicks in when that env var is empty.
const FALLBACK_BACKEND_URL = 'https://anindateklif-production.up.railway.app';
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

/**
 * Structured API error so screens can distinguish network vs HTTP status errors.
 * `.kind` is the primary signal callers should switch on:
 *   - 'network'  : fetch itself threw (no internet, DNS, TLS, CORS, aborted)
 *   - 'timeout'  : request exceeded the client-side timeout
 *   - 'http'     : we got a response but status was not OK (has .status + .body)
 *   - 'parse'    : response OK but JSON was malformed
 */
export class ApiError extends Error {
  kind: 'network' | 'timeout' | 'http' | 'parse';
  status?: number;
  body?: string;
  constructor(message: string, kind: ApiError['kind'], status?: number, body?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

async function req(path: string, opts: RequestInit = {}) {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((opts.headers as any) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s client timeout

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...opts, headers, signal: controller.signal });
  } catch (e: any) {
    // fetch() throws on: no network, DNS failure, SSL error, CORS on web, abort.
    if (e?.name === 'AbortError') {
      throw new ApiError('Zaman aşımı — sunucu yanıt vermedi', 'timeout');
    }
    // Log so a native `adb logcat | grep ReactNativeJS` shows the true cause.
    // eslint-disable-next-line no-console
    console.warn('[api]', 'network error', path, String(e?.message || e));
    throw new ApiError(
      `Ağ hatası: ${e?.message || 'sunucuya ulaşılamadı'}`,
      'network',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401) {
    await setSessionToken(null);
    throw new ApiError('Oturum süreniz doldu', 'http', 401);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.warn('[api]', 'http', res.status, path, body.slice(0, 200));
    throw new ApiError(`API ${path} ${res.status}`, 'http', res.status, body);
  }

  try {
    return await res.json();
  } catch (e: any) {
    throw new ApiError('Geçersiz sunucu yanıtı', 'parse');
  }
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; name: string; phone: string }) =>
    req('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  verifyEmail: (token: string) => req('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerificationEmail: () => req('/auth/resend-verification', { method: 'POST' }),
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
  deleteAccount: () => req('/auth/account', { method: 'DELETE' }),

  // Personel (ekip) yönetimi — sadece firma sahibi görebilir/yönetebilir
  inviteStaff: (companyId: string, data: { email: string; role: string }) =>
    req(`/company/${companyId}/members/invite`, { method: 'POST', body: JSON.stringify(data) }),
  listStaff: (companyId: string): Promise<StaffMemberT[]> => req(`/company/${companyId}/members`),
  removeStaff: (companyId: string, memberUserId: string) =>
    req(`/company/${companyId}/members/${memberUserId}`, { method: 'DELETE' }),
  revokeInvite: (companyId: string, inviteId: string) =>
    req(`/company/${companyId}/invites/${inviteId}`, { method: 'DELETE' }),
  getInviteInfo: (token: string): Promise<StaffInviteInfoT> => req(`/company/invites/${token}`),
  acceptInvite: (token: string, data: { name: string; password: string }) =>
    req(`/company/invites/${token}/accept`, { method: 'POST', body: JSON.stringify(data) }),

  // Hediye/promosyon kodu — üretme/listeleme sadece admin hesabına açık,
  // kullanma (redeem) herhangi bir firma sahibine açık.
  createPromoCodes: (data: { count: number; duration_days: number; note?: string }): Promise<PromoCodeT[]> =>
    req('/admin/promo-codes', { method: 'POST', body: JSON.stringify(data) }),
  listPromoCodes: (): Promise<PromoCodeT[]> => req('/admin/promo-codes'),
  redeemPromoCode: (code: string) => req('/promo/redeem', { method: 'POST', body: JSON.stringify({ code }) }),

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

  // Kasa (Gelir/Gider)
  listKasa: (companyId: string) => req(`/kasa/${companyId}`),
  createKasaEntry: (data: any) => req('/kasa', { method: 'POST', body: JSON.stringify(data) }),
  deleteKasaEntry: (id: string) => req(`/kasa/${id}`, { method: 'DELETE' }),

  // Tahsilat (Alacak/Borç)
  listTahsilat: (companyId: string) => req(`/tahsilat/${companyId}`),
  createTahsilatEntry: (data: any) => req('/tahsilat', { method: 'POST', body: JSON.stringify(data) }),
  deleteTahsilatEntry: (id: string) => req(`/tahsilat/${id}`, { method: 'DELETE' }),

  // Customers
  listCustomers: (companyId: string) => req(`/customers/${companyId}`),
  createCustomer: (data: any) => req('/customers', { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) => req(`/customers/${id}`, { method: 'DELETE' }),

  // Services (Servis & Garanti)
  listServices: (companyId: string) => req(`/services/${companyId}`),
  createService: (data: any) => req('/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: any) => req(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateServiceStatus: (id: string, durum: string) =>
    req(`/services/${id}/status`, { method: 'PATCH', body: JSON.stringify({ durum }) }),
  deleteService: (id: string) => req(`/services/${id}`, { method: 'DELETE' }),

  // Campaigns (Kampanya)
  listCampaigns: (companyId: string) => req(`/campaigns/${companyId}`),
  createCampaign: (data: any) => req('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  markCampaignSent: (id: string, customerId: string) =>
    req(`/campaigns/${id}/mark-sent`, { method: 'PATCH', body: JSON.stringify({ customerId }) }),
  deleteCampaign: (id: string) => req(`/campaigns/${id}`, { method: 'DELETE' }),

  // Quotes
  listQuotes: (companyId: string) => req(`/quotes/${companyId}`),
  createQuote: (data: any) => req('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateQuote: (id: string, data: any) => req(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateQuoteStatus: (id: string, durum: string) =>
    req(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ durum }) }),
  deleteQuote: (id: string) => req(`/quotes/${id}`, { method: 'DELETE' }),
  listTrashedQuotes: (companyId: string) => req(`/quotes/${companyId}/trash`),
  restoreQuote: (id: string) => req(`/quotes/${id}/restore`, { method: 'POST' }),

  // App config (public)
  getAppConfig: () => req('/config'),

  // Subscription / quota
  subscriptionStatus: () => req('/subscription/status'),
  rates: (): Promise<RatesT> => req('/rates'),
  sendPhoneCode: (phone: string) => req('/auth/phone/send-code', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyPhoneCode: (phone: string, code: string) => req('/auth/phone/verify-code', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  // ---- Ekip Sohbeti (personel içi mesajlaşma) ----
  teamDirectory: (companyId: string): Promise<TeamDirectoryMemberT[]> =>
    req(`/team/directory?company_id=${encodeURIComponent(companyId)}`),
  teamConversations: (companyId: string, scope: 'mine' | 'all' = 'mine'): Promise<TeamConversationT[]> =>
    req(`/team/conversations?company_id=${encodeURIComponent(companyId)}&scope=${scope}`),
  teamThread: (companyId: string, withUserId: string): Promise<TeamMessageT[]> =>
    req(`/team/messages?company_id=${encodeURIComponent(companyId)}&with=${encodeURIComponent(withUserId)}`),
  teamThreadAdmin: (companyId: string, a: string, b: string): Promise<TeamMessageT[]> =>
    req(`/team/messages/admin?company_id=${encodeURIComponent(companyId)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  sendTeamMessage: (companyId: string, recipientId: string, text: string): Promise<TeamMessageT> =>
    req('/team/messages', { method: 'POST', body: JSON.stringify({ companyId, recipientId, text }) }),
  subscriptionCheckout: (data: { plan: string; buyer_identity_number: string; billing_address: string; billing_city: string; billing_zip?: string }) =>
    req('/subscription/checkout', { method: 'POST', body: JSON.stringify(data) }),

  // AI Assistant
  assistantChat: (data: { message: string; quote_context?: any }): Promise<AssistantChatResponseT> =>
    req('/assistant/chat', { method: 'POST', body: JSON.stringify(data) }),
};

export type UserT = {
  user_id: string;
  email: string;
  email_verified?: boolean;
  name: string;
  phone: string;
  phone_verified?: boolean;
  picture: string;
  country: string;
  currency: string;
  tax_label: string;
  onboarding_completed: boolean;
  is_staff?: boolean;
  staff_role?: string | null;
  staff_company_id?: string | null;
};

export type StaffMemberT = {
  type: 'active' | 'pending';
  id: string;
  email: string;
  role: string;
  name?: string;
  createdAt?: string;
};

export type StaffInviteInfoT = {
  valid: boolean;
  reason?: string | null;
  company_name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type BankAccountT = { id: string; banka: string; turu: string; hesapSahibi: string; iban: string };

export type TeamDirectoryMemberT = { userId: string; name: string; email: string; role: string };

export type TeamMessageT = {
  id: string;
  companyId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  text: string;
  createdAt: string;
  readAt?: string | null;
};

export type TeamConversationT = {
  otherUserId?: string | null;
  otherUserName?: string | null;
  lastText: string;
  lastAt: string;
  unreadCount: number;
  participantAId?: string | null;
  participantAName?: string | null;
  participantBId?: string | null;
  participantBName?: string | null;
};

export type PromoCodeT = {
  code: string;
  duration_days: number;
  note?: string | null;
  created_at: string;
  used: boolean;
  used_by_email?: string | null;
  used_at?: string | null;
};

export type AssistantSystemFieldT = { label: string; type: 'text' | 'number' | 'select' | 'checkbox'; options: string[] };
export type AssistantActionT = { action: 'add_system_type'; name: string; fields: AssistantSystemFieldT[] };
export type AssistantChatResponseT = { reply: string; action?: AssistantActionT | null };

export type RatesT = {
  usd_try?: number | null;
  eur_try?: number | null;
  btc_try?: number | null;
  btc_usd?: number | null;
  eth_try?: number | null;
  eth_usd?: number | null;
  bist100?: number | null;
  bist50?: number | null;
  bist30?: number | null;
  updatedAt?: string;
  stale?: boolean;
};

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

export type KasaEntryT = {
  id: string;
  companyId: string;
  tur: 'gelir' | 'gider';
  kategori: string;
  tutar: number;
  paraBirimi: string;
  yontem: string;
  notlar: string;
  tarih: string;
};

export type TahsilatEntryT = {
  id: string;
  companyId: string;
  customerId: string;
  musteriAdi: string;
  musteriTelefon: string;
  tur: 'borc' | 'tahsilat';
  tutar: number;
  paraBirimi: string;
  yontem: string;
  vadeTarihi: string;
  notlar: string;
  tarih: string;
  quoteId?: string; // dolu ise: teklif "Onaylandı" durumuna geçtiğinde otomatik oluşturuldu
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

export type ServiceT = {
  id: string;
  userId: string;
  companyId: string;
  musFirma: string;
  musYetkili: string;
  musTelefon: string;
  baslik: string;
  aciklama: string;
  servisTarihi: string;
  garantiBitis: string;
  bakimTarihi: string;
  durum: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignSendT = { sent: boolean; sentAt: string | null };

export type CampaignT = {
  id: string;
  userId: string;
  companyId: string;
  baslik: string;
  mesaj: string;
  sends: Record<string, CampaignSendT>;
  createdAt: string;
  updatedAt: string;
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
  deletedAt?: string | null;
  araToplam: number;
  iskontoTutar: number;
  kdvTutar: number;
  genelToplam: number;
  createdAt: string;
};

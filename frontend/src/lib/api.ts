import { Platform } from 'react-native';
import { storage } from '@/src/utils/storage';
import type { CizimModeli } from '@/src/components/albert/Cizim';

export type { CizimModeli };

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

// Admin "Müşteri olarak gir" (impersonation) akışında, admin kendi oturum
// token'ını kaybetmesin diye buraya geçici olarak saklanır -- müşteri
// hesabından "Kendi hesabına dön" dendiğinde buradan geri okunup asıl
// session olarak geri yüklenir.
export const ADMIN_RETURN_TOKEN_KEY = 'admin_return_token_v1';

export async function setAdminReturnToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) window.localStorage.setItem(ADMIN_RETURN_TOKEN_KEY, token);
    else window.localStorage.removeItem(ADMIN_RETURN_TOKEN_KEY);
  } else {
    if (token) await storage.secureSet(ADMIN_RETURN_TOKEN_KEY, token);
    else await storage.secureRemove(ADMIN_RETURN_TOKEN_KEY);
  }
}

export async function getAdminReturnToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(ADMIN_RETURN_TOKEN_KEY);
  }
  const v = (await storage.secureGet<string>(ADMIN_RETURN_TOKEN_KEY, '')) || null;
  return v === '' ? null : v;
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

async function req(path: string, opts: RequestInit = {}, timeoutMs: number = 20000) {
  const token = await getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((opts.headers as any) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    // FastAPI hataları çoğunlukla anlamlı bir Türkçe { detail: "..." } döner
    // (örn. teklif sahiplik kısıtı) -- bunu yakalayıp mesaj olarak kullanınca
    // kullanıcıya jenerik "API ... 403" yerine gerçek sebep gösterilir.
    let detail = '';
    try { const j = JSON.parse(body); if (typeof j?.detail === 'string') detail = j.detail; } catch {}
    throw new ApiError(detail || `API ${path} ${res.status}`, 'http', res.status, body);
  }

  try {
    return await res.json();
  } catch (e: any) {
    throw new ApiError('Geçersiz sunucu yanıtı', 'parse');
  }
}

// Teklifin, PDF ile aynı marka görünümüne (renkli/kalın başlıklar) sahip
// gerçek stilli .xlsx dosyasını sunucudan indirir -- istemcideki ücretsiz
// 'xlsx' kütüphanesi hücre rengi/kalın yazı YAZAMADIĞI için bu dosya artık
// backend'de (openpyxl ile) üretiliyor, burada sadece ham baytlar alınıyor.
export async function fetchQuoteExcelBytes(quoteId: string): Promise<ArrayBuffer> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/quotes/${quoteId}/export-excel`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`Excel indirilemedi (${res.status})`, 'http', res.status, body);
  }
  return await res.arrayBuffer();
}

export const api = {
  // Auth
  register: (data: { email: string; password: string; name: string; phone: string; language?: string }) =>
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
  // Giriş yapılmadan önceki ekranlar (splash/login/register) için: IP'nin
  // ülkesine göre önerilen dil -- kullanıcı daha önce hiç seçim yapmadıysa
  // kullanılır (bkz. i18n.tsx LanguageProvider).
  geoLang: (): Promise<{ lang: 'tr' | 'en' | 'it'; country: string | null }> => req('/geo-lang'),
  updateMe: (data: Partial<Pick<UserT, 'name' | 'phone' | 'country' | 'currency' | 'tax_label' | 'language' | 'onboarding_completed'>>) =>
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

  // Müşteri olarak gir (admin impersonation) — sadece ADMIN_EMAILS'teki
  // hesaba açık. Şifre görülmeden/sorulmadan, kısa süreli ve audit'li erişim.
  listAdminCustomers: (): Promise<AdminCustomerT[]> => req('/admin/customers'),
  // Admin hesap silme: once geri alinabilir (yumusak) silme, 30 gun sonra
  // veriler kalici olarak temizlenir (bkz. backend _purge_expired_accounts).
  listDeletedAccounts: (): Promise<DeletedAccountT[]> => req('/admin/customers/deleted'),
  adminDeleteCustomer: (userId: string): Promise<{ ok: boolean; purge_days: number }> =>
    req(`/admin/customers/${userId}`, { method: 'DELETE' }),
  adminRestoreCustomer: (userId: string): Promise<{ ok: boolean }> =>
    req(`/admin/customers/${userId}/restore`, { method: 'POST' }),
  impersonateCustomer: (userId: string): Promise<{ access_token: string; user: UserT; company_name: string }> =>
    req(`/admin/impersonate/${userId}`, { method: 'POST' }),
  endImpersonation: () => req('/admin/impersonate/end', { method: 'POST' }),
  // Albert Genau modülünün hangi firmalarda görüneceğini SADECE admin
  // belirler -- firma sahibi kendi kendine açamaz.
  adminSetAlbertGenauEnabled: (companyId: string, enabled: boolean): Promise<{ ok: boolean; albertGenauEnabled: boolean }> =>
    req(`/admin/companies/${companyId}/albert-genau-enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),

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

  // Firma Kataloğu (hazır PDF/görsel dosyalar)
  listCatalogFiles: (companyId: string) => req(`/company/${companyId}/catalog-files`),
  uploadCatalogFile: (companyId: string, name: string, dataBase64: string) =>
    req('/company/catalog-files', { method: 'POST', body: JSON.stringify({ companyId, name, dataBase64 }) }),
  downloadCatalogFile: (fileId: string) => req(`/company/catalog-files/${fileId}/download`),
  deleteCatalogFile: (fileId: string) => req(`/company/catalog-files/${fileId}`, { method: 'DELETE' }),
  shareCatalogFileEmail: (fileId: string, toEmail: string, message?: string) =>
    req(`/company/catalog-files/${fileId}/share-email`, { method: 'POST', body: JSON.stringify({ toEmail, message: message || '' }) }),

  // Firma Arama Takibi (lead)
  listLeads: (companyId: string) => req(`/leads/${companyId}`),
  listLeadsToday: (companyId: string) => req(`/leads/${companyId}/today`),
  createLead: (companyId: string, data: { firma: string; bolge?: string; kategori?: string; telefon?: string; website?: string; email?: string; firsatTutari?: number }) =>
    req('/leads', { method: 'POST', body: JSON.stringify({ companyId, ...data }) }),
  updateLead: (id: string, data: { durum?: string; notlar?: string; tekrarTarihi?: string; website?: string; email?: string; atananKullaniciId?: string; atananNot?: string; firsatTutari?: number; siraNo?: number }) =>
    req(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reorderLeads: (items: { id: string; durum: string; siraNo: number }[]) =>
    req('/leads/reorder', { method: 'PATCH', body: JSON.stringify({ items }) }),
  deleteLead: (id: string) => req(`/leads/${id}`, { method: 'DELETE' }),
  // Reklam İstihbaratı (rakip reklam takibi / ad-spy)
  listAdRecords: (companyId: string): Promise<AdRecordT[]> => req(`/ads-intel/records/${companyId}`),
  createAdRecord: (data: { companyId: string; reklamveren: string; baslik?: string; mecra?: string; gorselUrl?: string; ilkGorulmeTarihi?: string; sonGorulmeTarihi?: string; durum?: string; notlar?: string }): Promise<AdRecordT> =>
    req('/ads-intel/records', { method: 'POST', body: JSON.stringify(data) }),
  importAdRecords: (companyId: string, items: any[]): Promise<{ created: number }> =>
    req('/ads-intel/records/import', { method: 'POST', body: JSON.stringify({ companyId, items }) }),
  updateAdRecord: (id: string, data: Partial<{ reklamveren: string; baslik: string; mecra: string; gorselUrl: string; ilkGorulmeTarihi: string; sonGorulmeTarihi: string; durum: string; favori: boolean; notlar: string }>): Promise<AdRecordT> =>
    req(`/ads-intel/records/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAdRecord: (id: string) => req(`/ads-intel/records/${id}`, { method: 'DELETE' }),
  listAdWatchlist: (companyId: string): Promise<AdWatchItemT[]> => req(`/ads-intel/watchlist/${companyId}`),
  createAdWatchlistItem: (companyId: string, terim: string): Promise<AdWatchItemT> =>
    req('/ads-intel/watchlist', { method: 'POST', body: JSON.stringify({ companyId, terim }) }),
  deleteAdWatchlistItem: (id: string) => req(`/ads-intel/watchlist/${id}`, { method: 'DELETE' }),
  // e-Fatura (Nilvera)
  getEFaturaConfig: (companyId: string): Promise<EFaturaConfigT> => req(`/efatura/config/${companyId}`),
  updateEFaturaConfig: (data: { companyId: string; apiKey?: string; ortam?: 'test' | 'canli'; firmaVergiNo?: string; firmaUnvani?: string; firmaAdres?: string; faturaSerisi?: string; sablonId?: string }): Promise<EFaturaConfigT> =>
    req('/efatura/config', { method: 'PUT', body: JSON.stringify(data) }),
  testEFaturaConnection: (companyId: string): Promise<{ ok: boolean; message: string }> =>
    req(`/efatura/test/${companyId}`, { method: 'POST' }),
  setLeadDailyCount: (companyId: string, dailyCount: number) =>
    req(`/company/${companyId}/lead-daily-count`, { method: 'PATCH', body: JSON.stringify({ dailyCount }) }),
  createLeadSearchRequest: (companyId: string, sektor: string, bolge: string, aciklama: string) =>
    req('/leads/search-request', { method: 'POST', body: JSON.stringify({ companyId, sektor, bolge, aciklama }) }),
  // Yeni Talep gönderilince admin'e düşmüyor -- yapay zeka web'den gerçek
  // firma arayıp doğrudan listeye ekliyor. Arama (web_search + reasoning)
  // uzun sürebildiği için standart 20sn yerine 75sn timeout kullanıyoruz.
  aiFindLeads: (companyId: string, sektor: string, bolge: string, aciklama: string) =>
    req('/leads/ai-find', { method: 'POST', body: JSON.stringify({ companyId, sektor, bolge, aciklama }) }, 75000),
  listLeadSearchRequests: (companyId: string) => req(`/leads/search-requests/${companyId}`),
  adminListLeadSearchRequests: () => req('/admin/leads/search-requests'),
  adminUpdateLeadSearchRequest: (id: string, durum: string) =>
    req(`/admin/leads/search-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ durum }) }),
  adminBulkAddLeads: (companyId: string, items: { firma: string; bolge: string; kategori: string; telefon: string }[]) =>
    req('/admin/leads/bulk-add', { method: 'POST', body: JSON.stringify({ companyId, items }) }),

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
  updateCustomer: (id: string, data: any) => req(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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

  // Manuel Hatırlatıcılar (Takvim -- serbest not/hatırlatıcı)
  listReminders: (companyId: string) => req(`/reminders/${companyId}`),
  createReminder: (data: any) => req('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  updateReminder: (id: string, data: any) => req(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteReminder: (id: string) => req(`/reminders/${id}`, { method: 'DELETE' }),

  // Quotes
  listQuotes: (companyId: string) => req(`/quotes/${companyId}`),
  createQuote: (data: any) => req('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateQuote: (id: string, data: any) => req(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateQuoteStatus: (id: string, durum: string) =>
    req(`/quotes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ durum }) }),
  updateQuoteMaliyet: (id: string, maliyet: number | null) =>
    req(`/quotes/${id}/maliyet`, { method: 'PATCH', body: JSON.stringify({ maliyet }) }),
  updateQuoteItemMaliyet: (id: string, itemId: string, maliyet: number | null) =>
    req(`/quotes/${id}/item-maliyet`, { method: 'PATCH', body: JSON.stringify({ itemId, maliyet }) }),
  updateQuoteEkstraMaliyet: (id: string, ekstraMaliyetler: QuoteEkstraMaliyetT[]) =>
    req(`/quotes/${id}/ekstra-maliyet`, { method: 'PATCH', body: JSON.stringify({ ekstraMaliyetler }) }),
  deleteQuote: (id: string) => req(`/quotes/${id}`, { method: 'DELETE' }),
  listTrashedQuotes: (companyId: string) => req(`/quotes/${companyId}/trash`),
  restoreQuote: (id: string) => req(`/quotes/${id}/restore`, { method: 'POST' }),
  // Teklif sahiplik/onay sistemi: bir başkasının oluşturduğu teklifi
  // düzenlemek için önce ondan onay istenir.
  listQuoteEditRequests: (): Promise<QuoteEditRequestT[]> => req('/quotes/edit-requests/list'),
  requestQuoteEdit: (quoteId: string): Promise<QuoteEditRequestT> =>
    req(`/quotes/${quoteId}/edit-requests`, { method: 'POST' }),
  respondQuoteEditRequest: (requestId: string, approve: boolean): Promise<QuoteEditRequestT> =>
    req(`/quotes/edit-requests/${requestId}/respond`, { method: 'POST', body: JSON.stringify({ approve }) }),

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
  deleteTeamThread: (companyId: string, withUserId: string) =>
    req(`/team/messages?company_id=${encodeURIComponent(companyId)}&with=${encodeURIComponent(withUserId)}`, { method: 'DELETE' }),
  subscriptionCheckout: (data: { plan: string; buyer_identity_number: string; billing_address: string; billing_city: string; billing_zip?: string }) =>
    req('/subscription/checkout', { method: 'POST', body: JSON.stringify(data) }),

  // AI Assistant
  assistantChat: (data: { message: string; quote_context?: any }): Promise<AssistantChatResponseT> =>
    req('/assistant/chat', { method: 'POST', body: JSON.stringify(data) }),

  // Albert Genau (parametrik pergola/bioklimatik hesaplayıcı) — ayrı katalog
  // türü: dealer genişlik/derinlik/yükseklik girer, Excel'den çıkarılmış
  // formüllerle tam malzeme listesi + fiyat otomatik hesaplanır.
  albertGenauTypes: (companyId?: string): Promise<AlbertGenauTypesResponseT> =>
    req(`/albert-genau/types${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauCalculate: (data: AlbertGenauCalculateInputT): Promise<AlbertGenauResultT> =>
    req('/albert-genau/calculate', { method: 'POST', body: JSON.stringify(data) }),
  // Çizim modeli -- FİYAT HESAPLAMAZ. Kullanıcı ölçü yazarken debounce ile
  // çağrılır; dönen model hem ekrandaki canlı çizimi hem teklife eklenen
  // teknik çizimi besler (bkz. backend/ag_geometry.py). Pahalı olan
  // albertGenauCalculate'ten kasıtlı olarak ayrıdır.
  albertGenauGeometry: (data: AlbertGenauGeometryInputT): Promise<CizimModeli> =>
    req('/albert-genau/geometry', { method: 'POST', body: JSON.stringify(data) }),
  albertGenauPartsListItems: (systemId: string, companyId?: string): Promise<AlbertGenauPartsListItemsResponseT> =>
    req(`/albert-genau/parts-list-items?systemId=${encodeURIComponent(systemId)}${companyId ? `&companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauPartsListCalculate: (data: AlbertGenauPartsListCalculateInputT): Promise<AlbertGenauPartsListResultT> =>
    req('/albert-genau/parts-list/calculate', { method: 'POST', body: JSON.stringify(data) }),
  albertGenauAirflexModuleCalculate: (data: AlbertGenauAirflexModuleInputT): Promise<AlbertGenauAirflexModuleResultT> =>
    req('/albert-genau/airflex-module/calculate', { method: 'POST', body: JSON.stringify(data) }),
  // VERTIFLEX (dikey giyotin cam balkon, 6 alt tip) -- genişlik/yükseklik
  // girdili geometrik aile, tip-bazlı panel sayısı/motor/kumanda/inox/vs.
  // seçenekleri için bkz. AlbertGenauVertiflexTypesResponseT.
  albertGenauVertiflexTypes: (companyId?: string): Promise<AlbertGenauVertiflexTypesResponseT> =>
    req(`/albert-genau/vertiflex/types${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauVertiflexCalculate: (data: AlbertGenauVertiflexCalculateInputT): Promise<AlbertGenauVertiflexResultT> =>
    req('/albert-genau/vertiflex/calculate', { method: 'POST', body: JSON.stringify(data) }),
  // KIŞ BAHÇESİ (sabit cam tavanlı, 2 alt tip: PREMIUM 08-10 / PREMIUM TWIN)
  // -- genişlik/derinlik/tavan bölüm sayısı/arka duvar yüksekliği girdili
  // geometrik aile, bkz. AlbertGenauKisBahcesiTypesResponseT.
  albertGenauKisBahcesiTypes: (companyId?: string): Promise<AlbertGenauKisBahcesiTypesResponseT> =>
    req(`/albert-genau/kis-bahcesi/types${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauKisBahcesiCalculate: (data: AlbertGenauKisBahcesiCalculateInputT): Promise<AlbertGenauKisBahcesiResultT> =>
    req('/albert-genau/kis-bahcesi/calculate', { method: 'POST', body: JSON.stringify(data) }),
  // BC ailesi (TIARA/TIARA FLAT/INT/ZERO/SLIM, SLIDER NEXT/SLIDE MASTER,
  // ATRIUM/MOMENTUM/CENTRUM HD, TANGO/OPTIMA — 39 kaydırmalı sistem
  // varyantı). Diğer ailelerden farklı olarak kanat/bayrak/cam alanları
  // TİPE GÖRE DEĞİŞİR — bkz. AlbertGenauBcTypeMetaT.
  albertGenauBcTypes: (companyId?: string): Promise<AlbertGenauBcTypesResponseT> =>
    req(`/albert-genau/bc/types${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauBcCalculate: (data: AlbertGenauBcCalculateInputT): Promise<AlbertGenauBcResultT> =>
    req('/albert-genau/bc/calculate', { method: 'POST', body: JSON.stringify(data) }),
  // YEDEK PARÇA -- dağıtık parça-değişim kataloğu (243 kalem). Sabit bir
  // "sistem" yok; bayı kataloğun herhangi bir alt kümesini seçip miktar
  // girer (bkz. AlbertGenauYedekParcaItemT).
  albertGenauYedekParcaItems: (companyId?: string): Promise<AlbertGenauYedekParcaItemsResponseT> =>
    req(`/albert-genau/yedek-parca/items${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`),
  albertGenauYedekParcaCalculate: (data: AlbertGenauYedekParcaCalculateInputT): Promise<AlbertGenauYedekParcaResultT> =>
    req('/albert-genau/yedek-parca/calculate', { method: 'POST', body: JSON.stringify(data) }),
  listAlbertGenauItems: (companyId: string): Promise<AlbertGenauItemT[]> =>
    req(`/albert-genau/items?companyId=${encodeURIComponent(companyId)}`),
  createAlbertGenauItem: (data: any): Promise<AlbertGenauItemT> =>
    req('/albert-genau/items', { method: 'POST', body: JSON.stringify(data) }),
  updateAlbertGenauItem: (id: string, data: any): Promise<AlbertGenauItemT> =>
    req(`/albert-genau/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlbertGenauItem: (id: string) => req(`/albert-genau/items/${id}`, { method: 'DELETE' }),
  // Fiyat listesi güncelleme — sadece platform admini (ortak/varsayılan listeyi yönetir)
  albertGenauPriceListStatus: (): Promise<AlbertGenauPriceListStatusT> => req('/albert-genau/price-list/status'),
  uploadAlbertGenauPriceList: (fileBase64: string): Promise<{ ok: boolean; skuCount: number }> =>
    req('/albert-genau/price-list/upload', { method: 'POST', body: JSON.stringify({ fileBase64 }) }, 40000),
  // Yedek Parça kataloğu — ana fiyat listesinden AYRI, kendi admin
  // status/upload çifti (bkz. server.py modül-üstü notu).
  albertGenauYedekParcaAdminStatus: (): Promise<AlbertGenauYedekParcaAdminStatusT> =>
    req('/albert-genau/yedek-parca/admin-status'),
  uploadAlbertGenauYedekParcaCatalog: (fileBase64: string): Promise<{ ok: boolean; itemCount: number }> =>
    req('/albert-genau/yedek-parca/admin-upload', { method: 'POST', body: JSON.stringify({ fileBase64 }) }, 40000),
  // Firma-bazlı (bayi) fiyat listesi — firma sahibi kendi Excel'ini kendi
  // hesabından yükler/görür, admin gerekmez (bkz. server.py company-price-list).
  albertGenauCompanyPriceListStatus: (companyId: string): Promise<AlbertGenauPriceListStatusT> =>
    req(`/albert-genau/company-price-list/status?companyId=${encodeURIComponent(companyId)}`),
  uploadAlbertGenauCompanyPriceList: (companyId: string, fileBase64: string): Promise<{ ok: boolean; skuCount: number }> =>
    req('/albert-genau/company-price-list/upload', { method: 'POST', body: JSON.stringify({ companyId, fileBase64 }) }, 40000),
  // Bayi (dealer) paketi — yeni bir Albert Genau bayisine kendi kurulumuna
  // yüklemesi için verilecek taşınabilir fiyat/tablo paketi.
  albertGenauExportPackage: (): Promise<any> => req('/albert-genau/export-package'),
};

// Albert Genau hesap sonucunu Excel olarak indirme -- POST gövdesiyle
// hesaplama girdisini gönderip ham .xlsx baytlarını alır (bkz. fetchQuoteExcelBytes).
export async function fetchAlbertGenauExcelBytes(data: AlbertGenauCalculateInputT): Promise<ArrayBuffer> {
  const token = await getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/albert-genau/calculate/export-excel`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`Excel indirilemedi (${res.status})`, 'http', res.status, body);
  }
  return await res.arrayBuffer();
}

// Albert Genau hesap sonucuna göre otomatik üretilen teknik çizim (modül/kanat
// şeması) -- ham PNG baytlarını döner, fetchAlbertGenauExcelBytes ile birebir
// aynı desen.
export async function fetchAlbertGenauDrawingBytes(data: AlbertGenauCalculateInputT): Promise<ArrayBuffer> {
  const token = await getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/albert-genau/calculate/export-drawing`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`Teknik çizim indirilemedi (${res.status})`, 'http', res.status, body);
  }
  return await res.arrayBuffer();
}

// CSV export -- diğer .csv/.xlsx indirme uçları gibi (bkz. fetchQuoteExcelBytes)
// ham metin/bayt döndüğü için standart `req()` JSON sarmalayıcısını kullanmaz.
export async function fetchAlbertGenauPriceCsv(): Promise<string> {
  const token = await getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/albert-genau/export-package.csv`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`CSV indirilemedi (${res.status})`, 'http', res.status, body);
  }
  return await res.text();
}

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
  language?: 'tr' | 'en' | 'it';
  theme?: 'light' | 'dark';
  onboarding_completed: boolean;
  is_staff?: boolean;
  staff_role?: string | null;
  staff_company_id?: string | null;
  is_impersonated?: boolean;
  impersonated_by?: string | null;
};

export type AdminCustomerT = {
  user_id: string;
  email: string;
  name: string;
  phone: string;
  company_name: string;
  company_id?: string | null;
  albert_genau_enabled?: boolean;
  // Firma sahibinin kendi beyanı ("Albert Genau bayisiyim") -- sadece admin'e
  // bilgi verir, erişimi tek başına açmaz (bkz. albert_genau_enabled).
  albert_genau_claimed?: boolean;
  created_at?: string | null;
  subscription_active: boolean;
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
  altin_ons_usd?: number | null;
  altin_gram_try?: number | null;
  gumus_ons_usd?: number | null;
  gumus_gram_try?: number | null;
  updatedAt?: string;
  stale?: boolean;
};

export type SystemField = { id: string; label: string; type: 'text' | 'select' | 'number' | 'checkbox'; options: string[] };
export type SystemTypeDefT = { id: string; name: string; fields: SystemField[] };

export type DeletedAccountT = {
  user_id: string;
  email: string;
  name: string;
  company_name: string;
  deleted_at: string;
  purge_after: string;
  days_left: number;
};

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
  leadDailyCount: number;
  // Albert Genau modülü SADECE admin bu firma için açtıysa true olur
  // (bkz. PATCH /admin/companies/{id}/albert-genau-enabled) -- firma
  // sahibi kendi kendine açamaz.
  albertGenauEnabled?: boolean;
  // Firma sahibinin kendi beyanı ("Albert Genau bayisiyim") -- kayıt
  // sırasında veya sonradan kendisi değiştirebilir, erişim açmaz.
  albertGenauClaimed?: boolean;
};

export type LeadCompanyT = {
  id: string;
  companyId: string;
  firma: string;
  bolge: string;
  kategori: string;
  telefon: string;
  website: string;
  email: string;
  atananKullaniciId: string;
  atananNot: string;
  durum: string;
  notlar: string;
  tekrarTarihi: string;
  firsatTutari: number;
  siraNo: number;
  createdAt: string;
  updatedAt: string;
};

export type LeadSearchRequestT = {
  id: string;
  companyId: string;
  companyName: string;
  sektor: string;
  bolge: string;
  aciklama: string;
  durum: string;
  createdAt: string;
};

export type AdRecordT = {
  id: string;
  companyId: string;
  reklamveren: string;
  baslik: string;
  mecra: string;
  gorselUrl: string;
  ilkGorulmeTarihi: string;
  sonGorulmeTarihi: string;
  durum: 'Aktif' | 'Pasif';
  favori: boolean;
  notlar: string;
  yayinGunSayisi: number;
  kazanmaSkoru: number;
  kazanmaSinyali: 'Çok Güçlü' | 'Güçlü' | 'Test Edilebilir' | 'Zayıf';
  createdAt: string;
  updatedAt: string;
};

export type AdWatchItemT = {
  id: string;
  companyId: string;
  terim: string;
  createdAt: string;
};

export type EFaturaConfigT = {
  companyId: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  ortam: 'test' | 'canli';
  firmaVergiNo: string;
  firmaUnvani: string;
  firmaAdres: string;
  faturaSerisi: string;
  sablonId: string;
  lastTestOk: boolean;
  lastTestAt: string | null;
  lastTestMessage: string;
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

export type CatalogFileT = {
  id: string;
  companyId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
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
  quoteId?: string | null;
  kurTRY?: number; // paraBirimi TRY değilse: kayıt anındaki USD/EUR->TRY kuru (referans)
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
  kurTRY?: number; // paraBirimi TRY değilse: kayıt anındaki USD/EUR->TRY kuru (referans)
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

export type ManualReminderT = {
  id: string;
  userId: string;
  companyId: string;
  baslik: string;
  notu: string;
  tarih: string;
  tamamlandi: boolean;
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
  maliyet?: number | null;
  // Albert Genau hesaplayıcısından eklenen kalemler için maliyet kırılımı
  // (kar HARİÇ) -- Geçmiş'teki "Maliyet Ekle" alanı, kullanıcı henüz elle bir
  // `maliyet` girmemişse bu üçünün toplamıyla otomatik doluyor (bkz.
  // history.tsx). Elle girilmiş/kaydedilmiş bir `maliyet` her zaman önceliklidir
  // -- bu alanlar sadece bir "öneri" kaynağıdır, mevcut manuel akışı değiştirmez.
  agMaliyet?: number | null;
  agMontajBedeli?: number | null;
  agImalatBedeli?: number | null;
  // Albert Genau kaleminin çizim modeli (bkz. backend/ag_geometry.py). Teklif
  // PDF'indeki teknik çizim sayfası bundan üretilir; ekrandaki çizimle aynı
  // model olduğu için ikisi birbirinden kayamaz. Çizimi olmayan kalemlerde
  // yok -- eski teklifler ve elle girilen kalemler etkilenmez.
  agCizim?: CizimModeli | null;
};

export type QuoteEkT = { id: string; baslik: string; icerik: string };

// Kaleme bağlı olmayan, kullanıcının serbestçe "açıklama + fiyat" olarak
// ekleyip çıkarabildiği ek maliyet satırı (örn. nakliye, ekstra işçilik).
export type QuoteEkstraMaliyetT = { id: string; aciklama: string; tutar: number };

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
  maliyet?: number | null;
  ekstraMaliyetler?: QuoteEkstraMaliyetT[];
  createdByUserId?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt: string;
};

export type AlbertGenauTypesResponseT = {
  types: { id: string; label: string }[];
  finishes: string[];
  // Standart panel-adımlı derinlik tablosunun tüm değerleri (mm) -- frontend
  // bunu kullanarak kullanıcı derinlik yazarken (Hesapla'ya basmadan) tam
  // denk gelip gelmediğini anında kontrol edip alt/üst seçim kutusunu gösterir.
  depthValuesMm?: number[];
  // Ölçü (genişlik/derinlik) yerine düz parça listesi + miktar girişiyle
  // çalışan ürün aileleri (örn. AIRFLEX) -- bkz. AlbertGenauPartsListItemsResponseT.
  partsListSystems?: { id: string; label: string }[];
  // VERTIFLEX (dikey giyotin) alt tipleri -- detaylı seçenekler için ayrıca
  // bkz. albertGenauVertiflexTypes() / AlbertGenauVertiflexTypesResponseT.
  vertiflexTypes?: { id: string; label: string }[];
  // bkz. albertGenauKisBahcesiTypes() / AlbertGenauKisBahcesiTypesResponseT.
  kisBahcesiTypes?: { id: string; label: string }[];
  // bkz. albertGenauBcTypes() / AlbertGenauBcTypesResponseT.
  bcTypes?: { id: string; label: string }[];
};

export type AlbertGenauPartsListItemT = {
  sku: string;
  label: string;
  unit: string;
};

export type AlbertGenauPartsListItemsResponseT = {
  systemId: string;
  systemLabel: string;
  items: AlbertGenauPartsListItemT[];
};

export type AlbertGenauPartsListCalculateInputT = {
  companyId?: string;
  systemId: string;
  quantities: Record<string, number>;
  finish?: string | null;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauPartsListResultT = {
  kind: 'parts_list';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  malzemeGrubuToplamFiresiz: number;
  fireOrani: number;
  fireTutari: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

export type AlbertGenauAirflexModuleInputT = {
  companyId?: string;
  adet: number;
  tekerlekli?: boolean;
  kapiVar?: boolean;
  kilitVar?: boolean;
  camSabitGenislikMm?: number;
  camSabitFiyatM2?: number;
  camHareketliGenislikMm?: number;
  camHareketliFiyatM2?: number;
  finish?: string | null;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauAirflexModuleResultT = {
  kind: 'airflex_modul';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: { adet: number; tekerlekli: boolean; kapiVar: boolean; kilitVar: boolean; yukseklikMm: number };
  malzemeGrubuToplam: number;
  camGrubuToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

// VERTIFLEX (dikey giyotin cam balkon) — tip başına geçerli seçenekler
// backend'den (ag_calc.VERTIFLEX_TYPE_META) gelir ki formda tip değişince
// hangi alanların gösterileceği kod tekrarı olmadan belirlenebilsin.
export type AlbertGenauVertiflexTypeMetaT = {
  id: string;
  label: string;
  panelSayisiOptions: string[]; // boşsa bu tipte panel sayısı seçimi yok
  motorOptions: ('ag' | 'somfy')[];
  kumandaKanalOptions: Record<string, number[]>; // motor -> geçerli kanal seçenekleri
  kumandaOptional: boolean; // false ise kumanda zorunlu (örn. STATU IMPETUS)
  inoxZincirli: boolean;
  alicisiz: boolean;
  suTahliyeliAltKasa: boolean;
  secumaxTaraf: boolean;
  camSkus: { sku: string; label: string }[]; // kaç adet cam fiyatı (TL/m²) girilmesi gerektiğini de belirler
};

export type AlbertGenauVertiflexTypesResponseT = {
  types: AlbertGenauVertiflexTypeMetaT[];
  finishes: string[];
};

export type AlbertGenauVertiflexCalculateInputT = {
  companyId?: string;
  tip: string;
  genislikMm: number;
  yukseklikMm: number;
  panelSayisi?: string | null;
  motor?: 'ag' | 'somfy';
  kumandaKanal?: number | null;
  secumaxTaraf?: 'sag' | 'sol';
  inoxZincirli?: boolean;
  alicisiz?: boolean;
  suTahliyeliAltKasa?: boolean;
  // Sadece STATU IMPETUS CLEAN TWIN icin: IMPETUS TWIN STATU ELEKTROMEKANIK
  // SET (G05080) adedi -- varsayilan 1.
  elektromekanikSetAdet?: number;
  finish?: string | null;
  camFiyatlariM2?: Record<string, number>;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauVertiflexResultT = {
  kind: 'vertiflex';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: { genislikMm: number; yukseklikMm: number; panelSayisi: string | null; motor: string; elektromekanikSetAdet?: number | null };
  profilGrubuToplam: number;
  aksesuarGrubuToplam: number;
  camGrubuToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

// KIŞ BAHÇESİ (sabit cam tavanlı kış bahçesi) — tip başına geçerli
// seçenekler backend'den (ag_calc.KIS_BAHCESI_TYPE_META) gelir; PREMIUM
// 08-10'da ayrıca "ayarlı duvar bağlantısı" seçeneği vardır, TWIN'de yok.
export type AlbertGenauKisBahcesiTypeMetaT = {
  id: string;
  label: string;
  ayarliDuvarBaglantisi: boolean; // sadece PREMIUM 08-10'da anlamlı
  kirisUstuVidaKapama: boolean;
  ortaKayit: boolean;
  ucgenMikroPencere: boolean;
  camSkus: { sku: string; label: string }[]; // kaç adet cam fiyatı (TL/m²) girilmesi gerektiğini belirler
};

export type AlbertGenauKisBahcesiTypesResponseT = {
  types: AlbertGenauKisBahcesiTypeMetaT[];
  finishes: string[];
};

export type AlbertGenauKisBahcesiCalculateInputT = {
  companyId?: string;
  tip: string;
  genislikMm: number;
  derinlikMm: number;
  tavanBolumSayisi: number;
  arkaDuvarAltYukseklikMm: number;
  araDikmeSayisi?: number;
  ayarliDuvarBaglantisi?: boolean;
  kirisUstuVidaKapama?: boolean;
  ortaKayit?: boolean;
  ucgenMikroPencere?: boolean;
  finish?: string | null;
  camFiyatlariM2?: Record<string, number>;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauKisBahcesiResultT = {
  kind: 'kis_bahcesi';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: {
    genislikMm: number;
    derinlikMm: number;
    tavanBolumSayisi: number;
    arkaDuvarAltYukseklikMm: number;
    araDikmeSayisi: number;
  };
  profilGrubuToplam: number;
  aksesuarGrubuToplam: number;
  camGrubuToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

// BC ailesi (TIARA/TIARA FLAT/INT/ZERO/SLIM, SLIDER NEXT/SLIDE MASTER,
// ATRIUM/MOMENTUM/CENTRUM HD, TANGO/OPTIMA — 39 kaydırmalı sistem
// varyantı). Excel formülleri elle portlanmadı; her tipin ayarlanabilir
// kanat/bayrak/cam kalemleri backend'den (ag_calc.BC_TYPE_META) tip
// başına gelir — form bu meta'ya göre DİNAMİK kurulur.
export type AlbertGenauBcKanatInputT = { sku: string; label: string; default: number };
export type AlbertGenauBcFlagInputT = { label: string; kind: 'bool' | 'count'; default: number };
export type AlbertGenauBcCamItemT = { camSku: string; label: string; unit: string };

export type AlbertGenauBcTypeMetaT = {
  id: string;
  label: string;
  defaultGenislik: number;
  defaultYukseklik: number;
  kanatInputs: Record<string, AlbertGenauBcKanatInputT>; // hücre ref -> kanat takımı girdisi
  flagInputs: Record<string, AlbertGenauBcFlagInputT>;   // hücre ref -> köşe sayısı/delikli cam vb.
  camItems: AlbertGenauBcCamItemT[];
  hasRayType: boolean; // true ise ray tipi (1-4, 5/4/3/2 raylı) seçimi gösterilir
};

export type AlbertGenauBcTypesResponseT = {
  types: AlbertGenauBcTypeMetaT[];
  finishes: string[];
};

export type AlbertGenauBcCalculateInputT = {
  companyId?: string;
  tip: string;
  genislikMm?: number | null;
  yukseklikMm?: number | null;
  kanatMiktarlari?: Record<string, number>;
  bayrakDegerleri?: Record<string, number>;
  rayTipi?: number | null;
  finish?: string | null;
  camFiyatlariM2?: Record<string, number>;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauBcResultT = {
  kind: 'bc';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: { genislikMm: number; yukseklikMm: number; rayTipi: number | null };
  profilGrubuToplam: number;
  aksesuarGrubuToplam: number;
  camGrubuToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

// YEDEK PARÇA -- dağıtık parça-değişim kataloğu. Sabit bir "sistem" yok;
// bayı kataloğun herhangi bir alt kümesini serbestçe seçip miktar girer.
export type AlbertGenauYedekParcaItemT = { sku: string; name: string; unit: string; price: number; group: string };

export type AlbertGenauYedekParcaItemsResponseT = {
  items: AlbertGenauYedekParcaItemT[];
  groups: string[]; // görünüm sırasına göre alt-marka grupları
};

export type AlbertGenauYedekParcaCalculateInputT = {
  companyId?: string;
  quantities: Record<string, number>; // sku -> miktar
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauYedekParcaResultT = {
  kind: 'yedek_parca';
  tip: 'yedek_parca';
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: { kalemSayisi: number };
  malzemeGrubuToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

export type AlbertGenauCepheInputT = {
  genislikMm: number;
  yukseklikMm: number;
  /** Boş bırakılırsa ölçüden önerilir (bkz. ag_geometry.onerilen_kanat_sayisi). */
  kanatSayisi?: number | null;
  adet?: number;
  /** 'duvar' | 90 | 135 | 225 | 270 | serbest derece */
  sagAci?: 'duvar' | number | null;
  toplanmaYonu?: 'sola' | 'saga' | 'sagavesola' | 'sola_kaydir' | 'saga_kaydir' | 'sabit';
  solKoseGenisKapak?: boolean;
  sagKoseGenisKapak?: boolean;
};

export type AlbertGenauGeometryInputT = {
  companyId?: string;
  kind: 'cephe' | 'modul' | 'giyotin';
  // kind='cephe'
  cepheler?: AlbertGenauCepheInputT[];
  maxKanatMm?: number;
  /** BC tipi verilirse dönen modele `bcOneri` eklenir: kanat miktarları ve
   *  köşe sayısı için form önerisi (bkz. backend/ag_geometry.bc_oneri). */
  bcTip?: string;
  // kind='modul' (bioklimatik pergola) / kind='giyotin' (VERTIFLEX)
  tip?: string;
  genislikMm?: number;
  derinlikMm?: number;
  yukseklikMm?: number;
  panelSayisi?: number;
  /** kind='modul' için elle verilen bölünme. Albert Genau dışındaki
   *  kalemlerde AG derinlik tablosu geçerli olmadığı için modül/lamel
   *  sayısı kullanıcıdan alınır; verilirse fiyat listesine hiç gidilmez. */
  modulSayisi?: number;
  lamelSayisiToplam?: number;
};

export type AlbertGenauCalculateInputT = {
  // Gönderilirse hesaplama o firmanın kendi yüklediği fiyat listesini
  // kullanır (bkz. server.py _get_ag_price_data) -- gönderilmezse ortak/
  // varsayılan listeye düşer.
  companyId?: string;
  tip: string;
  genislikMm: number;
  derinlikMm: number;
  yukseklikMm?: number | null;
  cornerFlat?: boolean;
  somfy?: boolean;
  noWallBracket?: boolean;
  finish?: string | null;
  ledOption?: 'warm' | 'warm_rgb' | null;
  ledMidSupport?: boolean;
  kopuk?: boolean;
  alisIskontoPct?: number;
  montajBedeli?: number;
  imalatBedeli?: number;
  karMarjiPct?: number;
  odemeTipi?: 'nakit' | 'kredi_karti';
};

export type AlbertGenauKalemT = {
  label: string;
  sku: string;
  birimFiyat: number;
  miktar: number;
  toplam: number;
};

export type AlbertGenauResultT = {
  kind?: 'geometric';
  tip: string;
  tipAdi: string;
  odemeTipi: 'nakit' | 'kredi_karti';
  girdi: {
    genislikMm: number;
    derinlikMmGirilen: number;
    yapilabilirDerinlikMm: number;
    yukseklikMm?: number | null;
    modulSayisi: number;
  };
  // profilGrubuToplam, %10 fire payı dahil edilmiş nihai değerdir (bkz.
  // profilGrubuToplamFiresiz -- fire eklenmeden önceki ham değer).
  profilGrubuToplamFiresiz?: number;
  profilFireOrani?: number;
  profilFireTutari?: number;
  profilGrubuToplam: number;
  aksesuarGrubuToplam: number;
  opsiyonelToplam: number;
  maliyetToplam: number;
  alisIskontoPct: number;
  maliyetIndirimli: number;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  karTutari: number;
  satisFiyati: number;
  kalemler: AlbertGenauKalemT[];
};

export type AlbertGenauItemT = {
  id: string;
  companyId: string;
  userId: string;
  tip: string;
  isim: string;
  montajBedeli: number;
  imalatBedeli?: number;
  karMarjiPct: number;
  paraBirimi: string;
  createdAt: string;
};

export type AlbertGenauPriceListStatusT = {
  exists: boolean;
  skuCount: number;
  updatedAt?: string;
  updatedBy?: string;
  source: string;
};

export type AlbertGenauYedekParcaAdminStatusT = {
  exists: boolean;
  itemCount: number;
  updatedAt?: string;
  updatedBy?: string;
  source: string;
};

export type QuoteEditRequestT = {
  id: string;
  quoteId: string;
  companyId: string;
  ownerUserId: string;
  requestedByUserId: string;
  requestedByEmail: string;
  requestedByName?: string;
  approverUserId: string;
  approverEmail?: string;
  teklifNo?: string;
  musFirma?: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
  resolvedAt?: string | null;
};

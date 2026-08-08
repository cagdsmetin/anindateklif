const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '') + '/api';

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`API ${path} ${res.status}: ${t}`);
  }
  return res.json();
}

export const api = {
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

export type CompanyT = {
  id: string;
  sirketAdi: string;
  logoBase64: string;
  adres: string;
  telefon: string;
  telefon2: string;
  email: string;
  website: string;
  vergiDairesi: string;
  vergiNo: string;
  bankaBilgileri: string;
  hazirlayanEmails: string[];
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
  kategori: string;
  urunAdi: string;
  aciklama: string;
  adet: number;
  birim: string;
  birimFiyat: number;
};

export type QuoteT = {
  id: string;
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
  durum: string;
  araToplam: number;
  iskontoTutar: number;
  kdvTutar: number;
  genelToplam: number;
  createdAt: string;
};

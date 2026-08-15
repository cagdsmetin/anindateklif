import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CatalogItemT, CompanyT, CustomerT, QuoteT, ServiceT } from '@/src/lib/api';
import type { AttachmentT } from '@/src/lib/pdf-merge';
import { storage } from '@/src/utils/storage';
import { useAuth } from './AuthContext';

const ACTIVE_COMPANY_KEY = 'active_company_id_v2';

type Ctx = {
  loading: boolean;
  companies: CompanyT[];
  activeCompany: CompanyT | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  reloadCompanies: () => Promise<CompanyT[]>;
  createCompany: (data: Partial<CompanyT>) => Promise<CompanyT>;
  updateCompany: (id: string, data: Partial<CompanyT>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  catalog: CatalogItemT[];
  reloadCatalog: () => Promise<void>;
  addCatalogItem: (data: Partial<CatalogItemT>) => Promise<void>;
  updateCatalogItem: (id: string, data: Partial<CatalogItemT>) => Promise<void>;
  deleteCatalogItem: (id: string) => Promise<void>;
  bulkAddCatalog: (items: Partial<CatalogItemT>[]) => Promise<void>;
  customers: CustomerT[];
  reloadCustomers: () => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  services: ServiceT[];
  reloadServices: () => Promise<void>;
  createService: (data: Partial<ServiceT>) => Promise<void>;
  updateService: (id: string, data: Partial<ServiceT>) => Promise<void>;
  updateServiceStatus: (id: string, durum: string) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  quotes: QuoteT[];
  reloadQuotes: () => Promise<void>;
  saveQuote: (quote: Partial<QuoteT>, existingId?: string) => Promise<QuoteT>;
  deleteQuote: (id: string) => Promise<void>;
  updateQuoteStatus: (id: string, durum: string) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
  // Session-only registry of local (unsaved-to-backend) file attachments per quote,
  // shared between the editor, preview, and history screens so PDF merging is consistent.
  getQuoteAttachments: (quoteId: string) => AttachmentT[];
  setQuoteAttachments: (quoteId: string, atts: AttachmentT[]) => void;
};

const AppContext = createContext<Ctx | null>(null);

const DEFAULT_SYSTEM_TYPES: any[] = [
  {
    id: 'sys-pergola',
    name: 'Pistonlu Bioklimatik Sistem',
    fields: [
      { id: 'f-w', label: 'Genişlik (mm)', type: 'number', options: [] },
      { id: 'f-l', label: 'Uzunluk (mm)', type: 'number', options: [] },
      { id: 'f-h', label: 'Yükseklik (mm)', type: 'number', options: [] },
      { id: 'f-motor', label: 'Motor', type: 'select', options: ['Mosel', 'Somfy', 'Becker'] },
      { id: 'f-led', label: 'Aydınlatma', type: 'select', options: ['Günışığı', 'Beyaz LED', 'RGB LED', 'Yok'] },
      { id: 'f-kopuk', label: 'Köpük Dolgu', type: 'checkbox', options: [] },
      { id: 'f-ral', label: 'Ral Rengi', type: 'text', options: [] },
    ],
  },
  {
    id: 'sys-cam',
    name: 'Cam Balkon',
    fields: [
      { id: 'f-w', label: 'Genişlik (mm)', type: 'number', options: [] },
      { id: 'f-h', label: 'Yükseklik (mm)', type: 'number', options: [] },
      { id: 'f-cam', label: 'Cam Tipi', type: 'select', options: ['Isıcam', '8mm Temperli', '6mm Temperli', 'Lamine'] },
      { id: 'f-profil', label: 'Profil Rengi', type: 'select', options: ['Beyaz', 'Antrasit', 'Siyah', 'Ahşap Kaplama'] },
      { id: 'f-surgu', label: 'Sürgü Tipi', type: 'select', options: ['Alt Ray', 'Üst Ray', 'Katlanır'] },
    ],
  },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyT[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItemT[]>([]);
  const [customers, setCustomers] = useState<CustomerT[]>([]);
  const [services, setServices] = useState<ServiceT[]>([]);
  const [quotes, setQuotes] = useState<QuoteT[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [attachmentsByQuoteId, setAttachmentsByQuoteId] = useState<Record<string, AttachmentT[]>>({});

  const getQuoteAttachments = useCallback(
    (quoteId: string) => attachmentsByQuoteId[quoteId] || [],
    [attachmentsByQuoteId]
  );
  const setQuoteAttachments = useCallback((quoteId: string, atts: AttachmentT[]) => {
    if (!quoteId) return;
    setAttachmentsByQuoteId((prev) => ({ ...prev, [quoteId]: atts }));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId]
  );

  const reloadCompanies = useCallback(async () => {
    const list: CompanyT[] = await api.listCompanies();
    setCompanies(list);
    return list;
  }, []);

  const reloadCatalog = useCallback(async () => {
    if (!activeCompanyId) {
      setCatalog([]);
      return;
    }
    const list = await api.listCatalog(activeCompanyId);
    setCatalog(list);
  }, [activeCompanyId]);

  const reloadCustomers = useCallback(async () => {
    if (!activeCompanyId) {
      setCustomers([]);
      return;
    }
    const list = await api.listCustomers(activeCompanyId);
    setCustomers(list);
  }, [activeCompanyId]);

  const reloadServices = useCallback(async () => {
    if (!activeCompanyId) {
      setServices([]);
      return;
    }
    const list = await api.listServices(activeCompanyId);
    setServices(list);
  }, [activeCompanyId]);

  const reloadQuotes = useCallback(async () => {
    if (!activeCompanyId) {
      setQuotes([]);
      return;
    }
    const list = await api.listQuotes(activeCompanyId);
    setQuotes(list);
  }, [activeCompanyId]);

  const setActiveCompanyId = useCallback(async (id: string) => {
    setActiveCompanyIdState(id);
    await storage.setItem(ACTIVE_COMPANY_KEY, id);
  }, []);

  const createCompany = useCallback(async (data: Partial<CompanyT>) => {
    const created: CompanyT = await api.createCompany({
      sirketAdi: data.sirketAdi || 'Yeni Firma',
      logoBase64: data.logoBase64 || '',
      adres: data.adres || '',
      telefon: data.telefon || '',
      telefon2: data.telefon2 || '',
      email: data.email || '',
      website: data.website || '',
      vergiDairesi: data.vergiDairesi || '',
      vergiNo: data.vergiNo || '',
      ozelNotlar: data.ozelNotlar || '',
      banklar: data.banklar || [],
      hazirlayanEmails: data.hazirlayanEmails || [],
      sistemTipleri: data.sistemTipleri || DEFAULT_SYSTEM_TYPES,
    });
    await reloadCompanies();
    return created;
  }, [reloadCompanies]);

  const updateCompany = useCallback(async (id: string, data: Partial<CompanyT>) => {
    const existing = companies.find((c) => c.id === id);
    const merged: any = { ...existing, ...data };
    await api.updateCompany(id, {
      sirketAdi: merged.sirketAdi || '',
      logoBase64: merged.logoBase64 || '',
      adres: merged.adres || '',
      telefon: merged.telefon || '',
      telefon2: merged.telefon2 || '',
      email: merged.email || '',
      website: merged.website || '',
      vergiDairesi: merged.vergiDairesi || '',
      vergiNo: merged.vergiNo || '',
      ozelNotlar: merged.ozelNotlar || '',
      banklar: merged.banklar || [],
      hazirlayanEmails: merged.hazirlayanEmails || [],
      sistemTipleri: merged.sistemTipleri || [],
    });
    await reloadCompanies();
  }, [companies, reloadCompanies]);

  const deleteCompany = useCallback(async (id: string) => {
    await api.deleteCompany(id);
    if (activeCompanyId === id) {
      setActiveCompanyIdState(null);
      await storage.removeItem(ACTIVE_COMPANY_KEY);
    }
    await reloadCompanies();
  }, [activeCompanyId, reloadCompanies]);

  const addCatalogItem = useCallback(async (data: Partial<CatalogItemT>) => {
    if (!activeCompanyId) return;
    await api.createCatalogItem({
      companyId: activeCompanyId,
      kategori: data.kategori || 'Genel',
      urunAdi: data.urunAdi || '',
      aciklama: data.aciklama || '',
      birim: data.birim || 'Adet',
      birimFiyat: Number(data.birimFiyat) || 0,
      paraBirimi: data.paraBirimi || 'USD',
    });
    await reloadCatalog();
  }, [activeCompanyId, reloadCatalog]);

  const updateCatalogItem = useCallback(async (id: string, data: Partial<CatalogItemT>) => {
    if (!activeCompanyId) return;
    const existing = catalog.find((c) => c.id === id);
    const merged: any = { ...existing, ...data };
    await api.updateCatalogItem(id, {
      companyId: activeCompanyId,
      kategori: merged.kategori || 'Genel',
      urunAdi: merged.urunAdi || '',
      aciklama: merged.aciklama || '',
      birim: merged.birim || 'Adet',
      birimFiyat: Number(merged.birimFiyat) || 0,
      paraBirimi: merged.paraBirimi || 'USD',
    });
    await reloadCatalog();
  }, [activeCompanyId, catalog, reloadCatalog]);

  const deleteCatalogItem = useCallback(async (id: string) => {
    await api.deleteCatalogItem(id);
    await reloadCatalog();
  }, [reloadCatalog]);

  const bulkAddCatalog = useCallback(async (items: Partial<CatalogItemT>[]) => {
    if (!activeCompanyId) return;
    const payload = items.map((it) => ({
      companyId: activeCompanyId,
      kategori: it.kategori || 'Genel',
      urunAdi: it.urunAdi || '',
      aciklama: it.aciklama || '',
      birim: it.birim || 'Adet',
      birimFiyat: Number(it.birimFiyat) || 0,
      paraBirimi: it.paraBirimi || 'USD',
    }));
    await api.bulkCreateCatalog(activeCompanyId, payload);
    await reloadCatalog();
  }, [activeCompanyId, reloadCatalog]);

  const deleteCustomer = useCallback(async (id: string) => {
    await api.deleteCustomer(id);
    await reloadCustomers();
  }, [reloadCustomers]);

  const createService = useCallback(async (data: Partial<ServiceT>) => {
    if (!activeCompanyId) return;
    await api.createService({
      companyId: activeCompanyId,
      musFirma: data.musFirma || '',
      musYetkili: data.musYetkili || '',
      musTelefon: data.musTelefon || '',
      baslik: data.baslik || '',
      aciklama: data.aciklama || '',
      servisTarihi: data.servisTarihi || '',
      garantiBitis: data.garantiBitis || '',
      bakimTarihi: data.bakimTarihi || '',
      durum: data.durum || 'Açık',
    });
    await reloadServices();
  }, [activeCompanyId, reloadServices]);

  const updateService = useCallback(async (id: string, data: Partial<ServiceT>) => {
    if (!activeCompanyId) return;
    const existing = services.find((s) => s.id === id);
    const merged: any = { ...existing, ...data };
    await api.updateService(id, {
      companyId: activeCompanyId,
      musFirma: merged.musFirma || '',
      musYetkili: merged.musYetkili || '',
      musTelefon: merged.musTelefon || '',
      baslik: merged.baslik || '',
      aciklama: merged.aciklama || '',
      servisTarihi: merged.servisTarihi || '',
      garantiBitis: merged.garantiBitis || '',
      bakimTarihi: merged.bakimTarihi || '',
      durum: merged.durum || 'Açık',
    });
    await reloadServices();
  }, [activeCompanyId, services, reloadServices]);

  const updateServiceStatus = useCallback(async (id: string, durum: string) => {
    await api.updateServiceStatus(id, durum);
    await reloadServices();
  }, [reloadServices]);

  const deleteService = useCallback(async (id: string) => {
    await api.deleteService(id);
    await reloadServices();
  }, [reloadServices]);

  const saveQuote = useCallback(async (quote: Partial<QuoteT>, existingId?: string) => {
    if (!activeCompanyId) throw new Error('Aktif firma yok');
    const payload = {
      companyId: activeCompanyId,
      teklifNo: quote.teklifNo || '',
      tarih: quote.tarih || '',
      gecerlilik: quote.gecerlilik || '',
      hazirlayanEmail: quote.hazirlayanEmail || '',
      musFirma: quote.musFirma || '',
      musYetkili: quote.musYetkili || '',
      musTelefon: quote.musTelefon || '',
      musEmail: quote.musEmail || '',
      musAdres: quote.musAdres || '',
      projeAdi: quote.projeAdi || '',
      nakliye: quote.nakliye || 'EXW',
      paraBirimi: quote.paraBirimi || 'USD',
      odemeSekli: quote.odemeSekli || '',
      mensei: quote.mensei || 'TÜRKİYE',
      teslimGun: quote.teslimGun || '',
      iskonto: Number(quote.iskonto) || 0,
      kdvOrani: Number(quote.kdvOrani) || 20,
      notlar: quote.notlar || '',
      items: (quote.items || []).map((it) => ({
        id: it.id,
        mode: it.mode || 'general',
        urunAdi: it.urunAdi || '',
        sistemTipiId: it.sistemTipiId || '',
        sistemTipi: it.sistemTipi || '',
        sistemFields: it.sistemFields || [],
        customFields: it.customFields || [],
        aciklama: it.aciklama || '',
        adet: Number(it.adet) || 0,
        birim: it.birim || 'Adet',
        birimFiyat: Number(it.birimFiyat) || 0,
      })),
      durum: quote.durum || 'Beklemede',
    };
    const saved = existingId
      ? await api.updateQuote(existingId, payload)
      : await api.createQuote(payload);
    await reloadQuotes();
    await reloadCustomers();
    return saved as QuoteT;
  }, [activeCompanyId, reloadQuotes, reloadCustomers]);

  const deleteQuote = useCallback(async (id: string) => {
    await api.deleteQuote(id);
    await reloadQuotes();
  }, [reloadQuotes]);

  const updateQuoteStatus = useCallback(async (id: string, durum: string) => {
    await api.updateQuoteStatus(id, durum);
    await reloadQuotes();
  }, [reloadQuotes]);

  // Bootstrap when user changes
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setCatalog([]);
      setCustomers([]);
      setServices([]);
      setQuotes([]);
      setLoading(false);
      return;
    }
    // Skip data bootstrap until the user finishes onboarding.
    // The setup wizard is responsible for creating the first company
    // (avoids creating a duplicate empty "Yeni Firma" default).
    if (!user.onboarding_completed) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list: CompanyT[] = await api.listCompanies();
        let activeId = (await storage.getItem<string>(ACTIVE_COMPANY_KEY, '')) as string;
        if (list.length === 0) {
          // seed default empty company for the user
          const created: CompanyT = await api.createCompany({
            sirketAdi: user.name ? `${user.name} Firma` : 'Yeni Firma',
            hazirlayanEmails: user.email ? [user.email] : [],
            sistemTipleri: DEFAULT_SYSTEM_TYPES,
            banklar: [],
          });
          list.push(created);
          activeId = created.id;
          await storage.setItem(ACTIVE_COMPANY_KEY, created.id);
        } else if (!activeId || !list.find((c) => c.id === activeId)) {
          activeId = list[0].id;
          await storage.setItem(ACTIVE_COMPANY_KEY, activeId);
        }
        if (!cancelled) {
          setCompanies(list);
          setActiveCompanyIdState(activeId);
        }
      } catch (e) {
        console.warn('Bootstrap error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Load data for active company
  useEffect(() => {
    if (!user) return;
    if (!activeCompanyId) return;
    reloadCatalog();
    reloadCustomers();
    reloadServices();
    reloadQuotes();
  }, [user, activeCompanyId, reloadCatalog, reloadCustomers, reloadServices, reloadQuotes]);

  return (
    <AppContext.Provider
      value={{
        loading,
        companies,
        activeCompany,
        setActiveCompanyId,
        reloadCompanies,
        createCompany,
        updateCompany,
        deleteCompany,
        catalog,
        reloadCatalog,
        addCatalogItem,
        updateCatalogItem,
        deleteCatalogItem,
        bulkAddCatalog,
        customers,
        reloadCustomers,
        deleteCustomer,
        services,
        reloadServices,
        createService,
        updateService,
        updateServiceStatus,
        deleteService,
        quotes,
        reloadQuotes,
        saveQuote,
        deleteQuote,
        updateQuoteStatus,
        toast,
        showToast,
        getQuoteAttachments,
        setQuoteAttachments,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CatalogItemT, CompanyT, CustomerT, QuoteT } from '@/src/lib/api';
import type { AttachmentT } from '@/src/lib/pdf-merge';
import { storage } from '@/src/utils/storage';
import { useAuth } from './AuthContext';

const ACTIVE_COMPANY_KEY = 'active_company_id_v2';

type Ctx = {
  loading: boolean;
  companies: CompanyT[];
  activeCompany: CompanyT | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  reloadCompanies: () => Promise<CompanyT[]>;
  createCompany: (data: Partial<CompanyT>) => Promise<CompanyT>;
  updateCompany: (id: string, data: Partial<CompanyT>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  catalog: CatalogItemT[];
  reloadCatalog: () => Promise<void>;
  addCatalogItem: (data: Partial<CatalogItemT>) => Promise<void>;
  updateCatalogItem: (id: string, data: Partial<CatalogItemT>) => Promise<void>;
  deleteCatalogItem: (id: string) => Promise<void>;
  bulkAddCatalog: (items: Partial<CatalogItemT>[]) => Promise<void>;
  customers: CustomerT[];
  reloadCustomers: () => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  quotes: QuoteT[];
  reloadQuotes: () => Promise<void>;
  saveQuote: (quote: Partial<QuoteT>, existingId?: string) => Promise<QuoteT>;
  deleteQuote: (id: string) => Promise<void>;
  updateQuoteStatus: (id: string, durum: string) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
  // Session-only registry of local (unsaved-to-backend) file attachments per quote,
  // shared between the editor, preview, and history screens so PDF merging is consistent.
  getQuoteAttachments: (quoteId: string) => AttachmentT[];
  setQuoteAttachments: (quoteId: string, atts: AttachmentT[]) => void;
};

const AppContext = createContext<Ctx | null>(null);

const DEFAULT_SYSTEM_TYPES: any[] = [
  {
    id: 'sys-pergola',
    name: 'Pistonlu Bioklimatik Sistem',
    fields: [
      { id: 'f-w', label: 'Genişlik (mm)', type: 'number', options: [] },
      { id: 'f-l', label: 'Uzunluk (mm)', type: 'number', options: [] },
      { id: 'f-h', label: 'Yükseklik (mm)', type: 'number', options: [] },
      { id: 'f-motor', label: 'Motor', type: 'select', options: ['Mosel', 'Somfy', 'Becker'] },
      { id: 'f-led', label: 'Aydınlatma', type: 'select', options: ['Günışığı', 'Beyaz LED', 'RGB LED', 'Yok'] },
      { id: 'f-kopuk', label: 'Köpük Dolgu', type: 'checkbox', options: [] },
      { id: 'f-ral', label: 'Ral Rengi', type: 'text', options: [] },
    ],
  },
  {
    id: 'sys-cam',
    name: 'Cam Balkon',
    fields: [
      { id: 'f-w', label: 'Genişlik (mm)', type: 'number', options: [] },
      { id: 'f-h', label: 'Yükseklik (mm)', type: 'number', options: [] },
      { id: 'f-cam', label: 'Cam Tipi', type: 'select', options: ['Isıcam', '8mm Temperli', '6mm Temperli', 'Lamine'] },
      { id: 'f-profil', label: 'Profil Rengi', type: 'select', options: ['Beyaz', 'Antrasit', 'Siyah', 'Ahşap Kaplama'] },
      { id: 'f-surgu', label: 'Sürgü Tipi', type: 'select', options: ['Alt Ray', 'Üst Ray', 'Katlanır'] },
    ],
  },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyT[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItemT[]>([]);
  const [customers, setCustomers] = useState<CustomerT[]>([]);
  const [quotes, setQuotes] = useState<QuoteT[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [attachmentsByQuoteId, setAttachmentsByQuoteId] = useState<Record<string, AttachmentT[]>>({});

  const getQuoteAttachments = useCallback(
    (quoteId: string) => attachmentsByQuoteId[quoteId] || [],
    [attachmentsByQuoteId]
  );
  const setQuoteAttachments = useCallback((quoteId: string, atts: AttachmentT[]) => {
    if (!quoteId) return;
    setAttachmentsByQuoteId((prev) => ({ ...prev, [quoteId]: atts }));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId]
  );

  const reloadCompanies = useCallback(async () => {
    const list: CompanyT[] = await api.listCompanies();
    setCompanies(list);
    return list;
  }, []);

  const reloadCatalog = useCallback(async () => {
    if (!activeCompanyId) {
      setCatalog([]);
      return;
    }
    const list = await api.listCatalog(activeCompanyId);
    setCatalog(list);
  }, [activeCompanyId]);

  const reloadCustomers = useCallback(async () => {
    if (!activeCompanyId) {
      setCustomers([]);
      return;
    }
    const list = await api.listCustomers(activeCompanyId);
    setCustomers(list);
  }, [activeCompanyId]);

  const reloadQuotes = useCallback(async () => {
    if (!activeCompanyId) {
      setQuotes([]);
      return;
    }
    const list = await api.listQuotes(activeCompanyId);
    setQuotes(list);
  }, [activeCompanyId]);

  const setActiveCompanyId = useCallback(async (id: string) => {
    setActiveCompanyIdState(id);
    await storage.setItem(ACTIVE_COMPANY_KEY, id);
  }, []);

  const createCompany = useCallback(async (data: Partial<CompanyT>) => {
    const created: CompanyT = await api.createCompany({
      sirketAdi: data.sirketAdi || 'Yeni Firma',
      logoBase64: data.logoBase64 || '',
      adres: data.adres || '',
      telefon: data.telefon || '',
      telefon2: data.telefon2 || '',
      email: data.email || '',
      website: data.website || '',
      vergiDairesi: data.vergiDairesi || '',
      vergiNo: data.vergiNo || '',
      ozelNotlar: data.ozelNotlar || '',
      banklar: data.banklar || [],
      hazirlayanEmails: data.hazirlayanEmails || [],
      sistemTipleri: data.sistemTipleri || DEFAULT_SYSTEM_TYPES,
    });
    await reloadCompanies();
    return created;
  }, [reloadCompanies]);

  const updateCompany = useCallback(async (id: string, data: Partial<CompanyT>) => {
    const existing = companies.find((c) => c.id === id);
    const merged: any = { ...existing, ...data };
    await api.updateCompany(id, {
      sirketAdi: merged.sirketAdi || '',
      logoBase64: merged.logoBase64 || '',
      adres: merged.adres || '',
      telefon: merged.telefon || '',
      telefon2: merged.telefon2 || '',
      email: merged.email || '',
      website: merged.website || '',
      vergiDairesi: merged.vergiDairesi || '',
      vergiNo: merged.vergiNo || '',
      ozelNotlar: merged.ozelNotlar || '',
      banklar: merged.banklar || [],
      hazirlayanEmails: merged.hazirlayanEmails || [],
      sistemTipleri: merged.sistemTipleri || [],
    });
    await reloadCompanies();
  }, [companies, reloadCompanies]);

  const deleteCompany = useCallback(async (id: string) => {
    await api.deleteCompany(id);
    if (activeCompanyId === id) {
      setActiveCompanyIdState(null);
      await storage.removeItem(ACTIVE_COMPANY_KEY);
    }
    await reloadCompanies();
  }, [activeCompanyId, reloadCompanies]);

  const addCatalogItem = useCallback(async (data: Partial<CatalogItemT>) => {
    if (!activeCompanyId) return;
    await api.createCatalogItem({
      companyId: activeCompanyId,
      kategori: data.kategori || 'Genel',
      urunAdi: data.urunAdi || '',
      aciklama: data.aciklama || '',
      birim: data.birim || 'Adet',
      birimFiyat: Number(data.birimFiyat) || 0,
      paraBirimi: data.paraBirimi || 'USD',
    });
    await reloadCatalog();
  }, [activeCompanyId, reloadCatalog]);

  const updateCatalogItem = useCallback(async (id: string, data: Partial<CatalogItemT>) => {
    if (!activeCompanyId) return;
    const existing = catalog.find((c) => c.id === id);
    const merged: any = { ...existing, ...data };
    await api.updateCatalogItem(id, {
      companyId: activeCompanyId,
      kategori: merged.kategori || 'Genel',
      urunAdi: merged.urunAdi || '',
      aciklama: merged.aciklama || '',
      birim: merged.birim || 'Adet',
      birimFiyat: Number(merged.birimFiyat) || 0,
      paraBirimi: merged.paraBirimi || 'USD',
    });
    await reloadCatalog();
  }, [activeCompanyId, catalog, reloadCatalog]);

  const deleteCatalogItem = useCallback(async (id: string) => {
    await api.deleteCatalogItem(id);
    await reloadCatalog();
  }, [reloadCatalog]);

  const bulkAddCatalog = useCallback(async (items: Partial<CatalogItemT>[]) => {
    if (!activeCompanyId) return;
    const payload = items.map((it) => ({
      companyId: activeCompanyId,
      kategori: it.kategori || 'Genel',
      urunAdi: it.urunAdi || '',
      aciklama: it.aciklama || '',
      birim: it.birim || 'Adet',
      birimFiyat: Number(it.birimFiyat) || 0,
      paraBirimi: it.paraBirimi || 'USD',
    }));
    await api.bulkCreateCatalog(activeCompanyId, payload);
    await reloadCatalog();
  }, [activeCompanyId, reloadCatalog]);

  const deleteCustomer = useCallback(async (id: string) => {
    await api.deleteCustomer(id);
    await reloadCustomers();
  }, [reloadCustomers]);

  const saveQuote = useCallback(async (quote: Partial<QuoteT>, existingId?: string) => {
    if (!activeCompanyId) throw new Error('Aktif firma yok');
    const payload = {
      companyId: activeCompanyId,
      teklifNo: quote.teklifNo || '',
      tarih: quote.tarih || '',
      gecerlilik: quote.gecerlilik || '',
      hazirlayanEmail: quote.hazirlayanEmail || '',
      musFirma: quote.musFirma || '',
      musYetkili: quote.musYetkili || '',
      musTelefon: quote.musTelefon || '',
      musEmail: quote.musEmail || '',
      musAdres: quote.musAdres || '',
      projeAdi: quote.projeAdi || '',
      nakliye: quote.nakliye || 'EXW',
      paraBirimi: quote.paraBirimi || 'USD',
      odemeSekli: quote.odemeSekli || '',
      mensei: quote.mensei || 'TÜRKİYE',
      teslimGun: quote.teslimGun || '',
      iskonto: Number(quote.iskonto) || 0,
      kdvOrani: Number(quote.kdvOrani) || 20,
      notlar: quote.notlar || '',
      items: (quote.items || []).map((it) => ({
        id: it.id,
        mode: it.mode || 'general',
        urunAdi: it.urunAdi || '',
        sistemTipiId: it.sistemTipiId || '',
        sistemTipi: it.sistemTipi || '',
        sistemFields: it.sistemFields || [],
        customFields: it.customFields || [],
        aciklama: it.aciklama || '',
        adet: Number(it.adet) || 0,
        birim: it.birim || 'Adet',
        birimFiyat: Number(it.birimFiyat) || 0,
      })),
      durum: quote.durum || 'Beklemede',
    };
    const saved = existingId
      ? await api.updateQuote(existingId, payload)
      : await api.createQuote(payload);
    await reloadQuotes();
    await reloadCustomers();
    return saved as QuoteT;
  }, [activeCompanyId, reloadQuotes, reloadCustomers]);

  const deleteQuote = useCallback(async (id: string) => {
    await api.deleteQuote(id);
    await reloadQuotes();
  }, [reloadQuotes]);

  const updateQuoteStatus = useCallback(async (id: string, durum: string) => {
    await api.updateQuoteStatus(id, durum);
    await reloadQuotes();
  }, [reloadQuotes]);

  // Bootstrap when user changes
  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setCatalog([]);
      setCustomers([]);
      setQuotes([]);
      setLoading(false);
      return;
    }
    // Skip data bootstrap until the user finishes onboarding.
    // The setup wizard is responsible for creating the first company
    // (avoids creating a duplicate empty "Yeni Firma" default).
    if (!user.onboarding_completed) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list: CompanyT[] = await api.listCompanies();
        let activeId = (await storage.getItem<string>(ACTIVE_COMPANY_KEY, '')) as string;
        if (list.length === 0) {
          // seed default empty company for the user
          const created: CompanyT = await api.createCompany({
            sirketAdi: user.name ? `${user.name} Firma` : 'Yeni Firma',
            hazirlayanEmails: user.email ? [user.email] : [],
            sistemTipleri: DEFAULT_SYSTEM_TYPES,
            banklar: [],
          });
          list.push(created);
          activeId = created.id;
          await storage.setItem(ACTIVE_COMPANY_KEY, created.id);
        } else if (!activeId || !list.find((c) => c.id === activeId)) {
          activeId = list[0].id;
          await storage.setItem(ACTIVE_COMPANY_KEY, activeId);
        }
        if (!cancelled) {
          setCompanies(list);
          setActiveCompanyIdState(activeId);
        }
      } catch (e) {
        console.warn('Bootstrap error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Load data for active company
  useEffect(() => {
    if (!user) return;
    if (!activeCompanyId) return;
    reloadCatalog();
    reloadCustomers();
    reloadQuotes();
  }, [user, activeCompanyId, reloadCatalog, reloadCustomers, reloadQuotes]);

  return (
    <AppContext.Provider
      value={{
        loading,
        companies,
        activeCompany,
        setActiveCompanyId,
        reloadCompanies,
        createCompany,
        updateCompany,
        deleteCompany,
        catalog,
        reloadCatalog,
        addCatalogItem,
        updateCatalogItem,
        deleteCatalogItem,
        bulkAddCatalog,
        customers,
        reloadCustomers,
        deleteCustomer,
        quotes,
        reloadQuotes,
        saveQuote,
        deleteQuote,
        updateQuoteStatus,
        toast,
        showToast,
        getQuoteAttachments,
        setQuoteAttachments,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

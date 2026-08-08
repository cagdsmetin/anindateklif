import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CatalogItemT, CompanyT, CustomerT, QuoteT } from '@/src/lib/api';
import { storage } from '@/src/utils/storage';

const ACTIVE_COMPANY_KEY = 'active_company_id_v1';

type Ctx = {
  loading: boolean;
  companies: CompanyT[];
  activeCompany: CompanyT | null;
  setActiveCompanyId: (id: string) => Promise<void>;
  reloadCompanies: () => Promise<void>;
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
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyT[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItemT[]>([]);
  const [customers, setCustomers] = useState<CustomerT[]>([]);
  const [quotes, setQuotes] = useState<QuoteT[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) || null,
    [companies, activeCompanyId]
  );

  const reloadCompanies = useCallback(async () => {
    const list = await api.listCompanies();
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
      bankaBilgileri: data.bankaBilgileri || '',
      hazirlayanEmails: data.hazirlayanEmails || [],
    });
    await reloadCompanies();
    return created;
  }, [reloadCompanies]);

  const updateCompany = useCallback(async (id: string, data: Partial<CompanyT>) => {
    const existing = companies.find((c) => c.id === id);
    const merged = { ...existing, ...data };
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
      bankaBilgileri: merged.bankaBilgileri || '',
      hazirlayanEmails: merged.hazirlayanEmails || [],
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
    const merged = { ...existing, ...data };
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
        kategori: it.kategori || '',
        urunAdi: it.urunAdi || '',
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
    return saved;
  }, [activeCompanyId, reloadQuotes, reloadCustomers]);

  const deleteQuote = useCallback(async (id: string) => {
    await api.deleteQuote(id);
    await reloadQuotes();
  }, [reloadQuotes]);

  const updateQuoteStatus = useCallback(async (id: string, durum: string) => {
    await api.updateQuoteStatus(id, durum);
    await reloadQuotes();
  }, [reloadQuotes]);

  // Bootstrap
  useEffect(() => {
    (async () => {
      try {
        const list: CompanyT[] = await api.listCompanies();
        let activeId = (await storage.getItem<string>(ACTIVE_COMPANY_KEY, '')) as string;
        if (list.length === 0) {
          // Seed: create default demo company
          const demo = await api.createCompany({
            sirketAdi: 'SKYART GROUP GÖLGELENDİRME',
            logoBase64: '',
            adres: 'USKUMRUKÖY MAH. 1. SOK NO:125 ZEKERİYAKÖY / SARIYER / İSTANBUL',
            telefon: '0 850 606 0 532',
            telefon2: '',
            email: 'info@skyart-group.com',
            website: 'www.skyart-group.com',
            vergiDairesi: '',
            vergiNo: '',
            bankaBilgileri: 'GARANTİ BANKASI\nTR12 3456 7890 1234 5678 90',
            hazirlayanEmails: ['cagdas@skyart-group.com', 'mehmet@skyart-group.com', 'yasemin@skyart-group.com'],
          });
          list.push(demo);
          activeId = demo.id;
          await storage.setItem(ACTIVE_COMPANY_KEY, demo.id);
        } else if (!activeId || !list.find((c) => c.id === activeId)) {
          activeId = list[0].id;
          await storage.setItem(ACTIVE_COMPANY_KEY, activeId);
        }
        setCompanies(list);
        setActiveCompanyIdState(activeId);
      } catch (e) {
        console.warn('Bootstrap error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load data for active company
  useEffect(() => {
    if (!activeCompanyId) return;
    reloadCatalog();
    reloadCustomers();
    reloadQuotes();
  }, [activeCompanyId, reloadCatalog, reloadCustomers, reloadQuotes]);

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

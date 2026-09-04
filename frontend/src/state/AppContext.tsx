import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { api, CampaignT, CatalogItemT, CompanyT, CustomerT, KasaEntryT, ManualReminderT, QuoteT, ServiceT, TahsilatEntryT } from '@/src/lib/api';
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
  kasa: KasaEntryT[];
  reloadKasa: () => Promise<void>;
  addKasaEntry: (data: Partial<KasaEntryT>) => Promise<void>;
  deleteKasaEntry: (id: string) => Promise<void>;
  tahsilat: TahsilatEntryT[];
  reloadTahsilat: () => Promise<void>;
  addTahsilatEntry: (data: Partial<TahsilatEntryT>) => Promise<void>;
  deleteTahsilatEntry: (id: string) => Promise<void>;
  customers: CustomerT[];
  reloadCustomers: () => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  services: ServiceT[];
  reloadServices: () => Promise<void>;
  createService: (data: Partial<ServiceT>) => Promise<void>;
  updateService: (id: string, data: Partial<ServiceT>) => Promise<void>;
  updateServiceStatus: (id: string, durum: string) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  campaigns: CampaignT[];
  reloadCampaigns: () => Promise<void>;
  createCampaign: (data: { baslik: string; mesaj: string }) => Promise<CampaignT>;
  deleteCampaign: (id: string) => Promise<void>;
  markCampaignSent: (id: string, customerId: string) => Promise<void>;
  reminders: ManualReminderT[];
  reloadReminders: () => Promise<void>;
  createReminder: (data: { baslik: string; notu?: string; tarih: string }) => Promise<ManualReminderT>;
  updateReminder: (id: string, data: Partial<{ baslik: string; notu: string; tarih: string; tamamlandi: boolean }>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  quotes: QuoteT[];
  reloadQuotes: () => Promise<void>;
  saveQuote: (quote: Partial<QuoteT>, existingId?: string) => Promise<QuoteT>;
  deleteQuote: (id: string) => Promise<void>;
  updateQuoteStatus: (id: string, durum: string) => Promise<void>;
  updateQuoteMaliyet: (id: string, maliyet: number | null) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
  // Session-only registry of local (unsaved-to-backend) file attachments per quote,
  // shared between the editor, preview, and history screens so PDF merging is consistent.
  getQuoteAttachments: (quoteId: string) => AttachmentT[];
  setQuoteAttachments: (quoteId: string, atts: AttachmentT[]) => void;
  // Ekip Sohbeti: kaç okunmamış mesaj olduğu (WhatsApp Web tarzı yanıp sönen
  // menü göstergesi + tarayıcı bildirimi için) — bkz. aşağıdaki polling useEffect.
  teamUnreadTotal: number;
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
  const [kasa, setKasa] = useState<KasaEntryT[]>([]);
  const [tahsilat, setTahsilat] = useState<TahsilatEntryT[]>([]);
  const [customers, setCustomers] = useState<CustomerT[]>([]);
  const [services, setServices] = useState<ServiceT[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignT[]>([]);
  const [reminders, setReminders] = useState<ManualReminderT[]>([]);
  const [quotes, setQuotes] = useState<QuoteT[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [attachmentsByQuoteId, setAttachmentsByQuoteId] = useState<Record<string, AttachmentT[]>>({});
  const [teamUnreadTotal, setTeamUnreadTotal] = useState(0);
  const pathname = usePathname();
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const teamUnreadFirstLoadRef = useRef(true);

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

  const reloadKasa = useCallback(async () => {
    if (!activeCompanyId) {
      setKasa([]);
      return;
    }
    const list = await api.listKasa(activeCompanyId);
    setKasa(list);
  }, [activeCompanyId]);

  const reloadTahsilat = useCallback(async () => {
    if (!activeCompanyId) {
      setTahsilat([]);
      return;
    }
    const list = await api.listTahsilat(activeCompanyId);
    setTahsilat(list);
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

  const reloadCampaigns = useCallback(async () => {
    if (!activeCompanyId) {
      setCampaigns([]);
      return;
    }
    const list = await api.listCampaigns(activeCompanyId);
    setCampaigns(list);
  }, [activeCompanyId]);

  const reloadReminders = useCallback(async () => {
    if (!activeCompanyId) {
      setReminders([]);
      return;
    }
    const list = await api.listReminders(activeCompanyId);
    setReminders(list);
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

  const addKasaEntry = useCallback(async (data: Partial<KasaEntryT>) => {
    if (!activeCompanyId) return;
    await api.createKasaEntry({
      companyId: activeCompanyId,
      tur: data.tur || 'gelir',
      kategori: data.kategori || '',
      tutar: Number(data.tutar) || 0,
      paraBirimi: data.paraBirimi || 'TRY',
      yontem: data.yontem || 'Nakit',
      notlar: data.notlar || '',
      tarih: data.tarih || new Date().toISOString().split('T')[0],
      kurTRY: Number(data.kurTRY) || 0,
    });
    await reloadKasa();
  }, [activeCompanyId, reloadKasa]);

  const deleteKasaEntry = useCallback(async (id: string) => {
    await api.deleteKasaEntry(id);
    await reloadKasa();
  }, [reloadKasa]);

  const addTahsilatEntry = useCallback(async (data: Partial<TahsilatEntryT>) => {
    if (!activeCompanyId) return;
    await api.createTahsilatEntry({
      companyId: activeCompanyId,
      customerId: data.customerId || '',
      musteriAdi: data.musteriAdi || '',
      musteriTelefon: data.musteriTelefon || '',
      tur: data.tur || 'tahsilat',
      tutar: Number(data.tutar) || 0,
      paraBirimi: data.paraBirimi || 'TRY',
      yontem: data.yontem || 'Nakit',
      vadeTarihi: data.vadeTarihi || '',
      notlar: data.notlar || '',
      tarih: data.tarih || new Date().toISOString().split('T')[0],
      kurTRY: Number(data.kurTRY) || 0,
    });
    await reloadTahsilat();
  }, [activeCompanyId, reloadTahsilat]);

  const deleteTahsilatEntry = useCallback(async (id: string) => {
    await api.deleteTahsilatEntry(id);
    await reloadTahsilat();
  }, [reloadTahsilat]);

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

  const createCampaign = useCallback(async (data: { baslik: string; mesaj: string }) => {
    if (!activeCompanyId) throw new Error('Aktif firma yok');
    const created: CampaignT = await api.createCampaign({
      companyId: activeCompanyId,
      baslik: data.baslik || '',
      mesaj: data.mesaj || '',
    });
    await reloadCampaigns();
    return created;
  }, [activeCompanyId, reloadCampaigns]);

  const deleteCampaign = useCallback(async (id: string) => {
    await api.deleteCampaign(id);
    await reloadCampaigns();
  }, [reloadCampaigns]);

  const markCampaignSent = useCallback(async (id: string, customerId: string) => {
    await api.markCampaignSent(id, customerId);
    await reloadCampaigns();
  }, [reloadCampaigns]);

  const createReminder = useCallback(async (data: { baslik: string; notu?: string; tarih: string }) => {
    if (!activeCompanyId) throw new Error('Aktif firma yok');
    const created: ManualReminderT = await api.createReminder({
      companyId: activeCompanyId,
      baslik: data.baslik || '',
      notu: data.notu || '',
      tarih: data.tarih,
    });
    await reloadReminders();
    return created;
  }, [activeCompanyId, reloadReminders]);

  const updateReminder = useCallback(async (id: string, data: Partial<{ baslik: string; notu: string; tarih: string; tamamlandi: boolean }>) => {
    await api.updateReminder(id, data);
    await reloadReminders();
  }, [reloadReminders]);

  const deleteReminder = useCallback(async (id: string) => {
    await api.deleteReminder(id);
    await reloadReminders();
  }, [reloadReminders]);

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
      kdvOrani: Number(quote.kdvOrani ?? 20),
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
    // Teklif onaylanınca (veya reddedilince) backend otomatik olarak Tahsilat
    // ve Kasa kayıtları oluşturuyor/güncelliyor. Sadece teklifleri yeniden
    // yüklemek bu ekranların state'ini bayat bırakıyordu — kullanıcı Tahsilat
    // sekmesine gidince manuel yenilemeden yeni girdiyi göremiyordu. Üçünü de
    // birlikte tazeleyerek her ekranın anında güncel görünmesini sağlıyoruz.
    await Promise.all([reloadQuotes(), reloadTahsilat(), reloadKasa()]);
  }, [reloadQuotes, reloadTahsilat, reloadKasa]);

  // Teklif verildikten sonra isteğe bağlı olarak girilen maliyet -- zorunlu
  // değil, girilirse teklif tutarından düşülerek kâr hesaplanır (history.tsx).
  const updateQuoteMaliyet = useCallback(async (id: string, maliyet: number | null) => {
    await api.updateQuoteMaliyet(id, maliyet);
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
      setCampaigns([]);
      setReminders([]);
      setQuotes([]);
      setKasa([]);
      setTahsilat([]);
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
    reloadCampaigns();
    reloadReminders();
    reloadQuotes();
    reloadKasa();
    reloadTahsilat();
  }, [user, activeCompanyId, reloadCatalog, reloadCustomers, reloadServices, reloadCampaigns, reloadReminders, reloadQuotes, reloadKasa, reloadTahsilat]);

  // Ekip Sohbeti: okunmamis mesaj sayacini periyodik yokla (15sn) -- sidebar/
  // drawer'daki 'Ekip Sohbeti' ogesini yanip sondurmek ve (sadece web'de)
  // WhatsApp Web tarzi bir tarayici bildirimi gostermek icin kullaniliyor.
  // Ekip Sohbeti ekrani zaten acikken bildirim gostermiyoruz (mesaj oradan
  // zaten goruluyor), ve ilk yuklemede eski okunmamislar icin bildirim
  // patlatmiyoruz -- sadece GERCEKTEN yeni gelen mesajlar icin.
  useEffect(() => {
    if (!user || !activeCompany) { setTeamUnreadTotal(0); return; }
    let cancelled = false;
    const companyId = activeCompany.id;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }

    const poll = async () => {
      try {
        const conv = await api.teamConversations(companyId, 'mine');
        if (cancelled) return;
        const total = (conv || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        setTeamUnreadTotal(total);

        const isOnTeamChat = pathname === '/team-chat';
        const canNotify =
          Platform.OS === 'web' &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted';

        for (const c of conv || []) {
          if (!c.otherUserId) continue;
          const key = `${c.otherUserId}:${c.lastAt}`;
          if (notifiedKeysRef.current.has(key)) continue;
          notifiedKeysRef.current.add(key);
          if (teamUnreadFirstLoadRef.current || isOnTeamChat || !c.unreadCount) continue;
          if (canNotify) {
            try {
              const n = new Notification(c.otherUserName || 'Yeni mesaj', {
                body: c.lastText,
                tag: 'team-chat-' + c.otherUserId,
              });
              n.onclick = () => { try { window.focus(); } catch {} };
            } catch {}
          }
        }
        teamUnreadFirstLoadRef.current = false;
      } catch {
        // sessizce yut -- bir sonraki pollde tekrar denenir
      }
    };

    poll();
    const t = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user, activeCompany, pathname]);

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
        kasa,
        reloadKasa,
        addKasaEntry,
        deleteKasaEntry,
        tahsilat,
        reloadTahsilat,
        addTahsilatEntry,
        deleteTahsilatEntry,
        customers,
        reloadCustomers,
        deleteCustomer,
        services,
        reloadServices,
        createService,
        updateService,
        updateServiceStatus,
        deleteService,
        campaigns,
        reloadCampaigns,
        createCampaign,
        deleteCampaign,
        markCampaignSent,
        reminders,
        reloadReminders,
        createReminder,
        updateReminder,
        deleteReminder,
        quotes,
        reloadQuotes,
        saveQuote,
        deleteQuote,
        updateQuoteStatus,
        updateQuoteMaliyet,
        toast,
        showToast,
        getQuoteAttachments,
        setQuoteAttachments,
        teamUnreadTotal,
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

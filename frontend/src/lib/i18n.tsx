import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '@/src/utils/storage';
import { useAuth } from '@/src/state/AuthContext';

// ============================================================================
// Uygulama genelinde çoklu dil (i18n) altyapısı.
//
// Bu dosya "kaynak" sözlüğü (translations) ve dili okuma/değiştirme için
// React context + hook'u içerir. Kapsam kademeli olarak genişletiliyor:
// önce en çok kullanılan alanlar (sol menü/alt bar, Panel, Teklif, Firma
// sayfasındaki dil menüsü) eklendi; diğer ekranlar sonraki adımlarda aynı
// `t('namespace.key')` deseniyle eklenecek.
//
// Kullanım:
//   const { t, lang, setLang } = useLanguage();
//   <Text>{t('nav.panel')}</Text>
//
// Dil, giriş yapmış kullanıcı için backend'de (User.language) saklanır --
// hangi cihazdan girerse girsin aynı dilde açılır. Giriş yapılmadan önceki
// ekranlarda (splash/login/register) yerel depoda (storage) tutulan son
// seçim kullanılır.
// ============================================================================

export type Lang = 'tr' | 'en' | 'it';

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
];

// Dile göre abonelik/ödeme para birimi -- İtalyanca kullanan (Avrupa) müşteri
// Euro, İngilizce kullanan (uluslararası/Amerika-UK) müşteri Dolar, Türkçe
// kullanan müşteri TL ile öder.
export function currencyForLang(lang: Lang): 'TRY' | 'USD' | 'EUR' {
  if (lang === 'it') return 'EUR';
  if (lang === 'en') return 'USD';
  return 'TRY';
}

type Dict = Record<string, Record<string, string>>;

// --- TÜRKÇE (kaynak metin -- diğer diller buradan çevrilir) ---------------
const tr: Dict = {
  common: {
    save: 'Kaydet',
    cancel: 'İptal',
    delete: 'Sil',
    edit: 'Düzenle',
    add: 'Ekle',
    search: 'Ara',
    loading: 'Yükleniyor...',
    yes: 'Evet',
    no: 'Hayır',
    close: 'Kapat',
    back: 'Geri',
    confirm: 'Onayla',
    saved: 'Kaydedildi',
    error: 'Hata',
  },
  nav: {
    panel: 'Panel',
    teklif: 'Teklif',
    katalog: 'Katalog',
    gecmis: 'Geçmiş',
    musteri: 'Müşteri',
    servis: 'Servis',
    kampanya: 'Kampanya',
    musteriAvcisi: 'Müşteri Avcısı',
    hatirlatmalar: 'Hatırlatmalar',
    takvim: 'Takvim',
    kasa: 'Kasa',
    tahsilat: 'Tahsilat',
    firma: 'Firma',
    ekipSohbeti: 'Ekip Sohbeti',
    personel: 'Personel',
    hediyeKodu: 'Hediye Kodu',
    cikisYap: 'Çıkış Yap',
    cikisSorusu: 'Çıkış yapmak istediğinize emin misiniz?',
  },
  firma: {
    dilBaslik: 'Uygulama Dili',
    dilAciklama: 'Uygulamayı kullanmak istediğin dili seç.',
    dilDegisti: 'Uygulama dili güncellendi',
  },
};

// --- İNGİLİZCE ---------------------------------------------------------
const en: Dict = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    loading: 'Loading...',
    yes: 'Yes',
    no: 'No',
    close: 'Close',
    back: 'Back',
    confirm: 'Confirm',
    saved: 'Saved',
    error: 'Error',
  },
  nav: {
    panel: 'Dashboard',
    teklif: 'Quote',
    katalog: 'Catalog',
    gecmis: 'History',
    musteri: 'Customers',
    servis: 'Service',
    kampanya: 'Campaign',
    musteriAvcisi: 'Lead Hunter',
    hatirlatmalar: 'Reminders',
    takvim: 'Calendar',
    kasa: 'Cash Register',
    tahsilat: 'Collections',
    firma: 'Company',
    ekipSohbeti: 'Team Chat',
    personel: 'Staff',
    hediyeKodu: 'Gift Code',
    cikisYap: 'Log Out',
    cikisSorusu: 'Are you sure you want to log out?',
  },
  firma: {
    dilBaslik: 'App Language',
    dilAciklama: 'Choose the language you want to use the app in.',
    dilDegisti: 'App language updated',
  },
};

// --- İTALYANCA -----------------------------------------------------------
const it: Dict = {
  common: {
    save: 'Salva',
    cancel: 'Annulla',
    delete: 'Elimina',
    edit: 'Modifica',
    add: 'Aggiungi',
    search: 'Cerca',
    loading: 'Caricamento...',
    yes: 'Sì',
    no: 'No',
    close: 'Chiudi',
    back: 'Indietro',
    confirm: 'Conferma',
    saved: 'Salvato',
    error: 'Errore',
  },
  nav: {
    panel: 'Pannello',
    teklif: 'Preventivo',
    katalog: 'Catalogo',
    gecmis: 'Cronologia',
    musteri: 'Clienti',
    servis: 'Assistenza',
    kampanya: 'Campagna',
    musteriAvcisi: 'Ricerca Clienti',
    hatirlatmalar: 'Promemoria',
    takvim: 'Calendario',
    kasa: 'Cassa',
    tahsilat: 'Incassi',
    firma: 'Azienda',
    ekipSohbeti: 'Chat Team',
    personel: 'Personale',
    hediyeKodu: 'Codice Regalo',
    cikisYap: 'Esci',
    cikisSorusu: 'Sei sicuro di voler uscire?',
  },
  firma: {
    dilBaslik: 'Lingua App',
    dilAciklama: "Scegli la lingua in cui vuoi usare l'app.",
    dilDegisti: 'Lingua aggiornata',
  },
};

const DICTS: Record<Lang, Dict> = { tr, en, it };

const STORAGE_KEY = 'app_language';

type LanguageState = {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [lang, setLangState] = useState<Lang>('tr');

  // Açılışta: giriş yapılmışsa kullanıcının kayıtlı dili, yoksa cihazda
  // önceden seçilmiş dil (login/register ekranları için) kullanılır.
  useEffect(() => {
    if (user?.language) {
      setLangState(user.language as Lang);
      return;
    }
    storage.getItem<string>(STORAGE_KEY, 'tr').then((v) => {
      if (v === 'en' || v === 'it' || v === 'tr') setLangState(v);
    });
  }, [user?.language]);

  const setLang = useCallback(async (next: Lang) => {
    setLangState(next); // anında yansısın diye önce local state
    await storage.setItem(STORAGE_KEY, next);
    if (user) {
      try {
        await updateUser({ language: next } as any);
      } catch {
        // Sunucuya yazılamasa bile ekran anında güncellendi; bir sonraki
        // profil senkronizasyonunda tekrar denenecek.
      }
    }
  }, [user, updateUser]);

  const t = useCallback((key: string): string => {
    const [ns, k] = key.split('.');
    const dict = DICTS[lang];
    return dict?.[ns]?.[k] ?? DICTS.tr?.[ns]?.[k] ?? key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

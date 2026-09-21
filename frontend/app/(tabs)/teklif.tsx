import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { QuoteItemT, QuoteT, QuoteEkT, SystemTypeDefT } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';
import { buildItemDescription, buildQuoteFileName, buildTeklifNo, countQuotesToday, parseNoteSegments, toggleNoteEmphasis } from '@/src/lib/quote-utils';
import { loadPriceMemory, savePriceMemory, normalizeItemName } from '@/src/lib/itemPricePrefs';
import { saveQuoteDraft, loadQuoteDraft, clearQuoteDraft, QuoteDraft } from '@/src/lib/quoteDraft';
import { loadQuoteDefaults, saveQuoteDefault, QuoteDefaultsT } from '@/src/lib/quoteDefaults';
import { shareQuoteViaWhatsApp } from '@/src/lib/whatsapp';
import { AttachmentT, mergeAttachmentsIntoPdf } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage, statusLabel, upper } from '@/src/lib/i18n';
import { BorderBeam, BubbleButton, ChoiceChip, CountUp, IconBadge, MotionInput, MotionScrollView, Reveal, SheetEmpty, SheetModal, SheetPick, SheetRow, alpha, readableOn, themedStyles, useViewportProgress } from '@/src/components/motion';
import Reanimated, { useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';

const WA_GREEN = '#25D366'; // WhatsApp marka yesili

function todayIso() { return new Date().toISOString().split('T')[0]; }
function plusDaysIso(days: number) { return new Date(Date.now() + days * 86400000).toISOString().split('T')[0]; }
function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}
function newItemId() { return 'it-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

const SHARE_MESSAGE = 'Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz.';

// Teklif durumu rozeti için renk haritası -- Panel sayfasındaki (index.tsx)
// Teklif Durumları grafiğiyle aynı renkler kullanılır (görsel tutarlılık).
const DURUM_COLORS: Record<string, string> = {
  Beklemede: theme.colors.textMuted,
  Görüldü: theme.colors.gold,
  Onaylandı: theme.colors.green,
  Reddedildi: theme.colors.red,
};

export default function EditorScreen() {
  const { t, lang } = useLanguage();
  const { activeCompany, catalog, customers, quotes, saveQuote, showToast, loading, setQuoteAttachments, updateCompany, editRequests, requestQuoteEditApproval, reloadEditRequests, pendingNewQuoteAttachments, clearPendingNewQuoteAttachments, pendingAlbertGenauItems, clearPendingAlbertGenauItems } = useApp();
  const { user } = useAuth();
  const [savingDefaultNotes, setSavingDefaultNotes] = useState(false);
  const saveNotesAsDefault = async () => {
    if (!activeCompany) return;
    setSavingDefaultNotes(true);
    try {
      await updateCompany(activeCompany.id, { ...activeCompany, ozelNotlar: notlar });
      showToast(t('teklifPage.s007'));
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || 'Kaydedilemedi'));
    } finally {
      setSavingDefaultNotes(false);
    }
  };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ quoteId?: string; duplicateFrom?: string }>();

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  // Yalnızca ekranda küçük durum rozeti göstermek için -- kaydetme akışını
  // (currentQuote/saveQuote) ETKİLEMEZ, mevcut davranış korunur.
  const [durum, setDurum] = useState<string>('Beklemede');
  const [teklifNo, setTeklifNo] = useState(() => buildTeklifNo(countQuotesToday(quotes) + 1));
  const [tarih, setTarih] = useState(todayIso());
  const [gecerlilik, setGecerlilik] = useState(plusDaysIso(7));
  const [hazirlayanEmail, setHazirlayanEmail] = useState('');
  const [musFirma, setMusFirma] = useState('');
  const [musYetkili, setMusYetkili] = useState('');
  const [musTelefon, setMusTelefon] = useState('');
  const [musEmail, setMusEmail] = useState('');
  const [musAdres, setMusAdres] = useState('');
  const [projeAdi, setProjeAdi] = useState('');
  const [nakliye, setNakliye] = useState('EXW');
  const [paraBirimi, setParaBirimi] = useState('USD');
  const [odemeSekli, setOdemeSekli] = useState(t('teklifPage.s008'));
  const [mensei, setMensei] = useState(t('teklifPage.s009'));
  const [teslimGun, setTeslimGun] = useState(t('teklifPage.s010'));
  const [iskonto, setIskonto] = useState('0');
  const [kdvOrani, setKdvOrani] = useState('20');
  const [notlar, setNotlar] = useState('');
  const notlarSelRef = useRef({ start: 0, end: 0 });
  const [notlarForcedSel, setNotlarForcedSel] = useState<{ start: number; end: number } | undefined>(undefined);
  const applyNoteEmphasis = () => {
    const { start, end } = notlarSelRef.current;
    const result = toggleNoteEmphasis(notlar, start, end);
    setNotlar(result.text);
    notlarSelRef.current = { start: result.start, end: result.end };
    setNotlarForcedSel({ start: result.start, end: result.end });
    setTimeout(() => setNotlarForcedSel(undefined), 0);
  };
  const [items, setItems] = useState<QuoteItemT[]>([]);
  // Kalem kartları için accordion durumu -- her an sadece TEK kart açık
  // olur; yeni bir kalem eklendiğinde önceki kartlar otomatik olarak
  // daralır, sayfa çok kalemli tekliflerde uzamaz. Bir kart tıklanınca
  // açılır ve o an açık olan diğer kart otomatik kapanır.
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  // Silinirken kısa bir kaybolma animasyonu oynatılacak kalem id'leri.
  const [leavingItemIds, setLeavingItemIds] = useState<Set<string>>(new Set());
  const [ekler, setEkler] = useState<QuoteEkT[]>([]);
  // Local-only attached files (PDF/Word/Image) merged into the outgoing PDF at share time.
  const [attachments, setAttachments] = useState<AttachmentT[]>([]);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showModeSheet, setShowModeSheet] = useState(false);
  const [showSystemPicker, setShowSystemPicker] = useState<string | null>(null); // itemId
  const [showSelectPicker, setShowSelectPicker] = useState<{ itemId: string; fieldId: string; options: string[]; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showFirmaSuggestions, setShowFirmaSuggestions] = useState(false);
  const bootedRef = useRef<string | null>(null);
  // Varsayilanlari yalnizca YENI teklifte uygulamak icin editingId'nin
  // bagimlilik yaratmayan aynasi.
  const editingIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  // Geçmiş'ten "Kopyala" ile gelindiğinde aynı duplicateFrom id'sinin
  // formu tekrar tekrar sıfırlamasını önlemek için (kullanıcı formu
  // düzenlemeye başladıktan sonra da param URL'de kalmaya devam eder).
  const duplicatedRef = useRef<string | null>(null);
  // Manuel/Genel kalemlerde daha önce girilmiş ürün adı -> fiyat
  // eşleşmeleri (cihazda, firma bazlı kalıcı). Ref kullanıyoruz çünkü
  // sadece updateItem içinde okunup yazılıyor, ekranda ayrıca gösterilmiyor.
  const priceMemoryRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!activeCompany?.id) { priceMemoryRef.current = {}; return; }
    loadPriceMemory(activeCompany.id).then((m) => { priceMemoryRef.current = m; });
  }, [activeCompany?.id]);
  // Tracks whether the person has hand-edited the Teklif No field — once
  // they have, the auto-numbering effect below stops overwriting it.
  const teklifNoManualRef = useRef(false);

  // Taslak otomatik kaydetme (madde #333): internet kopması/uygulamanın
  // beklenmedik kapanması durumunda henüz kaydedilmemiş yeni bir teklifin
  // içeriği kaybolmasın diye, form her değiştiğinde cihazda saklanır.
  // Sadece editingId BOŞKEN (henüz sunucuya kaydedilmemiş teklif) çalışır --
  // var olan bir teklifi düzenlerken veri zaten sunucudadır, üzerine
  // taslak karışması riski almamak için o durumda devre dışı bırakılır.
  const [draftBanner, setDraftBanner] = useState<QuoteDraft | null>(null);
  const draftCheckedRef = useRef(false);

  // Live "Firma Adı" autocomplete — suggests previously saved customers as the
  // user types, so name/phone/e-mail/address can be filled with one tap
  // instead of retyping them for a returning customer.
  const firmaSuggestions = useMemo(() => {
    const q = musFirma.trim().toLowerCase();
    // Empty query (field just focused/tapped, nothing typed yet) -> show the
    // saved customer list itself so tapping the field alone is enough to pick
    // one, instead of requiring the person to start typing first.
    if (!q) return customers.slice(0, 8);
    return customers.filter((c) => c.firma.toLowerCase().includes(q)).slice(0, 8);
  }, [musFirma, customers]);

  useEffect(() => {
    if (params.quoteId && bootedRef.current !== params.quoteId) {
      const q = quotes.find((qq) => qq.id === params.quoteId);
      if (q) { loadFromQuote(q); bootedRef.current = params.quoteId; }
    }
  }, [params.quoteId, quotes]);

  // Teklif sahiplik/onay sistemi: bu tekliften başka biri sorumluysa
  // (createdByUserId dolu ve bana ait değilse) düzenlemeden önce ondan onay
  // istenmesi gerekir -- bkz. backend update_quote. Sadece görüntüleyip
  // PDF/WhatsApp paylaşmak (içerikte değişiklik yapmadan) her zaman serbest.
  const editingQuote = useMemo(() => quotes.find((q) => q.id === editingId), [quotes, editingId]);
  const isQuoteOwner = !editingQuote?.createdByUserId || editingQuote.createdByUserId === user?.user_id;
  const myEditRequest = useMemo(
    () => editRequests.find((r) => r.quoteId === editingId && r.requestedByUserId === user?.user_id),
    [editRequests, editingId, user?.user_id]
  );
  const [requestingApproval, setRequestingApproval] = useState(false);
  const handleRequestEditApproval = async () => {
    if (!editingId || requestingApproval) return;
    setRequestingApproval(true);
    try {
      await requestQuoteEditApproval(editingId);
      showToast(t('teklifPage.s107'));
    } catch (e: any) {
      showToast(t('teklifPage.s017') + (e?.message || ''));
    } finally {
      setRequestingApproval(false);
    }
  };

  // Geçmiş ekranındaki "Kopyala" butonuyla gelindiğinde: seçilen teklifin
  // tüm bilgilerini forma doldur ama editingId'yi BOŞ bırak (loadFromQuote'tan
  // farkı budur) -- böylece Kaydet, orijinal tekliften bağımsız TAMAMEN YENİ
  // bir kayıt oluşturur, üzerine yazmaz.
  useEffect(() => {
    if (params.duplicateFrom && duplicatedRef.current !== params.duplicateFrom) {
      const q = quotes.find((qq) => qq.id === params.duplicateFrom);
      if (q) { loadFromQuoteAsCopy(q); duplicatedRef.current = params.duplicateFrom; }
    }
  }, [params.duplicateFrom, quotes]);

  // Albert Genau hesaplama ekranından "Teklife Ekle" ile dönüldüğünde: kalem
  // artık route param değil, AppContext'teki bekleme alanından okunuyor (bkz.
  // AppContext.tsx pendingAlbertGenauItems) -- böylece albert-genau.tsx
  // router.back() ile AYNI Teklif ekranı örneğine dönebiliyor, yeni bir kopya
  // açıp geri tuşunu bozmuyor (bkz. o dosyadaki onAddToQuote yorum notu).
  useEffect(() => {
    if (pendingAlbertGenauItems.length === 0) return;
    setItems((prev) => {
      let next = prev;
      let lastId = '';
      for (const data of pendingAlbertGenauItems) {
        const it = {
          ...makeItem('general'),
          urunAdi: data.urunAdi || 'Albert Genau',
          birim: 'Adet',
          birimFiyat: Number(data.birimFiyat) || 0,
          aciklama: data.aciklama || '',
          // Kar HARİÇ maliyet kırılımı -- Geçmiş'teki "Maliyet Ekle" alanını
          // otomatik doldurmak için (bkz. history.tsx), kalemle birlikte saklanır.
          agMaliyet: data.agMaliyet ?? null,
          agMontajBedeli: data.agMontajBedeli ?? null,
          agImalatBedeli: data.agImalatBedeli ?? null,
        };
        next = [...next, it];
        lastId = it.id;
      }
      if (lastId) setExpandedItemId(lastId);
      return next;
    });
    clearPendingAlbertGenauItems();
    showToast('Albert Genau kalemi eklendi');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAlbertGenauItems]);

  // Albert Genau ekranında "Teknik Çizim Ekle" ile hazırlanan otomatik çizim
  // (henüz kaydedilmemiş bu teklife eklenmek üzere AppContext'te bekliyor) --
  // buraya dönüldüğünde yerel `attachments` listesine katılır ve bekleme
  // alanı temizlenir (bkz. src/state/AppContext.tsx pendingNewQuoteAttachments).
  useEffect(() => {
    if (pendingNewQuoteAttachments.length === 0) return;
    setAttachments((prev) => [...prev, ...pendingNewQuoteAttachments]);
    clearPendingNewQuoteAttachments();
    showToast('Teknik çizim eklere eklendi');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewQuoteAttachments]);

  // `quotes` loads asynchronously (after `loading` already flips to false),
  // so the initial Teklif No may be numbered before today's quotes were
  // actually counted. Keep it in sync with `quotes` for a brand new,
  // untouched quote — stop the moment the person edits it by hand.
  useEffect(() => {
    if (!params.quoteId && !editingId && !teklifNoManualRef.current) {
      setTeklifNo(buildTeklifNo(countQuotesToday(quotes) + 1));
    }
  }, [quotes, params.quoteId, editingId]);

  const loadFromQuote = (q: QuoteT) => {
    setEditingId(q.id); setTeklifNo(q.teklifNo); setTarih(q.tarih); setGecerlilik(q.gecerlilik);
    setHazirlayanEmail(q.hazirlayanEmail); setMusFirma(q.musFirma); setMusYetkili(q.musYetkili);
    setMusTelefon(q.musTelefon); setMusEmail(q.musEmail); setMusAdres(q.musAdres); setProjeAdi(q.projeAdi);
    setNakliye(q.nakliye); setParaBirimi(q.paraBirimi); setOdemeSekli(q.odemeSekli); setMensei(q.mensei);
    setTeslimGun(q.teslimGun); setIskonto(String(q.iskonto)); setKdvOrani(String(q.kdvOrani));
    setNotlar(q.notlar); setItems(q.items); setEkler(q.ekler || []); setAttachments([]); setExpandedItemId(null);
    setDurum(q.durum || 'Beklemede'); setLeavingItemIds(new Set());
  };

  // "Kopyala" (Geçmiş ekranı) -- loadFromQuote ile aynı alanları doldurur,
  // ama editingId'yi BOŞ bırakır ve teklif no/tarih/geçerlilik/durumu
  // sıfırdan üretir; böylece Kaydet orijinal tekliften bağımsız yepyeni bir
  // kayıt oluşturur, üzerine yazmaz. Kalemler de yeni id'lerle kopyalanır.
  const loadFromQuoteAsCopy = (q: QuoteT) => {
    setEditingId(undefined);
    setTeklifNo(buildTeklifNo(countQuotesToday(quotes) + 1));
    setTarih(todayIso()); setGecerlilik(plusDaysIso(7));
    setHazirlayanEmail(q.hazirlayanEmail || user?.email || ''); setMusFirma(q.musFirma); setMusYetkili(q.musYetkili);
    setMusTelefon(q.musTelefon); setMusEmail(q.musEmail); setMusAdres(q.musAdres); setProjeAdi(q.projeAdi);
    setNakliye(q.nakliye); setParaBirimi(q.paraBirimi); setOdemeSekli(q.odemeSekli); setMensei(q.mensei);
    setTeslimGun(q.teslimGun); setIskonto(String(q.iskonto)); setKdvOrani(String(q.kdvOrani));
    setNotlar(q.notlar);
    setItems((q.items || []).map((it) => ({ ...it, id: newItemId() })));
    setEkler(q.ekler || []); setAttachments([]); setExpandedItemId(null);
    setDurum('Beklemede'); setLeavingItemIds(new Set());
    teklifNoManualRef.current = false;
    showToast(t('history.s045'));
  };

  // Firmanin kayitli teklif varsayilanlari (odeme sekli, mensei, teslim,
  // para birimi, nakliye). Sabit metin yerine kullanicinin kendi sartlari
  // ile aciliyor; bkz. src/lib/quoteDefaults.ts
  const quoteDefaultsRef = useRef<QuoteDefaultsT>({});
  useEffect(() => {
    const cid = activeCompany?.id;
    if (!cid) return;
    let cancelled = false;
    loadQuoteDefaults(cid).then((d) => {
      if (cancelled) return;
      quoteDefaultsRef.current = d;
      // Yalnizca yeni (kaydedilmemis) teklifte uygula -- acik bir teklifi
      // duzenlerken onun kendi degerleri korunmali.
      if (editingIdRef.current) return;
      if (d.odemeSekli) setOdemeSekli(d.odemeSekli);
      if (d.mensei) setMensei(d.mensei);
      if (d.teslimGun) setTeslimGun(d.teslimGun);
      if (d.paraBirimi) setParaBirimi(d.paraBirimi);
      if (d.nakliye) setNakliye(d.nakliye);
    });
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  // Kullanici alani doldurup odaktan cikinca girdigi deger bu firmanin
  // varsayilani olur -- bir sonraki teklifte tekrar yazmak gerekmez.
  const rememberDefault = useCallback((field: keyof QuoteDefaultsT, value: string) => {
    const cid = activeCompany?.id;
    if (!cid) return;
    const v = (value || '').trim();
    if (!v) return;
    quoteDefaultsRef.current = { ...quoteDefaultsRef.current, [field]: v };
    saveQuoteDefault(cid, field, v);
  }, [activeCompany?.id]);

  const resetForm = useCallback(() => {
    setEditingId(undefined); setTeklifNo(buildTeklifNo(countQuotesToday(quotes) + 1)); setTarih(todayIso()); setGecerlilik(plusDaysIso(7));
    setHazirlayanEmail(user?.email || ''); setMusFirma(''); setMusYetkili('');
    setMusTelefon(''); setMusEmail(''); setMusAdres(''); setProjeAdi(''); setIskonto('0'); setKdvOrani('20');
    setNotlar(activeCompany?.ozelNotlar || ''); setItems([]); setEkler([]); setAttachments([]); setExpandedItemId(null); bootedRef.current = null;
    setDurum('Beklemede'); setLeavingItemIds(new Set());
    teklifNoManualRef.current = false;
    // Firma varsayilanlari "Temizle"den sonra da korunur.
    const d = quoteDefaultsRef.current;
    setOdemeSekli(d.odemeSekli || t('teklifPage.s008'));
    setMensei(d.mensei || t('teklifPage.s009'));
    setTeslimGun(d.teslimGun || t('teklifPage.s010'));
    setParaBirimi(d.paraBirimi || 'USD');
    setNakliye(d.nakliye || 'EXW');
    if (activeCompany?.id) clearQuoteDraft(activeCompany.id);
    setDraftBanner(null);
  }, [activeCompany, quotes, user, t]);

  const pickAttachments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const picked = res.assets || [];
      const wordCount = picked.filter((a) => /\.(docx?|)$/i.test(a.name) && (a.mimeType || '').includes('word')).length;
      if (wordCount > 0) showToast(t('teklifPage.s011'));
      const additions: AttachmentT[] = picked
        .filter((a) => {
          const m = (a.mimeType || '').toLowerCase();
          return m === 'application/pdf' || m.startsWith('image/') || /\.(pdf|png|jpe?g)$/i.test(a.name);
        })
        .map((a) => ({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: a.name || 'dosya',
          uri: a.uri,
          mime: a.mimeType || 'application/octet-stream',
          size: (a as any).size,
        }));
      if (additions.length === 0 && wordCount === 0) {
        showToast(t('teklifPage.s012')); return;
      }
      setAttachments((prev) => [...prev, ...additions]);
      if (additions.length > 0) showToast(`${additions.length} dosya eklendi`);
    } catch (e: any) {
      showToast(t('teklifPage.s013') + (e?.message || ''));
    }
  };

  useEffect(() => {
    if (!editingId && !notlar && activeCompany?.ozelNotlar) setNotlar(activeCompany.ozelNotlar);
  }, [activeCompany, editingId, notlar]);

  // Sayfa ilk açıldığında (yeni teklif akışında, Geçmiş'ten gelinmemişse)
  // cihazda kaydedilmiş bir taslak var mı diye bak -- varsa kullanıcıya
  // geri yükleme banner'ı göster. Bir kez kontrol edilir.
  useEffect(() => {
    if (draftCheckedRef.current) return;
    if (!activeCompany?.id) return;
    if (params.quoteId || params.duplicateFrom) { draftCheckedRef.current = true; return; }
    draftCheckedRef.current = true;
    loadQuoteDraft(activeCompany.id).then((draft) => {
      if (draft && ((draft.musFirma && String(draft.musFirma).trim()) || (Array.isArray(draft.items) && draft.items.length > 0))) {
        setDraftBanner(draft);
      }
    });
  }, [activeCompany?.id, params.quoteId, params.duplicateFrom]);

  // Form her değiştiğinde (debounce ile) taslağı sakla -- sadece henüz
  // sunucuya kaydedilmemiş (editingId boş) bir teklif için. Var olan bir
  // teklif düzenlenirken taslak karışmasın diye devre dışı.
  useEffect(() => {
    if (!activeCompany?.id || editingId) return;
    const hasContent = !!musFirma.trim() || items.length > 0 || !!notlar.trim() || !!musTelefon.trim();
    if (!hasContent) return;
    const timer = setTimeout(() => {
      saveQuoteDraft(activeCompany.id, currentQuote());
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCompany?.id, editingId, teklifNo, tarih, gecerlilik, musFirma, musYetkili, musTelefon,
    musEmail, musAdres, projeAdi, nakliye, paraBirimi, odemeSekli, mensei, teslimGun, iskonto,
    kdvOrani, notlar, items,
  ]);

  const applyDraft = (d: QuoteDraft) => {
    setTeklifNo(d.teklifNo || teklifNo); setTarih(d.tarih || tarih); setGecerlilik(d.gecerlilik || gecerlilik);
    setHazirlayanEmail(d.hazirlayanEmail || ''); setMusFirma(d.musFirma || ''); setMusYetkili(d.musYetkili || '');
    setMusTelefon(d.musTelefon || ''); setMusEmail(d.musEmail || ''); setMusAdres(d.musAdres || '');
    setProjeAdi(d.projeAdi || ''); setNakliye(d.nakliye || 'EXW'); setParaBirimi(d.paraBirimi || 'USD');
    setOdemeSekli(d.odemeSekli || odemeSekli); setMensei(d.mensei || mensei); setTeslimGun(d.teslimGun || teslimGun);
    setIskonto(String(d.iskonto ?? '0')); setKdvOrani(String(d.kdvOrani ?? '20'));
    setNotlar(d.notlar || ''); setItems(Array.isArray(d.items) ? d.items : []);
    teklifNoManualRef.current = true;
    setDraftBanner(null);
    showToast('Taslak geri yüklendi');
  };

  const discardDraft = () => {
    if (activeCompany?.id) clearQuoteDraft(activeCompany.id);
    setDraftBanner(null);
  };

  const subtotal = useMemo(() => items.reduce((a, it) => a + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0), [items]);
  const iskontoOr = Number(iskonto.replace(',', '.')) || 0;
  const kdvOr = Number(kdvOrani.replace(',', '.')) || 0;
  const iskontoTutar = (subtotal * iskontoOr) / 100;
  const araToplam = subtotal - iskontoTutar;
  const kdvTutar = (araToplam * kdvOr) / 100;
  const genelToplam = araToplam + kdvTutar;

  const currentQuote = (): Partial<QuoteT> => ({
    teklifNo, tarih, gecerlilik, hazirlayanEmail, musFirma, musYetkili, musTelefon, musEmail, musAdres,
    projeAdi, nakliye, paraBirimi, odemeSekli, mensei, teslimGun,
    iskonto: iskontoOr, kdvOrani: kdvOr, notlar, items, ekler, durum: 'Beklemede',
  });

  const updateItem = (id: string, patch: Partial<QuoteItemT>) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const merged: QuoteItemT = { ...it, ...patch };
      // Sadece Manuel/Genel modda: ürün adına göre fiyat hatırlama.
      if (merged.mode === 'manual' || merged.mode === 'general') {
        // İsim değişti ve fiyat henüz girilmemişse (0/boş), daha önce bu
        // isimle kaydedilmiş fiyat varsa otomatik doldur -- kullanıcı
        // isterse üzerine yazıp değiştirebilir ya da hiç dokunmayıp kendi
        // manuel girebilir.
        if (patch.urunAdi !== undefined && !it.birimFiyat) {
          const key = normalizeItemName(merged.urunAdi);
          const remembered = key ? priceMemoryRef.current[key] : undefined;
          if (remembered != null) merged.birimFiyat = remembered;
        }
        // Fiyat girildiyse ve bir ürün adı varsa, bir sonraki sefer
        // hatırlanmak üzere kaydet.
        if (patch.birimFiyat !== undefined && merged.urunAdi && merged.birimFiyat) {
          const key = normalizeItemName(merged.urunAdi);
          if (key && priceMemoryRef.current[key] !== merged.birimFiyat) {
            priceMemoryRef.current = { ...priceMemoryRef.current, [key]: merged.birimFiyat };
            if (activeCompany?.id) savePriceMemory(activeCompany.id, priceMemoryRef.current);
          }
        }
      }
      return merged;
    }));
  };
  // Silme işlemi önce kısa bir kaybolma animasyonu oynatır (leavingItemIds),
  // animasyon bitince kalem gerçekten listeden kaldırılır.
  const removeItem = (id: string) => {
    setLeavingItemIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      setLeavingItemIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }, 190);
  };

  // Bir kalemi aynen kopyalar; kopya, orijinalin hemen altına eklenir ve
  // otomatik olarak açılır (diğer kartlar #221 kuralı gereği daralır).
  const duplicateItem = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1) return prev;
      const copy: QuoteItemT = { ...prev[idx], id: newItemId() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      setExpandedItemId(copy.id);
      return next;
    });
    showToast('Kalem kopyalandı');
  };

  // Kalemi listede bir yukarı ya da bir aşağı taşır (sıralama düzenleme).
  const moveItem = (id: string, direction: 'up' | 'down') => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const makeItem = (mode: 'technical' | 'manual' | 'general'): QuoteItemT => ({
    id: newItemId(), mode, urunAdi: '', sistemTipiId: '', sistemTipi: '',
    sistemFields: [], customFields: [], aciklama: '', adet: 1, birim: 'Adet', birimFiyat: 0,
  });

  const addItem = (mode: 'technical' | 'manual' | 'general') => {
    const it = makeItem(mode);
    setItems((prev) => [...prev, it]);
    setExpandedItemId(it.id);
    setShowModeSheet(false);
  };

  const addFromCatalog = (catId: string) => {
    const c = catalog.find((x) => x.id === catId); if (!c) return;
    const it = { ...makeItem('general'), urunAdi: c.urunAdi, birim: c.birim, birimFiyat: c.birimFiyat, aciklama: c.aciklama };
    setItems((prev) => [...prev, it]);
    setExpandedItemId(it.id);
    setShowCatalogPicker(false); showToast('Kalem eklendi');
  };

  const fillFromCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id); if (!c) return;
    setMusFirma(c.firma); setMusYetkili(c.yetkili); setMusTelefon(c.telefon); setMusEmail(c.email); setMusAdres(c.adres);
    setShowCustomerPicker(false); setShowFirmaSuggestions(false); showToast(t('teklifPage.s014'));
  };

  const selectSystemType = (itemId: string, sys: SystemTypeDefT) => {
    // Ürün/hizmet değiştirilince (örn. "Pistonlu Bioklimatik Pergola" ->
    // "Makaslı Bioklimatik Pergola") alanlar SIFIRDAN değil, önceki kalemin
    // girdilerinden devam ettirilir -- yeni sistemde AYNI etiketle (örn.
    // "CEPHE / GENİŞLİK") bir alan varsa değeri korunur, sadece yeni sistemde
    // hiç olmayan alanlar düşer. İki sistemin alan kümesi tamamen farklıysa
    // (örn. Zip Perde) doğal olarak hiçbir alan eşleşmez ve hepsi boş başlar
    // -- bu da mevcut davranışla aynı, veri kaybı sadece gerçekten alakasız
    // alanlar için olur.
    const it = items.find((x) => x.id === itemId);
    const prevByLabel = new Map((it?.sistemFields || []).map((f) => [f.label.trim().toLocaleLowerCase('tr'), f.value]));
    const initFields = (sys.fields || []).map((f) => {
      const prevValue = prevByLabel.get(f.label.trim().toLocaleLowerCase('tr'));
      return { label: f.label, value: prevValue !== undefined ? prevValue : '' };
    });
    updateItem(itemId, { sistemTipiId: sys.id, sistemTipi: sys.name, sistemFields: initFields });
    setShowSystemPicker(null);
  };

  const updateSystemFieldValue = (itemId: string, fieldIndex: number, value: string) => {
    const it = items.find((x) => x.id === itemId); if (!it) return;
    const next = [...(it.sistemFields || [])];
    next[fieldIndex] = { ...next[fieldIndex], value };
    updateItem(itemId, { sistemFields: next });
  };

  const handleSave = async (): Promise<QuoteT | null> => {
    if (!activeCompany) return null;
    if (!musFirma.trim()) { showToast(t('teklifPage.s015')); return null; }
    setSaving(true);
    try {
      const saved = await saveQuote(currentQuote(), editingId);
      setEditingId(saved.id);
      // Keep the currently-picked local attachments available to Preview/History
      // for this quote, so they can also include them when generating a PDF.
      setQuoteAttachments(saved.id, attachments);
      // Artık sunucuda güvenli şekilde kayıtlı -- cihazdaki taslağa gerek kalmadı.
      if (activeCompany?.id) clearQuoteDraft(activeCompany.id);
      showToast('Teklif kaydedildi');
      reloadEditRequests();
      return saved;
    } catch (e: any) {
      if (e?.status === 402) {
        showToast(t('teklifPage.s016'));
        router.push('/subscription');
        return null;
      }
      showToast(t('teklifPage.s017') + (e?.message || ''));
      return null;
    }
    finally { setSaving(false); }
  };

  const generatePdfUri = async (savedQuote: QuoteT): Promise<{ uri: string; fileName: string }> => {
    if (!activeCompany) throw new Error('Aktif firma yok');
    const html = buildQuotePdfHtml(activeCompany, savedQuote);
    const desiredName = buildQuoteFileName(new Date()) + '.pdf';
    let baseUri: string;
    if (Platform.OS === 'web') {
      // expo-print's printToFileAsync is just window.print() on web (ignores
      // our html and opens the browser's print dialog) — render a real PDF
      // client-side instead.
      baseUri = await htmlToPdfObjectUrlWeb(html);
    } else {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      try {
        const dirIdx = uri.lastIndexOf('/');
        const newUri = uri.substring(0, dirIdx + 1) + desiredName;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        baseUri = newUri;
      } catch { baseUri = uri; }
    }
    // Merge any user-picked PDF/image attachments at the end of the generated PDF.
    if (attachments.length > 0) {
      try {
        const merged = await mergeAttachmentsIntoPdf(baseUri, attachments);
        return { uri: merged, fileName: desiredName };
      } catch (e) {
        // On failure, fall back to the base PDF without attachments.
        return { uri: baseUri, fileName: desiredName };
      }
    }
    return { uri: baseUri, fileName: desiredName };
  };

  const handleShare = async () => {
    const saved = await handleSave(); if (!saved) return;
    try {
      const { uri, fileName } = await generatePdfUri(saved);
      // Web: blob: PDFs aren't a valid navigator.share() target (throws
      // "Invalid URL" even though Sharing.isAvailableAsync() reports true) —
      // always go straight to a real download there.
      if (Platform.OS === 'web') {
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: SHARE_MESSAGE, UTI: 'com.adobe.pdf' });
      } else {
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast(t('teklifPage.s018') + (e?.message || '')); }
  };

  // Direct WhatsApp: open the customer's chat pre-filled, then trigger the share sheet
  // so the user can attach the PDF into that same chat with one tap.
  //
  // `waSharing` covers the ENTIRE flow (save + PDF generation + WhatsApp
  // hand-off), not just the save step. Before this, only `saving` (from
  // handleSave) disabled the button — the moment the save finished, the
  // button re-enabled itself while PDF generation/WhatsApp hand-off kept
  // running silently in the background with zero visual feedback. On a slow
  // connection (PDF library CDN fetch, etc.) that looked exactly like the
  // reported "ekranda takılıp kalıyor" bug: nothing visibly happens, so the
  // person taps again (sometimes several times), stacking up duplicate
  // PDF generations/popup windows.
  const [waSharing, setWaSharing] = useState(false);
  const handleWhatsAppShare = async () => {
    if (waSharing) return;
    setWaSharing(true);
    showToast('Hazırlanıyor...');
    try {
      const saved = await handleSave(); if (!saved) return;
      // Open the tab synchronously, still inside this click's user-gesture
      // window — PDF generation below takes long enough that window.open()
      // after it gets silently blocked as a popup.
      const waWindow = Platform.OS === 'web' ? window.open('', '_blank') : null;
      try {
        const { uri, fileName } = await generatePdfUri(saved);
        const r = await shareQuoteViaWhatsApp({
          pdfUri: uri,
          fileName,
          quote: saved,
          companyName: activeCompany?.sirketAdi,
          waWindow,
        });
        if (r.attached && waWindow) { try { waWindow.close(); } catch {} }
      } catch (e: any) {
        if (waWindow) { try { waWindow.close(); } catch {} }
        showToast(t('teklifPage.s019') + (e?.message || ''));
      }
    } finally {
      setWaSharing(false);
    }
  };

  const handlePreview = async () => {
    const saved = await handleSave();
    if (saved) router.push({ pathname: '/preview', params: { quoteId: saved.id } });
  };

  const cur = paraBirimi;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingBox}><ActivityIndicator color={theme.colors.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  const noSystemTypes = !activeCompany?.sistemTipleri?.length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={editingId ? t('teklifPage.s020') : 'Yeni Teklif'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 820, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Grand total sticky */}
          {/* Genel toplam -- kenarı ışıklı koyu kart, tutar değiştikçe sayarak akar */}
          <BorderBeam
            radius={20}
            width={1.4}
            background={theme.colors.navyDark}
            baseBorder="rgba(148,163,184,0.22)"
            colors={['rgba(129,140,248,0)', '#818CF8', '#22D3EE', 'rgba(34,211,238,0)']}
            style={s.totalShell}
          >
            <LinearGradient
              colors={[alpha(theme.colors.primary, 0.55), 'rgba(15,23,42,0)'] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.totalBanner}>
              <View style={{ flex: 1 }}>
                <Text style={s.totalLabel}>{t('teklifPage.s021')}{cur})</Text>
                <CountUp value={genelToplam} duration={700} format={(n) => fmt(n, cur)} style={s.totalValue} numberOfLines={1} />
              </View>
              <View style={s.miniStats}>
                <View style={[s.durumBadge, { backgroundColor: (DURUM_COLORS[durum] || theme.colors.textMuted) + '30' }]}>
                  <View style={[s.durumDot, { backgroundColor: DURUM_COLORS[durum] || theme.colors.textMuted }]} />
                  <Text style={s.durumBadgeText}>{statusLabel(lang, durum)}</Text>
                </View>
                <Text style={s.miniStat}>{items.length} kalem</Text>
                <Text style={s.miniStatSub}>{t('teklifPage.s023')}{kdvOr}</Text>
              </View>
            </View>
          </BorderBeam>

          {!!draftBanner && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: theme.colors.primarySoft, borderRadius: 12, padding: 12, marginBottom: 14,
              borderWidth: 1, borderColor: '#bfdbfe',
            }}>
              <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
              <Text style={{ flex: 1, fontSize: 12.5, color: theme.colors.text }}>
                Kaydedilmemiş bir taslak bulundu{draftBanner.musFirma ? ` (${draftBanner.musFirma})` : ''}. Geri yüklensin mi?
              </Text>
              <TouchableOpacity onPress={discardDraft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="draft-discard-btn">
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '700' }}>Sil</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyDraft(draftBanner)}
                style={{ backgroundColor: theme.colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                testID="draft-restore-btn"
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Geri Yükle</Text>
              </TouchableOpacity>
            </View>
          )}

          {!!editingId && !isQuoteOwner && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: myEditRequest?.status === 'approved' ? '#dcfce7' : '#fef3c7',
              borderRadius: 12, padding: 12, marginBottom: 14,
            }}>
              <Ionicons
                name={myEditRequest?.status === 'approved' ? 'checkmark-circle' : 'lock-closed'}
                size={20}
                color={myEditRequest?.status === 'approved' ? '#16a34a' : '#b45309'}
              />
              <Text style={{ flex: 1, fontSize: 13, color: theme.colors.goldText }}>
                {myEditRequest?.status === 'approved'
                  ? t('teklifPage.s109')
                  : t('teklifPage.s105').replace('{who}', editingQuote?.createdByEmail || editingQuote?.createdByName || '')}
              </Text>
              {myEditRequest?.status === 'pending' ? (
                <Text style={{ fontSize: 12, color: theme.colors.goldText, fontWeight: '600' }}>{t('teklifPage.s108')}</Text>
              ) : myEditRequest?.status !== 'approved' ? (
                <TouchableOpacity
                  onPress={handleRequestEditApproval}
                  disabled={requestingApproval}
                  style={{ backgroundColor: '#b45309', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                >
                  {requestingApproval ? <ActivityIndicator size="small" color="#fff" /> : (
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('teklifPage.s106')}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <SectionHeader title={t('teklifPage.s024')} icon="document-text" />
          <View style={s.fieldGrid}>
            <FGroup label={t('teklifPage.s025')} grid><MotionInput style={s.input} value={teklifNo} onChangeText={(v) => { setTeklifNo(v); teklifNoManualRef.current = true; }} testID="teklif-no-input" /></FGroup>
            <FGroup label={t('teklifPage.s026')} grid><MotionInput style={s.input} value={tarih} onChangeText={setTarih} placeholder={t('teklifPage.s001')} placeholderTextColor="#94a3b8" /></FGroup>
            <FGroup label={t('teklifPage.s027')} grid><MotionInput style={s.input} value={gecerlilik} onChangeText={setGecerlilik} placeholder={t('teklifPage.s001')} placeholderTextColor="#94a3b8" /></FGroup>
          </View>

          <SectionHeaderWithAction title={t('teklifPage.s028')} actionLabel={customers.length ? `Geçmiş (${customers.length})` : ''} actionIcon="albums-outline" onAction={customers.length ? () => setShowCustomerPicker(true) : undefined} icon="person" />
          <View style={{ marginBottom: 8, zIndex: 20 }}>
            <Text style={s.label}>{upper(t('teklifPage.s029'))}</Text>
            <MotionInput
              style={s.input}
              placeholder={t('teklifPage.s030')}
              placeholderTextColor="#94a3b8"
              value={musFirma}
              onChangeText={(v) => { setMusFirma(v); setShowFirmaSuggestions(true); }}
              onFocus={() => setShowFirmaSuggestions(true)}
              onBlur={() => setTimeout(() => setShowFirmaSuggestions(false), 150)}
              testID="mus-firma-input"
            />
            {showFirmaSuggestions && firmaSuggestions.length > 0 ? (
              <View style={s.suggestBox}>
                {firmaSuggestions.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={s.suggestRow}
                    onPress={() => fillFromCustomer(c.id)}
                    testID={`firma-suggest-${c.id}`}
                  >
                    <Ionicons name="business-outline" size={14} color={theme.colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                      <Text style={s.suggestSub} numberOfLines={1}>{[c.yetkili, c.telefon, c.email].filter(Boolean).join(' • ') || '-'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          <View style={s.fieldGrid}>
            <FGroup label={t('teklifPage.s031')} grid><MotionInput style={s.input} value={musYetkili} onChangeText={setMusYetkili} placeholder={t('teklifPage.s032')} placeholderTextColor="#94a3b8" /></FGroup>
            <FGroup label={t('teklifPage.s002')} grid><MotionInput style={s.input} value={musTelefon} onChangeText={setMusTelefon} placeholder={t('teklifPage.s002')} placeholderTextColor="#94a3b8" keyboardType="phone-pad" /></FGroup>
            <FGroup label={t('teklifPage.s033')} grid><MotionInput style={s.input} value={musEmail} onChangeText={setMusEmail} placeholder={t('teklifPage.s034')} placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" /></FGroup>
          </View>
          <FGroup label={t('teklifPage.s035')}><MotionInput style={[s.input, s.multiline]} multiline value={musAdres} onChangeText={setMusAdres} placeholder={t('teklifPage.s036')} placeholderTextColor="#94a3b8" /></FGroup>

          <SectionHeader title={t('teklifPage.s037')} icon="cart" />
          <FGroup label={t('teklifPage.s038')}><MotionInput style={s.input} value={projeAdi} onChangeText={setProjeAdi} placeholder={t('teklifPage.s039')} placeholderTextColor="#94a3b8" /></FGroup>
          <Row>
            <FGroup label={t('teklifPage.s040')} flex={1}>
              <View style={s.chipRow}>{['USD', 'EUR', 'TRY'].map((c) => (
                <ChoiceChip key={c} testID={`cur-${c}`} label={c} selected={paraBirimi === c} onPress={() => { setParaBirimi(c); rememberDefault('paraBirimi', c); }} style={{ flex: 1 }} />
              ))}</View>
            </FGroup>
            <FGroup label={t('teklifPage.s041')} flex={1}>
              <View style={s.chipRow}>{['EXW', 'FOB', 'CIF', 'DAP'].map((c) => (
                <ChoiceChip key={c} label={c} selected={nakliye === c} onPress={() => { setNakliye(c); rememberDefault('nakliye', c); }} />
              ))}</View>
            </FGroup>
          </Row>
          <View style={s.fieldGrid}>
            {/* Bu üç alan firmaya göre değişir ama firma içinde neredeyse hiç
                değişmez: girilen değer o firmanın varsayılanı olarak
                hatırlanır, sonraki tekliflerde hazır gelir. */}
            <FGroup label={t('teklifPage.s042')} grid>
              <MotionInput
                style={s.input}
                value={odemeSekli}
                onChangeText={setOdemeSekli}
                onBlur={() => rememberDefault('odemeSekli', odemeSekli)}
                testID="quote-odeme-sekli"
              />
            </FGroup>
            <FGroup label={t('teklifPage.s043')} grid>
              <MotionInput style={s.input} value={mensei} onChangeText={setMensei} onBlur={() => rememberDefault('mensei', mensei)} />
            </FGroup>
            <FGroup label={t('teklifPage.s044')} grid>
              <MotionInput style={s.input} value={teslimGun} onChangeText={setTeslimGun} onBlur={() => rememberDefault('teslimGun', teslimGun)} />
            </FGroup>
            <FGroup label={t('teklifPage.s045')} grid narrow><MotionInput style={s.input} keyboardType="decimal-pad" value={iskonto} onChangeText={(v) => setIskonto(v.replace(/[^0-9.,]/g, ''))} /></FGroup>
            <FGroup label={t('teklifPage.s046')} grid narrow><MotionInput style={s.input} keyboardType="decimal-pad" value={kdvOrani} onChangeText={(v) => setKdvOrani(v.replace(/[^0-9.,]/g, ''))} /></FGroup>
          </View>

          <SectionHeader title={`KALEMLER (${items.length})`} icon="layers" />
          {items.length === 0 && (
            <>
              <Reveal variant="scale">
                <TouchableOpacity style={s.emptyBox} activeOpacity={0.85} onPress={() => setShowModeSheet(true)} testID="empty-add-item">
                  <IconBadge icon="add" color={theme.colors.primary} size={54} radius={19} motion="float" />
                  <Text style={s.emptyTitle}>{t('teklifPage.s047')}</Text>
                  <Text style={s.emptyText}>{t('teklifPage.s048')}</Text>
                </TouchableOpacity>
              </Reveal>

              {/* Teklif henüz boşken: kaydırdıkça sırayla beliren kısa ipuçları --
                  ekran "bomboş" görünmesin, yeni kullanıcı akışı öğrensin. */}
              <View style={s.tipsWrap}>
                {[
                  { icon: 'library' as const, color: theme.colors.modules.katalog, title: t('teklifPage.tipCatalogTitle'), text: t('teklifPage.tipCatalogText') },
                  { icon: 'people' as const, color: theme.colors.modules.musteri, title: t('teklifPage.tipCustomerTitle'), text: t('teklifPage.tipCustomerText') },
                  { icon: 'logo-whatsapp' as const, color: '#16A34A', title: t('teklifPage.tipShareTitle'), text: t('teklifPage.tipShareText') },
                ].map((tip, i) => (
                  <Reveal key={tip.title} variant={i % 2 === 0 ? 'left' : 'right'} distance={22}>
                    <View style={s.tipRow}>
                      <IconBadge icon={tip.icon} color={tip.color} size={36} motion="pop" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.tipTitle}>{tip.title}</Text>
                        <Text style={s.tipText}>{tip.text}</Text>
                      </View>
                    </View>
                  </Reveal>
                ))}
              </View>
            </>
          )}

          {items.map((it, idx) => (
            <Reveal key={it.id}>
            <ItemCard
              item={it}
              idx={idx}
              currency={cur}
              sistemTipleri={activeCompany?.sistemTipleri || []}
              expanded={expandedItemId === it.id}
              onToggleExpand={() => setExpandedItemId((prev) => (prev === it.id ? null : it.id))}
              onChange={(patch) => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onDuplicate={() => duplicateItem(it.id)}
              onOpenSystemPicker={() => setShowSystemPicker(it.id)}
              onOpenSelectPicker={(fieldId, options, title) => setShowSelectPicker({ itemId: it.id, fieldId, options, title })}
              onUpdateSystemFieldValue={(fi, val) => updateSystemFieldValue(it.id, fi, val)}
              leaving={leavingItemIds.has(it.id)}
              canMoveUp={idx > 0}
              canMoveDown={idx < items.length - 1}
              onMoveUp={() => moveItem(it.id, 'up')}
              onMoveDown={() => moveItem(it.id, 'down')}
            />
            </Reveal>
          ))}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <BubbleButton
              icon="add"
              label={t('teklifPage.s049')}
              color={theme.colors.primary}
              onPress={() => setShowModeSheet(true)}
              testID="add-item-btn"
              style={{ flex: 1.25 }}
            />
            <BubbleButton
              icon="library"
              label={t('teklifPage.s050')}
              color={theme.colors.modules.katalog}
              variant="soft"
              onPress={() => setShowCatalogPicker(true)}
              testID="add-from-catalog-btn"
              style={{ flex: 1 }}
            />
          </View>

          {noSystemTypes && (
            <View style={s.warningBox}>
              <Ionicons name="warning" size={16} color={theme.colors.gold} />
              <Text style={s.warningText}>
                {t('teklifPage.s051')}<Text style={{ fontWeight: '900' }} onPress={() => router.push('/(tabs)/catalog')}>{t('teklifPage.s052')}</Text> {t('teklifPage.s053')}</Text>
            </View>
          )}

          <SectionHeader title={t('teklifPage.s054')} icon="chatbox-ellipses" />
          <FGroup>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: theme.colors.primary + '14', borderWidth: 1, borderColor: theme.colors.primary + '33' }}
                onPress={applyNoteEmphasis}
                testID="notlar-emphasis-btn"
              >
                <Ionicons name="text" size={13} color={theme.colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.primary }}>Kalın / Vurgulu Yap</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>Metni seçip butona basın</Text>
            </View>
            <MotionInput
              style={[s.input, s.multiline, { minHeight: 90 }]}
              multiline
              value={notlar}
              onChangeText={setNotlar}
              onSelectionChange={(e) => { notlarSelRef.current = e.nativeEvent.selection; }}
              selection={notlarForcedSel}
              placeholder={t('teklifPage.s055')}
              placeholderTextColor="#94a3b8"
              testID="notlar-input"
            />
            {!!notlar && (
              <View style={{ marginTop: 8, padding: 9, backgroundColor: theme.colors.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.line }}>
                <Text style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: '700', marginBottom: 4 }}>ÖNİZLEME</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: theme.colors.text }}>
                  {parseNoteSegments(notlar).map((seg, i) => (
                    <Text
                      key={i}
                      style={seg.emphasis ? { fontWeight: '800', color: '#000', textDecorationLine: 'underline', fontSize: 13.5 } : undefined}
                    >
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              </View>
            )}
            {!user?.is_staff && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, opacity: savingDefaultNotes ? 0.6 : 1 }}
                disabled={savingDefaultNotes}
                onPress={saveNotesAsDefault}
                testID="save-default-notes-btn"
              >
                <Ionicons name="bookmark-outline" size={14} color={theme.colors.primary} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.colors.primary }}>
                  {savingDefaultNotes ? 'Kaydediliyor...' : t('teklifPage.s056')}
                </Text>
              </TouchableOpacity>
            )}
          </FGroup>

          {/* EKLER (İsteğe bağlı özel sayfalar) UI'dan kaldırıldı -- kullanıcı
              ihtiyaç olmadığını belirtti. `ekler` verisi ve PDF oluşturma
              mantığı (buildQuotePdfHtml) dokunulmadan bırakıldı: daha önce
              bu alanla eklenmiş teklifler PDF'te olduğu gibi görünmeye
              devam eder, sadece yeni ek ekleme arayüzü gizlendi. */}

          {/* EK DOSYALAR — user-uploaded PDFs / images, merged into the outgoing PDF */}
          <SectionHeader title={t('teklifPage.s057')} icon="attach" />
          <Text style={s.helperTinyMuted}>{t('teklifPage.s058')}</Text>
          {attachments.map((att, ai) => {
            const isImg = (att.mime || '').startsWith('image/') || /\.(png|jpe?g)$/i.test(att.name);
            const kb = att.size ? Math.round(att.size / 1024) : null;
            return (
              <View key={att.id} style={s.attachRow} testID={`attach-${ai}`}>
                <View style={s.attachIcon}>
                  <Ionicons name={isImg ? 'image' : 'document-text'} size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attachName} numberOfLines={1}>{att.name}</Text>
                  <Text style={s.attachMeta}>{isImg ? t('teklifPage.s059') : 'PDF'}{kb ? ` · ${kb} KB` : ''}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAttachments(attachments.filter((_, i) => i !== ai))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID={`attach-remove-${ai}`}
                >
                  <Ionicons name="close-circle" size={20} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            );
          })}
          <BubbleButton
            icon="cloud-upload"
            label={t('teklifPage.s060')}
            color={theme.colors.primary}
            variant="dashed"
            onPress={pickAttachments}
            testID="pick-attachment-btn"
          />

          {/* LIVE PDF PREVIEW */}
          <View style={s.livePreviewSection}>
            <View style={s.livePreviewHdr}>
              <Ionicons name="eye" size={16} color="#fff" />
              <Text style={s.livePreviewHdrText}>{t('teklifPage.s061')}</Text>
              <View style={s.liveDot} />
              <Text style={s.livePreviewCount}>{items.length} kalem</Text>
            </View>
            <View style={s.miniTable}>
              <View style={s.miniTHead}>
                <Text style={[s.miniTh, { width: 22, textAlign: 'center' }]}>#</Text>
                <Text style={[s.miniTh, { flex: 1 }]}>{t('teklifPage.s004')}</Text>
                <Text style={[s.miniTh, { width: 38, textAlign: 'center' }]}>{t('teklifPage.s062')}</Text>
                <Text style={[s.miniTh, { width: 66, textAlign: 'right' }]}>{t('teklifPage.s063')}</Text>
              </View>
              {items.length === 0 ? (
                <Text style={s.miniEmpty}>{t('teklifPage.s064')}</Text>
              ) : items.map((it, i) => {
                const line = (it.adet || 0) * (it.birimFiyat || 0);
                const desc = buildItemDescription(it);
                return (
                  <View key={it.id} style={[s.miniRow, i % 2 === 1 && { backgroundColor: theme.colors.surfaceSoft }]}>
                    <Text style={[s.miniTd, { width: 22, textAlign: 'center' }]}>{i + 1}</Text>
                    <Text style={[s.miniTdBold, { flex: 1 }]}>{desc || <Text style={s.miniPlaceholder}>—</Text>}</Text>
                    <Text style={[s.miniTd, { width: 38, textAlign: 'center' }]}>{it.adet}</Text>
                    <Text style={[s.miniTdBold, { width: 66, textAlign: 'right' }]} numberOfLines={1}>{fmt(line, cur)}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.totalsCard}>
            <TotRow label={t('teklifPage.s066')} value={fmt(subtotal, cur)} />
            {iskontoOr > 0 && <TotRow label={`İskonto (%${iskontoOr})`} value={`-${fmt(iskontoTutar, cur)}`} negative />}
            <TotRow label={`KDV (%${kdvOr})`} value={fmt(kdvTutar, cur)} />
            <View style={s.grand}>
              <Text style={s.grandLabel}>{t('teklifPage.s067')}</Text>
              <Text style={s.grandValue} numberOfLines={1}>{fmt(genelToplam, cur)}</Text>
            </View>
          </View>

          {/* İndirmeden/paylaşmadan sadece kaydetme -- bilgiler girildikten sonra
              PDF/WhatsApp akışına girmeden teklifi kayıt altına almak için. */}
          <TouchableOpacity style={[s.btnSave, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} testID="save-only-btn">
            {saving ? <ActivityIndicator color={readableOn(theme.colors.green)} /> : (<><Ionicons name="save-outline" size={17} color={readableOn(theme.colors.green)} /><Text style={s.btnSaveText}>Kaydet</Text></>)}
          </TouchableOpacity>

          <View style={s.actionRow}>
            <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={resetForm}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.textSoft} />
              <Text style={s.btnGhostText}>{t('teklifPage.s068')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handlePreview} disabled={saving} testID="preview-btn">
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={s.btnSecondaryText}>{t('teklifPage.s069')}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.actionRow}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleShare} disabled={saving} testID="share-pdf-btn">
              {saving ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="share-social" size={17} color="#fff" /><Text style={s.btnPrimaryText}>{t('teklifPage.s070')}</Text></>)}
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnWhatsApp, { flex: 1 }, (saving || waSharing) && { opacity: 0.6 }]} onPress={handleWhatsAppShare} disabled={saving || waSharing} testID="share-whatsapp-btn">
              {waSharing ? <ActivityIndicator color={readableOn(WA_GREEN)} /> : (<><Ionicons name="logo-whatsapp" size={17} color={readableOn(WA_GREEN)} /><Text style={s.btnWaText}>{t('teklifPage.s071')}</Text></>)}
            </TouchableOpacity>
          </View>
        </MotionScrollView>
      </KeyboardAvoidingView>

      {/* Kalem tipi seçimi -- her tip ne işe yaradığıyla birlikte anlatılır,
          böylece ilk kez ekleyen kullanıcı deneme yanılmayla öğrenmez. */}
      <SheetModal
        visible={showModeSheet}
        onClose={() => setShowModeSheet(false)}
        title={t('teklifPage.s072')}
        subtitle="Eklemek istediğiniz kalemin türünü seçin; alanlar buna göre açılır."
        testID="mode-sheet"
      >
        <SheetRow icon="construct" title={t('teklifPage.s005')} desc={t('teklifPage.s073')} onPress={() => addItem('technical')} testID="add-technical" />
        <SheetRow icon="list" title={t('teklifPage.s074')} desc={t('teklifPage.s075')} onPress={() => addItem('manual')} color={theme.colors.gold} testID="add-manual" />
        <SheetRow icon="pricetag" title={t('teklifPage.s076')} desc={t('teklifPage.s077')} onPress={() => addItem('general')} color={theme.colors.green} testID="add-general" />
        <SheetRow
          icon="calculator"
          title="Albert Genau Hesapla"
          desc="Ölçü girin, malzeme listesi ve bayi fiyatı otomatik hesaplansın"
          color="#B61231"
          onPress={() => { setShowModeSheet(false); router.push('/albert-genau'); }}
          testID="add-albertgenau"
        />
      </SheetModal>

      {/* Katalog */}
      <SheetModal
        visible={showCatalogPicker}
        onClose={() => setShowCatalogPicker(false)}
        title={t('teklifPage.s078')}
        subtitle={catalog.length > 0 ? `${catalog.length} kayıtlı ürün` : undefined}
        scroll
        testID="catalog-sheet"
      >
        {catalog.length === 0 ? (
          <SheetEmpty icon="cube-outline" text={t('teklifPage.s079')} />
        ) : (
          catalog.map((c) => (
            <SheetPick
              key={c.id}
              badge={c.kategori}
              title={c.urunAdi}
              meta={`${fmt(c.birimFiyat, c.paraBirimi)} / ${c.birim}`}
              onPress={() => addFromCatalog(c.id)}
              right={<Ionicons name="add-circle" size={24} color={theme.colors.primary} />}
            />
          ))
        )}
      </SheetModal>

      {/* Müşteri */}
      <SheetModal
        visible={showCustomerPicker}
        onClose={() => setShowCustomerPicker(false)}
        title={t('teklifPage.s081')}
        subtitle={customers.length > 0 ? `${customers.length} kayıtlı müşteri` : undefined}
        scroll
        testID="customer-sheet"
      >
        {customers.length === 0 ? (
          <SheetEmpty icon="people-outline" text="Henüz müşteri kaydınız yok. Müşteri sekmesinden ekleyebilirsiniz." />
        ) : (
          customers.map((c) => (
            <SheetPick
              key={c.id}
              title={c.firma}
              meta={[c.yetkili, c.telefon, c.email].filter(Boolean).join(' • ') || '—'}
              onPress={() => fillFromCustomer(c.id)}
            />
          ))
        )}
      </SheetModal>

      {/* Sistem tipi (teknik kalemler) */}
      <SheetModal
        visible={!!showSystemPicker}
        onClose={() => setShowSystemPicker(null)}
        title={t('teklifPage.s082')}
        scroll
        testID="system-sheet"
      >
        {(activeCompany?.sistemTipleri || []).length === 0 ? (
          <SheetEmpty icon="warning-outline" text={t('teklifPage.s083')} />
        ) : (
          (activeCompany?.sistemTipleri || []).map((sys) => (
            <SheetPick
              key={sys.id}
              title={sys.name}
              meta={`${sys.fields?.length || 0} ${t('teklifPage.s084')}`}
              onPress={() => showSystemPicker && selectSystemType(showSystemPicker, sys)}
              testID={`sys-pick-${sys.id}`}
            />
          ))
        )}
      </SheetModal>

      {/* Seçenek listesi (sistem alanı) */}
      <SheetModal
        visible={!!showSelectPicker}
        onClose={() => setShowSelectPicker(null)}
        title={showSelectPicker?.title || t('teklifPage.s085')}
        scroll
        maxHeightPct={0.7}
        testID="select-sheet"
      >
        {(showSelectPicker?.options || []).map((op) => {
          const current = (() => {
            if (!showSelectPicker) return false;
            const it = items.find((x) => x.id === showSelectPicker.itemId);
            if (!it) return false;
            const fi = it.sistemFields.findIndex((f, idx) => `f-${idx}` === showSelectPicker.fieldId);
            return fi >= 0 && it.sistemFields[fi]?.value === op;
          })();
          return (
            <SheetPick
              key={op}
              title={op}
              selected={current}
              onPress={() => {
                if (showSelectPicker) {
                  const it = items.find((x) => x.id === showSelectPicker.itemId);
                  if (it) {
                    const fi = it.sistemFields.findIndex((f, idx) => `f-${idx}` === showSelectPicker.fieldId);
                    if (fi >= 0) updateSystemFieldValue(it.id, fi, op);
                  }
                }
                setShowSelectPicker(null);
              }}
              right={current ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.green} /> : null}
            />
          );
        })}
      </SheetModal>
    </SafeAreaView>
  );
}

// ============ ITEM CARD ============
function ItemCard({
  item, idx, currency, sistemTipleri, expanded, onToggleExpand, onChange, onRemove, onDuplicate, onOpenSystemPicker, onOpenSelectPicker, onUpdateSystemFieldValue, leaving,
  canMoveUp, canMoveDown, onMoveUp, onMoveDown,
}: {
  item: QuoteItemT;
  idx: number;
  currency: string;
  sistemTipleri: SystemTypeDefT[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<QuoteItemT>) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  onOpenSystemPicker: () => void;
  onOpenSelectPicker: (fieldId: string, options: string[], title: string) => void;
  onUpdateSystemFieldValue: (fieldIndex: number, value: string) => void;
  leaving?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t, lang } = useLanguage();
  // Adet ve Birim Fiyat alanları için ayrı bir "ham metin" state'i tutulur.
  // Neden: value={String(item.adet)} kullanılırsa, kullanıcı "667," yazdığı anda
  // Number("667,") -> "667." -> 667 olarak parse edilip state'e yazılır, sonraki
  // render'da input değeri tekrar String(667) = "667" olur ve daha yeni yazılan
  // virgül anında silinir; kullanıcı ondalık kısmı hiç yazamaz. Bu yüzden ekranda
  // gösterilen metin kullanıcının yazdığı ham string, hesaplamalarda kullanılan
  // sayı ise ayrıca onChange ile parent'a bildirilir.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [adetText, setAdetText] = useState(String(item.adet ?? ''));
  const [priceText, setPriceText] = useState(String(item.birimFiyat ?? ''));
  useEffect(() => {
    const parsed = Number(adetText.replace(',', '.')) || 0;
    if (parsed !== (item.adet || 0)) setAdetText(String(item.adet ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.adet]);
  useEffect(() => {
    const parsed = Number(priceText.replace(',', '.')) || 0;
    if (parsed !== (item.birimFiyat || 0)) setPriceText(String(item.birimFiyat ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.birimFiyat]);
  const onAdetTextChange = (v: string) => {
    const cleaned = v.replace(/[^0-9.,]/g, '');
    setAdetText(cleaned);
    const num = Number(cleaned.replace(',', '.'));
    onChange({ adet: Number.isFinite(num) ? num : 0 });
  };
  const onPriceTextChange = (v: string) => {
    const cleaned = v.replace(/[^0-9.,]/g, '');
    setPriceText(cleaned);
    const num = Number(cleaned.replace(',', '.'));
    onChange({ birimFiyat: Number.isFinite(num) ? num : 0 });
  };
  // Kalem eklenirken hafifçe belirip yukarı kayarak görünür, silinirken
  // (leaving=true) aynı animasyonun tersiyle solup küçülerek kaybolur.
  const enterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enterAnim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (leaving) {
      Animated.timing(enterAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start();
    }
  }, [leaving]);
  const line = (item.adet || 0) * (item.birimFiyat || 0);
  const modeMeta =
    item.mode === 'technical' ? { label: t('teklifPage.s004'), color: theme.colors.primary, icon: 'construct' as const } :
    item.mode === 'manual' ? { label: t('teklifPage.s086'), color: theme.colors.gold, icon: 'create' as const } :
    { label: t('teklifPage.s087'), color: theme.colors.textMuted, icon: 'cube' as const };
  const preview = buildItemDescription(item);
  const selectedSys = sistemTipleri.find((s) => s.id === item.sistemTipiId);
  // Kartlar accordion mantığıyla çalışır -- açık/kapalı durumu parent'ta
  // (teklif.tsx) tek bir `expandedItemId` ile tutulur, böylece yeni bir kalem
  // eklendiğinde ya da başka bir karta dokunulduğunda önceki kart otomatik
  // daralır ve sayfa çok kalemli tekliflerde uzamaz.
  const collapsed = !expanded;
  const itemTitle = item.mode === 'technical' ? (item.sistemTipi || '') : (item.urunAdi || '');
  const summaryBits = [itemTitle, preview].filter(Boolean);
  const summaryText = summaryBits.join(' — ') || t('teklifPage.s088');

  const animatedCardStyle = {
    opacity: enterAnim,
    transform: [
      { translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
    ],
  };

  return (
    <Animated.View style={[itemStyles.card, { borderLeftColor: modeMeta.color }, animatedCardStyle]} testID={`quote-item-${idx}`}>
      <TouchableOpacity activeOpacity={0.7} onPress={onToggleExpand} testID={`item-${idx}-toggle`}>
        <View style={itemStyles.hdr}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View style={itemStyles.moveCol}>
              <TouchableOpacity
                disabled={!canMoveUp}
                onPress={(e) => { e.stopPropagation?.(); onMoveUp?.(); }}
                hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                testID={`item-move-up-${idx}`}
              >
                <Ionicons name="chevron-up" size={15} color={canMoveUp ? theme.colors.primary : theme.colors.line} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canMoveDown}
                onPress={(e) => { e.stopPropagation?.(); onMoveDown?.(); }}
                hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                testID={`item-move-down-${idx}`}
              >
                <Ionicons name="chevron-down" size={15} color={canMoveDown ? theme.colors.primary : theme.colors.line} />
              </TouchableOpacity>
            </View>
            <Text style={itemStyles.no}>#{idx + 1}</Text>
            <View style={[itemStyles.modeBadge, { backgroundColor: modeMeta.color + '20', borderColor: modeMeta.color }]}>
              <Ionicons name={modeMeta.icon} size={11} color={modeMeta.color} style={{ marginRight: 3 }} />
              <Text style={[itemStyles.modeBadgeText, { color: modeMeta.color }]}>{modeMeta.label}</Text>
            </View>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.colors.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={itemStyles.linePrice}>{fmt(line, currency)}</Text>
            {!!onDuplicate && (
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onDuplicate(); }} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} testID={`duplicate-item-${idx}`}>
                <Ionicons name="copy-outline" size={19} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onRemove(); }} testID={`remove-item-${idx}`}>
              <Ionicons name="close-circle" size={20} color={theme.colors.red} />
            </TouchableOpacity>
          </View>
        </View>
        {collapsed && (
          <Text style={itemStyles.collapsedSummary} numberOfLines={1} testID={`item-${idx}-summary`}>
            {summaryText}
          </Text>
        )}
      </TouchableOpacity>

      {!collapsed && (
      <>
      {/* TECHNICAL MODE — dynamic fields based on selected system */}
      {item.mode === 'technical' && (
        <>
          <FieldGroup label={t('teklifPage.s005')}>
            <TouchableOpacity style={[itemStyles.select, !item.sistemTipiId && itemStyles.selectHighlight]} onPress={onOpenSystemPicker} testID={`item-${idx}-syspick`}>
              <Text style={[itemStyles.selectText, !item.sistemTipiId && { color: theme.colors.primary, fontWeight: '800' }]} numberOfLines={1}>
                {item.sistemTipi || t('teklifPage.s089')}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </FieldGroup>

          {/* Dynamic fields — kısa değer alan alanları (ölçü/RAL/seçim) yan
              yana diziyoruz, tam genişlik alt alta yığılmasın diye. */}
          <View style={itemStyles.fieldGrid}>
          {selectedSys && selectedSys.fields.map((f, fi) => {
            const currentVal = (item.sistemFields?.[fi]?.value) || '';
            if (f.type === 'select') {
              return (
                <FieldGroup key={f.id} label={f.label} grid maxWidth={selectFieldWidth(f.options)}>
                  <TouchableOpacity
                    style={[itemStyles.select, !!currentVal && itemStyles.selectFilled]}
                    onPress={() => onOpenSelectPicker(`f-${fi}`, f.options, f.label)}
                    testID={`item-${idx}-field-${fi}`}
                  >
                    <Text
                      style={[itemStyles.selectText, !currentVal && itemStyles.selectTextEmpty]}
                      numberOfLines={1}
                    >
                      {currentVal || t('teklifPage.s090')}
                    </Text>
                    <Ionicons
                      name={currentVal ? 'checkmark-circle' : 'chevron-down'}
                      size={15}
                      color={currentVal ? theme.colors.green : theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            if (f.type === 'checkbox') {
              const on = currentVal === 'Evet' || currentVal === 'true';
              return (
                <FieldGroup key={f.id} label={f.label} grid maxWidth={110}>
                  <TouchableOpacity style={itemStyles.checkboxRow} onPress={() => onUpdateSystemFieldValue(fi, on ? '' : 'Evet')} testID={`item-${idx}-field-${fi}`}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.colors.primary : theme.colors.textMuted} />
                    <Text style={itemStyles.checkboxText}>{on ? 'Evet' : t('teklifPage.s091')}</Text>
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            return (
              <FieldGroup key={f.id} label={f.label} grid narrow>
                <MotionInput
                  style={itemStyles.input}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  value={currentVal}
                  onChangeText={(v) => onUpdateSystemFieldValue(fi, v)}
                  placeholder={f.type === 'number' ? '0' : '—'}
                  placeholderTextColor="#94a3b8"
                  testID={`item-${idx}-field-${fi}`}
                />
              </FieldGroup>
            );
          })}
          </View>
        </>
      )}

      {/* MANUAL MODE */}
      {item.mode === 'manual' && (
        <>
          <FieldGroup label={t('teklifPage.s092')}>
            <MotionInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder={t('teklifPage.s093')} placeholderTextColor="#94a3b8" />
          </FieldGroup>
          {(item.customFields || []).map((cf, ci) => (
            <View key={ci} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <MotionInput style={[itemStyles.input, { flex: 1 }]} placeholder={t('teklifPage.s094')} placeholderTextColor="#94a3b8" value={cf.key} onChangeText={(v) => {
                const next = [...item.customFields]; next[ci] = { ...cf, key: v }; onChange({ customFields: next });
              }} />
              <MotionInput style={[itemStyles.input, { flex: 1.5 }]} placeholder={t('teklifPage.s095')} placeholderTextColor="#94a3b8" value={cf.value} onChangeText={(v) => {
                const next = [...item.customFields]; next[ci] = { ...cf, value: v }; onChange({ customFields: next });
              }} />
              <TouchableOpacity style={itemStyles.removeKv} onPress={() => onChange({ customFields: item.customFields.filter((_, i) => i !== ci) })}>
                <Ionicons name="close" size={16} color={theme.colors.red} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={itemStyles.addKv} onPress={() => onChange({ customFields: [...(item.customFields || []), { key: '', value: '' }] })} testID={`add-kv-${idx}`}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={itemStyles.addKvText}>{t('teklifPage.s096')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* GENERAL MODE */}
      {item.mode === 'general' && (
        <>
          <FieldGroup label={t('teklifPage.s097')}>
            <MotionInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder={t('teklifPage.s098')} placeholderTextColor="#94a3b8" testID={`item-name-${idx}`} />
          </FieldGroup>
          <FieldGroup label={t('teklifPage.s099')}>
            <MotionInput style={[itemStyles.input, { minHeight: 40, textAlignVertical: 'top' }]} multiline value={item.aciklama} onChangeText={(v) => onChange({ aciklama: v })} />
          </FieldGroup>
        </>
      )}

      {/* Quantity / Unit / Price -- Birim Fiyat'a maxWidth: para birimi
          (TL/$/€) fark etmeksizin en fazla "1.000.000.000" gibi 13
          karakterlik bir rakamı rahat gösterecek, ama geniş ekranda
          gereğinden fazla büyümeyecek kadar bir üst sınır. */}
      <View style={itemStyles.priceBlock}>
        <View style={itemStyles.blockHeadRow}>
          <Ionicons name="pricetag" size={12} color={theme.colors.primary} />
          <Text style={itemStyles.blockHead}>FİYATLANDIRMA</Text>
          <View style={{ flex: 1 }} />
          <Text style={itemStyles.blockTotal}>{fmt(line, currency)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <FieldGroup label={t('teklifPage.s100')} flex={0.7}><MotionInput style={itemStyles.input} keyboardType="decimal-pad" value={adetText} onChangeText={onAdetTextChange} testID={`item-qty-${idx}`} /></FieldGroup>
          <FieldGroup label={t('teklifPage.s101')} flex={0.9}><MotionInput style={itemStyles.input} value={item.birim} onChangeText={(v) => onChange({ birim: v })} /></FieldGroup>
          <FieldGroup label={t('teklifPage.s102')} flex={1.4} maxWidth={200}><MotionInput style={itemStyles.input} keyboardType="decimal-pad" value={priceText} onChangeText={onPriceTextChange} testID={`item-price-${idx}`} /></FieldGroup>
        </View>
      </View>

      {/* Per-item PDF cell preview */}
      {(item.mode === 'technical' || item.mode === 'manual') && (
        <TouchableOpacity
          style={itemStyles.previewBox}
          onPress={() => setPreviewOpen((v) => !v)}
          activeOpacity={0.8}
          testID={`item-${idx}-preview-toggle`}
        >
          <View style={itemStyles.previewHead}>
            <Ionicons name="eye-outline" size={12} color={theme.colors.primary} />
            <Text style={itemStyles.previewLabel}>{t('teklifPage.s103')}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name={previewOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textMuted} />
          </View>
          <Text style={itemStyles.previewText} numberOfLines={previewOpen ? undefined : 1}>
            {preview || <Text style={{ color: theme.colors.textMuted }}>{t('teklifPage.s104')}</Text>}
          </Text>
        </TouchableOpacity>
      )}
      </>
      )}
    </Animated.View>
  );
}

// Bölüm başlığı -- alt çizgisi, bölüm ekrana girdikçe soldan sağa dolar.
function SectionLine() {
  const ref = useAnimatedRef<Reanimated.View>();
  const p = useViewportProgress(ref, { from: 0.96, to: 0.62 });
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.02, p.value) }] }));
  return (
    <Reanimated.View ref={ref} collapsable={false} style={s.sectionLineWrap}>
      <Reanimated.View style={[s.sectionLine, lineStyle]}>
        <LinearGradient
          colors={[theme.colors.primary, alpha(theme.colors.primary, 0)] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View>
      <View style={s.sectionH}>
        {icon && (
          <View style={s.sectionIconWrap}>
            <Ionicons name={icon} size={12} color={theme.colors.primary} />
          </View>
        )}
        <Text style={s.sectionHText}>{title}</Text>
      </View>
      <SectionLine />
    </View>
  );
}
function SectionHeaderWithAction({ title, actionLabel, onAction, icon, actionIcon }: { title: string; actionLabel?: string; onAction?: () => void; icon?: keyof typeof Ionicons.glyphMap; actionIcon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View>
    <View style={s.sectionRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {icon && (
          <View style={s.sectionIconWrap}>
            <Ionicons name={icon} size={12} color={theme.colors.primary} />
          </View>
        )}
        <Text style={s.sectionH2}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={s.sectionActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {actionIcon ? <Ionicons name={actionIcon} size={13} color={theme.colors.primary} /> : null}
          <Text style={s.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
    <SectionLine />
    </View>
  );
}
function FGroup({ label, children, flex, grid, narrow }: { label?: string; children: React.ReactNode; flex?: number; grid?: boolean; narrow?: boolean }) {
  return <View style={[{ marginBottom: 9 }, flex ? { flex } : {}, grid ? s.fieldGridItem : {}, narrow ? s.fieldGridItemNarrow : {}]}>{label ? <Text style={s.label} numberOfLines={2}>{upper(label)}</Text> : null}{children}</View>;
}
// Seçim (select) tipi alanlar için genişlik: kutunun içeriği (en uzun
// seçenek metni) ne kadar kısaysa kutu da o kadar dar olsun -- "LED
// Aydınlatma" gibi kısa seçenekli alanlar tek başına kalınca büyük bir
// alan kaplamasın. Karakter başına ~7.2px + ok ikonu/dolgu payı, 96-200
// aralığında sınırlı.
function selectFieldWidth(options: string[]): number {
  // Kalem alanları artık 2 sütunlu okunabilir bir ızgarada: en dar kutu bile
  // etiketi ve seçili değeri tam gösterecek genişlikte olmalı (kullanıcı
  // geri bildirimi: "kutucuklar küçük, doldururken sıkıcı").
  const longest = Math.max(6, ...(options || []).map((o) => (o || '').length));
  const w = Math.round(longest * 7.4) + 64;
  return Math.max(150, Math.min(280, w));
}
function FieldGroup({ label, children, flex, grid, narrow, maxWidth }: { label: string; children: React.ReactNode; flex?: number; grid?: boolean; narrow?: boolean; maxWidth?: number }) {
  // numberOfLines=2 + label'a sabit 2 satırlık yükseklik -- etiket 1 ya da 2
  // satıra sardığına bakılmaksızın aynı satırdaki tüm kutucuklar aynı
  // hizada başlasın diye (kısa etiketli kutu daha erken, uzun etiketli kutu
  // daha geç başlamasın).
  return <View style={[{ marginBottom: 8 }, flex ? { flex } : {}, grid ? itemStyles.fieldGridItem : {}, narrow ? itemStyles.fieldGridItemNarrow : {}, maxWidth ? { maxWidth } : {}]}><Text style={itemStyles.label} numberOfLines={2}>{label}</Text>{children}</View>;
}
function Row({ children, style }: { children: React.ReactNode; style?: any }) { return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{children}</View>; }
function TotRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (<View style={s.totRow}><Text style={s.totLabel}>{label}</Text><Text style={[s.totVal, negative && { color: theme.colors.red }]} numberOfLines={1}>{value}</Text></View>);
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  totalBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 10, gap: 12, ...theme.shadow.md },
  totalLabel: { color: '#94a3b8', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 },
  totalValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2, letterSpacing: 0.3 },
  miniStats: { alignItems: 'flex-end', gap: 4 },
  durumBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4, marginBottom: 2 },
  durumDot: { width: 6, height: 6, borderRadius: 3 },
  durumBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  miniStat: { color: '#fff', fontSize: 12, fontWeight: '700' },
  miniStatSub: { color: theme.colors.primary, fontSize: 10, marginTop: 2, fontWeight: '800' },
  sectionH: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 2 },
  sectionLineWrap: { marginBottom: 8 },
  sectionLine: { height: 2, borderRadius: 1, marginTop: 6, overflow: 'hidden', transformOrigin: 'left' },
  totalShell: { marginBottom: 14 },
  sectionHText: { fontSize: 11, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.5 },
  sectionIconWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 2 },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.5 },
  sectionActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionAction: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  // minHeight: 2 satırlık sabit yükseklik -- etiket 1 satıra mı 2 satıra mı
  // sardığı kutunun genişliğine göre değişse de, aynı satırdaki tüm
  // kutucukların altındaki input'lar hep aynı hizada başlasın diye.
  label: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 3, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 11, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 13.5, color: theme.colors.text },
  multiline: { minHeight: 55, textAlignVertical: 'top' },
  // Teklif/Müşteri/Sipariş Bilgileri'ndeki kısa değerli alanlar (Teklif No,
  // Tarih, Telefon, Menşei, Teslim vb.) için ItemCard'daki kalem alanlarıyla
  // aynı otomatik yan yana dizilim -- dar telefonda 2, geniş ekranda 3-4
  // sütuna kadar kendiliğinden sığdırır. flexGrow:0 -- bir satırda tek
  // başına kalan kutucuk (ör. son alan) tüm boş alanı kaplayıp aşırı
  // genişlemesin, sadece kendi içeriği kadar yer kaplasın.
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, alignItems: 'flex-end' },
  fieldGridItem: { flexGrow: 1, flexShrink: 1, flexBasis: '30%', minWidth: 150, maxWidth: 262 },
  // İskonto/KDV gibi en fazla 3 haneli bir yüzde değeri (ör. "100") alan
  // alanlar için -- ItemCard'daki fieldGridItemNarrow ile aynı mantık.
  fieldGridItemNarrow: { flexGrow: 1, flexShrink: 1, flexBasis: '30%', minWidth: 96, maxWidth: 140 },
  suggestBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 10,
    paddingVertical: 4,
    ...theme.shadow.sm,
    zIndex: 30,
    elevation: 6,
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  suggestName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  suggestSub: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },
  selectBox: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { flex: 1, paddingVertical: 9, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 8, alignItems: 'center' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  emptyBox: { backgroundColor: theme.colors.primary + '08', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '55', borderRadius: 18, padding: 26, alignItems: 'center', marginBottom: 10, gap: 6 },
  tipsWrap: { gap: 10, marginTop: 6, marginBottom: 6 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  tipTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  tipText: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  emptyIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', maxWidth: 260 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: theme.colors.primarySoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: 12, marginTop: 4 },
  addBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  addBtnAlt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 12, marginTop: 4 },
  addBtnAltText: { color: theme.colors.text, fontWeight: '800', fontSize: 12.5 },
  warningBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.goldSoft, borderWidth: 1, borderColor: theme.colors.goldBorder, borderRadius: 12, padding: 12, marginTop: 8 },
  warningText: { flex: 1, fontSize: 11.5, color: theme.colors.goldDark, lineHeight: 16 },
  livePreviewSection: { marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden', ...theme.shadow.sm },
  livePreviewHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.navy, paddingVertical: 10, paddingHorizontal: 12 },
  livePreviewHdrText: { color: '#fff', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  livePreviewCount: { color: '#cbd5e1', fontSize: 10.5, fontWeight: '700' },
  miniTable: { backgroundColor: theme.colors.surface },
  miniTHead: { flexDirection: 'row', backgroundColor: theme.colors.surfaceSoft, paddingVertical: 6, paddingHorizontal: 6, gap: 4 },
  miniTh: { fontSize: 9, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.3 },
  miniRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 4, alignItems: 'flex-start' },
  miniEmpty: { padding: 20, textAlign: 'center', fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic' },
  miniTd: { fontSize: 10, color: theme.colors.text, lineHeight: 13 },
  miniTdBold: { fontSize: 10, color: theme.colors.text, fontWeight: '700', lineHeight: 13 },
  miniPlaceholder: { color: theme.colors.textMuted, fontStyle: 'italic' },
  totalsCard: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 8, marginTop: 12, ...theme.shadow.sm },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  totLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  totVal: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: theme.colors.navy, borderRadius: 8, marginTop: 4 },
  grandLabel: { color: '#cbd5e1', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.6 },
  grandValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  btnPrimary: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: theme.colors.primary, shadowOpacity: 0.35 },
  btnSave: { marginTop: 14, backgroundColor: theme.colors.green, paddingVertical: 14, borderRadius: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: theme.colors.green, shadowOpacity: 0.35 },
  // Alt eylem satirlari: ayni bosluk, ayni bolunme noktasi.
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  // Yesil zeminler koyu temada aciliyor; uzerindeki yazi zemine gore secilir.
  btnSaveText: { color: readableOn(theme.colors.green), fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  btnWaText: { color: readableOn(WA_GREEN), fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  btnWhatsApp: { backgroundColor: WA_GREEN, paddingVertical: 14, borderRadius: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: WA_GREEN, shadowOpacity: 0.35 },
  ekCard: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 8 },
  ekHdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  ekBadge: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.4 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 6 },
  attachIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attachName: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  attachMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15, marginBottom: 8, marginTop: -4 },
  btnSecondary: { backgroundColor: theme.colors.navy, paddingVertical: 14, borderRadius: 13, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnSecondaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, minHeight: 48, backgroundColor: theme.colors.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.lineDark },
  btnGhostText: { color: theme.colors.textSoft, fontWeight: '800', fontSize: 12.5 },
  emailRowActive: { backgroundColor: theme.colors.primarySoft },
  emailTextActive: { color: theme.colors.primary, fontWeight: '800' },
}));

const itemStyles = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, borderLeftWidth: 4, marginBottom: 10, ...theme.shadow.sm },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  moveCol: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginRight: 2 },
  collapsedSummary: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 2 },
  no: { fontSize: 11, fontWeight: '900', color: theme.colors.textMuted },
  modeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  modeBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  linePrice: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  // minHeight: 2 satırlık sabit yükseklik -- aynı satırdaki kutucuklardan
  // biri (ör. "CEPHE / GENİŞLİK") 2 satıra sarsa bile, altındaki input hep
  // "YÜKSEKLİK" gibi tek satırlık etiketli komşusuyla aynı hizada başlasın.
  label: { fontSize: 9.5, lineHeight: 12, minHeight: 24, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4, },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.line, borderRadius: 13, paddingHorizontal: 11, paddingVertical: Platform.OS === 'ios' ? 11 : 9, fontSize: 13.5, color: theme.colors.text },
  select: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.line, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectHighlight: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.primarySoft },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10 },
  checkboxText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  addKv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginBottom: 6, marginTop: 2 },
  addKvText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  removeKv: { width: 36, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewBox: { marginTop: 10, backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, padding: 11, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  selectFilled: { borderColor: theme.colors.primaryBorder, backgroundColor: theme.colors.primarySoft },
  selectTextEmpty: { color: theme.colors.textMuted },
  priceBlock: {
    marginTop: 12,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 11,
  },
  blockHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  blockHead: { fontSize: 10, fontWeight: '900', color: theme.colors.textMuted, letterSpacing: 1 },
  blockTotal: { fontSize: 13.5, fontWeight: '900', color: theme.colors.primary },
  previewLabel: { fontSize: 9, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.5, marginBottom: 4 },
  previewText: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },
  // Teknik alanlar (Cephe, Derinlik, Yükseklik, RAL vb.) genelde kısa
  // değerler alır (bir sayı ya da birkaç kelimelik seçim) -- her birini tam
  // genişlikte alt alta dizmek sayfayı gereksiz uzatıyordu. flexWrap ile
  // sabit bir taban genişlik (140px) verip satıra sığdığı kadarını yan yana
  // diziyoruz: dar telefonda 2, tablet/web'de içerik genişliğine göre 3-4
  // sütuna kadar kendiliğinden çıkıyor -- ekstra breakpoint kodu gerekmeden
  // web/Android/iOS/tablette aynı mantıkla otomatik uyum sağlıyor.
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 0 },
  fieldGridItem: { flexGrow: 1, flexShrink: 1, flexBasis: '46%', minWidth: 150, maxWidth: 280 },
  // Serbest metin/sayı alanları (Cephe, Derinlik, Yükseklik, Ayak Sayısı,
  // RAL vb.) sadece kısa bir ölçü/kod değeri alır (ör. "3000mm") -- select/
  // checkbox alanlarından (daha uzun seçim metinleri olabilir) ayrı, daha
  // dar bir taban genişlik veriyoruz ki bir satıra daha fazlası sığsın.
  fieldGridItemNarrow: { flexGrow: 1, flexShrink: 1, flexBasis: '30%', minWidth: 104, maxWidth: 150 },
}));

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { shareQuoteViaWhatsApp } from '@/src/lib/whatsapp';
import { AttachmentT, mergeAttachmentsIntoPdf } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import * as DocumentPicker from 'expo-document-picker';
import { useLanguage, statusLabel } from '@/src/lib/i18n';

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
  const { activeCompany, catalog, customers, quotes, saveQuote, showToast, loading, setQuoteAttachments, updateCompany } = useApp();
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
  const params = useLocalSearchParams<{ quoteId?: string }>();

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
  const [notlarForcedSel, setNotlarForcedSel] = useState(undefined);
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

  const resetForm = useCallback(() => {
    setEditingId(undefined); setTeklifNo(buildTeklifNo(countQuotesToday(quotes) + 1)); setTarih(todayIso()); setGecerlilik(plusDaysIso(7));
    setHazirlayanEmail(user?.email || ''); setMusFirma(''); setMusYetkili('');
    setMusTelefon(''); setMusEmail(''); setMusAdres(''); setProjeAdi(''); setIskonto('0'); setKdvOrani('20');
    setNotlar(activeCompany?.ozelNotlar || ''); setItems([]); setEkler([]); setAttachments([]); setExpandedItemId(null); bootedRef.current = null;
    setDurum('Beklemede'); setLeavingItemIds(new Set());
    teklifNoManualRef.current = false;
  }, [activeCompany, quotes, user]);

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
    // Initialize sistemFields with empty values for each field
    const initFields = (sys.fields || []).map((f) => ({ label: f.label, value: f.type === 'checkbox' ? '' : '' }));
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
      showToast('Teklif kaydedildi'); return saved;
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
  const handleWhatsAppShare = async () => {
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
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Grand total sticky */}
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.navy]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.totalBanner}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.totalLabel}>{t('teklifPage.s021')}{cur})</Text>
              <Text style={s.totalValue} numberOfLines={1}>{fmt(genelToplam, cur)}</Text>
            </View>
            <View style={s.miniStats}>
              <View style={[s.durumBadge, { backgroundColor: (DURUM_COLORS[durum] || theme.colors.textMuted) + '30' }]}>
                <View style={[s.durumDot, { backgroundColor: DURUM_COLORS[durum] || theme.colors.textMuted }]} />
                <Text style={s.durumBadgeText}>{statusLabel(lang, durum)}</Text>
              </View>
              <Text style={s.miniStat}>{items.length} kalem</Text>
              <Text style={s.miniStatSub}>{t('teklifPage.s023')}{kdvOr}</Text>
            </View>
          </LinearGradient>

          <SectionHeader title={t('teklifPage.s024')} icon="document-text" />
          <Row>
            <FGroup label={t('teklifPage.s025')} flex={1}><TextInput style={s.input} value={teklifNo} onChangeText={(v) => { setTeklifNo(v); teklifNoManualRef.current = true; }} testID="teklif-no-input" /></FGroup>
            <FGroup label={t('teklifPage.s026')} flex={1}><TextInput style={s.input} value={tarih} onChangeText={setTarih} placeholder={t('teklifPage.s001')} placeholderTextColor="#94a3b8" /></FGroup>
          </Row>
          <FGroup label={t('teklifPage.s027')}><TextInput style={s.input} value={gecerlilik} onChangeText={setGecerlilik} placeholder={t('teklifPage.s001')} placeholderTextColor="#94a3b8" /></FGroup>

          <SectionHeaderWithAction title={t('teklifPage.s028')} actionLabel={customers.length ? `📇 Geçmiş (${customers.length})` : ''} onAction={customers.length ? () => setShowCustomerPicker(true) : undefined} icon="person" />
          <View style={{ marginBottom: 8, zIndex: 20 }}>
            <Text style={s.label}>{t('teklifPage.s029')}</Text>
            <TextInput
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
          <Row>
            <FGroup label={t('teklifPage.s031')} flex={1}><TextInput style={s.input} value={musYetkili} onChangeText={setMusYetkili} placeholder={t('teklifPage.s032')} placeholderTextColor="#94a3b8" /></FGroup>
            <FGroup label={t('teklifPage.s002')} flex={1}><TextInput style={s.input} value={musTelefon} onChangeText={setMusTelefon} placeholder={t('teklifPage.s002')} placeholderTextColor="#94a3b8" keyboardType="phone-pad" /></FGroup>
          </Row>
          <FGroup label={t('teklifPage.s033')}><TextInput style={s.input} value={musEmail} onChangeText={setMusEmail} placeholder={t('teklifPage.s034')} placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" /></FGroup>
          <FGroup label={t('teklifPage.s035')}><TextInput style={[s.input, s.multiline]} multiline value={musAdres} onChangeText={setMusAdres} placeholder={t('teklifPage.s036')} placeholderTextColor="#94a3b8" /></FGroup>

          <SectionHeader title={t('teklifPage.s037')} icon="cart" />
          <FGroup label={t('teklifPage.s038')}><TextInput style={s.input} value={projeAdi} onChangeText={setProjeAdi} placeholder={t('teklifPage.s039')} placeholderTextColor="#94a3b8" /></FGroup>
          <Row>
            <FGroup label={t('teklifPage.s040')} flex={1}>
              <View style={s.chipRow}>{['USD', 'EUR', 'TRY'].map((c) => (
                <TouchableOpacity key={c} testID={`cur-${c}`} style={[s.chip, paraBirimi === c && s.chipActive]} onPress={() => setParaBirimi(c)}>
                  <Text style={[s.chipText, paraBirimi === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}</View>
            </FGroup>
            <FGroup label={t('teklifPage.s041')} flex={1}>
              <View style={s.chipRow}>{['EXW', 'FOB', 'CIF', 'DAP'].map((c) => (
                <TouchableOpacity key={c} style={[s.chip, nakliye === c && s.chipActive]} onPress={() => setNakliye(c)}>
                  <Text style={[s.chipText, nakliye === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}</View>
            </FGroup>
          </Row>
          <FGroup label={t('teklifPage.s042')}><TextInput style={s.input} value={odemeSekli} onChangeText={setOdemeSekli} /></FGroup>
          <Row>
            <FGroup label={t('teklifPage.s043')} flex={1}><TextInput style={s.input} value={mensei} onChangeText={setMensei} /></FGroup>
            <FGroup label={t('teklifPage.s044')} flex={1}><TextInput style={s.input} value={teslimGun} onChangeText={setTeslimGun} /></FGroup>
          </Row>
          <Row>
            <FGroup label={t('teklifPage.s045')} flex={1}><TextInput style={s.input} keyboardType="decimal-pad" value={iskonto} onChangeText={(v) => setIskonto(v.replace(/[^0-9.,]/g, ''))} /></FGroup>
            <FGroup label={t('teklifPage.s046')} flex={1}><TextInput style={s.input} keyboardType="decimal-pad" value={kdvOrani} onChangeText={(v) => setKdvOrani(v.replace(/[^0-9.,]/g, ''))} /></FGroup>
          </Row>

          <SectionHeader title={`KALEMLER (${items.length})`} icon="layers" />
          {items.length === 0 && (
            <TouchableOpacity style={s.emptyBox} activeOpacity={0.8} onPress={() => setShowModeSheet(true)} testID="empty-add-item">
              <View style={s.emptyIconCircle}>
                <Ionicons name="add" size={26} color={theme.colors.primary} />
              </View>
              <Text style={s.emptyTitle}>{t('teklifPage.s047')}</Text>
              <Text style={s.emptyText}>{t('teklifPage.s048')}</Text>
            </TouchableOpacity>
          )}

          {items.map((it, idx) => (
            <ItemCard
              key={it.id}
              item={it}
              idx={idx}
              currency={cur}
              sistemTipleri={activeCompany?.sistemTipleri || []}
              expanded={expandedItemId === it.id}
              onToggleExpand={() => setExpandedItemId((prev) => (prev === it.id ? null : it.id))}
              onChange={(patch) => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onOpenSystemPicker={() => setShowSystemPicker(it.id)}
              onOpenSelectPicker={(fieldId, options, title) => setShowSelectPicker({ itemId: it.id, fieldId, options, title })}
              onUpdateSystemFieldValue={(fi, val) => updateSystemFieldValue(it.id, fi, val)}
              leaving={leavingItemIds.has(it.id)}
            />
          ))}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={[s.addBtn, { flex: 1.2 }]} onPress={() => setShowModeSheet(true)} testID="add-item-btn">
              <Ionicons name="add-circle" size={18} color={theme.colors.primary} />
              <Text style={s.addBtnText}>{t('teklifPage.s049')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtnAlt, { flex: 1 }]} onPress={() => setShowCatalogPicker(true)} testID="add-from-catalog-btn">
              <Ionicons name="library-outline" size={16} color={theme.colors.navy} />
              <Text style={s.addBtnAltText}>{t('teklifPage.s050')}</Text>
            </TouchableOpacity>
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
            <TextInput
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
              <View style={{ marginTop: 8, padding: 9, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: theme.colors.line }}>
                <Text style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: '700', marginBottom: 4 }}>ÖNİZLEME</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: '#0f172a' }}>
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
          <TouchableOpacity style={s.addBtn} onPress={pickAttachments} testID="pick-attachment-btn">
            <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addBtnText}>{t('teklifPage.s060')}</Text>
          </TouchableOpacity>

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
                  <View key={it.id} style={[s.miniRow, i % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
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

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity style={[s.btnGhost, { flex: 0.8 }]} onPress={resetForm}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.textSoft} />
              <Text style={s.btnGhostText}>{t('teklifPage.s068')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handlePreview} disabled={saving} testID="preview-btn">
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={s.btnSecondaryText}>{t('teklifPage.s069')}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleShare} disabled={saving} testID="share-pdf-btn">
              {saving ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="share-social" size={17} color="#fff" /><Text style={s.btnPrimaryText}>{t('teklifPage.s070')}</Text></>)}
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnWhatsApp, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleWhatsAppShare} disabled={saving} testID="share-whatsapp-btn">
              <Ionicons name="logo-whatsapp" size={17} color="#fff" />
              <Text style={s.btnPrimaryText}>{t('teklifPage.s071')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mode select */}
      <Modal visible={showModeSheet} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowModeSheet(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>{t('teklifPage.s072')}</Text>
            <ModeChoice icon="construct" title={t('teklifPage.s005')} desc={t('teklifPage.s073')} onPress={() => addItem('technical')} tid="add-technical" />
            <ModeChoice icon="list" title={t('teklifPage.s074')} desc={t('teklifPage.s075')} onPress={() => addItem('manual')} tid="add-manual" />
            <ModeChoice icon="pricetag" title={t('teklifPage.s076')} desc={t('teklifPage.s077')} onPress={() => addItem('general')} tid="add-general" />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Catalog picker */}
      <Modal visible={showCatalogPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>{t('teklifPage.s078')}</Text>
              <TouchableOpacity onPress={() => setShowCatalogPicker(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            {catalog.length === 0 ? <Text style={s.emptyMuted}>{t('teklifPage.s079')}</Text> : (
              <ScrollView style={{ maxHeight: 500 }}>{catalog.map((c) => (
                <TouchableOpacity key={c.id} style={s.catalogRow} onPress={() => addFromCatalog(c.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.catBadge}>{c.kategori}</Text>
                    <Text style={s.catName} numberOfLines={2}>{c.urunAdi}</Text>
                    <Text style={s.catPrice}>{fmt(c.birimFiyat, c.paraBirimi)} / {c.birim}</Text>
                  </View>
                  <Ionicons name="add-circle" size={26} color={theme.colors.primary} />
                </TouchableOpacity>
              ))}</ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Customer picker */}
      <Modal visible={showCustomerPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>{t('teklifPage.s081')}</Text>
              <TouchableOpacity onPress={() => setShowCustomerPicker(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>{customers.map((c) => (
              <TouchableOpacity key={c.id} style={s.catalogRow} onPress={() => fillFromCustomer(c.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.catName} numberOfLines={1}>{c.firma}</Text>
                  <Text style={s.catPrice} numberOfLines={1}>{[c.yetkili, c.telefon, c.email].filter(Boolean).join(' • ') || '-'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            ))}</ScrollView>
          </View>
        </View>
      </Modal>

      {/* System type picker (for technical items) */}
      <Modal visible={!!showSystemPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>{t('teklifPage.s082')}</Text>
              <TouchableOpacity onPress={() => setShowSystemPicker(null)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            {(activeCompany?.sistemTipleri || []).length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="warning-outline" size={32} color={theme.colors.gold} />
                <Text style={s.emptyMuted}>{t('teklifPage.s083')}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 500 }}>{(activeCompany?.sistemTipleri || []).map((sys) => (
                <TouchableOpacity key={sys.id} style={s.catalogRow} onPress={() => showSystemPicker && selectSystemType(showSystemPicker, sys)} testID={`sys-pick-${sys.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.catName} numberOfLines={1}>{sys.name}</Text>
                    <Text style={s.catPrice}>{sys.fields?.length || 0} {t('teklifPage.s084')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              ))}</ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Select-field picker */}
      <Modal visible={!!showSelectPicker} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowSelectPicker(null)}>
          <View style={s.pickerSheet}>
            <Text style={s.modalTitle}>{showSelectPicker?.title || t('teklifPage.s085')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(showSelectPicker?.options || []).map((op) => (
                <TouchableOpacity key={op} style={s.emailRow} onPress={() => {
                  if (showSelectPicker) {
                    const it = items.find((x) => x.id === showSelectPicker.itemId);
                    if (it) {
                      const fi = it.sistemFields.findIndex((f, idx) => `f-${idx}` === showSelectPicker.fieldId);
                      if (fi >= 0) updateSystemFieldValue(it.id, fi, op);
                    }
                  }
                  setShowSelectPicker(null);
                }}>
                  <Ionicons name="ellipse-outline" size={12} color={theme.colors.textMuted} />
                  <Text style={s.emailText}>{op}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ============ ITEM CARD ============
function ItemCard({
  item, idx, currency, sistemTipleri, expanded, onToggleExpand, onChange, onRemove, onOpenSystemPicker, onOpenSelectPicker, onUpdateSystemFieldValue, leaving,
}: {
  item: QuoteItemT;
  idx: number;
  currency: string;
  sistemTipleri: SystemTypeDefT[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<QuoteItemT>) => void;
  onRemove: () => void;
  onOpenSystemPicker: () => void;
  onOpenSelectPicker: (fieldId: string, options: string[], title: string) => void;
  onUpdateSystemFieldValue: (fieldIndex: number, value: string) => void;
  leaving?: boolean;
}) {
  const { t, lang } = useLanguage();
  // Adet ve Birim Fiyat alanları için ayrı bir "ham metin" state'i tutulur.
  // Neden: value={String(item.adet)} kullanılırsa, kullanıcı "667," yazdığı anda
  // Number("667,") -> "667." -> 667 olarak parse edilip state'e yazılır, sonraki
  // render'da input değeri tekrar String(667) = "667" olur ve daha yeni yazılan
  // virgül anında silinir; kullanıcı ondalık kısmı hiç yazamaz. Bu yüzden ekranda
  // gösterilen metin kullanıcının yazdığı ham string, hesaplamalarda kullanılan
  // sayı ise ayrıca onChange ile parent'a bildirilir.
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
            <Text style={itemStyles.no}>#{idx + 1}</Text>
            <View style={[itemStyles.modeBadge, { backgroundColor: modeMeta.color + '20', borderColor: modeMeta.color }]}>
              <Ionicons name={modeMeta.icon} size={11} color={modeMeta.color} style={{ marginRight: 3 }} />
              <Text style={[itemStyles.modeBadgeText, { color: modeMeta.color }]}>{modeMeta.label}</Text>
            </View>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={theme.colors.textMuted} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={itemStyles.linePrice}>{fmt(line, currency)}</Text>
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

          {/* Dynamic fields */}
          {selectedSys && selectedSys.fields.map((f, fi) => {
            const currentVal = (item.sistemFields?.[fi]?.value) || '';
            if (f.type === 'select') {
              return (
                <FieldGroup key={f.id} label={f.label}>
                  <TouchableOpacity
                    style={itemStyles.select}
                    onPress={() => onOpenSelectPicker(`f-${fi}`, f.options, f.label)}
                    testID={`item-${idx}-field-${fi}`}
                  >
                    <Text style={itemStyles.selectText} numberOfLines={1}>{currentVal || t('teklifPage.s090')}</Text>
                    <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            if (f.type === 'checkbox') {
              const on = currentVal === 'Evet' || currentVal === 'true';
              return (
                <FieldGroup key={f.id} label={f.label}>
                  <TouchableOpacity style={itemStyles.checkboxRow} onPress={() => onUpdateSystemFieldValue(fi, on ? '' : 'Evet')} testID={`item-${idx}-field-${fi}`}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.colors.primary : theme.colors.textMuted} />
                    <Text style={itemStyles.checkboxText}>{on ? 'Evet' : t('teklifPage.s091')}</Text>
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            return (
              <FieldGroup key={f.id} label={f.label}>
                <TextInput
                  style={itemStyles.input}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  value={currentVal}
                  onChangeText={(v) => onUpdateSystemFieldValue(fi, v)}
                  placeholder={`${f.label} girin`}
                  placeholderTextColor="#94a3b8"
                  testID={`item-${idx}-field-${fi}`}
                />
              </FieldGroup>
            );
          })}
        </>
      )}

      {/* MANUAL MODE */}
      {item.mode === 'manual' && (
        <>
          <FieldGroup label={t('teklifPage.s092')}>
            <TextInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder={t('teklifPage.s093')} placeholderTextColor="#94a3b8" />
          </FieldGroup>
          {(item.customFields || []).map((cf, ci) => (
            <View key={ci} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <TextInput style={[itemStyles.input, { flex: 1 }]} placeholder={t('teklifPage.s094')} placeholderTextColor="#94a3b8" value={cf.key} onChangeText={(v) => {
                const next = [...item.customFields]; next[ci] = { ...cf, key: v }; onChange({ customFields: next });
              }} />
              <TextInput style={[itemStyles.input, { flex: 1.5 }]} placeholder={t('teklifPage.s095')} placeholderTextColor="#94a3b8" value={cf.value} onChangeText={(v) => {
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
            <TextInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder={t('teklifPage.s098')} placeholderTextColor="#94a3b8" testID={`item-name-${idx}`} />
          </FieldGroup>
          <FieldGroup label={t('teklifPage.s099')}>
            <TextInput style={[itemStyles.input, { minHeight: 40, textAlignVertical: 'top' }]} multiline value={item.aciklama} onChangeText={(v) => onChange({ aciklama: v })} />
          </FieldGroup>
        </>
      )}

      {/* Quantity / Unit / Price */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <FieldGroup label={t('teklifPage.s100')} flex={1}><TextInput style={itemStyles.input} keyboardType="decimal-pad" value={adetText} onChangeText={onAdetTextChange} testID={`item-qty-${idx}`} /></FieldGroup>
        <FieldGroup label={t('teklifPage.s101')} flex={1}><TextInput style={itemStyles.input} value={item.birim} onChangeText={(v) => onChange({ birim: v })} /></FieldGroup>
        <FieldGroup label={t('teklifPage.s102')} flex={1.4}><TextInput style={itemStyles.input} keyboardType="decimal-pad" value={priceText} onChangeText={onPriceTextChange} testID={`item-price-${idx}`} /></FieldGroup>
      </View>

      {/* Per-item PDF cell preview */}
      {(item.mode === 'technical' || item.mode === 'manual') && (
        <View style={itemStyles.previewBox}>
          <Text style={itemStyles.previewLabel}>{t('teklifPage.s103')}</Text>
          <Text style={itemStyles.previewText}>{preview || <Text style={{ color: theme.colors.textMuted }}>{t('teklifPage.s104')}</Text>}</Text>
        </View>
      )}
      </>
      )}
    </Animated.View>
  );
}

function ModeChoice({ icon, title, desc, onPress, tid }: { icon: any; title: string; desc: string; onPress: () => void; tid: string }) {
  return (
    <TouchableOpacity style={s.modeChoice} onPress={onPress} testID={tid}>
      <View style={s.modeIcon}><Ionicons name={icon} size={20} color={theme.colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.modeTitle}>{title}</Text>
        <Text style={s.modeDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.sectionH}>
      {icon && (
        <View style={s.sectionIconWrap}>
          <Ionicons name={icon} size={12} color={theme.colors.primary} />
        </View>
      )}
      <Text style={s.sectionHText}>{title}</Text>
    </View>
  );
}
function SectionHeaderWithAction({ title, actionLabel, onAction, icon }: { title: string; actionLabel?: string; onAction?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.sectionRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {icon && (
          <View style={s.sectionIconWrap}>
            <Ionicons name={icon} size={12} color={theme.colors.primary} />
          </View>
        )}
        <Text style={s.sectionH2}>{title}</Text>
      </View>
      {actionLabel && onAction ? <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{actionLabel}</Text></TouchableOpacity> : null}
    </View>
  );
}
function FGroup({ label, children, flex }: { label?: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 8 }, flex ? { flex } : {}]}>{label ? <Text style={s.label}>{label}</Text> : null}{children}</View>;
}
function FieldGroup({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 8 }, flex ? { flex } : {}]}><Text style={itemStyles.label}>{label}</Text>{children}</View>;
}
function Row({ children, style }: { children: React.ReactNode; style?: any }) { return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{children}</View>; }
function TotRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (<View style={s.totRow}><Text style={s.totLabel}>{label}</Text><Text style={[s.totVal, negative && { color: theme.colors.red }]} numberOfLines={1}>{value}</Text></View>);
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  sectionH: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  sectionHText: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.5 },
  sectionIconWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.5 },
  sectionAction: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 14, color: theme.colors.text },
  multiline: { minHeight: 55, textAlignVertical: 'top' },
  suggestBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
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
  selectBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 4 },
  chip: { flex: 1, paddingVertical: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 8, alignItems: 'center' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  emptyBox: { backgroundColor: theme.colors.primary + '08', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary + '55', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 10, gap: 4 },
  emptyIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', maxWidth: 260 },
  emptyMuted: { color: theme.colors.textMuted, textAlign: 'center', padding: 16, fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: theme.colors.primarySoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: 12, marginTop: 4 },
  addBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  addBtnAlt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 12, marginTop: 4 },
  addBtnAltText: { color: theme.colors.navy, fontWeight: '800', fontSize: 12.5 },
  warningBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.goldSoft, borderWidth: 1, borderColor: theme.colors.goldBorder, borderRadius: 12, padding: 12, marginTop: 8 },
  warningText: { flex: 1, fontSize: 11.5, color: theme.colors.goldDark, lineHeight: 16 },
  livePreviewSection: { marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden', ...theme.shadow.sm },
  livePreviewHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.navy, paddingVertical: 10, paddingHorizontal: 12 },
  livePreviewHdrText: { color: '#fff', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  livePreviewCount: { color: '#cbd5e1', fontSize: 10.5, fontWeight: '700' },
  miniTable: { backgroundColor: '#fff' },
  miniTHead: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 6, gap: 4 },
  miniTh: { fontSize: 9, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.3 },
  miniRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 4, alignItems: 'flex-start' },
  miniEmpty: { padding: 20, textAlign: 'center', fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic' },
  miniTd: { fontSize: 10, color: theme.colors.text, lineHeight: 13 },
  miniTdBold: { fontSize: 10, color: theme.colors.text, fontWeight: '700', lineHeight: 13 },
  miniPlaceholder: { color: theme.colors.textMuted, fontStyle: 'italic' },
  totalsCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 8, marginTop: 12, ...theme.shadow.sm },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  totLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  totVal: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: theme.colors.navy, borderRadius: 8, marginTop: 4 },
  grandLabel: { color: '#cbd5e1', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.6 },
  grandValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  btnPrimary: { marginTop: 12, backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: theme.colors.primary, shadowOpacity: 0.35 },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  btnWhatsApp: { marginTop: 12, backgroundColor: '#25D366', paddingVertical: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: '#25D366', shadowOpacity: 0.35 },
  ekCard: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 8 },
  ekHdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  ekBadge: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.4 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 6 },
  attachIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attachName: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  attachMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15, marginBottom: 8, marginTop: -4 },
  btnSecondary: { backgroundColor: theme.colors.navy, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnSecondaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark },
  btnGhostText: { color: theme.colors.textSoft, fontWeight: '800', fontSize: 12.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '85%' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.navy, marginBottom: 8 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 10 },
  catBadge: { fontSize: 9.5, color: theme.colors.primary, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  catName: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  catPrice: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  pickerSheet: { backgroundColor: '#fff', margin: 20, borderRadius: 16, padding: 16, ...theme.shadow.lg },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  emailRowActive: { backgroundColor: theme.colors.primarySoft },
  emailText: { fontSize: 12.5, color: theme.colors.text, flex: 1 },
  emailTextActive: { color: theme.colors.primary, fontWeight: '800' },
  modeChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, backgroundColor: '#fff' },
  modeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.navy },
  modeDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});

const itemStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, borderLeftWidth: 4, marginBottom: 10, ...theme.shadow.sm },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  collapsedSummary: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 2 },
  no: { fontSize: 11, fontWeight: '900', color: theme.colors.textMuted },
  modeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  modeBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  linePrice: { fontSize: 13, fontWeight: '900', color: theme.colors.navy },
  label: { fontSize: 9.5, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 13.5, color: theme.colors.text },
  select: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectHighlight: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.primarySoft },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10 },
  checkboxText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  addKv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginBottom: 6, marginTop: 2 },
  addKvText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  removeKv: { width: 36, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewBox: { marginTop: 10, backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  previewLabel: { fontSize: 9, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.5, marginBottom: 4 },
  previewText: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },
});

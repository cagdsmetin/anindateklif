import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, QuoteT, QuoteEkstraMaliyetT, RatesT, fetchQuoteExcelBytes } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';
import { buildQuoteFileName } from '@/src/lib/quote-utils';
import { shareQuoteViaWhatsApp, WHATSAPP_TEMPLATES, renderWhatsAppTemplate, canShareFilesWeb, openWhatsAppChat } from '@/src/lib/whatsapp';
import { mergeAttachmentsIntoPdf, bytesToBase64 } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import { useLanguage, orderedAmounts, statusLabel } from '@/src/lib/i18n';

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}

function parseTarih(tarih: string): Date | null {
  const m = (tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

const STATUSES = ['Beklemede', 'Görüldü', 'Onaylandı', 'Reddedildi'];
// Panel'deki 'Yanıt Bekleyen' kartından gelen özel filtre — tek bir duruma değil,
// iki duruma birden (Beklemede + Görüldü) karşılık geldiği için STATUSES listesinden ayrı tutuluyor.
const PENDING_FILTER = '__bekleyen__';

export default function HistoryScreen() {
  const { t, lang } = useLanguage();
  const { quotes, deleteQuote, updateQuoteStatus, updateQuoteMaliyet, updateQuoteItemMaliyet, updateQuoteEkstraMaliyet, activeCompany, showToast, getQuoteAttachments, editRequests, respondQuoteEditRequest } = useApp();
  const { user: me } = useAuth();
  // Teklif sahiplik/onay sistemi: bana (bu tekliflerin gerçek sahibine) gelen,
  // henüz yanıtlanmamış düzenleme onay istekleri -- bkz. teklif.tsx'teki kilit.
  const incomingEditRequests = editRequests.filter((r) => r.status === 'pending' && r.approverUserId === me?.user_id);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const handleRespondEditRequest = async (id: string, approve: boolean) => {
    if (respondingId) return;
    setRespondingId(id);
    try {
      await respondQuoteEditRequest(id, approve);
    } catch (e: any) {
      showToast(t('history.s005') + (e?.message || ''));
    } finally {
      setRespondingId(null);
    }
  };
  const isStaffUser = !!me?.is_staff;
  // Onaylı bir teklifi reddetmek bağlı Tahsilat borcunu da iptal ediyor --
  // geri alınamaz bir işlem olduğu için sadece firma sahibi yapabilsin ve
  // öncesinde bir uyarı ekranından geçsin.
  const [rejectConfirmFor, setRejectConfirmFor] = useState<string | null>(null);
  // Bir teklifi "Onaylandı" durumuna geçirmek Tahsilat'a otomatik bir borç
  // kaydı düşürüyor (kasaya alacak olarak işleniyor) -- kullanıcı yanlışlıkla
  // onaylamasın diye burada da bir uyarı ekranından geçiriyoruz.
  const [approveConfirmFor, setApproveConfirmFor] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>(params.filter === 'bekleyen' ? PENDING_FILTER : t('history.s003'));
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [maliyetFor, setMaliyetFor] = useState<string | null>(null);
  // Kalem bazında maliyet girişi -- teklif kalemi id'sine göre metin kutusu
  // değerleri (virgüllü, henüz sayıya çevrilmemiş). Modal açılırken quote'un
  // kalemlerindeki mevcut maliyet değerleriyle dolduruluyor.
  const [maliyetItemInputs, setMaliyetItemInputs] = useState<Record<string, string>>({});
  // Kaleme bağlı olmayan, kullanıcının doğrudan "açıklama + fiyat" girip
  // serbestçe ekleyip çıkarabildiği ek maliyet satırları -- tutar değeri
  // virgüllü metin olarak tutuluyor (yukarıdaki kalem inputlarıyla tutarlı).
  const [ekstraMaliyetRows, setEkstraMaliyetRows] = useState<{ id: string; aciklama: string; tutar: string }[]>([]);
  const newEkstraMaliyetId = () => 'em-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const [waMenuFor, setWaMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [rates, setRates] = useState<RatesT | null>(null);

  useEffect(() => {
    // Panel'deki kur şeridiyle aynı mantık: TL karşılıkları "canlı" hissettirsin
    // diye kurları periyodik yeniliyoruz (backend'de zaten 30sn'lik cache var).
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => {
    let list = quotes;
    if (filter === PENDING_FILTER) list = list.filter((qq) => qq.durum === 'Beklemede' || qq.durum === 'Görüldü');
    else if (filter !== 'Tümü') list = list.filter((qq) => qq.durum === filter);
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter((x) => x.musFirma.toLowerCase().includes(qq) || x.teklifNo.toLowerCase().includes(qq) || x.projeAdi.toLowerCase().includes(qq));
    }
    return list;
  }, [quotes, filter, q]);

  // Müşteriler USD, EUR ya da TL üzerinden teklif veriyor olabilir — bunları
  // olduğu gibi toplamak yanlış bir rakam üretir. Canlı kurla hepsini TRY'ye
  // çevirip topluyoruz, altında da o TRY toplamın USD/EUR karşılığını
  // gösteriyoruz (Panel'deki 'Bu Ay Hacim' kartıyla aynı mantık).
  const toTRY = (list: QuoteT[]): number | null => {
    if (!rates || (!rates.usd_try && !rates.eur_try)) return null;
    let missingRate = false;
    const total = list.reduce((a, x) => {
      const val = x.genelToplam || 0;
      const cur = (x.paraBirimi || 'USD').toUpperCase();
      if (cur === 'TRY' || cur === 'TL') return a + val;
      if (cur === 'USD') {
        if (!rates.usd_try) { missingRate = true; return a; }
        return a + val * rates.usd_try;
      }
      if (cur === 'EUR') {
        if (!rates.eur_try) { missingRate = true; return a; }
        return a + val * rates.eur_try;
      }
      return a;
    }, 0);
    return missingRate ? null : total;
  };
  const equivFromTRY = (try_: number | null) => ({
    usd: try_ != null && rates?.usd_try ? try_ / rates.usd_try : null,
    eur: try_ != null && rates?.eur_try ? try_ / rates.eur_try : null,
  });

  // Geçmiş kartlarında, teklifin kendi para biriminin altına diğer iki para
  // biriminin (TL/USD/EUR arasından teklifin PARASI dışındaki ikisi) canlı
  // karşılığını göstermek için -- teklif TRY ise USD/EUR, USD ise TRY/EUR,
  // EUR ise TRY/USD döner. Kur verisi henüz gelmediyse null döner (satır hiç
  // gösterilmez, mevcut davranış bozulmaz).
  const cardEquiv = (quote: QuoteT): { cur: string; val: number }[] | null => {
    if (!rates) return null;
    const amt = quote.genelToplam || 0;
    const cur = (quote.paraBirimi || 'USD').toUpperCase();
    let tryAmt: number | null = null;
    if (cur === 'TRY' || cur === 'TL') tryAmt = amt;
    else if (cur === 'USD' && rates.usd_try) tryAmt = amt * rates.usd_try;
    else if (cur === 'EUR' && rates.eur_try) tryAmt = amt * rates.eur_try;
    if (tryAmt == null) return null;
    const usdAmt = rates.usd_try ? tryAmt / rates.usd_try : null;
    const eurAmt = rates.eur_try ? tryAmt / rates.eur_try : null;
    const parts: { cur: string; val: number }[] = [];
    if (cur !== 'TRY' && cur !== 'TL') parts.push({ cur: 'TRY', val: tryAmt });
    if (cur !== 'USD' && usdAmt != null) parts.push({ cur: 'USD', val: usdAmt });
    if (cur !== 'EUR' && eurAmt != null) parts.push({ cur: 'EUR', val: eurAmt });
    return parts;
  };

  // USD-first fallback (kur verisi henüz gelmediyse eski davranış).
  const totalValueUSDOnly = quotes.reduce((a, x) => a + (x.durum === 'Onaylandı' && (x.paraBirimi || 'USD') === 'USD' ? x.genelToplam : 0), 0);
  const approvedQuotes = useMemo(() => quotes.filter((x) => x.durum === 'Onaylandı'), [quotes]);
  const approvedTRY = useMemo(() => toTRY(approvedQuotes), [approvedQuotes, rates]);
  const approvedEquiv = equivFromTRY(approvedTRY);

  const pendingCount = quotes.filter((x) => x.durum === 'Beklemede' || x.durum === 'Görüldü').length;

  const now = new Date();
  const curMonthKey = monthKey(now);
  const thisMonthQuotes = quotes.filter((x) => {
    const d = parseTarih(x.tarih);
    return d ? monthKey(d) === curMonthKey : false;
  });
  const thisMonthCount = thisMonthQuotes.length;

  const monthTotalsByCurrency = thisMonthQuotes.reduce((acc: Record<string, number>, x) => {
    const cur = x.paraBirimi || 'USD';
    acc[cur] = (acc[cur] || 0) + (x.genelToplam || 0);
    return acc;
  }, {});
  const monthVolumeUSD = monthTotalsByCurrency['USD'] || 0;
  const monthVolumeTRY = useMemo(() => toTRY(thisMonthQuotes), [thisMonthQuotes, rates]);
  const monthVolumeEquiv = equivFromTRY(monthVolumeTRY);

  const openEdit = (id: string) => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: id } });
  // "Kopyala" -- Teklif ekranını bu teklifin bilgileriyle dolu ama YENİ bir
  // kayıt olarak açar (bkz. teklif.tsx: loadFromQuoteAsCopy). Sık tekrar eden
  // müşteriler/kalemler için baştan girmek yerine tek dokunuşla taslak oluşturur.
  const openDuplicate = (id: string) => router.push({ pathname: '/(tabs)/teklif', params: { duplicateFrom: id } });

  const generatePdf = async (quote: QuoteT): Promise<{ uri: string; fileName: string } | null> => {
    if (!activeCompany) return null;
    const html = buildQuotePdfHtml(activeCompany, quote);
    const desired = buildQuoteFileName(new Date()) + '.pdf';
    let finalUri: string;
    if (Platform.OS === 'web') {
      // expo-print's printToFileAsync is just window.print() on web (ignores
      // our html and opens the browser's print dialog) — render a real PDF
      // client-side instead.
      finalUri = await htmlToPdfObjectUrlWeb(html);
    } else {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      finalUri = uri;
      try {
        const dirIdx = uri.lastIndexOf('/');
        finalUri = uri.substring(0, dirIdx + 1) + desired;
        await FileSystem.moveAsync({ from: uri, to: finalUri });
      } catch { finalUri = uri; }
    }
    // Include any PDF/image attachments picked for this quote in the editor.
    const atts = getQuoteAttachments(quote.id);
    if (atts.length > 0) {
      try { finalUri = await mergeAttachmentsIntoPdf(finalUri, atts); } catch {}
    }
    return { uri: finalUri, fileName: desired };
  };

  const doShare = async (quote: QuoteT) => {
    if (!activeCompany) return;
    try {
      const result = await generatePdf(quote);
      if (!result) return;
      // Web: blob: PDFs aren't a valid navigator.share() target (throws
      // "Invalid URL" even though Sharing.isAvailableAsync() reports true) —
      // always go straight to a real download there.
      if (Platform.OS === 'web') {
        await downloadFileWeb(result.uri, result.fileName);
        showToast('PDF indirildi');
        return;
      }
      const avail = await Sharing.isAvailableAsync();
      if (avail) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: t('history.s007'), UTI: 'com.adobe.pdf' });
      } else {
        await downloadFileWeb(result.uri, result.fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast(t('history.s008') + (e?.message || '')); }
  };

  // Excel (.xlsx) indirme -- Geçmiş listesindeki her kart için de PDF/WhatsApp
  // ile aynı hizada, önizlemeye girmeden tek dokunuşla indirilebilsin diye.
  // Görsel tasarım (marka renkleri, kalın başlıklar) sunucuda openpyxl ile
  // üretiliyor -- istemcideki ücretsiz 'xlsx' kütüphanesi stil yazamıyor.
  const doExcelDownload = async (quote: QuoteT) => {
    try {
      const buf = await fetchQuoteExcelBytes(quote.id);
      const fileName = buildQuoteFileName(new Date()) + '.xlsx';
      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      if (Platform.OS === 'web') {
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        await downloadFileWeb(url, fileName);
        showToast('Excel indirildi');
      } else {
        const b64 = bytesToBase64(new Uint8Array(buf));
        const uri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
        const avail = await Sharing.isAvailableAsync();
        if (avail) {
          await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: 'Teklif Excel', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
        } else {
          showToast('Excel dosyası oluşturuldu ama paylaşım kullanılamıyor');
        }
      }
    } catch (e: any) {
      showToast('Excel hatası: ' + (e?.message || ''));
    }
  };

  // `waSharingId` covers the WHOLE flow (PDF generation + WhatsApp
  // hand-off) for the quote currently being shared — previously nothing
  // disabled the "WA" button while the PDF was rendering, so on a slow/
  // unstable connection nothing visibly happened for a while (or the CDN
  // fetch for the PDF libraries could hang outright, see pdf-web.ts), which
  // read as the screen being frozen; repeated taps could then stack up
  // multiple popups/PDF generations at once.
  const [waSharingId, setWaSharingId] = useState<string | null>(null);
  const doWhatsApp = async (quote: QuoteT, message?: string) => {
    if (!activeCompany || waSharingId) return;
    setWaSharingId(quote.id);
    showToast('Hazırlanıyor...');
    // Open the tab synchronously, still inside this click's user-gesture
    // window — PDF generation below takes long enough that window.open()
    // after it gets silently blocked as a popup. See preview.tsx for the
    // same pattern.
    const waWindow = Platform.OS === 'web' && !canShareFilesWeb() ? window.open('', '_blank') : null;
    try {
      const result = await generatePdf(quote);
      if (!result) { if (waWindow) { try { waWindow.close(); } catch {} } return; }
      const r = await shareQuoteViaWhatsApp({ pdfUri: result.uri, fileName: result.fileName, quote, companyName: activeCompany.sirketAdi, message, waWindow });
      if (r.attached && waWindow) { try { waWindow.close(); } catch {} }
      if (r.messageCopied) {
        showToast(t('history.s009'));
      }
    } catch (e: any) {
      if (waWindow) { try { waWindow.close(); } catch {} }
      showToast(t('history.s005') + (e?.message || ''));
    } finally {
      setWaSharingId(null);
    }
  };

  // Templates other than "Teklif Hazır" are plain reminder/thank-you notes --
  // they have nothing to attach, so we skip PDF generation entirely and just
  // hand WhatsApp the filled-in text directly (no download/share dialog, no
  // "drag the PDF in" step).
  const doWhatsAppTextOnly = async (quote: QuoteT, message: string) => {
    try {
      await openWhatsAppChat(quote.musTelefon || '', message);
    } catch (e: any) {
      showToast(t('history.s005') + (e?.message || ''));
    }
  };

  const waMenuQuote = waMenuFor ? quotes.find((x) => x.id === waMenuFor) : null;

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('history.s010')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('history.s011')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('history.s012')} />
      {incomingEditRequests.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>{t('history.s046')}</Text>
          {incomingEditRequests.map((r) => (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: '#fef3c7', borderRadius: 12, padding: 12,
            }}>
              <Ionicons name="alert-circle" size={18} color="#b45309" />
              <Text style={{ flex: 1, fontSize: 13, color: '#78350f' }}>
                {t('history.s047').replace('{who}', r.requestedByEmail || r.requestedByName || '').replace('{teklifNo}', r.teklifNo || '')}
              </Text>
              <TouchableOpacity
                disabled={respondingId === r.id}
                onPress={() => handleRespondEditRequest(r.id, true)}
                style={{ backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('history.s048')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={respondingId === r.id}
                onPress={() => handleRespondEditRequest(r.id, false)}
                style={{ backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('history.s049')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <View style={{ padding: 14, paddingBottom: 6 }}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>{t('history.s013')}</Text>
            <Text style={s.statValue}>{quotes.length}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>{t('history.s014')}</Text>
            <Text style={s.statValue}>{pendingCount}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
            {(() => {
              const [primaryAmt, ...secondaryAmt] = orderedAmounts(lang, approvedTRY, approvedEquiv.usd, approvedEquiv.eur);
              const secondaryShown = secondaryAmt.filter((x) => x.val != null);
              return (
                <>
                  <Text style={[s.statLabel, { color: '#166534' }]}>{t('history.s015')}{primaryAmt.val == null ? ` (${primaryAmt.cur})` : ''}</Text>
                  <Text style={[s.statValue, { color: '#166534', fontSize: 14 }]} numberOfLines={1}>
                    {primaryAmt.val != null ? fmt(primaryAmt.val, primaryAmt.cur) : fmt(totalValueUSDOnly, 'USD')}
                  </Text>
                  {primaryAmt.val != null && secondaryShown.length > 0 ? (
                    <Text style={[s.statSubLabel, { color: '#166534' }]} numberOfLines={1}>
                      ≈ {secondaryShown.map((x) => fmt(x.val as number, x.cur)).join(' · ')}
                    </Text>
                  ) : null}
                </>
              );
            })()}
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>{t('history.s016')}</Text>
            <Text style={s.statValue}>{thisMonthCount}</Text>
          </View>
          <View style={s.statCard}>
            {(() => {
              const [primaryAmt, ...secondaryAmt] = orderedAmounts(lang, monthVolumeTRY, monthVolumeEquiv.usd, monthVolumeEquiv.eur);
              const secondaryShown = secondaryAmt.filter((x) => x.val != null);
              return (
                <>
                  <Text style={s.statLabel}>{t('history.s017')}{primaryAmt.val == null ? ` (${primaryAmt.cur})` : ''}</Text>
                  <Text style={s.statValue} numberOfLines={1}>
                    {primaryAmt.val != null ? fmt(primaryAmt.val, primaryAmt.cur) : fmt(monthVolumeUSD, 'USD')}
                  </Text>
                  {primaryAmt.val != null && secondaryShown.length > 0 ? (
                    <Text style={s.statSubLabel} numberOfLines={1}>
                      ≈ {secondaryShown.map((x) => fmt(x.val as number, x.cur)).join(' · ')}
                    </Text>
                  ) : null}
                </>
              );
            })()}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={[s.searchWrap, { flex: 1 }]}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput testID="history-search" style={s.searchInput} placeholder={t('history.s018')} placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
          </View>
          <TouchableOpacity
            style={s.trashEntryBtn}
            onPress={() => router.push('/trash' as any)}
            testID="trash-entry-btn"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowOuter} contentContainerStyle={s.filterRow}>
        {[t('history.s003'), ...STATUSES].map((st) => (
          <TouchableOpacity key={st} testID={`filter-${st}`} style={[s.filterChip, filter === st && s.filterChipActive]} onPress={() => setFilter(st)}>
            <Text style={[s.filterText, filter === st && s.filterTextActive]} allowFontScaling={false} numberOfLines={1}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>{t('history.s019')}</Text>
          </View>
        ) : filtered.map((quote) => {
          const c = statusColor(quote.durum);
          return (
            <View key={quote.id} style={s.card} testID={`history-card-${quote.id}`}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.hNo}>{quote.teklifNo}</Text>
                  <Text style={s.hFirma} numberOfLines={1}>{quote.musFirma}</Text>
                  {quote.projeAdi ? <Text style={s.hProje} numberOfLines={1}>{quote.projeAdi}</Text> : null}
                  <Text style={s.hDate}>{quote.tarih} • {quote.items.length} kalem</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.hAmount} numberOfLines={1}>{fmt(quote.genelToplam, quote.paraBirimi)}</Text>
                  {(() => {
                    const eq = cardEquiv(quote);
                    if (!eq || eq.length === 0) return null;
                    return (
                      <Text style={s.hAmountEquiv} numberOfLines={1}>
                        ≈ {eq.map((x) => fmt(x.val, x.cur)).join(' · ')}
                      </Text>
                    );
                  })()}
                  <TouchableOpacity testID={`status-${quote.id}`} onPress={() => setStatusMenuFor(quote.id)} style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
                    <Text style={[s.statusText, { color: c.text }]}>{statusLabel(lang, quote.durum)}</Text>
                    <Ionicons name="chevron-down" size={11} color={c.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={s.maliyetRow}
                onPress={() => {
                  setMaliyetFor(quote.id);
                  const init: Record<string, string> = {};
                  (quote.items || []).forEach((it) => {
                    if (it.maliyet != null) init[it.id] = String(it.maliyet).replace('.', ',');
                  });
                  setMaliyetItemInputs(init);
                  setEkstraMaliyetRows((quote.ekstraMaliyetler || []).map((e) => ({
                    id: e.id, aciklama: e.aciklama || '', tutar: e.tutar ? String(e.tutar).replace('.', ',') : '',
                  })));
                }}
                testID={`maliyet-${quote.id}`}
              >
                <Ionicons name="calculator-outline" size={13} color={theme.colors.textMuted} />
                {quote.maliyet != null ? (
                  <Text style={s.maliyetText} numberOfLines={1}>
                    {t('history.s035')}: {fmt(quote.maliyet, quote.paraBirimi)}  •  {t('history.s036')}: <Text style={{ color: (quote.genelToplam - quote.maliyet) >= 0 ? '#16a34a' : theme.colors.red, fontWeight: '900' }}>{fmt(quote.genelToplam - quote.maliyet, quote.paraBirimi)}</Text>
                  </Text>
                ) : (
                  <Text style={s.maliyetTextMuted}>{t('history.s037')}</Text>
                )}
              </TouchableOpacity>
              <View style={s.actionBar}>
                <TouchableOpacity style={s.actBtn} onPress={() => openEdit(quote.id)} testID={`edit-quote-${quote.id}`}>
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>{t('history.s021')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtn} onPress={() => doShare(quote)} testID={`pdf-${quote.id}`}>
                  <Ionicons name="document-text-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>{t('history.s022')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actBtnIcon, { backgroundColor: '#E8F5E9' }]}
                  onPress={() => doExcelDownload(quote)}
                  testID={`excel-${quote.id}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="grid-outline" size={16} color="#107C41" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actBtn, { backgroundColor: '#dcfce7' }, waSharingId === quote.id && { opacity: 0.6 }]}
                  onPress={() => setWaMenuFor(quote.id)}
                  disabled={waSharingId === quote.id}
                  testID={`whatsapp-${quote.id}`}
                >
                  {waSharingId === quote.id ? <ActivityIndicator size="small" color="#16a34a" /> : <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />}
                  <Text style={[s.actText, { color: '#16a34a' }]}>{t('history.s023')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actBtnIcon, { backgroundColor: theme.colors.primary + '14' }]}
                  onPress={() => openDuplicate(quote.id)}
                  testID={`duplicate-quote-${quote.id}`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtnIcon} onPress={() => setDeleteTarget(quote.id)} testID={`delete-quote-${quote.id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setDeleteTarget(null)}>
          <TouchableOpacity activeOpacity={1} style={s.confirmBox}>
            <View style={s.confirmIconWrap}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.red} />
            </View>
            <Text style={s.menuTitle}>{t('history.s024')}</Text>
            <Text style={s.confirmBody}>
              {t('history.s025')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnGhost]}
                onPress={() => setDeleteTarget(null)}
                testID="delete-quote-cancel"
              >
                <Text style={s.confirmBtnGhostText}>{t('history.s004')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnDanger]}
                onPress={async () => {
                  if (deleteTarget) {
                    try {
                      await deleteQuote(deleteTarget);
                      showToast('Teklif silindi');
                      setDeleteTarget(null);
                    } catch (e: any) {
                      // Backend blocks deletion when real Tahsilat payments are
                      // linked to this quote -- surface its detail message
                      // rather than a generic error, and keep the modal open
                      // so the person isn't left wondering what happened.
                      let msg = e?.message || 'Teklif silinemedi';
                      try {
                        const parsed = e?.body ? JSON.parse(e.body) : null;
                        if (parsed?.detail) msg = parsed.detail;
                      } catch {}
                      showToast(msg);
                    }
                  } else {
                    setDeleteTarget(null);
                  }
                }}
                testID="delete-quote-confirm"
              >
                <Text style={s.confirmBtnDangerText}>{t('history.s026')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>{t('history.s027')}</Text>
            {STATUSES.map((st) => {
              const cc = statusColor(st);
              const targetQuote = quotes.find((q) => q.id === statusMenuFor);
              const isRejectingApproved = targetQuote?.durum === 'Onaylandı' && st === 'Reddedildi';
              const isApprovingQuote = st === 'Onaylandı' && targetQuote?.durum !== 'Onaylandı';
              if (isRejectingApproved && isStaffUser) {
                return (
                  <TouchableOpacity
                    key={st}
                    style={[s.menuItem, { backgroundColor: '#F1F5F9', borderColor: theme.colors.line }]}
                    onPress={() => showToast(t('history.s028'))}
                  >
                    <Ionicons name="lock-closed" size={13} color={theme.colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={[s.menuItemText, { color: theme.colors.textMuted }]}>{st}</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={st} testID={`set-status-${st}`} style={[s.menuItem, { backgroundColor: cc.bg, borderColor: cc.border }]} onPress={async () => {
                  if (!statusMenuFor) { setStatusMenuFor(null); return; }
                  if (isRejectingApproved) {
                    // Geri alınamaz + Tahsilat borcunu iptal eden bir işlem --
                    // doğrudan uygulamak yerine önce uyarı ekranı gösteriyoruz.
                    setRejectConfirmFor(statusMenuFor);
                    setStatusMenuFor(null);
                    return;
                  }
                  if (isApprovingQuote) {
                    // Onaylamak Tahsilat'a otomatik borç kaydı düşürüyor --
                    // yanlışlıkla onaylamayı önlemek için önce uyarı gösteriyoruz.
                    setApproveConfirmFor(statusMenuFor);
                    setStatusMenuFor(null);
                    return;
                  }
                  await updateQuoteStatus(statusMenuFor, st);
                  showToast(t('history.s029'));
                  setStatusMenuFor(null);
                }}>
                  <Text style={[s.menuItemText, { color: cc.text }]}>{st}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!maliyetFor} transparent animationType="fade" onRequestClose={() => setMaliyetFor(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMaliyetFor(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.confirmBox, { maxWidth: 380 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={s.menuTitle}>{t('history.s035')}</Text>
            <Text style={[s.confirmBody, { marginBottom: 10 }]}>{t('history.s041')}</Text>
            {(() => {
              const activeQuote = quotes.find((q) => q.id === maliyetFor);
              if (!activeQuote) return null;
              const items = activeQuote.items || [];
              const itemsTotal = items.reduce((sum, it) => {
                const raw = maliyetItemInputs[it.id];
                const n = raw != null ? Number(raw.replace(',', '.')) : NaN;
                return sum + (isNaN(n) ? 0 : n);
              }, 0);
              const ekstraTotal = ekstraMaliyetRows.reduce((sum, r) => {
                const n = Number((r.tutar || '').replace(',', '.'));
                return sum + (isNaN(n) ? 0 : n);
              }, 0);
              const total = itemsTotal + ekstraTotal;
              const anyEntered = items.some((it) => (maliyetItemInputs[it.id] || '').trim() !== '')
                || ekstraMaliyetRows.some((r) => r.aciklama.trim() !== '' || (r.tutar || '').trim() !== '');
              const kar = activeQuote.genelToplam - total;
              return (
                <>
                  <ScrollView style={{ maxHeight: 320, width: '100%' }} showsVerticalScrollIndicator={false}>
                    {items.length === 0 ? (
                      <Text style={s.emptyText}>{t('history.s042')}</Text>
                    ) : (
                      items.map((it) => {
                        const name = it.mode === 'technical' ? (it.sistemTipi || it.urunAdi || t('history.s043')) : (it.urunAdi || t('history.s043'));
                        return (
                          <View key={it.id} style={s.itemMaliyetRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.itemMaliyetName} numberOfLines={1}>{name}</Text>
                              <Text style={s.itemMaliyetSub}>{it.adet} {it.birim}</Text>
                            </View>
                            <TextInput
                              style={s.itemMaliyetInput}
                              keyboardType="decimal-pad"
                              placeholder="0,00"
                              placeholderTextColor="#94a3b8"
                              value={maliyetItemInputs[it.id] || ''}
                              onChangeText={(txt) => setMaliyetItemInputs((prev) => ({ ...prev, [it.id]: txt.replace(/[^0-9,]/g, '') }))}
                              testID={`maliyet-item-input-${it.id}`}
                            />
                          </View>
                        );
                      })
                    )}
                    {ekstraMaliyetRows.map((row) => (
                      <View key={row.id} style={s.ekstraMaliyetRow}>
                        <TextInput
                          style={s.ekstraMaliyetAciklamaInput}
                          placeholder={t('history.s051')}
                          placeholderTextColor="#94a3b8"
                          value={row.aciklama}
                          onChangeText={(txt) => setEkstraMaliyetRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, aciklama: txt } : r)))}
                          testID={`ekstra-maliyet-aciklama-${row.id}`}
                        />
                        <TextInput
                          style={s.itemMaliyetInput}
                          keyboardType="decimal-pad"
                          placeholder="0,00"
                          placeholderTextColor="#94a3b8"
                          value={row.tutar}
                          onChangeText={(txt) => setEkstraMaliyetRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, tutar: txt.replace(/[^0-9,]/g, '') } : r)))}
                          testID={`ekstra-maliyet-tutar-${row.id}`}
                        />
                        <TouchableOpacity
                          onPress={() => setEkstraMaliyetRows((prev) => prev.filter((r) => r.id !== row.id))}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          testID={`ekstra-maliyet-remove-${row.id}`}
                        >
                          <Ionicons name="close-circle" size={18} color={theme.colors.red} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={s.ekstraMaliyetAddBtn}
                      onPress={() => setEkstraMaliyetRows((prev) => [...prev, { id: newEkstraMaliyetId(), aciklama: '', tutar: '' }])}
                      testID="ekstra-maliyet-add"
                    >
                      <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
                      <Text style={s.ekstraMaliyetAddText}>{t('history.s050')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                  {anyEntered && (
                    <View style={s.maliyetSummaryBox}>
                      <Text style={s.maliyetSummaryText}>{t('history.s035')}: {fmt(total, activeQuote.paraBirimi)}</Text>
                      <Text style={[s.maliyetSummaryText, { color: kar >= 0 ? '#16a34a' : theme.colors.red }]}>{t('history.s036')}: {fmt(kar, activeQuote.paraBirimi)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={[s.confirmBtn, s.confirmBtnGhost]}
                      onPress={async () => {
                        for (const it of items) {
                          if (it.maliyet != null) await updateQuoteItemMaliyet(activeQuote.id, it.id, null);
                        }
                        if ((activeQuote.ekstraMaliyetler || []).length > 0) {
                          await updateQuoteEkstraMaliyet(activeQuote.id, []);
                        }
                        setMaliyetItemInputs({});
                        setEkstraMaliyetRows([]);
                        setMaliyetFor(null);
                      }}
                      testID="maliyet-clear"
                    >
                      <Text style={s.confirmBtnGhostText}>{t('history.s039')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.confirmBtn, { backgroundColor: theme.colors.primary }]}
                      onPress={async () => {
                        for (const it of items) {
                          const raw = maliyetItemInputs[it.id];
                          const n = raw != null && raw.trim() !== '' ? Number(raw.replace(',', '.')) : null;
                          const current = it.maliyet != null ? it.maliyet : null;
                          if (n !== current) await updateQuoteItemMaliyet(activeQuote.id, it.id, n);
                        }
                        const cleanedEkstra: QuoteEkstraMaliyetT[] = ekstraMaliyetRows
                          .filter((r) => r.aciklama.trim() !== '' || (r.tutar || '').trim() !== '')
                          .map((r) => ({
                            id: r.id,
                            aciklama: r.aciklama.trim(),
                            tutar: (() => { const n = Number((r.tutar || '').replace(',', '.')); return isNaN(n) ? 0 : n; })(),
                          }));
                        await updateQuoteEkstraMaliyet(activeQuote.id, cleanedEkstra);
                        setMaliyetFor(null);
                      }}
                      testID="maliyet-save"
                    >
                      <Text style={s.confirmBtnDangerText}>{t('history.s040')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!rejectConfirmFor} transparent animationType="fade" onRequestClose={() => setRejectConfirmFor(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setRejectConfirmFor(null)}>
          <TouchableOpacity activeOpacity={1} style={s.confirmBox} onPress={(e) => e.stopPropagation()}>
            <View style={s.confirmIconWrap}>
              <Ionicons name="warning" size={22} color={theme.colors.red} />
            </View>
            <Text style={s.menuTitle}>{t('history.s030')}</Text>
            <Text style={s.confirmBody}>
              {t('history.s031')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnGhost]}
                onPress={() => setRejectConfirmFor(null)}
                testID="reject-approved-cancel"
              >
                <Text style={s.confirmBtnGhostText}>{t('history.s004')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnDanger]}
                onPress={async () => {
                  if (rejectConfirmFor) {
                    try {
                      await updateQuoteStatus(rejectConfirmFor, 'Reddedildi');
                      showToast(t('history.s032'));
                    } catch (e: any) {
                      showToast('Hata: ' + (e?.message || ''));
                    }
                  }
                  setRejectConfirmFor(null);
                }}
                testID="reject-approved-confirm"
              >
                <Text style={s.confirmBtnDangerText}>{t('history.s033')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!approveConfirmFor} transparent animationType="fade" onRequestClose={() => setApproveConfirmFor(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setApproveConfirmFor(null)}>
          <TouchableOpacity activeOpacity={1} style={s.confirmBox} onPress={(e) => e.stopPropagation()}>
            <View style={[s.confirmIconWrap, { backgroundColor: theme.colors.primarySoft }]}>
              <Ionicons name="warning" size={22} color={theme.colors.primary} />
            </View>
            <Text style={s.menuTitle}>{t('history.s052')}</Text>
            <Text style={s.confirmBody}>
              {t('history.s053')}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[s.confirmBtn, s.confirmBtnGhost]}
                onPress={() => setApproveConfirmFor(null)}
                testID="approve-quote-cancel"
              >
                <Text style={s.confirmBtnGhostText}>{t('history.s004')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  if (approveConfirmFor) {
                    try {
                      await updateQuoteStatus(approveConfirmFor, 'Onaylandı');
                      showToast(t('history.s029'));
                    } catch (e: any) {
                      showToast('Hata: ' + (e?.message || ''));
                    }
                  }
                  setApproveConfirmFor(null);
                }}
                testID="approve-quote-confirm"
              >
                <Text style={s.confirmBtnDangerText}>{t('history.s048')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!waMenuFor} transparent animationType="fade" onRequestClose={() => setWaMenuFor(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setWaMenuFor(null)}>
          <View style={s.waMenu} onStartShouldSetResponder={() => true}>
            <Text style={s.menuTitle}>{t('history.s034')}</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {WHATSAPP_TEMPLATES.map((tpl) => {
                const preview = waMenuQuote ? renderWhatsAppTemplate(tpl.body, waMenuQuote, activeCompany?.sirketAdi) : tpl.body;
                return (
                  <TouchableOpacity
                    key={tpl.id}
                    testID={`wa-template-${tpl.id}`}
                    style={s.waTemplateCard}
                    onPress={() => {
                      const quote = waMenuQuote;
                      setWaMenuFor(null);
                      if (!quote) return;
                      if (tpl.id === 'teklif_hazir') {
                        doWhatsApp(quote, preview);
                      } else {
                        doWhatsAppTextOnly(quote, preview);
                      }
                    }}
                  >
                    <View style={s.waTemplateHead}>
                      <Ionicons name={tpl.icon as any} size={15} color="#16a34a" />
                      <Text style={s.waTemplateLabel}>{tpl.label}</Text>
                    </View>
                    <Text style={s.waTemplatePreview} numberOfLines={3}>{preview}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.waCancelBtn} onPress={() => setWaMenuFor(null)}>
              <Text style={s.waCancelText}>{t('history.s004')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statCard: { flexGrow: 1, flexBasis: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
  statSubLabel: { fontSize: 9.5, color: theme.colors.textMuted, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, ...theme.shadow.sm },
  trashEntryBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line, alignItems: 'center', justifyContent: 'center', ...theme.shadow.sm },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  // Yatay ScrollView'un DIŞ style'ı web'de kesin bir yükseklik almazsa
  // (sadece flexGrow:0 yeterli değil) içerik üstten/alttan kırpılıyor --
  // önceki "height: 56" bunu çözüyordu, tamamen kaldırmak baloncukların
  // kaybolmasına (görünmez şekilde kırpılmasına) yol açtı. minHeight ile
  // hem kırpılmayı önlüyoruz hem de chip boyu değişse bile taşmıyor.
  filterRowOuter: { flexGrow: 0, minHeight: 62 },
  filterRow: { flexDirection: 'row', flexWrap: 'nowrap', paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
  filterChip: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 10 },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  filterTextActive: { color: '#fff' },
  emptyBox: { marginTop: 24, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 30, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 10, ...theme.shadow.sm },
  cardTop: { flexDirection: 'row', gap: 10 },
  hNo: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.3 },
  hFirma: { fontSize: 14, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
  hProje: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  hDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  hAmount: { fontSize: 14, fontWeight: '900', color: theme.colors.primary },
  hAmountEquiv: { fontSize: 9.5, color: theme.colors.textMuted, marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, marginTop: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  maliyetRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.line },
  maliyetText: { fontSize: 11, color: theme.colors.navy, fontWeight: '700', flexShrink: 1 },
  maliyetTextMuted: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '700' },
  maliyetTextInput: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.navy, minWidth: 200, textAlign: 'center' },
  itemMaliyetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  itemMaliyetName: { fontSize: 12.5, fontWeight: '800', color: theme.colors.navy },
  itemMaliyetSub: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  itemMaliyetInput: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: theme.colors.navy, width: 90, textAlign: 'center' },
  ekstraMaliyetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  ekstraMaliyetAciklamaInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: theme.colors.navy },
  ekstraMaliyetAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, marginTop: 8 },
  ekstraMaliyetAddText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
  maliyetSummaryBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.line, gap: 4, width: '100%' },
  maliyetSummaryText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.navy, textAlign: 'right' },
  actionBar: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: theme.colors.primarySoft, borderRadius: 10, flex: 1, justifyContent: 'center' },
  actBtnIcon: { width: 40, paddingVertical: 8, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.2 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 30 },
  confirmBox: { backgroundColor: '#fff', padding: 20, borderRadius: 18, alignItems: 'center', ...theme.shadow.lg },
  confirmIconWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.colors.redSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  confirmBody: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 4 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmBtnGhost: { backgroundColor: theme.colors.surfaceSoft },
  confirmBtnGhostText: { color: theme.colors.navy, fontWeight: '800', fontSize: 13 },
  confirmBtnDanger: { backgroundColor: theme.colors.red },
  confirmBtnDangerText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  menu: { backgroundColor: '#fff', padding: 16, borderRadius: 16, gap: 8, ...theme.shadow.lg },
  menuTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.navy, marginBottom: 6, textAlign: 'center' },
  menuItem: { padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  menuItemText: { fontSize: 13, fontWeight: '800' },
  waMenu: { backgroundColor: '#fff', padding: 16, borderRadius: 16, ...theme.shadow.lg, maxHeight: '80%' },
  waTemplateCard: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: '#f8fafc' },
  waTemplateHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  waTemplateLabel: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy },
  waTemplatePreview: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 },
  waCancelBtn: { marginTop: 4, paddingVertical: 10, alignItems: 'center' },
  waCancelText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textMuted },
});

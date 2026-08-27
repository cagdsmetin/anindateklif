import React, { useMemo, useState } from 'react';
import {
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
import TopHeader from '@/src/components/TopHeader';
import { QuoteT } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';
import { buildQuoteFileName } from '@/src/lib/quote-utils';
import { shareQuoteViaWhatsApp, WHATSAPP_TEMPLATES, renderWhatsAppTemplate } from '@/src/lib/whatsapp';
import { mergeAttachmentsIntoPdf } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';

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
  const { quotes, deleteQuote, updateQuoteStatus, activeCompany, showToast, getQuoteAttachments } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>(params.filter === 'bekleyen' ? PENDING_FILTER : 'Tümü');
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [waMenuFor, setWaMenuFor] = useState<string | null>(null);

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

  // USD-first: approved total only counts USD-denominated quotes (mixed currencies aren't summed together).
  const totalValue = quotes.reduce((a, x) => a + (x.durum === 'Onaylandı' && (x.paraBirimi || 'USD') === 'USD' ? x.genelToplam : 0), 0);

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
  const monthOtherCurrenciesLine = Object.keys(monthTotalsByCurrency)
    .filter((c) => c !== 'USD' && monthTotalsByCurrency[c] > 0)
    .map((c) => fmt(monthTotalsByCurrency[c], c))
    .join(', ');

  const openEdit = (id: string) => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: id } });

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
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz.', UTI: 'com.adobe.pdf' });
      } else {
        await downloadFileWeb(result.uri, result.fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast('PDF hatası: ' + (e?.message || '')); }
  };

  const doWhatsApp = async (quote: QuoteT, message?: string) => {
    if (!activeCompany) return;
    // Open the tab synchronously, still inside this click's user-gesture
    // window — PDF generation below takes long enough that window.open()
    // after it gets silently blocked as a popup. See preview.tsx for the
    // same pattern.
    const waWindow = Platform.OS === 'web' ? window.open('', '_blank') : null;
    try {
      const result = await generatePdf(quote);
      if (!result) { if (waWindow) { try { waWindow.close(); } catch {} } return; }
      const r = await shareQuoteViaWhatsApp({ pdfUri: result.uri, fileName: result.fileName, quote, companyName: activeCompany.sirketAdi, message, waWindow });
      if (r.attached && waWindow) { try { waWindow.close(); } catch {} }
    } catch (e: any) {
      if (waWindow) { try { waWindow.close(); } catch {} }
      showToast('WhatsApp hatası: ' + (e?.message || ''));
    }
  };

  const waMenuQuote = waMenuFor ? quotes.find((x) => x.id === waMenuFor) : null;

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Geçmiş" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Geçmiş Teklifler" />
      <View style={{ padding: 14, paddingBottom: 6 }}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Toplam Teklif</Text>
            <Text style={s.statValue}>{quotes.length}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Bekleyen Teklif</Text>
            <Text style={s.statValue}>{pendingCount}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
            <Text style={[s.statLabel, { color: '#166534' }]}>Onaylanan (USD)</Text>
            <Text style={[s.statValue, { color: '#166534', fontSize: 14 }]} numberOfLines={1}>{fmt(totalValue, 'USD')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Bu Ay Oluşturulan</Text>
            <Text style={s.statValue}>{thisMonthCount}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Bu Ay Toplam Hacim</Text>
            <Text style={s.statValue} numberOfLines={1}>{fmt(monthVolumeUSD, 'USD')}</Text>
            {monthOtherCurrenciesLine ? <Text style={s.statSubLabel} numberOfLines={1}>+ {monthOtherCurrenciesLine}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={[s.searchWrap, { flex: 1 }]}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput testID="history-search" style={s.searchInput} placeholder="Firma, teklif no, proje ara..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
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
        {['Tümü', ...STATUSES].map((st) => (
          <TouchableOpacity key={st} testID={`filter-${st}`} style={[s.filterChip, filter === st && s.filterChipActive]} onPress={() => setFilter(st)}>
            <Text style={[s.filterText, filter === st && s.filterTextActive]} allowFontScaling={false}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Kayıtlı teklif yok.</Text>
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
                  <TouchableOpacity testID={`status-${quote.id}`} onPress={() => setStatusMenuFor(quote.id)} style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
                    <Text style={[s.statusText, { color: c.text }]}>{quote.durum}</Text>
                    <Ionicons name="chevron-down" size={11} color={c.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={s.actionBar}>
                <TouchableOpacity style={s.actBtn} onPress={() => openEdit(quote.id)} testID={`edit-quote-${quote.id}`}>
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtn} onPress={() => doShare(quote)} testID={`pdf-${quote.id}`}>
                  <Ionicons name="document-text-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actBtn, { backgroundColor: '#dcfce7' }]} onPress={() => setWaMenuFor(quote.id)} testID={`whatsapp-${quote.id}`}>
                  <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                  <Text style={[s.actText, { color: '#16a34a' }]}>WA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtnIcon} onPress={() => deleteQuote(quote.id)} testID={`delete-quote-${quote.id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>Durum Seç</Text>
            {STATUSES.map((st) => {
              const cc = statusColor(st);
              return (
                <TouchableOpacity key={st} testID={`set-status-${st}`} style={[s.menuItem, { backgroundColor: cc.bg, borderColor: cc.border }]} onPress={async () => {
                  if (statusMenuFor) { await updateQuoteStatus(statusMenuFor, st); showToast('Durum güncellendi'); }
                  setStatusMenuFor(null);
                }}>
                  <Text style={[s.menuItemText, { color: cc.text }]}>{st}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!waMenuFor} transparent animationType="fade" onRequestClose={() => setWaMenuFor(null)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setWaMenuFor(null)}>
          <View style={s.waMenu} onStartShouldSetResponder={() => true}>
            <Text style={s.menuTitle}>Mesaj Şablonu Seç</Text>
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
                      if (quote) doWhatsApp(quote, preview);
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
              <Text style={s.waCancelText}>Vazgeç</Text>
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
  filterRowOuter: { flexGrow: 0, height: 56 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  filterChip: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
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
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, marginTop: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  actionBar: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: theme.colors.primarySoft, borderRadius: 10, flex: 1, justifyContent: 'center' },
  actBtnIcon: { width: 40, paddingVertical: 8, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.2 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 30 },
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

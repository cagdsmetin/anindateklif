import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { buildQuotePdfHtml, PdfTemplateId } from '@/src/lib/pdf';
import { buildQuoteFileName } from '@/src/lib/quote-utils';
import { fetchQuoteExcelBytes } from '@/src/lib/api';
import { shareQuoteViaWhatsApp, canShareFilesWeb } from '@/src/lib/whatsapp';
import { mergeAttachmentsIntoPdf, bytesToBase64 } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';

const TEMPLATES: { id: PdfTemplateId; label: string }[] = [
  { id: 'classic', label: 'Klasik' },
  { id: 'modern', label: 'Modern' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'kurumsal', label: 'Kurumsal' },
  { id: 'renkli', label: 'Renkli' },
];

const SHARE_MESSAGE = 'Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz.';

// The real exported PDF is always rasterized at a fixed 794px page width
// (see PAGE_PX_WIDTH in pdf-web.ts, ~A4 @96dpi) — logo/text proportions are
// only correct at that width. Without this, the on-screen preview (iframe
// on web / WebView on native) renders the same HTML at whatever width the
// container happens to be, so a big logo can look tiny on a wide desktop
// window even though the actual PDF is fine. Forcing the same fixed width
// here — then letting the browser/WebView scale that fixed page down to
// fit the screen — makes the preview pixel-proportion-match the real file.
const PREVIEW_PAGE_WIDTH = 794;
function withFixedPreviewWidth(html: string): string {
  return html.replace(
    '</head>',
    `<style>html,body{width:${PREVIEW_PAGE_WIDTH}px;max-width:${PREVIEW_PAGE_WIDTH}px;margin:0 auto;}</style></head>`
  );
}

export default function PreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ quoteId?: string }>();
  const { quotes, activeCompany, showToast, getQuoteAttachments } = useApp();

  const quote = useMemo(() => quotes.find((q) => q.id === params.quoteId), [quotes, params.quoteId]);
  const [template, setTemplate] = useState<PdfTemplateId>('classic');

  // Web only: the on-screen preview renders the REAL exported PDF (same
  // generatePdf() pipeline used by "PDF Paylaş"/"WhatsApp" below, attachments
  // merged in) instead of raw HTML — so uploaded attachments actually show up
  // here, and the preview can never drift from what actually gets shared.
  // Re-generated whenever the template or the quote changes.
  const [webPreviewUri, setWebPreviewUri] = useState<string | null>(null);
  const [webPreviewLoading, setWebPreviewLoading] = useState(false);
  const [webPreviewError, setWebPreviewError] = useState<string | null>(null);

  // Guarded internally (throws if the quote/company aren't loaded yet) so
  // this can be defined — and referenced by the effect below — before the
  // early "not found" return, keeping every hook call unconditional as
  // React's rules require.
  const generatePdf = async () => {
    if (!quote || !activeCompany) throw new Error('Teklif veya firma bulunamadı');
    const html = buildQuotePdfHtml(activeCompany, quote, template);
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

  useEffect(() => {
    if (Platform.OS !== 'web' || !quote || !activeCompany) return;
    let cancelled = false;
    setWebPreviewLoading(true);
    setWebPreviewError(null);
    (async () => {
      try {
        const { uri } = await generatePdf();
        if (!cancelled) setWebPreviewUri(uri);
      } catch (e: any) {
        if (!cancelled) setWebPreviewError(e?.message || 'Önizleme oluşturulamadı');
      } finally {
        if (!cancelled) setWebPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, quote?.id]);

  if (!quote || !activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={theme.colors.text} /></TouchableOpacity>
          <Text style={s.topTitle}>Önizleme</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={s.empty}><Text style={{ color: theme.colors.textMuted }}>Teklif bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  const doShare = async () => {
    try {
      const { uri, fileName } = await generatePdf();
      // Web: browsers don't reliably support handing a blob: PDF to
      // navigator.share (Sharing.isAvailableAsync() can report `true` just
      // because the Web Share API exists, then shareAsync() throws
      // "Invalid URL" because blob: URIs aren't a valid share target) — so
      // on web we always go straight to a real file download, which is also
      // what "PDF Paylaş" is supposed to do here per the button's own label.
      if (Platform.OS === 'web') {
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
        return;
      }
      const avail = await Sharing.isAvailableAsync();
      if (avail) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: SHARE_MESSAGE, UTI: 'com.adobe.pdf' });
      } else {
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast('PDF hatası: ' + (e?.message || '')); }
  };

  // Covers the WHOLE flow (PDF generation + WhatsApp hand-off), not just the
  // save step — previously nothing disabled the button while the PDF was
  // being rendered, so a slow/unstable connection made it look like the
  // screen had frozen (no feedback, and repeated taps could stack up
  // multiple popups/PDF generations at once).
  const [waSharing, setWaSharing] = useState(false);
  const doWhatsAppShare = async () => {
    if (waSharing) return;
    setWaSharing(true);
    showToast('Hazırlanıyor...');
    // On web, open a blank tab synchronously — right here, still inside the
    // click handler's user-gesture window — before any `await`. PDF
    // generation below can take a second or more; calling window.open()
    // only after that delay is what was silently getting blocked by the
    // browser's popup blocker (no error, WhatsApp just never opened). We
    // navigate this already-open tab to the real wa.me URL once it's ready.
    const waWindow = Platform.OS === 'web' && !canShareFilesWeb() ? window.open('', '_blank') : null;
    try {
      const { uri, fileName } = await generatePdf();
      const result = await shareQuoteViaWhatsApp({ pdfUri: uri, fileName, quote, companyName: activeCompany.sirketAdi, waWindow });
      // WhatsApp's web/deep-link URLs can never carry a file — when the native
      // share sheet isn't available we download the PDF and open the chat, so
      // let the user know the one manual step they still need to do.
      if (result.downloaded) {
        showToast('PDF indirildi — WhatsApp Web açıldı, sohbeti seçip dosyayı sürükleyip bırakın');
      }
      if (result.attached && waWindow) { try { waWindow.close(); } catch {} }
    } catch (e: any) {
      if (waWindow) { try { waWindow.close(); } catch {} }
      showToast('WhatsApp hatası: ' + (e?.message || ''));
    } finally {
      setWaSharing(false);
    }
  };

  // Excel (.xlsx) indirme -- kalem tablosunu ve toplamları muhasebe/ERP'ye
  // aktarım veya kendi arşivi için tablo halinde isteyen kullanıcılar için.
  // PDF akışından bağımsız: xlsx kütüphanesiyle (zaten Katalog içe aktarmada
  // kullanılıyor) doğrudan bir workbook üretilip web'de indiriliyor / native'de
  // paylaşım sayfası açılıyor.
  const doExcelDownload = async () => {
    try {
      // Görsel tasarım (marka renkleri, kalın başlıklar) sunucuda openpyxl ile
      // üretiliyor -- istemcideki ücretsiz 'xlsx' kütüphanesi stil yazamıyor.
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

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.colors.navy} /></TouchableOpacity>
        <Text style={s.topTitle}>PDF Önizleme</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* TEMPLATE PICKER — lets the user preview and pick which quote design
          gets shared/printed. "Klasik" is the original design and stays the
          default so nothing changes unless the user actively switches. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.templateBar} contentContainerStyle={s.templateBarContent}>
        {TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTemplate(t.id)}
            style={[s.templateChip, template === t.id && s.templateChipActive]}
            testID={`template-${t.id}`}
          >
            <Text style={[s.templateChipText, template === t.id && s.templateChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* All three templates render from the exact HTML used for the real
          PDF (buildQuotePdfHtml), pinned to the same fixed page width the
          export uses (withFixedPreviewWidth) — so what's shown here can
          never drift out of proportion or fall out of sync with what
          actually gets shared. react-native-webview has no web
          implementation, so on web we fall back to a plain iframe. */}
      <View style={s.webviewWrap} testID="preview-webview-wrap">
        {Platform.OS === 'web' ? (
          webPreviewUri ? (
            // Real PDF blob URL — the browser's own PDF viewer renders it,
            // so pagination, backgrounds and any merged attachment pages are
            // exactly what "PDF Paylaş"/"WhatsApp" will actually send.
            React.createElement('iframe', {
              key: webPreviewUri,
              'data-testid': 'preview-webview',
              src: webPreviewUri,
              style: { flex: 1, width: '100%', height: '100%', border: 'none' },
              title: 'PDF Önizleme',
            })
          ) : (
            <View style={s.previewStatus}>
              {webPreviewError ? (
                <Text style={s.previewStatusText}>{webPreviewError}</Text>
              ) : (
                <>
                  <ActivityIndicator color={theme.colors.primary} />
                  <Text style={s.previewStatusText}>Önizleme hazırlanıyor…</Text>
                </>
              )}
            </View>
          )
        ) : (
          <WebView
            key={template}
            testID="preview-webview"
            originWhitelist={['*']}
            source={{ html: withFixedPreviewWidth(buildQuotePdfHtml(activeCompany, quote, template)) }}
            style={s.webview}
            scalesPageToFit
            javaScriptEnabled={false}
          />
        )}
      </View>

      {/* Android'de react-native-webview bir SurfaceView ile render olur ve
          RN'in view sırasından bağımsız olarak HER ZAMAN diğer native
          view'ların üstünde çizilir -- bu yüzden bu bar önceden
          position:'absolute' ile WebView'in üzerine bindirilmişti: görsel
          olarak doğru duruyordu ama dokunuşlar butonlara değil altındaki
          WebView'e gidiyordu (WhatsApp/PDF Paylaş butonlarının "hiçbir şey
          yapmaması" bundandı). Barı normal flex akışına alıp WebView ile
          hiç örtüşmeyecek şekilde ayırmak bu sınıfın kökten çözümü. */}
      <View style={[s.actionBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.actionBtnGhost} onPress={() => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: quote.id } })} testID="preview-edit-btn">
          <Ionicons name="pencil" size={16} color={theme.colors.textSoft} />
          <Text style={s.actionBtnGhostText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnAcc} onPress={doShare} testID="preview-pdf-btn">
          <Ionicons name="share-social" size={16} color="#fff" />
          <Text style={s.actionBtnAccText}>PDF Paylaş</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtnWa, waSharing && { opacity: 0.6 }]} onPress={doWhatsAppShare} disabled={waSharing} testID="preview-wa-btn">
          {waSharing ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="logo-whatsapp" size={16} color="#fff" /><Text style={s.actionBtnAccText}>WhatsApp</Text></>)}
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnExcel} onPress={doExcelDownload} testID="preview-excel-btn" hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
          <Ionicons name="grid-outline" size={18} color="#107C41" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  topTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.navy },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  templateBar: { flexGrow: 0, flexShrink: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  templateBarContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  templateChip: { minWidth: 84, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: theme.colors.line, backgroundColor: '#fff' },
  templateChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  templateChipText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textSoft },
  templateChipTextActive: { color: theme.colors.primary },
  webviewWrap: { flex: 1, backgroundColor: '#e9edf2' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  previewStatus: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  previewStatusText: { fontSize: 12.5, color: theme.colors.textMuted, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  actionBar: {
    backgroundColor: '#fff', padding: 10, flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: theme.colors.line,
    ...Platform.select({ android: { elevation: 8 }, ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: -2 } } }),
  },
  actionBtnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff', flex: 1 },
  actionBtnGhostText: { color: theme.colors.textSoft, fontWeight: '900', fontSize: 12 },
  actionBtnAcc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary, flex: 1.2 },
  actionBtnAccText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  actionBtnWa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#25D366', flex: 1 },
  actionBtnExcel: { width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#C8E6C9' },
});

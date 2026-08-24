import React, { useMemo, useState } from 'react';
import {
  Platform,
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
import { shareQuoteViaWhatsApp } from '@/src/lib/whatsapp';
import { mergeAttachmentsIntoPdf } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';

const TEMPLATES: { id: PdfTemplateId; label: string }[] = [
  { id: 'classic', label: 'Klasik' },
  { id: 'modern', label: 'Modern' },
  { id: 'minimal', label: 'Minimal' },
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

  const generatePdf = async () => {
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

  const doShare = async () => {
    try {
      const { uri, fileName } = await generatePdf();
      const avail = await Sharing.isAvailableAsync();
      if (avail) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: SHARE_MESSAGE, UTI: 'com.adobe.pdf' });
      } else {
        // Web: no native share sheet — trigger a real browser download instead.
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast('PDF hatası: ' + (e?.message || '')); }
  };

  const doWhatsAppShare = async () => {
    try {
      const { uri, fileName } = await generatePdf();
      const result = await shareQuoteViaWhatsApp({ pdfUri: uri, fileName, quote, companyName: activeCompany.sirketAdi });
      // WhatsApp's web/deep-link URLs can never carry a file — when the native
      // share sheet isn't available we download the PDF and open the chat, so
      // let the user know the one manual step they still need to do.
      if (result.downloaded) {
        showToast('PDF indirildi — WhatsApp’ta açılan sohbete dosyayı sürükleyip bırakın');
      }
    } catch (e: any) { showToast('WhatsApp hatası: ' + (e?.message || '')); }
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
      <View style={s.templateBar}>
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
      </View>

      {/* All three templates render from the exact HTML used for the real
          PDF (buildQuotePdfHtml), pinned to the same fixed page width the
          export uses (withFixedPreviewWidth) — so what's shown here can
          never drift out of proportion or fall out of sync with what
          actually gets shared. react-native-webview has no web
          implementation, so on web we fall back to a plain iframe. */}
      <View style={s.webviewWrap} testID="preview-webview-wrap">
        {Platform.OS === 'web' ? (
          React.createElement('iframe', {
            key: template,
            'data-testid': 'preview-webview',
            srcDoc: withFixedPreviewWidth(buildQuotePdfHtml(activeCompany, quote, template)),
            style: { flex: 1, width: '100%', height: '100%', border: 'none' },
            title: 'PDF Önizleme',
          })
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

      <View style={[s.actionBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.actionBtnGhost} onPress={() => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: quote.id } })} testID="preview-edit-btn">
          <Ionicons name="pencil" size={16} color={theme.colors.textSoft} />
          <Text style={s.actionBtnGhostText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnAcc} onPress={doShare} testID="preview-pdf-btn">
          <Ionicons name="share-social" size={16} color="#fff" />
          <Text style={s.actionBtnAccText}>PDF Paylaş</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnWa} onPress={doWhatsAppShare} testID="preview-wa-btn">
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          <Text style={s.actionBtnAccText}>WhatsApp</Text>
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
  templateBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  templateChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: theme.colors.line, backgroundColor: '#fff' },
  templateChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  templateChipText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textSoft },
  templateChipTextActive: { color: theme.colors.primary },
  webviewWrap: { flex: 1, backgroundColor: '#e9edf2' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', padding: 10, flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: theme.colors.line,
    ...Platform.select({ android: { elevation: 8 }, ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: -2 } } }),
  },
  actionBtnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff', flex: 1 },
  actionBtnGhostText: { color: theme.colors.textSoft, fontWeight: '900', fontSize: 12 },
  actionBtnAcc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary, flex: 1.2 },
  actionBtnAccText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  actionBtnWa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#25D366', flex: 1 },
});

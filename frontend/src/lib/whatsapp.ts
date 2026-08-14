import { Platform, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { QuoteT } from './api';
import { downloadFileWeb } from './web-download';

/**
 * Normalize a Turkish phone number to E.164 without '+' (WhatsApp URL-friendly).
 */
export function normalizePhoneForWhatsApp(raw?: string): string {
  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length === 12) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return '90' + digits.substring(1);
  if (digits.length === 10 && digits.startsWith('5')) return '90' + digits;
  return digits;
}

export function composeQuoteWhatsAppMessage(quote: QuoteT, sirketAdi?: string): string {
  const musteri = (quote.musYetkili || quote.musFirma || 'Değerli Müşterimiz').trim();
  const firma = (sirketAdi || 'Firmamız').trim();
  return (
    `Merhaba ${musteri},\n\n` +
    `${quote.teklifNo} numaralı teklifinizi hazırladık — PDF olarak ekteki dosyada iletilmiştir.\n\n` +
    `Herhangi bir sorunuz olursa bize dönüş yapabilirsiniz.\n\n` +
    `İyi çalışmalar dileriz,\n${firma}`
  );
}

/**
 * Best-effort deep link into a specific WhatsApp chat, text only.
 * Kept for the web download-companion tab; NOT used in the primary native flow
 * because deep links can't attach files (they'd only send text).
 */
export async function openWhatsAppChat(phone: string, message: string): Promise<boolean> {
  const cleaned = normalizePhoneForWhatsApp(phone);
  const text = encodeURIComponent(message || '');
  if (Platform.OS === 'web') {
    const url = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;
    try { window.open(url, '_blank'); return true; } catch { return false; }
  }
  const appUrl = cleaned ? `whatsapp://send?phone=${cleaned}&text=${text}` : `whatsapp://send?text=${text}`;
  const webUrl = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;
  try {
    if (await Linking.canOpenURL(appUrl)) { await Linking.openURL(appUrl); return true; }
    await Linking.openURL(webUrl); return true;
  } catch { return false; }
}

/**
 * Share the quote PDF via WhatsApp.
 *
 * IMPORTANT — Why this is a single Sharing.shareAsync call (not a deep link + share):
 * WhatsApp's `whatsapp://send?...` / `wa.me/...` URL schemes ONLY accept text; there
 * is no supported way to attach a file via URL. The previous two-step flow (deep-link
 * chat, then share sheet) was misleading because the deep-link step sent text only —
 * users perceived it as "the PDF didn't go". The correct, WhatsApp-officially-supported
 * way to send a PDF is via the native share sheet, where WhatsApp appears as a target.
 *
 * We also copy the freshly-generated PDF into the persistent cache directory with a
 * clean filename. Some Android OEMs restrict WhatsApp's read access to files that
 * live outside a standard cache path, or reject files whose names contain unusual
 * characters — the copy sidesteps both issues.
 */
export async function shareQuoteViaWhatsApp(opts: {
  pdfUri: string;
  quote: QuoteT;
  companyName?: string;
  fileName?: string;
}): Promise<void> {
  const { pdfUri, quote, companyName, fileName } = opts;
  const message = composeQuoteWhatsAppMessage(quote, companyName);

  // ---------- WEB ----------
  // No native share sheet in browsers. Force a real, correctly-named download of the
  // PDF (including any merged attachments) AND open WhatsApp Web pre-filled with the
  // caption in a second tab, so the user can drag the downloaded file into the chat.
  if (Platform.OS === 'web') {
    try {
      const cleaned = normalizePhoneForWhatsApp(quote.musTelefon || '');
      const text = encodeURIComponent(message);
      const waUrl = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;
      const desiredName = fileName || `${(quote.teklifNo || 'teklif').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
      await downloadFileWeb(pdfUri, desiredName);
      window.open(waUrl, '_blank');            // WhatsApp Web opens with caption
    } catch {}
    return;
  }

  // ---------- NATIVE (iOS / Android) ----------
  // 1) Move (or copy) the PDF into a stable cache path with a friendly filename.
  let stableUri = pdfUri;
  try {
    const cacheDir = FileSystem.cacheDirectory || '';
    if (cacheDir) {
      const safeNo = (quote.teklifNo || `Teklif-${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, '_');
      const targetUri = `${cacheDir}${safeNo}.pdf`;
      // Overwrite any previous copy for the same teklifNo to keep the cache tidy.
      try { await FileSystem.deleteAsync(targetUri, { idempotent: true }); } catch {}
      if (pdfUri.startsWith(cacheDir)) {
        // Already in cache — just rename in place so WhatsApp gets a nice title.
        try { await FileSystem.moveAsync({ from: pdfUri, to: targetUri }); stableUri = targetUri; }
        catch { stableUri = pdfUri; }
      } else {
        try { await FileSystem.copyAsync({ from: pdfUri, to: targetUri }); stableUri = targetUri; }
        catch { stableUri = pdfUri; }
      }
    }
  } catch {
    stableUri = pdfUri;
  }

  // 2) Verify the file actually exists before invoking the share sheet — surfaces
  //    permission/path errors early instead of showing an empty share dialog.
  try {
    const info = await FileSystem.getInfoAsync(stableUri);
    if (!info.exists) throw new Error('PDF dosyası oluşturulamadı');
  } catch (e) {
    throw e;
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    // Extremely rare on modern iOS/Android — fall back to a WA text-only deep link.
    await openWhatsAppChat(quote.musTelefon || '', message + '\n\n(PDF paylaşımı bu cihazda desteklenmiyor.)');
    return;
  }

  // 3) Native share sheet with the PDF. `dialogTitle` becomes the WhatsApp caption
  //    hint on Android; `UTI` is required for iOS to recognize the file as a PDF.
  await Sharing.shareAsync(stableUri, {
    mimeType: 'application/pdf',
    dialogTitle: message,
    UTI: 'com.adobe.pdf',
  });
}

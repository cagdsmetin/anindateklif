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

function fmtMoney(n: number, cur: string): string {
  const parts = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${parts}`;
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

// ============================================================================
// WHATSAPP MESSAGE TEMPLATES
//
// A small library of pre-built messages the user can pick from when sharing a
// quote via WhatsApp. Each template body uses simple {variable} placeholders
// that get substituted with real quote/company data at send time.
//
// Supported placeholders: {musteri} {isletme} {tutar} {teklifNo}
// ============================================================================

export type WhatsAppTemplateId = 'teklif_hazir' | 'odeme_hatirlatma' | 'randevu_hatirlatma' | 'tesekkur';

export type WhatsAppTemplate = {
  id: WhatsAppTemplateId;
  label: string;
  icon: string; // Ionicons name
  body: string;
};

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'teklif_hazir',
    label: 'Teklif Hazır',
    icon: 'document-text-outline',
    body:
      'Merhaba {musteri},\n\n' +
      '{teklifNo} numaralı teklifiniz hazır — PDF olarak ekte iletilmiştir. Toplam tutar: {tutar}.\n\n' +
      'Herhangi bir sorunuz olursa bize dönüş yapabilirsiniz.\n\n' +
      'İyi çalışmalar dileriz,\n{isletme}',
  },
  {
    id: 'odeme_hatirlatma',
    label: 'Ödeme Hatırlatma',
    icon: 'cash-outline',
    body:
      'Merhaba {musteri},\n\n' +
      '{teklifNo} numaralı teklifinizle ilgili {tutar} tutarındaki ödemenizi hatırlatmak isteriz.\n\n' +
      'Uygun olduğunuzda tarafımıza bilgi verebilirseniz memnun oluruz.\n\n' +
      'Teşekkür ederiz,\n{isletme}',
  },
  {
    id: 'randevu_hatirlatma',
    label: 'Randevu / Servis Hatırlatma',
    icon: 'calendar-outline',
    body:
      'Merhaba {musteri},\n\n' +
      '{teklifNo} numaralı işinizle ilgili randevunuzu hatırlatmak isteriz.\n\n' +
      'Herhangi bir değişiklik olursa lütfen bize bildirin.\n\n' +
      'İyi çalışmalar dileriz,\n{isletme}',
  },
  {
    id: 'tesekkur',
    label: 'Teşekkür',
    icon: 'heart-outline',
    body:
      'Merhaba {musteri},\n\n' +
      'Bizi tercih ettiğiniz için teşekkür ederiz! {teklifNo} numaralı işinizle ilgili herhangi bir sorunuz olursa bize ulaşabilirsiniz.\n\n' +
      'Saygılarımızla,\n{isletme}',
  },
];

/**
 * Fill a template body's {musteri} {isletme} {tutar} {teklifNo} placeholders
 * with real values from a quote + company name.
 */
export function renderWhatsAppTemplate(body: string, quote: QuoteT, companyName?: string): string {
  const musteri = (quote.musYetkili || quote.musFirma || 'Değerli Müşterimiz').trim();
  const isletme = (companyName || 'Firmamız').trim();
  const tutar = fmtMoney(quote.genelToplam, quote.paraBirimi);
  const teklifNo = quote.teklifNo || '';
  return body
    .replace(/\{musteri\}/g, musteri)
    .replace(/\{isletme\}/g, isletme)
    .replace(/\{tutar\}/g, tutar)
    .replace(/\{teklifNo\}/g, teklifNo);
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
  message?: string;
}): Promise<void> {
  const { pdfUri, quote, companyName, fileName } = opts;
  const message = opts.message || composeQuoteWhatsAppMessage(quote, companyName);

  // ---------- WEB ----------
  if (Platform.OS === 'web') {
    const desiredName = fileName || `${(quote.teklifNo || 'teklif').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
    const cleaned = normalizePhoneForWhatsApp(quote.musTelefon || '');
    const text = encodeURIComponent(message);
    const waUrl = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;

    // Preferred: the OS-native share sheet (Web Share API, files supported on
    // HTTPS in current Chrome/Edge/Safari — desktop and mobile). This lets the
    // user tap WhatsApp directly with the PDF already attached — no separate
    // save/download step at all.
    try {
      const res = await fetch(pdfUri);
      const blob = await res.blob();
      const file = new File([blob], desiredName, { type: 'application/pdf' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: message, title: desiredName });
        return;
      }
    } catch {
      // Fall through to the download + wa.me fallback below (also covers the
      // user dismissing the share sheet, which throws an AbortError).
    }

    // Fallback (older browsers without file sharing support): download the
    // PDF (including any merged attachments) AND open WhatsApp with the
    // caption pre-filled, so the user can attach the already-downloaded file.
    try {
      await downloadFileWeb(pdfUri, desiredName);
      window.open(waUrl, '_blank');
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

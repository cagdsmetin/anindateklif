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
 * Result of shareQuoteViaWhatsApp — tells the caller whether the PDF actually
 * got attached automatically, or whether the user still needs to attach it
 * by hand (see the 'attachManually' branch below for why that can happen).
 */
export type WhatsAppShareResult = {
  /** true: PDF was handed straight to WhatsApp (native share sheet / Web Share API). */
  attached: boolean;
  /** true: we downloaded the PDF to the computer and the user must drag it into the opened chat. */
  downloaded: boolean;
};

/**
 * Share the quote PDF via WhatsApp.
 *
 * IMPORTANT — platform limitation that shapes this whole function:
 * WhatsApp's `whatsapp://send?...` / `wa.me/...` / `web.whatsapp.com/send?...` URL
 * schemes ONLY accept pre-filled TEXT. There is no URL parameter, query string, or
 * official API that can attach a file — this is a hard limitation of WhatsApp's own
 * web/deep-link surface, not something our code can work around. The ONLY way to
 * hand a file to WhatsApp programmatically is the browser's native share sheet
 * (Web Share API with `files`), which only works when the browser/OS exposes
 * WhatsApp (or WhatsApp Desktop) as a registered share target — mobile Chrome/Safari
 * mostly, some desktop setups with WhatsApp Desktop installed, but NOT the general
 * case on a desktop browser with only WhatsApp Web available.
 *
 * So the flow is:
 *   1) Try the native share sheet with the PDF file attached (works silently when
 *      supported — no extra step for the user at all).
 *   2) If that's unavailable or fails, we cannot attach the file automatically.
 *      In that case we download the PDF (so it's one click away in the Downloads
 *      folder) AND open the WhatsApp chat with the message pre-filled, so the user
 *      only has to drag-and-drop the just-downloaded file into the chat that's
 *      already open — the smallest possible manual step given the platform limit.
 *
 * The return value tells the caller (the Preview screen) which path was taken, so
 * it can show the right toast — e.g. "PDF indirildi, WhatsApp'a sürükleyin" only
 * when a manual attach step is actually needed.
 */
export async function shareQuoteViaWhatsApp(opts: {
  pdfUri: string;
  quote: QuoteT;
  companyName?: string;
  fileName?: string;
  message?: string;
}): Promise<WhatsAppShareResult> {
  const { pdfUri, quote, companyName, fileName } = opts;
  const message = opts.message || composeQuoteWhatsAppMessage(quote, companyName);

  // ---------- WEB ----------
  if (Platform.OS === 'web') {
    const desiredName = fileName || `${(quote.teklifNo || 'teklif').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
    const cleaned = normalizePhoneForWhatsApp(quote.musTelefon || '');
    const text = encodeURIComponent(message);
    const waUrl = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;

    // Preferred: the OS-native share sheet (Web Share API, files supported on
    // HTTPS in current Chrome/Edge/Safari where a share target is registered).
    // This lets the user tap WhatsApp directly with the PDF already attached —
    // no separate save/download step at all.
    try {
      const res = await fetch(pdfUri);
      const blob = await res.blob();
      const file = new File([blob], desiredName, { type: 'application/pdf' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: message, title: desiredName });
        return { attached: true, downloaded: false };
      }
    } catch (e: any) {
      // AbortError = user closed the share sheet without picking anything —
      // treat that as "done", don't also force a download on top of it.
      if (e && e.name === 'AbortError') return { attached: false, downloaded: false };
      // Any other failure (file sharing unsupported, share target rejected the
      // file, etc.) falls through to the download+open fallback below.
    }

    // Fallback: there is no way to hand WhatsApp a file via URL, so download the
    // PDF and open the chat with the note pre-filled — the user just drags the
    // downloaded file into the chat that opens.
    await downloadFileWeb(pdfUri, desiredName);
    window.open(waUrl, '_blank');
    return { attached: false, downloaded: true };
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
    return { attached: false, downloaded: false };
  }

  // 3) Native share sheet with the PDF. `dialogTitle` becomes the WhatsApp caption
  //    hint on Android; `UTI` is required for iOS to recognize the file as a PDF.
  await Sharing.shareAsync(stableUri, {
    mimeType: 'application/pdf',
    dialogTitle: message,
    UTI: 'com.adobe.pdf',
  });
  return { attached: true, downloaded: false };
}

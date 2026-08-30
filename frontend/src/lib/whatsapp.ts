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
// Feature detection only (no File instance needed yet) -- lets callers decide
// UP FRONT, synchronously, whether the browser can hand a file to WhatsApp via
// the native share sheet. Browsers that expose `canShare` alongside `share`
// are, in practice, exactly the ones that also support the `files` option
// (mobile Chrome/Safari) -- desktop browsers almost universally lack
// `canShare` entirely. Knowing this before any `await` matters because it
// lets us skip the "pre-open a blank tab" popup-blocker workaround entirely
// on capable browsers, where it's not just unnecessary but visibly opens and
// closes an empty tab for no reason.
// The Web Share API's `canShare({files})` check reports `true` on desktop
// Chrome/Edge/Safari too (they DO implement the API), but the actual share
// sheet it opens there is the OS's generic "Share" panel -- AirDrop, Mail,
// Notes, etc. WhatsApp Desktop doesn't register itself as a target in that
// panel on macOS or Windows, so picking anything from it never reaches
// WhatsApp; at best the person ends up sharing to some other app by mistake.
// On an actual mobile browser (opening this site in mobile Chrome/Safari,
// not the compiled app), that same share sheet DOES list WhatsApp and DOES
// hand it the file correctly -- that's the one case worth using it for.
function isMobileWebBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
}

// Reported to callers so they know whether to skip pre-opening a blank tab:
// true only for the one path that hands WhatsApp the file synchronously
// enough to need no fallback window at all (mobile native share). Desktop
// always needs the pre-opened tab -- it ends up going through the Save-As
// dialog + WhatsApp Web fallback below, which happens well after the
// original click's popup-blocker-exempt window.
export function canShareFilesWeb(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  if (!isMobileWebBrowser()) return false;
  const nav: any = navigator;
  return typeof nav.share === 'function' && typeof nav.canShare === 'function';
}

// Chrome/Edge desktop support letting the person pick exactly where to save
// via a native Save-As dialog (File System Access API) instead of a silent
// drop into the Downloads folder. Returns true if the person actually saved
// a file, false if they cancelled the dialog, and null if the browser
// doesn't support this API at all (Safari, Firefox) so the caller can fall
// back to a plain auto-download.
async function trySaveFilePickerWeb(pdfUri: string, fileName: string): Promise<boolean | null> {
  const w: any = window;
  if (typeof w.showSaveFilePicker !== 'function') return null;
  try {
    const res = await fetch(pdfUri);
    const blob = await res.blob();
    const handle = await w.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e: any) {
    if (e && e.name === 'AbortError') return false; // person cancelled the dialog
    return null; // some other failure -- fall back to auto-download
  }
}

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
  /**
   * true: the quote had no customer phone number on file, so we could not land
   * directly in a pre-filled chat -- the message text was copied to the
   * clipboard instead so the person can paste it themselves after picking a
   * chat in the WhatsApp Web chat list that just opened.
   */
  messageCopied?: boolean;
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
  /**
   * Web only: a tab already opened synchronously (inside the triggering
   * click handler, before any `await`) via `window.open('', '_blank')`. We
   * navigate this tab to the wa.me URL instead of calling `window.open()`
   * ourselves down here — by this point we're well past the original click's
   * user-gesture window (PDF generation alone can take a second or more),
   * so a fresh `window.open()` call here gets silently blocked by the
   * browser's popup blocker. Navigating an already-open tab is not blocked.
   */
  waWindow?: Window | null;
}): Promise<WhatsAppShareResult> {
  const { pdfUri, quote, companyName, fileName, waWindow } = opts;
  const message = opts.message || composeQuoteWhatsAppMessage(quote, companyName);

  // ---------- WEB ----------
  if (Platform.OS === 'web') {
    const desiredName = fileName || `${(quote.teklifNo || 'teklif').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
    // If the quote has a customer phone number on file, jump straight into
    // that person's chat with the message already filled in via wa.me's
    // ?text= param -- this is the only way WhatsApp accepts pre-filled text.
    // The PDF still needs to be dragged in by hand either way (see the big
    // comment above this function), but at least the text arrives correctly.
    // Without a phone number we can't target a specific chat, so we fall
    // back to the bare chat list and copy the message to the clipboard
    // instead (handled further below) so it isn't just silently lost.
    const cleanedPhone = normalizePhoneForWhatsApp(quote.musTelefon || '');
    const waUrl = cleanedPhone
      ? `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`
      : 'https://web.whatsapp.com/';
    let messageCopied = false;
    if (!cleanedPhone) {
      try {
        const nav: any = navigator;
        if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
          await nav.clipboard.writeText(message);
          messageCopied = true;
        }
      } catch { /* best-effort only */ }
    }

    // Preferred, mobile browsers ONLY: the OS-native share sheet actually lists
    // WhatsApp and hands it the file directly there — no separate save/attach
    // step at all. Desktop browsers implement the same API but WhatsApp
    // Desktop isn't a registered target in their share panel, so trying this
    // on desktop just leads to a dead end (see isMobileWebBrowser() above).
    if (isMobileWebBrowser()) {
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
        if (e && e.name === 'AbortError') return { attached: false, downloaded: false };
        // Falls through to the save/download + open fallback below.
      }
    }

    // Desktop (and any mobile browser where the share attempt above didn't
    // apply/fall through): there is no way to hand WhatsApp a file via URL, so
    // get the PDF onto disk and open WhatsApp Web — the user drags the file
    // from wherever they just saved it into the chat they pick.
    //
    // Prefer an explicit Save-As dialog (Chrome/Edge) over a silent auto-drop
    // into Downloads: the person sees exactly where the file is going and
    // picks the spot themselves, rather than having to go hunting for it
    // afterward.
    const saved = await trySaveFilePickerWeb(pdfUri, desiredName);
    if (saved === false) {
      // Person explicitly cancelled the save dialog — don't force a download
      // or open WhatsApp on top of that.
      return { attached: false, downloaded: false };
    }
    if (saved === null) {
      // Browser doesn't support the Save-As picker (Safari/Firefox) — fall
      // back to the old silent auto-download.
      await downloadFileWeb(pdfUri, desiredName);
    }
    if (waWindow) {
      try { waWindow.location.href = waUrl; } catch { window.open(waUrl, '_blank'); }
    } else {
      window.open(waUrl, '_blank');
    }
    return { attached: false, downloaded: true, messageCopied };
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

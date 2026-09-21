import { Platform, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { QuoteT } from './api';
import { downloadFileWeb } from './web-download';
import { promptWhatsAppShareWeb } from './wa-share-prompt-web';

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

// Mobile web is the dividing line for the whole web share flow, because it is
// the only place the browser's share sheet can actually reach WhatsApp.
//
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
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  // iPadOS 13+ Safari reports itself as "Macintosh; Intel Mac OS X", so a UA
  // check alone misses it — the giveaway is that a real Mac has no
  // touchscreen. Without this an iPad took the desktop path (Save-As dialog +
  // WhatsApp Web + drag-and-drop) even though its share sheet lists WhatsApp
  // and hands over the PDF perfectly.
  if (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1) return true;
  return false;
}

/**
 * Whether the caller should pre-open a blank tab synchronously (inside the
 * click, before any `await`) for us to navigate to WhatsApp Web once the PDF
 * is ready. Desktop only, deliberately.
 *
 * On a phone `window.open('', '_blank')` does NOT quietly park a tab in the
 * background the way it does on a desktop browser: iOS Safari switches to the
 * new tab immediately, which backgrounds the app's own tab. A backgrounded tab
 * gets its timers and rendering throttled, so the PDF render stalls part-way
 * through and `navigator.share()` refuses to run at all from a document that
 * isn't visible — leaving the person staring at a blank `about:blank` tab
 * while the work they triggered never finishes.
 */
export function shouldPreOpenWaWindow(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !isMobileWebBrowser();
}

/**
 * True while the document still holds transient user activation — the window
 * in which `navigator.share()` is allowed to run at all.
 *
 * Browsers without `navigator.userActivation` (older Safari) are treated as
 * expired, which only means we always route through the confirm sheet there:
 * one extra tap, but never a silent failure.
 */
function hasFreshUserActivation(): boolean {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  return !!(nav && nav.userActivation && nav.userActivation.isActive);
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

/**
 * Best-effort deep link into a specific WhatsApp chat, text only.
 * Used for the reminder/thank-you templates, which have nothing to attach --
 * deep links can't carry a file, only pre-filled text.
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
  /**
   * true: the quote had no customer phone number on file, so we could not land
   * directly in a pre-filled chat -- the message text was copied to the
   * clipboard instead so the person can paste it themselves after picking a
   * chat in the WhatsApp Web chat list that just opened.
   */
  messageCopied?: boolean;
  /** true: the person deliberately backed out (share sheet dismissed, sheet cancelled). */
  cancelled?: boolean;
  /**
   * A ready-to-show message describing what actually happened, for the cases
   * where the caller's own generic wording would be wrong — e.g. on a phone
   * there is no "drag the file into the chat", you attach it with the paperclip.
   */
  toast?: string;
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
    // Without a number we can't target a specific chat, so we fall back to the
    // bare chat list.
    const cleanedPhone = normalizePhoneForWhatsApp(quote.musTelefon || '');
    const waUrl = cleanedPhone
      ? `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`
      : 'https://web.whatsapp.com/';

    // ----- MOBILE WEB (iPhone / iPad / Android) -----
    // The OS share sheet lists WhatsApp here and hands it the file directly,
    // so this is the one path that genuinely attaches the PDF.
    if (isMobileWebBrowser()) {
      let file: File | null = null;
      try {
        const res = await fetch(pdfUri);
        const blob = await res.blob();
        file = new File([blob], desiredName, { type: 'application/pdf' });
      } catch { /* handled by the download fallback below */ }

      const nav: any = navigator;
      const canShareFile = !!file
        && typeof nav.share === 'function'
        && typeof nav.canShare === 'function'
        && nav.canShare({ files: [file] });

      if (file && canShareFile) {
        // Fast path: everything above finished quickly enough that the tap
        // that started this is still "live", so the share sheet can open with
        // no extra step at all. This is the case that always used to work.
        if (hasFreshUserActivation()) {
          try {
            await nav.share({ files: [file], text: message, title: desiredName });
            return { attached: true, downloaded: false };
          } catch (e: any) {
            if (e && e.name === 'AbortError') return { attached: false, downloaded: false, cancelled: true };
            // NotAllowedError and friends: the activation lapsed after all.
            // Fall through to the sheet, which brings its own fresh gesture.
          }
        }
        // Slow path -- and the actual fix for "bazen gönderiyor bazen
        // göndermiyor". Rendering the PDF outlasts the tap's activation
        // window on a slower phone or a cold CDN cache, and iOS Safari then
        // rejects navigator.share() outright. Handing the finished file to a
        // sheet whose button click is a brand-new gesture makes the outcome
        // the same every single time.
        const r = await promptWhatsAppShareWeb({ file, message, fileName: desiredName, pdfUri, waUrl });
        if (r.action === 'shared') return { attached: true, downloaded: false };
        if (r.action === 'downloaded') {
          return {
            attached: false,
            downloaded: true,
            toast: 'PDF indirildi — WhatsApp’ta sohbeti açıp ataç ile ekleyebilirsiniz',
          };
        }
        if (r.action === 'chat-opened') return { attached: false, downloaded: false };
        return { attached: false, downloaded: false, cancelled: true };
      }

      // Mobile browser that can't hand files to another app at all (rare on
      // anything current): save the PDF so it can be attached by hand. We
      // deliberately do NOT navigate to WhatsApp here -- that would leave the
      // app mid-flow and can cancel the download that just started.
      await downloadFileWeb(pdfUri, desiredName);
      return {
        attached: false,
        downloaded: true,
        toast: 'PDF indirildi — WhatsApp’ta ataç ile ekleyebilirsiniz',
      };
    }

    // ----- DESKTOP WEB -----
    // There is no way to hand WhatsApp Desktop a file from a browser, so get
    // the PDF onto disk and open WhatsApp Web -- the person drags the file
    // from wherever they saved it into the chat they pick.
    //
    // With no phone number we can't land in a specific chat, so copy the
    // message to the clipboard instead of losing it silently.
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

    // Prefer an explicit Save-As dialog (Chrome/Edge) over a silent auto-drop
    // into Downloads: the person sees exactly where the file is going.
    const saved = await trySaveFilePickerWeb(pdfUri, desiredName);
    if (saved === false) {
      // Person explicitly cancelled the save dialog -- don't force a download
      // or open WhatsApp on top of that.
      if (waWindow) { try { waWindow.close(); } catch {} }
      return { attached: false, downloaded: false, cancelled: true };
    }
    if (saved === null) {
      // Browser doesn't support the Save-As picker (Safari/Firefox) -- fall
      // back to a plain auto-download.
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

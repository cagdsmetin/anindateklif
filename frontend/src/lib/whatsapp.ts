import { Platform, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { QuoteT } from './api';

/**
 * Normalize a Turkish phone number to E.164 without '+' (WhatsApp URL-friendly).
 * Accepts:  "0532 111 22 33", "532-111-22-33", "+90 532 111 22 33", "532 111 22 33"
 * Returns:  "905321112233" or "" if invalid.
 */
export function normalizePhoneForWhatsApp(raw?: string): string {
  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  // Already contains country code (starts with 90 and 12 digits total)
  if (digits.startsWith('90') && digits.length === 12) return digits;
  // Local Turkish with leading 0 → strip and prepend 90
  if (digits.length === 11 && digits.startsWith('0')) return '90' + digits.substring(1);
  // Local Turkish w/o 0 → 10 digits starting with 5
  if (digits.length === 10 && digits.startsWith('5')) return '90' + digits;
  // Give up on non-Turkish formats — return as-is
  return digits;
}

/**
 * Compose a WhatsApp-friendly message body for a quote.
 */
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
 * Try to open a WhatsApp chat pre-filled with the given message.
 * Returns `true` when a link was launched (native or web).
 *
 * - If `phone` is provided → jumps directly into that chat.
 * - Otherwise → opens the WA chooser so user can pick a contact.
 * - Silently returns false if WhatsApp is not installed / not reachable.
 */
export async function openWhatsAppChat(phone: string, message: string): Promise<boolean> {
  const cleaned = normalizePhoneForWhatsApp(phone);
  const text = encodeURIComponent(message || '');

  if (Platform.OS === 'web') {
    const url = cleaned
      ? `https://wa.me/${cleaned}?text=${text}`
      : `https://wa.me/?text=${text}`;
    try {
      window.open(url, '_blank');
      return true;
    } catch {
      return false;
    }
  }

  // Native: prefer app scheme, fall back to universal https://wa.me link
  const appUrl = cleaned
    ? `whatsapp://send?phone=${cleaned}&text=${text}`
    : `whatsapp://send?text=${text}`;
  const webUrl = cleaned
    ? `https://wa.me/${cleaned}?text=${text}`
    : `https://wa.me/?text=${text}`;
  try {
    const canApp = await Linking.canOpenURL(appUrl);
    if (canApp) {
      await Linking.openURL(appUrl);
      return true;
    }
    await Linking.openURL(webUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt a two-step WhatsApp send flow:
 * 1) Open WA chat with pre-filled message (jumps to the customer directly if `phone` supplied).
 * 2) Immediately open the system share sheet so the user can attach the PDF via WhatsApp.
 *
 * On web we skip step 2 and trigger a plain PDF download instead (since Sharing.shareAsync
 * is a native-only API and the OS share sheet is not available in a browser tab).
 */
export async function shareQuoteViaWhatsApp(opts: {
  pdfUri: string;
  quote: QuoteT;
  companyName?: string;
}): Promise<void> {
  const { pdfUri, quote, companyName } = opts;
  const message = composeQuoteWhatsAppMessage(quote, companyName);

  // Step 1 — open WhatsApp chat (best effort).
  await openWhatsAppChat(quote.musTelefon || '', message);

  if (Platform.OS === 'web') {
    // Browsers: expo-print already produced a data-uri; open it in a new tab as the "share".
    try {
      window.open(pdfUri, '_blank');
    } catch {}
    return;
  }

  // Step 2 — trigger the native share sheet after a short delay so the WA chat lands first.
  await new Promise((r) => setTimeout(r, 700));
  try {
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'WhatsApp ile Gönder',
        UTI: 'com.adobe.pdf',
      });
    }
  } catch {
    // swallow — user already saw the pre-filled chat
  }
}

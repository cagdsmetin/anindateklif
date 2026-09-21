// Generic (non-quote) file sharing helper — used for company catalog files.
// Mirrors the platform-specific approach in whatsapp.ts: the OS share sheet
// where it can actually reach WhatsApp, otherwise save the file so it can be
// attached by hand. Works off a plain {name, mime, dataBase64} file instead of
// a generated quote PDF.
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadFileWeb } from './web-download';
import { promptWhatsAppShareWeb } from './wa-share-prompt-web';

export type FileShareResult = {
  attached: boolean;
  /** Ready-to-show message when the file was saved instead of handed over. */
  toast?: string;
};

function isMobileWebBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  // iPadOS 13+ Safari calls itself "Macintosh" — see the same check in whatsapp.ts.
  if (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1) return true;
  return false;
}

export async function shareFileViaWhatsApp(file: { name: string; mime: string; dataBase64: string }): Promise<FileShareResult> {
  if (Platform.OS === 'web') {
    let f: File | null = null;
    try {
      const res = await fetch(file.dataBase64);
      const blob = await res.blob();
      f = new File([blob], file.name, { type: file.mime });
    } catch { /* handled by the download fallback below */ }

    const nav: any = navigator;
    const canShareFile = !!f
      && typeof nav.share === 'function'
      && typeof nav.canShare === 'function'
      && nav.canShare({ files: [f] });

    // Mobile: hand the finished file to the confirm sheet rather than calling
    // navigator.share() from here.
    //
    // The caller fetches the file from the API first, so by this point the tap
    // that started the share is long past and its user activation is gone —
    // iOS Safari answers a share() call with NotAllowedError and the button
    // just does nothing. The sheet's own button click is a fresh gesture, so
    // the share sheet opens every time. Same bug and same fix as the quote
    // flow; see wa-share-prompt-web.ts for the full explanation.
    if (f && canShareFile && isMobileWebBrowser()) {
      const r = await promptWhatsAppShareWeb({
        file: f,
        fileName: file.name,
        fileUri: file.dataBase64,
        waUrl: 'https://web.whatsapp.com/',
        title: 'Dosya hazır',
        downloadLabel: 'Dosyayı İndir',
      });
      if (r.action === 'shared') return { attached: true };
      if (r.action === 'downloaded') {
        return { attached: false, toast: 'Dosya indirildi — WhatsApp’ta ataç ile ekleyebilirsiniz' };
      }
      return { attached: false };
    }

    // Desktop: no browser can hand WhatsApp Desktop a file, so save it and open
    // WhatsApp Web for the person to drag it into the chat they pick.
    await downloadFileWeb(file.dataBase64, file.name);
    try { window.open('https://web.whatsapp.com/', '_blank'); } catch {}
    return { attached: false, toast: 'Dosya indirildi — WhatsApp Web açıldı, sohbeti seçip dosyayı sürükleyip bırakın' };
  }

  // Native (iOS/Android)
  const cacheDir = FileSystem.cacheDirectory || '';
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const targetUri = `${cacheDir}${safeName}`;
  const base64Only = file.dataBase64.split(',')[1] || '';
  await FileSystem.writeAsStringAsync(targetUri, base64Only, { encoding: FileSystem.EncodingType.Base64 });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Paylaşım bu cihazda desteklenmiyor');
  await Sharing.shareAsync(targetUri, { mimeType: file.mime, dialogTitle: file.name });
  return { attached: true };
}

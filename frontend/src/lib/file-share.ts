// Generic (non-quote) file sharing helper — used for company catalog files.
// Mirrors the platform-specific approach in whatsapp.ts (native share sheet
// where available, otherwise download + open WhatsApp so the person can
// attach it by hand) but works off a plain {name, mime, dataBase64} file
// instead of a generated quote PDF.
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadFileWeb } from './web-download';

export async function shareFileViaWhatsApp(file: { name: string; mime: string; dataBase64: string }): Promise<{ attached: boolean }> {
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(file.dataBase64);
      const blob = await res.blob();
      const nav: any = navigator;
      if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
        const f = new File([blob], file.name, { type: file.mime });
        if (nav.canShare({ files: [f] })) {
          await nav.share({ files: [f], title: file.name });
          return { attached: true };
        }
      }
    } catch (e: any) {
      if (e && e.name === 'AbortError') return { attached: false };
    }
    // No native share target for files on this browser — download it, then
    // open WhatsApp Web so the person can drag the just-downloaded file in.
    await downloadFileWeb(file.dataBase64, file.name);
    try { window.open('https://web.whatsapp.com/', '_blank'); } catch {}
    return { attached: false };
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

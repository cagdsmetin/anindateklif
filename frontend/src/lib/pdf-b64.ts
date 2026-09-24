import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { downloadFileWeb } from '@/src/lib/web-download';

// Sunucudan base64 gelen bir PDF'i (e-Fatura/e-Arşiv) web'de indirir,
// mobilde paylaşım menüsüyle açar.
export async function saveBase64Pdf(b64: string, fileName: string) {
  const clean = (b64 || '').replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
  if (!clean) throw new Error('PDF boş');
  const safe = fileName.replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'fatura.pdf';
  if (Platform.OS === 'web') {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    await downloadFileWeb(url, safe);
    return;
  }
  const uri = (FileSystem.cacheDirectory || '') + safe;
  await FileSystem.writeAsStringAsync(uri, clean, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: safe, UTI: 'com.adobe.pdf' });
}

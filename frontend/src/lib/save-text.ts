import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { downloadFileWeb } from './web-download';

/** Metin dosyasını (CSV/JSON) web'de indirir, telefonda paylaşım menüsüyle açar. */
export async function saveTextFile(content: string, fileName: string, mime: string) {
  if (Platform.OS === 'web') {
    await downloadFileWeb(URL.createObjectURL(new Blob([content], { type: mime })), fileName);
    return;
  }
  const uri = (FileSystem.cacheDirectory || '') + fileName;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: fileName });
}

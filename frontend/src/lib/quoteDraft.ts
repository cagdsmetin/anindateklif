import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Yeni (henüz kaydedilmemiş) teklif formu için otomatik taslak kaydı.
// İnternet koptuğunda / uygulama beklenmedik şekilde kapandığında kullanıcının
// az önce doldurduğu formu kaybetmemesi için, form her değiştiğinde (debounce
// ile) cihazda saklanır. Sunucuya başarıyla kaydedilince taslak silinir.
// Aynı desen `itemPricePrefs.ts`'te de kullanılıyor: web'de localStorage,
// native'de AsyncStorage.

async function readRaw(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
    } catch {
      // yoksay -- taslak kalıcı olmasa da uygulama çalışmaya devam etsin
    }
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // yoksay
  }
}

async function removeRaw(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
    } catch {
      // yoksay
    }
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // yoksay
  }
}

function storageKey(companyId: string): string {
  return `quote-draft:${companyId}`;
}

export type QuoteDraft = Record<string, any> & { savedAt: number };

export async function saveQuoteDraft(companyId: string, data: Record<string, any>): Promise<void> {
  if (!companyId) return;
  const payload: QuoteDraft = { ...data, savedAt: Date.now() };
  await writeRaw(storageKey(companyId), JSON.stringify(payload));
}

export async function loadQuoteDraft(companyId: string): Promise<QuoteDraft | null> {
  if (!companyId) return null;
  const raw = await readRaw(storageKey(companyId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // yoksay -- bozuk kayıt varsa yok say
  }
  return null;
}

export async function clearQuoteDraft(companyId: string): Promise<void> {
  if (!companyId) return;
  await removeRaw(storageKey(companyId));
}

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kullanıcının Teklif ekranında Manuel/Genel modda daha önce girdiği ürün
// adı -> birim fiyat eşleşmelerini cihazda kalıcı olarak saklar. Aynı ürün
// adı tekrar yazıldığında fiyat alanı otomatik dolar (fiyat henüz boşsa),
// kullanıcı isterse üzerine yazıp değiştirebilir ya da hatırlanan değeri
// yok sayıp kendi manuel girebilir. Firma bazlı ayrı tutulur.
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
      // yoksay -- hatırlama kalıcı olmasa da uygulama çalışmaya devam etsin
    }
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // yoksay
  }
}

export function normalizeItemName(name: string): string {
  return (name || '').trim().toLocaleLowerCase('tr-TR');
}

function storageKey(companyId: string): string {
  return `item-price-memory:${companyId}`;
}

export async function loadPriceMemory(companyId: string): Promise<Record<string, number>> {
  if (!companyId) return {};
  const raw = await readRaw(storageKey(companyId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // yoksay -- bozuk kayıt varsa boş başla
  }
  return {};
}

export async function savePriceMemory(companyId: string, map: Record<string, number>): Promise<void> {
  if (!companyId) return;
  await writeRaw(storageKey(companyId), JSON.stringify(map));
}

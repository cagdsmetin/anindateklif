import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// Teklif ekranındaki "her seferinde aynı yazılan" alanların varsayılanları.
//
// Ödeme şekli, menşei, teslim süresi, para birimi ve nakliye şekli her firma
// için farklıdır ama o firma içinde neredeyse hiç değişmez. Uygulama bunları
// sabit bir metinle ("%50 Peşin - %50 Fab. Teslim") açıyordu; kendi şartları
// farklı olan bayi her yeni teklifte aynı alanı tekrar düzeltmek zorunda
// kalıyordu.
//
// Artık kullanıcı alanı doldurup odaktan çıkınca girdiği değer o firmanın
// varsayılanı olarak cihazda saklanır ve bir sonraki yeni teklif onunla
// açılır. Kullanıcı yine istediği teklifte serbestçe değiştirebilir --
// değiştirdiği yeni değer de varsayılan olur.
//
// Firma bazlı saklanır (aynı cihazda birden fazla firma yönetilebiliyor).
// Sunucuya yazılmaz: kişisel bir tercih, teklifin verisi değil.
// ============================================================================

export type QuoteDefaultsT = {
  odemeSekli?: string;
  mensei?: string;
  teslimGun?: string;
  paraBirimi?: string;
  nakliye?: string;
};

const KEY_PREFIX = 'quote_defaults_v1:';

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
      // yoksay -- tercih kalıcı olmasa da uygulama çalışmaya devam etsin
    }
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // yoksay
  }
}

export async function loadQuoteDefaults(companyId: string): Promise<QuoteDefaultsT> {
  if (!companyId) return {};
  const raw = await readRaw(KEY_PREFIX + companyId);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as QuoteDefaultsT) : {};
  } catch {
    return {};
  }
}

/** Tek bir alanı varsayılan olarak yazar; diğer alanlara dokunmaz. */
export async function saveQuoteDefault<K extends keyof QuoteDefaultsT>(
  companyId: string,
  field: K,
  value: string
): Promise<void> {
  if (!companyId) return;
  const trimmed = (value || '').trim();
  const current = await loadQuoteDefaults(companyId);
  if ((current[field] || '') === trimmed) return;
  const next: QuoteDefaultsT = { ...current, [field]: trimmed };
  await writeRaw(KEY_PREFIX + companyId, JSON.stringify(next));
}

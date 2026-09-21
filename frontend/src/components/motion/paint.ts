import { Platform, ViewStyle } from 'react-native';
import { getThemeMode, ThemeMode } from '@/src/lib/theme';
import { applyBrandFontMap } from '@/src/lib/brand-font';

// Scroll kitinin ortak renk/gradyan yardımcıları.
//
// CSS gradyanları: RN 0.81 (New Architecture açık -- app.json) iOS/Android'de
// `experimental_backgroundImage` ile radial/linear gradyanı native çiziyor;
// react-native-web ise aynı değeri standart CSS `backgroundImage` olarak
// istiyor. Tek yardımcı, çağıran yerin platformu düşünmesine gerek bırakmıyor.
// Desteklenmeyen bir cihazda gradyan sessizce çizilmez (sadece dekor kaybolur).
export function cssGradient(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}

// Yumuşak "parıltı" (glow) lekesi -- aurora arka planlarındaki renkli bulutlar.
export function glowBlob(color: string, strength = 0.55): ViewStyle {
  return cssGradient(`radial-gradient(circle at center, ${alpha(color, strength)} 0%, ${alpha(color, strength * 0.35)} 38%, ${alpha(color, 0)} 70%)`);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// '#4F46E5' + 0.2 -> 'rgba(79,70,229,0.2)'. Hex olmayan değerler olduğu gibi döner.
export function alpha(color: string, a: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a))})`;
}

// İki hex rengi karıştırır (t=0 -> a, t=1 -> b); gradyan uçlarını modül
// renginden türetmek için (ör. turuncu -> açık turuncu).
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Bir dolgu renginin üzerinde okunacak metin/ikon rengi.
//
// Koyu temada vurgu renkleri açılıyor (ör. yeşil #16A34A -> #4ADE80, amber
// #F59E0B -> #FBBF24). Beyaz metin bu açık zeminlerde 1.7:1'e kadar düşüyordu
// -- "Kaydet", "Yeni Müşteri Ekle" gibi ana butonlar okunmaz haldeydi.
// Zeminin bağıl parlaklığına bakıp koyu ya da beyaz metin seçer.
export function readableOn(bg: string): string {
  const rgb = parseHex(bg);
  if (!rgb) return '#FFFFFF';
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  // Sabit bir eşik yerine iki adayın gerçek kontrastını karşılaştır: orta
  // tonlu zeminlerde (ör. #4D69D6) eşik mantığı ikisi de zayıf olan seçeneği
  // seçebiliyordu.
  const INK = 0.00518; // #0B1119 bağıl parlaklığı
  const withWhite = 1.05 / (L + 0.05);
  const withInk = (L + 0.05) / (INK + 0.05);
  return withWhite >= withInk ? '#FFFFFF' : '#0B1119';
}

// theme.colors modül seviyesinde okunduğunda (StyleSheet.create) açık temanın
// değerleri kalıcı olarak yakalanıyor; tema değişince ThemeProvider tüm ağacı
// yeniden mount ediyor ama modül seviyesindeki stiller yeniden hesaplanmıyor.
// Yeni bileşenler stillerini bununla üretir: `const s = styles()` her render'da
// aktif temanın (açık/koyu) önbellekteki stil tablosunu döner.
export function themedSheet<T extends Record<string, any>>(factory: () => T): () => T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  return () => {
    const mode = getThemeMode();
    let sheet = cache[mode];
    if (!sheet) {
      sheet = applyBrandFontMap(factory());
      cache[mode] = sheet;
    }
    return sheet;
  };
}

// Modül seviyesindeki `const s = StyleSheet.create({...})` kalıbını hiç
// değiştirmeden tema + marka fontu desteği kazandıran sarmalayıcı: dönen
// nesne bir Proxy'dir, `s.card` ilk okunduğunda stil tablosu O ANKİ temaya
// göre üretilir ve önbelleğe alınır. Böylece açık/koyu tema geçişinde
// (ThemeProvider tüm ağacı yeniden mount ediyor) renkler güncel olur ve
// her metin stiline doğru Plus Jakarta Sans kesimi eklenir.
export function themedStyles<T extends Record<string, any>>(factory: () => T): T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  const resolve = (): T => {
    const mode = getThemeMode();
    let sheet = cache[mode];
    if (!sheet) {
      sheet = applyBrandFontMap(factory());
      cache[mode] = sheet;
    }
    return sheet;
  };
  return new Proxy({} as T, {
    get: (_target, prop: string | symbol) => (resolve() as Record<string | symbol, unknown>)[prop],
    has: (_target, prop) => prop in (resolve() as object),
    ownKeys: () => Reflect.ownKeys(resolve() as object),
    getOwnPropertyDescriptor: (_target, prop) => {
      const d = Object.getOwnPropertyDescriptor(resolve() as object, prop);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

// Aynı isim her zaman aynı rengi alsın diye basit bir dağıtım -- liste
// kartlarında (müşteri, personel vb.) tek renk tekrarının yarattığı
// monotonluğu kırar, kullanıcı kartları renginden tanır.
const AVATAR_PALETTE = ['#4F46E5', '#7C3AED', '#0EA5E9', '#059669', '#EA580C', '#DB2777', '#0D9488', '#B45309'];

export function hashColor(seed: string, palette: string[] = AVATAR_PALETTE): string {
  const s = (seed || '').trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return palette[h % palette.length];
}

// Dar alanlara sığan kısaltılmış sayı: 271000 -> "271 B", 1_250_000 -> "1,3 Mn".
// Birim ekleri dile göre dışarıdan verilir (TR: B/Mn/Mr, EN: K/M/B).
export function compactNumber(n: number, units: [string, string, string], locale = 'tr-TR'): string {
  const abs = Math.abs(n);
  const unit = abs >= 1e9 ? units[2] : abs >= 1e6 ? units[1] : abs >= 1e4 ? units[0] : '';
  const div = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e4 ? 1e3 : 1;
  const v = n / div;
  const digits = unit && Math.abs(v) < 100 ? 1 : 0;
  const num = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return unit ? `${num} ${unit}` : num;
}

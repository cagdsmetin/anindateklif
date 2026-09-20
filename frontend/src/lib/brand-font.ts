import { TextStyle } from 'react-native';

// ============================================================================
// Marka yazı tipi: Plus Jakarta Sans (B2B SaaS/araç ürünleri için önerilen,
// ui-ux-pro-max tipografi eşleşmesi ve önceki UI raporuyla aynı öneri).
//
// React Native'de -- özellikle Android'de -- `fontFamily` + `fontWeight`
// birlikte çalışmaz: her ağırlık AYRI bir aile adıdır. Bu yüzden stil
// nesnesindeki `fontWeight` değerine bakıp doğru dosyanın aile adını
// yazıyoruz ve fontWeight'i 'normal'a çekiyoruz (yoksa sistem üstüne bir de
// sahte kalınlaştırma uygular). Uygulama boyunca elle hiçbir yere
// fontFamily yazılmaz -- stiller `themedStyles()` üzerinden geçerken
// otomatik eklenir (bkz. src/components/motion/paint.ts).
// ============================================================================

export const BRAND_FONTS = {
  '300': 'PlusJakartaSans_300Light',
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

// Plus Jakarta Sans'ta 900 yok -- en kalın kesim 800 (ExtraBold).
const BY_WEIGHT: Record<string, string> = {
  '100': BRAND_FONTS['300'],
  '200': BRAND_FONTS['300'],
  '300': BRAND_FONTS['300'],
  '400': BRAND_FONTS['400'],
  '500': BRAND_FONTS['500'],
  '600': BRAND_FONTS['600'],
  '700': BRAND_FONTS['700'],
  '800': BRAND_FONTS['800'],
  '900': BRAND_FONTS['800'],
  normal: BRAND_FONTS['400'],
  bold: BRAND_FONTS['700'],
};

export function brandFamily(weight?: TextStyle['fontWeight']): string {
  return BY_WEIGHT[String(weight ?? '400')] || BRAND_FONTS['400'];
}

// Bir stil nesnesi "metin stili" mi? (Görünüm stillerine fontFamily eklemek
// zararsız ama gereksiz -- yine de renk/yazı özelliği taşıyan her stile
// ekliyoruz ki iç içe metinler de doğru aileyi alsın.)
const TEXT_KEYS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textAlign',
  'fontStyle',
  'color',
] as const;

function isTextStyle(style: Record<string, unknown>): boolean {
  return TEXT_KEYS.some((k) => style[k] !== undefined);
}

/** Tek bir stil nesnesine marka fontunu uygular (zaten fontFamily varsa dokunmaz). */
export function applyBrandFont<T extends Record<string, any>>(style: T): T {
  if (!style || typeof style !== 'object') return style;
  if (style.fontFamily || !isTextStyle(style)) return style;
  return { ...style, fontFamily: brandFamily(style.fontWeight), fontWeight: 'normal' };
}

/** StyleSheet.create'e verilen sözlüğün tamamına uygular. */
export function applyBrandFontMap<T extends Record<string, any>>(map: T): T {
  const out: Record<string, any> = {};
  for (const key of Object.keys(map)) {
    const value = (map as Record<string, any>)[key];
    out[key] = value && typeof value === 'object' ? applyBrandFont(value) : value;
  }
  return out as T;
}

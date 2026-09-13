// ============================================================================
// Uygulama renk teması: Açık (varsayılan) ve Koyu palet.
//
// Mimari notu: `theme.colors` her ekranda `import { theme } from '@/src/lib/theme'`
// ile modül seviyesinde import edilip `theme.colors.X` şeklinde kullanılıyor
// (44 dosyada 1500+ kullanım) -- bir React Context/`useTheme()` hook'una
// geçirmek bu kadar dosyayı tek tek değiştirmeyi gerektirirdi. Bunun yerine
// `theme.colors` objesi SABİT REFERANS ama İÇERİĞİ DEĞİŞEBİLİR (mutable)
// tutulur: `applyThemeMode()` çağrıldığında aynı obje üzerindeki alanlar
// `Object.assign` ile güncellenir. Var olan tüm ekranlar `theme.colors.bg`
// gibi değerleri HER RENDER'DA yeniden okuduğu için, tema değiştiğinde tüm
// uygulama ağacını yeniden mount ettirmek (bkz. `ThemeProvider` / `app/_layout.tsx`
// içindeki `key`) yeterli oluyor -- tek tek dosya değiştirmeye gerek kalmıyor.
// ============================================================================

export type ThemeMode = 'light' | 'dark';

const lightColors = {
  // Primary Palette — Vibrant SaaS
  primary: '#4F46E5',        // Vivid indigo
  primaryDark: '#4338CA',
  primarySoft: '#EEF2FF',
  primaryBorder: '#C7D2FE',

  navy: '#1E293B',           // Deep navy (secondary / body text on light bg)
  navyDark: '#0F172A',       // Near-black navy (hero cards, tab bar)

  // Legacy aliases for existing code
  accent: '#4F46E5',
  accentSoft: '#EEF2FF',
  accentBorder: '#C7D2FE',
  gold: '#F59E0B',           // Warm accent (optional highlights)
  goldSoft: '#FEF3C7',
  goldDark: '#B45309',
  goldBorder: '#FCD34D',

  red: '#DC2626',
  redSoft: '#FEE2E2',
  green: '#16A34A',
  greenSoft: '#DCFCE7',
  yellow: '#B45309',
  yellowSoft: '#FEF3C7',

  text: '#0F172A',
  textMuted: '#64748B',
  textOnDark: '#94A3B8',     // muted text/icons on navyDark surfaces
  textSoft: '#475569',
  bg: '#FFFFFF',              // Pure white background
  surface: '#FFFFFF',
  surfaceSoft: '#F8FAFC',
  line: '#E2E8F0',
  lineDark: '#CBD5E1',

  modules: {
    teklif: '#4F46E5',
    katalog: '#7C3AED',
    gecmis: '#0EA5E9',
    musteri: '#059669',
    servis: '#EA580C',
    kampanya: '#DB2777',
    hatirlatma: '#D97706',
    raporlar: '#0891B2',
    kasa: '#0D9488',
    tahsilat: '#0369A1',
    firma: '#475569',
    mesaj: '#7C3AED',
    lead: '#B45309',
    reklam: '#DC2626',
    efatura: '#0F766E',
  },
};

// Koyu tema paleti — MyDijital OS'un canlı /crm/leads ekranından ölçülen
// gerçek renklere göre kalibre edildi (bkz. getComputedStyle ile alınan
// body/kart/kenarlık/metin değerleri): çok koyu lacivert zemin (#090E14),
// hafif daha açık kart yüzeyleri (#111923), belirgin mavi-mor vurgu rengi
// (#5B7CFF) ve yumuşak gri-mavi kenarlıklar (#253244). Renk ANLAMLARI
// (primary/gold/red/green vb.) aynı kalır, sadece kontrast koyu zemine göre
// yeniden ayarlanır: "Soft" arka planlar (rozet/etiket zeminleri) koyu
// tonlu tutulup üzerlerindeki metin rengi açık tonda okunur.
const darkColors = {
  primary: '#5B7CFF',
  primaryDark: '#7C97FF',
  primarySoft: '#182148',
  primaryBorder: '#33407A',

  navy: '#1E293B',
  navyDark: '#090E14',

  accent: '#5B7CFF',
  accentSoft: '#182148',
  accentBorder: '#33407A',
  gold: '#FBBF24',
  goldSoft: '#78350F',
  goldDark: '#FCD34D',
  goldBorder: '#92400E',

  red: '#F87171',
  redSoft: '#450A0A',
  green: '#4ADE80',
  greenSoft: '#052E16',
  yellow: '#FCD34D',
  yellowSoft: '#78350F',

  text: '#F3F6FB',
  textMuted: '#91A0B5',
  textOnDark: '#91A0B5',
  textSoft: '#C3CDDB',
  bg: '#090E14',
  surface: '#111923',
  surfaceSoft: '#0D141C',
  line: '#253244',
  lineDark: '#33455C',

  modules: {
    teklif: '#818CF8',
    katalog: '#A78BFA',
    gecmis: '#38BDF8',
    musteri: '#34D399',
    servis: '#FB923C',
    kampanya: '#F472B6',
    hatirlatma: '#FBBF24',
    raporlar: '#22D3EE',
    kasa: '#2DD4BF',
    tahsilat: '#38BDF8',
    firma: '#94A3B8',
    mesaj: '#A78BFA',
    lead: '#FBBF24',
    reklam: '#F87171',
    efatura: '#2DD4BF',
  },
};

export const theme = {
  colors: { ...lightColors },
  radius: { sm: 8, md: 10, lg: 14, xl: 20, pill: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  shadow: {
    sm: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    md: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    lg: {
      shadowColor: '#4F46E5',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  },
};

let _themeMode: ThemeMode = 'light';

export function getThemeMode(): ThemeMode {
  return _themeMode;
}

// `theme.colors` objesinin REFERANSINI korur, sadece içindeki alanları
// günceller -- böylece `theme.colors.modules` gibi iç içe objeler de
// (ayrı ayrı Object.assign ile) doğru şekilde değişir.
export function applyThemeMode(mode: ThemeMode) {
  _themeMode = mode === 'dark' ? 'dark' : 'light';
  const next = _themeMode === 'dark' ? darkColors : lightColors;
  Object.assign(theme.colors, next);
  Object.assign(theme.colors.modules, next.modules);
}

export function statusColor(status: string) {
  switch (status) {
    case 'Onaylandı':
    case 'Tamamlandı':
      return { bg: theme.colors.greenSoft, border: '#86efac', text: theme.colors.green };
    case 'Görüldü':
    case 'Devam ediyor':
      return { bg: theme.colors.yellowSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark };
    case 'Reddedildi':
    case 'İptal':
      return { bg: theme.colors.redSoft, border: '#fca5a5', text: theme.colors.red };
    case 'Açık':
      return { bg: theme.colors.primarySoft, border: theme.colors.primaryBorder, text: theme.colors.primaryDark };
    default:
      return { bg: theme.colors.surfaceSoft, border: theme.colors.line, text: theme.colors.textMuted };
  }
}

export const theme = {
  colors: {
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

    // Module accent palette — solid, saturated fills used for module tiles,
    // stat icons, tab bar active pills and reminder category badges.
    modules: {
      teklif: '#4F46E5',
      katalog: '#7C3AED',
      gecmis: '#0EA5E9',
      musteri: '#059669',
      servis: '#EA580C',
      kampanya: '#DB2777',
      hatirlatma: '#D97706',
      raporlar: '#0891B2',
      firma: '#475569',
    },
  },
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

export function statusColor(status: string) {
  switch (status) {
    case 'Onaylandı':
    case 'Tamamlandı':
      return { bg: theme.colors.greenSoft, border: '#86efac', text: '#166534' };
    case 'Görüldü':
    case 'Devam ediyor':
      return { bg: theme.colors.yellowSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark };
    case 'Reddedildi':
    case 'İptal':
      return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b' };
    case 'Açık':
      return { bg: theme.colors.primarySoft, border: theme.colors.primaryBorder, text: theme.colors.primaryDark };
    default:
      return { bg: '#F1F5F9', border: theme.colors.line, text: theme.colors.textMuted };
  }
}

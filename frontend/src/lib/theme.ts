export const theme = {
  colors: {
    // Primary Palette — Professional SaaS
    primary: '#2563EB',        // Vivid blue (from logo)
    primaryDark: '#1D4ED8',
    primarySoft: '#EFF6FF',
    primaryBorder: '#BFDBFE',

    navy: '#1E293B',           // Deep navy (secondary)
    navyDark: '#0F172A',

    // Legacy aliases for existing code
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
    accentBorder: '#BFDBFE',
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
    textSoft: '#475569',
    bg: '#FFFFFF',              // Pure white background
    surface: '#FFFFFF',
    surfaceSoft: '#F8FAFC',
    line: '#E2E8F0',
    lineDark: '#CBD5E1',
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
      shadowColor: '#2563EB',
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
      return { bg: theme.colors.greenSoft, border: '#86efac', text: '#166534' };
    case 'Görüldü':
      return { bg: theme.colors.yellowSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark };
    case 'Reddedildi':
      return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b' };
    default:
      return { bg: '#F1F5F9', border: theme.colors.line, text: theme.colors.textMuted };
  }
}

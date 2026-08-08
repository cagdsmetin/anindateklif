export const theme = {
  colors: {
    // Kurumsal palet (HTML'den ilham)
    navy: '#1e293b',
    navyDark: '#0f172a',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    accentBorder: '#bfdbfe',
    red: '#dc2626',
    redSoft: '#fef2f2',
    green: '#16a34a',
    greenSoft: '#dcfce7',
    yellow: '#f59e0b',
    yellowSoft: '#fef3c7',
    text: '#0f172a',
    textMuted: '#64748b',
    textSoft: '#475569',
    bg: '#f1f5f9',
    surface: '#ffffff',
    line: '#e2e8f0',
    lineDark: '#cbd5e1',
  },
  radius: { sm: 6, md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
};

export function statusColor(status: string) {
  switch (status) {
    case 'Onaylandı':
      return { bg: theme.colors.greenSoft, border: '#86efac', text: '#166534' };
    case 'Görüldü':
      return { bg: theme.colors.yellowSoft, border: '#fbbf24', text: '#92400e' };
    case 'Reddedildi':
      return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b' };
    default:
      return { bg: '#f1f5f9', border: theme.colors.line, text: theme.colors.textMuted };
  }
}

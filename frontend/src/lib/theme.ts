export const theme = {
  colors: {
    // Navy & Gold Corporate Palette
    navy: '#0B2545',        // Deep navy — kurumsal ağırlık
    navyDark: '#06172E',    // Koyu vurgular
    navySoft: '#EEF2F7',    // Açık lacivert-mavi ton (chip / arka planlar)
    navyBorder: '#C3CFDF',

    gold: '#C9A227',        // Zengin altın — CTA / detaylar
    goldDark: '#8F6E1A',
    goldSoft: '#FBF3D7',    // Soft altın arka plan
    goldBorder: '#E9D089',

    // "accent" navy'ye map — mevcut kodun çoğu accent kullanıyor
    accent: '#0B2545',
    accentSoft: '#EEF2F7',
    accentBorder: '#C3CFDF',

    red: '#B91C1C',
    redSoft: '#FEE2E2',
    green: '#166534',
    greenSoft: '#DCFCE7',
    yellow: '#B45309',
    yellowSoft: '#FEF3C7',

    text: '#0F172A',
    textMuted: '#64748B',
    textSoft: '#475569',
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    line: '#E2E8F0',
    lineDark: '#CBD5E1',
  },
  radius: { sm: 6, md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
};

export function statusColor(status: string) {
  switch (status) {
    case 'Onaylandı':
      return { bg: theme.colors.greenSoft, border: '#86efac', text: '#166534' };
    case 'Görüldü':
      return { bg: theme.colors.goldSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark };
    case 'Reddedildi':
      return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b' };
    default:
      return { bg: '#F1F5F9', border: theme.colors.line, text: theme.colors.textMuted };
  }
}

// Shared dark palette for auth + onboarding + setup screens.
// Anında Teklif app — dark navy background + blue accent + warm orange check logo
// (Claude turuncusu tonlarına yakın bir "clay" turuncu -- eskiden altın/sarıydı).

export const authTheme = {
  bg: '#0B1220',            // page background (very dark navy)
  bgSoft: '#111A2E',        // subtle layer
  card: '#1A2338',          // input/card background
  cardBorder: '#243049',    // input border
  cardBorderFocus: '#3B82F6',
  primary: '#3B82F6',       // primary blue button
  primaryText: '#FFFFFF',
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  textSoft: '#CBD5E1',
  link: '#3B82F6',
  // "gold*" adları korundu (çok yerde referans var) ama artık turuncu tonlar taşıyor.
  gold: '#DA7756',
  goldLight: '#E8977C',
  goldDark: '#B85D3F',
  goldGlow: 'rgba(218,119,86,0.25)',
  danger: '#EF4444',
  success: '#22C55E',
  line: '#243049',
  dotInactive: '#334155',
  dotActive: '#3B82F6',
};

export const authRadius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const authSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, huge: 36 };

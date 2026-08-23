import { theme } from '@/src/lib/theme';

export type NavItem = { name: string; title: string; icon: string; color: string; path?: string };

// Single source of truth for the app's primary navigation destinations —
// used by the desktop left sidebar (app/(tabs)/_layout.tsx) and by the
// mobile slide-in drawer (src/components/NavDrawer.tsx) so both stay in
// sync automatically.
export function buildNavItems(): NavItem[] {
  const m = theme.colors.modules;
  return [
    { name: 'index', title: 'Panel', icon: 'grid', color: theme.colors.primary },
    { name: 'teklif', title: 'Teklif', icon: 'create', color: m.teklif },
    { name: 'catalog', title: 'Katalog', icon: 'library', color: m.katalog },
    { name: 'history', title: 'Geçmiş', icon: 'time', color: m.gecmis },
    { name: 'customers', title: 'Müşteri', icon: 'people', color: m.musteri },
    { name: 'services', title: 'Servis', icon: 'construct', color: m.servis },
    { name: 'campaigns', title: 'Kampanya', icon: 'megaphone', color: m.kampanya },
    { name: 'reminders', title: 'Hatırlat.', icon: 'notifications', color: m.hatirlatma },
    { name: 'kasa', title: 'Kasa', icon: 'wallet', color: m.kasa },
    { name: 'tahsilat', title: 'Tahsilat', icon: 'cash', color: m.tahsilat },
    { name: 'company', title: 'Firma', icon: 'business', color: m.firma },
  ];
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.name === 'index') return pathname === '/' || pathname === '/index' || pathname === '/(tabs)';
  return pathname === `/${item.name}` || pathname.startsWith(`/${item.name}/`);
}

export function navItemRoute(item: NavItem): string {
  if (item.name === 'index') return '/(tabs)';
  return item.path || `/(tabs)/${item.name}`;
}

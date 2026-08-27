import { theme } from '@/src/lib/theme';

export type NavItem = { name: string; title: string; icon: string; color: string; path?: string };

// Single source of truth for the app's primary navigation destinations —
// used by the desktop left sidebar (app/(tabs)/_layout.tsx) and by the
// mobile slide-in drawer (src/components/NavDrawer.tsx) so both stay in
// sync automatically.
export function buildNavItems(opts?: { restricted?: boolean; isOwner?: boolean; isAdmin?: boolean }): NavItem[] {
  const m = theme.colors.modules;
  const items: NavItem[] = [
    { name: 'index', title: 'Panel', icon: 'grid', color: theme.colors.primary },
    { name: 'teklif', title: 'Teklif', icon: 'create', color: m.teklif },
    { name: 'catalog', title: 'Katalog', icon: 'library', color: m.katalog },
    { name: 'history', title: 'Geçmiş', icon: 'time', color: m.gecmis },
    { name: 'customers', title: 'Müşteri', icon: 'people', color: m.musteri },
    { name: 'services', title: 'Servis', icon: 'construct', color: m.servis },
    { name: 'campaigns', title: 'Kampanya', icon: 'megaphone', color: m.kampanya },
    { name: 'reminders', title: 'Hatırlat.', icon: 'notifications', color: m.hatirlatma },
  ];
  // Kısıtlı personel (staff_role !== 'admin') Kasa/Tahsilat'ı hiç göremesin —
  // gerçek erişim engeli backend'de (403), bu sadece o sekmeleri gizliyor.
  if (!opts?.restricted) {
    items.push({ name: 'kasa', title: 'Kasa', icon: 'wallet', color: m.kasa });
    items.push({ name: 'tahsilat', title: 'Tahsilat', icon: 'cash', color: m.tahsilat });
  }
  items.push({ name: 'company', title: 'Firma', icon: 'business', color: m.firma });
  // assistant/personel artık (tabs) grubunun içinde yaşıyor (bottom tab bar'da
  // href:null ile gizli) — böylece masaüstü sol sidebar bu sayfalarda da
  // görünmeye devam ediyor, tıpkı Kasa/Tahsilat gibi.
  items.push({ name: 'assistant', title: 'AI Asistan', icon: 'sparkles', color: theme.colors.primary });
  // Personel ekranı sadece firma sahibine gösterilir.
  if (opts?.isOwner) {
    items.push({ name: 'personel', title: 'Personel', icon: 'person-add', color: theme.colors.gold });
  }
  // Hediye kodu üretme ekranı sadece uygulamayı işleten admin hesabına gösterilir.
  if (opts?.isAdmin) {
    items.push({ name: 'promo-admin', title: 'Hediye Kodu', icon: 'gift', color: theme.colors.gold });
  }
  return items;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.name === 'index') return pathname === '/' || pathname === '/index' || pathname === '/(tabs)';
  return pathname === `/${item.name}` || pathname.startsWith(`/${item.name}/`);
}

export function navItemRoute(item: NavItem): string {
  if (item.name === 'index') return '/(tabs)';
  return item.path || `/(tabs)/${item.name}`;
}

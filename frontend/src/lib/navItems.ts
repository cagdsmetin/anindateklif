import { theme } from '@/src/lib/theme';

export type NavItem = { name: string; title: string; icon: string; color: string; path?: string };

// Single source of truth for the app's primary navigation destinations —
// used by the desktop left sidebar (app/(tabs)/_layout.tsx) and by the
// mobile slide-in drawer (src/components/NavDrawer.tsx) so both stay in
// sync automatically.
// `t`: i18n.tsx'teki useLanguage().t fonksiyonu -- verilmezse (LanguageProvider
// disinda bir cagri) Turkce sabit basliklara geri duser, hicbir cagri yeri kirmaz.
export function buildNavItems(opts?: { restricted?: boolean; isOwner?: boolean; isAdmin?: boolean; t?: (key: string) => string }): NavItem[] {
  const m = theme.colors.modules;
  const tt = opts?.t || ((k: string) => {
    const fallback: Record<string, string> = {
      'nav.panel': 'Panel', 'nav.teklif': 'Teklif', 'nav.katalog': 'Katalog', 'nav.gecmis': 'Gecmis',
      'nav.musteri': 'Musteri', 'nav.servis': 'Servis', 'nav.kampanya': 'Kampanya', 'nav.musteriAvcisi': 'Musteri Avcisi',
      'nav.hatirlatmalar': 'Hatirlatmalar', 'nav.takvim': 'Takvim', 'nav.kasa': 'Kasa', 'nav.tahsilat': 'Tahsilat',
      'nav.firma': 'Firma', 'nav.ekipSohbeti': 'Ekip Sohbeti', 'nav.personel': 'Personel', 'nav.hediyeKodu': 'Hediye Kodu',
      'nav.raporlar': 'Raporlar', 'nav.musteriOlarakGir': 'Musteri Olarak Gir',
    };
    return fallback[k] || k;
  });
  const items: NavItem[] = [
    { name: 'index', title: tt('nav.panel'), icon: 'grid', color: theme.colors.primary },
    { name: 'teklif', title: tt('nav.teklif'), icon: 'create', color: m.teklif },
    { name: 'catalog', title: tt('nav.katalog'), icon: 'library', color: m.katalog },
    { name: 'history', title: tt('nav.gecmis'), icon: 'time', color: m.gecmis },
    { name: 'customers', title: tt('nav.musteri'), icon: 'people', color: m.musteri },
    { name: 'services', title: tt('nav.servis'), icon: 'construct', color: m.servis },
    { name: 'campaigns', title: tt('nav.kampanya'), icon: 'megaphone', color: m.kampanya },
    { name: 'leads', title: tt('nav.musteriAvcisi'), icon: 'search', color: m.lead },
    { name: 'reminders', title: tt('nav.hatirlatmalar'), icon: 'notifications', color: m.hatirlatma },
    { name: 'calendar', title: tt('nav.takvim'), icon: 'calendar', color: m.hatirlatma },
    { name: 'reports', title: tt('nav.raporlar'), icon: 'bar-chart', color: m.raporlar },
  ];
  // Kısıtlı personel (staff_role !== 'admin') Kasa/Tahsilat'ı hiç göremesin —
  // gerçek erişim engeli backend'de (403), bu sadece o sekmeleri gizliyor.
  if (!opts?.restricted) {
    items.push({ name: 'kasa', title: tt('nav.kasa'), icon: 'wallet', color: m.kasa });
    items.push({ name: 'tahsilat', title: tt('nav.tahsilat'), icon: 'cash', color: m.tahsilat });
  }
  items.push({ name: 'company', title: tt('nav.firma'), icon: 'business', color: m.firma });
  // AI Asistan artık sol menüde ayrı bir madde olarak gösterilmiyor (kullanıcı
  // isteğiyle kaldırıldı) — sayfaya route hâlâ var (app/(tabs)/assistant),
  // sadece sol navigasyon listesinden çıkarıldı.
  // Ekip Sohbeti: firma sahibi + personel arasında birebir mesajlaşma —
  // herkese açık (Kasa/Tahsilat gibi kısıtlı değil).
  items.push({ name: 'team-chat', title: tt('nav.ekipSohbeti'), icon: 'chatbubbles', color: theme.colors.modules.mesaj });
  // Personel ekranı sadece firma sahibine gösterilir.
  if (opts?.isOwner) {
    items.push({ name: 'personel', title: tt('nav.personel'), icon: 'person-add', color: theme.colors.gold });
  }
  // Hediye kodu üretme ekranı sadece uygulamayı işleten admin hesabına gösterilir.
  if (opts?.isAdmin) {
    items.push({ name: 'promo-admin', title: tt('nav.hediyeKodu'), icon: 'gift', color: theme.colors.gold });
    // Müşteri olarak gir: admin, şifre görmeden/sormadan bir müşteri
    // hesabına destek amaçlı geçici erişim açabilir.
    items.push({ name: 'admin-customers', title: tt('nav.musteriOlarakGir'), icon: 'key', color: theme.colors.gold });
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

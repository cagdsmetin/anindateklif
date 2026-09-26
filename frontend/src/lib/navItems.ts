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
      'nav.raporlar': 'Raporlar', 'nav.musteriOlarakGir': 'Musteri Olarak Gir', 'nav.personelTeklifleri': 'Personel Teklifleri',
      'nav.reklamIstihbarati': 'Reklam Istihbarati', 'nav.eFatura': 'e-Fatura', 'nav.sozlesmeler': 'Sozlesmeler',
      'nav.kuponlar': 'Kuponlar', 'nav.prim': 'Personel Primi', 'nav.yorumlar': 'Yorum Yanitla',
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
    { name: 'kuponlar', title: tt('nav.kuponlar'), icon: 'pricetags', color: m.kupon },
    { name: 'yorumlar', title: tt('nav.yorumlar'), icon: 'star', color: m.yorum },
    { name: 'leads', title: tt('nav.musteriAvcisi'), icon: 'search', color: m.lead },
    { name: 'efatura', title: tt('nav.eFatura'), icon: 'receipt', color: m.efatura },
    { name: 'reminders', title: tt('nav.hatirlatmalar'), icon: 'notifications', color: m.hatirlatma },
    { name: 'calendar', title: tt('nav.takvim'), icon: 'calendar', color: m.hatirlatma },
    { name: 'contracts', title: tt('nav.sozlesmeler'), icon: 'document-lock', color: m.sozlesme },
    { name: 'reports', title: tt('nav.raporlar'), icon: 'bar-chart', color: m.raporlar },
  ];
  // Reklam İstihbaratı sadece yöneticilere (firma sahibi + admin rollü
  // personel) gösterilir; gerçek engel backend'de (403).
  if (!opts?.restricted) {
    items.splice(items.findIndex((i) => i.name === 'efatura'), 0, { name: 'ads-intel', title: tt('nav.reklamIstihbarati'), icon: 'megaphone', color: m.reklam });
  }
  // Kasa/Tahsilat herkese açık: kısıtlı personel backend'den yalnız kendi
  // müşterilerinin hareketlerini ve kendi harcamalarını alır, silemez.
  items.push({ name: 'kasa', title: tt('nav.kasa'), icon: 'wallet', color: m.kasa });
  items.push({ name: 'tahsilat', title: tt('nav.tahsilat'), icon: 'cash', color: m.tahsilat });
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
    // Personel Teklifleri: yönetici, atadığı personel/yöneticilerin verdiği
    // teklifleri (durum dağılımı + fiyat detayları) izleyebilsin diye --
    // personel ekranıyla aynı şekilde sadece firma sahibine gösterilir.
    items.push({ name: 'personel-teklifleri', title: tt('nav.personelTeklifleri'), icon: 'pie-chart', color: theme.colors.modules.raporlar });
  }
  // Personel Primi: yöneticiler (firma sahibi + admin rollü personel).
  if (!opts?.restricted) {
    items.push({ name: 'prim', title: tt('nav.prim'), icon: 'trophy', color: theme.colors.modules.prim });
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

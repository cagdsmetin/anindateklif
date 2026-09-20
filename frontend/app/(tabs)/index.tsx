import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { statusColor, theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import AnimatedPressable from '@/src/components/AnimatedPressable';
import {
  alpha,
  Aurora,
  BeamRow,
  BorderBeam,
  CountUp,
  Donut,
  DonutSlice,
  Marquee,
  mix,
  MotionScrollView,
  Reveal,
  themedSheet,
  TiltOnScroll,
  TracingBeam,
  useScrollScene,
  useViewportProgress,
} from '@/src/components/motion';
import { api, QuoteT, RatesT, ServiceT } from '@/src/lib/api';
import { sumToTRY, RatesLike, computeCustomerDebtSummaries } from '@/src/lib/tahsilat-utils';
import { useLanguage, orderedAmounts, statusLabel, Lang, upper } from '@/src/lib/i18n';

// ============================================================================
// Panel -- 21st.dev'deki scroll animasyonlarından ilhamla yeniden tasarlandı:
// aurora arka planlı, kenarı ışıklı (Border Beam) bir karşılama kartı, canlı
// piyasa bandı (Scroll Velocity), kaydırdıkça beliren kartlar (Scroll Reveal),
// 3B eğimle gelen Genel Bakış (Container Scroll), ışınla dolan Yaklaşan İşler
// zaman çizelgesi (Tracing Beam) ve kaydırmalı Son Teklifler. Hesaplamalar
// ve yönlendirmeler eskisiyle birebir aynı; sadece görünüm katmanı değişti.
// Tüm efektler src/components/motion altında, native + web ortak.
// ============================================================================

type IconName = keyof typeof Ionicons.glyphMap;

const QUOTE_STATUSES = ['Beklemede', 'Görüldü', 'Onaylandı', 'Reddedildi'] as const;
const QUOTE_STATUS_COLORS: Record<string, string> = {
  Beklemede: theme.colors.textMuted,
  Görüldü: theme.colors.gold,
  Onaylandı: theme.colors.green,
  Reddedildi: theme.colors.red,
};

function fmtTRY(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  const digits = n >= 1000 ? 0 : 2;
  return '₺' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

function fmtIndex(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtUSD(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  const digits = n >= 1000 ? 0 : 2;
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function todayLabel() {
  const d = new Date();
  return `${TR_DAYS[d.getDay()]}, ${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

function parseTarih(tarih: string): Date | null {
  const m = (tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function trDate(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '-';
}

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}

function urgency(days: number) {
  if (days <= 0) return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b' };
  if (days <= 7) return { bg: theme.colors.goldSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark };
  return { bg: theme.colors.primarySoft, border: theme.colors.primaryBorder, text: theme.colors.primaryDark };
}

export default function PanelScreen() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, quotes, customers, services, campaigns, kasa, tahsilat } = useApp();
  const { user } = useAuth();

  const [subStatus, setSubStatus] = useState<{ subscription_active: boolean; remaining_free: number; days_left?: number | null; renewal_due_soon?: boolean } | null>(null);
  const [rates, setRates] = useState<RatesT | null>(null);


  useEffect(() => {
    api.subscriptionStatus().then((r: any) => setSubStatus(r)).catch(() => {});

    // Kur/kripto/BIST şeridi "anlık" hissettirsin diye periyodik olarak yeniliyoruz
    // (backend tarafında da 30sn'lik kısa bir cache var, yani bu istekler ucuz).
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const now = new Date();

  const quotesThisMonth = useMemo(() => {
    return quotes.filter((q) => {
      const d = parseTarih(q.tarih);
      return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [quotes]);

  const hacimBuAy = useMemo(
    () => quotesThisMonth.reduce((a, q) => a + ((q.paraBirimi || 'USD') === 'USD' ? q.genelToplam || 0 : 0), 0),
    [quotesThisMonth]
  );

  // Bu ay hacim, artık tek bir para biriminde toplanıyor (TRY) — bir esnaf USD,
  // biri EUR, biri TL teklif veriyor olabilir; bunları olduğu gibi toplamak
  // yanlış bir rakam üretir. Canlı kurla hepsini TRY'ye çevirip topluyoruz,
  // altında da o TRY toplamın USD/EUR karşılığını gösteriyoruz.
  const hacimTRY = useMemo(() => {
    if (!rates || (!rates.usd_try && !rates.eur_try)) return null;
    let missingRate = false;
    const total = quotesThisMonth.reduce((a, q) => {
      const val = q.genelToplam || 0;
      const cur = (q.paraBirimi || 'USD').toUpperCase();
      if (cur === 'TRY' || cur === 'TL') return a + val;
      if (cur === 'USD') {
        if (!rates.usd_try) { missingRate = true; return a; }
        return a + val * rates.usd_try;
      }
      if (cur === 'EUR') {
        if (!rates.eur_try) { missingRate = true; return a; }
        return a + val * rates.eur_try;
      }
      return a;
    }, 0);
    return missingRate ? null : total;
  }, [quotesThisMonth, rates]);

  const hacimUSDEquiv = useMemo(
    () => (hacimTRY != null && rates?.usd_try ? hacimTRY / rates.usd_try : null),
    [hacimTRY, rates]
  );
  const hacimEURequiv = useMemo(
    () => (hacimTRY != null && rates?.eur_try ? hacimTRY / rates.eur_try : null),
    [hacimTRY, rates]
  );

  const yanitBekleyen = useMemo(
    () => quotes.filter((q) => q.durum === 'Beklemede' || q.durum === 'Görüldü').length,
    [quotes]
  );

  const aktifServis = useMemo(
    () => services.filter((s) => s.durum === 'Açık' || s.durum === 'Devam ediyor').length,
    [services]
  );

  const garantiAktif = useMemo(() => {
    return services.filter((s) => {
      const d = daysUntil(s.garantiBitis);
      return d !== null && d >= 0;
    }).length;
  }, [services]);

  // Combined "yaklaşan işler" — service warranty/maintenance and pending quote validity,
  // all within their normal reminder windows, sorted soonest-first, capped to 5.
  type UpcomingItem = { key: string; title: string; sub: string; days: number; onPress: () => void };
  const upcoming = useMemo(() => {
    const items: UpcomingItem[] = [];
    services.forEach((svc: ServiceT) => {
      const gd = daysUntil(svc.garantiBitis);
      if (gd !== null && gd <= 30) {
        items.push({
          key: `g-${svc.id}`,
          title: svc.baslik || 'Servis',
          sub: `Garanti · ${svc.musFirma || svc.musYetkili || '-'}`,
          days: gd,
          onPress: () => router.push({ pathname: '/service-add', params: { id: svc.id } } as any),
        });
      }
      const bd = daysUntil(svc.bakimTarihi);
      if (bd !== null && bd <= 30) {
        items.push({
          key: `b-${svc.id}`,
          title: svc.baslik || 'Servis',
          sub: `Bakım · ${svc.musFirma || svc.musYetkili || '-'}`,
          days: bd,
          onPress: () => router.push({ pathname: '/service-add', params: { id: svc.id } } as any),
        });
      }
    });
    quotes.forEach((q: QuoteT) => {
      if (q.durum !== 'Beklemede' && q.durum !== 'Görüldü') return;
      const qd = daysUntil(q.gecerlilik);
      if (qd !== null && qd <= 7) {
        items.push({
          key: `t-${q.id}`,
          title: `${q.teklifNo} · ${q.musFirma}`,
          sub: t('panel.s020'),
          days: qd,
          onPress: () => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: q.id } } as any),
        });
      }
    });
    return items.sort((a, b) => a.days - b.days).slice(0, 5);
  }, [services, quotes]);

  const overdueCount = upcoming.filter((x) => x.days <= 0).length;

  const sonTeklifler = useMemo(() => {
    return [...quotes]
      .sort((a, b) => (b.createdAt || b.tarih || '').localeCompare(a.createdAt || a.tarih || ''))
      .slice(0, 5);
  }, [quotes]);

  // "Genel Bakış" grafikleri — Paraşüt'ün Güncel Durum sayfasından ilhamla:
  // bu ayki kasa gelir/gider oranı + teklif durum dağılımı, basit yığın çubuklarla.
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const kasaThisMonth = useMemo(
    () => kasa.filter((k) => (k.tarih || '').slice(0, 7) === thisMonthKey && (k.paraBirimi || 'TRY') === 'TRY'),
    [kasa, thisMonthKey]
  );
  const gelirBuAy2 = useMemo(() => kasaThisMonth.filter((k) => k.tur === 'gelir').reduce((a, k) => a + k.tutar, 0), [kasaThisMonth]);
  const giderBuAy2 = useMemo(() => kasaThisMonth.filter((k) => k.tur === 'gider').reduce((a, k) => a + k.tutar, 0), [kasaThisMonth]);
  const kasaHacim = gelirBuAy2 + giderBuAy2;
  const gelirPct = kasaHacim > 0 ? Math.round((gelirBuAy2 / kasaHacim) * 100) : 0;

  // Nakit Durumu kartı: bu ay gerçekten TAHSİL EDİLEN ödemeleri (Gelir),
  // bu ay kasadan çıkan parayı (Gider) ve bugüne kadar biriken, hâlâ tahsil
  // edilmemiş toplam alacağı (Borç) tek pastada gösterir.
  const tahsilatThisMonth = useMemo(
    () => tahsilat.filter((t) => t.tur === 'tahsilat' && (t.tarih || '').slice(0, 7) === thisMonthKey),
    [tahsilat, thisMonthKey]
  );
  // Nakit Durumu pastası: Gelir tek yığın yerine ödeme yöntemine göre
  // (Nakit/Kart/Havale/Çek/Diğer) ayrı dilimlere bölünüyor, yanına bu ayki
  // Gider ve bugüne kadar biriken toplam Borç dilimleri ekleniyor -- böylece
  // tek pastada hem paranın hangi yöntemle geldiği hem de genel nakit
  // durumu görülüyor.
  const METHOD_SLICE_COLORS: Record<string, string> = {
    'Nakit': '#10B981',
    'Kart': '#6366F1',
    'Havale/EFT': '#0EA5E9',
    'Çek': '#8B5CF6',
    'Diğer': '#94A3B8',
  };
  const paymentBreakdown = useMemo(() => {
    const byMethod: Record<string, { paraBirimi: string; tutar: number }[]> = {};
    tahsilatThisMonth.forEach((tx) => {
      const y = tx.yontem || t('panel.s002');
      if (!byMethod[y]) byMethod[y] = [];
      byMethod[y].push({ paraBirimi: tx.paraBirimi, tutar: tx.tutar });
    });
    const slices = Object.entries(byMethod)
      .map(([yontem, entries]) => ({
        label: statusLabel(lang, yontem),
        color: METHOD_SLICE_COLORS[yontem] || theme.colors.textMuted,
        value: sumToTRY(entries, rates as RatesLike) || 0,
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    const debtSummaries = computeCustomerDebtSummaries(tahsilat);
    const borcEntries: { paraBirimi: string; tutar: number }[] = [];
    debtSummaries.forEach((d) => {
      d.perCurrency.forEach((c) => {
        if (c.kalanBorc > 0.009) borcEntries.push({ paraBirimi: c.paraBirimi, tutar: c.kalanBorc });
      });
    });
    const borcTutar = sumToTRY(borcEntries, rates as RatesLike) || 0;
    if (giderBuAy2 > 0) slices.push({ label: t('panel.s022'), color: '#EF4444', value: giderBuAy2 });
    if (borcTutar > 0) slices.push({ label: t('panel.borcLabel'), color: '#F59E0B', value: borcTutar });
    return slices;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahsilatThisMonth, tahsilat, rates, giderBuAy2, lang]);
  const paymentTotal = paymentBreakdown.reduce((a, x) => a + x.value, 0);

  const quoteStatusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    QUOTE_STATUSES.forEach((st) => { map[st] = 0; });
    quotes.forEach((q) => { if (map[q.durum] !== undefined) map[q.durum] += 1; });
    return map;
  }, [quotes]);
  const quoteStatusTotal = quotes.length;
  // Her teklif durumu (Beklemede/Onaylandı/Reddedildi vb.) için toplam para
  // değeri -- farklı para birimlerindeki teklifler günün kuruyla TL'ye
  // çevrilip toplanır, TEKLİF DURUMLARI pasta diliminin altında gösterilir.
  const quoteStatusValues = useMemo(() => {
    const byStatus: Record<string, { paraBirimi: string; tutar: number }[]> = {};
    quotes.forEach((q) => {
      if (!byStatus[q.durum]) byStatus[q.durum] = [];
      byStatus[q.durum].push({ paraBirimi: q.paraBirimi, tutar: q.genelToplam });
    });
    const map: Record<string, number> = {};
    QUOTE_STATUSES.forEach((st) => { map[st] = sumToTRY(byStatus[st] || [], rates as RatesLike) || 0; });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, rates]);

  // Personel için Nakit Durumu yerine: kendi bu ayki tekliflerinin özeti
  const myQuotesThisMonth = useMemo(() => {
    if (!user?.is_staff) return [];
    return quotes.filter((q) => q.hazirlayanEmail === user?.email && (q.tarih || '').slice(0, 7) === thisMonthKey);
  }, [quotes, user, thisMonthKey]);
  const myQuoteStatusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    QUOTE_STATUSES.forEach((st) => { map[st] = 0; });
    myQuotesThisMonth.forEach((q) => { if (map[q.durum] !== undefined) map[q.durum] += 1; });
    return map;
  }, [myQuotesThisMonth]);
  const myQuoteStatusTotal = myQuotesThisMonth.length;
  // --- Yeni görünümün ek türetilmiş verileri ------------------------------
  const { width: winW } = useWindowDimensions();
  const [pageW, setPageW] = useState(0);
  // Masaüstü web'de sol sidebar (232px) içerik alanından düşülür; gerçek
  // genişlik onLayout ile ölçülene kadar bu tahmin kullanılır.
  const isDesktopWeb = Platform.OS === 'web' && winW >= 900;
  const estW = Math.min(isDesktopWeb ? winW - 232 : winW, 1180) - 32;
  const W = pageW || estW;
  const isWide = W >= 720;

  // Hero'daki mini sütun grafiği: son 6 ayın teklif hacmi (kur varsa TL'ye
  // çevrilmiş toplam, yoksa teklif adedi -- iki durumda da aylar kendi
  // içinde karşılaştırılabilir kalsın diye ölçü tüm aylarda aynı).
  const monthsShort = t('panel.monthsShort').split(',');
  const monthly = useMemo(() => {
    const canConvert = !!(rates && rates.usd_try && rates.eur_try);
    const out: { key: string; label: string; value: number }[] = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entries = quotes
        .filter((q) => (q.tarih || '').slice(0, 7) === key)
        .map((q) => ({ paraBirimi: q.paraBirimi || 'USD', tutar: q.genelToplam || 0 }));
      const vol = canConvert ? sumToTRY(entries, rates as RatesLike) : null;
      out.push({ key, label: monthsShort[d.getMonth()] || '', value: canConvert ? vol || 0 : entries.length });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, rates, lang]);

  const s = styles();

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('panel.s003')} />
        <View style={s.empty}>
          <Text style={s.emptyText}>{t('panel.s023')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hour = now.getHours();
  const greetKey =
    hour < 5 ? 'panel.greetNight' : hour < 12 ? 'panel.greetMorning' : hour < 18 ? 'panel.greetDay' : hour < 22 ? 'panel.greetEvening' : 'panel.greetNight';
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `${t(greetKey)}, ${firstName}` : t(greetKey);

  const [primaryAmt, ...secondaryAmt] = orderedAmounts(lang, hacimTRY, hacimUSDEquiv, hacimEURequiv);
  const secondaryShown = secondaryAmt.filter((x) => x.val != null);

  const cellCols = isWide ? 4 : 2;
  const cellW = cell(W, cellCols, GAP);
  const modCols = W >= 900 ? 6 : W >= 560 ? 4 : 3;
  const modW = cell(W, modCols, GAP);

  const kpis: { icon: IconName; label: string; value: number; color: string; onPress: () => void }[] = [
    { icon: 'people', label: t('panel.s005'), value: customers.length, color: theme.colors.modules.musteri, onPress: () => router.push('/(tabs)/customers') },
    { icon: 'construct', label: t('panel.s043'), value: aktifServis, color: theme.colors.modules.servis, onPress: () => router.push('/(tabs)/services') },
    { icon: 'shield-checkmark', label: t('panel.s044'), value: garantiAktif, color: theme.colors.modules.gecmis, onPress: () => router.push('/(tabs)/services') },
    { icon: 'megaphone', label: t('panel.s006'), value: campaigns.length, color: theme.colors.modules.kampanya, onPress: () => router.push('/(tabs)/campaigns') },
  ];

  const quickActions: { icon: IconName; label: string; color: string; onPress: () => void }[] = [
    { icon: 'add-circle', label: t('panel.s053'), color: theme.colors.modules.teklif, onPress: () => router.push('/(tabs)/teklif') },
    { icon: 'person-add', label: t('panel.s054'), color: theme.colors.modules.musteri, onPress: () => router.push('/customer-add' as any) },
    { icon: 'build', label: t('panel.s055'), color: theme.colors.modules.servis, onPress: () => router.push('/service-add' as any) },
    { icon: 'megaphone', label: t('panel.s056'), color: theme.colors.modules.kampanya, onPress: () => router.push('/campaign-add' as any) },
  ];

  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';
  const modules: { key: string; icon: IconName; label: string; color: string; onPress: () => void }[] = [
    { key: 'teklif', icon: 'create', label: t('panel.s064'), color: theme.colors.modules.teklif, onPress: () => router.push('/(tabs)/teklif') },
    { key: 'katalog', icon: 'library', label: t('panel.s065'), color: theme.colors.modules.katalog, onPress: () => router.push('/(tabs)/catalog') },
    { key: 'gecmis', icon: 'time', label: t('panel.s066'), color: theme.colors.modules.gecmis, onPress: () => router.push('/(tabs)/history') },
    { key: 'musteri', icon: 'people', label: t('panel.s005'), color: theme.colors.modules.musteri, onPress: () => router.push('/(tabs)/customers') },
    { key: 'servis', icon: 'construct', label: t('panel.s067'), color: theme.colors.modules.servis, onPress: () => router.push('/(tabs)/services') },
    { key: 'kampanya', icon: 'megaphone', label: t('panel.s006'), color: theme.colors.modules.kampanya, onPress: () => router.push('/(tabs)/campaigns') },
    { key: 'lead', icon: 'search', label: t('panel.s068'), color: theme.colors.modules.lead, onPress: () => router.push('/(tabs)/leads' as any) },
    { key: 'reklam', icon: 'megaphone', label: 'Reklam İstihbaratı', color: theme.colors.modules.reklam, onPress: () => router.push('/(tabs)/ads-intel' as any) },
    { key: 'efatura', icon: 'receipt', label: 'e-Fatura', color: theme.colors.modules.efatura, onPress: () => router.push('/(tabs)/efatura' as any) },
    { key: 'takvim', icon: 'calendar', label: t('panel.s069'), color: theme.colors.modules.hatirlatma, onPress: () => router.push('/(tabs)/calendar' as any) },
    { key: 'hatirlatma', icon: 'notifications', label: t('panel.s070'), color: theme.colors.modules.hatirlatma, onPress: () => router.push('/reminders' as any) },
    { key: 'rapor', icon: 'bar-chart', label: t('panel.s071'), color: theme.colors.modules.raporlar, onPress: () => router.push('/reports' as any) },
    { key: 'kasa', icon: 'wallet', label: t('panel.s072'), color: theme.colors.modules.kasa, onPress: () => router.push('/(tabs)/kasa') },
    { key: 'tahsilat', icon: 'cash', label: t('panel.s073'), color: theme.colors.modules.tahsilat, onPress: () => router.push('/(tabs)/tahsilat') },
    { key: 'firma', icon: 'business', label: t('panel.s074'), color: theme.colors.modules.firma, onPress: () => router.push('/(tabs)/company') },
    { key: 'mesaj', icon: 'chatbubbles', label: t('panel.s075'), color: theme.colors.modules.mesaj, onPress: () => router.push('/(tabs)/team-chat' as any) },
  ];
  if (!user?.is_staff) {
    modules.push({ key: 'personel', icon: 'person-add', label: t('panel.s076'), color: theme.colors.gold, onPress: () => router.push('/(tabs)/personel' as any) });
  }
  if (isAdmin) {
    modules.push({ key: 'promo', icon: 'gift', label: t('panel.s077'), color: theme.colors.gold, onPress: () => router.push('/(tabs)/promo-admin' as any) });
    modules.push({ key: 'ag', icon: 'calculator', label: 'Albert Genau Fiyat', color: theme.colors.gold, onPress: () => router.push('/(tabs)/albert-genau-admin' as any) });
  }

  // Genel Bakış panelleri -- pasta dilimleri ve açıklama satırları aynı
  // sıradan üretilir ki web'deki fare üstü vurgusu doğru dilimi bulsun.
  const cashPanel: PanelData = {
    title: t('panel.s048'),
    slices: paymentBreakdown.map((d) => ({ value: d.value, color: d.color })),
    legend: paymentBreakdown.map((d) => ({
      label: d.label,
      color: d.color,
      value: fmtTRY(d.value),
      pctLabel: paymentTotal > 0 ? `${Math.round((d.value / paymentTotal) * 100)}%` : undefined,
    })),
    centerLabel: t('panel.toplamLabel'),
    centerValue: fmtCompactTRY(paymentTotal, t),
    emptyText: t('panel.s049'),
  };

  const myStatuses = QUOTE_STATUSES.filter((st) => (myQuoteStatusCounts[st] || 0) > 0);
  const staffPanel: PanelData = {
    title: t('panel.s046'),
    slices: myStatuses.map((st) => ({ value: myQuoteStatusCounts[st] || 0, color: QUOTE_STATUS_COLORS[st] })),
    legend: myStatuses.map((st) => ({
      label: statusLabel(lang, st),
      color: QUOTE_STATUS_COLORS[st],
      value: String(myQuoteStatusCounts[st] || 0),
    })),
    centerLabel: t('panel.s051'),
    centerValue: String(myQuoteStatusTotal),
    emptyText: t('panel.s047'),
  };

  const shownStatuses = QUOTE_STATUSES.filter((st) => (quoteStatusCounts[st] || 0) > 0);
  const statusPanel: PanelData = {
    title: t('panel.s050'),
    slices: shownStatuses.map((st) => ({ value: quoteStatusCounts[st] || 0, color: QUOTE_STATUS_COLORS[st] })),
    legend: shownStatuses.map((st) => ({
      label: statusLabel(lang, st),
      color: QUOTE_STATUS_COLORS[st],
      value: String(quoteStatusCounts[st] || 0),
      countLabel: String(quoteStatusCounts[st] || 0),
      amountLabel: fmtTRY(quoteStatusValues[st] || 0),
    })),
    centerLabel: t('panel.s051'),
    centerValue: String(quoteStatusTotal),
    emptyText: t('panel.s007'),
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('panel.s003')} />

      <MotionScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.page} onLayout={(e) => setPageW(Math.round(e.nativeEvent.layout.width))}>
          <PanelHero
            isWide={isWide}
            greeting={greeting}
            dateLine={`${todayLabel()}  ·  ${activeCompany.sirketAdi || ''}`}
            label={`${t('panel.s041')}${primaryAmt.val == null ? ` (${primaryAmt.cur})` : ''}`}
            value={primaryAmt.val != null ? primaryAmt.val : hacimBuAy}
            cur={primaryAmt.val != null ? primaryAmt.cur : 'USD'}
            secondary={
              primaryAmt.val != null && secondaryShown.length > 0
                ? `≈ ${secondaryShown.map((x) => fmt(x.val as number, x.cur)).join('  ·  ')}`
                : null
            }
            monthCount={quotesThisMonth.length}
            pending={yanitBekleyen}
            monthly={monthly}
            t={t}
            onVolume={() => router.push('/(tabs)/history')}
            onPending={() => router.push({ pathname: '/(tabs)/history', params: { filter: 'bekleyen' } } as any)}
          />

          {rates && (rates.usd_try || rates.btc_try) ? (
            <Reveal style={s.marketBlock}>
              <View style={s.marketHead}>
                <LiveDot color={theme.colors.green} />
                <Text style={s.marketHeadText}>{t('panel.s024')}</Text>
              </View>
              <Marquee fadeColor={theme.colors.surfaceSoft} speed={24} gap={10} style={s.marketStrip}>
                <RatePill label={t('panel.s025')} value={rates.usd_try} icon="cash-outline" accent={theme.colors.primary} />
                <RatePill label={t('panel.s026')} value={rates.eur_try} icon="cash-outline" accent={theme.colors.primary} />
                {rates.altin_gram_try != null && (
                  <RatePill
                    label={t('panel.s027')}
                    value={rates.altin_gram_try}
                    subValue={rates.altin_ons_usd != null ? fmtUSD(rates.altin_ons_usd) + ' (ons)' : null}
                    icon="ellipse"
                    accent={theme.colors.gold}
                  />
                )}
                {rates.gumus_gram_try != null && (
                  <RatePill
                    label={t('panel.s028')}
                    value={rates.gumus_gram_try}
                    subValue={rates.gumus_ons_usd != null ? fmtUSD(rates.gumus_ons_usd) + ' (ons)' : null}
                    icon="ellipse-outline"
                    accent={theme.colors.textMuted}
                  />
                )}
                <RatePill label={t('panel.s029')} value={rates.btc_usd} format="usd" subValue={rates.btc_try != null ? fmtTRY(rates.btc_try) : null} icon="logo-bitcoin" accent={theme.colors.gold} />
                <RatePill label={t('panel.s030')} value={rates.eth_usd} format="usd" subValue={rates.eth_try != null ? fmtTRY(rates.eth_try) : null} icon="diamond-outline" accent={theme.colors.gold} />
                {rates.bist100 != null && <RatePill label={t('panel.s031')} value={rates.bist100} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
                {rates.bist50 != null && <RatePill label={t('panel.s032')} value={rates.bist50} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
                {rates.bist30 != null && <RatePill label={t('panel.s033')} value={rates.bist30} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
              </Marquee>
            </Reveal>
          ) : null}

          {subStatus && !subStatus.subscription_active && (
            <Banner tone="primary" icon="gift-outline" onPress={() => router.push('/subscription' as any)}>
              <Text style={s.bannerStrong}>
                {Math.max(subStatus.remaining_free ?? 0, 0)} {t('panel.s034')}
              </Text>{' '}
              {t('panel.s035')}
            </Banner>
          )}

          {subStatus?.subscription_active && subStatus.renewal_due_soon && (
            <Banner tone="gold" icon="time-outline" onPress={() => router.push('/subscription' as any)}>
              <Text style={s.bannerStrong}>
                {t('panel.s036')}
                {Math.max(subStatus.days_left ?? 0, 0)} {t('panel.s037')}
              </Text>{' '}
              {t('panel.s038')}
            </Banner>
          )}

          {overdueCount > 0 && (
            <Banner tone="gold" icon="alert-circle" onPress={() => router.push('/reminders' as any)}>
              <Text style={s.bannerStrong}>
                {overdueCount} {t('panel.s039')}
              </Text>{' '}
              {t('panel.s040')}
            </Banner>
          )}

          <View style={s.grid}>
            {kpis.map((k) => (
              <Reveal key={k.label} style={{ width: cellW }}>
                <KpiCard {...k} />
              </Reveal>
            ))}
          </View>

          <SectionTitle icon="pie-chart-outline" title={t('panel.s045')} />
          <TiltOnScroll>
            <Reveal variant="fade">
              <View style={s.overviewShell}>
                <View style={[s.overviewBody, isWide && s.overviewBodyWide]}>
                  <OverviewPanel data={user?.is_staff ? staffPanel : cashPanel} />
                  <View style={isWide ? s.overviewDividerV : s.overviewDividerH} />
                  <OverviewPanel data={statusPanel} />
                </View>
              </View>
            </Reveal>
          </TiltOnScroll>

          <SectionTitle icon="flash-outline" title={t('panel.s052')} />
          <View style={s.grid}>
            {quickActions.map((q) => (
              <Reveal key={q.label} variant="scale" style={{ width: cellW }}>
                <QuickTile {...q} />
              </Reveal>
            ))}
          </View>

          <View style={isWide ? s.twoCol : undefined}>
            <View style={isWide ? s.col : undefined}>
              <SectionTitle icon="time-outline" title={t('panel.s057')} actionLabel={t('panel.s008')} onAction={() => router.push('/reminders' as any)} />
              <UpcomingTimeline items={upcoming} emptyText={t('panel.s058')} todayText={t('panel.s059')} />
            </View>
            <View style={isWide ? s.col : undefined}>
              <SectionTitle icon="document-text-outline" title={t('panel.s060')} actionLabel={t('panel.s008')} onAction={() => router.push('/(tabs)/history')} />
              <RecentQuotes
                quotes={sonTeklifler}
                carousel={!isWide}
                emptyText={t('panel.s007')}
                unnamed={t('panel.s061')}
                lang={lang}
                onOpen={(q) => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: q.id } } as any)}
              />
            </View>
          </View>

          <SectionTitle icon="grid-outline" title={t('panel.s063')} />
          <View style={s.grid}>
            {modules.map((m) => (
              <Reveal key={m.key} variant="tilt" style={{ width: modW }}>
                <ModuleTile icon={m.icon} label={m.label} color={m.color} onPress={m.onPress} />
              </Reveal>
            ))}
          </View>
        </View>
      </MotionScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Karşılama kartı (hero)
// ============================================================================

function PanelHero({
  isWide,
  greeting,
  dateLine,
  label,
  value,
  cur,
  secondary,
  monthCount,
  pending,
  monthly,
  t,
  onVolume,
  onPending,
}: {
  isWide: boolean;
  greeting: string;
  dateLine: string;
  label: string;
  value: number;
  cur: string;
  secondary: string | null;
  monthCount: number;
  pending: number;
  monthly: { key: string; label: string; value: number }[];
  t: (k: string) => string;
  onVolume: () => void;
  onPending: () => void;
}) {
  const s = styles();
  const scene = useScrollScene();

  // Kaydırdıkça hero içeriği biraz aşağıda kalıp söner (parallax) --
  // aurora bulutları Aurora bileşeninde kendi hızlarında kayar.
  const drift = useAnimatedStyle(() => {
    if (!scene) return {};
    const y = scene.scrollY.value;
    return {
      opacity: interpolate(y, [0, 300], [1, 0.2], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(y, [0, 340], [0, 74], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={s.heroShadow}>
      <BorderBeam radius={26} width={1.5} background={HERO_BASE} baseBorder="rgba(148,163,184,0.18)">
        <Aurora colors={['#6366F1', '#A855F7', '#22D3EE']} base={[HERO_BASE, '#141C3C']}>
          <Animated.View style={[s.heroInner, isWide && s.heroInnerWide, drift]}>
            <View style={isWide ? s.heroMain : undefined}>
              <Text style={s.heroGreeting} numberOfLines={1}>
                {greeting}
              </Text>
              <Text style={s.heroDate} numberOfLines={1}>
                {dateLine}
              </Text>

              <AnimatedPressable style={s.heroKpi} onPress={onVolume} testID="hero-hacim-card" scaleTo={0.98}>
                <Text style={s.heroLabel}>{label}</Text>
                <CountUp
                  value={value}
                  format={(n) => fmt(n, cur)}
                  style={[s.heroValue, isWide && s.heroValueWide]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                />
                {secondary ? (
                  <Text style={s.heroSecondary} numberOfLines={1}>
                    {secondary}
                  </Text>
                ) : null}
              </AnimatedPressable>

              <View style={s.heroChips}>
                <AnimatedPressable style={s.chipWarn} onPress={onPending} testID="hero-bekleyen-card" scaleTo={0.96}>
                  <LiveDot color={GOLD} />
                  <Text style={s.chipWarnLabel}>{t('panel.s042')}</Text>
                  <Text style={s.chipWarnValue}>{pending}</Text>
                  <Ionicons name="chevron-forward" size={13} color="rgba(253,230,138,0.75)" />
                </AnimatedPressable>
                <View style={s.chip}>
                  <Ionicons name="document-text-outline" size={13} color="#C7D2FE" />
                  <Text style={s.chipLabel}>{t('panel.thisMonth')}</Text>
                  <Text style={s.chipValue}>
                    {monthCount} {t('panel.teklifUnit')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[s.heroChart, isWide && s.heroChartWide]}>
              <Text style={s.heroChartTitle}>{t('panel.last6Months')}</Text>
              <MiniBars data={monthly} height={isWide ? 104 : 62} />
            </View>
          </Animated.View>
        </Aurora>
      </BorderBeam>
    </View>
  );
}

// Son 6 ayın sütunları -- açılışta sırayla yukarı doğru büyür.
function MiniBars({ data, height }: { data: { key: string; label: string; value: number }[]; height: number }) {
  const s = styles();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={s.barsRow}>
      {data.map((d, i) => (
        <MiniBar key={d.key} index={i} label={d.label} ratio={d.value / max} current={i === data.length - 1} height={height} />
      ))}
    </View>
  );
}

function MiniBar({ ratio, label, current, index, height }: { ratio: number; label: string; current: boolean; index: number; height: number }) {
  const s = styles();
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  const target = Math.max(4, ratio * height);

  useEffect(() => {
    if (reduced) return;
    grow.value = withDelay(260 + index * 85, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [reduced, index, grow]);

  const aStyle = useAnimatedStyle(() => ({ height: target * grow.value }));

  return (
    <View style={s.barCol}>
      <View style={[s.barTrack, { height }]}>
        <Animated.View style={[s.bar, current && s.barCurrent, aStyle]}>
          {current ? (
            <LinearGradient colors={['#A855F7', '#6366F1']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : null}
        </Animated.View>
      </View>
      <Text style={[s.barLabel, current && s.barLabelCurrent]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ============================================================================
// Kartlar
// ============================================================================

function Banner({ tone, icon, onPress, children }: { tone: 'primary' | 'gold'; icon: IconName; onPress: () => void; children: React.ReactNode }) {
  const s = styles();
  const c =
    tone === 'primary'
      ? { bg: theme.colors.primarySoft, border: theme.colors.primaryBorder, fg: theme.colors.primaryDark }
      : { bg: theme.colors.goldSoft, border: theme.colors.goldBorder, fg: theme.colors.goldDark };
  return (
    <Reveal>
      <AnimatedPressable style={[s.banner, { backgroundColor: c.bg, borderColor: c.border }]} onPress={onPress} scaleTo={0.98}>
        <View style={[s.bannerIcon, { backgroundColor: alpha(c.fg, 0.14) }]}>
          <Ionicons name={icon} size={15} color={c.fg} />
        </View>
        <Text style={[s.bannerText, { color: c.fg }]}>{children}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.fg} />
      </AnimatedPressable>
    </Reveal>
  );
}

function KpiCard({ icon, label, value, color, onPress }: { icon: IconName; label: string; value: number; color: string; onPress: () => void }) {
  const s = styles();
  return (
    <AnimatedPressable style={s.kpi} onPress={onPress} scaleTo={0.96}>
      <View style={s.kpiClip}>
        <LinearGradient
          colors={[alpha(color, 0.16), alpha(color, 0)] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.kpiTop}>
          <View style={[s.kpiIcon, { backgroundColor: color, boxShadow: `0 6px 14px ${alpha(color, 0.4)}` }]}>
            <Ionicons name={icon} size={16} color="#fff" />
          </View>
          <Ionicons name="arrow-forward" size={13} color={theme.colors.textMuted} style={s.kpiArrow} />
        </View>
        <CountUp value={value} style={s.kpiValue} />
        <Text style={s.kpiLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function QuickTile({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  const s = styles();
  return (
    <AnimatedPressable style={[s.quick, { boxShadow: `0 10px 22px ${alpha(color, 0.35)}` }]} onPress={onPress} scaleTo={0.95}>
      <View style={s.quickClip}>
        <LinearGradient
          colors={[mix(color, '#ffffff', 0.22), color] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.quickGlow} />
        <View style={s.quickIcon}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <Text style={s.quickLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

function ModuleTile({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  const s = styles();
  return (
    <AnimatedPressable style={s.mod} onPress={onPress} scaleTo={0.94}>
      <View style={[s.modIcon, { boxShadow: `0 8px 16px ${alpha(color, 0.35)}` }]}>
        <LinearGradient
          colors={[mix(color, '#ffffff', 0.25), color] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, s.modIconFill]}
        />
        <Ionicons name={icon} size={19} color="#fff" />
      </View>
      <Text style={s.modLabel} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// ============================================================================
// Bölüm başlığı -- altındaki ince çizgi, bölüm ekrana girerken soldan sağa dolar
// ============================================================================

function SectionTitle({ icon, title, actionLabel, onAction }: { icon: IconName; title: string; actionLabel?: string; onAction?: () => void }) {
  const s = styles();
  const ref = useAnimatedRef<Animated.View>();
  const p = useViewportProgress(ref, { from: 0.96, to: 0.62 });
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.02, p.value) }] }));

  return (
    <Animated.View ref={ref} collapsable={false} style={s.secWrap}>
      <View style={s.secRow}>
        <View style={s.secLeft}>
          <View style={s.secIcon}>
            <Ionicons name={icon} size={13} color={theme.colors.primary} />
          </View>
          <Text style={s.secTitle}>{upper(title)}</Text>
        </View>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} style={s.secAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.secActionText}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Animated.View style={[s.secLine, lineStyle]}>
        <LinearGradient
          colors={[theme.colors.primary, alpha(theme.colors.primary, 0)] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================================
// Genel Bakış (halka grafikler)
// ============================================================================

type LegendRow = { label: string; color: string; value: string; countLabel?: string; amountLabel?: string; pctLabel?: string };
type PanelData = {
  title: string;
  slices: DonutSlice[];
  legend: LegendRow[];
  centerLabel: string;
  centerValue: string;
  emptyText: string;
};

function OverviewPanel({ data }: { data: PanelData }) {
  const s = styles();
  const [hover, setHover] = useState<number | null>(null);
  const isEmpty = data.slices.length === 0 || data.slices.every((x) => !(x.value > 0));
  const hoverProps = (i: number): any =>
    Platform.OS === 'web' ? { onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) } : {};

  return (
    <View style={s.ovPanel}>
      <Text style={s.ovTitle}>{data.title}</Text>
      <View style={s.ovBody}>
        <Donut
          data={data.slices}
          size={108}
          thickness={15}
          holeColor={theme.colors.surface}
          trackColor={theme.colors.line}
          centerLabel={data.centerLabel}
          centerValue={data.centerValue}
          labelColor={theme.colors.textMuted}
          valueColor={theme.colors.navy}
          hoverIndex={hover}
          onHoverSlice={Platform.OS === 'web' ? setHover : undefined}
        />
        <View style={s.ovLegend}>
          {isEmpty ? (
            <Text style={s.ovEmpty}>{data.emptyText}</Text>
          ) : (
            data.legend.map((row, i) => (
              <View key={i} {...hoverProps(i)} style={[s.legendItem, hover === i && s.legendItemActive]}>
                <View style={s.legendTop}>
                  <View style={[s.legendDot, { backgroundColor: row.color }]} />
                  <Text style={s.legendLabel} numberOfLines={1}>
                    {row.label}
                  </Text>
                  {row.pctLabel ? (
                    <View style={[s.legendPct, { backgroundColor: alpha(row.color, 0.14) }]}>
                      <Text style={[s.legendPctText, { color: row.color }]} numberOfLines={1}>
                        {row.pctLabel}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={s.legendValue} numberOfLines={1}>
                    {row.countLabel !== undefined ? row.countLabel : row.value}
                  </Text>
                </View>
                {/* Teklif durumlarında adedin altında o durumun toplam tutarı */}
                {row.amountLabel ? (
                  <Text style={s.legendAmount} numberOfLines={1}>
                    {row.amountLabel}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Yaklaşan işler -- ışınla dolan zaman çizelgesi
// ============================================================================

type UpcomingRow = { key: string; title: string; sub: string; days: number; onPress: () => void };

function UpcomingTimeline({ items, emptyText, todayText }: { items: UpcomingRow[]; emptyText: string; todayText: string }) {
  const s = styles();
  if (items.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.emptyLine}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={[s.card, s.cardPad]}>
      <TracingBeam>
        {items.map((it) => {
          const u = urgency(it.days);
          const label = it.days < 0 ? `${Math.abs(it.days)} gün önce doldu` : it.days === 0 ? todayText : `${it.days} gün`;
          return (
            <BeamRow key={it.key} color={u.text} ringColor={theme.colors.surface}>
              <Reveal variant="right" distance={26}>
                <TouchableOpacity style={s.upRow} onPress={it.onPress} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {it.title}
                    </Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {it.sub}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: u.bg, borderColor: u.border }]}>
                    <Text style={[s.badgeText, { color: u.text }]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              </Reveal>
            </BeamRow>
          );
        })}
      </TracingBeam>
    </View>
  );
}

// ============================================================================
// Son teklifler -- dar ekranda kaydırmalı kart şeridi, geniş ekranda liste
// ============================================================================

const CARD_W = 232;
const CARD_GAP = 12;

function RecentQuotes({
  quotes,
  carousel,
  emptyText,
  unnamed,
  lang,
  onOpen,
}: {
  quotes: QuoteT[];
  carousel: boolean;
  emptyText: string;
  unnamed: string;
  lang: Lang;
  onOpen: (q: QuoteT) => void;
}) {
  const s = styles();
  const x = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
    },
  });

  if (quotes.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.emptyLine}>{emptyText}</Text>
      </View>
    );
  }

  if (!carousel) {
    return (
      <View style={[s.card, s.cardPad]}>
        {quotes.map((q, i) => (
          <Reveal key={q.id} variant="left" distance={26}>
            <TouchableOpacity style={[s.qRow, i < quotes.length - 1 && s.qRowBorder]} onPress={() => onOpen(q)} activeOpacity={0.8}>
              <View style={[s.qAvatar, { backgroundColor: alpha(statusColor(q.durum).text, 0.14) }]}>
                <Text style={[s.qAvatarText, { color: statusColor(q.durum).text }]}>{initials(q.musFirma || unnamed)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {q.musFirma || unnamed}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {q.teklifNo} · {trDate(q.tarih)}
                </Text>
              </View>
              <Text style={s.qRowAmount} numberOfLines={1}>
                {fmt(q.genelToplam, q.paraBirimi)}
              </Text>
            </TouchableOpacity>
          </Reveal>
        ))}
      </View>
    );
  }

  return (
    <Reveal variant="left" distance={40}>
      <Animated.ScrollView
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + CARD_GAP}
        decelerationRate="fast"
        style={s.carousel}
        contentContainerStyle={s.carouselContent}
      >
        {quotes.map((q, i) => (
          <QuoteCard key={q.id} q={q} index={i} scrollX={x} unnamed={unnamed} lang={lang} onOpen={onOpen} />
        ))}
      </Animated.ScrollView>
    </Reveal>
  );
}

function QuoteCard({
  q,
  index,
  scrollX,
  unnamed,
  lang,
  onOpen,
}: {
  q: QuoteT;
  index: number;
  scrollX: SharedValue<number>;
  unnamed: string;
  lang: Lang;
  onOpen: (q: QuoteT) => void;
}) {
  const s = styles();
  const step = CARD_W + CARD_GAP;
  // Şeritte öne gelen kart tam boyunda ve net; yanındakiler biraz küçük ve soluk.
  const aStyle = useAnimatedStyle(() => {
    const d = scrollX.value - index * step;
    return {
      opacity: interpolate(d, [-step, 0, step], [0.7, 1, 0.7], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(d, [-step, 0, step], [0.93, 1, 0.93], Extrapolation.CLAMP) },
        { translateY: interpolate(d, [-step, 0, step], [8, 0, 8], Extrapolation.CLAMP) },
      ],
    };
  });
  const c = statusColor(q.durum);

  return (
    <Animated.View style={[{ width: CARD_W }, aStyle]}>
      <AnimatedPressable style={s.qCard} onPress={() => onOpen(q)} scaleTo={0.97}>
        <View style={[s.qStripe, { backgroundColor: c.text }]} />
        <View style={s.qCardTop}>
          <View style={[s.qAvatar, { backgroundColor: alpha(c.text, 0.14) }]}>
            <Text style={[s.qAvatarText, { color: c.text }]}>{initials(q.musFirma || unnamed)}</Text>
          </View>
          <View style={[s.qStatus, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Text style={[s.qStatusText, { color: c.text }]} numberOfLines={1}>
              {statusLabel(lang, q.durum)}
            </Text>
          </View>
        </View>
        <Text style={s.qFirm} numberOfLines={1}>
          {q.musFirma || unnamed}
        </Text>
        <Text style={s.qMeta} numberOfLines={1}>
          {q.teklifNo} · {trDate(q.tarih)}
        </Text>
        <Text style={s.qAmount} numberOfLines={1}>
          {fmt(q.genelToplam, q.paraBirimi)}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

// Halkanın ortasındaki dar alana sığsın diye kısaltılmış tutar: "₺1,6 Mn".
// Birim ekleri dile göre gelir (TR: B/Mn/Mr, EN: K/M/B, IT: K/Mln/Mld).
function fmtCompactTRY(n: number, t: (k: string) => string): string {
  const abs = Math.abs(n);
  const unit = abs >= 1e9 ? t('panel.unitB') : abs >= 1e6 ? t('panel.unitM') : abs >= 1e4 ? t('panel.unitK') : '';
  const div = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e4 ? 1e3 : 1;
  const v = n / div;
  const digits = unit && Math.abs(v) < 100 ? 1 : 0;
  const num = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return `₺${num}${unit ? ' ' + unit : ''}`;
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ============================================================================
// Canlı piyasa şeridi
// ============================================================================

// Bir önceki değere göre yukarı/aşağı hareket algılayıp kısa bir yeşil/kırmızı
// flaş + ok ikonu tetikleyen küçük bir hook — her poll'da (30sn) tetiklenir.
function useFlashDirection(value?: number | null) {
  const anim = useRef(new RNAnimated.Value(0)).current;
  const prevRef = useRef<number | null | undefined>(undefined);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) return;
    if (prevRef.current !== undefined && prevRef.current !== null && value !== prevRef.current) {
      const d: 'up' | 'down' = value > prevRef.current ? 'up' : 'down';
      setDir(d);
      anim.stopAnimation();
      anim.setValue(1);
      RNAnimated.timing(anim, { toValue: 0, duration: 1600, useNativeDriver: false }).start();
    }
    prevRef.current = value;
  }, [value]);

  return { anim, dir };
}

function LiveDot({ color }: { color: string }) {
  const s = styles();
  const pulse = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <RNAnimated.View style={[s.liveDot, { backgroundColor: color, opacity: pulse }]} />;
}

function RatePill({
  label,
  value,
  icon,
  accent,
  isIndex,
  format,
  subValue,
}: {
  label: string;
  value?: number | null;
  icon?: IconName;
  accent?: string;
  isIndex?: boolean;
  format?: 'try' | 'usd' | 'index';
  subValue?: string | null;
}) {
  const s = styles();
  const { anim, dir } = useFlashDirection(value);
  const flashBg = dir === 'down' ? theme.colors.redSoft : theme.colors.greenSoft;
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [theme.colors.surface, flashBg] });
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.line, dir === 'down' ? theme.colors.red : theme.colors.green],
  });
  const dirColor = dir === 'down' ? theme.colors.red : theme.colors.green;
  const resolvedFormat = format || (isIndex ? 'index' : 'try');
  const primaryText = resolvedFormat === 'index' ? fmtIndex(value) : resolvedFormat === 'usd' ? fmtUSD(value) : fmtTRY(value);

  return (
    <RNAnimated.View style={[s.ratePill, { backgroundColor: bgColor, borderColor }]}>
      <View style={[s.ratePillIcon, { backgroundColor: alpha(accent || theme.colors.primary, 0.14) }]}>
        <Ionicons name={icon || 'trending-up'} size={13} color={accent || theme.colors.primary} />
      </View>
      <View style={s.ratePillTextCol}>
        <Text style={s.ratePillLabel} numberOfLines={1}>{label}</Text>
        <View style={s.ratePillValueRow}>
          <Text style={s.ratePillValue}>{primaryText}</Text>
          {dir && <Ionicons name={dir === 'up' ? 'caret-up' : 'caret-down'} size={11} color={dirColor} />}
        </View>
        {/* Alt satır her zaman yer kaplar -- USD/EUR/BIST baloncukları da
            BTC/ETH ile aynı boyda kalsın (kullanıcı isteği). */}
        <Text style={s.ratePillSub} numberOfLines={1}>
          {subValue ? `≈ ${subValue}` : ' '}
        </Text>
      </View>
    </RNAnimated.View>
  );
}

// ============================================================================
// Ölçüler ve stiller
// ============================================================================

const GAP = 10;
const HERO_BASE = '#0A0F1F';
const GOLD = '#FBBF24';

function cell(total: number, cols: number, gap: number): number {
  return Math.max(60, Math.floor((total - gap * (cols - 1)) / cols));
}

function shadow(y: number, blur: number, color: string, opacity: number, elevation: number) {
  return Platform.select({
    web: { boxShadow: `0 ${y}px ${blur}px ${alpha(color, opacity)}` } as any,
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y } },
    default: { elevation },
  });
}

const styles = themedSheet(() => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.surfaceSoft },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: c.textMuted },
    scroll: { paddingHorizontal: 16, paddingTop: 14 },
    page: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    twoCol: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
    col: { flex: 1, minWidth: 0 },

    // HERO
    heroShadow: { marginBottom: 16, borderRadius: 26, ...shadow(16, 38, '#312E81', 0.3, 8) },
    heroInner: { padding: 18 },
    heroInnerWide: { flexDirection: 'row', alignItems: 'center', gap: 28, padding: 24 },
    heroMain: { flex: 1 },
    heroGreeting: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
    heroDate: { color: 'rgba(148,163,184,0.95)', fontSize: 11.5, fontWeight: '700', marginTop: 3 },
    heroKpi: { marginTop: 18, alignSelf: 'flex-start' },
    heroLabel: { color: '#A5B4FC', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    heroValue: { color: '#FFFFFF', fontSize: 33, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
    heroValueWide: { fontSize: 42 },
    heroSecondary: { color: 'rgba(148,163,184,0.95)', fontSize: 11.5, fontWeight: '700', marginTop: 5 },
    heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    chipLabel: { color: '#C7D2FE', fontSize: 11, fontWeight: '700' },
    chipValue: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
    chipWarn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: 'rgba(251,191,36,0.14)',
      borderColor: 'rgba(251,191,36,0.35)',
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    chipWarnLabel: { color: '#FDE68A', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
    chipWarnValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    heroChart: { marginTop: 20 },
    heroChartWide: { marginTop: 0, width: 300 },
    heroChartTitle: { color: 'rgba(148,163,184,0.9)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    barCol: { flex: 1, alignItems: 'center' },
    barTrack: { width: '100%', justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
    barCurrent: { backgroundColor: 'transparent' },
    barLabel: { color: 'rgba(148,163,184,0.85)', fontSize: 9.5, fontWeight: '800', marginTop: 6 },
    barLabelCurrent: { color: '#E9D5FF' },

    // CANLI PİYASA
    marketBlock: { marginBottom: 14 },
    marketHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    marketHeadText: { fontSize: 10.5, fontWeight: '900', color: c.textMuted, letterSpacing: 0.8 },
    marketStrip: { marginHorizontal: -16, paddingHorizontal: 16, paddingVertical: 4 },
    liveDot: { width: 7, height: 7, borderRadius: 3.5 },
    ratePill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      // Tüm baloncuklar aynı ölçüde: en dar (USD) ile en geniş (BTC) arasında
      // fark olmasın diye sabit genişlik + yükseklik.
      width: 172,
      height: 66,
      ...shadow(4, 12, '#0F172A', 0.07, 2),
    },
    ratePillIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    ratePillLabel: { fontSize: 10, fontWeight: '800', color: c.textMuted, letterSpacing: 0.3 },
    ratePillValueRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    ratePillTextCol: { flex: 1, minWidth: 0 },
    ratePillValue: { fontSize: 14, fontWeight: '900', color: c.text },
    ratePillSub: { fontSize: 9, color: c.textMuted, marginTop: 1 },

    // BANNER
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    bannerIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    bannerText: { flex: 1, fontSize: 12, lineHeight: 16 },
    bannerStrong: { fontWeight: '900' },

    // KPI
    kpi: { borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, ...shadow(6, 16, '#0F172A', 0.08, 3) },
    kpiClip: { borderRadius: 17, overflow: 'hidden', padding: 13 },
    kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kpiIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    kpiArrow: { transform: [{ rotate: '-45deg' }], opacity: 0.5 },
    kpiValue: { fontSize: 22, fontWeight: '900', color: c.navy, marginTop: 12 },
    kpiLabel: { fontSize: 11, color: c.textMuted, fontWeight: '800', marginTop: 2 },

    // HIZLI İŞLEM
    quick: { borderRadius: 18 },
    quickClip: { borderRadius: 18, overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 13, minHeight: 92, justifyContent: 'space-between' },
    quickGlow: { position: 'absolute', top: -34, right: -22, width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.16)' },
    quickIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: { color: '#fff', fontSize: 12.5, fontWeight: '900', marginTop: 10 },

    // MODÜLLER
    mod: {
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      paddingTop: 13,
      paddingBottom: 13,
      paddingHorizontal: 4,
      ...shadow(4, 12, '#0F172A', 0.07, 2),
    },
    modIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    modIconFill: { borderRadius: 13 },
    modLabel: { fontSize: 10.5, fontWeight: '800', color: c.text, textAlign: 'center' },

    // BÖLÜM BAŞLIĞI
    secWrap: { marginTop: 22, marginBottom: 12 },
    secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    secLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    secIcon: {
      width: 24,
      height: 24,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secTitle: { fontSize: 12.5, fontWeight: '900', color: c.navy, letterSpacing: 0.6 },
    secAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    secActionText: { fontSize: 11.5, fontWeight: '800', color: c.primary },
    secLine: { height: 2, borderRadius: 1, marginTop: 9, overflow: 'hidden', transformOrigin: 'left' },

    // GENEL BAKIŞ
    overviewShell: {
      backgroundColor: c.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.line,
      padding: 14,
      ...shadow(14, 34, '#0F172A', 0.12, 6),
    },
    overviewBody: { gap: 16 },
    overviewBodyWide: { flexDirection: 'row', gap: 20 },
    overviewDividerH: { height: 1, backgroundColor: c.line },
    overviewDividerV: { width: 1, backgroundColor: c.line },
    ovPanel: { flex: 1, minWidth: 0 },
    ovTitle: { fontSize: 10.5, fontWeight: '900', color: c.textMuted, letterSpacing: 0.6, marginBottom: 12 },
    ovBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    ovLegend: { flex: 1, minWidth: 110, gap: 4 },
    ovEmpty: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    legendItem: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 4 },
    legendItemActive: { backgroundColor: c.surfaceSoft },
    legendTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendLabel: { flex: 1, fontSize: 12, color: c.textSoft },
    legendValue: { fontSize: 12, fontWeight: '800', color: c.text },
    legendAmount: { fontSize: 10.5, fontWeight: '700', color: c.textMuted, marginLeft: 15, marginTop: 1 },
    legendPct: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8 },
    legendPctText: { fontSize: 10.5, fontWeight: '800' },

    // LİSTE KARTLARI
    card: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.line, ...shadow(4, 12, '#0F172A', 0.07, 2) },
    cardPad: { padding: 10 },
    emptyLine: { fontSize: 12, color: c.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 18 },
    upRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surfaceSoft,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    rowTitle: { fontSize: 13, fontWeight: '800', color: c.navy },
    rowSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
    badgeText: { fontSize: 10.5, fontWeight: '800' },

    // SON TEKLİFLER
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 6 },
    qRowBorder: { borderBottomWidth: 1, borderBottomColor: c.line },
    qRowAmount: { fontSize: 13, fontWeight: '900', color: c.primary },
    carousel: { marginHorizontal: -16 },
    carouselContent: { paddingHorizontal: 16, gap: CARD_GAP, paddingVertical: 4 },
    qCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.line,
      padding: 13,
      paddingTop: 15,
      overflow: 'hidden',
      ...shadow(6, 16, '#0F172A', 0.08, 3),
    },
    qStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    qCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    qAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    qAvatarText: { fontSize: 12.5, fontWeight: '900' },
    qStatus: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, maxWidth: 110 },
    qStatusText: { fontSize: 10, fontWeight: '800' },
    qFirm: { fontSize: 13.5, fontWeight: '900', color: c.navy },
    qMeta: { fontSize: 10.5, color: c.textMuted, marginTop: 3, fontWeight: '600' },
    qAmount: { fontSize: 17, fontWeight: '900', color: c.primary, marginTop: 10 },
  });
});

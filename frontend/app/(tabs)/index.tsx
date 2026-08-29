import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, QuoteT, RatesT, ServiceT } from '@/src/lib/api';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, quotes, customers, services, campaigns, kasa } = useApp();
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
          sub: 'Teklif geçerlilik süresi',
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

  const quoteStatusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    QUOTE_STATUSES.forEach((st) => { map[st] = 0; });
    quotes.forEach((q) => { if (map[q.durum] !== undefined) map[q.durum] += 1; });
    return map;
  }, [quotes]);
  const quoteStatusTotal = quotes.length;

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

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Panel" />
        <View style={s.empty}>
          <Text style={s.emptyText}>Önce firma seçiniz</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Panel" />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={s.dateLabel}>{todayLabel()}</Text>

        {rates && (rates.usd_try || rates.btc_try) && (
          <View style={s.ratesBlock}>
            <View style={s.ratesHeader}>
              <LiveDot />
              <Text style={s.ratesHeaderText}>CANLI PİYASA</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ratesRow}>
              <RatePill label="USD" value={rates.usd_try} icon="cash-outline" accent={theme.colors.primary} />
              <RatePill label="EUR" value={rates.eur_try} icon="cash-outline" accent={theme.colors.primary} />
              {rates.altin_gram_try != null && (
                <RatePill
                  label="Gram Altın"
                  value={rates.altin_gram_try}
                  subValue={rates.altin_ons_usd != null ? fmtUSD(rates.altin_ons_usd) + ' (ons)' : null}
                  icon="ellipse"
                  accent={theme.colors.gold}
                />
              )}
              {rates.gumus_gram_try != null && (
                <RatePill
                  label="Gram Gümüş"
                  value={rates.gumus_gram_try}
                  subValue={rates.gumus_ons_usd != null ? fmtUSD(rates.gumus_ons_usd) + ' (ons)' : null}
                  icon="ellipse-outline"
                  accent={theme.colors.textMuted}
                />
              )}
              <RatePill label="BTC" value={rates.btc_usd} format="usd" subValue={rates.btc_try != null ? fmtTRY(rates.btc_try) : null} icon="logo-bitcoin" accent={theme.colors.gold} />
              <RatePill label="ETH" value={rates.eth_usd} format="usd" subValue={rates.eth_try != null ? fmtTRY(rates.eth_try) : null} icon="diamond-outline" accent={theme.colors.gold} />
              {rates.bist100 != null && <RatePill label="BIST 100" value={rates.bist100} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
              {rates.bist50 != null && <RatePill label="BIST 50" value={rates.bist50} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
              {rates.bist30 != null && <RatePill label="BIST 30" value={rates.bist30} icon="bar-chart" accent={theme.colors.modules.gecmis} isIndex />}
            </ScrollView>
          </View>
        )}

        {subStatus && !subStatus.subscription_active && (
          <TouchableOpacity style={s.trialBanner} onPress={() => router.push('/subscription' as any)} activeOpacity={0.85}>
            <Ionicons name="gift-outline" size={18} color={theme.colors.primaryDark} />
            <Text style={s.trialText}>
              <Text style={{ fontWeight: '900' }}>{Math.max(subStatus.remaining_free ?? 0, 0)} ücretsiz teklif hakkınız</Text> kaldı. Devamı için abone olun.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.primaryDark} />
          </TouchableOpacity>
        )}

        {subStatus?.subscription_active && subStatus.renewal_due_soon && (
          <TouchableOpacity style={s.alertBanner} onPress={() => router.push('/subscription' as any)} activeOpacity={0.85}>
            <Ionicons name="time-outline" size={18} color={theme.colors.goldDark} />
            <Text style={s.alertText}>
              <Text style={{ fontWeight: '900' }}>
                Aboneliğiniz {Math.max(subStatus.days_left ?? 0, 0)} gün sonra sona eriyor.
              </Text> Kesintisiz devam etmek için yenileyin.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.goldDark} />
          </TouchableOpacity>
        )}

        {overdueCount > 0 && (
          <TouchableOpacity style={s.alertBanner} onPress={() => router.push('/reminders' as any)} activeOpacity={0.85}>
            <Ionicons name="alert-circle" size={18} color={theme.colors.goldDark} />
            <Text style={s.alertText}>
              <Text style={{ fontWeight: '900' }}>{overdueCount} hatırlatma</Text> süresi doldu / bugün doluyor. Kontrol et
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.goldDark} />
          </TouchableOpacity>
        )}

        {/* Öne çıkan iki metrik — ikisi de ilgili Geçmiş görünümüne gider */}
        <View style={s.heroRow}>
          <TouchableOpacity
            style={s.heroCard}
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/history')}
            testID="hero-hacim-card"
          >
            <Text style={s.heroLabel}>BU AY HACİM{hacimTRY == null ? ' (USD)' : ''}</Text>
            <Text style={s.heroValue} numberOfLines={1}>
              {hacimTRY != null ? fmt(hacimTRY, 'TRY') : fmt(hacimBuAy, 'USD')}
            </Text>
            {hacimTRY != null && (hacimUSDEquiv != null || hacimEURequiv != null) ? (
              <Text style={s.heroSub} numberOfLines={1}>
                ≈ {hacimUSDEquiv != null ? fmt(hacimUSDEquiv, 'USD') : ''}{hacimUSDEquiv != null && hacimEURequiv != null ? ' · ' : ''}{hacimEURequiv != null ? fmt(hacimEURequiv, 'EUR') : ''}
              </Text>
            ) : null}
            <Text style={s.heroSub}>{quotesThisMonth.length} teklif</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.heroCard, s.heroCardWarn]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/(tabs)/history', params: { filter: 'bekleyen' } } as any)}
            testID="hero-bekleyen-card"
          >
            <Text style={[s.heroLabel, { color: theme.colors.gold }]}>YANIT BEKLEYEN</Text>
            <Text style={[s.heroValue, { color: '#fff' }]}>{yanitBekleyen}</Text>
            <Text style={[s.heroSub, { color: theme.colors.textOnDark }]}>teklif</Text>
          </TouchableOpacity>
        </View>

        {/* İkincil istatistikler */}
        <View style={s.statGrid}>
          <StatCard icon="people" label="Müşteri" value={String(customers.length)} color={theme.colors.modules.musteri} onPress={() => router.push('/(tabs)/customers')} />
          <StatCard icon="construct" label="Aktif Servis" value={String(aktifServis)} color={theme.colors.modules.servis} onPress={() => router.push('/(tabs)/services')} />
          <StatCard icon="shield-checkmark" label="Garanti Aktif" value={String(garantiAktif)} color={theme.colors.modules.gecmis} onPress={() => router.push('/(tabs)/services')} />
          <StatCard icon="megaphone" label="Kampanya" value={String(campaigns.length)} color={theme.colors.modules.kampanya} onPress={() => router.push('/(tabs)/campaigns')} />
        </View>

        {/* Genel Bakış — nakit durumu + teklif durumları */}
        <SectionHeader icon="pie-chart-outline" title="Genel Bakış" />
        <View style={s.overviewRow}>
          {user?.is_staff ? (
            <View style={[s.card, s.overviewCard]}>
              <Text style={s.overviewTitle}>TEKLİFLERİM (BU AY)</Text>
              {myQuoteStatusTotal > 0 ? (
                <>
                  <View style={s.stackBar}>
                    {QUOTE_STATUSES.map((st) => {
                      const cnt = myQuoteStatusCounts[st] || 0;
                      if (!cnt) return null;
                      const pct = (cnt / myQuoteStatusTotal) * 100;
                      return <View key={st} style={[s.stackSeg, { width: `${pct}%`, backgroundColor: QUOTE_STATUS_COLORS[st] }]} />;
                    })}
                  </View>
                  <View style={s.legendRow}>
                    {QUOTE_STATUSES.map((st) => (
                      <LegendDot key={st} color={QUOTE_STATUS_COLORS[st]} label={st} value={String(myQuoteStatusCounts[st] || 0)} />
                    ))}
                  </View>
                </>
              ) : (
                <Text style={s.emptyLineText}>Bu ay henüz teklif oluşturmadın.</Text>
              )}
            </View>
          ) : (
            <View style={[s.card, s.overviewCard]}>
              <Text style={s.overviewTitle}>NAKİT DURUMU (BU AY)</Text>
              {kasaHacim > 0 ? (
                <>
                  <View style={s.stackBar}>
                    <View style={[s.stackSeg, { width: `${gelirPct}%`, backgroundColor: theme.colors.green }]} />
                    <View style={[s.stackSeg, { width: `${100 - gelirPct}%`, backgroundColor: theme.colors.red }]} />
                  </View>
                  <View style={s.legendRow}>
                    <LegendDot color={theme.colors.green} label="Gelir" value={fmtTRY(gelirBuAy2)} />
                    <LegendDot color={theme.colors.red} label="Gider" value={fmtTRY(giderBuAy2)} />
                  </View>
                </>
              ) : (
                <Text style={s.emptyLineText}>Bu ay kasa hareketi yok.</Text>
              )}
            </View>
          )}

          <View style={[s.card, s.overviewCard]}>
            <Text style={s.overviewTitle}>TEKLİF DURUMLARI</Text>
            {quoteStatusTotal > 0 ? (
              <>
                <View style={s.stackBar}>
                  {QUOTE_STATUSES.map((st) => {
                    const cnt = quoteStatusCounts[st] || 0;
                    if (!cnt) return null;
                    const pct = (cnt / quoteStatusTotal) * 100;
                    return <View key={st} style={[s.stackSeg, { width: `${pct}%`, backgroundColor: QUOTE_STATUS_COLORS[st] }]} />;
                  })}
                </View>
                <View style={s.legendRow}>
                  {QUOTE_STATUSES.map((st) => (
                    <LegendDot key={st} color={QUOTE_STATUS_COLORS[st]} label={st} value={String(quoteStatusCounts[st] || 0)} />
                  ))}
                </View>
              </>
            ) : (
              <Text style={s.emptyLineText}>Henüz teklif oluşturulmadı.</Text>
            )}
          </View>
        </View>

        {/* Hızlı işlemler */}
        <SectionHeader icon="flash-outline" title="Hızlı İşlemler" />
        <View style={s.quickGrid}>
          <QuickAction icon="add-circle" label="Yeni Teklif" color={theme.colors.modules.teklif} onPress={() => router.push('/(tabs)/teklif')} />
          <QuickAction icon="person-add" label="Yeni Müşteri" color={theme.colors.modules.musteri} onPress={() => router.push('/customer-add' as any)} />
          <QuickAction icon="build" label="Yeni Servis" color={theme.colors.modules.servis} onPress={() => router.push('/service-add' as any)} />
          <QuickAction icon="megaphone" label="Yeni Kampanya" color={theme.colors.modules.kampanya} onPress={() => router.push('/campaign-add' as any)} />
        </View>

        {/* Yaklaşan işler */}
        <SectionHeaderWithAction icon="time-outline" title="Yaklaşan İşler" actionLabel="Tümünü Gör" onAction={() => router.push('/reminders' as any)} />
        <View style={s.card}>
          {upcoming.length === 0 ? (
            <Text style={s.emptyLineText}>Yaklaşan garanti, bakım ya da teklif süresi yok.</Text>
          ) : (
            upcoming.map((it, idx) => {
              const u = urgency(it.days);
              const label = it.days < 0 ? `${Math.abs(it.days)} gün önce doldu` : it.days === 0 ? 'Bugün' : `${it.days} gün`;
              return (
                <TouchableOpacity
                  key={it.key}
                  style={[s.rowItem, idx < upcoming.length - 1 && s.rowItemBorder]}
                  onPress={it.onPress}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{it.title}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{it.sub}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: u.bg, borderColor: u.border }]}>
                    <Text style={[s.badgeText, { color: u.text }]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Son teklifler */}
        <SectionHeaderWithAction icon="document-text-outline" title="Son Teklifler" actionLabel="Tümünü Gör" onAction={() => router.push('/(tabs)/history')} />
        <View style={s.card}>
          {sonTeklifler.length === 0 ? (
            <Text style={s.emptyLineText}>Henüz teklif oluşturulmadı.</Text>
          ) : (
            sonTeklifler.map((q, idx) => (
              <TouchableOpacity
                key={q.id}
                style={[s.rowItem, idx < sonTeklifler.length - 1 && s.rowItemBorder]}
                onPress={() => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: q.id } } as any)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{q.musFirma || '(İsimsiz)'}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{q.teklifNo} · {trDate(q.tarih)}</Text>
                </View>
                <Text style={s.rowAmount} numberOfLines={1}>{fmt(q.genelToplam, q.paraBirimi)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Modüller */}
        <SectionHeader icon="grid-outline" title="Modüller" />
        <View style={s.moduleGrid}>
          <ModuleTile icon="create" label="Teklif" color={theme.colors.modules.teklif} onPress={() => router.push('/(tabs)/teklif')} />
          <ModuleTile icon="library" label="Katalog" color={theme.colors.modules.katalog} onPress={() => router.push('/(tabs)/catalog')} />
          <ModuleTile icon="time" label="Geçmiş" color={theme.colors.modules.gecmis} onPress={() => router.push('/(tabs)/history')} />
          <ModuleTile icon="people" label="Müşteri" color={theme.colors.modules.musteri} onPress={() => router.push('/(tabs)/customers')} />
          <ModuleTile icon="construct" label="Servis" color={theme.colors.modules.servis} onPress={() => router.push('/(tabs)/services')} />
          <ModuleTile icon="megaphone" label="Kampanya" color={theme.colors.modules.kampanya} onPress={() => router.push('/(tabs)/campaigns')} />
          <ModuleTile icon="search" label="Firma Arama" color={theme.colors.modules.lead} onPress={() => router.push('/(tabs)/leads' as any)} />
          <ModuleTile icon="calendar" label="Takvim" color={theme.colors.modules.hatirlatma} onPress={() => router.push('/(tabs)/calendar' as any)} />
          <ModuleTile icon="notifications" label="Hatırlatmalar" color={theme.colors.modules.hatirlatma} onPress={() => router.push('/reminders' as any)} />
          <ModuleTile icon="bar-chart" label="Raporlar" color={theme.colors.modules.raporlar} onPress={() => router.push('/reports' as any)} />
          <ModuleTile icon="wallet" label="Kasa" color={theme.colors.modules.kasa} onPress={() => router.push('/(tabs)/kasa')} />
          <ModuleTile icon="cash" label="Tahsilat" color={theme.colors.modules.tahsilat} onPress={() => router.push('/(tabs)/tahsilat')} />
          <ModuleTile icon="business" label="Firma" color={theme.colors.modules.firma} onPress={() => router.push('/(tabs)/company')} />
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

// Bir önceki değere göre yukarı/aşağı hareket algılayıp kısa bir yeşil/kırmızı
// flaş + ok ikonu tetikleyen küçük bir hook — her poll'da (30sn) tetiklenir.
function useFlashDirection(value?: number | null) {
  const anim = useRef(new Animated.Value(0)).current;
  const prevRef = useRef<number | null | undefined>(undefined);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) return;
    if (prevRef.current !== undefined && prevRef.current !== null && value !== prevRef.current) {
      const d: 'up' | 'down' = value > prevRef.current ? 'up' : 'down';
      setDir(d);
      anim.stopAnimation();
      anim.setValue(1);
      Animated.timing(anim, { toValue: 0, duration: 1600, useNativeDriver: false }).start();
    }
    prevRef.current = value;
  }, [value]);

  return { anim, dir };
}

function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[s.liveDot, { opacity: pulse }]} />;
}

function RatePill({ label, value, icon, accent, isIndex, format, subValue }: { label: string; value?: number | null; icon?: any; accent?: string; isIndex?: boolean; format?: 'try' | 'usd' | 'index'; subValue?: string | null }) {
  const { anim, dir } = useFlashDirection(value);
  const flashBg = dir === 'down' ? '#FEE2E2' : '#DCFCE7';
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: ['#fff', flashBg] });
  const borderColor = anim.interpolate({ inputRange: [0, 1], outputRange: [theme.colors.line, dir === 'down' ? theme.colors.red : theme.colors.green] });
  const dirColor = dir === 'down' ? theme.colors.red : theme.colors.green;
  const resolvedFormat = format || (isIndex ? 'index' : 'try');
  const primaryText = resolvedFormat === 'index' ? fmtIndex(value) : resolvedFormat === 'usd' ? fmtUSD(value) : fmtTRY(value);

  return (
    <Animated.View style={[s.ratePill, { backgroundColor: bgColor, borderColor }]}>
      <View style={[s.ratePillIconWrap, { backgroundColor: (accent || theme.colors.primary) + '1A' }]}>
        <Ionicons name={icon || 'trending-up'} size={13} color={accent || theme.colors.primary} />
      </View>
      <View>
        <Text style={s.ratePillLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={s.ratePillValue}>{primaryText}</Text>
          {dir && <Ionicons name={dir === 'up' ? 'caret-up' : 'caret-down'} size={11} color={dirColor} />}
        </View>
        {subValue ? <Text style={s.ratePillSubValue} numberOfLines={1}>≈ {subValue}</Text> : null}
      </View>
    </Animated.View>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={s.legendLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.legendValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: any; title: string }) {
  return (
    <View style={s.sectionHdr}>
      <Ionicons name={icon} size={14} color={theme.colors.navy} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function SectionHeaderWithAction({ icon, title, actionLabel, onAction }: { icon: any; title: string; actionLabel: string; onAction: () => void }) {
  return (
    <View style={s.sectionHdrRow}>
      <View style={s.sectionHdr}>
        <Ionicons name={icon} size={14} color={theme.colors.navy} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={s.sectionAction}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ icon, label, value, color, onPress }: { icon: any; label: string; value: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.statCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.statIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={16} color="#fff" />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.quickCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.quickIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <Text style={s.quickLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ModuleTile({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.moduleTile} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.moduleAccentBar, { backgroundColor: color }]} />
      <View style={[s.moduleIconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={19} color="#fff" />
      </View>
      <Text style={s.moduleLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  dateLabel: { fontSize: 12.5, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 12, marginTop: 2 },

  ratesBlock: { marginBottom: 14 },
  ratesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ratesHeaderText: { fontSize: 10.5, fontWeight: '900', color: theme.colors.textMuted, letterSpacing: 0.6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.colors.green },
  ratesRow: { flexDirection: 'row', gap: 10 },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    ...theme.shadow.sm,
  },
  ratePillIconWrap: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ratePillLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.3 },
  ratePillValue: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  ratePillSubValue: { fontSize: 9, color: theme.colors.textMuted, marginTop: 1 },

  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  trialText: { flex: 1, fontSize: 12, color: theme.colors.primaryDark, lineHeight: 16 },

  overviewRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  overviewCard: { flex: 1, padding: 14 },
  overviewTitle: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.4, marginBottom: 12 },
  stackBar: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.colors.surfaceSoft, marginBottom: 12 },
  stackSeg: { height: '100%' },
  legendRow: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12, color: theme.colors.textSoft },
  legendValue: { fontSize: 12, fontWeight: '800', color: theme.colors.text },


  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.goldSoft,
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  alertText: { flex: 1, fontSize: 12, color: theme.colors.goldDark, lineHeight: 16 },

  heroRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  heroCard: {
    flex: 1,
    backgroundColor: theme.colors.navyDark,
    borderRadius: 14,
    padding: 14,
  },
  heroCardWarn: { borderLeftWidth: 3, borderLeftColor: theme.colors.gold, borderRadius: 0, borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  heroLabel: { fontSize: 9.5, fontWeight: '900', color: '#A5B4FC', letterSpacing: 0.4, marginBottom: 6 },
  heroValue: { fontSize: 20, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 11, fontWeight: '700', color: theme.colors.textOnDark, marginTop: 4 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  statCard: {
    width: '47.5%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  statIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: theme.colors.navy },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '700', marginTop: 2 },

  sectionHdr: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHdrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 20, marginBottom: 10 },
  sectionAction: { fontSize: 11.5, fontWeight: '800', color: theme.colors.primary },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  quickIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 6, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  emptyLineText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 14 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8 },
  rowItemBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  rowTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  rowSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },

  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleTile: {
    width: '31%',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingTop: 11,
    paddingBottom: 14,
    overflow: 'hidden',
    ...theme.shadow.sm,
  },
  moduleAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  moduleIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  moduleLabel: { fontSize: 10.5, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
});

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useLanguage, statusLabel, upper } from '@/src/lib/i18n';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  alpha,
  CountUp,
  Donut,
  hashColor,
  readableOn,
  MotionScrollView,
  Reveal,
  ScreenHero,
  SoftIcon,
  themedStyles,
  TiltOnScroll,
  useRevealVisible,
} from '@/src/components/motion';

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const SERVICE_STATUSES = ['Açık', 'Devam ediyor', 'Tamamlandı', 'İptal'];

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}

function parseTarih(tarih: string): Date | null {
  const m = (tarih || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekKey(d: Date) {
  return startOfWeek(d).toISOString().slice(0, 10);
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

export default function ReportsScreen() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { quotes, services, customers } = useApp();
  const [period, setPeriod] = useState<'ay' | 'hafta'>('ay');

  const monthlyBuckets = useMemo(() => {
    const buckets: { key: string; label: string; count: number; volumeUSD: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: monthKey(d), label: TR_MONTHS[d.getMonth()], count: 0, volumeUSD: 0 });
    }
    quotes.forEach((q) => {
      const d = parseTarih(q.tarih);
      if (!d) return;
      const b = buckets.find((x) => x.key === monthKey(d));
      if (b) {
        b.count += 1;
        if ((q.paraBirimi || 'USD') === 'USD') b.volumeUSD += q.genelToplam || 0;
      }
    });
    return buckets;
  }, [quotes]);

  const weeklyBuckets = useMemo(() => {
    const buckets: { key: string; label: string; count: number; volumeUSD: number }[] = [];
    const curMonday = startOfWeek(new Date());
    for (let i = 7; i >= 0; i--) {
      const start = new Date(curMonday);
      start.setDate(curMonday.getDate() - i * 7);
      buckets.push({
        key: start.toISOString().slice(0, 10),
        label: `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}`,
        count: 0,
        volumeUSD: 0,
      });
    }
    quotes.forEach((q) => {
      const d = parseTarih(q.tarih);
      if (!d) return;
      const b = buckets.find((x) => x.key === weekKey(d));
      if (b) {
        b.count += 1;
        if ((q.paraBirimi || 'USD') === 'USD') b.volumeUSD += q.genelToplam || 0;
      }
    });
    return buckets;
  }, [quotes]);

  const buckets = period === 'ay' ? monthlyBuckets : weeklyBuckets;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const periodVolumeUSD = buckets.reduce((a, b) => a + b.volumeUSD, 0);

  const topCustomers = useMemo(() => {
    const map = new Map<string, { firma: string; count: number; volumeUSD: number }>();
    quotes.forEach((q) => {
      const key = q.musFirma || 'Bilinmeyen';
      const cur = map.get(key) || { firma: key, count: 0, volumeUSD: 0 };
      cur.count += 1;
      if ((q.paraBirimi || 'USD') === 'USD') cur.volumeUSD += q.genelToplam || 0;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [quotes]);

  const conversion = useMemo(() => {
    const total = quotes.length;
    const onay = quotes.filter((q) => q.durum === 'Onaylandı').length;
    const red = quotes.filter((q) => q.durum === 'Reddedildi').length;
    const bekleyen = quotes.filter((q) => q.durum === 'Beklemede' || q.durum === 'Görüldü').length;
    return { total, onay, red, bekleyen };
  }, [quotes]);

  // Dönüşüm oranı = onaylanan / toplam (hero rozetinde ve huni bölümünde)
  const conversionRate = conversion.total > 0 ? (conversion.onay / conversion.total) * 100 : 0;

  const serviceStats = useMemo(() => {
    const total = services.length;
    const byStatus = SERVICE_STATUSES.map((st) => ({ st, count: services.filter((s) => s.durum === st).length }));
    const garantiAktif = services.filter((s) => {
      const d = daysUntil(s.garantiBitis);
      return d !== null && d >= 0;
    }).length;
    const garantiBitmis = services.filter((s) => {
      const d = daysUntil(s.garantiBitis);
      return d !== null && d < 0;
    }).length;
    return { total, byStatus, garantiAktif, garantiBitmis };
  }, [services]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('reports.s009')}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <MotionScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <ScreenHero
          icon="bar-chart"
          title={t('reports.s009')}
          color={theme.colors.modules.raporlar}
          stats={[
            { label: t('reports.s010'), value: conversion.total },
            { label: t('reports.s001'), value: conversion.onay, tone: '#6EE7B7' },
            { label: t('reports.s016'), value: conversionRate, format: (n) => `%${Math.round(n)}`, tone: '#A5B4FC' },
            { label: t('reports.s020'), value: serviceStats.total },
          ]}
        />
        {/* Teklif hacmi grafiği */}
        <View style={s.sectionHdr}>
          <SoftIcon icon="bar-chart-outline" color={theme.colors.modules.raporlar} size={24} iconSize={13} />
          <Text style={s.sectionTitle}>{upper(t('reports.s010'))}</Text>
        </View>
        <TiltOnScroll>
        <Reveal variant="fade">
        <View style={s.card}>
          <View style={s.segmentRow}>
            <TouchableOpacity style={[s.segBtn, period === 'ay' && s.segBtnActive]} onPress={() => setPeriod('ay')} testID="report-period-ay">
              <Text style={[s.segText, period === 'ay' && s.segTextActive]}>{t('reports.s011')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.segBtn, period === 'hafta' && s.segBtnActive]} onPress={() => setPeriod('hafta')} testID="report-period-hafta">
              <Text style={[s.segText, period === 'hafta' && s.segTextActive]}>{t('reports.s012')}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <CountUp value={periodVolumeUSD} format={(n) => fmt(n, 'USD')} style={s.chartVolume} />
            <Text style={s.chartVolumeSub}>{t('reports.s013')}</Text>
          </View>
          <View style={s.chartBars}>
            {buckets.map((b, i) => (
              <ChartBar
                key={b.key}
                index={i}
                label={b.label}
                count={b.count}
                ratio={b.count / maxCount}
                best={b.count > 0 && b.count === maxCount}
              />
            ))}
          </View>
        </View>
        </Reveal>
        </TiltOnScroll>

        {/* En çok teklif verilen müşteriler */}
        <View style={s.sectionHdr}>
          <SoftIcon icon="people-outline" color={theme.colors.modules.raporlar} size={24} iconSize={13} />
          <Text style={s.sectionTitle}>{upper(t('reports.s014'))}</Text>
        </View>
        <TiltOnScroll>
        <View style={s.card}>
          {topCustomers.length === 0 ? (
            <Text style={s.emptyLineText}>{t('reports.s015')}</Text>
          ) : (
            topCustomers.map((c, idx) => (
              <Reveal key={c.firma} variant={idx % 2 === 0 ? 'left' : 'right'} distance={18}>
              <View style={[s.rankRow, idx < topCustomers.length - 1 && s.rankRowBorder]}>
                <View style={[s.rankBadge, { backgroundColor: hashColor(c.firma) }]}>
                  <Text style={[s.rankBadgeText, { color: readableOn(hashColor(c.firma)) }]}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rankFirma} numberOfLines={1}>{c.firma}</Text>
                  <Text style={s.rankSub}>{c.count} teklif{c.volumeUSD > 0 ? ` · ${fmt(c.volumeUSD, 'USD')}` : ''}</Text>
                  <GrowBar ratio={topCustomers[0].count > 0 ? c.count / topCustomers[0].count : 0} color={hashColor(c.firma)} delay={idx * 90} />
                </View>
              </View>
              </Reveal>
            ))
          )}
        </View>
        </TiltOnScroll>

        {/* Dönüşüm oranı */}
        <View style={s.sectionHdr}>
          <SoftIcon icon="swap-horizontal-outline" color={theme.colors.modules.raporlar} size={24} iconSize={13} />
          <Text style={s.sectionTitle}>{upper(t('reports.s016'))}</Text>
        </View>
        <TiltOnScroll>
        <Reveal variant="fade">
        <View style={s.card}>
          <View style={s.convTop}>
            <Donut
              data={[
                { value: conversion.onay, color: theme.colors.green },
                { value: conversion.red, color: theme.colors.red },
                { value: conversion.bekleyen, color: theme.colors.gold },
              ]}
              size={104}
              thickness={14}
              holeColor={theme.colors.surface}
              trackColor={theme.colors.line}
              centerLabel={t('reports.s016')}
              centerValue={`%${Math.round(conversionRate)}`}
              labelColor={theme.colors.textMuted}
              valueColor={theme.colors.text}
            />
            <View style={{ flex: 1, minWidth: 140 }}>
              <ConversionRow label={t('reports.s001')} count={conversion.onay} total={conversion.total} color={theme.colors.green} />
              <ConversionRow label={t('reports.s017')} count={conversion.red} total={conversion.total} color={theme.colors.red} />
              <ConversionRow label={t('reports.s018')} count={conversion.bekleyen} total={conversion.total} color={theme.colors.gold} last />
            </View>
          </View>
        </View>
        </Reveal>
        </TiltOnScroll>

        {/* Servis / garanti istatistikleri */}
        <View style={s.sectionHdr}>
          <SoftIcon icon="shield-checkmark-outline" color={theme.colors.modules.raporlar} size={24} iconSize={13} />
          <Text style={s.sectionTitle}>{upper(t('reports.s019'))}</Text>
        </View>
        <TiltOnScroll>
        <View style={s.card}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>{upper(t('reports.s020'))}</Text>
              <Text style={s.statValue}>{serviceStats.total}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
              <Text style={[s.statLabel, { color: theme.colors.greenText }]}>{upper(t('reports.s021'))}</Text>
              <Text style={[s.statValue, { color: theme.colors.greenText }]}>{serviceStats.garantiAktif}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.red }]}>
              <Text style={[s.statLabel, { color: theme.colors.redText }]}>{upper(t('reports.s022'))}</Text>
              <Text style={[s.statValue, { color: theme.colors.redText }]}>{serviceStats.garantiBitmis}</Text>
            </View>
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            {serviceStats.byStatus.map(({ st, count }) => {
              const cc = statusColor(st);
              const pct = serviceStats.total > 0 ? Math.round((count / serviceStats.total) * 100) : 0;
              return (
                <View key={st}>
                  <View style={s.convHead}>
                    <Text style={s.convLabel}>{statusLabel(lang, st)}</Text>
                    <Text style={s.convValue}>{count} {t('reports.s002')}{pct}</Text>
                  </View>
                  <View style={s.convTrack}>
                    <View style={[s.convFill, { width: `${pct}%`, backgroundColor: cc.text }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        </TiltOnScroll>
      </MotionScrollView>
    </SafeAreaView>
  );
}

function ConversionRow({ label, count, total, color, last }: { label: string; count: number; total: number; color: string; last?: boolean }) {
  const { t } = useLanguage();
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <View style={s.convHead}>
        <Text style={s.convLabel}>{label}</Text>
        <Text style={s.convValue}>{count} {t('reports.s002')}{pct}</Text>
      </View>
      <GrowBar ratio={pct / 100} color={color} />
    </View>
  );
}

// Kart ekrana girdiğinde soldan sağa dolan ince çubuk (rapor satırları).
function GrowBar({ ratio, color, delay = 0 }: { ratio: number; color: string; delay?: number }) {
  const visible = useRevealVisible();
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (!visible) return;
    p.value = reduced ? 1 : withDelay(delay + 120, withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }));
  }, [visible, reduced, delay, p]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, ratio)) * 100 * p.value}%` }));
  return (
    <View style={s.convTrack}>
      <Animated.View style={[s.convFill, { backgroundColor: color }, style]} />
    </View>
  );
}

// Dikey sütun: kart görünür olunca aşağıdan yukarı büyür, en yüksek ay
// gradyanla vurgulanır (21st.dev'deki "stagger reveal" grafik kalıbı).
function ChartBar({
  index,
  label,
  count,
  ratio,
  best,
}: {
  index: number;
  label: string;
  count: number;
  ratio: number;
  best: boolean;
}) {
  const visible = useRevealVisible();
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  const target = count > 0 ? Math.max(8, ratio * 96) : 3;

  React.useEffect(() => {
    if (!visible) return;
    grow.value = reduced ? 1 : withDelay(160 + index * 80, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [visible, reduced, index, grow]);

  const barStyle = useAnimatedStyle(() => ({ height: target * grow.value, opacity: 0.35 + 0.65 * grow.value }));

  return (
    <View style={s.barCol}>
      <Text style={[s.barValue, best && s.barValueBest]}>{count > 0 ? count : ''}</Text>
      <Animated.View style={[s.bar, barStyle, best && s.barBest]}>
        {best ? (
          <LinearGradient
            colors={['#A855F7', theme.colors.primary] as [string, string]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Animated.View>
      <Text style={[s.barLabel, best && s.barLabelBest]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.4 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  emptyLineText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  segmentRow: { flexDirection: 'row', backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, padding: 3, marginBottom: 10, alignSelf: 'flex-start' },
  segBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  segBtnActive: { backgroundColor: theme.colors.surface, ...theme.shadow.sm },
  segText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  segTextActive: { color: theme.colors.primary },
  chartVolume: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginBottom: 12 },
  chartVolumeSub: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  barValue: { fontSize: 10, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 3 },
  barValueBest: { color: theme.colors.primary, fontSize: 11.5 },
  bar: { width: '64%', minWidth: 8, backgroundColor: alpha(theme.colors.primary, 0.32), borderRadius: 6, overflow: 'hidden' },
  barBest: { backgroundColor: 'transparent' },
  barLabel: { fontSize: 9.5, color: theme.colors.textMuted, marginTop: 7, fontWeight: '700' },
  barLabelBest: { color: theme.colors.primary },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  rankBadge: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
  rankFirma: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  rankSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  convHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  convLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  convValue: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  convTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden', marginTop: 6 },
  convTop: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  convFill: { height: '100%', borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.line },
  statLabel: { fontSize: 9.5, color: theme.colors.textMuted, fontWeight: '800', letterSpacing: 0.3 },
  statValue: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
}));

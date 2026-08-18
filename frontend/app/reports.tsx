import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';

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
        <Text style={s.headerTitle}>Raporlar</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Teklif hacmi grafiği */}
        <View style={s.sectionHdr}>
          <Ionicons name="bar-chart-outline" size={14} color={theme.colors.navy} />
          <Text style={s.sectionTitle}>Teklif Hacmi</Text>
        </View>
        <View style={s.card}>
          <View style={s.segmentRow}>
            <TouchableOpacity style={[s.segBtn, period === 'ay' && s.segBtnActive]} onPress={() => setPeriod('ay')} testID="report-period-ay">
              <Text style={[s.segText, period === 'ay' && s.segTextActive]}>Aylık</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.segBtn, period === 'hafta' && s.segBtnActive]} onPress={() => setPeriod('hafta')} testID="report-period-hafta">
              <Text style={[s.segText, period === 'hafta' && s.segTextActive]}>Haftalık</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.chartVolume}>{fmt(periodVolumeUSD, 'USD')} <Text style={s.chartVolumeSub}>toplam hacim (USD)</Text></Text>
          <View style={s.chartBars}>
            {buckets.map((b) => {
              const h = b.count > 0 ? Math.max(6, (b.count / maxCount) * 96) : 2;
              return (
                <View key={b.key} style={s.barCol}>
                  <Text style={s.barValue}>{b.count > 0 ? b.count : ''}</Text>
                  <View style={[s.bar, { height: h }]} />
                  <Text style={s.barLabel} numberOfLines={1}>{b.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* En çok teklif verilen müşteriler */}
        <View style={s.sectionHdr}>
          <Ionicons name="people-outline" size={14} color={theme.colors.navy} />
          <Text style={s.sectionTitle}>En Çok Teklif Verilen Müşteriler</Text>
        </View>
        <View style={s.card}>
          {topCustomers.length === 0 ? (
            <Text style={s.emptyLineText}>Henüz teklif verisi yok.</Text>
          ) : (
            topCustomers.map((c, idx) => (
              <View key={c.firma} style={[s.rankRow, idx < topCustomers.length - 1 && s.rankRowBorder]}>
                <View style={s.rankBadge}>
                  <Text style={s.rankBadgeText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rankFirma} numberOfLines={1}>{c.firma}</Text>
                  <Text style={s.rankSub}>{c.count} teklif{c.volumeUSD > 0 ? ` · ${fmt(c.volumeUSD, 'USD')}` : ''}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Dönüşüm oranı */}
        <View style={s.sectionHdr}>
          <Ionicons name="swap-horizontal-outline" size={14} color={theme.colors.navy} />
          <Text style={s.sectionTitle}>Dönüşüm Oranı</Text>
        </View>
        <View style={s.card}>
          <ConversionRow label="Onaylandı" count={conversion.onay} total={conversion.total} color={theme.colors.green} />
          <ConversionRow label="Reddedildi" count={conversion.red} total={conversion.total} color={theme.colors.red} />
          <ConversionRow label="Beklemede" count={conversion.bekleyen} total={conversion.total} color={theme.colors.gold} last />
        </View>

        {/* Servis / garanti istatistikleri */}
        <View style={s.sectionHdr}>
          <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.navy} />
          <Text style={s.sectionTitle}>Servis & Garanti İstatistikleri</Text>
        </View>
        <View style={s.card}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>Toplam Servis</Text>
              <Text style={s.statValue}>{serviceStats.total}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
              <Text style={[s.statLabel, { color: '#166534' }]}>Garanti Aktif</Text>
              <Text style={[s.statValue, { color: '#166534' }]}>{serviceStats.garantiAktif}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: theme.colors.redSoft, borderColor: '#fca5a5' }]}>
              <Text style={[s.statLabel, { color: '#991b1b' }]}>Garanti Bitmiş</Text>
              <Text style={[s.statValue, { color: '#991b1b' }]}>{serviceStats.garantiBitmis}</Text>
            </View>
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            {serviceStats.byStatus.map(({ st, count }) => {
              const cc = statusColor(st);
              const pct = serviceStats.total > 0 ? Math.round((count / serviceStats.total) * 100) : 0;
              return (
                <View key={st}>
                  <View style={s.convHead}>
                    <Text style={s.convLabel}>{st}</Text>
                    <Text style={s.convValue}>{count} · %{pct}</Text>
                  </View>
                  <View style={s.convTrack}>
                    <View style={[s.convFill, { width: `${pct}%`, backgroundColor: cc.text }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ConversionRow({ label, count, total, color, last }: { label: string; count: number; total: number; color: string; last?: boolean }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <View style={s.convHead}>
        <Text style={s.convLabel}>{label}</Text>
        <Text style={s.convValue}>{count} · %{pct}</Text>
      </View>
      <View style={s.convTrack}>
        <View style={[s.convFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  emptyLineText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  segmentRow: { flexDirection: 'row', backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, padding: 3, marginBottom: 10, alignSelf: 'flex-start' },
  segBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  segBtnActive: { backgroundColor: '#fff', ...theme.shadow.sm },
  segText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  segTextActive: { color: theme.colors.primary },
  chartVolume: { fontSize: 16, fontWeight: '900', color: theme.colors.navy, marginBottom: 12 },
  chartVolumeSub: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  barValue: { fontSize: 10, fontWeight: '800', color: theme.colors.primary, marginBottom: 2 },
  bar: { width: '60%', minWidth: 8, backgroundColor: theme.colors.primary, borderRadius: 4 },
  barLabel: { fontSize: 9, color: theme.colors.textMuted, marginTop: 6, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: 12, fontWeight: '900', color: theme.colors.primary },
  rankFirma: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  rankSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  convHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  convLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  convValue: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  convTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden' },
  convFill: { height: '100%', borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.line },
  statLabel: { fontSize: 9.5, color: theme.colors.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontSize: 18, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
});

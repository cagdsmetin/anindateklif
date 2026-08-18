import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { QuoteT, ServiceT } from '@/src/lib/api';

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
  const { activeCompany, quotes, customers, services, campaigns } = useApp();

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
          onPress: () => router.push({ pathname: '/(tabs)/', params: { quoteId: q.id } } as any),
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

        {overdueCount > 0 && (
          <TouchableOpacity style={s.alertBanner} onPress={() => router.push('/reminders' as any)} activeOpacity={0.85}>
            <Ionicons name="alert-circle" size={18} color={theme.colors.goldDark} />
            <Text style={s.alertText}>
              <Text style={{ fontWeight: '900' }}>{overdueCount} hatırlatma</Text> süresi doldu / bugün doluyor. Kontrol et
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.goldDark} />
          </TouchableOpacity>
        )}

        {/* Öne çıkan iki metrik */}
        <View style={s.heroRow}>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>BU AY HACİM (USD)</Text>
            <Text style={s.heroValue} numberOfLines={1}>{fmt(hacimBuAy, 'USD')}</Text>
            <Text style={s.heroSub}>{quotesThisMonth.length} teklif</Text>
          </View>
          <View style={[s.heroCard, { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.goldBorder }]}>
            <Text style={[s.heroLabel, { color: theme.colors.goldDark }]}>YANIT BEKLEYEN</Text>
            <Text style={[s.heroValue, { color: theme.colors.goldDark }]}>{yanitBekleyen}</Text>
            <Text style={[s.heroSub, { color: theme.colors.goldDark }]}>teklif</Text>
          </View>
        </View>

        {/* İkincil istatistikler */}
        <View style={s.statGrid}>
          <StatCard icon="people-outline" label="Müşteri" value={String(customers.length)} onPress={() => router.push('/(tabs)/customers')} />
          <StatCard icon="construct-outline" label="Aktif Servis" value={String(aktifServis)} onPress={() => router.push('/(tabs)/services')} />
          <StatCard icon="shield-checkmark-outline" label="Garanti Aktif" value={String(garantiAktif)} onPress={() => router.push('/(tabs)/services')} />
          <StatCard icon="megaphone-outline" label="Kampanya" value={String(campaigns.length)} onPress={() => router.push('/(tabs)/campaigns')} />
        </View>

        {/* Hızlı işlemler */}
        <SectionHeader icon="flash-outline" title="Hızlı İşlemler" />
        <View style={s.quickGrid}>
          <QuickAction icon="add-circle" label="Yeni Teklif" onPress={() => router.push('/(tabs)/')} />
          <QuickAction icon="person-add" label="Yeni Müşteri" onPress={() => router.push('/customer-add' as any)} />
          <QuickAction icon="build" label="Yeni Servis" onPress={() => router.push('/service-add' as any)} />
          <QuickAction icon="megaphone" label="Yeni Kampanya" onPress={() => router.push('/campaign-add' as any)} />
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
                onPress={() => router.push({ pathname: '/(tabs)/', params: { quoteId: q.id } } as any)}
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
          <ModuleTile icon="create" label="Teklif" color="#2563EB" bg="#DBEAFE" onPress={() => router.push('/(tabs)/')} />
          <ModuleTile icon="library" label="Katalog" color="#7C3AED" bg="#EDE9FE" onPress={() => router.push('/(tabs)/catalog')} />
          <ModuleTile icon="time" label="Geçmiş" color="#EA580C" bg="#FFEDD5" onPress={() => router.push('/(tabs)/history')} />
          <ModuleTile icon="people" label="Müşteri" color="#059669" bg="#D1FAE5" onPress={() => router.push('/(tabs)/customers')} />
          <ModuleTile icon="construct" label="Servis" color="#DC2626" bg="#FEE2E2" onPress={() => router.push('/(tabs)/services')} />
          <ModuleTile icon="megaphone" label="Kampanya" color="#DB2777" bg="#FCE7F3" onPress={() => router.push('/(tabs)/campaigns')} />
          <ModuleTile icon="notifications" label="Hatırlatmalar" color="#D97706" bg="#FEF3C7" onPress={() => router.push('/reminders' as any)} />
          <ModuleTile icon="bar-chart" label="Raporlar" color="#0891B2" bg="#CFFAFE" onPress={() => router.push('/reports' as any)} />
          <ModuleTile icon="business" label="Firma" color="#4F46E5" bg="#E0E7FF" onPress={() => router.push('/(tabs)/company')} />
        </View>
      </ScrollView>
    </SafeAreaView>
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

function StatCard({ icon, label, value, onPress }: { icon: any; label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.statCard} onPress={onPress} activeOpacity={0.85}>
      <View style={s.statIconWrap}>
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.quickCard} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={20} color={theme.colors.primary} />
      <Text style={s.quickLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ModuleTile({ icon, label, color, bg, onPress }: { icon: any; label: string; color: string; bg: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.moduleTile} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.moduleIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={19} color={color} />
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
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: 14,
    padding: 14,
  },
  heroLabel: { fontSize: 9.5, fontWeight: '900', color: theme.colors.primaryDark, letterSpacing: 0.4, marginBottom: 6 },
  heroValue: { fontSize: 20, fontWeight: '900', color: theme.colors.primaryDark },
  heroSub: { fontSize: 11, fontWeight: '700', color: theme.colors.primaryDark, marginTop: 4, opacity: 0.75 },

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
    width: 30, height: 30, borderRadius: 9, backgroundColor: theme.colors.primarySoft,
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
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
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
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  moduleIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  moduleLabel: { fontSize: 10.5, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
});

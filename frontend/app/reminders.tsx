import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { CustomerT, QuoteT, ServiceT } from '@/src/lib/api';

// Days remaining until an ISO ("YYYY-MM-DD") date. Negative = already passed.
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
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso || '-';
}

function urgency(days: number) {
  if (days < 0) return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b', label: `${Math.abs(days)} gün önce doldu` };
  if (days === 0) return { bg: theme.colors.redSoft, border: '#fca5a5', text: '#991b1b', label: 'Bugün doluyor' };
  if (days <= 7) return { bg: theme.colors.goldSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark, label: `${days} gün kaldı` };
  return { bg: theme.colors.primarySoft, border: theme.colors.primaryBorder, text: theme.colors.primaryDark, label: `${days} gün kaldı` };
}

export default function RemindersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { services, quotes, campaigns, customers } = useApp();

  const garantiList = useMemo(() => {
    return services
      .map((s) => ({ s, days: daysUntil(s.garantiBitis) }))
      .filter((x): x is { s: ServiceT; days: number } => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [services]);

  const bakimList = useMemo(() => {
    return services
      .map((s) => ({ s, days: daysUntil(s.bakimTarihi) }))
      .filter((x): x is { s: ServiceT; days: number } => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days - b.days);
  }, [services]);

  const teklifList = useMemo(() => {
    return quotes
      .filter((q) => q.durum === 'Beklemede' || q.durum === 'Görüldü')
      .map((q) => ({ q, days: daysUntil(q.gecerlilik) }))
      .filter((x): x is { q: QuoteT; days: number } => x.days !== null && x.days <= 7)
      .sort((a, b) => a.days - b.days);
  }, [quotes]);

  const audienceCustomers = useMemo(
    () => customers.filter((c) => (c.telefon || '').trim().length > 0),
    [customers]
  );

  const kampanyaList = useMemo(() => {
    return campaigns
      .map((camp) => {
        const sends = camp.sends || {};
        const sentCount = Object.values(sends).filter((v) => v.sent).length;
        const total = audienceCustomers.length;
        const remaining = Math.max(0, total - sentCount);
        return { camp, sentCount, total, remaining };
      })
      .filter((x) => x.remaining > 0)
      .sort((a, b) => (b.camp.createdAt || '').localeCompare(a.camp.createdAt || ''));
  }, [campaigns, audienceCustomers]);

  const totalCount = garantiList.length + bakimList.length + teklifList.length + kampanyaList.length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Hatırlatmalar</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {totalCount === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={28} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Şu an bekleyen hatırlatma yok. Her şey güncel!</Text>
          </View>
        ) : null}

        {/* Garanti bitiş tarihleri */}
        <SectionHeader icon="shield-checkmark-outline" title="Garanti Bitiş Tarihleri" count={garantiList.length} />
        {garantiList.length === 0 ? (
          <EmptyLine text="Yaklaşan garanti bitişi yok." />
        ) : (
          garantiList.map(({ s: svc, days }) => {
            const u = urgency(days);
            return (
              <TouchableOpacity
                key={svc.id}
                style={s.row}
                onPress={() => router.push({ pathname: '/service-add', params: { id: svc.id } } as any)}
                testID={`reminder-garanti-${svc.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{svc.baslik}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{svc.musFirma || svc.musYetkili || '-'} · {trDate(svc.garantiBitis)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: u.bg, borderColor: u.border }]}>
                  <Text style={[s.badgeText, { color: u.text }]}>{u.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Bakım tarihleri */}
        <SectionHeader icon="build-outline" title="Bakım Tarihleri" count={bakimList.length} />
        {bakimList.length === 0 ? (
          <EmptyLine text="Yaklaşan bakım tarihi yok." />
        ) : (
          bakimList.map(({ s: svc, days }) => {
            const u = urgency(days);
            return (
              <TouchableOpacity
                key={svc.id}
                style={s.row}
                onPress={() => router.push({ pathname: '/service-add', params: { id: svc.id } } as any)}
                testID={`reminder-bakim-${svc.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{svc.baslik}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{svc.musFirma || svc.musYetkili || '-'} · {trDate(svc.bakimTarihi)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: u.bg, borderColor: u.border }]}>
                  <Text style={[s.badgeText, { color: u.text }]}>{u.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Teklif geçerlilik süresi dolanlar */}
        <SectionHeader icon="document-text-outline" title="Teklif Geçerlilik Süresi" count={teklifList.length} />
        {teklifList.length === 0 ? (
          <EmptyLine text="Süresi yaklaşan bekleyen teklif yok." />
        ) : (
          teklifList.map(({ q, days }) => {
            const u = urgency(days);
            return (
              <TouchableOpacity
                key={q.id}
                style={s.row}
                onPress={() => router.push({ pathname: '/(tabs)/', params: { quoteId: q.id } } as any)}
                testID={`reminder-teklif-${q.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{q.teklifNo} · {q.musFirma}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>Geçerlilik: {trDate(q.gecerlilik)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: u.bg, borderColor: u.border }]}>
                  <Text style={[s.badgeText, { color: u.text }]}>{u.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Kampanya gönderim durumu */}
        <SectionHeader icon="megaphone-outline" title="Kampanya Gönderim Durumu" count={kampanyaList.length} />
        {kampanyaList.length === 0 ? (
          <EmptyLine text="Tüm kampanyalar tamamlandı ya da aktif kampanya yok." />
        ) : (
          kampanyaList.map(({ camp, sentCount, total, remaining }) => (
            <TouchableOpacity
              key={camp.id}
              style={s.row}
              onPress={() => router.push({ pathname: '/campaign-detail', params: { id: camp.id } } as any)}
              testID={`reminder-kampanya-${camp.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{camp.baslik}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{sentCount}/{total} gönderildi</Text>
              </View>
              <View style={[s.badge, { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.goldBorder }]}>
                <Text style={[s.badgeText, { color: theme.colors.goldDark }]}>{remaining} kaldı</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ icon, title, count }: { icon: any; title: string; count: number }) {
  return (
    <View style={s.sectionHdr}>
      <Ionicons name={icon} size={14} color={theme.colors.navy} />
      <Text style={s.sectionTitle}>{title}</Text>
      {count > 0 ? (
        <View style={s.countPill}><Text style={s.countPillText}>{count}</Text></View>
      ) : null}
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <View style={s.emptyLineBox}>
      <Text style={s.emptyLineText}>{text}</Text>
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
  emptyBox: { backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 26, alignItems: 'center', gap: 8, marginBottom: 20 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 },
  countPill: { backgroundColor: theme.colors.primarySoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countPillText: { fontSize: 11, fontWeight: '900', color: theme.colors.primary },
  emptyLineBox: { paddingVertical: 10 },
  emptyLineText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, gap: 10, ...theme.shadow.sm },
  rowTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  rowSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
});

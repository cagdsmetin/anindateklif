import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, StaffMemberT } from '@/src/lib/api';
import { useLanguage, statusLabel } from '@/src/lib/i18n';
import { StatusPieChart } from '@/src/components/StatusPieChart';

// Yönetici, atadığı personel/yöneticilerin tek tek verdiği teklifleri (durum
// dağılımı + fiyat detayları) izleyebilsin diye eklendi. Teklifler backend'de
// firma bazında tutulduğu için (bkz. server.py list_quotes -- her teklifin
// userId'si her zaman firma sahibinin id'sidir, kim girmiş olursa olsun),
// "kim verdi" bilgisini ayırt etmenin tek yolu Quote.hazirlayanEmail alanı --
// yeni teklif oluşturulurken o an giriş yapmış kişinin gerçek e-postasıyla
// otomatik dolduruluyor (teklif.tsx). Bu yüzden burada backend'den ekstra bir
// veri çekmeye gerek yok: zaten yüklenmiş `quotes` state'i bu alana göre
// istemci tarafında filtreleniyor.
const QUOTE_STATUSES = ['Beklemede', 'Görüldü', 'Onaylandı', 'Reddedildi'] as const;
const QUOTE_STATUS_COLORS: Record<string, string> = {
  Beklemede: theme.colors.textMuted,
  Görüldü: theme.colors.gold,
  Onaylandı: theme.colors.green,
  Reddedildi: theme.colors.red,
};

function fmt(n: number, cur: string) {
  const str = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${str}`;
}

type PersonOption = { email: string; label: string; isOwner: boolean };

export default function PersonelTekliflerScreen() {
  const { t, lang } = useLanguage();
  const { activeCompany, quotes } = useApp();
  const { user } = useAuth();

  const [members, setMembers] = useState<StaffMemberT[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    api.listStaff(activeCompany.id)
      .then((res) => { if (alive) setMembers((res || []).filter((m) => m.type === 'active')); })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeCompany]);

  const people: PersonOption[] = useMemo(() => {
    const list: PersonOption[] = [];
    if (user?.email) {
      list.push({ email: user.email.toLowerCase(), label: t('personelTeklif.s010'), isOwner: true });
    }
    members.forEach((m) => {
      const email = (m.email || '').toLowerCase();
      if (!email || list.some((p) => p.email === email)) return;
      list.push({ email, label: m.name || m.email, isOwner: false });
    });
    return list;
  }, [members, user, t]);

  useEffect(() => {
    if (people.length === 0) { setSelectedEmail(null); return; }
    if (!selectedEmail || !people.some((p) => p.email === selectedEmail)) {
      setSelectedEmail(people[0].email);
    }
  }, [people, selectedEmail]);

  const personQuotes = useMemo(() => {
    if (!selectedEmail) return [];
    return quotes
      .filter((q) => (q.hazirlayanEmail || '').toLowerCase() === selectedEmail)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [quotes, selectedEmail]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    personQuotes.forEach((q) => { counts[q.durum] = (counts[q.durum] || 0) + 1; });
    return counts;
  }, [personQuotes]);

  const total = personQuotes.length;

  // Personel/İdari yardımcılar bu sayfayı doğrudan URL ile de açmaya
  // çalışabilir -- sol menüden zaten sadece firma sahibine gösteriliyor
  // (navItems.ts), ama personel.tsx'teki gibi burada da ikinci bir engel var.
  if (user?.is_staff) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('personelTeklif.s001')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('personelTeklif.s006')}</Text></View>
      </SafeAreaView>
    );
  }

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('personelTeklif.s001')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('personelTeklif.s002')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('personelTeklif.s001')} />
      {loading ? (
        <View style={s.empty}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : loadError ? (
        <View style={s.empty}><Text style={s.emptyText}>{t('personelTeklif.s007')}</Text></View>
      ) : people.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyText}>{t('personelTeklif.s003')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {people.map((p) => {
              const active = selectedEmail === p.email;
              return (
                <TouchableOpacity
                  key={p.email}
                  style={[s.personChip, active && s.personChipActive]}
                  onPress={() => setSelectedEmail(p.email)}
                  testID={`staff-quote-person-${p.email}`}
                >
                  <Ionicons name={p.isOwner ? 'star' : 'person'} size={13} color={active ? '#fff' : theme.colors.textSoft} />
                  <Text style={[s.personChipText, active && s.personChipTextActive]} numberOfLines={1}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={s.card}>
            <StatusPieChart
              data={QUOTE_STATUSES.filter((st) => (statusCounts[st] || 0) > 0).map((st) => ({
                label: statusLabel(lang, st),
                value: statusCounts[st] || 0,
                color: QUOTE_STATUS_COLORS[st],
                countLabel: String(statusCounts[st] || 0),
              }))}
              total={total}
              centerLabel={t('personelTeklif.s011')}
              formatValue={(n) => String(n)}
              formatCenter={(n) => String(n)}
              emptyText={t('personelTeklif.s004')}
            />
          </View>

          <Text style={s.sectionLabel}>{t('personelTeklif.s005')} ({total})</Text>
          {personQuotes.length === 0 ? (
            <Text style={s.emptyListText}>{t('personelTeklif.s004')}</Text>
          ) : (
            personQuotes.map((q) => {
              const c = statusColor(q.durum);
              return (
                <View key={q.id} style={s.quoteCard} testID={`staff-quote-${q.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.qNo}>{q.teklifNo}</Text>
                    <Text style={s.qFirma} numberOfLines={1}>{q.musFirma}</Text>
                    <Text style={s.qDate}>{q.tarih}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.qAmount} numberOfLines={1}>{fmt(q.genelToplam, q.paraBirimi)}</Text>
                    <View style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <Text style={[s.statusText, { color: c.text }]}>{statusLabel(lang, q.durum)}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: theme.colors.textMuted, textAlign: 'center' },
  personChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line,
  },
  personChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  personChipText: { fontSize: 12.5, fontWeight: '700', color: theme.colors.textSoft, maxWidth: 160 },
  personChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm,
  },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginTop: 20, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  emptyListText: { color: theme.colors.textMuted, fontSize: 13 },
  quoteCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, ...theme.shadow.sm,
  },
  qNo: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.3 },
  qFirma: { fontSize: 14, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
  qDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  qAmount: { fontSize: 14, fontWeight: '900', color: theme.colors.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, marginTop: 6 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
});

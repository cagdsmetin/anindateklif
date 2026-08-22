import React, { useEffect, useMemo, useState } from 'react';
// redeploy trigger
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { CustomerT, QuoteT, ServiceT } from '@/src/lib/api';
import { normalizePhoneForWhatsApp, openWhatsAppChat } from '@/src/lib/whatsapp';

const HIDDEN_KEY = 'hiddenReminders';

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
  const { services, quotes, campaigns, customers, activeCompany } = useApp();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HIDDEN_KEY);
        if (raw) setHidden(new Set(JSON.parse(raw)));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const hide = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(key);
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  const garantiList = useMemo(() => {
    return services
      .map((s) => ({ s, days: daysUntil(s.garantiBitis) }))
      .filter((x): x is { s: ServiceT; days: number } => x.days !== null && x.days <= 30)
      .filter((x) => !hidden.has(`g-${x.s.id}`))
      .sort((a, b) => a.days - b.days);
  }, [services, hidden]);

  const bakimList = useMemo(() => {
    return services
      .map((s) => ({ s, days: daysUntil(s.bakimTarihi) }))
      .filter((x): x is { s: ServiceT; days: number } => x.days !== null && x.days <= 30)
      .filter((x) => !hidden.has(`b-${x.s.id}`))
      .sort((a, b) => a.days - b.days);
  }, [services, hidden]);

  const teklifList = useMemo(() => {
    return quotes
      .filter((q) => q.durum === 'Beklemede' || q.durum === 'Görüldü')
      .map((q) => ({ q, days: daysUntil(q.gecerlilik) }))
      .filter((x): x is { q: QuoteT; days: number } => x.days !== null && x.days <= 7)
      .filter((x) => !hidden.has(`t-${x.q.id}`))
      .sort((a, b) => a.days - b.days);
  }, [quotes, hidden]);

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
      .filter((x) => !hidden.has(`k-${x.camp.id}`))
      .sort((a, b) => (b.camp.createdAt || '').localeCompare(a.camp.createdAt || ''));
  }, [campaigns, audienceCustomers, hidden]);

  const totalCount = garantiList.length + bakimList.length + teklifList.length + kampanyaList.length;

  const sirketAdi = activeCompany?.sirketAdi || '';

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
        {loaded && totalCount === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={28} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Şu an bekleyen hatırlatma yok. Her şey güncel!</Text>
          </View>
        ) : null}

        {/* Garanti bitiş tarihleri */}
        <SectionHeader icon="shield-checkmark-outline" title="Garanti Bitiş Tarihleri" count={garantiList.length} color={theme.colors.modules.gecmis} />
        {garantiList.length === 0 ? (
          <EmptyLine text="Yaklaşan garanti bitişi yok." />
        ) : (
          garantiList.map(({ s: svc, days }) => (
            <ReminderRow
              key={svc.id}
              category="Garanti"
              categoryColor={theme.colors.modules.gecmis}
              title={svc.baslik}
              sub={`${svc.musFirma || svc.musYetkili || '-'} · ${trDate(svc.garantiBitis)}`}
              badge={urgency(days)}
              label={urgency(days).label}
              onPress={() => router.push({ pathname: '/service-add', params: { id: svc.id } } as any)}
              phone={svc.musTelefon}
              waMessage={`Merhaba ${svc.musYetkili || svc.musFirma || ''},\n\n${svc.baslik} için garanti süreniz ${trDate(svc.garantiBitis)} tarihinde sona eriyor. Bilgi almak isterseniz bize ulaşabilirsiniz.\n\nİyi çalışmalar dileriz,\n${sirketAdi}`}
              onHide={() => hide(`g-${svc.id}`)}
            />
          ))
        )}

        {/* Bakım tarihleri */}
        <SectionHeader icon="build-outline" title="Bakım Tarihleri" count={bakimList.length} color={theme.colors.modules.servis} />
        {bakimList.length === 0 ? (
          <EmptyLine text="Yaklaşan bakım tarihi yok." />
        ) : (
          bakimList.map(({ s: svc, days }) => (
            <ReminderRow
              key={svc.id}
              category="Bakım"
              categoryColor={theme.colors.modules.servis}
              title={svc.baslik}
              sub={`${svc.musFirma || svc.musYetkili || '-'} · ${trDate(svc.bakimTarihi)}`}
              badge={urgency(days)}
              label={urgency(days).label}
              onPress={() => router.push({ pathname: '/service-add', params: { id: svc.id } } as any)}
              phone={svc.musTelefon}
              waMessage={`Merhaba ${svc.musYetkili || svc.musFirma || ''},\n\n${svc.baslik} için bakım tarihiniz ${trDate(svc.bakimTarihi)}. Randevu oluşturmak isterseniz bize ulaşabilirsiniz.\n\nİyi çalışmalar dileriz,\n${sirketAdi}`}
              onHide={() => hide(`b-${svc.id}`)}
            />
          ))
        )}

        {/* Teklif geçerlilik süresi dolanlar */}
        <SectionHeader icon="document-text-outline" title="Teklif Geçerlilik Süresi" count={teklifList.length} color={theme.colors.modules.teklif} />
        {teklifList.length === 0 ? (
          <EmptyLine text="Süresi yaklaşan bekleyen teklif yok." />
        ) : (
          teklifList.map(({ q, days }) => (
            <ReminderRow
              key={q.id}
              category="Teklif"
              categoryColor={theme.colors.modules.teklif}
              title={`${q.teklifNo} · ${q.musFirma}`}
              sub={`Geçerlilik: ${trDate(q.gecerlilik)}`}
              badge={urgency(days)}
              label={urgency(days).label}
              onPress={() => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: q.id } } as any)}
              phone={q.musTelefon}
              waMessage={`Merhaba ${q.musYetkili || q.musFirma || ''},\n\n${q.teklifNo} numaralı teklifinizin geçerlilik süresi ${trDate(q.gecerlilik)} tarihinde sona eriyor. Teklifi onaylamak veya güncellemek isterseniz bize ulaşabilirsiniz.\n\nİyi çalışmalar dileriz,\n${sirketAdi}`}
              onHide={() => hide(`t-${q.id}`)}
            />
          ))
        )}

        {/* Kampanya gönderim durumu */}
        <SectionHeader icon="megaphone-outline" title="Kampanya Gönderim Durumu" count={kampanyaList.length} color={theme.colors.modules.kampanya} />
        {kampanyaList.length === 0 ? (
          <EmptyLine text="Tüm kampanyalar tamamlandı ya da aktif kampanya yok." />
        ) : (
          kampanyaList.map(({ camp, sentCount, total, remaining }) => (
            <ReminderRow
              key={camp.id}
              category="Kampanya"
              categoryColor={theme.colors.modules.kampanya}
              title={camp.baslik}
              sub={`${sentCount}/${total} gönderildi`}
              badge={{ bg: theme.colors.goldSoft, border: theme.colors.goldBorder, text: theme.colors.goldDark }}
              label={`${remaining} kaldı`}
              onPress={() => router.push({ pathname: '/campaign-detail', params: { id: camp.id } } as any)}
              onHide={() => hide(`k-${camp.id}`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ icon, title, count, color }: { icon: any; title: string; count: number; color: string }) {
  return (
    <View style={s.sectionHdr}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={s.sectionTitle}>{title}</Text>
      {count > 0 ? (
        <View style={[s.countPill, { backgroundColor: color }]}><Text style={s.countPillText}>{count}</Text></View>
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

function ReminderRow({
  category,
  categoryColor,
  title,
  sub,
  badge,
  label,
  onPress,
  phone,
  waMessage,
  onHide,
}: {
  category: string;
  categoryColor: string;
  title: string;
  sub: string;
  badge: { bg: string; border: string; text: string };
  label: string;
  onPress: () => void;
  phone?: string;
  waMessage?: string;
  onHide: () => void;
}) {
  const cleanedPhone = normalizePhoneForWhatsApp(phone || '');
  return (
    <View style={s.row}>
      <TouchableOpacity style={s.rowTop} onPress={onPress} activeOpacity={0.85}>
        <View style={[s.categoryPill, { backgroundColor: categoryColor }]}>
          <Text style={s.categoryPillText}>{category}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={[s.badgeText, { color: badge.text }]}>{label}</Text>
        </View>
      </TouchableOpacity>
      <View style={s.rowActions}>
        {cleanedPhone ? (
          <TouchableOpacity
            style={s.waBtn}
            onPress={() => openWhatsAppChat(phone || '', waMessage || '')}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={13} color="#fff" />
            <Text style={s.waBtnText}>WhatsApp'tan Hatırlat</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <TouchableOpacity style={s.hideBtn} onPress={onHide} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
          <Ionicons name="checkmark" size={12} color={theme.colors.textMuted} />
          <Text style={s.hideBtnText}>Gizle</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
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
  countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countPillText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  emptyLineBox: { paddingVertical: 10 },
  emptyLineText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },

  row: { backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, ...theme.shadow.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  categoryPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  categoryPillText: { fontSize: 9.5, fontWeight: '900', color: '#fff' },
  rowTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  rowSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },

  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 8 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.navyDark, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  waBtnText: { fontSize: 11.5, fontWeight: '800', color: '#fff' },
  hideBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  hideBtnText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
});

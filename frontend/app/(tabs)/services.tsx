import React, { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { ServiceT } from '@/src/lib/api';
import { normalizePhoneForWhatsApp } from '@/src/lib/whatsapp';

const STATUSES = ['Açık', 'Devam ediyor', 'Tamamlandı', 'İptal'];

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

export default function ServicesScreen() {
  const { services, activeCompany, deleteService, updateServiceStatus, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('Tümü');
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = services;
    if (filter !== 'Tümü') list = list.filter((s) => s.durum === filter);
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter(
        (s) =>
          (s.musFirma || '').toLowerCase().includes(qq) ||
          (s.baslik || '').toLowerCase().includes(qq) ||
          (s.musYetkili || '').toLowerCase().includes(qq)
      );
    }
    return list;
  }, [services, filter, q]);

  const garantiYaklasan = services.filter((s) => {
    const d = daysUntil(s.garantiBitis);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const openAdd = () => router.push('/service-add' as any);
  const openEdit = (id: string) => router.push({ pathname: '/service-add', params: { id } } as any);

  const remind = (svc: ServiceT) => {
    const cleaned = normalizePhoneForWhatsApp(svc.musTelefon || '');
    const musteri = svc.musYetkili || svc.musFirma || 'Değerli Müşterimiz';
    const parts: string[] = [`Merhaba ${musteri},`, ''];
    const gDays = daysUntil(svc.garantiBitis);
    const bDays = daysUntil(svc.bakimTarihi);
    if (svc.bakimTarihi && bDays !== null && bDays >= 0) {
      parts.push(`${svc.baslik} için bakım tarihiniz yaklaşıyor: ${trDate(svc.bakimTarihi)}.`);
    } else if (svc.garantiBitis && gDays !== null) {
      parts.push(
        gDays >= 0
          ? `${svc.baslik} garanti süreniz ${trDate(svc.garantiBitis)} tarihinde sona eriyor.`
          : `${svc.baslik} garanti süreniz ${trDate(svc.garantiBitis)} tarihinde sona ermiştir.`
      );
    } else {
      parts.push(`${svc.baslik} ile ilgili sizi bilgilendirmek isteriz.`);
    }
    parts.push('', 'İyi günler dileriz,', activeCompany?.sirketAdi || 'Firmamız');
    const text = encodeURIComponent(parts.join('\n'));
    const url = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;
    Linking.openURL(url).catch(() => showToast('WhatsApp açılamadı'));
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Servis" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Servis & Garanti" />
      <View style={{ padding: 14, paddingBottom: 6 }}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Toplam Servis</Text>
            <Text style={s.statValue}>{services.length}</Text>
          </View>
          <View style={[s.statCard, garantiYaklasan > 0 && { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.goldBorder }]}>
            <Text style={[s.statLabel, garantiYaklasan > 0 && { color: theme.colors.goldDark }]}>Garanti Yaklaşan</Text>
            <Text style={[s.statValue, garantiYaklasan > 0 && { color: theme.colors.goldDark }]}>{garantiYaklasan}</Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="services-search"
            style={s.searchInput}
            placeholder="Müşteri, başlık ara..."
            placeholderTextColor="#94a3b8"
            value={q}
            onChangeText={setQ}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowOuter} contentContainerStyle={s.filterRow}>
        {['Tümü', ...STATUSES].map((st) => (
          <TouchableOpacity key={st} testID={`svc-filter-${st}`} style={[s.filterChip, filter === st && s.filterChipActive]} onPress={() => setFilter(st)}>
            <Text style={[s.filterText, filter === st && s.filterTextActive]} allowFontScaling={false}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="construct-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Kayıtlı servis kaydı yok.</Text>
          </View>
        ) : filtered.map((svc) => {
          const c = statusColor(svc.durum);
          const gDays = daysUntil(svc.garantiBitis);
          const bDays = daysUntil(svc.bakimTarihi);
          const gWarn = gDays !== null && gDays <= 30;
          const bWarn = bDays !== null && bDays <= 7;
          return (
            <View key={svc.id} style={s.card} testID={`service-card-${svc.id}`}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.hTitle} numberOfLines={1}>{svc.baslik}</Text>
                  <Text style={s.hFirma} numberOfLines={1}>{svc.musFirma || svc.musYetkili || '-'}</Text>
                  <Text style={s.hDate}>Servis: {trDate(svc.servisTarihi)}</Text>
                </View>
                <TouchableOpacity testID={`svc-status-${svc.id}`} onPress={() => setStatusMenuFor(svc.id)} style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
                  <Text style={[s.statusText, { color: c.text }]}>{svc.durum}</Text>
                  <Ionicons name="chevron-down" size={11} color={c.text} />
                </TouchableOpacity>
              </View>

              {(svc.garantiBitis || svc.bakimTarihi) ? (
                <View style={s.datesRow}>
                  {svc.garantiBitis ? (
                    <View style={[s.dateChip, gWarn && s.dateChipWarn]}>
                      <Ionicons name="shield-checkmark-outline" size={12} color={gWarn ? theme.colors.goldDark : theme.colors.textMuted} />
                      <Text style={[s.dateChipText, gWarn && s.dateChipTextWarn]}>Garanti: {trDate(svc.garantiBitis)}</Text>
                    </View>
                  ) : null}
                  {svc.bakimTarihi ? (
                    <View style={[s.dateChip, bWarn && s.dateChipWarn]}>
                      <Ionicons name="build-outline" size={12} color={bWarn ? theme.colors.goldDark : theme.colors.textMuted} />
                      <Text style={[s.dateChipText, bWarn && s.dateChipTextWarn]}>Bakım: {trDate(svc.bakimTarihi)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {svc.aciklama ? <Text style={s.desc} numberOfLines={2}>{svc.aciklama}</Text> : null}

              <View style={s.actionBar}>
                <TouchableOpacity style={s.actBtn} onPress={() => openEdit(svc.id)} testID={`svc-edit-${svc.id}`}>
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actBtn, { backgroundColor: '#dcfce7' }]} onPress={() => remind(svc)} testID={`svc-remind-${svc.id}`}>
                  <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                  <Text style={[s.actText, { color: '#16a34a' }]}>Hatırlat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtnIcon} onPress={() => deleteService(svc.id)} testID={`svc-delete-${svc.id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 18 }]} onPress={openAdd} testID="svc-add-fab">
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>Durum Seç</Text>
            {STATUSES.map((st) => {
              const cc = statusColor(st);
              return (
                <TouchableOpacity
                  key={st}
                  testID={`svc-set-status-${st}`}
                  style={[s.menuItem, { backgroundColor: cc.bg, borderColor: cc.border }]}
                  onPress={async () => {
                    if (statusMenuFor) { await updateServiceStatus(statusMenuFor, st); showToast('Durum güncellendi'); }
                    setStatusMenuFor(null);
                  }}
                >
                  <Text style={[s.menuItemText, { color: cc.text }]}>{st}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, ...theme.shadow.sm },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: theme.colors.text },
  filterRowOuter: { flexGrow: 0, height: 56 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  filterChip: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  filterTextActive: { color: '#fff' },
  emptyBox: { marginTop: 24, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 30, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 10, ...theme.shadow.sm },
  cardTop: { flexDirection: 'row', gap: 10 },
  hTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.navy },
  hFirma: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  hDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, height: 26 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  datesRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dateChipWarn: { backgroundColor: theme.colors.goldSoft },
  dateChipText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  dateChipTextWarn: { color: theme.colors.goldDark },
  desc: { fontSize: 11.5, color: theme.colors.textSoft, marginTop: 8, lineHeight: 16 },
  actionBar: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, backgroundColor: theme.colors.primarySoft, borderRadius: 10, flex: 1, justifyContent: 'center' },
  actBtnIcon: { width: 40, paddingVertical: 8, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.2 },
  fab: { position: 'absolute', right: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadow.lg },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 30 },
  menu: { backgroundColor: '#fff', padding: 16, borderRadius: 16, gap: 8, ...theme.shadow.lg },
  menuTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.navy, marginBottom: 6, textAlign: 'center' },
  menuItem: { padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  menuItemText: { fontSize: 13, fontWeight: '800' },
});

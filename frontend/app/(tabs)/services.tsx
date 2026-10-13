import React, { useEffect, useMemo, useState } from 'react';
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
import { IconBadge, MotionScrollView, Reveal, ScreenHero, themedStyles } from '@/src/components/motion';
import { api, ServiceT, TeamDirectoryMemberT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { normalizePhoneForWhatsApp } from '@/src/lib/whatsapp';
import { useLanguage, statusLabel } from '@/src/lib/i18n';

const STATUSES = ['Açık', 'Devam ediyor', 'Tamamlandı', 'İptal'];
const ALL = 'Tümü';
const isOpen = (s: ServiceT) => s.durum === 'Açık' || s.durum === 'Devam ediyor';

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
  const { t, lang } = useLanguage();
  const { services, activeCompany, deleteService, updateServiceStatus, assignService, showToast } = useApp();
  const { user: me } = useAuth();
  // Atamayı yönetici yapar; kısıtlı personel yalnız kendine atanan işleri görür.
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const myId = me?.user_id || '';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamDirectoryMemberT[]>([]);
  // null = herkes, '' = atanmamış, aksi halde görevlinin user_id'si
  const [assignee, setAssignee] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ServiceT | null>(null);

  const companyId = activeCompany?.id;
  useEffect(() => {
    if (!companyId) { setMembers([]); return; }
    let alive = true;
    api.teamDirectory(companyId).then((m) => { if (alive) setMembers(m); }).catch(() => {});
    return () => { alive = false; };
  }, [companyId]);

  // Görev dağılımı: kişi başına açık (Açık + Devam ediyor) iş sayısı.
  const workload = useMemo(() => {
    const open = services.filter(isOpen);
    return {
      unassigned: open.filter((s) => !s.atananId).length,
      byId: open.reduce<Record<string, number>>((acc, s) => {
        if (s.atananId) acc[s.atananId] = (acc[s.atananId] || 0) + 1;
        return acc;
      }, {}),
    };
  }, [services]);
  const showTeam = !restricted && (members.length > 1 || services.some((s) => !!s.atananId));

  const doAssign = async (svc: ServiceT, atananId: string, okMsg: string) => {
    setAssignFor(null);
    try {
      await assignService(svc.id, atananId);
      showToast(okMsg);
    } catch (e: any) {
      showToast(t('services.s034') + (e?.message || ''));
    }
  };

  const filtered = useMemo(() => {
    let list = services;
    if (filter !== ALL) list = list.filter((s) => s.durum === filter);
    if (assignee !== null) list = list.filter((s) => (s.atananId || '') === assignee);
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
  }, [services, filter, q, assignee]);

  const garantiYaklasan = services.filter((s) => {
    const d = daysUntil(s.garantiBitis);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  const openAdd = () => router.push('/service-add' as any);
  const openEdit = (id: string) => router.push({ pathname: '/service-add', params: { id } } as any);

  const remind = (svc: ServiceT) => {
    const cleaned = normalizePhoneForWhatsApp(svc.musTelefon || '');
    const musteri = svc.musYetkili || svc.musFirma || t('services.s005');
    const parts: string[] = [`Merhaba ${musteri},`, ''];
    const gDays = daysUntil(svc.garantiBitis);
    const bDays = daysUntil(svc.bakimTarihi);
    const sDays = daysUntil(svc.servisTarihi);
    if (svc.servisTarihi && sDays !== null && sDays >= 0 && isOpen(svc)) {
      parts.push(`${svc.baslik} için servis randevunuz ${trDate(svc.servisTarihi)} tarihindedir.`);
      if (svc.atananAd) parts.push(`Görevli personelimiz: ${svc.atananAd}.`);
    } else if (svc.bakimTarihi && bDays !== null && bDays >= 0) {
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
    parts.push('', t('services.s006'), activeCompany?.sirketAdi || t('services.s007'));
    const text = encodeURIComponent(parts.join('\n'));
    const url = cleaned ? `https://wa.me/${cleaned}?text=${text}` : `https://wa.me/?text=${text}`;
    Linking.openURL(url).catch(() => showToast(t('services.s008')));
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('services.s009')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('services.s010')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('services.s011')} />
      <MotionScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        progressColors={[theme.colors.modules.servis, theme.colors.gold, '#EC4899']}
      >
        <View style={s.headBlock}>
          <ScreenHero
            icon="construct"
            title={t('services.s011')}
            subtitle={activeCompany?.sirketAdi}
            color={theme.colors.modules.servis}
            stats={[
              { label: t('services.s012'), value: services.length },
              { label: t('services.s013'), value: garantiYaklasan, tone: garantiYaklasan > 0 ? '#FCD34D' : undefined },
            ]}
          />
          {showTeam ? (
            <View style={s.teamBox} testID="svc-workload">
              <Text style={s.teamTitle}>{t('services.s023')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.teamRow}>
                {[
                  { id: '', name: t('services.s024'), count: workload.unassigned, warn: workload.unassigned > 0 },
                  ...members.map((m) => ({
                    id: m.userId,
                    name: m.userId === myId ? t('services.s025') : m.name,
                    count: workload.byId[m.userId] || 0,
                    warn: false,
                  })),
                ].map((p) => {
                  const active = assignee === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id || 'none'}
                      testID={`svc-assignee-${p.id || 'none'}`}
                      style={[s.teamChip, p.warn && s.teamChipWarn, active && s.teamChipActive]}
                      onPress={() => setAssignee(active ? null : p.id)}
                    >
                      <Text style={[s.teamCount, p.warn && s.teamTextWarn, active && s.teamTextActive]}>{p.count}</Text>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[s.teamName, p.warn && s.teamTextWarn, active && s.teamTextActive]} numberOfLines={1}>{p.name}</Text>
                        <Text style={[s.teamSub, active && s.teamTextActive]}>{t('services.s032')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>

        {/* Arama + durum filtreleri: liste kayarken üstte yapışık kalır */}
        <View style={s.stickyBar}>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput
              testID="services-search"
              style={s.searchInput}
              placeholder={t('services.s014')}
              placeholderTextColor="#94a3b8"
              value={q}
              onChangeText={setQ}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowOuter} contentContainerStyle={s.filterRow}>
            {[ALL, ...STATUSES].map((st) => (
              <TouchableOpacity key={st} testID={`svc-filter-${st}`} style={[s.filterChip, filter === st && s.filterChipActive]} onPress={() => setFilter(st)}>
                <Text style={[s.filterText, filter === st && s.filterTextActive]} allowFontScaling={false}>{st === ALL ? t('services.s001') : statusLabel(lang, st)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={s.listWrap}>
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="construct-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>{t('services.s015')}</Text>
          </View>
        ) : filtered.map((svc, idx) => {
          const c = statusColor(svc.durum);
          const gDays = daysUntil(svc.garantiBitis);
          const bDays = daysUntil(svc.bakimTarihi);
          const gWarn = gDays !== null && gDays <= 30;
          const bWarn = bDays !== null && bDays <= 7;
          return (
            <Reveal key={svc.id} variant={idx % 2 === 0 ? 'left' : 'right'} distance={20}>
            <View style={s.card} testID={`service-card-${svc.id}`}>
              <View style={[s.cardStripe, { backgroundColor: c.text }]} />
              <View style={s.cardTop}>
                <IconBadge icon="construct" color={c.text} size={38} motion="pop" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.hTitle} numberOfLines={1}>{svc.baslik}</Text>
                  <Text style={s.hFirma} numberOfLines={1}>{svc.musFirma || svc.musYetkili || '-'}</Text>
                  <Text style={s.hDate}>{t('services.s016')}{trDate(svc.servisTarihi)}</Text>
                </View>
                <TouchableOpacity testID={`svc-status-${svc.id}`} onPress={() => setStatusMenuFor(svc.id)} style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
                  <Text style={[s.statusText, { color: c.text }]}>{statusLabel(lang, svc.durum)}</Text>
                  <Ionicons name="chevron-down" size={11} color={c.text} />
                </TouchableOpacity>
              </View>

              {(svc.garantiBitis || svc.bakimTarihi) ? (
                <View style={s.datesRow}>
                  {svc.garantiBitis ? (
                    <View style={[s.dateChip, gWarn && s.dateChipWarn]}>
                      <Ionicons name="shield-checkmark-outline" size={12} color={gWarn ? theme.colors.goldDark : theme.colors.textMuted} />
                      <Text style={[s.dateChipText, gWarn && s.dateChipTextWarn]}>{t('services.s017')}{trDate(svc.garantiBitis)}</Text>
                    </View>
                  ) : null}
                  {svc.bakimTarihi ? (
                    <View style={[s.dateChip, bWarn && s.dateChipWarn]}>
                      <Ionicons name="build-outline" size={12} color={bWarn ? theme.colors.goldDark : theme.colors.textMuted} />
                      <Text style={[s.dateChipText, bWarn && s.dateChipTextWarn]}>{t('services.s018')}{trDate(svc.bakimTarihi)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {showTeam ? (
                  <TouchableOpacity
                    testID={`svc-assign-${svc.id}`}
                    activeOpacity={0.8}
                    style={[s.assignRow, !svc.atananId && s.assignRowEmpty]}
                    onPress={() => setAssignFor(svc)}
                  >
                    <Ionicons name={svc.atananId ? 'person-circle-outline' : 'person-add-outline'} size={15} color={svc.atananId ? theme.colors.primary : theme.colors.goldDark} />
                    <Text style={[s.assignText, !svc.atananId && { color: theme.colors.goldDark }]} numberOfLines={1}>
                      {svc.atananId
                        ? `${t('services.s026')} ${svc.atananAd || '-'}${svc.atananId === myId ? ` (${t('services.s036')})` : ''}`
                        : t('services.s024')}
                    </Text>
                    <Text style={s.assignAction}>{t('services.s027')}</Text>
                  </TouchableOpacity>
              ) : null}

              {svc.aciklama ? <Text style={s.desc} numberOfLines={2}>{svc.aciklama}</Text> : null}

              <View style={s.actionBar}>
                <TouchableOpacity style={s.actBtn} onPress={() => openEdit(svc.id)} testID={`svc-edit-${svc.id}`}>
                  <Ionicons name="pencil-outline" size={14} color={theme.colors.primary} />
                  <Text style={s.actText}>{t('services.s019')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actBtn, { backgroundColor: theme.colors.greenSoft }]} onPress={() => remind(svc)} testID={`svc-remind-${svc.id}`}>
                  <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                  <Text style={[s.actText, { color: theme.colors.greenText }]}>{t('services.s020')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actBtnIcon} onPress={() => deleteService(svc.id)} testID={`svc-delete-${svc.id}`}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
            </Reveal>
          );
        })}
        </View>
      </MotionScrollView>

      <TouchableOpacity // Bottom offset is pushed up (+66) so this FAB doesn't sit directly under
      // the global support chat bubble (SupportBubble, bottom-right, same corner) --
      // they used to fully overlap, making this add button invisible/unclickable.
      style={[s.fab, { bottom: insets.bottom + 18 + 66 }]} onPress={openAdd} testID="svc-add-fab">
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>{t('services.s021')}</Text>
            {STATUSES.map((st) => {
              const cc = statusColor(st);
              return (
                <TouchableOpacity
                  key={st}
                  testID={`svc-set-status-${st}`}
                  style={[s.menuItem, { backgroundColor: cc.bg, borderColor: cc.border }]}
                  onPress={async () => {
                    if (statusMenuFor) { await updateServiceStatus(statusMenuFor, st); showToast(t('services.s022')); }
                    setStatusMenuFor(null);
                  }}
                >
                  <Text style={[s.menuItemText, { color: cc.text }]}>{statusLabel(lang, st)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!assignFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setAssignFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>{t('services.s028')}</Text>
            {assignFor ? <Text style={s.menuSub} numberOfLines={1}>{assignFor.baslik}</Text> : null}
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
              {members.map((m) => {
                const sel = assignFor?.atananId === m.userId;
                return (
                  <TouchableOpacity
                    key={m.userId}
                    testID={`svc-assign-to-${m.userId}`}
                    style={[s.memberRow, sel && s.memberRowActive]}
                    onPress={() => assignFor && doAssign(assignFor, m.userId, t('services.s030'))}
                  >
                    <Ionicons name={sel ? 'checkmark-circle' : 'person-outline'} size={18} color={theme.colors.primary} />
                    <Text style={s.memberName} numberOfLines={1}>{m.name}{m.userId === myId ? ` (${t('services.s036')})` : ''}</Text>
                    <Text style={s.memberCount}>{workload.byId[m.userId] || 0} {t('services.s032')}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {assignFor?.atananId ? (
              <TouchableOpacity testID="svc-unassign" style={s.unassignBtn} onPress={() => assignFor && doAssign(assignFor, '', t('services.s031'))}>
                <Text style={s.unassignText}>{t('services.s029')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  headBlock: { paddingHorizontal: 14, paddingTop: 12 },
  stickyBar: { backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 14, paddingTop: 4, zIndex: 10 },
  listWrap: { paddingHorizontal: 14, paddingTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '800', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, ...theme.shadow.sm },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: theme.colors.text },
  filterRowOuter: { flexGrow: 0, height: 56 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  filterChip: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  filterTextActive: { color: '#fff' },
  emptyBox: { marginTop: 24, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 30, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 13,
    paddingTop: 15,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 12,
    overflow: 'hidden',
    ...theme.shadow.sm,
  },
  cardStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  cardTop: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  hTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  hFirma: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  hDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, height: 26 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  datesRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.surfaceSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
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
  menu: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 16, gap: 8, ...theme.shadow.lg },
  menuTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
  menuItem: { padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  menuItemText: { fontSize: 13, fontWeight: '800' },
  menuSub: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: -8, marginBottom: 4 },
  teamBox: { marginTop: 10, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, paddingVertical: 10, ...theme.shadow.sm },
  teamTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: theme.colors.textMuted, paddingHorizontal: 12, marginBottom: 8 },
  teamRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 190, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surfaceSoft },
  teamChipWarn: { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.gold },
  teamChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  teamCount: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  teamName: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  teamSub: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  teamTextWarn: { color: theme.colors.goldDark },
  teamTextActive: { color: '#fff' },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.primarySoft },
  assignRowEmpty: { backgroundColor: theme.colors.goldSoft },
  assignText: { flex: 1, fontSize: 11.5, fontWeight: '800', color: theme.colors.primary },
  assignAction: { fontSize: 10.5, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  memberRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  memberName: { flex: 1, fontSize: 13, fontWeight: '800', color: theme.colors.text },
  memberCount: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  unassignBtn: { padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: theme.colors.redSoft },
  unassignText: { fontSize: 13, fontWeight: '800', color: theme.colors.red },
}));

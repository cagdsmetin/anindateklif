import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, AdminCustomerT, DeletedAccountT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';
import { MotionInput, MotionScrollView, Reveal, ScreenHero, themedStyles } from '@/src/components/motion';
import SystemStatusCard from '@/src/components/SystemStatusCard';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AdminCustomersScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, enterAsCustomer } = useAuth();

  const [customers, setCustomers] = useState<AdminCustomerT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [agBusyId, setAgBusyId] = useState('');
  const [onlyAlbertGenau, setOnlyAlbertGenau] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listAdminCustomers();
      setCustomers(res || []);
      setError('');
    } catch {
      setError('Müşteri listesi alınamadı.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = customers;
    if (onlyAlbertGenau) list = list.filter((c) => c.albert_genau_claimed || c.albert_genau_enabled);
    if (!q) return list;
    return list.filter((c) =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, query, onlyAlbertGenau]);

  // Firma sayısı arttıkça admin, kim "Albert Genau bayisiyim" dedi ama henüz
  // erişim açılmadı, bunu listenin tamamını taramadan görsün diye ayrı bir
  // "bekleyen başvurular" kutusu -- onaylanınca (enabled=true) otomatik
  // buradan düşer.
  const pendingAlbertGenau = useMemo(
    () => customers.filter((c) => c.albert_genau_claimed && !c.albert_genau_enabled),
    [customers]
  );

  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  const doEnter = async (c: AdminCustomerT) => {
    if (busyId) return;
    setBusyId(c.user_id);
    try {
      await enterAsCustomer(c.user_id);
      router.replace('/(tabs)');
    } catch (e: any) {
      let msg = 'Giriş yapılamadı.';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusyId('');
    }
  };

  // Silinen hesaplar: yumusak silme sayesinde 30 gun icinde geri alinabilir.
  const [deleted, setDeleted] = useState<DeletedAccountT[]>([]);
  const [delBusyId, setDelBusyId] = useState('');

  const loadDeleted = useCallback(async () => {
    try {
      setDeleted(await api.listDeletedAccounts());
    } catch {
      // yoksay -- ana liste calismaya devam etsin
    }
  }, []);
  useEffect(() => { if (isAdmin) loadDeleted(); }, [isAdmin, loadDeleted]);

  const doDelete = async (c: AdminCustomerT) => {
    setDelBusyId(c.user_id);
    try {
      await api.adminDeleteCustomer(c.user_id);
      setCustomers((prev) => prev.filter((x) => x.user_id !== c.user_id));
      await loadDeleted();
    } catch {
      setError('Hesap silinemedi.');
    } finally {
      setDelBusyId('');
    }
  };

  // Silme geri alinabilir olsa da veri kaybi riski tasidigi icin her zaman
  // acik bir uyariyla onaylatilir.
  const onDeletePress = (c: AdminCustomerT) => {
    const label = c.company_name || c.name || c.email;
    const message =
      `"${label}" hesabı silinecek.\n\n` +
      '• Hesap hemen giriş yapamaz hale gelir.\n' +
      '• Verileri 30 gün saklanır, bu süre içinde geri alabilirsiniz.\n' +
      '• 30 gün sonra tüm verileri kalıcı olarak silinir.\n\n' +
      'Devam edilsin mi?';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) doDelete(c);
      return;
    }
    Alert.alert('Hesabı Sil', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => doDelete(c) },
    ]);
  };

  const onRestore = async (d: DeletedAccountT) => {
    setDelBusyId(d.user_id);
    try {
      await api.adminRestoreCustomer(d.user_id);
      await Promise.all([load(), loadDeleted()]);
    } catch {
      setError('Hesap geri alınamadı.');
    } finally {
      setDelBusyId('');
    }
  };

  const onToggleAlbertGenau = async (c: AdminCustomerT, next: boolean) => {
    if (!c.company_id || agBusyId) return;
    setAgBusyId(c.user_id);
    // İyimser güncelle -- yanlışsa aşağıda geri alınır.
    setCustomers((prev) => prev.map((x) => (x.user_id === c.user_id ? { ...x, albert_genau_enabled: next } : x)));
    try {
      await api.adminSetAlbertGenauEnabled(c.company_id, next);
    } catch {
      setCustomers((prev) => prev.map((x) => (x.user_id === c.user_id ? { ...x, albert_genau_enabled: !next } : x)));
      setError('Albert Genau ayarı güncellenemedi.');
    } finally {
      setAgBusyId('');
    }
  };

  const onToggleZipPerde = async (c: AdminCustomerT, next: boolean) => {
    if (!c.company_id || agBusyId) return;
    setAgBusyId(c.user_id);
    setCustomers((prev) => prev.map((x) => (x.user_id === c.user_id ? { ...x, zip_perde_enabled: next } : x)));
    try {
      await api.adminSetZipPerdeEnabled(c.company_id, next);
    } catch {
      setCustomers((prev) => prev.map((x) => (x.user_id === c.user_id ? { ...x, zip_perde_enabled: !next } : x)));
      setError('Zip Perde ayarı güncellenemedi.');
    } finally {
      setAgBusyId('');
    }
  };

  const onEnterPress = (c: AdminCustomerT) => {
    const label = c.company_name || c.name || c.email;
    const message = `"${label}" hesabına, şifresini bilmeden, geçici destek erişimi açılacak. Devam edilsin mi?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) doEnter(c);
      return;
    }
    Alert.alert('Müşteri Olarak Gir', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gir', style: 'destructive', onPress: () => doEnter(c) },
    ]);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Müşteri Olarak Gir</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu ekrana erişim yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Müşteri Olarak Gir</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <MotionScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <ScreenHero
            icon="key"
            title={'Müşteri Olarak Gir'}
            color={theme.colors.gold}
          />
          <View style={s.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
            <Text style={s.infoText}>
              Buradan seçtiğin firmaya, şifresini görmeden/sormadan geçici (30 dk) bir destek erişimi açılır. Her giriş kayıt altına alınır.
            </Text>
          </View>

          <SystemStatusCard />

          {pendingAlbertGenau.length > 0 ? (
            <View style={s.pendingBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="flag" size={15} color="#92400E" />
                <Text style={s.pendingTitle}>Bekleyen Albert Genau Başvuruları ({pendingAlbertGenau.length})</Text>
              </View>
              {pendingAlbertGenau.map((c) => (
                <View key={c.user_id} style={s.pendingRow}>
                  <Text style={s.pendingRowTitle} numberOfLines={1}>{c.company_name || c.name || c.email}</Text>
                  <TouchableOpacity
                    style={[s.pendingEnableBtn, agBusyId === c.user_id && { opacity: 0.6 }]}
                    onPress={() => onToggleAlbertGenau(c, true)}
                    disabled={agBusyId === c.user_id || !c.company_id}
                  >
                    {agBusyId === c.user_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.pendingEnableBtnText}>Aç</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <MotionInput
            style={s.search}
            placeholder="Firma, isim veya e-posta ara..."
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
          />

          <TouchableOpacity
            style={[s.filterChip, onlyAlbertGenau && s.filterChipActive]}
            onPress={() => setOnlyAlbertGenau((v) => !v)}
          >
            <Ionicons name="filter" size={13} color={onlyAlbertGenau ? '#fff' : theme.colors.textMuted} />
            <Text style={[s.filterChipText, onlyAlbertGenau && s.filterChipTextActive]}>
              Sadece Albert Genau ile ilgili firmalar
            </Text>
          </TouchableOpacity>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {deleted.length > 0 ? (
            <View style={s.deletedBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="trash-bin-outline" size={15} color={theme.colors.redText} />
                <Text style={s.deletedTitle}>Silinen hesaplar ({deleted.length})</Text>
              </View>
              <Text style={s.deletedHint}>
                Bu hesaplar giriş yapamaz. Verileri 30 gün saklanır; süre dolunca kalıcı olarak silinir.
              </Text>
              {deleted.map((d) => (
                <View key={d.user_id} style={s.deletedRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.deletedName} numberOfLines={1}>{d.company_name || d.name || d.email}</Text>
                    <Text style={s.deletedMeta} numberOfLines={1}>
                      {d.email} · {d.days_left} gün sonra kalıcı silinecek
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.restoreBtn, delBusyId === d.user_id && { opacity: 0.6 }]}
                    onPress={() => onRestore(d)}
                    disabled={!!delBusyId}
                    testID={`admin-restore-${d.user_id}`}
                  >
                    {delBusyId === d.user_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="arrow-undo-outline" size={14} color="#fff" />
                        <Text style={s.restoreBtnText}>Geri al</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[s.sectionLabel, { marginTop: 18 }]}>MÜŞTERİLER ({filtered.length})</Text>
          {filtered.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Kayıt bulunamadı.</Text>
          ) : (
            filtered.map((c, idx) => (
              <Reveal key={c.user_id} variant={idx % 2 === 0 ? 'left' : 'right'} distance={18}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.company_name || c.name || c.email}</Text>
                  <Text style={s.rowMeta} numberOfLines={1}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <View style={[s.badge, c.subscription_active ? s.badgeActive : s.badgeInactive]}>
                      <Text style={[s.badgeText, c.subscription_active ? s.badgeTextActive : s.badgeTextInactive]}>
                        {c.subscription_active ? 'Aktif Abonelik' : 'Abone Değil'}
                      </Text>
                    </View>
                    {c.created_at ? <Text style={s.rowDate}>{fmtDate(c.created_at)}</Text> : null}
                  </View>
                  {c.company_id ? (
                    <View style={s.agRow}>
                      <Text style={s.agLabel}>Albert Genau bayisi</Text>
                      <Switch
                        value={!!c.albert_genau_enabled}
                        onValueChange={(v) => onToggleAlbertGenau(c, v)}
                        disabled={agBusyId === c.user_id}
                        trackColor={{ false: '#E2E8F0', true: theme.colors.primary }}
                        thumbColor="#fff"
                      />
                      {c.albert_genau_claimed ? (
                        <View style={s.claimBadge}>
                          <Ionicons name="flag" size={10} color="#92400E" />
                          <Text style={s.claimBadgeText}>Bayilik belirtti</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {c.company_id ? (
                    <View style={s.agRow}>
                      <Text style={s.agLabel}>Zip Perde bayisi</Text>
                      <Switch
                        value={!!c.zip_perde_enabled}
                        onValueChange={(v) => onToggleZipPerde(c, v)}
                        disabled={agBusyId === c.user_id}
                        trackColor={{ false: '#E2E8F0', true: theme.colors.primary }}
                        thumbColor="#fff"
                        testID={`zip-toggle-${c.user_id}`}
                      />
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <TouchableOpacity
                    style={[s.enterBtn, busyId === c.user_id && { opacity: 0.6 }]}
                    onPress={() => onEnterPress(c)}
                    disabled={!!busyId}
                  >
                    {busyId === c.user_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={15} color="#fff" />
                        <Text style={s.enterBtnText}>Müşteri olarak gir</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.delBtn, delBusyId === c.user_id && { opacity: 0.6 }]}
                    onPress={() => onDeletePress(c)}
                    disabled={!!delBusyId}
                    testID={`admin-delete-${c.user_id}`}
                  >
                    {delBusyId === c.user_id ? (
                      <ActivityIndicator size="small" color={theme.colors.red} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={14} color={theme.colors.red} />
                        <Text style={s.delBtnText}>Hesabı sil</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              </Reveal>
            ))
          )}
        </MotionScrollView>
      )}
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSoft,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: theme.colors.text, lineHeight: 17 },
  search: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: theme.colors.text,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  pendingBox: {
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  pendingTitle: { fontSize: 12.5, fontWeight: '800', color: theme.colors.goldText },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
  },
  pendingRowTitle: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.text, marginRight: 8 },
  pendingEnableBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, minWidth: 44, alignItems: 'center' },
  pendingEnableBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 10,
  },
  filterChipActive: { backgroundColor: theme.colors.primary },
  filterChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    ...theme.shadow.sm,
  },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: theme.colors.text },
  rowMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowDate: { fontSize: 10.5, color: theme.colors.textMuted },
  agRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  agLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  claimBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.goldSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  claimBadgeText: { fontSize: 10, fontWeight: '800', color: theme.colors.goldText },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeActive: { backgroundColor: theme.colors.greenSoft },
  badgeInactive: { backgroundColor: theme.colors.surfaceSoft },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextActive: { color: theme.colors.greenText },
  badgeTextInactive: { color: theme.colors.textMuted },
  delBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: theme.colors.red, backgroundColor: theme.colors.redSoft,
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, minHeight: 32,
  },
  delBtnText: { color: theme.colors.redText, fontSize: 11.5, fontWeight: '800' },
  deletedBox: {
    marginTop: 18, borderWidth: 1, borderColor: theme.colors.red + '55',
    backgroundColor: theme.colors.redSoft, borderRadius: 16, padding: 14,
  },
  deletedTitle: { fontSize: 13, fontWeight: '900', color: theme.colors.redText },
  deletedHint: { fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16, marginBottom: 10 },
  deletedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: theme.colors.red + '33',
  },
  deletedName: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  deletedMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: theme.colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minHeight: 34,
  },
  restoreBtnText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  enterBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
}));

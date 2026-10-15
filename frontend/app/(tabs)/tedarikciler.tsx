import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, RatesT, TedarikciHareketT, TedarikciInput, TedarikciT } from '@/src/lib/api';
import { sumToTRY } from '@/src/lib/tahsilat-utils';
import { computeTedarikciBalances, fmtMoney, localToday } from '@/src/lib/tedarikci';
import { fill, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, Reveal, ScreenHero, alpha, compactNumber, hashColor, themedStyles } from '@/src/components/motion';

// Tedarikçiler: kart bilgileri + her tedarikçinin cari bakiyesi (alış -
// ödeme). Karta dokununca tedarikçi carisi (tedarikci-cari.tsx) açılır.
// Firmanın alış maliyetlerini gösterdiği için yalnız yöneticilere; backend de
// kısıtlı personele 403 döner.

function confirmAsync(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
  return new Promise((resolve) => Alert.alert('', msg, [
    { text: translate('ted.cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
  ]));
}

const EMPTY: Omit<TedarikciInput, 'companyId'> = {
  firma: '', yetkili: '', telefon: '', email: '', adres: '', vergiNo: '', vergiDairesi: '', iban: '', vadeGun: 0, notlar: '',
};

type Filter = 'tumu' | 'borclu' | 'gecmis';

export default function TedarikcilerScreen() {
  const { t } = useLanguage();
  const tt = (k: string) => t('ted.' + k);
  const { activeCompany, showToast } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [list, setList] = useState<TedarikciT[] | null>(null);
  const [hareket, setHareket] = useState<TedarikciHareketT[]>([]);
  const [rates, setRates] = useState<RatesT | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('tumu');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [vadeText, setVadeText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany || restricted) return;
    try {
      const [ts, hs] = await Promise.all([api.listTedarikciler(activeCompany.id), api.listTedarikciHareket(activeCompany.id)]);
      setList(ts); setHareket(hs);
    } catch (e: any) { showToast(e?.message || ''); setList([]); }
  }, [activeCompany, restricted, showToast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { api.rates().then(setRates).catch(() => {}); }, []);

  const today = localToday();
  const balances = useMemo(() => computeTedarikciBalances(hareket, today), [hareket, today]);
  const all = list || [];

  const stats = useMemo(() => {
    const pos = Object.values(balances).flatMap((b) => b.balances.filter((x) => x.bakiye > 0));
    return {
      borc: sumToTRY(pos, rates) ?? 0,
      borclu: Object.values(balances).filter((b) => b.balances.some((x) => x.bakiye > 0)).length,
      gecmis: Object.values(balances).filter((b) => b.hasOverdue).length,
    };
  }, [balances, rates]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return all
      .filter((x) => !q || [x.firma, x.yetkili, x.telefon, x.vergiNo].some((v) => (v || '').toLocaleLowerCase('tr-TR').includes(q)))
      .filter((x) => {
        const b = balances[x.id];
        if (filter === 'borclu') return !!b?.balances.some((y) => y.bakiye > 0);
        if (filter === 'gecmis') return !!b?.hasOverdue;
        return true;
      })
      .sort((a, b) => (balances[b.id]?.lastTarih || '').localeCompare(balances[a.id]?.lastTarih || '') || a.firma.localeCompare(b.firma, 'tr'));
  }, [all, query, filter, balances]);

  const openNew = () => {
    if (formOpen && !editId) { setFormOpen(false); return; }
    setEditId(''); setForm(EMPTY); setVadeText(''); setFormOpen(true);
  };
  const openEdit = (x: TedarikciT) => {
    setEditId(x.id);
    setForm({ firma: x.firma, yetkili: x.yetkili, telefon: x.telefon, email: x.email, adres: x.adres, vergiNo: x.vergiNo, vergiDairesi: x.vergiDairesi, iban: x.iban, vadeGun: x.vadeGun, notlar: x.notlar });
    setVadeText(x.vadeGun ? String(x.vadeGun) : '');
    setFormOpen(true);
  };
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!activeCompany) return;
    if (!form.firma.trim()) { showToast(tt('errName')); return; }
    setSaving(true);
    try {
      const payload: TedarikciInput = { ...form, companyId: activeCompany.id, vadeGun: Math.max(0, parseInt(vadeText, 10) || 0) };
      if (editId) {
        const upd = await api.updateTedarikci(editId, payload);
        setList((l) => (l || []).map((x) => (x.id === editId ? upd : x)));
      } else {
        const created = await api.createTedarikci(payload);
        setList((l) => [...(l || []), created]);
      }
      setFormOpen(false); setEditId(''); setForm(EMPTY);
      showToast(tt('saved'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const remove = async (x: TedarikciT) => {
    if (!(await confirmAsync(fill(tt('deleteConfirm'), { name: x.firma })))) return;
    try {
      await api.deleteTedarikci(x.id);
      setList((l) => (l || []).filter((y) => y.id !== x.id));
      showToast(tt('deleted'));
    } catch (e: any) { showToast(e?.message || ''); }
  };

  const openCari = (x: TedarikciT) => router.push({ pathname: '/tedarikci-cari', params: { tedarikciId: x.id } } as any);

  if (!activeCompany || restricted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tt('title')} />
        <View style={s.center}><Text style={s.muted}>{restricted ? tt('noStaff') : tt('noCompany')}</Text></View>
      </SafeAreaView>
    );
  }

  const color = theme.colors.modules.tedarikci;
  const unit: [string, string, string] = [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tt('title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero
            icon="cube"
            title={tt('title')}
            subtitle={activeCompany.sirketAdi}
            color={color}
            stats={[
              { label: tt('totalDebt'), value: stats.borc, format: (n) => `₺${compactNumber(n, unit)}`, tone: '#FCA5A5' },
              { label: tt('supplierCount'), value: all.length, tone: '#FDE68A' },
            ]}
          />

          <View style={s.miniRow}>
            {[
              { k: 'borclu', v: stats.borclu, c: '#D97706', icon: 'wallet-outline' as const },
              { k: 'gecmis', v: stats.gecmis, c: theme.colors.red, icon: 'time-outline' as const },
            ].map((x) => (
              <View key={x.k} style={s.miniCard} testID={`ted-stat-${x.k}`}>
                <Ionicons name={x.icon} size={15} color={x.v ? x.c : theme.colors.textMuted} />
                <Text style={[s.miniVal, x.v ? { color: x.c } : null]}>{x.v}</Text>
                <Text style={s.miniLabel} numberOfLines={2}>{tt('stat_' + x.k)}</Text>
              </View>
            ))}
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={[s.actBtn, { backgroundColor: color, borderColor: color }]} onPress={openNew} testID="ted-new">
              <Ionicons name={formOpen && !editId ? 'close' : 'add'} size={16} color="#fff" />
              <Text style={[s.actText, { color: '#fff' }]}>{formOpen && !editId ? tt('cancel') : tt('newSupplier')}</Text>
            </TouchableOpacity>
          </View>

          {formOpen && (
            <Reveal variant="up" distance={12}>
              <View style={s.card} testID="ted-form">
                <Text style={s.cardTitle}>{editId ? tt('editTitle') : tt('newSupplier')}</Text>
                <Text style={s.label}>{upper(tt('firma'))}</Text>
                <MotionInput style={s.input} value={form.firma} onChangeText={set('firma')} placeholder={tt('firmaPh')} placeholderTextColor="#94a3b8" testID="ted-firma" />
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('yetkili'))}</Text>
                    <MotionInput style={s.input} value={form.yetkili} onChangeText={set('yetkili')} testID="ted-yetkili" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('telefon'))}</Text>
                    <MotionInput style={s.input} value={form.telefon} onChangeText={set('telefon')} keyboardType="phone-pad" testID="ted-telefon" />
                  </View>
                </View>
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('email'))}</Text>
                    <MotionInput style={s.input} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" testID="ted-email" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('vadeGun'))}</Text>
                    <MotionInput style={s.input} value={vadeText} onChangeText={(v) => setVadeText(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#94a3b8" testID="ted-vadegun" />
                  </View>
                </View>
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('vergiNo'))}</Text>
                    <MotionInput style={s.input} value={form.vergiNo} onChangeText={set('vergiNo')} testID="ted-vergino" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('vergiDairesi'))}</Text>
                    <MotionInput style={s.input} value={form.vergiDairesi} onChangeText={set('vergiDairesi')} testID="ted-vergidairesi" />
                  </View>
                </View>
                <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('iban'))}</Text>
                <MotionInput style={s.input} value={form.iban} onChangeText={(v) => set('iban')(v.toUpperCase())} autoCapitalize="characters" placeholder="TR00 0000 ..." placeholderTextColor="#94a3b8" testID="ted-iban" />
                <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('adres'))}</Text>
                <MotionInput style={s.input} value={form.adres} onChangeText={set('adres')} testID="ted-adres" />
                <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('not'))}</Text>
                <MotionInput style={s.input} value={form.notlar} onChangeText={set('notlar')} testID="ted-not" />
                <View style={{ marginTop: 14, gap: 8 }}>
                  <BubbleButton icon="checkmark-done" label={saving ? tt('saving') : tt('save')} color={color} size="lg" loading={saving} onPress={save} testID="ted-save" />
                  {editId ? (
                    <TouchableOpacity style={s.ghostBtn} onPress={() => { setFormOpen(false); setEditId(''); }}>
                      <Text style={s.ghostText}>{tt('cancel')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </Reveal>
          )}

          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <MotionInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder={tt('searchPh')} placeholderTextColor="#94a3b8" testID="ted-search" />
          </View>
          <View style={[s.chipRow, { marginTop: 10, marginBottom: 10 }]}>
            {(['tumu', 'borclu', 'gecmis'] as Filter[]).map((fl) => (
              <TouchableOpacity key={fl} style={[s.chip, filter === fl && { backgroundColor: color, borderColor: color }]} onPress={() => setFilter(fl)} testID={`ted-filter-${fl}`}>
                <Text style={[s.chipText, filter === fl && { color: '#fff' }]}>{tt('f_' + fl)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {list == null ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={color} />
          ) : shown.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.muted}>{all.length === 0 ? tt('empty') : tt('emptyFilter')}</Text>
              {all.length === 0 && <Text style={[s.muted, { fontSize: 11.5 }]}>{tt('emptyHint')}</Text>}
            </View>
          ) : (
            shown.map((x, i) => {
              const b = balances[x.id];
              const tint = hashColor(x.firma);
              return (
                <Reveal key={x.id} variant={i % 2 === 0 ? 'left' : 'right'} distance={14}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openCari(x)} style={[s.item, b?.hasOverdue && { borderColor: alpha(theme.colors.red, 0.5) }]} testID={`ted-item-${x.id}`}>
                    <View style={s.itemTop}>
                      <View style={[s.avatar, { backgroundColor: alpha(tint, 0.16) }]}>
                        <Text style={[s.avatarText, { color: tint }]}>{x.firma.trim().charAt(0).toLocaleUpperCase('tr-TR')}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.itemName} numberOfLines={1}>{x.firma}</Text>
                        <Text style={s.meta} numberOfLines={1}>
                          {[x.yetkili, x.telefon].filter(Boolean).join(' · ') || tt('noContact')}
                          {x.vadeGun ? ` · ${fill(tt('vadeGunShort'), { n: x.vadeGun })}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {b && b.balances.length ? b.balances.map((y) => (
                          <Text key={y.paraBirimi} style={[s.amount, { color: y.bakiye > 0 ? theme.colors.red : theme.colors.green }]}>{fmtMoney(y.bakiye, y.paraBirimi)}</Text>
                        )) : <Text style={[s.amount, { color: theme.colors.textMuted }]}>{tt('settled')}</Text>}
                        {b?.hasOverdue ? <Text style={s.overdue}>{tt('overdue')}</Text> : null}
                      </View>
                    </View>
                    <View style={s.itemFoot}>
                      <Text style={s.meta}>{b ? fill(tt('moveCount'), { n: b.count }) : tt('noMoves')}</Text>
                      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => openEdit(x)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ted-${x.id}-edit`}>
                          <Ionicons name="create-outline" size={17} color={theme.colors.textSoft} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => remove(x)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ted-${x.id}-delete`}>
                          <Ionicons name="trash-outline" size={17} color={theme.colors.red} />
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </Reveal>
              );
            })
          )}
          <Text style={s.foot}>{tt('foot')}</Text>
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 10, gap: 2, ...theme.shadow.sm },
  miniVal: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  miniLabel: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actBtn: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  actText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  card: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  cardTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: 10 },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  ghostBtn: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textMuted },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text, borderWidth: 0, backgroundColor: 'transparent' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  emptyBox: { marginTop: 4, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  item: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 10, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '900' },
  itemName: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  amount: { fontSize: 14, fontWeight: '900' },
  overdue: { fontSize: 10, fontWeight: '800', color: theme.colors.redText, marginTop: 2 },
  itemFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.line },
  foot: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
}));

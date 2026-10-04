import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, CustomerT, SessionPackageT } from '@/src/lib/api';
import { openWhatsAppChat } from '@/src/lib/whatsapp';
import { fill, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, alpha, themedStyles } from '@/src/components/motion';

// Seans paketleri: ders/seans paketi sat, her katılımı işle, kalanı takip et.
// Satışta ödendiyse Kasa'ya gelir, "borç" seçildiyse Tahsilat'a borç yazılır.

const COLOR = '#DB2777';
const PAYMENT_METHODS = ['Nakit', 'Kart', 'Havale/EFT'];
const fmt = (n: number) => '₺' + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n || 0);
const trDate = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

function confirmAsync(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
  return new Promise((r) => Alert.alert('', msg, [{ text: translate('seans.cancel'), style: 'cancel', onPress: () => r(false) }, { text: 'OK', style: 'destructive', onPress: () => r(true) }]));
}

type Filter = 'aktif' | 'biten' | 'tumu';

export default function SeansScreen() {
  const { t } = useLanguage();
  const ts = (k: string) => t('seans.' + k);
  const { activeCompany, customers, showToast, reloadKasa, reloadTahsilat } = useApp();
  const { user: me } = useAuth();
  const manager = !me?.is_staff || me?.staff_role === 'admin';
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<SessionPackageT[] | null>(null);
  const [filter, setFilter] = useState<Filter>('aktif');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [f, setF] = useState({ musteriAdi: '', customerId: '', telefon: '', paketAdi: '', toplam: '10', tutar: '', odeme: 'odendi' as 'odendi' | 'borc' | 'yok', yontem: 'Nakit', bitis: '' });
  const [showSuggest, setShowSuggest] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    try { setList(await api.listSessions(activeCompany.id)); } catch (e: any) { showToast(e?.message || ''); setList([]); }
  }, [activeCompany, showToast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toISOString().slice(0, 10);
  const remaining = (p: SessionPackageT) => p.toplamSeans - (p.katilimlar || []).length;
  const expired = (p: SessionPackageT) => !!p.bitis && p.bitis < today;
  const isActive = (p: SessionPackageT) => remaining(p) > 0 && !expired(p);

  const all = list || [];
  const stats = useMemo(() => {
    const month = today.slice(0, 7);
    return {
      aktif: all.filter(isActive).length,
      buAy: all.reduce((s, p) => s + (p.katilimlar || []).filter((k) => (k.tarih || '').startsWith(month)).length, 0),
      azKalan: all.filter((p) => isActive(p) && remaining(p) <= 2).length,
    };
  }, [all, today]);

  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all
      .filter((p) => (filter === 'tumu' ? true : filter === 'aktif' ? isActive(p) : !isActive(p)))
      .filter((p) => !qq || p.musteriAdi.toLowerCase().includes(qq) || p.paketAdi.toLowerCase().includes(qq))
      .sort((a, b) => remaining(a) - remaining(b) || a.musteriAdi.localeCompare(b.musteriAdi, 'tr'));
  }, [all, filter, q]);

  const presets = useMemo(() => Array.from(new Set(all.map((p) => p.paketAdi))).slice(0, 6), [all]);
  const suggestions = useMemo(() => {
    const qq = f.musteriAdi.trim().toLowerCase();
    if (!qq || f.customerId) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(qq)).slice(0, 5);
  }, [f.musteriAdi, f.customerId, customers]);

  if (!activeCompany) {
    return <SafeAreaView style={s.container} edges={['top']}><TopHeader title={ts('title')} /></SafeAreaView>;
  }

  const save = async () => {
    const toplam = Number(f.toplam);
    const tutar = Number(f.tutar.replace(',', '.')) || 0;
    if (!f.musteriAdi.trim() || !f.paketAdi.trim()) { showToast(ts('errRequired')); return; }
    if (!(toplam >= 1)) { showToast(ts('errCount')); return; }
    setSaving(true);
    try {
      const p = await api.createSession({
        companyId: activeCompany.id, customerId: f.customerId, musteriAdi: f.musteriAdi.trim(), telefon: f.telefon, paketAdi: f.paketAdi.trim(),
        toplamSeans: toplam, tutar, paraBirimi: 'TRY', odeme: tutar > 0 ? f.odeme : 'yok', yontem: f.yontem, baslangic: today, bitis: f.bitis, notlar: '',
      });
      setList((l) => [p, ...(l || [])]);
      if (tutar > 0) { reloadKasa().catch(() => {}); reloadTahsilat().catch(() => {}); }
      setFormOpen(false);
      setF({ musteriAdi: '', customerId: '', telefon: '', paketAdi: f.paketAdi, toplam: f.toplam, tutar: f.tutar, odeme: 'odendi', yontem: 'Nakit', bitis: '' });
      showToast(ts('saved'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const attend = async (p: SessionPackageT) => {
    setBusy(p.id);
    try {
      const u = await api.attendSession(p.id);
      setList((l) => (l || []).map((x) => (x.id === p.id ? u : x)));
      showToast(fill(ts('attended'), { n: remaining(u) }));
    } catch (e: any) { showToast(e?.message || ''); } finally { setBusy(''); }
  };
  const undo = async (p: SessionPackageT) => {
    const last = (p.katilimlar || [])[p.katilimlar.length - 1];
    if (!last || !(await confirmAsync(fill(ts('undoConfirm'), { d: trDate(last.tarih) })))) return;
    try { const u = await api.undoAttend(p.id, last.id); setList((l) => (l || []).map((x) => (x.id === p.id ? u : x))); } catch (e: any) { showToast(e?.message || ''); }
  };
  const remove = async (p: SessionPackageT) => {
    if (!(await confirmAsync(ts('deleteConfirm')))) return;
    try { await api.deleteSession(p.id); setList((l) => (l || []).filter((x) => x.id !== p.id)); reloadKasa().catch(() => {}); reloadTahsilat().catch(() => {}); }
    catch (e: any) { showToast(e?.message || ''); }
  };
  const remind = (p: SessionPackageT) => openWhatsAppChat(p.telefon, fill(ts('remindMsg'), {
    name: p.musteriAdi, paket: p.paketAdi, n: remaining(p), company: activeCompany.sirketAdi || '',
  }));

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={ts('title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero icon="fitness" title={ts('title')} subtitle={activeCompany.sirketAdi} color={COLOR}
            stats={[{ label: ts('active'), value: stats.aktif }, { label: ts('thisMonth'), value: stats.buAy, tone: '#F9A8D4' }, { label: ts('almostDone'), value: stats.azKalan, tone: '#FCD34D' }]} />

          {manager && (
            <TouchableOpacity style={[s.addBtn, formOpen ? { backgroundColor: theme.colors.surface } : { backgroundColor: COLOR }]} onPress={() => setFormOpen((o) => !o)} testID="seans-new">
              <Ionicons name={formOpen ? 'close' : 'add'} size={17} color={formOpen ? COLOR : '#fff'} />
              <Text style={[s.addText, { color: formOpen ? COLOR : '#fff' }]}>{formOpen ? ts('cancel') : ts('new')}</Text>
            </TouchableOpacity>
          )}

          {formOpen && (
            <View style={s.card} testID="seans-form">
              <View style={s.row2}>
                <View style={{ flex: 1.4, zIndex: 10 }}>
                  <Text style={s.label}>{upper(ts('customer'))}</Text>
                  <MotionInput style={s.input} value={f.musteriAdi} onChangeText={(v) => { setF({ ...f, musteriAdi: v, customerId: '' }); setShowSuggest(true); }} onBlur={() => setTimeout(() => setShowSuggest(false), 150)} testID="seans-musteri" />
                  {showSuggest && suggestions.length > 0 && (
                    <View style={s.suggestBox}>
                      {suggestions.map((c: CustomerT) => (
                        <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => { setF({ ...f, musteriAdi: c.firma, customerId: c.id, telefon: c.telefon || f.telefon }); setShowSuggest(false); }}>
                          <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(ts('phone'))}</Text>
                  <MotionInput style={s.input} value={f.telefon} keyboardType="phone-pad" onChangeText={(v) => setF({ ...f, telefon: v })} />
                </View>
              </View>
              <Text style={[s.label, { marginTop: 10 }]}>{upper(ts('package'))}</Text>
              <MotionInput style={s.input} value={f.paketAdi} onChangeText={(v) => setF({ ...f, paketAdi: v })} placeholder={ts('packagePh')} placeholderTextColor="#94a3b8" testID="seans-paket" />
              {presets.length > 0 && (
                <View style={s.chips}>{presets.map((x) => <TouchableOpacity key={x} style={s.chip} onPress={() => setF({ ...f, paketAdi: x })}><Text style={s.chipText}>{x}</Text></TouchableOpacity>)}</View>
              )}
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(ts('count'))}</Text>
                  <MotionInput style={s.input} value={f.toplam} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, toplam: v.replace(/\D/g, '') })} testID="seans-toplam" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(ts('price'))}</Text>
                  <MotionInput style={s.input} value={f.tutar} keyboardType="decimal-pad" onChangeText={(v) => setF({ ...f, tutar: v })} placeholder="0" placeholderTextColor="#94a3b8" testID="seans-tutar" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(ts('expires'))}</Text>
                  <MotionInput style={s.input} value={f.bitis} onChangeText={(v) => setF({ ...f, bitis: v })} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" />
                </View>
              </View>
              {Number(f.tutar) > 0 && (
                <>
                  <Text style={[s.label, { marginTop: 10 }]}>{upper(ts('payment'))}</Text>
                  <View style={s.chips}>
                    {(['odendi', 'borc'] as const).map((o) => (
                      <TouchableOpacity key={o} style={[s.chip, f.odeme === o && { backgroundColor: COLOR, borderColor: COLOR }]} onPress={() => setF({ ...f, odeme: o })} testID={`seans-odeme-${o}`}>
                        <Text style={[s.chipText, f.odeme === o && { color: '#fff' }]}>{ts('p_' + o)}</Text>
                      </TouchableOpacity>
                    ))}
                    {f.odeme === 'odendi' && PAYMENT_METHODS.map((y) => (
                      <TouchableOpacity key={y} style={[s.chip, f.yontem === y && { borderColor: COLOR }]} onPress={() => setF({ ...f, yontem: y })}>
                        <Text style={[s.chipText, f.yontem === y && { color: theme.colors.text }]}>{y}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <BubbleButton icon="checkmark-done" label={saving ? ts('saving') : ts('sell')} color={COLOR} size="lg" loading={saving} onPress={save} testID="seans-save" />
            </View>
          )}

          <View style={[s.chips, { marginTop: 14 }]}>
            {(['aktif', 'biten', 'tumu'] as Filter[]).map((x) => (
              <TouchableOpacity key={x} style={[s.chip, filter === x && { backgroundColor: COLOR, borderColor: COLOR }]} onPress={() => setFilter(x)} testID={`seans-filter-${x}`}>
                <Text style={[s.chipText, filter === x && { color: '#fff' }]}>{ts('f_' + x)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <MotionInput style={[s.input, { marginTop: 8 }]} value={q} onChangeText={setQ} placeholder={ts('search')} placeholderTextColor="#94a3b8" />

          {list == null ? <ActivityIndicator style={{ marginTop: 24 }} color={COLOR} /> : shown.length === 0 ? (
            <View style={s.empty}><Ionicons name="fitness-outline" size={30} color={theme.colors.textMuted} /><Text style={s.muted}>{ts('empty')}</Text></View>
          ) : shown.map((p) => {
            const used = (p.katilimlar || []).length;
            const left = p.toplamSeans - used;
            const exp = expired(p);
            const last = [...(p.katilimlar || [])].slice(-3).reverse();
            return (
              <View key={p.id} style={[s.item, left <= 2 && left > 0 && !exp && { borderColor: alpha('#F59E0B', 0.6) }]} testID={`seans-${p.id}`}>
                <View style={s.itemTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.name} numberOfLines={1}>{p.musteriAdi}</Text>
                    <Text style={s.meta} numberOfLines={1}>{p.paketAdi}{p.tutar ? ` · ${fmt(p.tutar)}${p.odeme === 'borc' ? ` (${ts('p_borc')})` : ''}` : ''}{p.bitis ? ` · ${exp ? ts('expired') : fill(ts('until'), { d: trDate(p.bitis) })}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.left, { color: left === 0 || exp ? theme.colors.textMuted : left <= 2 ? '#D97706' : COLOR }]}>{left}</Text>
                    <Text style={s.leftLabel}>{ts('left')}</Text>
                  </View>
                </View>
                <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, (used / p.toplamSeans) * 100)}%`, backgroundColor: COLOR }]} /></View>
                <Text style={s.meta}>{fill(ts('used'), { u: used, t: p.toplamSeans })}{last.length ? ` · ${ts('last')}: ${last.map((k) => trDate(k.tarih)).join(', ')}` : ''}</Text>
                <View style={s.actions}>
                  {left > 0 && !exp ? (
                    <TouchableOpacity style={[s.attBtn, { backgroundColor: COLOR }]} onPress={() => attend(p)} disabled={busy === p.id} testID={`seans-${p.id}-attend`}>
                      {busy === p.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={15} color="#fff" />}
                      <Text style={s.attText}>{ts('attend')}</Text>
                    </TouchableOpacity>
                  ) : <Text style={[s.meta, { marginTop: 0 }]}>{exp ? ts('expired') : ts('finished')}</Text>}
                  {used > 0 && <TouchableOpacity onPress={() => undo(p)} style={s.iconBtn} testID={`seans-${p.id}-undo`}><Ionicons name="arrow-undo-outline" size={17} color={theme.colors.textSoft} /></TouchableOpacity>}
                  <View style={{ flex: 1 }} />
                  {p.telefon ? <TouchableOpacity onPress={() => remind(p)} style={s.iconBtn}><Ionicons name="logo-whatsapp" size={18} color="#16A34A" /></TouchableOpacity> : null}
                  {manager && <TouchableOpacity onPress={() => remove(p)} style={s.iconBtn} testID={`seans-${p.id}-delete`}><Ionicons name="trash-outline" size={17} color={theme.colors.red} /></TouchableOpacity>}
                </View>
              </View>
            );
          })}
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  muted: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: COLOR },
  addText: { fontSize: 13, fontWeight: '800' },
  card: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  suggestBox: { position: 'absolute', top: 64, left: 0, right: 0, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.md, overflow: 'hidden' },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  suggestName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  empty: { marginTop: 14, alignItems: 'center', gap: 8, padding: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, backgroundColor: theme.colors.surface },
  item: { marginTop: 10, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 12, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  left: { fontSize: 22, fontWeight: '900' },
  leftLabel: { fontSize: 9.5, fontWeight: '800', color: theme.colors.textMuted },
  bar: { height: 7, borderRadius: 4, backgroundColor: theme.colors.surfaceSoft, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  attBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9 },
  attText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
  iconBtn: { padding: 6 },
}));

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, CekDurum, CekSenetT, CekTur, CekYon, CustomerT, RatesT } from '@/src/lib/api';
import { currentRateFor, sumToTRY } from '@/src/lib/tahsilat-utils';
import { CEK_DURUMLAR, addDays, cekSenetCsv, daysUntil, isOpen, localToday, rowsToCekSenet } from '@/src/lib/cek-senet';
import { pickSheetRows } from '@/src/lib/customer-import';
import { saveTextFile } from '@/src/lib/save-text';
import { openWhatsAppChat } from '@/src/lib/whatsapp';
import { fill, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, Reveal, ScreenHero, alpha, compactNumber, themedStyles } from '@/src/components/motion';

// Çek & Senet portföyü: alınan (müşteriden, tahsil edilecek) ve verilen
// (tedarikçiye, ödenecek) vadeli evraklar. "Ödendi" durumu Kasa'ya, "borçtan
// düş" seçeneği Tahsilat'a backend tarafında otomatik yansır (bkz. server.py
// _sync_cek_links); bu yüzden durum değişince Kasa/Tahsilat da tazelenir.

const CURRENCIES = ['TRY', 'USD', 'EUR'];
type Filter = 'acik' | CekDurum | 'tumu';

function fmt(n: number, cur: string = 'TRY') {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}
const trDate = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

const DURUM_TONE: Record<CekDurum, { fg: () => string; bg: () => string }> = {
  portfoy: { fg: () => theme.colors.primary, bg: () => theme.colors.primarySoft },
  tahsilde: { fg: () => '#B45309', bg: () => alpha('#F59E0B', 0.16) },
  odendi: { fg: () => theme.colors.greenText, bg: () => theme.colors.greenSoft },
  karsiliksiz: { fg: () => theme.colors.redText, bg: () => theme.colors.redSoft },
  ciro: { fg: () => theme.colors.textSoft, bg: () => theme.colors.surfaceSoft },
};

function confirmAsync(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
  return new Promise((resolve) => Alert.alert('', msg, [
    { text: translate('cek.cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
  ]));
}

export default function CekSenetScreen() {
  const { t } = useLanguage();
  const tc = (k: string) => t('cek.' + k);
  const { activeCompany, customers, showToast, reloadKasa, reloadTahsilat } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();

  const [list, setList] = useState<CekSenetT[] | null>(null);
  const [rates, setRates] = useState<RatesT | null>(null);
  const [yonTab, setYonTab] = useState<CekYon>('alinan');
  const [filter, setFilter] = useState<Filter>('acik');
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [ciroFor, setCiroFor] = useState<string>('');
  const [ciroName, setCiroName] = useState('');

  // form
  const [yon, setYon] = useState<CekYon>('alinan');
  const [tur, setTur] = useState<CekTur>('cek');
  const [kesideci, setKesideci] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [telefon, setTelefon] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [vade, setVade] = useState('');
  const [banka, setBanka] = useState('');
  const [no, setNo] = useState('');
  const [notlar, setNotlar] = useState('');
  const [cariDus, setCariDus] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany || restricted) return;
    try { setList(await api.listCekSenet(activeCompany.id)); } catch (e: any) { showToast(e?.message || ''); setList([]); }
  }, [activeCompany, restricted, showToast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { api.rates().then(setRates).catch(() => {}); }, []);

  const today = localToday();
  const all = list || [];

  const stats = useMemo(() => {
    const open = all.filter(isOpen);
    const sum = (y: CekYon) => sumToTRY(open.filter((d) => d.yon === y), rates) ?? 0;
    return {
      alinan: sum('alinan'),
      verilen: sum('verilen'),
      due7: open.filter((d) => { const n = daysUntil(d.vadeTarihi, today); return n >= 0 && n <= 7; }).length,
      overdue: open.filter((d) => daysUntil(d.vadeTarihi, today) < 0).length,
      bounced: all.filter((d) => d.durum === 'karsiliksiz').length,
    };
  }, [all, rates, today]);

  const shown = useMemo(() => {
    const byYon = all.filter((d) => d.yon === yonTab);
    const f = filter === 'tumu' ? byYon : filter === 'acik' ? byYon.filter(isOpen) : byYon.filter((d) => d.durum === filter);
    return [...f].sort((a, b) => (isOpen(a) === isOpen(b) ? a.vadeTarihi.localeCompare(b.vadeTarihi) : isOpen(a) ? -1 : 1));
  }, [all, yonTab, filter]);

  const countFor = (fl: Filter) => {
    const byYon = all.filter((d) => d.yon === yonTab);
    return fl === 'tumu' ? byYon.length : fl === 'acik' ? byYon.filter(isOpen).length : byYon.filter((d) => d.durum === fl).length;
  };

  const suggestions = useMemo(() => {
    const q = kesideci.trim().toLowerCase();
    if (!q || customerId) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(q)).slice(0, 6);
  }, [kesideci, customers, customerId]);

  const pickCustomer = (c: CustomerT) => {
    setKesideci(c.firma); setCustomerId(c.id); setTelefon(c.telefon || ''); setShowSuggest(false);
  };

  const resetForm = () => {
    setKesideci(''); setCustomerId(''); setTelefon(''); setTutar(''); setVade(''); setBanka(''); setNo(''); setNotlar(''); setCariDus(true);
  };

  const refreshLinked = () => { reloadKasa().catch(() => {}); reloadTahsilat().catch(() => {}); };

  const save = async () => {
    if (!activeCompany) return;
    const amount = Number(tutar.replace(',', '.'));
    if (!kesideci.trim()) { showToast(tc('errName')); return; }
    if (!(amount > 0)) { showToast(tc('errAmount')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vade)) { showToast(tc('errDate')); return; }
    setSaving(true);
    try {
      const created = await api.createCekSenet({
        companyId: activeCompany.id, yon, tur, customerId, kesideci: kesideci.trim(), telefon, tutar: amount, paraBirimi,
        vadeTarihi: vade, banka, no, durum: 'portfoy', ciroEdilen: '', cariDus: yon === 'alinan' && cariDus && !!customerId,
        notlar, kurTRY: currentRateFor(paraBirimi, rates),
      });
      setList((l) => [...(l || []), created]);
      if (created.cariDus) refreshLinked();
      setYonTab(yon); setFilter('acik');
      resetForm(); setFormOpen(false);
      showToast(tc('saved'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const setDurum = async (d: CekSenetT, durum: CekDurum, ciroEdilen = '') => {
    if (durum === d.durum && durum !== 'ciro') return;
    if (durum === 'ciro' && !ciroEdilen) { setCiroFor(d.id); setCiroName(d.ciroEdilen || ''); return; }
    setBusy(d.id);
    try {
      const upd = await api.updateCekSenet(d.id, { durum, ciroEdilen });
      setList((l) => (l || []).map((x) => (x.id === d.id ? upd : x)));
      setCiroFor('');
      if (durum === 'odendi' || d.durum === 'odendi' || d.cariDus) refreshLinked();
    } catch (e: any) { showToast(e?.message || ''); } finally { setBusy(''); }
  };

  const remove = async (d: CekSenetT) => {
    if (!(await confirmAsync(tc('deleteConfirm')))) return;
    try {
      await api.deleteCekSenet(d.id);
      setList((l) => (l || []).filter((x) => x.id !== d.id));
      refreshLinked();
      showToast(tc('deleted'));
    } catch (e: any) { showToast(e?.message || ''); }
  };

  const remind = (d: CekSenetT) => {
    const msg = fill(tc('remindMsg'), {
      name: d.kesideci, vade: trDate(d.vadeTarihi), tur: tc(d.tur).toLocaleLowerCase('tr-TR') + (d.no ? ` #${d.no}` : ''),
      tutar: fmt(d.tutar, d.paraBirimi), company: activeCompany?.sirketAdi || '',
    });
    openWhatsAppChat(d.telefon, msg);
  };

  const doExport = async () => {
    if (!all.length) { showToast(tc('exportEmpty')); return; }
    try { await saveTextFile(cekSenetCsv(all), `Cek_Senet_${today}.csv`, 'text/csv'); showToast(tc('exportDone')); } catch (e: any) { showToast(e?.message || ''); }
  };

  const doImport = async () => {
    if (!activeCompany) return;
    try {
      const picked = await pickSheetRows();
      if (!picked) return;
      const parsed = rowsToCekSenet(picked.rows, yonTab);
      if (!parsed) { showToast(tc('importBadHeader')); return; }
      if (!parsed.items.length) { showToast(tc('importEmpty')); return; }
      setBusy('import');
      const res = await api.importCekSenet(activeCompany.id, parsed.items);
      await load();
      refreshLinked();
      const skipped = parsed.skipped + res.errors.length;
      showToast(fill(tc('importDone'), { n: res.imported }) + (skipped ? ` · ${fill(tc('importSkipped'), { n: skipped })}` : ''));
    } catch (e: any) { showToast(e?.message || ''); } finally { setBusy(''); }
  };

  if (!activeCompany || restricted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tc('title')} />
        <View style={s.center}><Text style={s.muted}>{restricted ? tc('noStaff') : tc('noCompany')}</Text></View>
      </SafeAreaView>
    );
  }

  const color = theme.colors.modules.cek;
  const unit: [string, string, string] = [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tc('title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero
            icon="documents"
            title={tc('title')}
            subtitle={activeCompany.sirketAdi}
            color={color}
            stats={[
              { label: tc('alinanLong'), value: stats.alinan, format: (n) => `₺${compactNumber(n, unit)}`, tone: '#86EFAC' },
              { label: tc('verilenLong'), value: stats.verilen, format: (n) => `₺${compactNumber(n, unit)}`, tone: '#FCA5A5' },
            ]}
          />

          <View style={s.miniRow}>
            {[
              { k: 'due7', v: stats.due7, c: '#D97706', icon: 'alarm-outline' as const },
              { k: 'overdue', v: stats.overdue, c: theme.colors.red, icon: 'time-outline' as const },
              { k: 'bounced', v: stats.bounced, c: theme.colors.red, icon: 'alert-circle-outline' as const },
            ].map((x) => (
              <View key={x.k} style={s.miniCard} testID={`cek-stat-${x.k}`}>
                <Ionicons name={x.icon} size={15} color={x.v ? x.c : theme.colors.textMuted} />
                <Text style={[s.miniVal, x.v ? { color: x.c } : null]}>{x.v}</Text>
                <Text style={s.miniLabel} numberOfLines={2}>{tc(x.k)}</Text>
              </View>
            ))}
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={[s.actBtn, { backgroundColor: color, borderColor: color }]} onPress={() => setFormOpen((o) => !o)} testID="cek-new">
              <Ionicons name={formOpen ? 'close' : 'add'} size={16} color="#fff" />
              <Text style={[s.actText, { color: '#fff' }]}>{formOpen ? tc('cancel') : tc('newRec')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actBtn} onPress={doImport} disabled={busy === 'import'} testID="cek-import">
              {busy === 'import' ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.text} />}
              <Text style={s.actText}>{tc('import')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actBtn} onPress={doExport} testID="cek-export">
              <Ionicons name="download-outline" size={16} color={theme.colors.text} />
              <Text style={s.actText}>{tc('export')}</Text>
            </TouchableOpacity>
          </View>

          {formOpen && (
            <View style={s.card} testID="cek-form">
              <Text style={s.label}>{upper(tc('yonLabel'))}</Text>
              <View style={s.segRow}>
                {(['alinan', 'verilen'] as CekYon[]).map((y) => (
                  <TouchableOpacity key={y} style={[s.segBtn, yon === y && (y === 'alinan' ? s.segGreen : s.segRed)]} onPress={() => setYon(y)} testID={`cek-yon-${y}`}>
                    <Text style={[s.segText, yon === y && { color: y === 'alinan' ? theme.colors.greenText : theme.colors.redText }]}>{tc(y === 'alinan' ? 'alinanLong' : 'verilenLong')}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { marginTop: 10 }]}>{upper(tc('turLabel'))}</Text>
              <View style={s.segRow}>
                {(['cek', 'senet'] as CekTur[]).map((x) => (
                  <TouchableOpacity key={x} style={[s.segBtn, tur === x && { backgroundColor: alpha(color, 0.14), borderColor: color }]} onPress={() => setTur(x)} testID={`cek-tur-${x}`}>
                    <Text style={[s.segText, tur === x && { color: theme.colors.text }]}>{tc(x)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { marginTop: 10 }]}>{upper(tc(yon === 'alinan' ? 'kesideciAlinan' : 'kesideciVerilen'))}</Text>
              <View style={{ zIndex: 20 }}>
                <MotionInput
                  style={s.input} value={kesideci} placeholder={tc('kesPh')} placeholderTextColor="#94a3b8"
                  onChangeText={(v) => { setKesideci(v); setCustomerId(''); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)} onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  testID="cek-kesideci"
                />
                {showSuggest && suggestions.length > 0 && (
                  <View style={s.suggestBox}>
                    {suggestions.map((c) => (
                      <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => pickCustomer(c)}>
                        <Ionicons name="person-outline" size={14} color={theme.colors.primary} />
                        <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                        {c.telefon ? <Text style={s.suggestSub}>{c.telefon}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={s.row2}>
                <View style={{ flex: 1.3 }}>
                  <Text style={s.label}>{upper(tc('tutar'))}</Text>
                  <MotionInput style={s.input} keyboardType="decimal-pad" value={tutar} onChangeText={setTutar} placeholder="0" placeholderTextColor="#94a3b8" testID="cek-tutar" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tc('pb'))}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {CURRENCIES.map((c) => (
                      <TouchableOpacity key={c} style={[s.curChip, paraBirimi === c && { backgroundColor: color, borderColor: color }]} onPress={() => setParaBirimi(c)}>
                        <Text style={[s.curText, paraBirimi === c && { color: '#fff' }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={[s.label, { marginTop: 10 }]}>{upper(tc('vade'))}</Text>
              <MotionInput style={s.input} value={vade} onChangeText={setVade} placeholder={tc('vadePh')} placeholderTextColor="#94a3b8" testID="cek-vade" />
              <View style={[s.chipRow, { marginTop: 6 }]}>
                {[30, 60, 90, 120].map((n) => (
                  <TouchableOpacity key={n} style={s.chip} onPress={() => setVade(addDays(today, n))}>
                    <Text style={s.chipText}>+{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tc('banka'))}</Text>
                  <MotionInput style={s.input} value={banka} onChangeText={setBanka} testID="cek-banka" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tc('no'))}</Text>
                  <MotionInput style={s.input} value={no} onChangeText={setNo} testID="cek-no" />
                </View>
              </View>
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tc('telefon'))}</Text>
                  <MotionInput style={s.input} value={telefon} onChangeText={setTelefon} keyboardType="phone-pad" testID="cek-telefon" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tc('not'))}</Text>
                  <MotionInput style={s.input} value={notlar} onChangeText={setNotlar} testID="cek-not" />
                </View>
              </View>

              {yon === 'alinan' && !!customerId && (
                <TouchableOpacity style={s.checkRow} onPress={() => setCariDus((v) => !v)} testID="cek-caridus">
                  <Ionicons name={cariDus ? 'checkbox' : 'square-outline'} size={20} color={cariDus ? color : theme.colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.checkTitle}>{tc('cariDus')}</Text>
                    <Text style={s.checkHint}>{tc('cariDusHint')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              <BubbleButton icon="checkmark-done" label={saving ? tc('saving') : tc('save')} color={color} size="lg" loading={saving} onPress={save} testID="cek-save" />
            </View>
          )}

          <View style={[s.segRow, { marginTop: 18 }]}>
            {(['alinan', 'verilen'] as CekYon[]).map((y) => (
              <TouchableOpacity key={y} style={[s.tab, yonTab === y && { borderBottomColor: color }]} onPress={() => setYonTab(y)} testID={`cek-tab-${y}`}>
                <Text style={[s.tabText, yonTab === y && { color: theme.colors.text }]}>{tc(y === 'alinan' ? 'alinanLong' : 'verilenLong')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[s.chipRow, { marginTop: 10, marginBottom: 10 }]}>
            {(['acik', ...CEK_DURUMLAR, 'tumu'] as Filter[]).map((fl) => (
              <TouchableOpacity key={fl} style={[s.chip, filter === fl && { backgroundColor: color, borderColor: color }]} onPress={() => setFilter(fl)} testID={`cek-filter-${fl}`}>
                <Text style={[s.chipText, filter === fl && { color: '#fff' }]}>
                  {fl === 'acik' ? tc('f_acik') : fl === 'tumu' ? tc('f_tumu') : tc('d_' + fl)} · {countFor(fl)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {list == null ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={color} />
          ) : shown.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="documents-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.muted}>{tc('empty')}</Text>
              {all.length === 0 && <Text style={[s.muted, { fontSize: 11.5 }]}>{tc('emptyHint')}</Text>}
            </View>
          ) : (
            shown.map((d, i) => {
              const n = daysUntil(d.vadeTarihi, today);
              const open = isOpen(d);
              const tone = DURUM_TONE[d.durum];
              return (
                <Reveal key={d.id} variant={i % 2 === 0 ? 'left' : 'right'} distance={14}>
                  <View style={[s.item, d.durum === 'karsiliksiz' && { borderColor: theme.colors.red }, open && n < 0 && { borderColor: alpha(theme.colors.red, 0.5) }]} testID={`cek-item-${d.id}`}>
                    <View style={s.itemTop}>
                      <View style={[s.turBadge, { backgroundColor: alpha(color, 0.14) }]}><Text style={[s.turBadgeText, { color }]}>{upper(tc(d.tur))}</Text></View>
                      <Text style={s.itemName} numberOfLines={1}>{d.kesideci}</Text>
                      <View style={[s.durumBadge, { backgroundColor: tone.bg() }]}><Text style={[s.durumText, { color: tone.fg() }]}>{tc('d_' + d.durum)}</Text></View>
                      <Text style={[s.amount, { color: d.yon === 'alinan' ? theme.colors.green : theme.colors.red }]} numberOfLines={1}>{fmt(d.tutar, d.paraBirimi)}</Text>
                    </View>
                    <Text style={s.meta}>
                      {tc('vade')}: {trDate(d.vadeTarihi)}{d.banka ? ` · ${d.banka}` : ''}{d.no ? ` · No: ${d.no}` : ''}
                      {open ? (
                        <Text style={{ color: n < 0 ? theme.colors.red : n <= 7 ? '#D97706' : theme.colors.textMuted, fontWeight: '800' }}>
                          {' · '}{n === 0 ? tc('dueToday') : n < 0 ? fill(tc('daysPast'), { n: -n }) : fill(tc('daysLeft'), { n })}
                        </Text>
                      ) : null}
                    </Text>
                    {d.durum === 'ciro' && d.ciroEdilen ? <Text style={s.meta}>{fill(tc('ciroLabel'), { name: d.ciroEdilen })}</Text> : null}
                    {d.notlar ? <Text style={s.meta} numberOfLines={2}>{d.notlar}</Text> : null}

                    <View style={[s.chipRow, { marginTop: 8 }]}>
                      {CEK_DURUMLAR.map((st) => (
                        <TouchableOpacity key={st} disabled={busy === d.id} style={[s.stChip, d.durum === st && { backgroundColor: DURUM_TONE[st].bg(), borderColor: DURUM_TONE[st].fg() }]} onPress={() => setDurum(d, st)} testID={`cek-${d.id}-st-${st}`}>
                          <Text style={[s.stText, d.durum === st && { color: DURUM_TONE[st].fg() }]}>{tc('d_' + st)}</Text>
                        </TouchableOpacity>
                      ))}
                      {busy === d.id && <ActivityIndicator size="small" color={color} />}
                    </View>

                    {ciroFor === d.id && (
                      <View style={[s.row2, { alignItems: 'flex-end' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.label}>{upper(tc('ciroTo'))}</Text>
                          <MotionInput style={s.input} value={ciroName} onChangeText={setCiroName} placeholder={tc('ciroPh')} placeholderTextColor="#94a3b8" testID={`cek-${d.id}-ciro-input`} />
                        </View>
                        <TouchableOpacity style={[s.actBtn, { backgroundColor: color, borderColor: color, flex: 0 }]} onPress={() => ciroName.trim() && setDurum(d, 'ciro', ciroName.trim())} testID={`cek-${d.id}-ciro-save`}>
                          <Text style={[s.actText, { color: '#fff' }]}>{tc('save')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.actBtn, { flex: 0 }]} onPress={() => setCiroFor('')}>
                          <Text style={s.actText}>{tc('cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={s.itemFoot}>
                      {d.yon === 'alinan' && (open || d.durum === 'karsiliksiz') && d.telefon ? (
                        <TouchableOpacity style={s.remindBtn} onPress={() => remind(d)} testID={`cek-${d.id}-remind`}>
                          <Ionicons name="logo-whatsapp" size={14} color="#16A34A" />
                          <Text style={s.remindText}>{tc('remind')}</Text>
                        </TouchableOpacity>
                      ) : <View />}
                      <TouchableOpacity onPress={() => remove(d)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`cek-${d.id}-delete`}>
                        <Ionicons name="trash-outline" size={17} color={theme.colors.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Reveal>
              );
            })
          )}

          {stats.bounced > 0 && (
            <View style={s.warn}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.redText} />
              <Text style={s.warnText}>{fill(tc('bouncedWarn'), { n: stats.bounced })}</Text>
            </View>
          )}
          <Text style={s.foot}>{tc('paidNote')}</Text>
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
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', backgroundColor: theme.colors.surface },
  segGreen: { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' },
  segRed: { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.red },
  segText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textMuted },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  curChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface, alignItems: 'center' },
  curText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  suggestBox: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.md, maxHeight: 220, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  suggestName: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  suggestSub: { fontSize: 10.5, color: theme.colors.textMuted },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  checkTitle: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  checkHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, lineHeight: 15 },
  emptyBox: { marginTop: 4, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  item: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 10, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  turBadgeText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.4 },
  itemName: { flexShrink: 1, fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  durumBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durumText: { fontSize: 9.5, fontWeight: '800' },
  amount: { marginLeft: 'auto', fontSize: 14, fontWeight: '900' },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  stChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
  stText: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textMuted },
  itemFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  remindBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: alpha('#16A34A', 0.12) },
  remindText: { fontSize: 11.5, fontWeight: '800', color: '#16A34A' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: theme.colors.redSoft },
  warnText: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.redText },
  foot: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
}));

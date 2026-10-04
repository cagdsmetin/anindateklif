import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, CustomerT, RentPaymentT, RentTip, RentUnitInput, RentUnitT } from '@/src/lib/api';
import { addMonths, daysToEnd, overdue, periodStatus, unitAmount, ym } from '@/src/lib/rent';
import { openWhatsAppChat } from '@/src/lib/whatsapp';
import { fill, getLang, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, alpha, compactNumber, themedStyles } from '@/src/components/motion';

// Kira Takibi ve Site & Aidat ekranlarının ortak gövdesi (tip ile ayrışır).
// Her birim için seçili ayın durumu, son 12 ay, gecikmiş toplam; "Ödendi"
// backend'de Kasa'ya gelir yazar (bkz. server.py pay_rent).

const fmt = (n: number, cur = 'TRY') =>
  (cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺') + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);

function monthLabel(donem: string) {
  const [y, m] = donem.split('-').map(Number);
  const lang = getLang();
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'it' ? 'it-IT' : 'en-GB', { month: 'long', year: 'numeric' });
}

function confirmAsync(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
  return new Promise((r) => Alert.alert('', msg, [{ text: translate('rent.cancel'), style: 'cancel', onPress: () => r(false) }, { text: 'OK', style: 'destructive', onPress: () => r(true) }]));
}

const EMPTY = (companyId: string, tip: RentTip): RentUnitInput => ({
  companyId, tip, grup: tip === 'kira' ? 'İşyeri' : '', ad: '', kisi: '', telefon: '', customerId: '', tutar: 0, paraBirimi: 'TRY',
  gun: 5, baslangic: new Date().toISOString().slice(0, 10), bitis: '', artisOrani: 0, depozito: 0, notlar: '', aktif: true,
});

export default function RentModule({ tip }: { tip: RentTip }) {
  const { t } = useLanguage();
  const tr = (k: string) => t('rent.' + k);
  const tt = (k: string) => t(`rent.${tip}_${k}`);
  const { activeCompany, customers, showToast, reloadKasa, addKasaEntry, kasa } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();
  const color = tip === 'kira' ? '#0F766E' : '#7C3AED';

  const [units, setUnits] = useState<RentUnitT[] | null>(null);
  const [pays, setPays] = useState<RentPaymentT[]>([]);
  const [donem, setDonem] = useState(ym(new Date()));
  const [grup, setGrup] = useState('');
  const [form, setForm] = useState<(RentUnitInput & { id?: string }) | null>(null);
  const [tutarStr, setTutarStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [gider, setGider] = useState<{ tutar: string; not: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany || restricted) return;
    try { const r = await api.listRent(activeCompany.id, tip); setUnits(r.units); setPays(r.payments); }
    catch (e: any) { showToast(e?.message || ''); setUnits([]); }
  }, [activeCompany, restricted, tip, showToast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const payIndex = useMemo(() => {
    const m: Record<string, Record<string, RentPaymentT>> = {};
    pays.forEach((p) => { (m[p.unitId] = m[p.unitId] || {})[p.donem] = p; });
    return m;
  }, [pays]);

  const groups = useMemo(() => Array.from(new Set((units || []).map((u) => u.grup).filter(Boolean))).sort(), [units]);
  const shown = useMemo(() => (units || []).filter((u) => !grup || u.grup === grup).sort((a, b) => (a.grup + a.ad).localeCompare(b.grup + b.ad, 'tr')), [units, grup]);

  const stats = useMemo(() => {
    let beklenen = 0, tahsil = 0, gecikmis = 0, gecikmisAdet = 0, bitiyor = 0;
    shown.forEach((u) => {
      const p = payIndex[u.id] || {};
      const st = periodStatus(u, donem, p[donem]);
      if (st !== 'none') beklenen += p[donem]?.tutar ?? unitAmount(u, donem);
      if (st === 'paid') tahsil += p[donem].tutar;
      const o = overdue(u, new Set(Object.keys(p)));
      gecikmis += o.toplam; gecikmisAdet += o.donemler.length;
      const d = daysToEnd(u);
      if (d != null && d >= 0 && d <= 60) bitiyor++;
    });
    return { beklenen, tahsil, bekleyen: Math.max(0, beklenen - tahsil), gecikmis, gecikmisAdet, bitiyor };
  }, [shown, payIndex, donem]);

  // Aidat: seçili ayın site gideri (Kasa'da "Aidat Gideri" kategorisi, notta site adı).
  const siteGider = useMemo(() => {
    if (tip !== 'aidat') return 0;
    return kasa.filter((k) => k.tur === 'gider' && k.kategori === 'Aidat Gideri' && (k.tarih || '').startsWith(donem) && (!grup || (k.notlar || '').startsWith(grup)))
      .reduce((s, k) => s + (k.tutar || 0), 0);
  }, [kasa, tip, donem, grup]);

  const suggestions = useMemo(() => {
    const q = (form?.kisi || '').trim().toLowerCase();
    if (!q || form?.customerId) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(q)).slice(0, 5);
  }, [form?.kisi, form?.customerId, customers]);

  if (!activeCompany || restricted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tt('title')} />
        <View style={s.center}><Text style={s.muted}>{tr('noAccess')}</Text></View>
      </SafeAreaView>
    );
  }

  const openForm = (u?: RentUnitT) => {
    const f = u ? { ...u } : { ...EMPTY(activeCompany.id, tip), grup: tip === 'aidat' ? grup : 'İşyeri' };
    setForm(f); setTutarStr(u ? String(u.tutar) : '');
  };
  const setF = <K extends keyof RentUnitInput>(k: K, v: RentUnitInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    const tutar = Number(tutarStr.replace(',', '.'));
    if (!form.ad.trim()) { showToast(tt('errName')); return; }
    if (!(tutar > 0)) { showToast(tr('errAmount')); return; }
    setSaving(true);
    try {
      const { id, ...data } = { ...form, tutar } as RentUnitInput & { id?: string };
      if (id) await api.updateRentUnit(id, data); else await api.createRentUnit(data);
      setForm(null); await load(); showToast(tr('saved'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const markPaid = async (u: RentUnitT, d: string) => {
    setBusy(u.id + d);
    try { const p = await api.payRent({ unitId: u.id, donem: d }); setPays((ps) => [...ps, p]); reloadKasa().catch(() => {}); }
    catch (e: any) { showToast(e?.message || ''); } finally { setBusy(''); }
  };
  const unpay = async (u: RentUnitT, p: RentPaymentT) => {
    if (!(await confirmAsync(fill(tr('unpayConfirm'), { d: monthLabel(p.donem) })))) return;
    setBusy(u.id + p.donem);
    try { await api.unpayRent(p.id); setPays((ps) => ps.filter((x) => x.id !== p.id)); reloadKasa().catch(() => {}); }
    catch (e: any) { showToast(e?.message || ''); } finally { setBusy(''); }
  };
  const remove = async (u: RentUnitT) => {
    if (!(await confirmAsync(fill(tr('deleteConfirm'), { name: u.ad })))) return;
    try { await api.deleteRentUnit(u.id); await load(); } catch (e: any) { showToast(e?.message || ''); }
  };
  const remind = (u: RentUnitT, dues: string[], total: number) => {
    const list = dues.length ? dues : [donem];
    openWhatsAppChat(u.telefon, fill(tt('remindMsg'), {
      name: u.kisi || '', unit: u.ad, months: list.map(monthLabel).join(', '), tutar: fmt(dues.length ? total : unitAmount(u, donem), u.paraBirimi),
      company: activeCompany.sirketAdi || '',
    }));
  };
  const saveGider = async () => {
    const n = Number((gider?.tutar || '').replace(',', '.'));
    if (!(n > 0)) { showToast(tr('errAmount')); return; }
    try {
      await addKasaEntry({ tur: 'gider', kategori: 'Aidat Gideri', tutar: n, paraBirimi: 'TRY', yontem: 'Havale/EFT', notlar: `${grup || tr('general')} - ${gider?.not || ''}`.trim(), tarih: new Date().toISOString().slice(0, 10) });
      setGider(null); showToast(tr('saved'));
    } catch (e: any) { showToast(e?.message || ''); }
  };

  const unit: [string, string, string] = [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tt('title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero icon={tip === 'kira' ? 'key' : 'business'} title={tt('title')} subtitle={activeCompany.sirketAdi} color={color}
            stats={[
              { label: tr('expected'), value: stats.beklenen, format: (n) => `₺${compactNumber(n, unit)}` },
              { label: tr('collected'), value: stats.tahsil, format: (n) => `₺${compactNumber(n, unit)}`, tone: '#86EFAC' },
              { label: tr('pending'), value: stats.bekleyen, format: (n) => `₺${compactNumber(n, unit)}`, tone: '#FCA5A5' },
            ]} />

          <View style={s.miniRow}>
            <View style={s.mini}><Text style={[s.miniVal, stats.gecikmis > 0 && { color: theme.colors.red }]}>{fmt(stats.gecikmis)}</Text><Text style={s.miniLabel}>{fill(tr('overdueTotal'), { n: stats.gecikmisAdet })}</Text></View>
            {tip === 'kira' ? (
              <View style={s.mini}><Text style={[s.miniVal, stats.bitiyor > 0 && { color: '#D97706' }]}>{stats.bitiyor}</Text><Text style={s.miniLabel}>{tr('endingSoon')}</Text></View>
            ) : (
              <TouchableOpacity style={s.mini} onPress={() => setGider(gider ? null : { tutar: '', not: '' })} testID="aidat-gider">
                <Text style={s.miniVal}>{fmt(siteGider)}</Text><Text style={s.miniLabel}>{tr('siteExpense')} · <Text style={{ color: theme.colors.primary }}>{tr('addExpense')}</Text></Text>
              </TouchableOpacity>
            )}
          </View>

          {gider && (
            <View style={s.card}>
              <View style={s.row2}>
                <MotionInput style={[s.input, { flex: 1 }]} value={gider.tutar} keyboardType="decimal-pad" onChangeText={(v) => setGider({ ...gider, tutar: v })} placeholder={tr('amount')} placeholderTextColor="#94a3b8" />
                <MotionInput style={[s.input, { flex: 2 }]} value={gider.not} onChangeText={(v) => setGider({ ...gider, not: v })} placeholder={tr('expensePh')} placeholderTextColor="#94a3b8" />
              </View>
              <BubbleButton icon="checkmark" label={tr('save')} color={color} onPress={saveGider} />
            </View>
          )}

          <View style={s.monthBar}>
            <TouchableOpacity onPress={() => setDonem(addMonths(donem, -1))} style={s.monthBtn} testID="rent-prev"><Ionicons name="chevron-back" size={18} color={theme.colors.text} /></TouchableOpacity>
            <Text style={s.monthText}>{monthLabel(donem)}</Text>
            <TouchableOpacity onPress={() => setDonem(addMonths(donem, 1))} style={s.monthBtn} testID="rent-next"><Ionicons name="chevron-forward" size={18} color={theme.colors.text} /></TouchableOpacity>
          </View>

          {groups.length > 1 && (
            <View style={s.chips}>
              <TouchableOpacity style={[s.chip, !grup && { backgroundColor: color, borderColor: color }]} onPress={() => setGrup('')}><Text style={[s.chipText, !grup && { color: '#fff' }]}>{tr('all')}</Text></TouchableOpacity>
              {groups.map((g) => (
                <TouchableOpacity key={g} style={[s.chip, grup === g && { backgroundColor: color, borderColor: color }]} onPress={() => setGrup(g)}><Text style={[s.chipText, grup === g && { color: '#fff' }]}>{g}</Text></TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={[s.addBtn, { backgroundColor: form ? theme.colors.surface : color, borderColor: color }]} onPress={() => (form ? setForm(null) : openForm())} testID="rent-new">
            <Ionicons name={form ? 'close' : 'add'} size={17} color={form ? color : '#fff'} />
            <Text style={[s.addText, { color: form ? color : '#fff' }]}>{form ? tr('cancel') : tt('new')}</Text>
          </TouchableOpacity>

          {form && (
            <View style={s.card} testID="rent-form">
              <Text style={s.label}>{upper(tt('groupLabel'))}</Text>
              {tip === 'kira' ? (
                <View style={s.chips}>
                  {['İşyeri', 'Konut', 'Araç', 'Diğer'].map((g) => (
                    <TouchableOpacity key={g} style={[s.chip, form.grup === g && { backgroundColor: color, borderColor: color }]} onPress={() => setF('grup', g)}>
                      <Text style={[s.chipText, form.grup === g && { color: '#fff' }]}>{tr('g_' + g)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <MotionInput style={s.input} value={form.grup} onChangeText={(v) => setF('grup', v)} placeholder={tr('sitePh')} placeholderTextColor="#94a3b8" testID="rent-grup" />
              )}
              <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('nameLabel'))}</Text>
              <MotionInput style={s.input} value={form.ad} onChangeText={(v) => setF('ad', v)} placeholder={tt('namePh')} placeholderTextColor="#94a3b8" testID="rent-ad" />
              <View style={s.row2}>
                <View style={{ flex: 1, zIndex: 10 }}>
                  <Text style={s.label}>{upper(tt('personLabel'))}</Text>
                  <MotionInput style={s.input} value={form.kisi} onChangeText={(v) => { setF('kisi', v); setF('customerId', ''); setShowSuggest(true); }} onBlur={() => setTimeout(() => setShowSuggest(false), 150)} testID="rent-kisi" />
                  {showSuggest && suggestions.length > 0 && (
                    <View style={s.suggestBox}>
                      {suggestions.map((c: CustomerT) => (
                        <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => { setForm((f) => (f ? { ...f, kisi: c.firma, customerId: c.id, telefon: f.telefon || c.telefon || '' } : f)); setShowSuggest(false); }}>
                          <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tr('phone'))}</Text>
                  <MotionInput style={s.input} value={form.telefon} keyboardType="phone-pad" onChangeText={(v) => setF('telefon', v)} testID="rent-tel" />
                </View>
              </View>
              <View style={s.row2}>
                <View style={{ flex: 1.3 }}>
                  <Text style={s.label}>{upper(tt('amountLabel'))}</Text>
                  <MotionInput style={s.input} value={tutarStr} keyboardType="decimal-pad" onChangeText={setTutarStr} placeholder="0" placeholderTextColor="#94a3b8" testID="rent-tutar" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tr('dueDay'))}</Text>
                  <MotionInput style={s.input} value={String(form.gun || '')} keyboardType="number-pad" onChangeText={(v) => setF('gun', Math.max(1, Math.min(28, Number(v.replace(/\D/g, '')) || 1)))} testID="rent-gun" />
                </View>
              </View>
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tr('start'))}</Text>
                  <MotionInput style={s.input} value={form.baslangic} onChangeText={(v) => setF('baslangic', v)} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" testID="rent-bas" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{upper(tr('end'))}</Text>
                  <MotionInput style={s.input} value={form.bitis} onChangeText={(v) => setF('bitis', v)} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" testID="rent-bit" />
                </View>
              </View>
              {tip === 'kira' && (
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tr('increase'))}</Text>
                    <MotionInput style={s.input} value={form.artisOrani ? String(form.artisOrani) : ''} keyboardType="decimal-pad" onChangeText={(v) => setF('artisOrani', Number(v.replace(',', '.')) || 0)} placeholder="%" placeholderTextColor="#94a3b8" testID="rent-artis" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tr('deposit'))}</Text>
                    <MotionInput style={s.input} value={form.depozito ? String(form.depozito) : ''} keyboardType="decimal-pad" onChangeText={(v) => setF('depozito', Number(v.replace(',', '.')) || 0)} placeholder="0" placeholderTextColor="#94a3b8" />
                  </View>
                </View>
              )}
              <Text style={[s.label, { marginTop: 10 }]}>{upper(tr('note'))}</Text>
              <MotionInput style={s.input} value={form.notlar} onChangeText={(v) => setF('notlar', v)} />
              <BubbleButton icon="checkmark-done" label={saving ? tr('saving') : tr('save')} color={color} size="lg" loading={saving} onPress={save} testID="rent-save" />
            </View>
          )}

          {units == null ? <ActivityIndicator style={{ marginTop: 24 }} color={color} /> : shown.length === 0 ? (
            <View style={s.empty}><Ionicons name={tip === 'kira' ? 'key-outline' : 'business-outline'} size={30} color={theme.colors.textMuted} /><Text style={s.muted}>{tt('empty')}</Text></View>
          ) : shown.map((u) => {
            const p = payIndex[u.id] || {};
            const st = periodStatus(u, donem, p[donem]);
            const o = overdue(u, new Set(Object.keys(p)));
            const endIn = daysToEnd(u);
            const amount = p[donem]?.tutar ?? unitAmount(u, donem);
            const raised = u.artisOrani > 0 && unitAmount(u, donem) > u.tutar;
            return (
              <View key={u.id} style={[s.item, st === 'late' && { borderColor: alpha(theme.colors.red, 0.5) }, !u.aktif && { opacity: 0.55 }]} testID={`rent-${u.id}`}>
                <View style={s.itemTop}>
                  {u.grup ? <View style={[s.grp, { backgroundColor: alpha(color, 0.14) }]}><Text style={[s.grpText, { color }]}>{tip === 'kira' ? tr('g_' + u.grup) : u.grup}</Text></View> : null}
                  <Text style={s.name} numberOfLines={1}>{u.ad}</Text>
                  <Text style={s.amount}>{fmt(amount, u.paraBirimi)}</Text>
                </View>
                <Text style={s.meta}>
                  {u.kisi || '—'} · {fill(tr('everyMonth'), { d: u.gun })}
                  {raised ? <Text style={{ color: '#D97706', fontWeight: '800' }}>{' · '}{fill(tr('raised'), { p: u.artisOrani })}</Text> : null}
                  {endIn != null && endIn <= 60 ? <Text style={{ color: endIn < 0 ? theme.colors.red : '#D97706', fontWeight: '800' }}>{' · '}{endIn < 0 ? tr('ended') : fill(tr('endsIn'), { n: endIn })}</Text> : null}
                </Text>

                <View style={s.hist}>
                  {Array.from({ length: 12 }, (_, i) => addMonths(donem, i - 11)).map((d) => {
                    const ps = periodStatus(u, d, p[d]);
                    const bg = ps === 'paid' ? theme.colors.green : ps === 'late' ? theme.colors.red : ps === 'due' ? '#F59E0B' : theme.colors.line;
                    return <View key={d} style={[s.dot, { backgroundColor: bg }, d === donem && s.dotCur]} />;
                  })}
                </View>

                <View style={s.actions}>
                  {st === 'paid' ? (
                    <TouchableOpacity style={[s.stBtn, { backgroundColor: theme.colors.greenSoft }]} onPress={() => unpay(u, p[donem])} disabled={busy === u.id + donem} testID={`rent-${u.id}-unpay`}>
                      <Ionicons name="checkmark-circle" size={15} color={theme.colors.greenText} /><Text style={[s.stText, { color: theme.colors.greenText }]}>{tr('paid')}</Text>
                    </TouchableOpacity>
                  ) : st === 'none' ? (
                    <Text style={s.meta}>{tr('outOfContract')}</Text>
                  ) : (
                    <TouchableOpacity style={[s.stBtn, { backgroundColor: color }]} onPress={() => markPaid(u, donem)} disabled={busy === u.id + donem} testID={`rent-${u.id}-pay`}>
                      {busy === u.id + donem ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={15} color="#fff" />}
                      <Text style={[s.stText, { color: '#fff' }]}>{tr('markPaid')}</Text>
                    </TouchableOpacity>
                  )}
                  {st === 'late' && <Text style={s.late}>{tr('late')}</Text>}
                  <View style={{ flex: 1 }} />
                  {u.telefon && (st !== 'paid' || o.donemler.length > 0) ? (
                    <TouchableOpacity onPress={() => remind(u, o.donemler, o.toplam)} style={s.iconBtn} testID={`rent-${u.id}-remind`}><Ionicons name="logo-whatsapp" size={18} color="#16A34A" /></TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => openForm(u)} style={s.iconBtn} testID={`rent-${u.id}-edit`}><Ionicons name="create-outline" size={18} color={theme.colors.primary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(u)} style={s.iconBtn} testID={`rent-${u.id}-delete`}><Ionicons name="trash-outline" size={17} color={theme.colors.red} /></TouchableOpacity>
                </View>
                {o.donemler.length > 0 && (
                  <View style={s.overdue}>
                    <Text style={s.overdueText}>{fill(tr('overdueLine'), { n: o.donemler.length, sum: fmt(o.toplam, u.paraBirimi) })}</Text>
                    <View style={s.chips}>
                      {o.donemler.filter((d) => d !== donem).slice(-6).map((d) => (
                        <TouchableOpacity key={d} style={s.odChip} onPress={() => markPaid(u, d)} disabled={busy === u.id + d}>
                          <Text style={s.odChipText}>{monthLabel(d)} ✓</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          <Text style={s.foot}>{tr('foot')}</Text>
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
  mini: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 11, ...theme.shadow.sm },
  miniVal: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  miniLabel: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textMuted, marginTop: 2 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 },
  monthBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.line },
  monthText: { fontSize: 15, fontWeight: '900', color: theme.colors.text, minWidth: 140, textAlign: 'center', textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1 },
  addText: { fontSize: 13, fontWeight: '800' },
  card: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  suggestBox: { position: 'absolute', top: 64, left: 0, right: 0, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.md, overflow: 'hidden' },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  suggestName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  empty: { marginTop: 14, alignItems: 'center', gap: 8, padding: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, backgroundColor: theme.colors.surface },
  item: { marginTop: 10, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 12, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grp: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  grpText: { fontSize: 9.5, fontWeight: '900' },
  name: { flex: 1, fontSize: 14, fontWeight: '800', color: theme.colors.text },
  amount: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  hist: { flexDirection: 'row', gap: 4, marginTop: 9 },
  dot: { flex: 1, height: 6, borderRadius: 3 },
  dotCur: { height: 9, marginTop: -1.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  stBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  stText: { fontSize: 12, fontWeight: '800' },
  late: { fontSize: 11, fontWeight: '900', color: theme.colors.red },
  iconBtn: { padding: 6 },
  overdue: { marginTop: 8, padding: 9, borderRadius: 10, backgroundColor: theme.colors.redSoft },
  overdueText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.redText },
  odChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.colors.surface },
  odChipText: { fontSize: 10.5, fontWeight: '700', color: theme.colors.text, textTransform: 'capitalize' },
  foot: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center', marginTop: 14 },
}));

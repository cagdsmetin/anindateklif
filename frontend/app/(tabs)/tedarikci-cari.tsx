import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, RatesT, TedarikciHareketT, TedarikciHareketTur, TedarikciT } from '@/src/lib/api';
import { currentRateFor } from '@/src/lib/tahsilat-utils';
import { addDays, computeTedarikciBalances, daysUntil, fmtMoney, localToday, parseAmount } from '@/src/lib/tedarikci';
import { fill, statusLabel, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, Reveal, ScreenHero, alpha, themedStyles } from '@/src/components/motion';

// Tek bir tedarikçinin carisi: alış (borçlandık) ve ödeme (ödedik) hareketleri,
// para birimine göre net bakiye. Ödeme Kasa'ya backend'de otomatik gider
// olarak yazılır.

const CURRENCIES = ['TRY', 'USD', 'EUR'];
const ODEME_YONTEMLERI = ['Nakit', 'Havale/EFT', 'Kart', 'Diğer'];
const trDate = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

function confirmAsync(msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(msg));
  return new Promise((resolve) => Alert.alert('', msg, [
    { text: translate('ted.cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
  ]));
}

export default function TedarikciCariScreen() {
  const { t, lang } = useLanguage();
  const tt = (k: string) => t('ted.' + k);
  const { activeCompany, showToast, reloadKasa } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tedarikciId } = useLocalSearchParams<{ tedarikciId?: string }>();

  const [ted, setTed] = useState<TedarikciT | null>(null);
  const [list, setList] = useState<TedarikciHareketT[] | null>(null);
  const [rates, setRates] = useState<RatesT | null>(null);
  const [formTur, setFormTur] = useState<TedarikciHareketTur | null>(null);
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [tarih, setTarih] = useState(localToday());
  const [vade, setVade] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [yontem, setYontem] = useState('Havale/EFT');
  const [notlar, setNotlar] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany || restricted || !tedarikciId) return;
    try {
      const [ts, hs] = await Promise.all([api.listTedarikciler(activeCompany.id), api.listTedarikciHareket(activeCompany.id, tedarikciId)]);
      setTed(ts.find((x) => x.id === tedarikciId) || null);
      setList(hs);
    } catch (e: any) { showToast(e?.message || ''); setList([]); }
  }, [activeCompany, restricted, tedarikciId, showToast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { api.rates().then(setRates).catch(() => {}); }, []);

  const today = localToday();
  const all = list || [];
  const bal = useMemo(() => (tedarikciId ? computeTedarikciBalances(all, today)[tedarikciId] : undefined), [all, today, tedarikciId]);
  const sorted = useMemo(() => [...all].sort((a, b) => b.tarih.localeCompare(a.tarih) || b.createdAt.localeCompare(a.createdAt)), [all]);
  const totals = useMemo(() => {
    const sumTry = (tur: TedarikciHareketTur) => all.filter((h) => h.tur === tur)
      .reduce((a, h) => a + h.tutar * (h.paraBirimi === 'TRY' ? 1 : (h.kurTRY || currentRateFor(h.paraBirimi, rates) || 0)), 0);
    return { alis: sumTry('alis'), odeme: sumTry('odeme') };
  }, [all, rates]);

  const openForm = (tur: TedarikciHareketTur) => {
    if (formTur === tur) { setFormTur(null); return; }
    setFormTur(tur);
    setTutar(''); setBelgeNo(''); setNotlar(''); setTarih(today);
    setVade(tur === 'alis' && ted?.vadeGun ? addDays(today, ted.vadeGun) : '');
    // Tek para biriminde borç varsa ödeme o para biriminde önerilsin.
    const open = bal?.balances.filter((b) => b.bakiye > 0) || [];
    if (tur === 'odeme' && open.length === 1) {
      setParaBirimi(open[0].paraBirimi);
      setTutar(String(open[0].bakiye).replace('.', ','));
    }
  };

  const save = async () => {
    if (!activeCompany || !ted || !formTur) return;
    const amount = parseAmount(tutar);
    if (!(amount > 0)) { showToast(tt('errAmount')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || (vade && !/^\d{4}-\d{2}-\d{2}$/.test(vade))) { showToast(tt('errDate')); return; }
    setSaving(true);
    try {
      const created = await api.createTedarikciHareket({
        companyId: activeCompany.id, tedarikciId: ted.id, tur: formTur, tutar: amount, paraBirimi,
        yontem: formTur === 'odeme' ? yontem : '', belgeNo: formTur === 'alis' ? belgeNo.trim() : '',
        vadeTarihi: formTur === 'alis' ? vade : '', notlar: notlar.trim(), tarih,
        kurTRY: currentRateFor(paraBirimi, rates), quoteId: '',
      });
      setList((l) => [...(l || []), created]);
      if (formTur === 'odeme') reloadKasa().catch(() => {});
      setFormTur(null);
      showToast(tt(formTur === 'alis' ? 'savedAlis' : 'savedOdeme'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const remove = async (h: TedarikciHareketT) => {
    if (!(await confirmAsync(tt('moveDeleteConfirm')))) return;
    try {
      await api.deleteTedarikciHareket(h.id);
      setList((l) => (l || []).filter((x) => x.id !== h.id));
      if (h.tur === 'odeme') reloadKasa().catch(() => {});
      showToast(tt('deleted'));
    } catch (e: any) { showToast(e?.message || ''); }
  };

  const copyIban = () => {
    if (!ted?.iban) return;
    const iban = ted.iban.replace(/\s/g, '');
    // Web'de panoya kopyala; mobilde (pano paketi yok) paylaşım menüsü açılır.
    if (Platform.OS === 'web') (navigator as any).clipboard?.writeText(iban).then(() => showToast(tt('ibanCopied'))).catch(() => {});
    else Share.share({ message: iban }).catch(() => {});
  };

  if (!activeCompany || restricted || !tedarikciId) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tt('cariTitle')} />
        <View style={s.center}><Text style={s.muted}>{restricted ? tt('noStaff') : tt('noCompany')}</Text></View>
      </SafeAreaView>
    );
  }

  const color = theme.colors.modules.tedarikci;
  const borc = (bal?.balances || []).filter((b) => b.bakiye > 0);
  const avans = (bal?.balances || []).filter((b) => b.bakiye < 0);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tt('cariTitle')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={s.back} onPress={() => router.push('/tedarikciler' as any)} testID="ted-cari-back">
            <Ionicons name="chevron-back" size={16} color={theme.colors.textSoft} />
            <Text style={s.backText}>{tt('title')}</Text>
          </TouchableOpacity>

          <ScreenHero
            icon="swap-horizontal"
            title={ted?.firma || '…'}
            subtitle={[ted?.yetkili, ted?.telefon].filter(Boolean).join(' · ') || tt('cariTitle')}
            color={color}
            stats={[
              { label: tt('totalAlis'), value: totals.alis, format: (n) => fmtMoney(n), tone: '#FCA5A5' },
              { label: tt('totalOdeme'), value: totals.odeme, format: (n) => fmtMoney(n), tone: '#86EFAC' },
            ]}
          />

          <Reveal variant="up" distance={12}>
            <View style={[s.balCard, borc.length ? { borderColor: alpha(theme.colors.red, 0.45) } : null]} testID="ted-cari-balance">
              <Text style={s.label}>{upper(tt('balance'))}</Text>
              {list == null ? <ActivityIndicator color={color} /> : borc.length || avans.length ? (
                <>
                  {borc.map((b) => (
                    <Text key={b.paraBirimi} style={[s.balVal, { color: theme.colors.red }]}>{fmtMoney(b.bakiye, b.paraBirimi)} <Text style={s.balHint}>{tt('weOwe')}</Text></Text>
                  ))}
                  {avans.map((b) => (
                    <Text key={b.paraBirimi} style={[s.balVal, { color: theme.colors.green }]}>{fmtMoney(-b.bakiye, b.paraBirimi)} <Text style={s.balHint}>{tt('advance')}</Text></Text>
                  ))}
                </>
              ) : <Text style={[s.balVal, { color: theme.colors.textMuted }]}>{tt('settled')}</Text>}
              {bal?.hasOverdue ? <Text style={s.overdue}>{tt('overdueLong')}</Text> : null}
              {ted?.iban ? (
                <TouchableOpacity style={s.ibanRow} onPress={copyIban} testID="ted-cari-iban">
                  <Ionicons name="copy-outline" size={14} color={theme.colors.textSoft} />
                  <Text style={s.ibanText} numberOfLines={1}>IBAN: {ted.iban}</Text>
                </TouchableOpacity>
              ) : null}
              {ted?.telefon ? (
                <TouchableOpacity style={s.ibanRow} onPress={() => Linking.openURL(`tel:${ted.telefon.replace(/\s/g, '')}`)}>
                  <Ionicons name="call-outline" size={14} color={theme.colors.textSoft} />
                  <Text style={s.ibanText}>{ted.telefon}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Reveal>

          <View style={s.actions}>
            {(['alis', 'odeme'] as TedarikciHareketTur[]).map((tur) => {
              const active = formTur === tur;
              const c = tur === 'alis' ? theme.colors.red : theme.colors.green;
              return (
                <TouchableOpacity key={tur} style={[s.actBtn, active && { backgroundColor: c, borderColor: c }]} onPress={() => openForm(tur)} testID={`ted-cari-new-${tur}`}>
                  <Ionicons name={active ? 'close' : tur === 'alis' ? 'cart-outline' : 'cash-outline'} size={16} color={active ? '#fff' : c} />
                  <Text style={[s.actText, active && { color: '#fff' }]}>{active ? tt('cancel') : tt(tur === 'alis' ? 'newAlis' : 'newOdeme')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {formTur && (
            <Reveal variant="up" distance={12}>
              <View style={s.card} testID="ted-cari-form">
                <Text style={s.cardTitle}>{tt(formTur === 'alis' ? 'newAlis' : 'newOdeme')}</Text>
                <Text style={s.hint}>{tt(formTur === 'alis' ? 'alisHint' : 'odemeHint')}</Text>
                <View style={s.row2}>
                  <View style={{ flex: 1.3 }}>
                    <Text style={s.label}>{upper(tt('tutar'))}</Text>
                    <MotionInput style={s.input} keyboardType="decimal-pad" value={tutar} onChangeText={setTutar} placeholder="0" placeholderTextColor="#94a3b8" testID="ted-cari-tutar" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('pb'))}</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {CURRENCIES.map((c) => (
                        <TouchableOpacity key={c} style={[s.curChip, paraBirimi === c && { backgroundColor: color, borderColor: color }]} onPress={() => setParaBirimi(c)}>
                          <Text style={[s.curText, paraBirimi === c && { color: '#fff' }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{upper(tt('tarih'))}</Text>
                    <MotionInput style={s.input} value={tarih} onChangeText={setTarih} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" testID="ted-cari-tarih" />
                  </View>
                  {formTur === 'alis' ? (
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>{upper(tt('belgeNo'))}</Text>
                      <MotionInput style={s.input} value={belgeNo} onChangeText={setBelgeNo} placeholder={tt('belgePh')} placeholderTextColor="#94a3b8" testID="ted-cari-belge" />
                    </View>
                  ) : null}
                </View>
                {formTur === 'alis' ? (
                  <>
                    <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('vade'))}</Text>
                    <MotionInput style={s.input} value={vade} onChangeText={setVade} placeholder={tt('vadePh')} placeholderTextColor="#94a3b8" testID="ted-cari-vade" />
                    <View style={[s.chipRow, { marginTop: 6 }]}>
                      {[0, 30, 60, 90].map((n) => (
                        <TouchableOpacity key={n} style={s.chip} onPress={() => setVade(n ? addDays(tarih || today, n) : '')}>
                          <Text style={s.chipText}>{n ? `+${n}` : tt('pesin')}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('yontem'))}</Text>
                    <View style={s.chipRow}>
                      {ODEME_YONTEMLERI.map((y) => (
                        <TouchableOpacity key={y} style={[s.chip, yontem === y && { backgroundColor: color, borderColor: color }]} onPress={() => setYontem(y)} testID={`ted-cari-yontem-${y}`}>
                          <Text style={[s.chipText, yontem === y && { color: '#fff' }]}>{statusLabel(lang, y)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <Text style={[s.label, { marginTop: 10 }]}>{upper(tt('not'))}</Text>
                <MotionInput style={s.input} value={notlar} onChangeText={setNotlar} testID="ted-cari-not" />
                <View style={{ marginTop: 14 }}>
                  <BubbleButton icon="checkmark-done" label={saving ? tt('saving') : tt('save')} color={formTur === 'alis' ? theme.colors.red : theme.colors.green} size="lg" loading={saving} onPress={save} testID="ted-cari-save" />
                </View>
              </View>
            </Reveal>
          )}

          <Text style={s.section}>{upper(tt('moves'))}</Text>
          {list == null ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={color} />
          ) : sorted.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="swap-horizontal-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.muted}>{tt('noMoves')}</Text>
              <Text style={[s.muted, { fontSize: 11.5 }]}>{tt('noMovesHint')}</Text>
            </View>
          ) : (
            sorted.map((h, i) => {
              const alis = h.tur === 'alis';
              const n = h.vadeTarihi ? daysUntil(h.vadeTarihi, today) : null;
              return (
                <Reveal key={h.id} variant={i % 2 === 0 ? 'left' : 'right'} distance={14}>
                  <View style={s.item} testID={`ted-move-${h.id}`}>
                    <View style={s.itemTop}>
                      <View style={[s.turBadge, { backgroundColor: alis ? theme.colors.redSoft : theme.colors.greenSoft }]}>
                        <Ionicons name={alis ? 'cart' : 'cash'} size={13} color={alis ? theme.colors.redText : theme.colors.greenText} />
                        <Text style={[s.turText, { color: alis ? theme.colors.redText : theme.colors.greenText }]}>{tt(alis ? 'alis' : 'odeme')}</Text>
                      </View>
                      <Text style={s.itemDate}>{trDate(h.tarih)}</Text>
                      <Text style={[s.amount, { color: alis ? theme.colors.red : theme.colors.green }]}>{alis ? '+' : '−'}{fmtMoney(h.tutar, h.paraBirimi)}</Text>
                    </View>
                    <Text style={s.meta}>
                      {[h.belgeNo && `${tt('belgeNo')}: ${h.belgeNo}`, h.yontem && statusLabel(lang, h.yontem), h.notlar].filter(Boolean).join(' · ') || ' '}
                      {alis && h.vadeTarihi ? (
                        <Text style={{ color: n != null && n < 0 && (bal?.hasOverdue ?? false) ? theme.colors.red : theme.colors.textMuted, fontWeight: '700' }}>
                          {`  ${tt('vade')}: ${trDate(h.vadeTarihi)}`}
                        </Text>
                      ) : null}
                    </Text>
                    <View style={s.itemFoot}>
                      {!alis ? (
                        <View style={s.linkPill}>
                          <Ionicons name="wallet-outline" size={12} color={theme.colors.textSoft} />
                          <Text style={s.linkText}>{tt('inKasa')}</Text>
                        </View>
                      ) : <View />}
                      <TouchableOpacity onPress={() => remove(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ted-move-${h.id}-delete`}>
                        <Ionicons name="trash-outline" size={17} color={theme.colors.red} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Reveal>
              );
            })
          )}
          <Text style={s.foot}>{fill(tt('cariFoot'), { n: all.length })}</Text>
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textSoft },
  balCard: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 14, gap: 4, ...theme.shadow.sm },
  balVal: { fontSize: 22, fontWeight: '900' },
  balHint: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  overdue: { fontSize: 11.5, fontWeight: '800', color: theme.colors.redText, marginTop: 2 },
  ibanRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  ibanText: { flex: 1, fontSize: 11.5, fontWeight: '700', color: theme.colors.textSoft },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  actText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  card: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  cardTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  hintSmall: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 6, lineHeight: 15 },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  curChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface, alignItems: 'center' },
  curText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  section: { fontSize: 11, fontWeight: '900', color: theme.colors.textSoft, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  emptyBox: { marginTop: 4, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  item: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 10, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  turText: { fontSize: 10.5, fontWeight: '900' },
  itemDate: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  amount: { marginLeft: 'auto', fontSize: 14.5, fontWeight: '900' },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  itemFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  linkPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.colors.surfaceSoft },
  linkText: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textSoft },
  foot: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
}));

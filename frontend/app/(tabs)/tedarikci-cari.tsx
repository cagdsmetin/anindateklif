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
import { currentRateFor, sumToTRY } from '@/src/lib/tahsilat-utils';
import { addDays, computeTedarikciBalances, daysUntil, fmtMoney, localToday, parseAmount } from '@/src/lib/tedarikci';
import { PillButton, TedStage } from '@/src/components/tedarikci/Stage';
import { fill, statusLabel, translate, upper, useLanguage } from '@/src/lib/i18n';
import { BeamRow, BubbleButton, Donut, MotionInput, MotionScrollView, Reveal, TracingBeam, alpha, themedStyles } from '@/src/components/motion';

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
  const monthName = (ay: string) => {
    const [y, m] = ay.split('-').map(Number);
    return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : lang === 'it' ? 'it-IT' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  };
  const sorted = useMemo(() => [...all].sort((a, b) => b.tarih.localeCompare(a.tarih) || b.createdAt.localeCompare(a.createdAt)), [all]);
  const months = useMemo(() => {
    const g: Record<string, TedarikciHareketT[]> = {};
    sorted.forEach((h) => { (g[h.tarih.slice(0, 7)] = g[h.tarih.slice(0, 7)] || []).push(h); });
    return Object.entries(g);
  }, [sorted]);
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
  // Sahnedeki dev rakam: tek para birimi varsa o, birden çoksa TL karşılığı.
  const shownBal = borc.length ? borc : avans;
  const stageCur = shownBal.length === 1 ? shownBal[0].paraBirimi : 'TRY';
  const stageValue = Math.abs(shownBal.length === 1 ? shownBal[0].bakiye : (sumToTRY(shownBal.map((b) => ({ paraBirimi: b.paraBirimi, bakiye: Math.abs(b.bakiye) })), rates) ?? 0));
  const paidPct = totals.alis > 0 ? Math.min(100, Math.round((totals.odeme / totals.alis) * 100)) : 0;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tt('cariTitle')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={s.back} onPress={() => router.push('/tedarikciler' as any)} testID="ted-cari-back">
            <Ionicons name="chevron-back" size={16} color={theme.colors.textSoft} />
            <Text style={s.backText}>{tt('title')}</Text>
          </TouchableOpacity>

          <TedStage
            testID="ted-cari-stage"
            eyebrow={[ted?.yetkili, ted?.telefon].filter(Boolean).join(' · ') || tt('cariTitle')}
            title={ted?.firma || '…'}
            value={stageValue}
            format={(n) => fmtMoney(n, stageCur)}
            valueColor={borc.length ? '#fff' : avans.length ? '#86EFAC' : 'rgba(255,255,255,0.55)'}
            sub={
              <Text style={s.stageSub} testID="ted-cari-balance">
                {list == null ? '…' : borc.length ? tt('weOwe') : avans.length ? tt('advance') : tt('settled')}
                {borc.length > 1 ? `  ·  ${borc.map((b) => fmtMoney(b.bakiye, b.paraBirimi)).join(' + ')}` : ''}
                {bal?.hasOverdue ? <Text style={s.stageWarn}>{`  ·  ${tt('overdue')}`}</Text> : null}
              </Text>
            }
            actions={
              <>
                <PillButton variant="light" icon={formTur === 'odeme' ? 'close' : 'cash-outline'} label={formTur === 'odeme' ? tt('cancel') : tt('newOdeme')} onPress={() => openForm('odeme')} testID="ted-cari-new-odeme" />
                <PillButton variant="ghost" icon={formTur === 'alis' ? 'close' : 'cart-outline'} label={formTur === 'alis' ? tt('cancel') : tt('newAlis')} onPress={() => openForm('alis')} testID="ted-cari-new-alis" />
              </>
            }
          >
            <View style={s.stageFoot}>
              <Donut
                size={92}
                thickness={10}
                data={[
                  { value: Math.max(0, totals.odeme), color: '#86EFAC' },
                  { value: Math.max(0, totals.alis - totals.odeme), color: '#F97316' },
                ]}
                holeColor="#121214"
                trackColor="rgba(255,255,255,0.08)"
                centerLabel={upper(tt('paidRing'))}
                centerValue={`%${paidPct}`}
                labelColor="rgba(255,255,255,0.55)"
                valueColor="#fff"
              />
              <View style={{ flex: 1, gap: 10 }}>
                <View>
                  <Text style={s.stageMiniLabel}>{upper(tt('totalAlis'))}</Text>
                  <Text style={s.stageMini}>{fmtMoney(totals.alis)}</Text>
                </View>
                <View>
                  <Text style={s.stageMiniLabel}>{upper(tt('totalOdeme'))}</Text>
                  <Text style={[s.stageMini, { color: '#86EFAC' }]}>{fmtMoney(totals.odeme)}</Text>
                </View>
              </View>
            </View>
            {(ted?.iban || ted?.telefon) ? (
              <View style={s.contactRow}>
                {ted?.iban ? (
                  <TouchableOpacity style={s.contactPill} onPress={copyIban} testID="ted-cari-iban">
                    <Ionicons name="copy-outline" size={13} color="rgba(255,255,255,0.75)" />
                    <Text style={s.contactText} numberOfLines={1}>IBAN {ted.iban}</Text>
                  </TouchableOpacity>
                ) : null}
                {ted?.telefon ? (
                  <TouchableOpacity style={s.contactPill} onPress={() => Linking.openURL(`tel:${ted.telefon.replace(/\s/g, '')}`)}>
                    <Ionicons name="call-outline" size={13} color="rgba(255,255,255,0.75)" />
                    <Text style={s.contactText}>{ted.telefon}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </TedStage>

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

          <Text style={s.section}>{tt('timeline')}</Text>
          {list == null ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={color} />
          ) : sorted.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="swap-horizontal-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.muted}>{tt('noMoves')}</Text>
              <Text style={[s.muted, { fontSize: 11.5 }]}>{tt('noMovesHint')}</Text>
            </View>
          ) : (
            <TracingBeam colors={['#F97316', '#FDBA74', '#86EFAC']}>
              {months.map(([ay, rows]) => (
                <View key={ay}>
                  <Text style={s.monthLabel}>{monthName(ay)}</Text>
                  {rows.map((h) => {
                    const alis = h.tur === 'alis';
                    const n = h.vadeTarihi ? daysUntil(h.vadeTarihi, today) : null;
                    const tone = alis ? '#F97316' : theme.colors.green;
                    return (
                      <BeamRow key={h.id} color={tone} ringColor={theme.colors.bg}>
                        <Reveal variant="up" distance={14}>
                          <View style={s.item} testID={`ted-move-${h.id}`}>
                            <View style={s.itemTop}>
                              <View style={[s.turBadge, { backgroundColor: alpha(tone, 0.14) }]}>
                                <Ionicons name={alis ? 'cart' : 'cash'} size={12} color={alis ? '#C2410C' : theme.colors.greenText} />
                                <Text style={[s.turText, { color: alis ? '#C2410C' : theme.colors.greenText }]}>{tt(alis ? 'alis' : 'odeme')}</Text>
                              </View>
                              <Text style={s.itemDate}>{trDate(h.tarih)}</Text>
                              <TouchableOpacity onPress={() => remove(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[s.iconBtn, { marginLeft: 'auto' }]} testID={`ted-move-${h.id}-delete`}>
                                <Ionicons name="trash-outline" size={15} color={theme.colors.red} />
                              </TouchableOpacity>
                            </View>
                            <Text style={[s.amount, { color: alis ? theme.colors.text : theme.colors.green }]} numberOfLines={1}>{alis ? '+' : '−'}{fmtMoney(h.tutar, h.paraBirimi)}</Text>
                            <Text style={s.meta}>
                              {[h.belgeNo && `${tt('belgeNo')}: ${h.belgeNo}`, h.yontem && statusLabel(lang, h.yontem), h.notlar].filter(Boolean).join(' · ') || ' '}
                              {alis && h.vadeTarihi ? (
                                <Text style={{ color: n != null && n < 0 && (bal?.hasOverdue ?? false) ? theme.colors.red : theme.colors.textMuted, fontWeight: '700' }}>
                                  {`  ${tt('vade')}: ${trDate(h.vadeTarihi)}`}
                                </Text>
                              ) : null}
                            </Text>
                            {!alis ? (
                              <View style={s.itemFoot}>
                                <View style={s.linkPill}>
                                  <Ionicons name="wallet-outline" size={12} color={theme.colors.textSoft} />
                                  <Text style={s.linkText}>{tt('inKasa')}</Text>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        </Reveal>
                      </BeamRow>
                    );
                  })}
                </View>
              ))}
            </TracingBeam>
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
  stageSub: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.62)' },
  stageWarn: { color: '#FCA5A5', fontWeight: '800' },
  stageFoot: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  stageMiniLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.5)' },
  stageMini: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  contactPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxWidth: '100%' },
  contactText: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.8)', flexShrink: 1 },
  monthLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: theme.colors.textMuted, textTransform: 'uppercase', marginLeft: 38, marginTop: 6, marginBottom: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceSoft, borderWidth: 1, borderColor: theme.colors.line },
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
  section: { fontSize: 22, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.6, marginTop: 26, marginBottom: 12 },
  emptyBox: { marginTop: 4, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  item: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  turText: { fontSize: 10.5, fontWeight: '900' },
  itemDate: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  amount: { fontSize: 24, fontWeight: '900', letterSpacing: -0.9, marginTop: 8, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
  itemFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  linkPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.colors.surfaceSoft },
  linkText: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textSoft },
  foot: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
}));

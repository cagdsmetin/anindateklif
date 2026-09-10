import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { api, RatesT } from '@/src/lib/api';
import { convertToTRY, currentRateFor } from '@/src/lib/tahsilat-utils';
import { useLanguage, statusLabel } from '@/src/lib/i18n';

const GELIR_KATEGORILER = ['Satış', 'Hizmet', 'Servis Geliri', 'Diğer Gelir'];
const GIDER_KATEGORILER = ['Kira', 'Maaş', 'Malzeme', 'Fatura', 'Vergi', 'Ulaşım', 'Diğer Gider'];
const YONTEMLER = ['Nakit', 'Kart', 'Havale/EFT', 'Diğer'];
const CURRENCIES = ['TRY', 'USD', 'EUR'];

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}
function todayIso() { return new Date().toISOString().split('T')[0]; }
function monthKey(d: string) { return (d || '').slice(0, 7); }

export default function KasaScreen() {
  const { t, lang } = useLanguage();
  const { kasa, addKasaEntry, deleteKasaEntry, activeCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();

  const [tur, setTur] = useState<'gelir' | 'gider'>('gelir');
  const [kategori, setKategori] = useState(GELIR_KATEGORILER[0]);
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [yontem, setYontem] = useState('Nakit');
  const [notlar, setNotlar] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState<RatesT | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const setTurAndKategori = (t: 'gelir' | 'gider') => {
    setTur(t);
    setKategori(t === 'gelir' ? GELIR_KATEGORILER[0] : GIDER_KATEGORILER[0]);
  };

  const thisMonth = monthKey(todayIso());
  const monthEntries = useMemo(() => kasa.filter((k) => monthKey(k.tarih) === thisMonth), [kasa, thisMonth]);

  // Üstteki kartlar artık dövizli kayıtları da atlamıyor: her kayıt canlı
  // kurla TL'ye çevrilip TEK bir TL toplamına ekleniyor (Panel'deki hacim
  // kartıyla aynı mantık). Altında ayrıca o ayki $/€ dökümü gösteriliyor.
  // Kur bilinmiyorsa (servise erişilemedi) o kayıt TL toplamına katılmaz ama
  // döviz dökümünde görünmeye devam eder — sessizce kaybolmaz.
  function toplamByCurrency(list: typeof monthEntries) {
    const sums: Record<string, number> = {};
    list.forEach((k) => { sums[k.paraBirimi || 'TRY'] = (sums[k.paraBirimi || 'TRY'] || 0) + k.tutar; });
    return Object.entries(sums).map(([paraBirimi, tutar]) => ({ paraBirimi, tutar })).sort((a, b) => b.tutar - a.tutar);
  }
  function toplamTRY(list: typeof monthEntries) {
    let total = 0;
    list.forEach((k) => {
      const v = convertToTRY(k.tutar, k.paraBirimi || 'TRY', rates);
      if (v != null) total += v;
    });
    return total;
  }

  const gelirEntries = useMemo(() => monthEntries.filter((k) => k.tur === 'gelir'), [monthEntries]);
  const giderEntries = useMemo(() => monthEntries.filter((k) => k.tur === 'gider'), [monthEntries]);
  const gelirToplam = useMemo(() => toplamTRY(gelirEntries), [gelirEntries, rates]);
  const giderToplam = useMemo(() => toplamTRY(giderEntries), [giderEntries, rates]);
  const gelirByCurrency = useMemo(() => toplamByCurrency(gelirEntries), [gelirEntries]);
  const giderByCurrency = useMemo(() => toplamByCurrency(giderEntries), [giderEntries]);
  const net = gelirToplam - giderToplam;
  const dovizliVar = gelirByCurrency.some((x) => x.paraBirimi !== 'TRY') || giderByCurrency.some((x) => x.paraBirimi !== 'TRY');

  // BU AY NET kartının altında sadece 'canlı kurla' yazıp rakam göstermemek
  // yetersizdi -- gelir ile giderin döviz kısımları birbirine netleştirilip
  // (ör. $6.000 gelir - $0 gider = $6.000 net) GELİR/GİDER kartlarındaki gibi
  // $/€ dökümü burada da gösteriliyor.
  const netByCurrency = useMemo(() => {
    const sums: Record<string, number> = {};
    gelirByCurrency.forEach((x) => { if (x.paraBirimi !== 'TRY') sums[x.paraBirimi] = (sums[x.paraBirimi] || 0) + x.tutar; });
    giderByCurrency.forEach((x) => { if (x.paraBirimi !== 'TRY') sums[x.paraBirimi] = (sums[x.paraBirimi] || 0) - x.tutar; });
    return Object.entries(sums)
      .map(([paraBirimi, tutar]) => ({ paraBirimi, tutar }))
      .filter((x) => Math.abs(x.tutar) > 0.009)
      .sort((a, b) => Math.abs(b.tutar) - Math.abs(a.tutar));
  }, [gelirByCurrency, giderByCurrency]);

  const kategoriDagilimi = useMemo(() => {
    const map: Record<string, { tur: 'gelir' | 'gider'; toplam: number }> = {};
    monthEntries.forEach((k) => {
      if ((k.paraBirimi || 'TRY') !== 'TRY') return;
      if (!map[k.kategori]) map[k.kategori] = { tur: k.tur, toplam: 0 };
      map[k.kategori].toplam += k.tutar;
    });
    const arr = Object.entries(map).map(([kat, v]) => ({ kategori: kat, ...v }));
    arr.sort((a, b) => b.toplam - a.toplam);
    const max = Math.max(1, ...arr.map((a) => a.toplam));
    return arr.map((a) => ({ ...a, pct: Math.min(100, (a.toplam / max) * 100) }));
  }, [monthEntries]);

  const filtered = useMemo(() => {
    const list = [...kasa].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.id || '').localeCompare(a.id || ''));
    if (!q.trim()) return list;
    const qq = q.trim().toLowerCase();
    return list.filter((k) => k.kategori.toLowerCase().includes(qq) || (k.notlar || '').toLowerCase().includes(qq));
  }, [kasa, q]);

  const isDiger = kategori.startsWith('Diğer') || yontem === 'Diğer';

  const save = async () => {
    if (!Number(tutar) || Number(tutar) <= 0) { showToast(t('common.enterAmount')); return; }
    if (isDiger && !notlar.trim()) { showToast(t('kasa.s007')); return; }
    setSaving(true);
    try {
      await addKasaEntry({ tur, kategori, tutar: Number(tutar), paraBirimi, yontem, notlar, tarih: todayIso(), kurTRY: currentRateFor(paraBirimi, rates) });
      showToast(tur === 'gelir' ? t('kasa.s033') : t('kasa.s034'));
      setTutar('');
      setNotlar('');
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteKasaEntry(id);
      showToast(t('kasa.s008'));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || ''));
    }
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('kasa.s009')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('kasa.s010')}</Text></View>
      </SafeAreaView>
    );
  }

  const kategoriler = tur === 'gelir' ? GELIR_KATEGORILER : GIDER_KATEGORILER;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('kasa.s011')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft }]}>
              <Text style={[s.statLabel, { color: '#166534' }]}>{t('kasa.s012')}</Text>
              <Text style={[s.statValue, { color: '#166534' }]} numberOfLines={1}>{fmt(gelirToplam, 'TRY')}</Text>
              {gelirByCurrency.some((x) => x.paraBirimi !== 'TRY') && (
                <Text style={[s.statSubValue, { color: '#166534' }]} numberOfLines={1}>
                  {gelirByCurrency.filter((x) => x.paraBirimi !== 'TRY').map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ')}
                </Text>
              )}
            </View>
            <View style={[s.statCard, { backgroundColor: theme.colors.redSoft }]}>
              <Text style={[s.statLabel, { color: '#991b1b' }]}>{t('kasa.s013')}</Text>
              <Text style={[s.statValue, { color: '#991b1b' }]} numberOfLines={1}>{fmt(giderToplam, 'TRY')}</Text>
              {giderByCurrency.some((x) => x.paraBirimi !== 'TRY') && (
                <Text style={[s.statSubValue, { color: '#991b1b' }]} numberOfLines={1}>
                  {giderByCurrency.filter((x) => x.paraBirimi !== 'TRY').map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ')}
                </Text>
              )}
            </View>
            <View style={[s.statCard, { backgroundColor: net >= 0 ? theme.colors.primarySoft : theme.colors.redSoft }]}>
              <Text style={[s.statLabel, { color: net >= 0 ? theme.colors.primaryDark : '#991b1b' }]}>{t('kasa.s014')}</Text>
              <Text style={[s.statValue, { color: net >= 0 ? theme.colors.primaryDark : '#991b1b' }]} numberOfLines={1}>{fmt(net, 'TRY')}</Text>
              {netByCurrency.length > 0 ? (
                <Text style={[s.statSubValue, { color: net >= 0 ? theme.colors.primaryDark : '#991b1b' }]} numberOfLines={1}>
                  {netByCurrency.map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ')}
                </Text>
              ) : dovizliVar ? (
                <Text style={[s.statSubValue, { color: net >= 0 ? theme.colors.primaryDark : '#991b1b' }]}>{t('kasa.s015')}</Text>
              ) : null}
            </View>
          </View>

          <Text style={s.sectionH}>{t('kasa.s016')}</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[s.turBtn, tur === 'gelir' && s.turBtnGelirActive]} onPress={() => setTurAndKategori('gelir')} testID="kasa-tur-gelir">
                <Text style={[s.turBtnText, tur === 'gelir' && { color: '#166534' }]}>{t('kasa.s017')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.turBtn, tur === 'gider' && s.turBtnGiderActive]} onPress={() => setTurAndKategori('gider')} testID="kasa-tur-gider">
                <Text style={[s.turBtnText, tur === 'gider' && { color: '#991b1b' }]}>{t('kasa.s018')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>{t('kasa.s019')}</Text>
            <View style={s.chipRow}>
              {kategoriler.map((k) => (
                <TouchableOpacity key={k} style={[s.chip, kategori === k && s.chipActive]} onPress={() => setKategori(k)} testID={`kasa-kategori-${k}`}>
                  <Text style={[s.chipText, kategori === k && s.chipTextActive]}>{statusLabel(lang, k)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1.4 }}>
                <Text style={s.label}>{t('kasa.s020')}</Text>
                <TextInput style={s.input} keyboardType="numeric" value={tutar} onChangeText={(v) => setTutar(v.replace(',', '.'))} placeholder="0" placeholderTextColor="#94a3b8" testID="kasa-tutar-input" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{t('kasa.s021')}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity key={c} style={[s.curChip, paraBirimi === c && s.curChipActive]} onPress={() => setParaBirimi(c)}>
                      <Text style={[s.curChipText, paraBirimi === c && s.curChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{t('kasa.s022')}</Text>
            <View style={s.chipRow}>
              {YONTEMLER.map((y) => (
                <TouchableOpacity key={y} style={[s.chip, yontem === y && s.chipActive]} onPress={() => setYontem(y)}>
                  <Text style={[s.chipText, yontem === y && s.chipTextActive]}>{statusLabel(lang, y)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{isDiger ? t('kasa.s023') : t('common.notOptional')}</Text>
            <TextInput
              style={[s.input, isDiger && !notlar.trim() && s.inputRequired]}
              value={notlar}
              onChangeText={setNotlar}
              placeholder={isDiger ? t('kasa.s024') : t('kasa.s025')}
              placeholderTextColor="#94a3b8"
              testID="kasa-not-input"
            />

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save} testID="kasa-save-btn">
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>

          {kategoriDagilimi.length > 0 && (
            <>
              <Text style={s.sectionH}>{t('kasa.s026')}</Text>
              <View style={s.card}>
                {kategoriDagilimi.map((k) => (
                  <View key={k.kategori} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={s.katLabel}>{statusLabel(lang, k.kategori)} <Text style={s.katSub}>{k.tur}</Text></Text>
                      <Text style={[s.katAmount, { color: k.tur === 'gelir' ? '#166534' : '#991b1b' }]}>{k.tur === 'gelir' ? '+' : '-'}{fmt(k.toplam, 'TRY')}</Text>
                    </View>
                    <View style={s.barBg}><View style={[s.barFill, { width: `${k.pct}%`, backgroundColor: k.tur === 'gelir' ? theme.colors.green : theme.colors.red }]} /></View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={s.sectionH}>{t('kasa.s027')}</Text>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput style={s.searchInput} placeholder={t('kasa.s028')} placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} testID="kasa-search-input" />
          </View>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="wallet-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>{t('kasa.s029')}</Text>
            </View>
          ) : (
            filtered.map((k) => (
              <View key={k.id} style={s.txRow} testID={`kasa-tx-${k.id}`}>
                <View style={[s.txIcon, { backgroundColor: k.tur === 'gelir' ? theme.colors.greenSoft : theme.colors.redSoft }]}>
                  <Ionicons name={k.tur === 'gelir' ? 'arrow-down' : 'arrow-up'} size={16} color={k.tur === 'gelir' ? theme.colors.green : theme.colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.txKat} numberOfLines={1}>{statusLabel(lang, k.kategori)}{k.notlar ? ` · ${k.notlar}` : ''}</Text>
                  <Text style={s.txMeta}>{statusLabel(lang, k.yontem)} · {k.tarih}</Text>
                </View>
                <Text style={[s.txAmount, { color: k.tur === 'gelir' ? theme.colors.green : theme.colors.red }]} numberOfLines={1}>{k.tur === 'gelir' ? '+' : '-'}{fmt(k.tutar, k.paraBirimi)}</Text>
                <TouchableOpacity onPress={() => remove(k.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`kasa-delete-${k.id}`}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  statValue: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  statSubValue: { fontSize: 9.5, fontWeight: '700', marginTop: 2, opacity: 0.75 },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.modules.kasa, letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  turBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', backgroundColor: '#fff' },
  turBtnGelirActive: { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' },
  turBtnGiderActive: { backgroundColor: theme.colors.redSoft, borderColor: '#fca5a5' },
  turBtnText: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff' },
  chipActive: { backgroundColor: theme.colors.modules.kasa, borderColor: theme.colors.modules.kasa },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  curChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff', alignItems: 'center' },
  curChipActive: { backgroundColor: theme.colors.modules.kasa, borderColor: theme.colors.modules.kasa },
  curChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  curChipTextActive: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  inputRequired: { borderColor: theme.colors.red, borderWidth: 1.5 },
  saveBtn: { marginTop: 16, backgroundColor: theme.colors.modules.kasa, paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5, letterSpacing: 0.2 },
  katLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  katSub: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted, textTransform: 'uppercase' },
  katAmount: { fontSize: 12.5, fontWeight: '900' },
  barBg: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  emptyBox: { marginTop: 12, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginTop: 8 },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txKat: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  txMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '900', marginRight: 4 },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
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
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import type { CustomerT } from '@/src/lib/api';
import { YONTEMLER, computeCustomerBalances, sumToTRY, currentRateFor, convertBetween, singleDebtCurrency, customerKey } from '@/src/lib/tahsilat-utils';
import { api, RatesT } from '@/src/lib/api';
import { useLanguage, statusLabel } from '@/src/lib/i18n';

const CURRENCIES = ['TRY', 'USD', 'EUR'];

function fmt(n: number, cur: string = 'TRY') {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}
function todayIso() { return new Date().toISOString().split('T')[0]; }

export default function TahsilatScreen() {
  const { t, lang } = useLanguage();
  const { tahsilat, addTahsilatEntry, deleteTahsilatEntry, customers, activeCompany, showToast, reloadTahsilat } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const pendingSectionY = useRef(0);
  const [rates, setRates] = useState<RatesT | null>(null);

  // Teklif onaylanınca/reddedilince backend otomatik Tahsilat kaydı
  // oluşturuyor/güncelliyor; bu sekmeye her gelindiğinde listeyi tazeleyerek
  // kullanıcının elle yenilemeden en güncel kayıtları görmesini sağlıyoruz.
  useFocusEffect(
    useCallback(() => {
      reloadTahsilat();
    }, [reloadTahsilat]),
  );

  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const [tur, setTur] = useState<'tahsilat' | 'borc'>('tahsilat');
  const [musteriAdi, setMusteriAdi] = useState('');
  const [musteriTelefon, setMusteriTelefon] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [yontem, setYontem] = useState('Nakit');
  const [vadeTarihi, setVadeTarihi] = useState('');
  const [notlar, setNotlar] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const query = musteriAdi.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(query)).slice(0, 6);
  }, [musteriAdi, customers]);

  const pickCustomer = (c: CustomerT) => {
    setMusteriAdi(c.firma);
    setMusteriTelefon(c.telefon || '');
    setSelectedCustomerId(c.id);
    setShowSuggest(false);
  };

  // Her müşterinin borç/tahsilat bakiyesi, PARA BİRİMİ BAZINDA -- önceden bu
  // hesap sadece TRY kayıtlarını sayıyordu, teklif USD/EUR ise (uygulamada
  // çok yaygın) o borç burada hiç görünmüyordu ve TOPLAM ALACAK / BORÇLU
  // MÜŞTERİ kartları sıfır gösteriyordu, halbuki kayıt "SON HAREKETLER"de
  // duruyordu. Artık hiçbir para birimi atlanmıyor.
  const balances = useMemo(() => computeCustomerBalances(tahsilat), [tahsilat]);

  // Toplam alacağı da para birimine göre ayrı ayrı topluyoruz (ör. "$3.000,00 · ₺1.200,00").
  const toplamAlacakByCurrency = useMemo(() => {
    const sums: Record<string, number> = {};
    balances.forEach((b) => b.balances.forEach((x) => { sums[x.paraBirimi] = (sums[x.paraBirimi] || 0) + x.bakiye; }));
    return Object.entries(sums)
      .map(([paraBirimi, tutar]) => ({ paraBirimi, tutar }))
      .sort((a, b) => b.tutar - a.tutar);
  }, [balances]);
  const borcluMusteri = balances.length;

  // Üstteki kart artık Panel'deki hacim kartıyla aynı mantık: dövizli
  // alacaklar da canlı kurla TL'ye çevrilip TEK bir TL toplamı gösteriliyor,
  // altında $/€ dökümü kalıyor.
  const toplamAlacakTRY = useMemo(() => sumToTRY(toplamAlacakByCurrency, rates), [toplamAlacakByCurrency, rates]);

  const filtered = useMemo(() => {
    const list = [...tahsilat].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.id || '').localeCompare(a.id || ''));
    if (!q.trim()) return list;
    const qq = q.trim().toLowerCase();
    return list.filter((t) => t.musteriAdi.toLowerCase().includes(qq) || (t.notlar || '').toLowerCase().includes(qq));
  }, [tahsilat, q]);

  const resetForm = () => {
    setMusteriAdi(''); setMusteriTelefon(''); setSelectedCustomerId('');
    setTutar(''); setVadeTarihi(''); setNotlar('');
  };

  const isDiger = yontem === 'Diğer';

  const save = async () => {
    if (!musteriAdi.trim()) { showToast(t('tahsilat.s002')); return; }
    if (!Number(tutar) || Number(tutar) <= 0) { showToast('Tutar giriniz'); return; }
    if (isDiger && !notlar.trim()) { showToast(t('tahsilat.s003')); return; }
    setSaving(true);
    try {
      let finalTutar = Number(tutar);
      let finalParaBirimi = paraBirimi;
      let finalNotlar = notlar;

      // Müşterinin TEK bir para biriminde borcu varsa ve tahsilat FARKLI bir
      // para biriminde giriliyorsa (ör. $6.000 borç, müşteri ₺ ödedi), o
      // ödemeyi borcun kendi para birimine o günkü kurla çevirip düşüyoruz --
      // aksi halde ödeme ayrı bir bakiye olarak boşta kalıp USD/EUR borcu hiç
      // etkilemiyordu (customer-ledger.tsx'teki aynı mantık, bkz. orada).
      if (tur === 'tahsilat') {
        const key = customerKey({ customerId: selectedCustomerId, musteriAdi: musteriAdi.trim() });
        const musteriBalances = balances.find((b) => b.key === key)?.balances || [];
        const debtCur = singleDebtCurrency(musteriBalances);
        if (debtCur && debtCur !== paraBirimi) {
          const converted = convertBetween(Number(tutar), paraBirimi, debtCur, rates);
          if (converted != null) {
            finalTutar = converted;
            finalParaBirimi = debtCur;
            const orijinalNot = `(${fmt(Number(tutar), paraBirimi)} olarak alındı)`;
            finalNotlar = notlar ? `${notlar} ${orijinalNot}` : orijinalNot;
          } else {
            showToast(t('tahsilat.s004'));
          }
        }
      }

      await addTahsilatEntry({
        customerId: selectedCustomerId,
        musteriAdi: musteriAdi.trim(),
        musteriTelefon,
        tur,
        tutar: finalTutar,
        paraBirimi: finalParaBirimi,
        yontem,
        vadeTarihi: tur === 'borc' ? vadeTarihi : '',
        notlar: finalNotlar,
        tarih: todayIso(),
        kurTRY: currentRateFor(finalParaBirimi, rates),
      });
      showToast(tur === 'tahsilat' ? 'Tahsilat kaydedildi' : t('tahsilat.s005'));
      resetForm();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try { await deleteTahsilatEntry(id); showToast(t('tahsilat.s006')); }
    catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };

  const call = (phone: string) => {
    if (!phone) { showToast(t('tahsilat.s007')); return; }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => showToast(t('tahsilat.s008')));
  };

  const scrollToPending = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, pendingSectionY.current - 8), animated: true });
  };

  // Müşteri bazlı cari hesap (para akışı) ekranına git -- ismi ve varsa
  // müşteri id'sini query param olarak taşıyoruz ki o ekran doğru kaydı
  // filtreleyebilsin.
  const openLedger = (b: { customerId: string; musteriAdi: string; musteriTelefon: string }) => {
    router.push({
      pathname: '/customer-ledger',
      params: { customerId: b.customerId || '', musteriAdi: b.musteriAdi, musteriTelefon: b.musteriTelefon || '' },
    } as any);
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('tahsilat.s009')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('tahsilat.s010')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('tahsilat.s011')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: theme.colors.primarySoft }]}>
              <Text style={[s.statLabel, { color: theme.colors.primaryDark }]}>{t('tahsilat.s012')}</Text>
              <Text style={[s.statValue, { color: theme.colors.primaryDark }]} numberOfLines={1}>
                {toplamAlacakTRY != null ? fmt(toplamAlacakTRY, 'TRY') : fmt(0, 'TRY')}
              </Text>
              {toplamAlacakByCurrency.length > 0 && (
                <Text style={s.statSubValue} numberOfLines={1}>
                  {toplamAlacakByCurrency.map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ')}
                </Text>
              )}
            </View>
            <TouchableOpacity style={[s.statCard, { backgroundColor: '#F1F5F9' }]} onPress={() => router.push('/borclu-musteriler' as any)} testID="tahsilat-borclu-card">
              <Text style={[s.statLabel, { color: theme.colors.textSoft }]}>{t('tahsilat.s013')}</Text>
              <Text style={[s.statValue, { color: theme.colors.text }]} numberOfLines={1}>{borcluMusteri}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.sectionH}>{t('tahsilat.s014')}</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[s.turBtn, tur === 'tahsilat' && s.turBtnGelirActive]} onPress={() => setTur('tahsilat')} testID="tahsilat-tur-tahsilat">
                <Text style={[s.turBtnText, tur === 'tahsilat' && { color: '#166534' }]}>{t('tahsilat.s015')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.turBtn, tur === 'borc' && s.turBtnGiderActive]} onPress={() => setTur('borc')} testID="tahsilat-tur-borc">
                <Text style={[s.turBtnText, tur === 'borc' && { color: '#991b1b' }]}>{t('tahsilat.s016')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>{t('tahsilat.s017')}</Text>
            <View style={{ zIndex: 20 }}>
              <TextInput
                style={s.input}
                placeholder={t('tahsilat.s018')}
                placeholderTextColor="#94a3b8"
                value={musteriAdi}
                onChangeText={(v) => { setMusteriAdi(v); setSelectedCustomerId(''); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                testID="tahsilat-musteri-input"
              />
              {showSuggest && suggestions.length > 0 ? (
                <View style={s.suggestBox}>
                  {suggestions.map((c) => (
                    <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => pickCustomer(c)} testID={`tahsilat-suggest-${c.id}`}>
                      <Ionicons name="person-outline" size={14} color={theme.colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                        <Text style={s.suggestSub} numberOfLines={1}>{[c.yetkili, c.telefon].filter(Boolean).join(' • ') || '-'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1.4 }}>
                <Text style={s.label}>{t('tahsilat.s019')}</Text>
                <TextInput style={s.input} keyboardType="numeric" value={tutar} onChangeText={(v) => setTutar(v.replace(',', '.'))} placeholder="0" placeholderTextColor="#94a3b8" testID="tahsilat-tutar-input" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{t('tahsilat.s020')}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity key={c} style={[s.curChip, paraBirimi === c && s.curChipActive]} onPress={() => setParaBirimi(c)}>
                      <Text style={[s.curChipText, paraBirimi === c && s.curChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {tur === 'tahsilat' ? (
              <>
                <Text style={[s.label, { marginTop: 10 }]}>{t('tahsilat.s021')}</Text>
                <View style={s.chipRow}>
                  {YONTEMLER.map((y) => (
                    <TouchableOpacity key={y} style={[s.chip, yontem === y && s.chipActive]} onPress={() => setYontem(y)}>
                      <Text style={[s.chipText, yontem === y && s.chipTextActive]}>{statusLabel(lang, y)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={s.label}>{t('tahsilat.s022')}</Text>
                <TextInput style={s.input} value={vadeTarihi} onChangeText={setVadeTarihi} placeholder={t('tahsilat.s023')} placeholderTextColor="#94a3b8" testID="tahsilat-vade-input" />
              </View>
            )}

            <Text style={[s.label, { marginTop: 10 }]}>{isDiger ? t('tahsilat.s024') : 'NOT (opsiyonel)'}</Text>
            <TextInput
              style={[s.input, isDiger && !notlar.trim() && s.inputRequired]}
              value={notlar}
              onChangeText={setNotlar}
              placeholder={isDiger ? t('tahsilat.s025') : t('tahsilat.s026')}
              placeholderTextColor="#94a3b8"
              testID="tahsilat-not-input"
            />

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save} testID="tahsilat-save-btn">
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>

          <View onLayout={(e) => { pendingSectionY.current = e.nativeEvent.layout.y; }}>
            <Text style={s.sectionH}>{t('tahsilat.s027')}</Text>
          </View>
          {balances.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>{t('tahsilat.s028')}</Text>
            </View>
          ) : (
            <View style={s.card}>
              {balances.map((b, i) => (
                <View key={b.key} style={[s.pendingRow, i === balances.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.pendingName} numberOfLines={1}>{b.musteriAdi}</Text>
                      {b.hasOverdue ? <View style={s.overdueTag}><Text style={s.overdueTagText}>{t('tahsilat.s029')}</Text></View> : null}
                    </View>
                    {b.musteriTelefon ? <Text style={s.pendingPhone}>{b.musteriTelefon}</Text> : null}
                    {b.balances.map((x) => (
                      <Text key={x.paraBirimi} style={s.pendingAmount}>{fmt(x.bakiye, x.paraBirimi)}</Text>
                    ))}
                  </View>
                  <TouchableOpacity style={s.ledgerBtn} onPress={() => openLedger(b)} testID={`tahsilat-ledger-${b.key}`}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.modules.tahsilat} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.callBtn} onPress={() => call(b.musteriTelefon)} testID={`tahsilat-call-${b.key}`}>
                    <Ionicons name="call-outline" size={15} color={theme.colors.primary} />
                    <Text style={s.callBtnText}>{t('tahsilat.s030')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={s.sectionH}>{t('tahsilat.s031')}</Text>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput style={s.searchInput} placeholder={t('tahsilat.s032')} placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} testID="tahsilat-search-input" />
          </View>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="wallet-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>{t('tahsilat.s033')}</Text>
            </View>
          ) : (
            filtered.map((tx) => (
              <View key={tx.id} style={s.txRow} testID={`tahsilat-tx-${tx.id}`}>
                <View style={[s.txIcon, { backgroundColor: tx.tur === 'tahsilat' ? theme.colors.greenSoft : theme.colors.redSoft }]}>
                  <Ionicons name={tx.tur === 'tahsilat' ? 'arrow-down' : 'arrow-up'} size={16} color={tx.tur === 'tahsilat' ? theme.colors.green : theme.colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.txKat} numberOfLines={1}>{tx.musteriAdi}{tx.notlar ? ` · ${tx.notlar}` : ''}</Text>
                  <Text style={s.txMeta}>
                    {tx.tur === 'tahsilat' ? statusLabel(lang, tx.yontem) : t('tahsilat.s034')}{tx.vadeTarihi ? ` · Vade: ${tx.vadeTarihi}` : ''} · {tx.tarih}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: tx.tur === 'tahsilat' ? theme.colors.green : theme.colors.red }]} numberOfLines={1}>
                  {tx.tur === 'tahsilat' ? '+' : '-'}{fmt(tx.tutar, tx.paraBirimi)}
                </Text>
                <TouchableOpacity onPress={() => remove(tx.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`tahsilat-delete-${tx.id}`}>
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
  statSubValue: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, marginTop: 2 },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.modules.tahsilat, letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  turBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', backgroundColor: '#fff' },
  turBtnGelirActive: { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' },
  turBtnGiderActive: { backgroundColor: theme.colors.redSoft, borderColor: '#fca5a5' },
  turBtnText: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  inputRequired: { borderColor: theme.colors.red, borderWidth: 1.5 },
  suggestBox: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.md, maxHeight: 220, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  suggestName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  suggestSub: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff' },
  chipActive: { backgroundColor: theme.colors.modules.tahsilat, borderColor: theme.colors.modules.tahsilat },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  curChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff', alignItems: 'center' },
  curChipActive: { backgroundColor: theme.colors.modules.tahsilat, borderColor: theme.colors.modules.tahsilat },
  curChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  curChipTextActive: { color: '#fff' },
  saveBtn: { marginTop: 16, backgroundColor: theme.colors.modules.tahsilat, paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5, letterSpacing: 0.2 },
  emptyBox: { marginTop: 4, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  pendingName: { fontSize: 13, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  pendingPhone: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  pendingAmount: { fontSize: 13.5, fontWeight: '900', color: theme.colors.text },
  overdueTag: { backgroundColor: theme.colors.redSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  overdueTagText: { fontSize: 9, fontWeight: '800', color: '#991b1b' },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  ledgerBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0F2FE', marginRight: 6 },
  callBtnText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginTop: 8 },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txKat: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  txMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '900', marginRight: 4 },
});

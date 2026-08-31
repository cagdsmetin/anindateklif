import React, { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { YONTEMLER, customerKey, convertBetween, singleDebtCurrency } from '@/src/lib/tahsilat-utils';
import { api, RatesT } from '@/src/lib/api';
import { useLanguage, statusLabel } from '@/src/lib/i18n';

/**
 * Müşteri bazlı cari hesap (para akışı) ekranı.
 * - Standalone route (customer-add.tsx gibi) -- kalıcı bir menü hedefi değil,
 *   "Tahsilat" ekranındaki bir müşteriye dokununca açılan, geçmişe bakıp
 *   kapatılan bir detay ekranı.
 * - O tek müşterinin TÜM borç/tahsilat geçmişini (kronolojik, en yeni üstte)
 *   ve para birimine göre net bakiyesini gösterir.
 * - Aynı ekrandan yeni borç/tahsilat kaydı eklenebilir -- yöntem listesinde
 *   "Çek" de var (tahsilat-utils.ts üzerinden Tahsilat ekranıyla ortak liste).
 */
export default function CustomerLedgerScreen() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tahsilat, addTahsilatEntry, deleteTahsilatEntry, showToast } = useApp();
  const params = useLocalSearchParams<{ customerId?: string; musteriAdi?: string; musteriTelefon?: string }>();

  const customerId = typeof params.customerId === 'string' ? params.customerId : '';
  const musteriAdi = typeof params.musteriAdi === 'string' ? params.musteriAdi : '';
  const musteriTelefon = typeof params.musteriTelefon === 'string' ? params.musteriTelefon : '';

  const targetKey = customerKey({ customerId, musteriAdi });

  const entries = useMemo(() => {
    return [...tahsilat]
      .filter((t) => customerKey(t) === targetKey)
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.id || '').localeCompare(a.id || ''));
  }, [tahsilat, targetKey]);

  const balancesByCurrency = useMemo(() => {
    const sums: Record<string, number> = {};
    entries.forEach((t) => {
      const cur = t.paraBirimi || 'TRY';
      sums[cur] = (sums[cur] || 0) + (t.tur === 'borc' ? t.tutar : -t.tutar);
    });
    return Object.entries(sums)
      .map(([paraBirimi, bakiye]) => ({ paraBirimi, bakiye }))
      .filter((b) => Math.abs(b.bakiye) > 0.009)
      .sort((a, b) => Math.abs(b.bakiye) - Math.abs(a.bakiye));
  }, [entries]);

  const [rates, setRates] = useState<RatesT | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const [tur, setTur] = useState<'tahsilat' | 'borc'>('tahsilat');
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [yontem, setYontem] = useState('Nakit');
  const [vadeTarihi, setVadeTarihi] = useState('');
  const [notlar, setNotlar] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const isDiger = yontem === 'Diğer';

  const call = () => {
    if (!musteriTelefon) { showToast(t('customerLedger.s002')); return; }
    Linking.openURL(`tel:${musteriTelefon.replace(/\s+/g, '')}`).catch(() => showToast(t('customerLedger.s003')));
  };

  const save = async () => {
    if (!Number(tutar) || Number(tutar) <= 0) { showToast('Tutar giriniz'); return; }
    if (isDiger && !notlar.trim()) { showToast(t('customerLedger.s004')); return; }
    setSaving(true);
    try {
      let finalTutar = Number(tutar);
      let finalParaBirimi = paraBirimi;
      let finalNotlar = notlar;

      // Müşterinin TEK bir para biriminde borcu varsa ve ödeme FARKLI bir
      // para biriminde giriliyorsa (ör. $6.000 borç, müşteri ₺ ödedi), o
      // ödemeyi borcun kendi para birimine o günkü kurla çevirip düşüyoruz.
      // Aksi halde ödeme ayrı bir bakiye olarak "boşta" kalıp borcu hiç
      // etkilemiyordu. Kur bilinmiyorsa ya da müşterinin birden fazla para
      // biriminde borcu varsa (belirsiz), hiçbir şey değiştirmeden girilen
      // haliyle kaydediyoruz.
      if (tur === 'tahsilat') {
        const debtCur = singleDebtCurrency(balancesByCurrency);
        if (debtCur && debtCur !== paraBirimi) {
          const converted = convertBetween(Number(tutar), paraBirimi, debtCur, rates);
          if (converted != null) {
            finalTutar = converted;
            finalParaBirimi = debtCur;
            const orijinalNot = `(${fmt(Number(tutar), paraBirimi)} olarak alındı)`;
            finalNotlar = notlar ? `${notlar} ${orijinalNot}` : orijinalNot;
          } else {
            showToast(t('customerLedger.s005'));
          }
        }
      }

      await addTahsilatEntry({
        customerId,
        musteriAdi,
        musteriTelefon,
        tur,
        tutar: finalTutar,
        paraBirimi: finalParaBirimi,
        yontem,
        vadeTarihi: tur === 'borc' ? vadeTarihi : '',
        notlar: finalNotlar,
        tarih: new Date().toISOString().split('T')[0],
      });
      showToast(tur === 'tahsilat' ? 'Tahsilat kaydedildi' : t('customerLedger.s006'));
      setTutar(''); setVadeTarihi(''); setNotlar(''); setFormOpen(false);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try { await deleteTahsilatEntry(id); showToast(t('customerLedger.s007')); }
    catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };

  function fmt(n: number, cur: string = 'TRY') {
    const str = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
    return `${sym}${str}`;
  }
  function trDate(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle} numberOfLines={1}>{musteriAdi || t('customerLedger.s008')}</Text>
          <Text style={s.headerSub}>{t('customerLedger.s009')}</Text>
        </View>
        <TouchableOpacity onPress={call} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="call-outline" size={20} color={theme.colors.modules.tahsilat} />
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>{t('customerLedger.s010')}</Text>
            {balancesByCurrency.length === 0 ? (
              <Text style={s.balanceZero}>{t('customerLedger.s011')}</Text>
            ) : (
              balancesByCurrency.map((b) => (
                <View key={b.paraBirimi} style={s.balanceRow}>
                  <Text style={[s.balanceValue, { color: b.bakiye > 0 ? theme.colors.text : '#059669' }]}>
                    {fmt(Math.abs(b.bakiye), b.paraBirimi)}
                  </Text>
                  <Text style={s.balanceTag}>{b.bakiye > 0 ? t('customerLedger.s012') : t('customerLedger.s013')}</Text>
                </View>
              ))
            )}
          </View>

          {!formOpen ? (
            <TouchableOpacity style={s.addBtn} onPress={() => setFormOpen(true)} testID="ledger-add-open">
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={s.addBtnText}>{t('customerLedger.s014')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.card}>
              <View style={s.turRow}>
                <TouchableOpacity style={[s.turBtn, tur === 'tahsilat' && s.turBtnActiveGreen]} onPress={() => setTur('tahsilat')}>
                  <Text style={[s.turBtnText, tur === 'tahsilat' && s.turBtnTextActive]}>{t('customerLedger.s015')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.turBtn, tur === 'borc' && s.turBtnActiveRed]} onPress={() => setTur('borc')}>
                  <Text style={[s.turBtnText, tur === 'borc' && s.turBtnTextActive]}>{t('customerLedger.s016')}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.amountRow}>
                <TextInput
                  style={s.amountInput}
                  placeholder={t('customerLedger.s017')}
                  keyboardType="decimal-pad"
                  value={tutar}
                  onChangeText={setTutar}
                  placeholderTextColor={theme.colors.textMuted}
                />
                <View style={s.currencyChips}>
                  {['TRY', 'USD', 'EUR'].map((c) => (
                    <TouchableOpacity key={c} style={[s.currChip, paraBirimi === c && s.currChipActive]} onPress={() => setParaBirimi(c)}>
                      <Text style={[s.currChipText, paraBirimi === c && s.currChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {tur === 'tahsilat' ? (
                <View style={s.chipRow}>
                  {YONTEMLER.map((y) => (
                    <TouchableOpacity key={y} style={[s.methodChip, yontem === y && s.methodChipActive]} onPress={() => setYontem(y)}>
                      <Text style={[s.methodChipText, yontem === y && s.methodChipTextActive]}>{statusLabel(lang, y)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={s.input}
                  placeholder={t('customerLedger.s018')}
                  value={vadeTarihi}
                  onChangeText={setVadeTarihi}
                  placeholderTextColor={theme.colors.textMuted}
                />
              )}

              <TextInput
                style={[s.input, { marginTop: 10 }, isDiger && s.inputHighlight]}
                placeholder={isDiger ? t('customerLedger.s019') : 'Not (opsiyonel)'}
                value={notlar}
                onChangeText={setNotlar}
                placeholderTextColor={theme.colors.textMuted}
              />

              <View style={s.formActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setFormOpen(false)}>
                  <Text style={s.cancelBtnText}>{t('customerLedger.s020')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={s.sectionH}>{t('customerLedger.s021')}</Text>
          {entries.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="time-outline" size={28} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>{t('customerLedger.s022')}</Text>
            </View>
          ) : (
            <View style={s.card}>
              {entries.map((tx, i) => (
                <View key={tx.id} style={[s.entryRow, i === entries.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <View style={[s.entryIcon, { backgroundColor: tx.tur === 'borc' ? '#FEF2F2' : '#ECFDF5' }]}>
                    <Ionicons name={tx.tur === 'borc' ? 'arrow-up' : 'arrow-down'} size={15} color={tx.tur === 'borc' ? '#DC2626' : '#059669'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryTitle}>{tx.tur === 'borc' ? t('customerLedger.s023') : t('nav.tahsilat')} · {statusLabel(lang, tx.yontem)}</Text>
                    <Text style={s.entryMeta}>{trDate(tx.tarih)}{tx.notlar ? ' · ' + tx.notlar : ''}</Text>
                  </View>
                  <Text style={[s.entryAmount, { color: tx.tur === 'borc' ? '#DC2626' : '#059669' }]}>
                    {tx.tur === 'borc' ? '+' : '-'}{fmt(tx.tutar, tx.paraBirimi)}
                  </Text>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => remove(tx.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={15} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  headerSub: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600', marginTop: 1 },
  divider: { height: 1, backgroundColor: theme.colors.line },

  balanceCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 14, ...theme.shadow.sm },
  balanceLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  balanceZero: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  balanceValue: { fontSize: 20, fontWeight: '900' },
  balanceTag: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.modules.tahsilat, borderRadius: 12, paddingVertical: 13, marginBottom: 14 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 14, ...theme.shadow.sm },

  turRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  turBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  turBtnActiveGreen: { backgroundColor: '#059669' },
  turBtnActiveRed: { backgroundColor: '#DC2626' },
  turBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  turBtnTextActive: { color: '#fff' },

  amountRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  amountInput: { flex: 1, backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 15, color: theme.colors.text },
  currencyChips: { flexDirection: 'row', gap: 4 },
  currChip: { paddingHorizontal: 10, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  currChipActive: { backgroundColor: theme.colors.modules.tahsilat },
  currChipText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  currChipTextActive: { color: '#fff' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  methodChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#F1F5F9' },
  methodChipActive: { backgroundColor: theme.colors.modules.tahsilat },
  methodChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  methodChipTextActive: { color: '#fff' },

  input: { backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 14, color: theme.colors.text },
  inputHighlight: { borderColor: theme.colors.red, backgroundColor: '#FEF2F2' },

  formActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9' },
  cancelBtnText: { fontWeight: '700', color: theme.colors.text, fontSize: 13 },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: theme.colors.modules.tahsilat },
  saveBtnText: { fontWeight: '800', color: '#fff', fontSize: 13 },

  sectionH: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: theme.colors.line, gap: 6 },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },

  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  entryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  entryMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  entryAmount: { fontSize: 13.5, fontWeight: '900' },
  deleteBtn: { padding: 4 },
});

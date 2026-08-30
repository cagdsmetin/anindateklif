import React, { useMemo, useState } from 'react';
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
import { YONTEMLER, customerKey } from '@/src/lib/tahsilat-utils';

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
    if (!musteriTelefon) { showToast('Telefon numarası kayıtlı değil'); return; }
    Linking.openURL(`tel:${musteriTelefon.replace(/\s+/g, '')}`).catch(() => showToast('Arama başlatılamadı'));
  };

  const save = async () => {
    if (!Number(tutar) || Number(tutar) <= 0) { showToast('Tutar giriniz'); return; }
    if (isDiger && !notlar.trim()) { showToast("'Diğer' seçtiniz, lütfen açıklama yazın"); return; }
    setSaving(true);
    try {
      await addTahsilatEntry({
        customerId,
        musteriAdi,
        musteriTelefon,
        tur,
        tutar: Number(tutar),
        paraBirimi,
        yontem,
        vadeTarihi: tur === 'borc' ? vadeTarihi : '',
        notlar,
        tarih: new Date().toISOString().split('T')[0],
      });
      showToast(tur === 'tahsilat' ? 'Tahsilat kaydedildi' : 'Borç eklendi');
      setTutar(''); setVadeTarihi(''); setNotlar(''); setFormOpen(false);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try { await deleteTahsilatEntry(id); showToast('Kayıt silindi'); }
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
          <Text style={s.headerTitle} numberOfLines={1}>{musteriAdi || 'Müşteri'}</Text>
          <Text style={s.headerSub}>Para Akışı</Text>
        </View>
        <TouchableOpacity onPress={call} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="call-outline" size={20} color={theme.colors.modules.tahsilat} />
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>GÜNCEL BAKİYE</Text>
            {balancesByCurrency.length === 0 ? (
              <Text style={s.balanceZero}>Bakiye yok, hesap kapalı.</Text>
            ) : (
              balancesByCurrency.map((b) => (
                <View key={b.paraBirimi} style={s.balanceRow}>
                  <Text style={[s.balanceValue, { color: b.bakiye > 0 ? theme.colors.text : '#059669' }]}>
                    {fmt(Math.abs(b.bakiye), b.paraBirimi)}
                  </Text>
                  <Text style={s.balanceTag}>{b.bakiye > 0 ? 'bize borçlu' : 'bizden alacaklı'}</Text>
                </View>
              ))
            )}
          </View>

          {!formOpen ? (
            <TouchableOpacity style={s.addBtn} onPress={() => setFormOpen(true)} testID="ledger-add-open">
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={s.addBtnText}>Yeni Kayıt Ekle</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.card}>
              <View style={s.turRow}>
                <TouchableOpacity style={[s.turBtn, tur === 'tahsilat' && s.turBtnActiveGreen]} onPress={() => setTur('tahsilat')}>
                  <Text style={[s.turBtnText, tur === 'tahsilat' && s.turBtnTextActive]}>Tahsilat Aldım</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.turBtn, tur === 'borc' && s.turBtnActiveRed]} onPress={() => setTur('borc')}>
                  <Text style={[s.turBtnText, tur === 'borc' && s.turBtnTextActive]}>Borç Ekle</Text>
                </TouchableOpacity>
              </View>

              <View style={s.amountRow}>
                <TextInput
                  style={s.amountInput}
                  placeholder="Tutar"
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
                      <Text style={[s.methodChipText, yontem === y && s.methodChipTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={s.input}
                  placeholder="Vade tarihi (YYYY-AA-GG, opsiyonel)"
                  value={vadeTarihi}
                  onChangeText={setVadeTarihi}
                  placeholderTextColor={theme.colors.textMuted}
                />
              )}

              <TextInput
                style={[s.input, { marginTop: 10 }, isDiger && s.inputHighlight]}
                placeholder={isDiger ? 'Açıklama giriniz (zorunlu)' : 'Not (opsiyonel)'}
                value={notlar}
                onChangeText={setNotlar}
                placeholderTextColor={theme.colors.textMuted}
              />

              <View style={s.formActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setFormOpen(false)}>
                  <Text style={s.cancelBtnText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={s.sectionH}>GEÇMİŞ</Text>
          {entries.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="time-outline" size={28} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Henüz kayıt yok.</Text>
            </View>
          ) : (
            <View style={s.card}>
              {entries.map((t, i) => (
                <View key={t.id} style={[s.entryRow, i === entries.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <View style={[s.entryIcon, { backgroundColor: t.tur === 'borc' ? '#FEF2F2' : '#ECFDF5' }]}>
                    <Ionicons name={t.tur === 'borc' ? 'arrow-up' : 'arrow-down'} size={15} color={t.tur === 'borc' ? '#DC2626' : '#059669'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.entryTitle}>{t.tur === 'borc' ? 'Borç' : 'Tahsilat'} · {t.yontem}</Text>
                    <Text style={s.entryMeta}>{trDate(t.tarih)}{t.notlar ? ' · ' + t.notlar : ''}</Text>
                  </View>
                  <Text style={[s.entryAmount, { color: t.tur === 'borc' ? '#DC2626' : '#059669' }]}>
                    {t.tur === 'borc' ? '+' : '-'}{fmt(t.tutar, t.paraBirimi)}
                  </Text>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => remove(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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

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
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import type { CustomerT } from '@/src/lib/api';

const YONTEMLER = ['Nakit', 'Kart', 'Havale/EFT', 'Diğer'];
const CURRENCIES = ['TRY', 'USD', 'EUR'];

function fmt(n: number, cur: string = 'TRY') {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}
function todayIso() { return new Date().toISOString().split('T')[0]; }

export default function TahsilatScreen() {
  const { tahsilat, addTahsilatEntry, deleteTahsilatEntry, customers, activeCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();

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

  // Per-customer receivable balance: sum(borç) - sum(tahsilat), TRY only for a single
  // meaningful headline number (mirrors the Kasa screen's approach to mixed currencies).
  const balances = useMemo(() => {
    const map: Record<string, { key: string; musteriAdi: string; musteriTelefon: string; bakiye: number; hasOverdue: boolean }> = {};
    const today = todayIso();
    tahsilat.forEach((t) => {
      if ((t.paraBirimi || 'TRY') !== 'TRY') return;
      const key = t.customerId || `ad:${t.musteriAdi}`;
      if (!map[key]) map[key] = { key, musteriAdi: t.musteriAdi, musteriTelefon: t.musteriTelefon, bakiye: 0, hasOverdue: false };
      map[key].bakiye += t.tur === 'borc' ? t.tutar : -t.tutar;
      if (t.tur === 'borc' && t.vadeTarihi && t.vadeTarihi < today) map[key].hasOverdue = true;
    });
    return Object.values(map).filter((m) => m.bakiye > 0.009).sort((a, b) => b.bakiye - a.bakiye);
  }, [tahsilat]);

  const toplamAlacak = balances.reduce((a, b) => a + b.bakiye, 0);
  const borcluMusteri = balances.length;

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
    if (!musteriAdi.trim()) { showToast('Müşteri adı giriniz'); return; }
    if (!Number(tutar) || Number(tutar) <= 0) { showToast('Tutar giriniz'); return; }
    if (isDiger && !notlar.trim()) { showToast("'Diğer' seçtiniz, lütfen açıklama yazın"); return; }
    setSaving(true);
    try {
      await addTahsilatEntry({
        customerId: selectedCustomerId,
        musteriAdi: musteriAdi.trim(),
        musteriTelefon,
        tur,
        tutar: Number(tutar),
        paraBirimi,
        yontem,
        vadeTarihi: tur === 'borc' ? vadeTarihi : '',
        notlar,
        tarih: todayIso(),
      });
      showToast(tur === 'tahsilat' ? 'Tahsilat kaydedildi' : 'Borç eklendi');
      resetForm();
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

  const call = (phone: string) => {
    if (!phone) { showToast('Telefon numarası kayıtlı değil'); return; }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => showToast('Arama başlatılamadı'));
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Tahsilat" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Tahsilat & Bakiye" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: theme.colors.primarySoft }]}>
              <Text style={[s.statLabel, { color: theme.colors.primaryDark }]}>TOPLAM ALACAK</Text>
              <Text style={[s.statValue, { color: theme.colors.primaryDark }]} numberOfLines={1}>{fmt(toplamAlacak)}</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[s.statLabel, { color: theme.colors.textSoft }]}>BORÇLU MÜŞTERİ</Text>
              <Text style={[s.statValue, { color: theme.colors.text }]} numberOfLines={1}>{borcluMusteri}</Text>
            </View>
          </View>

          <Text style={s.sectionH}>YENİ KAYIT</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[s.turBtn, tur === 'tahsilat' && s.turBtnGelirActive]} onPress={() => setTur('tahsilat')} testID="tahsilat-tur-tahsilat">
                <Text style={[s.turBtnText, tur === 'tahsilat' && { color: '#166534' }]}>Tahsilat (+)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.turBtn, tur === 'borc' && s.turBtnGiderActive]} onPress={() => setTur('borc')} testID="tahsilat-tur-borc">
                <Text style={[s.turBtnText, tur === 'borc' && { color: '#991b1b' }]}>Borç Ekle</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>MÜŞTERİ</Text>
            <View style={{ zIndex: 20 }}>
              <TextInput
                style={s.input}
                placeholder="Müşteri adı yazın veya seçin"
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
                <Text style={s.label}>TUTAR</Text>
                <TextInput style={s.input} keyboardType="numeric" value={tutar} onChangeText={(v) => setTutar(v.replace(',', '.'))} placeholder="0" placeholderTextColor="#94a3b8" testID="tahsilat-tutar-input" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>PARA BİRİMİ</Text>
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
                <Text style={[s.label, { marginTop: 10 }]}>YÖNTEM</Text>
                <View style={s.chipRow}>
                  {YONTEMLER.map((y) => (
                    <TouchableOpacity key={y} style={[s.chip, yontem === y && s.chipActive]} onPress={() => setYontem(y)}>
                      <Text style={[s.chipText, yontem === y && s.chipTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={s.label}>VADE TARİHİ (opsiyonel)</Text>
                <TextInput style={s.input} value={vadeTarihi} onChangeText={setVadeTarihi} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" testID="tahsilat-vade-input" />
              </View>
            )}

            <Text style={[s.label, { marginTop: 10 }]}>{isDiger ? "NOT (zorunlu — 'Diğer' seçtiniz)" : 'NOT (opsiyonel)'}</Text>
            <TextInput
              style={[s.input, isDiger && !notlar.trim() && s.inputRequired]}
              value={notlar}
              onChangeText={setNotlar}
              placeholder={isDiger ? "Ne için olduğunu açıklayın..." : 'Açıklama...'}
              placeholderTextColor="#94a3b8"
              testID="tahsilat-not-input"
            />

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save} testID="tahsilat-save-btn">
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.sectionH}>BEKLEYEN ALACAKLAR</Text>
          {balances.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>Bekleyen alacak yok.</Text>
            </View>
          ) : (
            <View style={s.card}>
              {balances.map((b, i) => (
                <View key={b.key} style={[s.pendingRow, i === balances.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.pendingName} numberOfLines={1}>{b.musteriAdi}</Text>
                      {b.hasOverdue ? <View style={s.overdueTag}><Text style={s.overdueTagText}>Vadesi geçti</Text></View> : null}
                    </View>
                    {b.musteriTelefon ? <Text style={s.pendingPhone}>{b.musteriTelefon}</Text> : null}
                  </View>
                  <Text style={s.pendingAmount}>{fmt(b.bakiye)}</Text>
                  <TouchableOpacity style={s.callBtn} onPress={() => call(b.musteriTelefon)} testID={`tahsilat-call-${b.key}`}>
                    <Ionicons name="call-outline" size={15} color={theme.colors.primary} />
                    <Text style={s.callBtnText}>Hatırlat</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={s.sectionH}>SON HAREKETLER</Text>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput style={s.searchInput} placeholder="Müşteri veya not ara..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} testID="tahsilat-search-input" />
          </View>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="wallet-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>Henüz kayıt yok.</Text>
            </View>
          ) : (
            filtered.map((t) => (
              <View key={t.id} style={s.txRow} testID={`tahsilat-tx-${t.id}`}>
                <View style={[s.txIcon, { backgroundColor: t.tur === 'tahsilat' ? theme.colors.greenSoft : theme.colors.redSoft }]}>
                  <Ionicons name={t.tur === 'tahsilat' ? 'arrow-down' : 'arrow-up'} size={16} color={t.tur === 'tahsilat' ? theme.colors.green : theme.colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.txKat} numberOfLines={1}>{t.musteriAdi}{t.notlar ? ` · ${t.notlar}` : ''}</Text>
                  <Text style={s.txMeta}>
                    {t.tur === 'tahsilat' ? t.yontem : 'Borç'}{t.vadeTarihi ? ` · Vade: ${t.vadeTarihi}` : ''} · {t.tarih}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: t.tur === 'tahsilat' ? theme.colors.green : theme.colors.red }]} numberOfLines={1}>
                  {t.tur === 'tahsilat' ? '+' : '-'}{fmt(t.tutar, t.paraBirimi)}
                </Text>
                <TouchableOpacity onPress={() => remove(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`tahsilat-delete-${t.id}`}>
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
  callBtnText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginTop: 8 },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txKat: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  txMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '900', marginRight: 4 },
});

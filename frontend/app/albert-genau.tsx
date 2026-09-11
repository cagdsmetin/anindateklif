import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { api, AlbertGenauResultT, AlbertGenauTypesResponseT } from '@/src/lib/api';

// Albert Genau parametrik pergola/bioklimatik hesaplayıcı — genel Katalog ve
// Ürün/Hizmet Yapılandırıcı'dan tamamen ayrı bir bölüm. Dealer genişlik/
// derinlik/yükseklik (mm) girer, Albert Genau'nun kendi Excel maliyet
// analizinden çıkarılmış gerçek formüllerle (backend/albert_genau_calc.py)
// tam malzeme listesi + fiyat otomatik hesaplanır. Montaj bedeli ve kar
// marjı burada dealer tarafından serbestçe belirlenir.

const FALLBACK_TYPES = [
  { id: '4ayak_ustu', label: 'AG BIOFLEX 4 Ayak Üstü' },
  { id: '2ayak_duvar', label: 'AG BIOFLEX 2 Ayak Duvar' },
  { id: 'ayaksiz', label: 'AG BIOFLEX Ayaksız' },
  { id: 'sabit_4ayak_ustu', label: 'AG BIO Sabit 4 Ayak Üstü' },
  { id: 'sabit_duvar', label: 'AG BIO Sabit Duvar' },
];

const FALLBACK_FINISHES = ['SATINE_NATUREL', 'ANTRASIT_GRI', 'BRONZ_1122_BOYALI', 'DIGER_RAL', 'BRONZ_ELOKSAL', 'PRES'];

const FINISH_LABELS: Record<string, string> = {
  SATINE_NATUREL: 'Satine Naturel',
  ANTRASIT_GRI: 'Antrasit Gri',
  BRONZ_1122_BOYALI: 'Bronz 1122 Boyalı',
  DIGER_RAL: 'Diğer RAL Renkleri (+%15)',
  BRONZ_ELOKSAL: 'Bronz Eloksal (+%10)',
  PRES: 'Preslenmiş (-%10)',
};

function needsHeight(tip: string) { return tip !== 'ayaksiz'; }
function hasMotorOption(tip: string) { return ['4ayak_ustu', '2ayak_duvar', 'ayaksiz'].includes(tip); }
function hasWallBracketOption(tip: string) { return ['2ayak_duvar', 'ayaksiz', 'sabit_duvar'].includes(tip); }

function money(n: number) {
  return (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AlbertGenauScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast, toast } = useApp();

  const [meta, setMeta] = useState<AlbertGenauTypesResponseT>({ types: FALLBACK_TYPES, finishes: FALLBACK_FINISHES });
  const [tip, setTip] = useState('4ayak_ustu');
  const [genislik, setGenislik] = useState('');
  const [derinlik, setDerinlik] = useState('');
  const [yukseklik, setYukseklik] = useState('');
  const [cornerFlat, setCornerFlat] = useState(false);
  const [somfy, setSomfy] = useState(false);
  const [noWallBracket, setNoWallBracket] = useState(false);
  const [finish, setFinish] = useState<string>('SATINE_NATUREL');
  const [ledOption, setLedOption] = useState<'' | 'warm' | 'warm_rgb'>('');
  const [ledMidSupport, setLedMidSupport] = useState(false);
  const [kopuk, setKopuk] = useState(false);
  const [montajBedeli, setMontajBedeli] = useState('0');
  const [karMarjiPct, setKarMarjiPct] = useState('0');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AlbertGenauResultT | null>(null);
  const [showKalemler, setShowKalemler] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.albertGenauTypes().then(setMeta).catch(() => {});
  }, []);

  const selectedTypeLabel = useMemo(
    () => meta.types.find((x) => x.id === tip)?.label || tip,
    [meta.types, tip],
  );

  const onCalculate = async () => {
    setError('');
    const g = Number(genislik.replace(',', '.'));
    const d = Number(derinlik.replace(',', '.'));
    const y = needsHeight(tip) ? Number(yukseklik.replace(',', '.')) : undefined;
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!d || d <= 0) { setError('Derinlik (mm) girin'); return; }
    if (needsHeight(tip) && (!y || y <= 0)) { setError('Yükseklik (mm) girin'); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await api.albertGenauCalculate({
        tip,
        genislikMm: g,
        derinlikMm: d,
        yukseklikMm: y,
        cornerFlat,
        somfy: hasMotorOption(tip) ? somfy : false,
        noWallBracket: hasWallBracketOption(tip) ? noWallBracket : false,
        finish,
        ledOption: ledOption || null,
        ledMidSupport: ledOption ? ledMidSupport : false,
        kopuk,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const buildAciklama = (r: AlbertGenauResultT) => {
    const parts = [
      `${r.girdi.genislikMm}×${r.girdi.yapilabilirDerinlikMm}mm`,
      r.girdi.yukseklikMm ? `Y:${r.girdi.yukseklikMm}mm` : null,
      `${r.girdi.modulSayisi} modül`,
      FINISH_LABELS[finish] || finish,
      somfy && hasMotorOption(tip) ? 'Motorlu (Somfy)' : null,
      cornerFlat ? 'Düz köşe' : null,
      kopuk ? 'Panel dolgu (köpük)' : null,
      ledOption === 'warm' ? 'Sıcak LED' : ledOption === 'warm_rgb' ? 'Sıcak + RGB LED' : null,
    ].filter(Boolean);
    return `${r.tipAdi} — ${parts.join(', ')}`;
  };

  const onAddToQuote = () => {
    if (!result) return;
    if (adding) return;
    setAdding(true);
    const payload = {
      urunAdi: result.tipAdi,
      aciklama: buildAciklama(result),
      birimFiyat: Math.round(result.satisFiyati * 100) / 100,
    };
    router.push({ pathname: '/(tabs)/teklif', params: { albertGenau: JSON.stringify(payload) } });
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {toast ? (
        <View style={s.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Albert Genau Fiyat Hesaplama</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.contentWrap}>
            <View style={s.hero}>
              <View style={s.heroCircle}>
                <Ionicons name="calculator" size={24} color={theme.colors.primary} />
              </View>
              <Text style={s.heroCaption}>Ölçüleri girin, sistem otomatik malzeme + fiyat hesabı yapsın</Text>
            </View>

            {/* Sistem tipi */}
            <View style={s.card}>
              <Text style={s.fieldLabel}>Sistem Tipi</Text>
              <View style={s.typeWrap}>
                {meta.types.map((tp) => (
                  <TouchableOpacity
                    key={tp.id}
                    style={[s.typePill, tip === tp.id && s.typePillActive]}
                    onPress={() => { setTip(tp.id); setResult(null); }}
                    testID={`ag-type-${tp.id}`}
                  >
                    <Text style={[s.typePillText, tip === tp.id && s.typePillTextActive]}>{tp.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Ölçüler (sarı alanlar) */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Ölçüler (mm)</Text>
              <View style={s.row}>
                <NumField label="Genişlik" value={genislik} onChange={setGenislik} testID="ag-genislik" />
                <NumField label="Derinlik" value={derinlik} onChange={setDerinlik} testID="ag-derinlik" />
              </View>
              {needsHeight(tip) ? (
                <NumField label="Yükseklik" value={yukseklik} onChange={setYukseklik} testID="ag-yukseklik" />
              ) : (
                <Text style={s.hint}>Bu tip ayaksız (iki duvar arasına monte) olduğu için yükseklik girilmez.</Text>
              )}
            </View>

            {/* Opsiyonlar */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Seçenekler</Text>
              <ToggleRow label="Düz köşe kapağı" value={cornerFlat} onChange={setCornerFlat} testID="ag-cornerflat" />
              {hasMotorOption(tip) && (
                <ToggleRow label="Motorlu (Somfy)" value={somfy} onChange={setSomfy} testID="ag-somfy" />
              )}
              {hasWallBracketOption(tip) && (
                <ToggleRow label="Duvar bağlantı aparatı kullanılmayacak" value={noWallBracket} onChange={setNoWallBracket} testID="ag-nowallbracket" />
              )}
              <Text style={[s.fieldLabel, { marginTop: 8 }]}>Kaplama / Renk</Text>
              <View style={s.typeWrap}>
                {meta.finishes.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[s.finishPill, finish === f && s.typePillActive]}
                    onPress={() => setFinish(f)}
                    testID={`ag-finish-${f}`}
                  >
                    <Text style={[s.typePillText, finish === f && s.typePillTextActive]}>{FINISH_LABELS[f] || f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* LED + Köpük */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>LED Aydınlatma &amp; Panel Dolgu</Text>
              <View style={s.typeWrap}>
                <TouchableOpacity style={[s.finishPill, ledOption === '' && s.typePillActive]} onPress={() => setLedOption('')} testID="ag-led-none">
                  <Text style={[s.typePillText, ledOption === '' && s.typePillTextActive]}>LED Yok</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.finishPill, ledOption === 'warm' && s.typePillActive]} onPress={() => setLedOption('warm')} testID="ag-led-warm">
                  <Text style={[s.typePillText, ledOption === 'warm' && s.typePillTextActive]}>Sıcak Beyaz LED</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.finishPill, ledOption === 'warm_rgb' && s.typePillActive]} onPress={() => setLedOption('warm_rgb')} testID="ag-led-rgb">
                  <Text style={[s.typePillText, ledOption === 'warm_rgb' && s.typePillTextActive]}>Sıcak + RGB LED</Text>
                </TouchableOpacity>
              </View>
              {!!ledOption && (
                <ToggleRow label="LED, orta destek profiline bağlansın" value={ledMidSupport} onChange={setLedMidSupport} testID="ag-led-midsupport" />
              )}
              <ToggleRow label="Panel dolgu (köpük) eklensin" value={kopuk} onChange={setKopuk} testID="ag-kopuk" />
              <Text style={s.hint}>LED ve köpük fiyatları da aynı Excel formülleriyle otomatik hesaplanır; ekstra bir şey girmenize gerek yok.</Text>
            </View>

            {/* Montaj + Kar */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Montaj Bedeli &amp; Kar Marjı</Text>
              <View style={s.row}>
                <NumField label="Montaj Bedeli (₺)" value={montajBedeli} onChange={setMontajBedeli} testID="ag-montaj" />
                <NumField label="Kar Marjı (%)" value={karMarjiPct} onChange={setKarMarjiPct} testID="ag-kar" />
              </View>
              <Text style={s.hint}>Satış fiyatı = (Malzeme Maliyeti + Montaj Bedeli) × (1 + Kar Marjı%)</Text>
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity style={[s.calcBtn, busy && s.ctaDisabled]} onPress={onCalculate} disabled={busy} testID="ag-calculate">
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="calculator-outline" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>Hesapla</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <View style={[s.card, s.resultCard]}>
                <Text style={s.sectionTitle}>{result.tipAdi}</Text>
                <Text style={s.resultSub}>
                  {result.girdi.genislikMm}×{result.girdi.yapilabilirDerinlikMm}mm{result.girdi.yukseklikMm ? ` • Y:${result.girdi.yukseklikMm}mm` : ''} • {result.girdi.modulSayisi} modül
                </Text>

                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Profil Grubu</Text>
                  <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplam)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Aksesuar Grubu</Text>
                  <Text style={s.breakdownValue}>₺{money(result.aksesuarGrubuToplam)}</Text>
                </View>
                {result.opsiyonelToplam > 0 && (
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>LED / Köpük</Text>
                    <Text style={s.breakdownValue}>₺{money(result.opsiyonelToplam)}</Text>
                  </View>
                )}
                <View style={[s.breakdownRow, { borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.breakdownLabel, { fontWeight: '800' }]}>Malzeme Maliyeti</Text>
                  <Text style={[s.breakdownValue, { fontWeight: '800' }]}>₺{money(result.maliyetToplam)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Montaj Bedeli</Text>
                  <Text style={s.breakdownValue}>₺{money(result.montajBedeli)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Kar Marjı</Text>
                  <Text style={s.breakdownValue}>%{result.karMarjiPct}</Text>
                </View>

                <View style={s.totalBox}>
                  <Text style={s.totalLabel}>SATIŞ FİYATI</Text>
                  <Text style={s.totalValue}>₺{money(result.satisFiyati)}</Text>
                </View>

                <TouchableOpacity style={s.kalemlerToggle} onPress={() => setShowKalemler((v) => !v)} testID="ag-toggle-kalemler">
                  <Text style={s.kalemlerToggleText}>{showKalemler ? 'Malzeme listesini gizle' : `Malzeme listesini göster (${result.kalemler.length} kalem)`}</Text>
                  <Ionicons name={showKalemler ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                {showKalemler && (
                  <View style={s.kalemlerBox}>
                    {result.kalemler.map((k, i) => (
                      <View key={i} style={s.kalemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.kalemLabel} numberOfLines={1}>{k.label}</Text>
                          <Text style={s.kalemSku}>{k.sku} • {k.miktar} × ₺{money(k.birimFiyat)}</Text>
                        </View>
                        <Text style={s.kalemToplam}>₺{money(k.toplam)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={[s.addBtn, adding && s.ctaDisabled]} onPress={onAddToQuote} disabled={adding} testID="ag-add-to-quote">
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>Teklife Kalem Olarak Ekle</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NumField({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID?: string }) {
  return (
    <View style={[s.field, { flex: 1 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.inputWrap}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
          placeholder="0"
          placeholderTextColor="#94a3b8"
          style={s.input}
        />
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <TouchableOpacity style={s.toggleRow} onPress={() => onChange(!value)} testID={testID}>
      <View style={[s.checkbox, value && s.checkboxActive]}>
        {value && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={s.toggleLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  contentWrap: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: 12 },
  heroCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heroCaption: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 12, ...theme.shadow.sm },
  sectionTitle: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#FBFDFF' },
  finishPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#FBFDFF' },
  typePillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typePillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  typePillTextActive: { color: '#fff' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FBFDFF', borderWidth: 1, borderColor: theme.colors.line, borderRadius: 11, paddingHorizontal: 12, minHeight: 42 },
  input: { flex: 1, fontSize: 13.5, color: theme.colors.text, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}) },
  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, lineHeight: 15 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { color: theme.colors.red, fontSize: 12.5, fontWeight: '700', flex: 1 },
  calcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13, ...theme.shadow.lg, marginBottom: 12 },
  calcBtnText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.3 },
  ctaDisabled: { opacity: 0.6 },
  resultCard: { borderColor: theme.colors.primary, borderWidth: 1.5 },
  resultSub: { fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 12, fontWeight: '600' },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  breakdownLabel: { fontSize: 12.5, color: theme.colors.textMuted, fontWeight: '600' },
  breakdownValue: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  totalBox: { backgroundColor: theme.colors.navy, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#fff', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5 },
  totalValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  kalemlerToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  kalemlerToggleText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  kalemlerBox: { borderTopWidth: 1, borderTopColor: theme.colors.line, marginTop: 4, paddingTop: 8, maxHeight: 280 },
  kalemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 8 },
  kalemLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  kalemSku: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },
  kalemToplam: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.navy, borderRadius: 14, paddingVertical: 13, marginTop: 12 },
  toast: { position: 'absolute', top: 8, alignSelf: 'center', backgroundColor: theme.colors.navy, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24, zIndex: 9999, gap: 6, ...theme.shadow.md },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});

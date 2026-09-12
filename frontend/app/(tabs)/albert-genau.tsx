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
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { api, AlbertGenauResultT, AlbertGenauTypesResponseT, AlbertGenauCalculateInputT, fetchAlbertGenauExcelBytes } from '@/src/lib/api';
import { bytesToBase64 } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';

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
  const [odemeTipi, setOdemeTipi] = useState<'nakit' | 'kredi_karti'>('nakit');
  const [alisIskontoPct, setAlisIskontoPct] = useState('0');
  const [montajBedeli, setMontajBedeli] = useState('0');
  const [karMarjiPct, setKarMarjiPct] = useState('0');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AlbertGenauResultT | null>(null);
  const [lastPayload, setLastPayload] = useState<AlbertGenauCalculateInputT | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Girilen derinlik standart panel-adimina tam denk gelmediginde backend
  // 409 dondurur; kullaniciya alt (dar) veya ust (genis) standart derinlikten
  // birini secmesi icin bu bilgiyi sakliyoruz (bkz. onCalculate/onChooseDepth).
  // Bu artik sadece bir GUVENLIK AGI -- normalde asagidaki liveDepthChoice
  // (Hesapla'ya hic basmadan, derinlik yazilirken hesaplanan) devreye girer.
  const [depthChoice, setDepthChoice] = useState<{ floorMm: number; ceilMm: number; rawMm: number } | null>(null);

  // Kullanici derinligi YAZARKEN (Hesapla'ya basmadan), Excel'deki gibi anlik
  // olarak standart olcuye denk gelip gelmedigini kontrol eder. Backend'deki
  // PriceBook.depth_choice ile BIREBIR ayni mantik -- tam eslesme varsa veya
  // tablonun disindaysa null, degilse en yakin alt/ust standart degerleri.
  const liveDepthChoice = useMemo(() => {
    const vals = (meta.depthValuesMm || []).slice().sort((a, b) => a - b);
    if (!vals.length) return null;
    const raw = Number(derinlik.replace(',', '.'));
    if (!raw || raw <= 0) return null;
    if (vals.some((v) => Math.abs(v - raw) < 1e-6)) return null;
    const floorCandidates = vals.filter((v) => v < raw);
    const ceilCandidates = vals.filter((v) => v > raw);
    if (!floorCandidates.length || !ceilCandidates.length) return null;
    return { floorMm: Math.max(...floorCandidates), ceilMm: Math.min(...ceilCandidates), rawMm: raw };
  }, [derinlik, meta.depthValuesMm]);

  useEffect(() => {
    api.albertGenauTypes().then(setMeta).catch(() => {});
  }, []);

  const selectedTypeLabel = useMemo(
    () => meta.types.find((x) => x.id === tip)?.label || tip,
    [meta.types, tip],
  );

  const onCalculate = async (depthOverrideMm?: number) => {
    setError('');
    setDepthChoice(null);
    const g = Number(genislik.replace(',', '.'));
    const d = depthOverrideMm ?? Number(derinlik.replace(',', '.'));
    const y = needsHeight(tip) ? Number(yukseklik.replace(',', '.')) : undefined;
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!d || d <= 0) { setError('Derinlik (mm) girin'); return; }
    if (needsHeight(tip) && (!y || y <= 0)) { setError('Yükseklik (mm) girin'); return; }
    setBusy(true);
    setResult(null);
    try {
      const payload: AlbertGenauCalculateInputT = {
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
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      };
      const res = await api.albertGenauCalculate(payload);
      setResult(res);
      setLastPayload(payload);
      if (depthOverrideMm) setDerinlik(String(depthOverrideMm));
    } catch (e: any) {
      if (e?.status === 409 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'depth_choice_required') {
            setDepthChoice({ floorMm: info.floorMm, ceilMm: info.ceilMm, rawMm: info.rawMm });
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onChooseDepth = (mm: number) => {
    setDepthChoice(null);
    onCalculate(mm);
  };

  // Derinlik henuz yazilirken (Hesapla'ya basmadan) gosterilen anlik secim
  // kutusundan bir deger secildiginde -- sadece derinlik alanini o degere
  // "snap"ler, otomatik hesaplama YAPMAZ (genislik/yukseklik gibi diger
  // alanlar henuz doldurulmamis olabilir). Kullanici normal sekilde Hesapla'ya
  // bastiginda artik tam eslesen bir derinlik ile calisir.
  const onPickLiveDepth = (mm: number) => {
    setDerinlik(String(mm));
  };

  const onShowKalemler = () => {
    if (!result) return;
    router.push({
      pathname: '/albert-genau-kalemler',
      params: {
        tipAdi: result.tipAdi,
        girdi: JSON.stringify(result.girdi),
        kalemler: JSON.stringify(result.kalemler),
      },
    });
  };

  const onExportExcel = async () => {
    if (!lastPayload || exporting) return;
    setExporting(true);
    try {
      const buf = await fetchAlbertGenauExcelBytes(lastPayload);
      const fileName = `albert-genau-${lastPayload.tip}.xlsx`;
      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (Platform.OS === 'web') {
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        await downloadFileWeb(url, fileName);
        showToast('Excel indirildi');
      } else {
        const b64 = bytesToBase64(new Uint8Array(buf));
        const uri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
        const avail = await Sharing.isAvailableAsync();
        if (avail) {
          await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: 'Albert Genau Hesabı', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
        } else {
          showToast('Excel dosyası oluşturuldu ama paylaşım kullanılamıyor');
        }
      }
    } catch (e: any) {
      showToast(e?.message || 'Excel indirilemedi');
    } finally {
      setExporting(false);
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
              {liveDepthChoice && (
                <View style={s.choiceBox}>
                  <View style={s.choiceHeader}>
                    <Ionicons name="help-circle" size={18} color={theme.colors.primary} />
                    <Text style={s.choiceTitle}>Derinlik standart ölçüye tam denk gelmiyor</Text>
                  </View>
                  <Text style={s.choiceHint}>
                    Girdiğiniz {liveDepthChoice.rawMm}mm için iki standart derinlikten birini seçin:
                  </Text>
                  <View style={s.row}>
                    <TouchableOpacity style={s.choiceBtn} onPress={() => onPickLiveDepth(liveDepthChoice.floorMm)} testID="ag-depth-floor-live">
                      <Text style={s.choiceBtnLabel}>Alt Ölçü</Text>
                      <Text style={s.choiceBtnValue}>{liveDepthChoice.floorMm}mm</Text>
                      <Text style={s.choiceBtnSub}>(dar, içeride kalır)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.choiceBtn} onPress={() => onPickLiveDepth(liveDepthChoice.ceilMm)} testID="ag-depth-ceil-live">
                      <Text style={s.choiceBtnLabel}>Üst Ölçü</Text>
                      <Text style={s.choiceBtnValue}>{liveDepthChoice.ceilMm}mm</Text>
                      <Text style={s.choiceBtnSub}>(geniş, taşabilir)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {needsHeight(tip) ? (
                <NumField label="Yükseklik" value={yukseklik} onChange={setYukseklik} testID="ag-yukseklik" />
              ) : (
                <Text style={s.hint}>Bu tip ayaksız (iki duvar arasına monte) olduğu için yükseklik girilmez.</Text>
              )}
            </View>

            {/* Ödeme Tipi — Excel'deki KREDİ KARTINA TAKSİTLİ / NAKİT sütun
                ayrımının karşılığı: KREDİ KARTI liste fiyatını, NAKİT ise
                liste fiyatının %89'unu (Excel formülü) kullanır. Seçime göre
                tüm hesap (malzeme maliyeti, kar, satış fiyatı) değişir. */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Ödeme Tipi</Text>
              <View style={s.payWrap}>
                <TouchableOpacity
                  style={[s.payPill, odemeTipi === 'nakit' && s.payPillActive]}
                  onPress={() => { setOdemeTipi('nakit'); setResult(null); }}
                  testID="ag-pay-nakit"
                >
                  <Ionicons name="cash-outline" size={16} color={odemeTipi === 'nakit' ? '#fff' : theme.colors.textMuted} />
                  <Text style={[s.payPillText, odemeTipi === 'nakit' && s.payPillTextActive]}>Nakit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.payPill, odemeTipi === 'kredi_karti' && s.payPillActive]}
                  onPress={() => { setOdemeTipi('kredi_karti'); setResult(null); }}
                  testID="ag-pay-kredi"
                >
                  <Ionicons name="card-outline" size={16} color={odemeTipi === 'kredi_karti' ? '#fff' : theme.colors.textMuted} />
                  <Text style={[s.payPillText, odemeTipi === 'kredi_karti' && s.payPillTextActive]}>Kredi Kartı</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>
                Nakit ödemede fiyat listesinin %89'u; kredi kartı ile ödemede ise tam liste fiyatı esas alınır.
              </Text>
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

            {/* İskonto + Montaj + Kar */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Alış İskontosu, Montaj &amp; Kar Marjı</Text>
              <NumField label="Alış İskonto Oranı (%)" value={alisIskontoPct} onChange={setAlisIskontoPct} testID="ag-iskonto" />
              <View style={s.row}>
                <NumField label="Montaj Bedeli (₺)" value={montajBedeli} onChange={setMontajBedeli} testID="ag-montaj" />
                <NumField label="Kar Marjı (%)" value={karMarjiPct} onChange={setKarMarjiPct} testID="ag-kar" />
              </View>
              <Text style={s.hint}>
                İskonto sadece malzeme maliyetini düşürür; montaj bedelini ve kar marjını etkilemez.{'\n'}
                Satış Fiyatı = (Malzeme Maliyeti − İskonto) × (1 + Kar Marjı%) + Montaj Bedeli
              </Text>
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {depthChoice && (
              <View style={s.choiceBox}>
                <View style={s.choiceHeader}>
                  <Ionicons name="help-circle" size={18} color={theme.colors.primary} />
                  <Text style={s.choiceTitle}>Derinlik standart ölçüye tam denk gelmiyor</Text>
                </View>
                <Text style={s.choiceHint}>
                  Girdiğiniz {depthChoice.rawMm}mm için iki standart derinlikten birini seçin:
                </Text>
                <View style={s.row}>
                  <TouchableOpacity style={s.choiceBtn} onPress={() => onChooseDepth(depthChoice.floorMm)} testID="ag-depth-floor">
                    <Text style={s.choiceBtnLabel}>Alt Ölçü</Text>
                    <Text style={s.choiceBtnValue}>{depthChoice.floorMm}mm</Text>
                    <Text style={s.choiceBtnSub}>(dar, içeride kalır)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.choiceBtn} onPress={() => onChooseDepth(depthChoice.ceilMm)} testID="ag-depth-ceil">
                    <Text style={s.choiceBtnLabel}>Üst Ölçü</Text>
                    <Text style={s.choiceBtnValue}>{depthChoice.ceilMm}mm</Text>
                    <Text style={s.choiceBtnSub}>(geniş, taşabilir)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity style={[s.calcBtn, busy && s.ctaDisabled]} onPress={() => onCalculate()} disabled={busy} testID="ag-calculate">
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="calculator-outline" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>Hesapla</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <View style={[s.card, s.resultCard]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={s.sectionTitle}>{result.tipAdi}</Text>
                  <View style={s.payBadge}>
                    <Ionicons name={result.odemeTipi === 'nakit' ? 'cash-outline' : 'card-outline'} size={12} color={theme.colors.primary} />
                    <Text style={s.payBadgeText}>{result.odemeTipi === 'nakit' ? 'NAKİT' : 'KREDİ KARTI'}</Text>
                  </View>
                </View>
                <Text style={s.resultSub}>
                  {result.girdi.genislikMm}×{result.girdi.yapilabilirDerinlikMm}mm{result.girdi.yukseklikMm ? ` • Y:${result.girdi.yukseklikMm}mm` : ''} • {result.girdi.modulSayisi} modül
                </Text>

                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Profil Grubu</Text>
                  <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplamFiresiz ?? result.profilGrubuToplam)}</Text>
                </View>
                {!!result.profilFireTutari && (
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>Profil Fire Payı (%{Math.round((result.profilFireOrani ?? 0.1) * 100)})</Text>
                    <Text style={s.breakdownValue}>₺{money(result.profilFireTutari)}</Text>
                  </View>
                )}
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
                {result.alisIskontoPct > 0 && (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Alış İskontosu (%{result.alisIskontoPct})</Text>
                      <Text style={[s.breakdownValue, { color: theme.colors.red }]}>−₺{money(result.maliyetToplam - result.maliyetIndirimli)}</Text>
                    </View>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>İskontolu Malzeme Maliyeti</Text>
                      <Text style={s.breakdownValue}>₺{money(result.maliyetIndirimli)}</Text>
                    </View>
                  </>
                )}
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Kar Tutarı (%{result.karMarjiPct})</Text>
                  <Text style={s.breakdownValue}>₺{money(result.karTutari)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Montaj Bedeli</Text>
                  <Text style={s.breakdownValue}>₺{money(result.montajBedeli)}</Text>
                </View>

                <View style={s.totalBox}>
                  <Text style={s.totalLabel}>SATIŞ FİYATI ({result.odemeTipi === 'nakit' ? 'NAKİT' : 'KREDİ KARTI'})</Text>
                  <Text style={s.totalValue}>₺{money(result.satisFiyati)}</Text>
                </View>

                <TouchableOpacity style={s.kalemlerToggle} onPress={onShowKalemler} testID="ag-show-kalemler">
                  <Text style={s.kalemlerToggleText}>{`Malzeme listesini görüntüle (${result.kalemler.length} kalem)`}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </TouchableOpacity>

                <View style={s.row}>
                  <TouchableOpacity style={[s.addBtn, { flex: 1 }, adding && s.ctaDisabled]} onPress={onAddToQuote} disabled={adding} testID="ag-add-to-quote">
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={s.calcBtnText}>Teklife Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.excelBtn, exporting && s.ctaDisabled]} onPress={onExportExcel} disabled={exporting} testID="ag-export-excel">
                    {exporting ? <ActivityIndicator color={theme.colors.primary} /> : (
                      <>
                        <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                        <Text style={s.excelBtnText}>Excel</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
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
  payWrap: { flexDirection: 'row', gap: 10 },
  payPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.lineDark, backgroundColor: '#FBFDFF' },
  payPillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  payPillText: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  payPillTextActive: { color: '#fff' },
  payBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.primary },
  payBadgeText: { fontSize: 10.5, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.3 },
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
  choiceBox: { backgroundColor: '#EFF6FF', borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', padding: 14, marginBottom: 12 },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  choiceTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, flex: 1 },
  choiceHint: { fontSize: 11.5, color: theme.colors.textMuted, fontWeight: '600', marginBottom: 10 },
  choiceBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.primary, paddingVertical: 12, alignItems: 'center' },
  choiceBtnLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.primary },
  choiceBtnValue: { fontSize: 16, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
  choiceBtnSub: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
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
  kalemlerToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.line, marginTop: 4 },
  kalemlerToggleText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.navy, borderRadius: 14, paddingVertical: 13, marginTop: 12 },
  excelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, marginTop: 12 },
  excelBtnText: { color: theme.colors.primary, fontSize: 13.5, fontWeight: '800' },
  toast: { position: 'absolute', top: 8, alignSelf: 'center', backgroundColor: theme.colors.navy, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24, zIndex: 9999, gap: 6, ...theme.shadow.md },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, RatesT, ZipPerdeTableT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { convertFromEur, loadZipKar, loadZipMontajTl, montajTlToEur, saveZipKar, saveZipMontajTl, varsayilanZipSecim, zipFiyat, zipLookup, zipSecimAciklama, ZipSecimT } from '@/src/lib/zip-perde';
import ZipSecimSecici from '@/src/components/zip/ZipSecimSecici';
import { MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';
import { ZIP_COLOR } from '@/src/components/zip/ZipPriceGrid';

// Zip Perde bayi fiyat hesaplama -- Albert Genau'dan ayrı bir bayilik.
// Formül yok: tedarikçinin EN × BOY fiyat tablosundan (EUR, adet) okunur,
// ara ölçüler otomatik olarak bir üst basamaktan fiyatlanır (bkz.
// src/lib/zip-perde.ts); tablo bayiye gösterilmez.
// Tablo merkezi: admin yeni Excel'i yükleyince burası otomatik güncellenir.

const num = (v: string) => Number(String(v || '').replace(',', '.')) || 0;
const eur = (n: number) => `€ ${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const money = (n: number, cur: string) => {
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '₺';
  return `${sym} ${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export default function ZipPerdeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const { activeCompany, showToast, addPendingAlbertGenauItem } = useApp();
  const enabled = !!activeCompany?.zipPerdeEnabled;

  const [table, setTable] = useState<ZipPerdeTableT | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rates, setRates] = useState<RatesT | null>(null);
  const [en, setEn] = useState('');
  const [boy, setBoy] = useState('');
  const [adet, setAdet] = useState('1');
  const [kar, setKar] = useState('0');
  const [montajTl, setMontajTl] = useState('0');
  const [secim, setSecim] = useState<ZipSecimT>(varsayilanZipSecim);

  useEffect(() => {
    if (!activeCompany?.id || !enabled) return;
    api.zipPerdeTable(activeCompany.id).then(setTable).catch((e) => setLoadError(e?.message || 'Fiyat tablosu yüklenemedi'));
    loadZipKar(activeCompany.id).then((k) => setKar(String(k)));
    loadZipMontajTl(activeCompany.id).then((m) => setMontajTl(String(m)));
    api.rates().then(setRates).catch(() => {});
  }, [activeCompany?.id, enabled]);

  const onKarChange = (v: string) => {
    setKar(v);
    if (activeCompany?.id) saveZipKar(activeCompany.id, num(v));
  };

  const onMontajChange = (v: string) => {
    setMontajTl(v);
    if (activeCompany?.id) saveZipMontajTl(activeCompany.id, num(v));
  };

  // Montaj TL girilir, canlı kurla EUR'ya çevrilip kâr HARİÇ en sona eklenir.
  const montajEur = montajTlToEur(num(montajTl), rates);

  const hit = useMemo(() => (table && num(en) && num(boy) ? zipLookup(table, num(en), num(boy)) : null), [table, en, boy]);
  const fiyat = hit?.ok ? zipFiyat(hit.price, num(en), num(boy), secim, num(kar), montajEur ?? 0) : null;
  const satisEur = fiyat ? fiyat.satis : null;
  const adetN = Math.max(1, num(adet));
  const tl = satisEur != null ? convertFromEur(satisEur, 'TRY', rates) : null;
  const usd = satisEur != null ? convertFromEur(satisEur, 'USD', rates) : null;

  const onAddToQuote = () => {
    if (!hit?.ok || !fiyat || satisEur == null) return;
    if (montajEur == null) { showToast('Kur alınamadı, montaj EUR\'ya çevrilemedi'); return; }
    // Teklifin para birimi burada bilinmiyor; her birimdeki karşılık
    // taşınır, Teklif ekranı kendi birimini seçer (bkz. teklif.tsx).
    const perCur = (e: number) => {
      const out: Record<string, number> = { EUR: e };
      const t = convertFromEur(e, 'TRY', rates);
      const u = convertFromEur(e, 'USD', rates);
      if (t != null) out.TRY = t;
      if (u != null) out.USD = u;
      return out;
    };
    addPendingAlbertGenauItem({
      urunAdi: 'Zip Perde',
      aciklama: [`EN ${num(en)} × BOY ${num(boy)} cm`, ...zipSecimAciklama(secim)].join(', '),
      birimFiyat: satisEur,
      fiyatlar: perCur(satisEur),
      adet: adetN,
      // Kar HARİÇ bayi maliyeti -- Geçmiş'teki "Maliyet Ekle" önerisi için.
      maliyetler: perCur(fiyat.maliyet),
      zipEkler: secim,
      zipMontajTl: num(montajTl),
      montajlar: perCur(fiyat.montaj),
    });
    showToast('Zip Perde kalemi teklife eklendi');
    if (params.from === 'teklif') router.back();
    else router.replace('/(tabs)/teklif' as any);
  };

  const Header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Zip Perde Fiyat Hesaplama</Text>
      <View style={s.headerBtn} />
    </View>
  );

  if (!enabled) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {Header}
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textMuted} />
          <Text style={s.muted}>Zip Perde modülü bu firma için açık değil. Bayilik için bizimle iletişime geçin.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {Header}
      <View style={s.divider} />
      {!table ? (
        <View style={s.center}>
          {loadError ? <Text style={s.muted}>{loadError}</Text> : <ActivityIndicator size="large" color={ZIP_COLOR} />}
        </View>
      ) : (
        <MotionScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <ScreenHero icon="grid-outline" title="Zip Perde" subtitle="Ölçüyü girin, bayi fiyatı tablodan gelsin" color={ZIP_COLOR} />

          <View style={s.card}>
            <Text style={s.sectionLabel}>ÖLÇÜ</Text>
            <View style={s.row}>
              <Field label="EN (cm)" value={en} onChange={setEn} testID="zip-en" />
              <Field label="BOY (cm)" value={boy} onChange={setBoy} testID="zip-boy" />
            </View>
            <View style={s.row}>
              <Field label="Adet" value={adet} onChange={setAdet} testID="zip-adet" />
              <Field label="Kâr Marjı (%)" value={kar} onChange={onKarChange} testID="zip-kar" />
            </View>
            <View style={s.row}>
              <Field label="Montaj Bedeli (₺, adet başı)" value={montajTl} onChange={onMontajChange} testID="zip-montaj" />
            </View>
            <Text style={[s.sectionLabel, { marginTop: 4 }]}>SEÇENEKLER</Text>
            <ZipSecimSecici secim={secim} onChange={setSecim} />
          </View>

          {hit && (
            <View style={[s.card, { marginTop: 14 }]} testID="zip-result">
              {!hit.ok ? (
                <View style={s.warnBox}>
                  <Ionicons name="alert-circle" size={16} color={theme.colors.red} />
                  <Text style={s.warnText}>{hit.reason}</Text>
                </View>
              ) : (
                <>
                  <Line label="Bayi fiyatı (adet)" value={eur(hit.price)} />
                  {fiyat?.ekKalemler.map((k) => <Line key={k.label} label={k.label} value={eur(k.tutar)} />)}
                  <Line label={`Kâr (%${num(kar)})`} value={eur(fiyat?.kar || 0)} />
                  {num(montajTl) > 0 && (
                    <Line
                      label={`Montaj (₺${num(montajTl).toLocaleString('tr-TR')}, kâr hariç)`}
                      value={montajEur == null ? 'kur yok' : eur(fiyat?.montaj || 0)}
                    />
                  )}
                  <Line label="Satış fiyatı (adet)" value={eur(satisEur || 0)} strong />
                  {(tl != null || usd != null) && (
                    <Text style={s.equiv}>
                      {[tl != null ? money(tl, 'TRY') : null, usd != null ? money(usd, 'USD') : null].filter(Boolean).join('  •  ')}
                    </Text>
                  )}
                  {adetN > 1 && <Line label={`Toplam (${adetN} adet)`} value={eur((satisEur || 0) * adetN)} strong />}
                  <TouchableOpacity style={s.cta} onPress={onAddToQuote} testID="zip-add-to-quote">
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={s.ctaText}>Teklife Ekle</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </MotionScrollView>
      )}
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <MotionInput style={s.input} keyboardType="decimal-pad" value={value} onChangeText={onChange} placeholder="0" placeholderTextColor="#94a3b8" testID={testID} />
    </View>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, strong && { color: theme.colors.text, fontWeight: '800' }]}>{label}</Text>
      <Text style={[s.lineValue, strong && { color: ZIP_COLOR, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.surfaceSoft },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  muted: { color: theme.colors.textMuted, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  sectionLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: theme.colors.text, backgroundColor: theme.colors.surfaceSoft },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16, marginBottom: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  lineLabel: { flex: 1, marginRight: 10, fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  lineValue: { fontSize: 13.5, color: theme.colors.text, fontWeight: '800' },
  equiv: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'right', marginTop: 6 },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.redSoft, borderRadius: 10, padding: 10 },
  warnText: { color: theme.colors.red, fontSize: 12.5, fontWeight: '700', flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ZIP_COLOR, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '800' },
}));

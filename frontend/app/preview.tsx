import React, { useMemo } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { buildQuotePdfHtml } from '@/src/lib/pdf';
import { buildItemDescription, buildQuoteFileName } from '@/src/lib/quote-utils';

const SHARE_MESSAGE = 'Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz.';

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}

export default function PreviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ quoteId?: string }>();
  const { quotes, activeCompany, showToast } = useApp();

  const quote = useMemo(() => quotes.find((q) => q.id === params.quoteId), [quotes, params.quoteId]);

  if (!quote || !activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={theme.colors.text} /></TouchableOpacity>
          <Text style={s.topTitle}>Önizleme</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={s.empty}><Text style={{ color: theme.colors.textMuted }}>Teklif bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  const cur = quote.paraBirimi;

  const doShare = async () => {
    try {
      const html = buildQuotePdfHtml(activeCompany, quote);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      let finalUri = uri;
      const desired = buildQuoteFileName(new Date()) + '.pdf';
      if (Platform.OS !== 'web') {
        try {
          const dirIdx = uri.lastIndexOf('/');
          finalUri = uri.substring(0, dirIdx + 1) + desired;
          await FileSystem.moveAsync({ from: uri, to: finalUri });
        } catch { finalUri = uri; }
      }
      const avail = await Sharing.isAvailableAsync();
      if (avail) {
        await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: SHARE_MESSAGE, UTI: 'com.adobe.pdf' });
      } else {
        showToast('Paylaşım desteklenmiyor');
      }
    } catch (e: any) { showToast('PDF hatası: ' + (e?.message || '')); }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn"><Ionicons name="arrow-back" size={22} color={theme.colors.navy} /></TouchableOpacity>
        <Text style={s.topTitle}>PDF Önizleme</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        <View style={s.sheet} testID="preview-sheet">
          {/* HEADER */}
          <View style={s.sheetHeader}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.cName} numberOfLines={2}>{activeCompany.sirketAdi}</Text>
              {activeCompany.adres ? <Text style={s.cLine}>{activeCompany.adres}</Text> : null}
              {activeCompany.telefon ? <Text style={s.cLine}>{activeCompany.telefon}</Text> : null}
              {activeCompany.telefon2 ? <Text style={s.cLine}>{activeCompany.telefon2}</Text> : null}
              {activeCompany.email ? <Text style={s.cLine}>{activeCompany.email}</Text> : null}
              {activeCompany.website ? <Text style={s.cLine}>{activeCompany.website}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {activeCompany.logoBase64 ? (
                <Image source={{ uri: activeCompany.logoBase64 }} style={s.logo} resizeMode="contain" />
              ) : (
                <View style={s.logoBox}><Text style={s.logoText} numberOfLines={1}>{activeCompany.sirketAdi.substring(0, 12)}</Text></View>
              )}
              <Text style={s.docTitle}>TEKLİF FORMU</Text>
              <Text style={s.meta}>Teklif No: <Text style={s.metaV}>{quote.teklifNo}</Text></Text>
              <Text style={s.meta}>Tarih: <Text style={s.metaV}>{quote.tarih}</Text></Text>
              <Text style={s.meta}>Geçerlilik: <Text style={s.metaV}>{quote.gecerlilik}</Text></Text>
            </View>
          </View>

          {/* INFO BOXES */}
          <View style={s.infoGrid}>
            <InfoBox title="MÜŞTERİ BİLGİLERİ" rows={[
              ['FİRMA', quote.musFirma],
              ['MÜŞTERİ ADI', quote.musYetkili],
              ['TELEFON', quote.musTelefon],
              ['E-Mail', quote.musEmail],
              ['ADRES', quote.musAdres],
            ]} />
            <InfoBox title="SİPARİŞ BİLGİLERİ" rows={[
              ['PROJE ADI', quote.projeAdi],
              ['NAKLİYE', quote.nakliye],
              ['PARA BİRİMİ', quote.paraBirimi],
              ['ÖDEME ŞEKLİ', quote.odemeSekli],
              ['MENŞEİ', quote.mensei],
              ['TESLİM', quote.teslimGun],
            ]} />
          </View>

          {/* ITEMS TABLE */}
          <View style={s.table}>
            <View style={s.thead}>
              <Text style={[s.th, { width: 30, textAlign: 'center' }]}>S.NO</Text>
              <Text style={[s.th, { flex: 2 }]}>SİSTEM / HİZMET</Text>
              <Text style={[s.th, { width: 40, textAlign: 'center' }]}>ADET</Text>
              <Text style={[s.th, { width: 70, textAlign: 'right' }]}>BİRİM</Text>
              <Text style={[s.th, { width: 72, textAlign: 'right' }]}>TOPLAM</Text>
            </View>
            {quote.items.length === 0 ? (
              <Text style={s.tEmpty}>Kalem yok</Text>
            ) : quote.items.map((it, idx) => {
              const line = (it.adet || 0) * (it.birimFiyat || 0);
              const desc = buildItemDescription(it);
              return (
                <View key={it.id} style={[s.trow, idx % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                  <Text style={[s.td, { width: 30, textAlign: 'center' }]}>{idx + 1}</Text>
                  <Text style={[s.tdBold, { flex: 2, lineHeight: 14 }]} numberOfLines={5}>{desc}</Text>
                  <Text style={[s.td, { width: 40, textAlign: 'center' }]}>{it.adet}</Text>
                  <Text style={[s.td, { width: 70, textAlign: 'right' }]} numberOfLines={1}>{fmt(it.birimFiyat, cur)}</Text>
                  <Text style={[s.tdBold, { width: 72, textAlign: 'right' }]} numberOfLines={1}>{fmt(line, cur)}</Text>
                </View>
              );
            })}
          </View>

          <Text style={s.warn}>ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ.</Text>
          <Text style={s.kdvBanner}>KDV HARİÇ FİYATTIR</Text>

          {/* Bottom */}
          <View style={s.bottomGrid}>
            <View style={{ flex: 1.3 }}>
              <Text style={s.boxTitleDark}>ÖZEL NOTLAR &amp; SATIŞ DETAYLARI</Text>
              <View style={s.notesBody}><Text style={s.noteText}>{quote.notlar || activeCompany.ozelNotlar || '-'}</Text></View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <TotRow label="ARA TOPLAM" value={fmt((quote.araToplam || 0) + (quote.iskontoTutar || 0), cur)} />
              {quote.iskonto > 0 ? <TotRow label={`İSKONTO (%${quote.iskonto})`} value={`-${fmt(quote.iskontoTutar, cur)}`} negative /> : null}
              <View style={s.grand}>
                <Text style={s.grandL}>GENEL TOPLAM</Text>
                <Text style={s.grandV} numberOfLines={1}>{fmt(quote.genelToplam, cur)}</Text>
              </View>
              <View style={s.signBox}><Text style={s.signText}>Onay / İmza :</Text></View>
            </View>
          </View>

          {/* Bank */}
          {(activeCompany.banklar || []).length > 0 ? (
            <>
              <Text style={s.bankTitle}>BANKA BİLGİLERİ — {activeCompany.sirketAdi}</Text>
              <View style={s.bankTable}>
                {(activeCompany.banklar || []).map((b) => (
                  <View key={b.id} style={s.bankRow}>
                    <Text style={s.bankName} numberOfLines={2}>{b.turu || b.banka || '-'}</Text>
                    <Text style={s.bankIban} numberOfLines={1}>{b.iban || '-'}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[s.actionBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.actionBtnGhost} onPress={() => router.push({ pathname: '/(tabs)/', params: { quoteId: quote.id } })} testID="preview-edit-btn">
          <Ionicons name="pencil" size={16} color={theme.colors.textSoft} />
          <Text style={s.actionBtnGhostText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnAcc} onPress={doShare} testID="preview-pdf-btn">
          <Ionicons name="share-social" size={16} color="#fff" />
          <Text style={s.actionBtnAccText}>PDF Paylaş</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtnWa} onPress={doShare} testID="preview-wa-btn">
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          <Text style={s.actionBtnAccText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function InfoBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <View style={s.infoBox}>
      <Text style={s.infoHdr}>{title}</Text>
      {rows.map(([k, v], i) => (
        <View key={i} style={[s.infoRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={s.infoK}>{k}</Text>
          <Text style={s.infoV} numberOfLines={2}>{v || '-'}</Text>
        </View>
      ))}
    </View>
  );
}

function TotRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={s.totRow}>
      <Text style={s.totL}>{label}</Text>
      <Text style={[s.totV, negative && { color: theme.colors.red }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  topTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.navy },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.md },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10 },
  cName: { fontSize: 13, fontWeight: '900', color: theme.colors.navy, marginBottom: 4 },
  cLine: { fontSize: 10, color: '#333', lineHeight: 14 },
  logo: { width: 110, height: 44, marginBottom: 4 },
  logoBox: { borderWidth: 2, borderColor: theme.colors.navy, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 4, maxWidth: 130 },
  logoText: { fontSize: 11, fontWeight: '900', color: theme.colors.navy },
  docTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.navy, marginBottom: 4, letterSpacing: 0.3 },
  meta: { fontSize: 10, color: theme.colors.textMuted },
  metaV: { fontWeight: '900', color: theme.colors.text },
  infoGrid: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  infoBox: { flex: 1, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 3, overflow: 'hidden' },
  infoHdr: { backgroundColor: theme.colors.navy, color: '#fff', fontSize: 9.5, fontWeight: '900', paddingVertical: 5, paddingHorizontal: 6, letterSpacing: 0.4 },
  infoRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  infoK: { width: '38%', fontSize: 9, color: theme.colors.textMuted, fontWeight: '800' },
  infoV: { flex: 1, fontSize: 9.5, color: theme.colors.text },
  table: { borderWidth: 1, borderColor: theme.colors.navy, borderRadius: 3, overflow: 'hidden' },
  thead: { flexDirection: 'row', backgroundColor: theme.colors.navy, paddingVertical: 5, paddingHorizontal: 4 },
  th: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  trow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 2, alignItems: 'flex-start' },
  td: { fontSize: 9.5, color: theme.colors.text },
  tdBold: { fontSize: 9.5, fontWeight: '700', color: theme.colors.text },
  tEmpty: { padding: 12, textAlign: 'center', color: theme.colors.textMuted, fontSize: 11 },
  warn: { backgroundColor: theme.colors.red, color: '#fff', textAlign: 'center', fontSize: 8.5, fontWeight: '900', padding: 4, marginTop: 6 },
  kdvBanner: { backgroundColor: theme.colors.navyDark, color: '#fff', textAlign: 'center', fontSize: 10, fontWeight: '900', padding: 5, letterSpacing: 0.4, marginBottom: 10 },
  bottomGrid: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  boxTitleDark: { fontSize: 9.5, fontWeight: '900', color: '#fff', backgroundColor: theme.colors.navy, padding: 4, letterSpacing: 0.4 },
  notesBody: { borderWidth: 1, borderColor: theme.colors.line, padding: 6, backgroundColor: '#f8fafc' },
  noteText: { fontSize: 9.5, color: '#475569', lineHeight: 14 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 3, backgroundColor: '#fff', alignItems: 'center' },
  totL: { fontSize: 10, color: theme.colors.textMuted, fontWeight: '700' },
  totV: { fontSize: 10.5, color: theme.colors.text, fontWeight: '800' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: theme.colors.navyDark, borderRadius: 3, alignItems: 'center' },
  grandL: { fontSize: 10.5, color: '#cbd5e1', fontWeight: '900', letterSpacing: 0.4 },
  grandV: { fontSize: 12, color: '#fff', fontWeight: '900' },
  signBox: { borderWidth: 1, borderColor: theme.colors.line, height: 45, padding: 5, marginTop: 4 },
  signText: { fontSize: 10, color: theme.colors.textMuted, fontWeight: '700' },
  bankTitle: { fontSize: 9.5, fontWeight: '900', color: '#fff', backgroundColor: theme.colors.navy, padding: 5, marginTop: 10, letterSpacing: 0.3 },
  bankTable: { borderWidth: 1, borderColor: theme.colors.line, borderTopWidth: 0 },
  bankRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 6 },
  bankName: { width: '35%', fontSize: 9.5, color: theme.colors.text, fontWeight: '700' },
  bankIban: { flex: 1, fontSize: 9.5, color: theme.colors.text, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', padding: 10, flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: theme.colors.line,
    ...Platform.select({ android: { elevation: 8 }, ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: -2 } } }),
  },
  actionBtnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff', flex: 1 },
  actionBtnGhostText: { color: theme.colors.textSoft, fontWeight: '900', fontSize: 12 },
  actionBtnAcc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary, flex: 1.2 },
  actionBtnAccText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  actionBtnWa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#25D366', flex: 1 },
});

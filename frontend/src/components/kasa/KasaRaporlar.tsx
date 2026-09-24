import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import type { KasaEntryT, QuoteT, RatesT } from '@/src/lib/api';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import { downloadFileWeb } from '@/src/lib/web-download';
import {
  PeriodKey, accountBalances, buildPeriod, categoryBreakdown, financeSummaryHtml, inRange, kasaCsv, kdvSummary,
  profitAnalysis, sumTRY, tl,
} from '@/src/lib/finance';
import { PeriodChips, ks } from './shared';
import { fill, statusLabel, useLanguage } from '@/src/lib/i18n';

type Props = {
  firma: string;
  kasa: KasaEntryT[];
  quotes: QuoteT[];
  rates: RatesT | null;
  hesaplar: string[];
  showToast: (m: string) => void;
};

async function saveText(content: string, fileName: string, mime: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    await downloadFileWeb(url, fileName);
    return;
  }
  const uri = (FileSystem.cacheDirectory || '') + fileName;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: fileName });
}

async function savePdf(html: string, fileName: string) {
  if (Platform.OS === 'web') {
    await downloadFileWeb(await htmlToPdfObjectUrlWeb(html), fileName);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  let finalUri = uri;
  try {
    finalUri = uri.substring(0, uri.lastIndexOf('/') + 1) + fileName;
    await FileSystem.moveAsync({ from: uri, to: finalUri });
  } catch { finalUri = uri; }
  await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
}

export default function KasaRaporlar({ firma, kasa, quotes, rates, hesaplar, showToast }: Props) {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const [pk, setPk] = useState<PeriodKey>('thisMonth');
  const [busy, setBusy] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const period = useMemo(() => buildPeriod(pk), [pk, lang]);
  const entries = useMemo(() => kasa.filter((k) => inRange(k.tarih, period.start, period.end)), [kasa, period]);
  const kdv = useMemo(() => kdvSummary(kasa, quotes, rates, period.start, period.end), [kasa, quotes, rates, period]);
  const balances = useMemo(() => accountBalances(kasa, rates, hesaplar), [kasa, rates, hesaplar]);
  const stamp = `${period.start}_${period.end}`;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); showToast(ok); } catch (e: any) { showToast(t('kasaX.reportErr') + (e?.message || '')); } finally { setBusy(null); }
  };

  const pdfSummary = () => run('pdf', () => savePdf(financeSummaryHtml({
    firma, period, totals: sumTRY(entries, rates),
    gelirKat: categoryBreakdown(entries, rates, 'gelir'), giderKat: categoryBreakdown(entries, rates, 'gider'),
    profit: profitAnalysis(quotes, rates, period.start, period.end), kdv, hesaplar: balances,
  }), `Finans_Ozet_${stamp}.pdf`), t('kasaX.summaryReady'));

  const csvList = () => run('csv', () => saveText(kasaCsv(entries, rates), `Kasa_Islemleri_${stamp}.csv`, 'text/csv'), t('kasaX.listReady'));

  const Btn = ({ k, icon, label, onPress }: { k: string; icon: any; label: string; onPress: () => void }) => (
    <TouchableOpacity style={[ks.chip, { flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={onPress} disabled={!!busy} testID={`rapor-${k}`}>
      {busy === k ? <ActivityIndicator size="small" color={theme.colors.modules.kasa} /> : <Ionicons name={icon} size={15} color={theme.colors.modules.kasa} />}
      <Text style={[ks.chipText, { color: theme.colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const Card = ({ icon, title, sub, children }: { icon: any; title: string; sub: string; children: React.ReactNode }) => (
    <View style={[ks.card, { marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.modules.kasa + '1A', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={theme.colors.modules.kasa} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ks.rowLabel, { fontSize: 14, fontWeight: '900' }]}>{title}</Text>
          <Text style={ks.muted}>{sub}</Text>
        </View>
      </View>
      {children}
    </View>
  );

  return (
    <View>
      <PeriodChips value={pk} onChange={setPk} />
      <View style={[ks.card, { marginVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryBorder }]}>
        <Ionicons name="calendar-outline" size={16} color={theme.colors.primaryDark} />
        <Text style={[ks.rowLabel, { color: theme.colors.primaryDark }]}>{period.start} — {period.end}</Text>
        <Text style={ks.muted}>{fill(t('kasaX.txCount'), { n: entries.length })}</Text>
      </View>

      <Card icon="document-text-outline" title={t('kasaX.summaryTitle')} sub={t('kasaX.summarySub')}>
        <View style={ks.chipRow}><Btn k="pdf" icon="download-outline" label={t('kasaX.pdfDl')} onPress={pdfSummary} /></View>
      </Card>

      <Card icon="list-outline" title={t('kasaX.listTitle')} sub={t('kasaX.listSub')}>
        <View style={ks.chipRow}><Btn k="csv" icon="grid-outline" label={t('kasaX.csvDl')} onPress={csvList} /></View>
      </Card>

      <Card icon="receipt-outline" title={t('kasaX.vatTitle')} sub={t('kasaX.vatSub')}>
        <View style={ks.row}><Text style={ks.rowLabel}>{t('kasaX.vatOut')}</Text><Text style={ks.rowValue}>{tl(kdv.hesaplanan)}</Text></View>
        <View style={ks.row}><Text style={ks.rowLabel}>{t('kasaX.vatIn')}</Text><Text style={[ks.rowValue, { color: theme.colors.greenText }]}>− {tl(kdv.indirilecek)}</Text></View>
        <View style={[ks.row, { borderBottomWidth: 0 }]}><Text style={[ks.rowLabel, { fontWeight: '900' }]}>{t('kasaX.vatPay')}</Text><Text style={[ks.rowValue, { fontSize: 15 }]}>{tl(kdv.odenecek)}</Text></View>
        <Text style={ks.muted}>{t('kasaX.vatNote')}</Text>
      </Card>

      <Card icon="wallet-outline" title={t('kasaX.balTitle')} sub={t('kasaX.balSub')}>
        {balances.map((b) => (
          <View key={b.hesap} style={ks.row}>
            <Text style={ks.rowLabel}>{statusLabel(lang, b.hesap)}</Text>
            <Text style={[ks.rowValue, { color: b.bakiye >= 0 ? theme.colors.text : theme.colors.redText }]}>{tl(b.bakiye)}</Text>
          </View>
        ))}
      </Card>

      <Card icon="people-outline" title={t('kasaX.collTitle')} sub={t('kasaX.collSub')}>
        <View style={ks.chipRow}><Btn k="borclu" icon="arrow-forward" label={t('kasaX.debtors')} onPress={() => router.push('/borclu-musteriler' as any)} /></View>
      </Card>
    </View>
  );
}

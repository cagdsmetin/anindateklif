import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/lib/theme';
import type { KasaEntryT, QuoteT, RatesT } from '@/src/lib/api';
import { themedStyles } from '@/src/components/motion';
import {
  PeriodKey, buildPeriod, categoryBreakdown, inRange, monthlySeries, pctChange, profitAnalysis, sumTRY, tl,
} from '@/src/lib/finance';
import { Delta, PeriodChips, ks } from './shared';
import { fill, statusLabel, upper, useLanguage } from '@/src/lib/i18n';

// Kasa > Analiz: donem karsilastirmasi, 6 aylik gelir/gider grafigi,
// kategori dagilimi ve onaylanan tekliflerden kar/zarar.

export default function KasaAnaliz({ kasa, quotes, rates }: { kasa: KasaEntryT[]; quotes: QuoteT[]; rates: RatesT | null }) {
  const { t, lang } = useLanguage();
  const [pk, setPk] = useState<PeriodKey>('thisMonth');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const period = useMemo(() => buildPeriod(pk), [pk, lang]);

  const cur = useMemo(() => sumTRY(kasa.filter((k) => inRange(k.tarih, period.start, period.end)), rates), [kasa, rates, period]);
  const prev = useMemo(() => sumTRY(kasa.filter((k) => inRange(k.tarih, period.prevStart, period.prevEnd)), rates), [kasa, rates, period]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const series = useMemo(() => monthlySeries(kasa, rates, pk === 'last12' || pk === 'thisYear' ? 12 : 6), [kasa, rates, pk, lang]);
  const periodEntries = useMemo(() => kasa.filter((k) => inRange(k.tarih, period.start, period.end)), [kasa, period]);
  const gelirKat = useMemo(() => categoryBreakdown(periodEntries, rates, 'gelir'), [periodEntries, rates]);
  const giderKat = useMemo(() => categoryBreakdown(periodEntries, rates, 'gider'), [periodEntries, rates]);
  const profit = useMemo(() => profitAnalysis(quotes, rates, period.start, period.end), [quotes, rates, period]);
  const prevProfit = useMemo(() => profitAnalysis(quotes, rates, period.prevStart, period.prevEnd), [quotes, rates, period]);

  const maxBar = Math.max(1, ...series.map((m) => Math.max(m.gelir, m.gider)));

  return (
    <View>
      <PeriodChips value={pk} onChange={setPk} />
      <Text style={[ks.muted, { marginTop: 8 }]}>{period.label} · {period.start} – {period.end}</Text>

      <View style={[ks.statRow, { marginTop: 10 }]}>
        <View style={[ks.stat, { backgroundColor: theme.colors.greenSoft, borderColor: theme.colors.greenSoft }]} testID="analiz-gelir">
          <Text style={[ks.statLabel, { color: theme.colors.greenText }]}>{upper(t('kasaX.income'))}</Text>
          <Text style={ks.statValue}>{tl(cur.gelir)}</Text>
          <Delta pct={pctChange(cur.gelir, prev.gelir)} />
        </View>
        <View style={[ks.stat, { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.redSoft }]}>
          <Text style={[ks.statLabel, { color: theme.colors.redText }]}>{upper(t('kasaX.expense'))}</Text>
          <Text style={ks.statValue}>{tl(cur.gider)}</Text>
          <Delta pct={pctChange(cur.gider, prev.gider)} invert />
        </View>
        <View style={[ks.stat, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft }]}>
          <Text style={[ks.statLabel, { color: theme.colors.primaryDark }]}>{upper(t('kasaX.net'))}</Text>
          <Text style={[ks.statValue, { color: cur.net >= 0 ? theme.colors.text : theme.colors.redText }]}>{tl(cur.net)}</Text>
          <Delta pct={pctChange(cur.net, prev.net)} />
        </View>
      </View>

      <Text style={ks.sectionH}>{series.length === 12 ? t('kasaX.last12') : t('kasaX.last6')}</Text>
      <View style={ks.card}>
        <View style={s.chart}>
          {series.map((m) => (
            <View key={m.key} style={s.col}>
              <View style={s.bars}>
                <View style={[s.bar, { height: `${(m.gelir / maxBar) * 100}%`, backgroundColor: theme.colors.green }]} />
                <View style={[s.bar, { height: `${(m.gider / maxBar) * 100}%`, backgroundColor: theme.colors.red }]} />
              </View>
              <Text style={s.colLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.legend}>
          <View style={[s.dot, { backgroundColor: theme.colors.green }]} /><Text style={ks.muted}>{t('kasaX.income')}</Text>
          <View style={[s.dot, { backgroundColor: theme.colors.red, marginLeft: 12 }]} /><Text style={ks.muted}>{t('kasaX.expense')}</Text>
        </View>
      </View>

      <Text style={ks.sectionH}>{t('kasaX.profitTitle')}</Text>
      <View style={ks.card} testID="analiz-kar">
        {profit.teklifSayisi === 0 ? (
          <Text style={ks.muted}>{t('kasaX.noApprovedPeriod')}</Text>
        ) : (
          <>
            <View style={ks.row}><Text style={ks.rowLabel}>{t('kasaX.approvedCount')}</Text><Text style={ks.rowValue}>{profit.teklifSayisi}</Text></View>
            <View style={ks.row}>
              <Text style={ks.rowLabel}>{t('kasaX.revenueExVat')}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={ks.rowValue}>{tl(profit.ciro)}</Text>
                <Delta pct={pctChange(profit.ciro, prevProfit.ciro)} />
              </View>
            </View>
            <View style={ks.row}><Text style={ks.rowLabel}>{t('kasaX.cost')}</Text><Text style={[ks.rowValue, { color: theme.colors.redText }]}>{tl(profit.maliyet)}</Text></View>
            <View style={[ks.row, { borderBottomWidth: 0 }]}>
              <Text style={[ks.rowLabel, { fontWeight: '900' }]}>{t('kasaX.grossProfit')}</Text>
              <Text style={[ks.rowValue, { fontSize: 15, color: profit.kar >= 0 ? theme.colors.greenText : theme.colors.redText }]}>
                {tl(profit.kar)}{profit.marj != null ? `  ·  %${profit.marj.toFixed(1)} ${t('kasaX.margin')}` : ''}
              </Text>
            </View>
            {profit.maliyetliSayi < profit.teklifSayisi && (
              <Text style={[ks.muted, { marginTop: 6 }]}>
                {fill(t('kasaX.missingCost'), { m: profit.teklifSayisi - profit.maliyetliSayi, n: profit.maliyetliSayi })}
              </Text>
            )}
            {profit.urunler.length > 0 && (
              <>
                <Text style={[ks.label, { marginTop: 14 }]}>{t('kasaX.topProducts')}</Text>
                {profit.urunler.map((u) => (
                  <View key={u.ad} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={ks.rowLabel} numberOfLines={1}>{u.ad}</Text>
                      <Text style={ks.rowValue}>{tl(u.ciro)}{u.kar != null ? <Text style={{ color: u.kar >= 0 ? theme.colors.greenText : theme.colors.redText }}>{`  ${t('kasaX.profitWord')} ${tl(u.kar)}`}</Text> : null}</Text>
                    </View>
                    <View style={ks.barBg}><View style={[ks.barFill, { width: `${Math.max(3, (u.ciro / (profit.urunler[0].ciro || 1)) * 100)}%`, backgroundColor: theme.colors.modules.teklif }]} /></View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </View>

      {[{ title: t('kasaX.incomeDist'), rows: gelirKat, color: theme.colors.green }, { title: t('kasaX.expenseDist'), rows: giderKat, color: theme.colors.red }].map((blk) => (
        <View key={blk.title}>
          <Text style={ks.sectionH}>{blk.title}</Text>
          <View style={ks.card}>
            {blk.rows.length === 0 ? <Text style={ks.muted}>{t('kasaX.noEntries')}</Text> : blk.rows.map((r) => (
              <View key={r.kategori} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={ks.rowLabel}>{statusLabel(lang, r.kategori)}</Text>
                  <Text style={ks.rowValue}>{tl(r.toplam)} <Text style={ks.muted}>%{r.pct.toFixed(0)}</Text></Text>
                </View>
                <View style={ks.barBg}><View style={[ks.barFill, { width: `${Math.max(2, r.pct)}%`, backgroundColor: blk.color }]} /></View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  chart: { flexDirection: 'row', height: 150, alignItems: 'flex-end', gap: 6 },
  col: { flex: 1, alignItems: 'center', height: '100%' },
  bars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  bar: { width: '38%', maxWidth: 18, minHeight: 2, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  colLabel: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textMuted, marginTop: 6 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 3 },
}));

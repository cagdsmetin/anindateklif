import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/src/lib/theme';
import { themedStyles } from '@/src/components/motion';
import type { PeriodKey } from '@/src/lib/finance';
import { useLanguage } from '@/src/lib/i18n';

// Kasa sekmelerinin (Analiz / Tekrarlayan / Raporlar) ortak parcalari.

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'thisMonth', label: 'kasaX.pThisMonth' },
  { key: 'lastMonth', label: 'kasaX.pLastMonth' },
  { key: 'thisYear', label: 'kasaX.pThisYear' },
  { key: 'last12', label: 'kasaX.pLast12' },
];

export function PeriodChips({ value, onChange }: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  const { t } = useLanguage();
  return (
    <View style={ks.chipRow}>
      {PERIODS.map((p) => (
        <TouchableOpacity key={p.key} style={[ks.chip, value === p.key && ks.chipActive]} onPress={() => onChange(p.key)} testID={`kasa-period-${p.key}`}>
          <Text style={[ks.chipText, value === p.key && ks.chipTextActive]}>{t(p.label)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Delta({ pct, invert }: { pct: number | null; invert?: boolean }) {
  const { t } = useLanguage();
  if (pct == null) return <Text style={ks.deltaMuted}>{t('kasaX.noPrev')}</Text>;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <Text style={[ks.delta, { color: good ? theme.colors.greenText : theme.colors.redText }]}>
      {up ? '▲' : '▼'} %{Math.abs(pct).toFixed(1)} <Text style={ks.deltaMuted}>{t('kasaX.vsPrev')}</Text>
    </Text>
  );
}

export const ks = themedStyles(() => StyleSheet.create({
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.text, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.modules.kasa, letterSpacing: 0.5 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.modules.kasa, borderColor: theme.colors.modules.kasa },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  statRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  stat: { flex: 1, minWidth: 150, borderRadius: 12, padding: 12, borderWidth: 1 },
  statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  statValue: { fontSize: 18, fontWeight: '900', marginTop: 4, color: theme.colors.text },
  delta: { fontSize: 11, fontWeight: '800', marginTop: 4 },
  deltaMuted: { fontSize: 10.5, fontWeight: '600', color: theme.colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  rowLabel: { fontSize: 12.5, fontWeight: '700', color: theme.colors.text, flex: 1 },
  rowValue: { fontSize: 12.5, fontWeight: '900', color: theme.colors.text },
  muted: { fontSize: 11.5, color: theme.colors.textMuted },
  barBg: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden', marginTop: 5 },
  barFill: { height: '100%', borderRadius: 4 },
}));

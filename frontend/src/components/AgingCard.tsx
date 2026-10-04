import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import type { TahsilatEntryT } from '@/src/lib/api';
import { AGING_BUCKETS, AgingBucket, AgingCustomer, RatesLike, computeAging } from '@/src/lib/tahsilat-utils';
import { fill, useLanguage } from '@/src/lib/i18n';
import { themedStyles } from '@/src/components/motion';

// Tahsilat > Alacak yaşlandırma: bekleyen alacağın ne kadarının kaç gündür
// geciktiği + en riskli müşteriler (gecikme günü × tutar).

const COLORS: Record<AgingBucket, string> = {
  notDue: '#10B981',
  d30: '#F59E0B',
  d60: '#F97316',
  d90: '#EF4444',
  d90p: '#991B1B',
};

const tl = (n: number) => '₺' + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(n || 0));

export default function AgingCard({ tahsilat, rates, onOpenCustomer }: {
  tahsilat: TahsilatEntryT[];
  rates: RatesLike;
  onOpenCustomer: (c: AgingCustomer) => void;
}) {
  const { t } = useLanguage();
  const ta = (k: string) => t('aging.' + k);
  const [showAll, setShowAll] = useState(false);
  const res = useMemo(() => computeAging(tahsilat, rates), [tahsilat, rates]);
  const total = AGING_BUCKETS.reduce((s, b) => s + res.buckets[b], 0);
  if (total <= 0.009) return null;
  const risky = showAll ? res.customers : res.customers.slice(0, 5);

  return (
    <View style={s.card} testID="aging-card">
      <View style={s.bar}>
        {AGING_BUCKETS.map((b) => (res.buckets[b] > 0 ? (
          <View key={b} style={{ flex: res.buckets[b], backgroundColor: COLORS[b] }} />
        ) : null))}
      </View>
      <View style={s.legend}>
        {AGING_BUCKETS.map((b) => (
          <View key={b} style={s.legRow}>
            <View style={[s.dot, { backgroundColor: COLORS[b] }]} />
            <Text style={s.legLabel}>{ta(b)}</Text>
            <Text style={s.legPct}>%{Math.round((res.buckets[b] / total) * 100)}</Text>
            <Text style={[s.legVal, b !== 'notDue' && res.buckets[b] > 0 && { color: COLORS[b] }]}>{tl(res.buckets[b])}</Text>
          </View>
        ))}
      </View>
      {res.unconverted && <Text style={s.note}>{ta('unconverted')}</Text>}

      {res.customers.length > 0 && (
        <>
          <Text style={s.subH}>{ta('risky')}</Text>
          {risky.map((c) => (
            <TouchableOpacity key={c.key} style={s.custRow} onPress={() => onOpenCustomer(c)} testID={`aging-cust-${c.key}`}>
              <View style={[s.dayPill, { backgroundColor: COLORS[c.maxDays > 90 ? 'd90p' : c.maxDays > 60 ? 'd90' : c.maxDays > 30 ? 'd60' : 'd30'] }]}>
                <Text style={s.dayText}>{fill(ta('days'), { n: c.maxDays })}</Text>
              </View>
              <Text style={s.custName} numberOfLines={1}>{c.musteriAdi}</Text>
              <Text style={s.custVal}>{tl(c.overdueTRY)}</Text>
              <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
          {res.customers.length > 5 && (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={{ paddingTop: 8 }}>
              <Text style={s.more}>{showAll ? ta('less') : fill(ta('more'), { n: res.customers.length - 5 })}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.colors.surfaceSoft },
  legend: { marginTop: 12, gap: 7 },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.text },
  legPct: { width: 42, textAlign: 'right', fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  legVal: { width: 96, textAlign: 'right', fontSize: 12.5, fontWeight: '900', color: theme.colors.text },
  note: { marginTop: 8, fontSize: 10.5, color: theme.colors.textMuted },
  subH: { marginTop: 14, marginBottom: 4, fontSize: 10.5, fontWeight: '900', color: theme.colors.textSoft, letterSpacing: 0.4 },
  custRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.colors.line },
  dayPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 54, alignItems: 'center' },
  dayText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  custName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  custVal: { fontSize: 12.5, fontWeight: '900', color: theme.colors.redText },
  more: { fontSize: 11.5, fontWeight: '800', color: theme.colors.primary, textAlign: 'center' },
}));

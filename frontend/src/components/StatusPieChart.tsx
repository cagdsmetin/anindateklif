import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/src/lib/theme';

// Genel amaçlı durum-dağılımı pasta grafiği. app/(tabs)/index.tsx'teki
// "Teklif Durumları" / "Nakit Durumu" pasta grafiğiyle birebir aynı görsel
// dilde (web'de gerçek dilimler + hover; native'de lejant listesi) ama
// paylaşılabilir bir bileşen olarak -- personel-teklifleri.tsx gibi başka
// ekranların da aynı görünümü tekrar yazmadan kullanabilmesi için.

function polarPoint(deg: number): string {
  const rad = (deg * Math.PI) / 180;
  const x = 50 + 50 * Math.sin(rad);
  const y = 50 - 50 * Math.cos(rad);
  return `${x}% ${y}%`;
}
function wedgeClipPath(startDeg: number, endDeg: number): string {
  const points = ['50% 50%'];
  const steps = Math.max(2, Math.ceil((endDeg - startDeg) / 6));
  for (let i = 0; i <= steps; i++) {
    points.push(polarPoint(startDeg + ((endDeg - startDeg) * i) / steps));
  }
  return `polygon(${points.join(', ')})`;
}

export function StatusPieChart({
  data,
  total,
  centerLabel = 'TOPLAM',
  formatValue = (n: number) => String(n),
  formatCenter,
  emptyText,
}: {
  data: { label: string; value: number; color: string; valueLabel?: string; countLabel?: string; amountLabel?: string }[];
  total: number;
  centerLabel?: string;
  formatValue?: (n: number) => string;
  formatCenter?: (n: number) => string;
  emptyText?: string;
}) {
  const fmtCenter = formatCenter || formatValue;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const isEmpty = !(total > 0) || data.length === 0;
  const displayData = isEmpty ? [{ label: '', value: 1, color: '#E5E7EB' }] : data;
  const displayTotal = isEmpty ? 1 : total;

  if (Platform.OS !== 'web') {
    if (isEmpty) {
      return (
        <View style={{ gap: 6 }}>
          <LegendDot color="#E5E7EB" label={emptyText || '—'} value={fmtCenter(0)} />
        </View>
      );
    }
    return (
      <View style={{ gap: 6 }}>
        {data.map((d, i) => (
          <LegendDot
            key={i}
            color={d.color}
            label={d.label}
            value={d.valueLabel || formatValue(d.value)}
            countLabel={d.countLabel}
            amountLabel={d.amountLabel}
            pctLabel={d.countLabel === undefined && total > 0 ? `${Math.round((d.value / total) * 100)}%` : undefined}
          />
        ))}
      </View>
    );
  }

  let acc = 0;
  const slices = displayData.map((d) => {
    const startDeg = (acc / displayTotal) * 360;
    acc += d.value;
    const endDeg = (acc / displayTotal) * 360;
    return { ...d, startDeg, endDeg, midDeg: (startDeg + endDeg) / 2 };
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <View style={{ width: 110, height: 110, position: 'relative' }}>
        {slices.map((sl, i) => {
          const hovered = hoverIdx === i;
          const rad = (sl.midDeg * Math.PI) / 180;
          const dx = hovered ? Math.sin(rad) * 6 : 0;
          const dy = hovered ? -Math.cos(rad) * 6 - 2 : 0;
          const hoverHandlers: any = {
            onMouseEnter: () => setHoverIdx(i),
            onMouseLeave: () => setHoverIdx(null),
          };
          return (
            <View
              key={i}
              {...hoverHandlers}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: sl.color,
                  transform: [{ translateX: dx }, { translateY: dy }],
                } as any,
                { clipPath: wedgeClipPath(sl.startDeg, sl.endDeg), transitionProperty: 'transform', transitionDuration: '180ms', cursor: 'pointer' } as any,
              ]}
            />
          );
        })}
        <View style={s.pieCenterHole} pointerEvents="none">
          <Text style={s.pieCenterLabel}>{centerLabel}</Text>
          <Text style={s.pieCenterValue} numberOfLines={1} adjustsFontSizeToFit>{fmtCenter(isEmpty ? 0 : total)}</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 130, gap: 6 }}>
        {isEmpty ? (
          <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>{emptyText || '—'}</Text>
        ) : (
          slices.map((sl, i) => {
            const hoverHandlers: any = {
              onMouseEnter: () => setHoverIdx(i),
              onMouseLeave: () => setHoverIdx(null),
            };
            return (
              <View key={i} {...hoverHandlers}>
                <LegendDot
                  color={sl.color}
                  label={sl.label}
                  value={sl.valueLabel || formatValue(sl.value)}
                  countLabel={sl.countLabel}
                  amountLabel={sl.amountLabel}
                  pctLabel={sl.countLabel === undefined && total > 0 ? `${Math.round((sl.value / total) * 100)}%` : undefined}
                />
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  value,
  countLabel,
  amountLabel,
  pctLabel,
}: {
  color: string;
  label: string;
  value: string;
  countLabel?: string;
  amountLabel?: string;
  pctLabel?: string;
}) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={countLabel !== undefined ? s.legendLabelFixed : s.legendLabel} numberOfLines={1}>{label}</Text>
      {countLabel !== undefined ? (
        <View style={s.legendCountAmountWrap}>
          <Text style={s.legendCount} numberOfLines={1}>{countLabel}</Text>
          <Text style={s.legendValue} numberOfLines={1}>{amountLabel}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          {pctLabel ? (
            <View style={[s.legendPctBadge, { backgroundColor: color + '1A' }]}>
              <Text style={[s.legendPctText, { color }]} numberOfLines={1}>{pctLabel}</Text>
            </View>
          ) : null}
          <Text style={s.legendValue} numberOfLines={1}>{value}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pieCenterHole: {
    position: 'absolute', top: '20%', left: '20%', width: '60%', height: '60%',
    borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.sm,
  },
  pieCenterLabel: { fontSize: 8, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 0.3 },
  pieCenterValue: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 1, maxWidth: '90%' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12, color: theme.colors.textSoft },
  legendLabelFixed: { width: 84, fontSize: 12, color: theme.colors.textSoft, marginRight: 8 },
  legendValue: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  legendPctBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8 },
  legendPctText: { fontSize: 10.5, fontWeight: '800' },
  legendCountAmountWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendCount: { fontSize: 12, fontWeight: '800', color: theme.colors.text, textAlign: 'left' },
});

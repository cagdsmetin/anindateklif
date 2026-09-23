import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/src/lib/theme';
import { themedStyles } from '@/src/components/motion';
import { ZIP_GRUPLAR, ZipSecimT } from '@/src/lib/zip-perde';
import { ZIP_COLOR } from './ZipPriceGrid';

// Zip Perde seçenek grupları (Motor / Kumaş / Logo baskı) -- her grupta tek
// seçim. Hesaplama ekranında ve teklifteki Zip Perde kutusunda aynı bileşen.
export default function ZipSecimSecici({
  secim,
  onChange,
  compact,
  testIDPrefix = 'zip',
}: {
  secim: ZipSecimT;
  onChange: (next: ZipSecimT) => void;
  compact?: boolean;
  testIDPrefix?: string;
}) {
  return (
    <View style={{ gap: compact ? 6 : 10 }}>
      {ZIP_GRUPLAR.map((g) => (
        <View key={g.key} style={s.grup}>
          <Text style={[s.grupLabel, compact && s.grupLabelCompact]}>{g.label}</Text>
          <View style={s.secenekler}>
            {g.secenekler.map((o) => {
              const on = secim[g.key] === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[s.chip, compact && s.chipCompact, on && s.chipOn]}
                  onPress={() => onChange({ ...secim, [g.key]: o.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  testID={`${testIDPrefix}-${g.key}-${o.id}`}
                >
                  <Text style={[s.chipText, compact && s.chipTextCompact, on && s.chipTextOn]}>{o.label}</Text>
                  {o.eur > 0 ? (
                    <Text style={[s.fiyat, on && s.chipTextOn]}>+€{o.eur}/{o.per === 'm2' ? 'm²' : 'adet'}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  grup: { gap: 5 },
  grupLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  grupLabelCompact: { fontSize: 11 },
  secenekler: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { maxWidth: '100%', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  chipCompact: { paddingVertical: 5, paddingHorizontal: 9, backgroundColor: theme.colors.surface },
  chipOn: { borderColor: ZIP_COLOR, backgroundColor: ZIP_COLOR + '14' },
  chipText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: theme.colors.text },
  chipTextCompact: { fontSize: 12 },
  chipTextOn: { color: ZIP_COLOR },
  fiyat: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
}));

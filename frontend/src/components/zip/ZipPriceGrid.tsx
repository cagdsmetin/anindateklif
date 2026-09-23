import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/src/lib/theme';
import type { ZipPerdeTableT } from '@/src/lib/api';
import { themedStyles } from '@/src/components/motion';

export const ZIP_COLOR = '#0F766E';

// Zip Perde fiyat tablosu (BOY satır, EN sütun). Seçili basamağın satır ve
// sütunu hafifçe boyanır; onPick verilirse hücreye dokunmak o ölçüyü seçer.
export default function ZipPriceGrid({ table, sel, onPick }: { table: ZipPerdeTableT; sel?: { en: number; boy: number } | null; onPick?: (w: number, h: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={s.gRow}>
          <View style={[s.gCell, s.gHead]}><Text style={s.gHeadText}>BOY↓ EN→</Text></View>
          {table.widths.map((w) => (
            <View key={w} style={[s.gCell, s.gHead, sel?.en === w && s.gHeadSel]}><Text style={s.gHeadText}>{w}</Text></View>
          ))}
        </View>
        {table.heights.map((h, ri) => (
          <View key={h} style={s.gRow}>
            <View style={[s.gCell, s.gHead, sel?.boy === h && s.gHeadSel]}><Text style={s.gHeadText}>{h}</Text></View>
            {table.widths.map((w, ci) => {
              const p = table.prices[ri]?.[ci];
              const on = sel?.en === w && sel?.boy === h;
              const band = sel && (sel.en === w || sel.boy === h);
              return (
                <TouchableOpacity
                  key={w}
                  disabled={!p || !onPick}
                  onPress={() => p && onPick?.(w, h)}
                  style={[s.gCell, band && s.gBand, on && s.gSel]}
                >
                  <Text style={[s.gText, !p && { color: theme.colors.textMuted }, on && { color: '#fff', fontWeight: '800' }]}>{p ? p : '—'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  gRow: { flexDirection: 'row' },
  gCell: { width: 52, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.colors.line },
  gHead: { backgroundColor: theme.colors.surfaceSoft },
  gHeadSel: { backgroundColor: ZIP_COLOR + '33' },
  gHeadText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted },
  gBand: { backgroundColor: ZIP_COLOR + '14' },
  gSel: { backgroundColor: ZIP_COLOR },
  gText: { fontSize: 11.5, fontWeight: '600', color: theme.colors.text },
}));

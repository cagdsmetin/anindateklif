import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '@/src/lib/theme';
import { themedStyles } from '@/src/components/motion';
import { zipIzometrikSvg, type ZipCizimModeli } from '@/src/lib/zip-cizim';

// Zip Perde izometrik ürün görseli (bkz. src/lib/zip-cizim.ts). SVG'yi
// ekrana koymanın OTA ile çıkabilen tek yolu: react-native-svg projede yok
// (native bağımlılık = mağaza derlemesi), ama react-native-webview mağazadaki
// uygulamada zaten var (bkz. app/preview.tsx). Web'de düz <img>.

export default function ZipCizim({ model, height = 240, testID }: { model: ZipCizimModeli; height?: number; testID?: string }) {
  const svg = useMemo(() => zipIzometrikSvg(model), [model]);
  const m2 = Math.round((model.enMm * model.boyMm) / 10000) / 100;

  return (
    <View style={s.wrap} testID={testID}>
      <View style={s.head}>
        <Text style={s.headText}>ÜRÜN GÖRSELİ</Text>
        <View style={s.rule} />
        <Text style={s.caption}>ART110 dikey zip perde</Text>
      </View>
      <View style={{ height, backgroundColor: '#ffffff' }}>
        {Platform.OS === 'web'
          ? React.createElement('img', {
              src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
              alt: 'Zip perde ürün görseli',
              style: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
            })
          : (
            <WebView
              originWhitelist={['*']}
              source={{
                html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;height:100%;background:#fff}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`,
              }}
              style={{ flex: 1, backgroundColor: '#ffffff' }}
              scrollEnabled={false}
              javaScriptEnabled={false}
              pointerEvents="none"
            />
          )}
      </View>
      <View style={s.foot}>
        <Text style={s.footText}>
          {model.enMm.toLocaleString('tr-TR')} × {model.boyMm.toLocaleString('tr-TR')} mm · {m2.toLocaleString('tr-TR')} m²
        </Text>
      </View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden', backgroundColor: theme.colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  headText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#0F766E' },
  rule: { flex: 1, height: 1, backgroundColor: theme.colors.line },
  caption: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  foot: { paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.colors.line },
  footText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
}));

import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { AlbertGenauKalemT } from '@/src/lib/api';

// Albert Genau malzeme listesi — ayrı bir sayfa olarak açılır (sonuç kartının
// içine inline genişleyerek AÇILMAZ). Bunun nedeni: React Native Web'de
// maxHeight'lı sade bir View, taşan içeriği kırpmıyor (overflow:'visible'
// varsayılanı) ve bu da "Teklife Ekle" butonuyla listenin görsel olarak
// çakışmasına yol açıyordu. Ayrı sayfa hem bu bugu kökten çözer hem de
// bayinin uzun malzeme listesini rahatça kaydırıp incelemesini sağlar.

function money(n: number) {
  return (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AlbertGenauKalemlerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tipAdi?: string; girdi?: string; kalemler?: string }>();

  const kalemler: AlbertGenauKalemT[] = useMemo(() => {
    try { return JSON.parse(params.kalemler || '[]'); } catch { return []; }
  }, [params.kalemler]);

  const girdi = useMemo(() => {
    try { return JSON.parse(params.girdi || '{}'); } catch { return {}; }
  }, [params.girdi]);

  const toplam = useMemo(() => kalemler.reduce((sum, k) => sum + (k.toplam || 0), 0), [kalemler]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Malzeme Listesi</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <View style={s.summaryBar}>
        <Text style={s.summaryTitle} numberOfLines={1}>{params.tipAdi || ''}</Text>
        <Text style={s.summarySub}>
          {girdi.genislikMm ? `${girdi.genislikMm}×${girdi.yapilabilirDerinlikMm}mm` : ''}
          {girdi.yukseklikMm ? ` • Y:${girdi.yukseklikMm}mm` : ''}
          {girdi.modulSayisi ? ` • ${girdi.modulSayisi} modül` : ''}
          {` • ${kalemler.length} kalem`}
        </Text>
      </View>

      <FlatList
        data={kalemler}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 }}
        renderItem={({ item: k }) => (
          <View style={s.kalemRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.kalemLabel} numberOfLines={2}>{k.label}</Text>
              <Text style={s.kalemSku}>{k.sku} • {k.miktar} × ₺{money(k.birimFiyat)}</Text>
            </View>
            <Text style={s.kalemToplam}>₺{money(k.toplam)}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOPLAM MALZEME MALİYETİ</Text>
            <Text style={s.totalValue}>₺{money(toplam)}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  summaryBar: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  summaryTitle: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  summarySub: { fontSize: 11.5, color: theme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  kalemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF1F5' },
  kalemLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  kalemSku: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  kalemToplam: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.navy, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  totalLabel: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  totalValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
});

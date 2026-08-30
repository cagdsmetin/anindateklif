import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { computeCustomerDebtSummaries } from '@/src/lib/tahsilat-utils';

/**
 * Tahsilat ekranındaki "BORÇLU MÜŞTERİ" kartına tıklanınca açılan liste.
 * (tabs) grubu içinde, href:null ile kayıtlı bir ekran -- bu sayede masaüstü
 * sol bar (Sidebar) ve mobil çekmece menüsü her zaman görünür kalır, daha
 * önce leads.tsx/calendar.tsx için düzeltilen "sidebar kayboluyor" bugu
 * burada tekrar etmez.
 *
 * Her müşteri için o para biriminde BUGÜNE KADAR toplam ne kadar borçlandığı
 * (TOPLAM BORÇ) ve şu an hâlâ ne kadar borcu kaldığı (KALAN BORÇ) ayrı ayrı
 * gösterilir. Satıra dokununca o müşterinin tam para akışı geçmişine
 * (customer-ledger) gidilir -- o ekran da aynı şekilde sidebar'ı koruyor.
 */
function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}

export default function BorcluMusterilerScreen() {
  const router = useRouter();
  const { tahsilat, activeCompany } = useApp();

  const debtors = useMemo(() => computeCustomerDebtSummaries(tahsilat), [tahsilat]);

  const openLedger = (d: { customerId: string; musteriAdi: string; musteriTelefon: string }) => {
    router.push({
      pathname: '/customer-ledger',
      params: { customerId: d.customerId || '', musteriAdi: d.musteriAdi, musteriTelefon: d.musteriTelefon || '' },
    } as any);
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Borçlu Müşteriler</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.divider} />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Borçlu Müşteriler</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />
      <FlatList
        data={debtors}
        keyExtractor={(d) => d.key}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Borçlu müşteri yok.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => openLedger(item)} testID={`borclu-row-${item.key}`}>
            <View style={s.rowIcon}>
              <Ionicons name="person" size={17} color={theme.colors.modules.tahsilat} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName} numberOfLines={1}>{item.musteriAdi}</Text>
              {item.musteriTelefon ? <Text style={s.rowPhone}>{item.musteriTelefon}</Text> : null}
              {item.perCurrency.map((x) => (
                <View key={x.paraBirimi} style={s.curRow}>
                  <Text style={s.curLabel}>Toplam Borç: <Text style={s.curValue}>{fmt(x.toplamBorc, x.paraBirimi)}</Text></Text>
                  <Text style={s.curLabel}>Kalan Borç: <Text style={[s.curValue, { color: theme.colors.red }]}>{fmt(x.kalanBorc, x.paraBirimi)}</Text></Text>
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  emptyBox: { marginTop: 40, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 13, color: theme.colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line,
    padding: 14, marginBottom: 10, ...theme.shadow.sm,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  rowPhone: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  curRow: { flexDirection: 'row', gap: 14, marginTop: 6, flexWrap: 'wrap' },
  curLabel: { fontSize: 11.5, color: theme.colors.textMuted, fontWeight: '600' },
  curValue: { fontWeight: '900', color: theme.colors.text },
});

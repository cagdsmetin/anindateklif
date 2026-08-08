import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';

export default function CustomersScreen() {
  const { customers, quotes, deleteCustomer, activeCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const cq = quotes.filter((qq) => qq.musFirma.toLowerCase() === c.firma.toLowerCase());
      const total = cq.reduce((a, x) => a + x.genelToplam, 0);
      return { ...c, count: cq.length, total };
    });
  }, [customers, quotes]);

  const filtered = q
    ? enriched.filter(
        (c) =>
          c.firma.toLowerCase().includes(q.toLowerCase()) ||
          c.yetkili.toLowerCase().includes(q.toLowerCase())
      )
    : enriched;

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Müşteriler" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={`Müşteriler (${customers.length})`} />
      <View style={{ padding: 14 }}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="customer-search"
            style={s.searchInput}
            placeholder="Firma veya yetkili ara..."
            placeholderTextColor="#94a3b8"
            value={q}
            onChangeText={setQ}
          />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="people-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Kayıtlı müşteri yok. Teklif oluşturdukça otomatik eklenir.</Text>
          </View>
        ) : (
          filtered.map((c) => (
            <View key={c.id} style={s.card} testID={`customer-card-${c.id}`}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.firma} numberOfLines={1}>{c.firma}</Text>
                {c.yetkili ? <Text style={s.line} numberOfLines={1}>👤 {c.yetkili}</Text> : null}
                {c.telefon ? <Text style={s.line} numberOfLines={1}>📞 {c.telefon}</Text> : null}
                {c.email ? <Text style={s.line} numberOfLines={1}>✉️ {c.email}</Text> : null}
                {c.adres ? <Text style={s.line} numberOfLines={2}>📍 {c.adres}</Text> : null}
                <View style={s.badgeRow}>
                  <View style={s.badge}><Text style={s.badgeText}>{c.count} teklif</Text></View>
                  <View style={[s.badge, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
                    <Text style={[s.badgeText, { color: '#166534' }]}>
                      Toplam: {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(c.total)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    // create a new quote pre-filled? For simplicity, navigate to editor
                    router.push('/(tabs)/');
                    showToast(`"${c.firma}" için teklif hazırlanıyor`);
                  }}
                  testID={`quote-for-${c.id}`}
                  style={s.miniBtn}
                >
                  <Ionicons name="create-outline" size={16} color={theme.colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteCustomer(c.id)} testID={`delete-cust-${c.id}`} style={s.miniBtn}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  emptyBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.lineDark,
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
  },
  firma: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  line: { fontSize: 11.5, color: theme.colors.textMuted },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: 12,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.accent },
  miniBtn: {
    width: 34,
    height: 34,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

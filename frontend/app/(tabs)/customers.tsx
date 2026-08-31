import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { useLanguage } from '@/src/lib/i18n';

const currencySymbol = (code: string) => (code === 'USD' ? '$' : code === 'EUR' ? '€' : '₺');
const formatMoney = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(n || 0);

export default function CustomersScreen() {
  const { t } = useLanguage();
  const { customers, quotes, deleteCustomer, activeCompany } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const own = quotes.filter(
        (qq) =>
          qq.musFirma.trim().toLowerCase() === (c.firma || '').trim().toLowerCase() ||
          (qq.musTelefon && c.telefon && qq.musTelefon.replace(/\D/g, '') === c.telefon.replace(/\D/g, '')),
      );
      const total = own.reduce((a, x) => a + (x.genelToplam || 0), 0);
      const currency = own[0]?.paraBirimi || 'TRY';
      return { ...c, count: own.length, total, currency };
    });
  }, [customers, quotes]);

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('customers.s001')} />
        <View style={s.empty}>
          <Text style={s.emptyText}>{t('customers.s002')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('customers.s001')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary CTA — matches the reference screenshot */}
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => router.push('/customer-add')}
          activeOpacity={0.9}
          testID="customer-add-btn"
        >
          <Ionicons name="person-add" size={20} color="#fff" />
          <Text style={s.addBtnText}>{t('customers.s003')}</Text>
        </TouchableOpacity>

        {enriched.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="people-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>{t('customers.s004')}</Text>
          </View>
        ) : (
          enriched.map((c) => {
            const letter = ((c.firma || '?').trim().charAt(0) || '?').toUpperCase();
            return (
              <View key={c.id} style={s.card} testID={`customer-card-${c.id}`}>
                {/* Top row: avatar + name/phone + actions */}
                <View style={s.topRow}>
                  <View style={s.avatar}>
                    <Text style={s.avatarLetter}>{letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{c.firma || t('customers.s005')}</Text>
                    {c.telefon ? (
                      <Text style={s.phone} numberOfLines={1}>{c.telefon}</Text>
                    ) : (
                      <Text style={s.phoneMuted}>{t('customers.s006')}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteCustomer(c.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID={`delete-cust-${c.id}`}
                    style={s.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/customer-add', params: { id: c.id } })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID={`open-cust-${c.id}`}
                    style={s.iconBtn}
                  >
                    <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={s.cardDivider} />

                {/* Bottom stats row */}
                <View style={s.statsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.statLabel}>{t('customers.s007')}</Text>
                    <Text style={s.statValue}>{c.count} {t('customers.s008')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.statLabel}>{t('customers.s009')}</Text>
                    <Text style={[s.statValue, { color: theme.colors.primary }]}>
                      {currencySymbol(c.currency)}
                      {formatMoney(c.total)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },

  addBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
    ...theme.shadow.lg,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  emptyBox: {
    marginTop: 30,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderStyle: 'dashed',
  },
  emptyTextBox: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.05,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  phone: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  phoneMuted: { fontSize: 12, color: theme.colors.lineDark, marginTop: 2, fontStyle: 'italic' },
  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  cardDivider: { height: 1, backgroundColor: theme.colors.line, marginVertical: 12 },

  statsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  statValue: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
});

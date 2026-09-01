import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, AdminCustomerT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AdminCustomersScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, enterAsCustomer } = useAuth();

  const [customers, setCustomers] = useState<AdminCustomerT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listAdminCustomers();
      setCustomers(res || []);
      setError('');
    } catch {
      setError('Müşteri listesi alınamadı.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [customers, query]);

  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  const doEnter = async (c: AdminCustomerT) => {
    if (busyId) return;
    setBusyId(c.user_id);
    try {
      await enterAsCustomer(c.user_id);
      router.replace('/(tabs)');
    } catch (e: any) {
      let msg = 'Giriş yapılamadı.';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusyId('');
    }
  };

  const onEnterPress = (c: AdminCustomerT) => {
    const label = c.company_name || c.name || c.email;
    const message = `"${label}" hesabına, şifresini bilmeden, geçici destek erişimi açılacak. Devam edilsin mi?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) doEnter(c);
      return;
    }
    Alert.alert('Müşteri Olarak Gir', message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gir', style: 'destructive', onPress: () => doEnter(c) },
    ]);
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Müşteri Olarak Gir</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu ekrana erişim yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Müşteri Olarak Gir</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={s.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
            <Text style={s.infoText}>
              Buradan seçtiğin firmaya, şifresini görmeden/sormadan geçici (30 dk) bir destek erişimi açılır. Her giriş kayıt altına alınır.
            </Text>
          </View>

          <TextInput
            style={s.search}
            placeholder="Firma, isim veya e-posta ara..."
            placeholderTextColor="#94a3b8"
            value={query}
            onChangeText={setQuery}
          />

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <Text style={[s.sectionLabel, { marginTop: 18 }]}>MÜŞTERİLER ({filtered.length})</Text>
          {filtered.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Kayıt bulunamadı.</Text>
          ) : (
            filtered.map((c) => (
              <View key={c.user_id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.company_name || c.name || c.email}</Text>
                  <Text style={s.rowMeta} numberOfLines={1}>{c.email}{c.phone ? ` · ${c.phone}` : ''}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <View style={[s.badge, c.subscription_active ? s.badgeActive : s.badgeInactive]}>
                      <Text style={[s.badgeText, c.subscription_active ? s.badgeTextActive : s.badgeTextInactive]}>
                        {c.subscription_active ? 'Aktif Abonelik' : 'Abone Değil'}
                      </Text>
                    </View>
                    {c.created_at ? <Text style={s.rowDate}>{fmtDate(c.created_at)}</Text> : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.enterBtn, busyId === c.user_id && { opacity: 0.6 }]}
                  onPress={() => onEnterPress(c)}
                  disabled={!!busyId}
                >
                  {busyId === c.user_id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={15} color="#fff" />
                      <Text style={s.enterBtnText}>Müşteri olarak gir</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: theme.colors.text, lineHeight: 17 },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    color: theme.colors.text,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    ...theme.shadow.sm,
  },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: theme.colors.text },
  rowMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowDate: { fontSize: 10.5, color: theme.colors.textMuted },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeActive: { backgroundColor: theme.colors.greenSoft },
  badgeInactive: { backgroundColor: '#F1F5F9' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextActive: { color: '#166534' },
  badgeTextInactive: { color: theme.colors.textMuted },
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  enterBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});

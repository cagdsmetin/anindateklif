import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, StaffInviteInfoT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token || '';
  const { acceptInvite } = useAuth();

  const [info, setInfo] = useState<StaffInviteInfoT | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.getInviteInfo(token)
      .then((res) => setInfo(res))
      .catch(() => setInfo({ valid: false, reason: 'Davet bilgisi alınamadı' }))
      .finally(() => setLoading(false));
  }, [token]);

  const onSubmit = async () => {
    if (busy) return;
    if (!name.trim()) { setError('Adınızı girin'); return; }
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalı'); return; }
    setError('');
    setBusy(true);
    try {
      await acceptInvite(token, name.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      let msg = 'Katılma işlemi başarısız, tekrar deneyin';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.logoWrap}>
            <View style={s.logoBadge}>
              <Ionicons name="flash" size={22} color="#fff" />
            </View>
            <Text style={s.appName}>Anında Teklif</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : !info?.valid ? (
            <View style={s.card}>
              <Ionicons name="alert-circle-outline" size={30} color={theme.colors.red} />
              <Text style={s.errorTitle}>Davet geçersiz</Text>
              <Text style={s.errorBody}>{info?.reason || 'Bu davet bağlantısı geçersiz veya süresi dolmuş.'}</Text>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.title}>{info.company_name}</Text>
              <Text style={s.subtitle}>sizi ekibine davet etti</Text>
              <Text style={s.emailLine}>{info.email} · {info.role === 'admin' ? 'Yönetici' : 'Personel'}</Text>

              <View style={{ marginTop: 20, gap: 12 }}>
                <TextInput
                  style={s.input}
                  placeholder="Adınız Soyadınız"
                  placeholderTextColor="#94a3b8"
                  value={name}
                  onChangeText={setName}
                  testID="join-name"
                />
                <TextInput
                  style={s.input}
                  placeholder="Şifre belirleyin (en az 8 karakter)"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  testID="join-password"
                />
              </View>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onSubmit} disabled={busy} testID="join-submit">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Katıl</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoBadge: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  appName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, marginBottom: 10 },
  emailLine: { fontSize: 12.5, color: theme.colors.textSoft, fontWeight: '700' },
  input: {
    width: '100%',
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: theme.colors.text,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  errorTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 10 },
  errorBody: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    width: '100%',
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

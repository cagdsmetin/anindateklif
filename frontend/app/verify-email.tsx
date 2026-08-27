import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';

/**
 * Kayıt sırasında gönderilen e-postadaki bağlantı buraya açılır:
 *   {FRONTEND_BASE_URL}/verify-email?token=...
 * Hem giriş yapılmış hem de yapılmamış durumda çalışır (RouteGuard bu route'u
 * public listede tutuyor) -- kullanıcı linke başka bir cihazdan tıklamış
 * olabilir.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus('error');
        setError('Doğrulama bağlantısı eksik. Lütfen e-postadaki bağlantıyı tekrar açın.');
        return;
      }
      try {
        await api.verifyEmail(token);
        setStatus('ok');
        if (user) {
          try { await refreshUser(); } catch {}
        }
      } catch (e: any) {
        setStatus('error');
        const bodyMsg = (e?.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
        setError(bodyMsg || 'Doğrulama başarısız oldu. Bağlantının süresi dolmuş olabilir.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.logoWrap}>
          <BrandLogo size={72} />
        </View>
        <Text style={s.title}>E-posta Doğrulama</Text>

        {status === 'checking' && (
          <View style={s.centerBlock}>
            <ActivityIndicator size="large" color={authTheme.primary} />
            <Text style={s.subtitle}>Doğrulanıyor...</Text>
          </View>
        )}

        {status === 'ok' && (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle" size={18} color={authTheme.success} />
            <Text style={s.successText}>E-posta adresin başarıyla doğrulandı.</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {status !== 'checking' && (
          <TouchableOpacity
            style={s.cta}
            onPress={() => router.replace(user ? '/(tabs)' : '/login')}
            testID="verify-email-continue"
          >
            <Text style={s.ctaText}>{user ? 'Uygulamaya Dön' : 'Giriş Ekranına Git'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24, flexGrow: 1 },
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  title: { color: authTheme.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 18 },
  centerBlock: { alignItems: 'center', gap: 12, marginBottom: 18 },
  subtitle: { color: authTheme.textMuted, fontSize: 14, textAlign: 'center' },
  successBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)',
    borderWidth: 1, borderRadius: authRadius.md, padding: 12, marginBottom: 18,
  },
  successText: { color: authTheme.success, fontSize: 13, flex: 1, lineHeight: 18 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1, borderRadius: authRadius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 18,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  cta: {
    backgroundColor: authTheme.primary, borderRadius: authRadius.xl, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

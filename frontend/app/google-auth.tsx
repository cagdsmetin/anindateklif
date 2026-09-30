import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authTheme } from '@/src/lib/auth-theme';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';
import { googleErrorMessage } from '@/src/lib/google';

// Google ile girişten dönüş adresi: sunucu buraya tek kullanımlık bir kod
// (google_code) ya da hata (google_error) ile yönlendirir.
export default function GoogleAuthReturn() {
  const { t } = useLanguage();
  const router = useRouter();
  const { user, loginWithGoogleCode } = useAuth();
  const params = useLocalSearchParams<{ google_code?: string; google_error?: string }>();
  const [error, setError] = useState<string | null>(params.google_error ? googleErrorMessage(String(params.google_error)) : null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const code = params.google_code ? String(params.google_code) : '';
    if (!code) {
      if (!params.google_error) {
        if (user) router.replace('/');
        else setError(t('gAuth.error'));
      }
      return;
    }
    started.current = true;
    loginWithGoogleCode(code)
      .then(() => router.replace('/'))
      .catch((e: any) => {
        // Mobilde aynı kodu giriş ekranı da harcamış olabilir; oturum açıldıysa sorun yok.
        if (user) router.replace('/');
        else setError(e?.message || t('gAuth.error'));
      });
  }, [params.google_code, params.google_error, user, loginWithGoogleCode, router, t]);

  return (
    <View style={s.container}>
      {error ? (
        <>
          <Text style={s.err}>{error}</Text>
          <TouchableOpacity onPress={() => router.replace('/login')} style={s.btn}>
            <Text style={s.btnT}>{t('gAuth.back')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={authTheme.primary} />
          <Text style={s.info}>{t('gAuth.signingIn')}</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: authTheme.bg, padding: 24 },
  info: { color: authTheme.textMuted, marginTop: 14, fontSize: 14 },
  err: { color: authTheme.danger, fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 18 },
  btn: { backgroundColor: authTheme.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22 },
  btnT: { color: '#fff', fontWeight: '800' },
});

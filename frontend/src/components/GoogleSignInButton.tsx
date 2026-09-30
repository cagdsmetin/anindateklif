import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { useAuth, CAMPAIGN_STORAGE_KEY } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';
import { storage } from '@/src/utils/storage';
import { appReturnUrl, googleErrorMessage, googleLoginUrl, runGoogleFlow, useGoogleConfig } from '@/src/lib/google';
import { themedStyles } from '@/src/components/motion';

// Giriş ve kayıt ekranlarındaki "Google ile devam et" butonu. Sunucuda
// Google yapılandırılmamışsa hiç görünmez.
export default function GoogleSignInButton({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useLanguage();
  const cfg = useGoogleConfig();
  const { loginWithGoogleCode } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!cfg?.login) return null;

  const onPress = async () => {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const returnUrl = appReturnUrl('google-auth');
      const campaign = (await storage.getItem<string>(CAMPAIGN_STORAGE_KEY, '')) || undefined;
      const res = await runGoogleFlow(googleLoginUrl(returnUrl, campaign), returnUrl);
      if (Platform.OS === 'web') return; // sayfa Google'a yönlendi
      if (res?.google_code) {
        await loginWithGoogleCode(res.google_code);
        // Yönlendirmeyi RouteGuard yapar.
      } else if (res?.google_error) {
        onError(googleErrorMessage(res.google_error));
      }
    } catch (e: any) {
      onError(e?.message || t('gAuth.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={s.orRow}>
        <View style={s.orLine} />
        <Text style={s.orText}>{t('gAuth.or')}</Text>
        <View style={s.orLine} />
      </View>
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.7 }]} onPress={onPress} disabled={busy} activeOpacity={0.9} testID="google-signin">
        {busy ? <ActivityIndicator color="#1f2937" /> : (
          <>
            <Ionicons name="logo-google" size={18} color="#EA4335" />
            <Text style={s.btnText}>{t('gAuth.continue')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: authTheme.cardBorder },
  orText: { color: authTheme.textMuted, fontSize: 12, fontWeight: '700' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: authRadius.xl, paddingVertical: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  btnText: { color: '#1f2937', fontSize: 15, fontWeight: '800' },
}));

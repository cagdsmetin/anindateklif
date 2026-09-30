import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';

// iPhone'da "Apple ile giriş" butonu (App Store kuralı 4.8: Google girişi
// sunan iOS uygulaması Apple girişini de sunmalı). Diğer platformlarda ve
// Apple girişini desteklemeyen cihazlarda hiç görünmez.
export function useAppleSignInAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setOk).catch(() => setOk(false));
  }, []);
  return ok;
}

export default function AppleSignInButton({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useLanguage();
  const { loginWithApple } = useAuth();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) throw new Error(t('gAuth.error'));
      // Apple adı yalnızca ilk girişte verir.
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      await loginWithApple(cred.identityToken, fullName || undefined);
      // Yönlendirmeyi RouteGuard yapar.
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      onError(e?.message || t('gAuth.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
      cornerRadius={24}
      style={[s.btn, busy && { opacity: 0.7 }]}
      onPress={onPress}
    />
  );
}

const s = StyleSheet.create({
  btn: { width: '100%', height: 50, marginTop: 10 },
});

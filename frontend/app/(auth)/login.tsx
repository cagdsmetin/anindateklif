import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { LanguageFlagSwitcher } from '@/src/components/LanguageFlagSwitcher';
import BlackHoleBackground from '@/src/components/BlackHoleBackground';
import { useAuth } from '@/src/state/AuthContext';
import { ApiError } from '@/src/lib/api';
import { useLanguage } from '@/src/lib/i18n';
import { MotionScrollView, themedStyles } from '@/src/components/motion';
import { glass, GlassAuthCard, GlassButton, GlassInput } from '@/src/components/auth/GlassAuth';

export default function LoginScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 900;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !password) {
      setError(t('login.s001'));
      return;
    }
    setBusy(true);
    try {
      await login({ email: em, password });
      // Route guard will redirect based on onboarding state.
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[login] failed', { kind: e?.kind, status: e?.status, msg: e?.message });
      if (e instanceof ApiError) {
        if (e.kind === 'network') setError(t('login.s002'));
        else if (e.kind === 'timeout') setError(t('login.s003'));
        else if (e.status === 401) setError(t('login.s004'));
        else if (typeof e.status === 'number' && e.status >= 500) setError(t('login.s005'));
        else setError(`Giriş yapılamadı (${e.status || '?'}).`);
      } else {
        setError(t('login.s006'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.bgWrap} pointerEvents="none">
        <BlackHoleBackground centerX={0.5} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <MotionScrollView
          contentContainerStyle={[s.scroll, isDesktopWeb && s.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isDesktopWeb && (
            <TouchableOpacity style={s.backHome} onPress={() => router.push('/landing')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={15} color={glass.textDim} />
              <Text style={s.backHomeText}>{t('landing.s001')} {t('landing.s002')}</Text>
            </TouchableOpacity>
          )}
          <GlassAuthCard contentStyle={!isDesktopWeb && s.cardCompact}>
            <View style={s.langRow}>
              <LanguageFlagSwitcher />
            </View>
            <Animated.View entering={ZoomIn.springify().damping(14)} style={s.logoWrap}>
              <BrandLogo size={isDesktopWeb ? 72 : 64} />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(200).duration(450)} style={s.title}>{t('login.s007')}</Animated.Text>
            <Animated.Text entering={FadeIn.delay(300).duration(450)} style={s.subtitle}>{t('login.s008')}</Animated.Text>

            {error ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <GlassInput
              icon="mail-outline"
              placeholder={t('login.s009')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="login-email"
            />
            <GlassInput
              icon="lock-closed-outline"
              placeholder={t('login.s010')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password"
              onSubmitEditing={onSubmit}
              testID="login-password"
              trailing={
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={19} color={glass.textFaint} />
                </TouchableOpacity>
              }
            />

            <TouchableOpacity
              style={s.forgotWrap}
              onPress={() => router.push('/forgot-password')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.forgotText}>{t('login.s011')}</Text>
            </TouchableOpacity>

            <GlassButton label={t('login.s012')} onPress={onSubmit} busy={busy} testID="login-submit" />

            <Animated.View entering={FadeIn.delay(500)} style={s.footer}>
              <Text style={s.footerText}>{t('login.s013')} </Text>
              <TouchableOpacity onPress={() => router.replace('/register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.footerLink}>{t('login.s014')}</Text>
              </TouchableOpacity>
            </Animated.View>
          </GlassAuthCard>
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg, position: 'relative', overflow: 'hidden' },
  bgWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scroll: { paddingHorizontal: 16, paddingVertical: 24, flexGrow: 1, justifyContent: 'center' },
  scrollDesktop: { alignItems: 'center', paddingVertical: 48 },
  backHome: {
    width: '100%', maxWidth: 440, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  backHomeText: { color: glass.textDim, fontSize: 13, fontWeight: '600' },
  cardCompact: { paddingHorizontal: 20, paddingVertical: 26 },
  langRow: { alignItems: 'center', marginBottom: 14 },
  logoWrap: { alignItems: 'center', marginBottom: 18 },
  title: { color: glass.text, fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: glass.textDim, fontSize: 14, textAlign: 'center', marginBottom: 26 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)', borderWidth: 1,
    borderRadius: authRadius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  forgotWrap: { alignSelf: 'flex-end', marginTop: 2, marginBottom: 18 },
  forgotText: { color: glass.textDim, fontSize: 13, fontWeight: '600' },
  footer: { marginTop: 22, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  footerText: { color: glass.textDim, fontSize: 13 },
  footerLink: { color: glass.text, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
}));

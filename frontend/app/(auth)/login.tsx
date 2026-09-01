import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { authTheme, authRadius, authSpacing } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { LanguageFlagSwitcher } from '@/src/components/LanguageFlagSwitcher';
import { useAuth } from '@/src/state/AuthContext';
import { ApiError } from '@/src/lib/api';
import { useLanguage } from '@/src/lib/i18n';

export default function LoginScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { login } = useAuth();
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.langRow}>
            <LanguageFlagSwitcher />
          </View>
          <View style={s.logoWrap}>
            <BrandLogo size={92} />
          </View>
          <Text style={s.title}>{t('login.s007')}</Text>
          <Text style={s.subtitle}>{t('login.s008')}</Text>

          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <InputRow
            icon="mail-outline"
            placeholder={t('login.s009')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            testID="login-email"
          />
          <InputRow
            icon="lock-closed-outline"
            placeholder={t('login.s010')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoComplete="password"
            testID="login-password"
            trailing={
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={authTheme.textMuted} />
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

          <TouchableOpacity
            activeOpacity={0.9}
            style={[s.cta, busy && s.ctaDisabled]}
            onPress={onSubmit}
            disabled={busy}
            testID="login-submit"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{t('login.s012')}</Text>
            )}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>{t('login.s013')}</Text>
            <TouchableOpacity onPress={() => router.replace('/register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.footerLink}>{t('login.s014')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InputRow({
  icon,
  trailing,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={s.inputRow}>
      <Ionicons name={icon} size={20} color={authTheme.primary} style={{ marginRight: 10 }} />
      <TextInput
        {...rest}
        placeholderTextColor={authTheme.textMuted}
        style={s.input}
      />
      {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' },
  langRow: { alignItems: 'center', marginBottom: 14 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  title: {
    color: authTheme.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: authTheme.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    borderRadius: authRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    borderRadius: authRadius.lg,
    paddingHorizontal: 14,
    height: 56,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: authTheme.text,
    fontSize: 15,
    paddingVertical: 0,
    ...Platform.select({ web: { outlineWidth: 0 } as any }),
  },
  forgotWrap: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 20 },
  forgotText: { color: authTheme.link, fontSize: 13, fontWeight: '700' },
  cta: {
    backgroundColor: authTheme.primary,
    borderRadius: authRadius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: authTheme.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  footer: {
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  footerText: { color: authTheme.textMuted, fontSize: 13 },
  footerLink: { color: authTheme.link, fontSize: 13, fontWeight: '700' },
});

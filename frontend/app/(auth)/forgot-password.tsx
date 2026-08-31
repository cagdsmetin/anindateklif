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
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError(t('forgotPassword.s001'));
      return;
    }
    setBusy(true);
    try {
      await forgotPassword(em);
      setSent(true);
    } catch {
      setError(t('forgotPassword.s002'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={s.back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={authTheme.text} />
          </TouchableOpacity>

          <View style={s.logoWrap}>
            <BrandLogo size={72} />
          </View>
          <Text style={s.title}>{t('forgotPassword.s003')}</Text>
          <Text style={s.subtitle}>
            {t('forgotPassword.s004')}</Text>

          {sent ? (
            <View style={s.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={authTheme.success} />
              <Text style={s.successText}>
                {t('forgotPassword.s005')}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={s.inputRow}>
            <Ionicons name="mail-outline" size={20} color={authTheme.primary} style={{ marginRight: 10 }} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('forgotPassword.s006')}
              placeholderTextColor={authTheme.textMuted}
              style={s.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="fp-email"
            />
          </View>

          <TouchableOpacity
            style={[s.cta, busy && s.ctaDisabled]}
            onPress={onSubmit}
            disabled={busy}
            testID="fp-submit"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('forgotPassword.s007')}</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <TouchableOpacity onPress={() => router.replace('/login')}>
              <Text style={s.footerLink}>{t('forgotPassword.s008')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginTop: 24, marginBottom: 16 },
  title: { color: authTheme.text, fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: authTheme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  successBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)',
    borderWidth: 1, borderRadius: authRadius.md, padding: 12, marginBottom: 14,
  },
  successText: { color: authTheme.success, fontSize: 13, flex: 1, lineHeight: 18 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1, borderRadius: authRadius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: authTheme.card, borderColor: authTheme.cardBorder,
    borderWidth: 1, borderRadius: authRadius.lg, paddingHorizontal: 14, height: 56, marginBottom: 16,
  },
  input: { flex: 1, color: authTheme.text, fontSize: 15, paddingVertical: 0, ...Platform.select({ web: { outlineWidth: 0 } as any }) },
  cta: {
    backgroundColor: authTheme.primary, borderRadius: authRadius.xl, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footer: { marginTop: 22, alignItems: 'center' },
  footerLink: { color: authTheme.link, fontSize: 14, fontWeight: '700' },
});

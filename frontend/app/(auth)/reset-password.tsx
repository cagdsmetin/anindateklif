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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { useAuth } from '@/src/state/AuthContext';

/**
 * Opened via the link inside the password-reset email:
 *   {FRONTEND_BASE_URL}/reset-password?token=...
 * The token also has a manual-entry fallback field for cases where it isn't
 * present in the URL (e.g. pasted by hand from a non-clickable context).
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const initialToken = typeof params.token === 'string' ? params.token : '';

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!token.trim()) {
      setError('Sıfırlama bağlantısındaki kod eksik. Lütfen e-postadaki bağlantıyı tekrar açın.');
      return;
    }
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Şifre en az 8 karakter olmalı; büyük/küçük harf, rakam ve sembol içermelidir');
      return;
    }
    if (password !== confirm) {
      setError('Şifreler eşleşmiyor');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token.trim(), password);
      setDone(true);
    } catch (e: any) {
      setError(e?.body ? 'Bağlantının süresi dolmuş olabilir. Lütfen yeniden sıfırlama isteği gönderin.' : 'İşlem başarısız. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.replace('/login')} style={s.back} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={authTheme.text} />
          </TouchableOpacity>

          <View style={s.logoWrap}>
            <BrandLogo size={72} />
          </View>
          <Text style={s.title}>Yeni Şifre Belirle</Text>
          <Text style={s.subtitle}>
            {done
              ? 'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.'
              : 'E-postana gelen bağlantı bu ekranı otomatik olarak doldurur. Aşağıya yeni şifreni gir.'}
          </Text>

          {done ? (
            <View style={s.successBox}>
              <Ionicons name="checkmark-circle" size={18} color={authTheme.success} />
              <Text style={s.successText}>Şifreniz başarıyla güncellendi.</Text>
            </View>
          ) : (
            <>
              {error ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              {!initialToken ? (
                <View style={s.inputRow}>
                  <Ionicons name="key-outline" size={20} color={authTheme.primary} style={{ marginRight: 10 }} />
                  <TextInput
                    value={token}
                    onChangeText={setToken}
                    placeholder="Sıfırlama Kodu (e-postadaki bağlantıdan)"
                    placeholderTextColor={authTheme.textMuted}
                    style={s.input}
                    autoCapitalize="none"
                    testID="rp-token"
                  />
                </View>
              ) : null}

              <View style={s.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color={authTheme.primary} style={{ marginRight: 10 }} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Yeni Şifre"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  testID="rp-password"
                />
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={authTheme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={s.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color={authTheme.primary} style={{ marginRight: 10 }} />
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Yeni Şifre (Tekrar)"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  testID="rp-confirm"
                />
              </View>

              <Text style={s.helperText}>
                En az 8 karakter; büyük harf, küçük harf, rakam ve sembol içermelidir.
              </Text>

              <TouchableOpacity
                style={[s.cta, busy && s.ctaDisabled]}
                onPress={onSubmit}
                disabled={busy}
                testID="rp-submit"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Şifreyi Güncelle</Text>}
              </TouchableOpacity>
            </>
          )}

          <View style={s.footer}>
            <TouchableOpacity onPress={() => router.replace('/login')}>
              <Text style={s.footerLink}>← Giriş Ekranına Dön</Text>
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
    borderWidth: 1, borderRadius: authRadius.lg, paddingHorizontal: 14, height: 56, marginBottom: 14,
  },
  input: { flex: 1, color: authTheme.text, fontSize: 15, paddingVertical: 0, ...Platform.select({ web: { outlineWidth: 0 } as any }) },
  helperText: { fontSize: 11.5, color: authTheme.textMuted, marginBottom: 18, lineHeight: 16 },
  cta: {
    backgroundColor: authTheme.primary, borderRadius: authRadius.xl, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footer: { marginTop: 22, alignItems: 'center' },
  footerLink: { color: authTheme.link, fontSize: 14, fontWeight: '700' },
});

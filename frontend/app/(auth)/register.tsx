import React, { useMemo, useState } from 'react';
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
import { useAuth } from '@/src/state/AuthContext';
import { ApiError } from '@/src/lib/api';
import {
  evaluatePassword,
  isPasswordValid,
  PASSWORD_RULE_LABELS,
  PasswordRuleKey,
} from '@/src/utils/password-validation';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwStatus = useMemo(() => evaluatePassword(password), [password]);
  const pwValid = useMemo(() => isPasswordValid(password), [password]);

  const canSubmit =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    pwValid &&
    acceptedTerms;

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!canSubmit) {
      if (!acceptedTerms) setError('Devam etmek için Gizlilik İlkesi ve Hizmet Şartlarını kabul edin');
      else if (!pwValid) setError('Şifre gereksinimlerini karşılamalıdır');
      else setError('Lütfen tüm alanları doğru doldurun');
      return;
    }
    setBusy(true);
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        phone: phone.trim(),
      });
    } catch (e: any) {
      // Debug on native: `adb logcat | grep ReactNativeJS` will show this.
      // eslint-disable-next-line no-console
      console.warn('[register] failed', { kind: e?.kind, status: e?.status, msg: e?.message });

      if (e instanceof ApiError) {
        if (e.kind === 'network') {
          setError('Sunucuya bağlanılamıyor. İnternet bağlantınızı ve uygulamanın güncel sürüm olduğunu kontrol edin.');
        } else if (e.kind === 'timeout') {
          setError('Sunucu yanıt vermedi. Lütfen tekrar deneyin.');
        } else if (e.status === 409) {
          setError('Bu e-posta zaten kayıtlı');
        } else if (e.status === 422) {
          // Backend validation — try to surface the reason (password rules etc.)
          const bodyMsg = (e.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
          setError(bodyMsg || 'Bilgileri kontrol edin');
        } else if (typeof e.status === 'number' && e.status >= 500) {
          setError('Sunucu geçici olarak yanıt vermiyor. Birazdan tekrar deneyin.');
        } else {
          setError(`Kayıt başarısız (${e.status || '?'}). Tekrar deneyin.`);
        }
      } else {
        const msg = String(e?.message || '');
        setError(msg ? `Kayıt başarısız: ${msg}` : 'Kayıt başarısız. Lütfen tekrar deneyin.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoWrap}>
            <BrandLogo size={76} />
          </View>
          <Text style={s.title}>Aramıza Katıl</Text>
          <Text style={s.subtitle}>Profesyonel teklif dünyasına ilk adımınızı atın.</Text>

          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <InputRow icon="person-outline" placeholder="Ad Soyad" value={name} onChangeText={setName} autoCapitalize="words" testID="reg-name" />
          <InputRow
            icon="call-outline"
            placeholder="Telefon Numarası (İsteğe bağlı)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="reg-phone"
          />
          <InputRow
            icon="mail-outline"
            placeholder="E-posta Adresi"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            testID="reg-email"
          />
          <InputRow
            icon="lock-closed-outline"
            placeholder="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            testID="reg-password"
            trailing={
              <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={authTheme.textMuted} />
              </TouchableOpacity>
            }
          />

          <PasswordChecklist status={pwStatus} />

          <TouchableOpacity
            style={s.terms}
            onPress={() => setAcceptedTerms((v) => !v)}
            activeOpacity={0.7}
            testID="reg-terms"
          >
            <View style={[s.checkbox, acceptedTerms && s.checkboxOn]}>
              {acceptedTerms ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <Text style={s.termsText}>
              Kayıt olurken <Text style={s.termsLink}>Gizlilik İlkesi</Text> ve{' '}
              <Text style={s.termsLink}>Hizmet Şartlarını</Text> kabul ediyorum.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[s.cta, (busy || !canSubmit) && s.ctaDisabled]}
            onPress={onSubmit}
            disabled={busy}
            testID="reg-submit"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Kayıt Ol</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={s.footerText}>Zaten hesabınız var mı? </Text>
            <TouchableOpacity onPress={() => router.replace('/login')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.footerLink}>Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordChecklist({ status }: { status: Record<PasswordRuleKey, boolean> }) {
  const RULES: PasswordRuleKey[] = ['lower', 'upper', 'digit', 'symbol', 'length'];
  return (
    <View style={s.pwBlock}>
      <Text style={s.pwTitle}>Şifre Gereksinimleri</Text>
      <View style={s.pwList}>
        {RULES.map((k) => (
          <View key={k} style={s.pwRow}>
            <Ionicons
              name={status[k] ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={status[k] ? authTheme.success : authTheme.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.pwText, status[k] && { color: authTheme.textSoft }]}>
              {PASSWORD_RULE_LABELS[k]}
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.pwHint}>Tüm kriterleri sağlamayan şifreler güvenlik sebebiyle reddedilir.</Text>
    </View>
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
      <TextInput {...rest} placeholderTextColor={authTheme.textMuted} style={s.input} />
      {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 14 },
  title: { color: authTheme.text, fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: authTheme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.35)', borderWidth: 1,
    borderRadius: authRadius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: authTheme.card, borderColor: authTheme.cardBorder, borderWidth: 1,
    borderRadius: authRadius.lg, paddingHorizontal: 14, height: 56, marginBottom: 12,
  },
  input: { flex: 1, color: authTheme.text, fontSize: 15, paddingVertical: 0, ...Platform.select({ web: { outlineWidth: 0 } as any }) },
  pwBlock: {
    marginTop: 4, marginBottom: 14,
    backgroundColor: authTheme.bgSoft,
    borderColor: authTheme.line, borderWidth: 1, borderRadius: authRadius.md,
    padding: 12,
  },
  pwTitle: { color: authTheme.text, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  pwList: { flexDirection: 'row', flexWrap: 'wrap' },
  pwRow: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 6, minWidth: '30%' },
  pwText: { color: authTheme.textMuted, fontSize: 12 },
  pwHint: { color: authTheme.textMuted, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: authTheme.cardBorder, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxOn: { backgroundColor: authTheme.primary, borderColor: authTheme.primary },
  termsText: { color: authTheme.textMuted, fontSize: 12.5, flex: 1, lineHeight: 18 },
  termsLink: { color: authTheme.link, fontWeight: '700' },
  cta: {
    backgroundColor: authTheme.primary, borderRadius: authRadius.xl, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: authTheme.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  footer: { marginTop: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: authTheme.textMuted, fontSize: 13 },
  footerLink: { color: authTheme.link, fontSize: 13, fontWeight: '700' },
});

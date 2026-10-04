import React, { useEffect, useMemo, useState } from 'react';
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
import { authTheme, authRadius, authSpacing } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import { LanguageFlagSwitcher } from '@/src/components/LanguageFlagSwitcher';
import BlackHoleBackground from '@/src/components/BlackHoleBackground';
import { CAMPAIGN_STORAGE_KEY, useAuth } from '@/src/state/AuthContext';
import { storage } from '@/src/utils/storage';
import { ApiError } from '@/src/lib/api';
import { isPasswordValid } from '@/src/utils/password-validation';
import { useLanguage } from '@/src/lib/i18n';
import { MotionScrollView, themedStyles } from '@/src/components/motion';
import { glass, GlassAuthCard, GlassButton, GlassInput } from '@/src/components/auth/GlassAuth';
import PasswordStrength from '@/src/components/auth/PasswordStrength';

export default function RegisterScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { register } = useAuth();
  // Masaüstü web'de form artık tüm genişliğe yayılıp mobil oranlarda ortada
  // kalmıyor -- daha önce burada hiçbir width>=900 ayrımı yoktu (bir
  // geliştirici arkadaşın eleştirisi buydu). Projenin diğer yerlerinde
  // (TopHeader, (tabs)/_layout) zaten kullanılan aynı eşiği burada da
  // uyguluyoruz: içeriği sabit genişlikte bir karta alıp ortalıyoruz.
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 900;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // /hediye sayfasından gelindiyse kayıtla birlikte 1 ay Pro tanımlanacağını göster.
  const [campaign, setCampaign] = useState('');
  useEffect(() => {
    storage.getItem<string>(CAMPAIGN_STORAGE_KEY, '').then((c) => setCampaign(c || ''));
  }, []);

  const pwValid = useMemo(() => isPasswordValid(password), [password]);

  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    phoneDigits.length >= 10 &&
    pwValid &&
    acceptedTerms;

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!canSubmit) {
      if (!acceptedTerms) setError(t('register.s001'));
      else if (!pwValid) setError(t('register.s002'));
      else if (phoneDigits.length < 10) setError(t('register.s003'));
      else setError(t('register.s004'));
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
          setError(t('register.s005'));
        } else if (e.kind === 'timeout') {
          setError(t('register.s006'));
        } else if (e.status === 409) {
          const bodyMsg409 = (e.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
          setError(bodyMsg409 || t('register.s007'));
        } else if (e.status === 400) {
          const bodyMsg400 = (e.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
          setError(bodyMsg400 || 'Bilgileri kontrol edin');
        } else if (e.status === 422) {
          // Backend validation — try to surface the reason (password rules etc.)
          const bodyMsg = (e.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
          setError(bodyMsg || 'Bilgileri kontrol edin');
        } else if (typeof e.status === 'number' && e.status >= 500) {
          setError(t('register.s008'));
        } else {
          setError(`Kayıt başarısız (${e.status || '?'}). Tekrar deneyin.`);
        }
      } else {
        const msg = String(e?.message || '');
        setError(msg ? `Kayıt başarısız: ${msg}` : t('register.s009'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.bgWrap} pointerEvents="none">
        <BlackHoleBackground centerX={0.5} spread={1.4} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <BrandLogo size={isDesktopWeb ? 64 : 58} />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(200).duration(450)} style={s.title}>{t('register.s010')}</Animated.Text>
            <Animated.Text entering={FadeIn.delay(300).duration(450)} style={s.subtitle}>{t('register.s011')}</Animated.Text>
            {!!campaign && (
              <View style={s.giftBanner}>
                <Ionicons name="gift" size={16} color="#fff" />
                <Text style={s.giftText}>Üye olunca 1 ay Pro hediyeniz hesabınıza tanımlanacak</Text>
              </View>
            )}

            {error ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={authTheme.danger} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <GlassInput icon="person-outline" placeholder={t('register.s012')} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" testID="reg-name" />
            <GlassInput
              icon="call-outline"
              placeholder={t('register.s013')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              testID="reg-phone"
            />
            <GlassInput
              icon="mail-outline"
              placeholder={t('register.s014')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              testID="reg-email"
            />
            <GlassInput
              icon="lock-closed-outline"
              placeholder={t('register.s015')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              testID="reg-password"
              trailing={
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPw ? 'eye-outline' : 'eye-off-outline'} size={19} color={glass.textFaint} />
                </TouchableOpacity>
              }
            />

            <PasswordStrength value={password} />

            <TouchableOpacity
              style={s.terms}
              onPress={() => setAcceptedTerms((v) => !v)}
              activeOpacity={0.7}
              testID="reg-terms"
            >
              <View style={[s.checkbox, acceptedTerms && s.checkboxOn]}>
                {acceptedTerms ? <Ionicons name="checkmark" size={14} color={glass.ink} /> : null}
              </View>
              <Text style={s.termsText}>
                {t('register.s016')}<Text style={s.termsLink}>{t('register.s017')}</Text> ve{' '}
                <Text style={s.termsLink}>{t('register.s018')}</Text> {t('register.s019')}</Text>
            </TouchableOpacity>

            <GlassButton label={t('register.s020')} onPress={onSubmit} busy={busy} dimmed={!canSubmit} testID="reg-submit" />

            <Animated.View entering={FadeIn.delay(500)} style={s.footer}>
              <Text style={s.footerText}>{t('register.s021')} </Text>
              <TouchableOpacity onPress={() => router.replace('/login')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.footerLink}>{t('register.s022')}</Text>
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
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  scrollDesktop: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  backHome: {
    width: '100%', maxWidth: 440, marginBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  backHomeText: { color: glass.textDim, fontSize: 13, fontWeight: '600' },
  cardCompact: { paddingHorizontal: 20, paddingVertical: 24 },
  langRow: { alignItems: 'center', marginBottom: 10 },
  logoWrap: { alignItems: 'center', marginBottom: 14 },
  title: { color: glass.text, fontSize: 25, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: glass.textDim, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.35)', borderWidth: 1,
    borderRadius: authRadius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12,
  },
  errorText: { color: authTheme.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  termsText: { color: glass.textDim, fontSize: 12.5, flex: 1, lineHeight: 18 },
  termsLink: { color: glass.text, fontWeight: '700' },
  footer: { marginTop: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  footerText: { color: glass.textDim, fontSize: 13 },
  footerLink: { color: glass.text, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  giftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: authTheme.gold, borderRadius: authRadius.md, paddingHorizontal: 14, paddingVertical: 10, marginTop: authSpacing.xs, marginBottom: authSpacing.md },
  giftText: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
}));

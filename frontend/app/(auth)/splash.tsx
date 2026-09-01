import React, { useState } from 'react';
import {
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
import { authTheme, authRadius, authSpacing } from '@/src/lib/auth-theme';
import { useLanguage } from '@/src/lib/i18n';
import { LanguageFlagSwitcher } from '@/src/components/LanguageFlagSwitcher';

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
};

function useSlides(t: (k: string) => string): Slide[] {
  return [
    { key: '1', icon: 'rocket-outline', title: t('splash.s002'), desc: t('splash.s003') },
    { key: '2', icon: 'document-text-outline', title: t('splash.s004'), desc: t('splash.s005') },
    { key: '3', icon: 'people-outline', title: t('splash.s006'), desc: t('splash.s007') },
  ];
}

export default function SplashOnboarding() {
  const { t } = useLanguage();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const SLIDES = useSlides(t);

  const goRegister = () => router.replace('/register');
  const goLogin = () => router.replace('/login');

  const next = () => {
    if (index < SLIDES.length - 1) setIndex(index + 1);
    else goRegister();
  };

  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const slide = SLIDES[index];

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.topBar}>
        <View style={s.brandRow}>
          <Text style={s.brand}>{t('splash.s008')}</Text>
          <Text style={s.brandAccent}> {t('splash.s009')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LanguageFlagSwitcher />
          <TouchableOpacity
            onPress={goLogin}
            accessibilityLabel={t('splash.s001')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="splash-skip"
          >
            <Text style={s.skip}>{t('splash.s001')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Slide body */}
      <View style={[s.slide, { minHeight: height * 0.55 }]}>
        <View style={s.iconWrap}>
          <View style={s.iconGlow} />
          <View style={s.iconInner}>
            <Ionicons name={slide.icon} size={64} color={authTheme.primary} />
          </View>
        </View>
        <Text style={s.title}>{slide.title}</Text>
        <Text style={s.desc}>{slide.desc}</Text>
      </View>

      {/* Left/right swipe zones for accessibility */}
      <View style={s.navRow}>
        <TouchableOpacity
          onPress={prev}
          disabled={index === 0}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={[s.arrowBtn, index === 0 && s.arrowBtnDisabled]}
          testID="splash-prev"
        >
          <Ionicons name="chevron-back" size={22} color={index === 0 ? authTheme.textMuted : authTheme.text} />
        </TouchableOpacity>

        <View style={s.dotsWrap}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === index ? [s.dotActive, { width: 26 }] : s.dotInactive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={next}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={s.arrowBtn}
          testID="splash-arrow-next"
        >
          <Ionicons name="chevron-forward" size={22} color={authTheme.text} />
        </TouchableOpacity>
      </View>

      {/* Bottom CTA */}
      <View style={s.bottom}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={s.cta}
          onPress={next}
          testID="splash-cta"
        >
          <Text style={s.ctaText}>
            {index === SLIDES.length - 1 ? t('splash.s010') : t('splash.s011')}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <View style={s.trust}>
          <Ionicons name="lock-closed" size={12} color={authTheme.textMuted} />
          <Text style={s.trustText}>{t('splash.s012')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: authSpacing.xl,
    paddingTop: authSpacing.md,
    paddingBottom: authSpacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'baseline' },
  brand: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  brandAccent: { color: authTheme.primary, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  skip: { color: authTheme.textMuted, fontSize: 15, fontWeight: '600' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: { marginBottom: 36, alignItems: 'center', justifyContent: 'center' },
  iconGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  iconInner: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: authTheme.card,
    borderWidth: 1.5,
    borderColor: authTheme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: authTheme.primary,
        shadowOpacity: 0.28,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 12 },
    }),
  },
  title: {
    color: authTheme.text,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  desc: {
    color: authTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: { opacity: 0.35 },
  dotsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { backgroundColor: authTheme.dotActive },
  dotInactive: { backgroundColor: authTheme.dotInactive, width: 6 },
  bottom: { paddingHorizontal: authSpacing.xl, paddingBottom: authSpacing.md },
  cta: {
    backgroundColor: authTheme.primary,
    borderRadius: authRadius.xl,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: authTheme.primary,
        shadowOpacity: 0.4,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 8 },
    }),
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  trust: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trustText: { color: authTheme.textMuted, fontSize: 11, fontWeight: '500' },
});

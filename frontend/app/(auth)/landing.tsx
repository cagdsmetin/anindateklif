import React from 'react';
import {
  Linking,
  Platform,
  ScrollView,
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
import { BrandLogo } from '@/src/components/BrandLogo';
import { LanguageFlagSwitcher } from '@/src/components/LanguageFlagSwitcher';
import { useLanguage } from '@/src/lib/i18n';

// Anında Teklif'in web'deki gerçek tanıtım (landing) sayfası -- daha önce
// giriş yapmamış her ziyaretçi doğrudan register/splash'e düşüyordu, "bu
// uygulama nedir, ne işe yarar, avantajları neler" diye anlatan hiçbir sayfa
// yoktu (bkz. RouteGuard: web'de artık buraya yönleniyor, native app'te
// splash carousel'i aynen kalıyor). İçerik gerçek uygulama özelliklerine
// dayanıyor: PDF şablonları, WhatsApp paylaşımı, kasa/tahsilat, ekip
// yönetimi, katalog/yapılandırıcı -- bkz. i18n.tsx "landing" namespace'i.
function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 900;
}

type Feature = { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };
type Advantage = { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };

export default function LandingScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const goRegister = () => router.push('/register');
  const goLogin = () => router.push('/login');

  const features: Feature[] = [
    { icon: 'document-text-outline', title: t('landing.s013'), desc: t('landing.s014') },
    { icon: 'logo-whatsapp', title: t('landing.s015'), desc: t('landing.s016') },
    { icon: 'people-outline', title: t('landing.s017'), desc: t('landing.s018') },
    { icon: 'wallet-outline', title: t('landing.s019'), desc: t('landing.s020') },
    { icon: 'people-circle-outline', title: t('landing.s021'), desc: t('landing.s022') },
    { icon: 'construct-outline', title: t('landing.s023'), desc: t('landing.s024') },
  ];

  const advantages: Advantage[] = [
    { icon: 'time-outline', title: t('landing.s027'), desc: t('landing.s028') },
    { icon: 'ribbon-outline', title: t('landing.s029'), desc: t('landing.s030') },
    { icon: 'globe-outline', title: t('landing.s031'), desc: t('landing.s032') },
    { icon: 'language-outline', title: t('landing.s033'), desc: t('landing.s034') },
  ];

  const year = new Date().getFullYear();

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <View style={[s.page, isDesktop && s.pageDesktop]}>
          {/* NAV */}
          <View style={s.nav}>
            <View style={s.brandRow}>
              <BrandLogo size={30} />
              <Text style={s.brand}>
                {t('landing.s001')}
                <Text style={s.brandAccent}> {t('landing.s002')}</Text>
              </Text>
            </View>
            <View style={s.navActions}>
              <LanguageFlagSwitcher />
              <TouchableOpacity onPress={goLogin} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} testID="landing-login">
                <Text style={s.navLogin}>{t('landing.s003')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.navCta} onPress={goRegister} activeOpacity={0.9} testID="landing-nav-cta">
                <Text style={s.navCtaText}>{t('landing.s004')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* HERO */}
          <View style={[s.hero, isDesktop && s.heroDesktop]}>
            <View style={s.heroGlow} pointerEvents="none" />
            <View style={s.badge}>
              <Ionicons name="sparkles" size={13} color={authTheme.gold} />
              <Text style={s.badgeText}>{t('landing.s005')}</Text>
            </View>
            <Text style={[s.heroTitle, isDesktop && s.heroTitleDesktop]}>{t('landing.s006')}</Text>
            <Text style={[s.heroSubtitle, isDesktop && s.heroSubtitleDesktop]}>{t('landing.s007')}</Text>
            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryCta} onPress={goRegister} activeOpacity={0.9} testID="landing-hero-cta">
                <Text style={s.primaryCtaText}>{t('landing.s008')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryCta} onPress={goLogin} activeOpacity={0.85}>
                <Text style={s.secondaryCtaText}>{t('landing.s009')}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.trustRow}>
              <Ionicons name="lock-closed" size={12} color={authTheme.textMuted} />
              <Text style={s.trustText}>{t('landing.s010')}</Text>
            </View>
          </View>

          {/* FEATURES */}
          <View style={s.section}>
            <Text style={s.eyebrow}>{t('landing.s011')}</Text>
            <Text style={s.sectionTitle}>{t('landing.s012')}</Text>
            <View style={[s.grid, isDesktop && s.gridDesktop]}>
              {features.map((f, i) => (
                <View key={i} style={[s.card, isDesktop && s.cardDesktop]}>
                  <View style={s.cardIconWrap}>
                    <Ionicons name={f.icon} size={22} color={authTheme.primary} />
                  </View>
                  <Text style={s.cardTitle}>{f.title}</Text>
                  <Text style={s.cardDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ADVANTAGES */}
          <View style={s.section}>
            <Text style={s.eyebrow}>{t('landing.s025')}</Text>
            <Text style={s.sectionTitle}>{t('landing.s026')}</Text>
            <View style={[s.grid, isDesktop && s.gridDesktop2]}>
              {advantages.map((a, i) => (
                <View key={i} style={[s.advRow, isDesktop && s.advRowDesktop]}>
                  <View style={s.advIconWrap}>
                    <Ionicons name={a.icon} size={20} color={authTheme.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.advTitle}>{a.title}</Text>
                    <Text style={s.advDesc}>{a.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* FINAL CTA */}
          <View style={[s.finalCta, isDesktop && s.finalCtaDesktop]}>
            <Text style={s.finalTitle}>{t('landing.s035')}</Text>
            <Text style={s.finalSubtitle}>{t('landing.s036')}</Text>
            <TouchableOpacity style={s.finalBtn} onPress={goRegister} activeOpacity={0.9} testID="landing-final-cta">
              <Text style={s.finalBtnText}>{t('landing.s037')}</Text>
              <Ionicons name="arrow-forward" size={18} color={authTheme.primary} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>

          {/* FOOTER */}
          <View style={[s.footer, isDesktop && s.footerDesktop]}>
            <Text style={s.footerText}>© {year} {t('landing.s038')}</Text>
            <View style={s.footerLinks}>
              <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.footerLink}>{t('landing.s039')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Linking.openURL('mailto:ncagdasm@gmail.com?subject=An%C4%B1nda%20Teklif')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.footerLink}>{t('landing.s040')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { flexGrow: 1 },
  page: { paddingHorizontal: 20, paddingTop: authSpacing.md, paddingBottom: 40 },
  pageDesktop: { paddingHorizontal: 48, maxWidth: 1120, width: '100%', alignSelf: 'center' },

  // NAV
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  brandAccent: { color: authTheme.primary, fontSize: 18, fontWeight: '900', letterSpacing: 0.3 },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navLogin: { color: authTheme.textSoft, fontSize: 14, fontWeight: '700' },
  navCta: {
    backgroundColor: authTheme.primary,
    borderRadius: authRadius.pill,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  navCtaText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },

  // HERO
  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 40,
    position: 'relative',
  },
  heroDesktop: { paddingTop: 64, paddingBottom: 64 },
  heroGlow: {
    position: 'absolute',
    top: -60,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(59,130,246,0.14)',
    alignSelf: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderColor: 'rgba(212,175,55,0.35)',
    borderWidth: 1,
    borderRadius: authRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  badgeText: { color: authTheme.goldLight, fontSize: 12, fontWeight: '700' },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 38,
    maxWidth: 640,
  },
  heroTitleDesktop: { fontSize: 46, lineHeight: 54, maxWidth: 780 },
  heroSubtitle: {
    color: authTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 520,
  },
  heroSubtitleDesktop: { fontSize: 17, lineHeight: 26, maxWidth: 640 },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 28,
  },
  primaryCta: {
    backgroundColor: authTheme.primary,
    borderRadius: authRadius.xl,
    paddingVertical: 15,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: authTheme.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
    }),
  },
  primaryCtaText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  secondaryCta: {
    borderRadius: authRadius.xl,
    paddingVertical: 15,
    paddingHorizontal: 26,
    borderWidth: 1.5,
    borderColor: authTheme.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: { color: authTheme.textSoft, fontSize: 15.5, fontWeight: '700' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20 },
  trustText: { color: authTheme.textMuted, fontSize: 12 },

  // SECTIONS
  section: { marginTop: 36 },
  eyebrow: {
    color: authTheme.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },

  // FEATURES GRID
  grid: { gap: 14 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  card: {
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    borderRadius: authRadius.lg,
    padding: 18,
  },
  cardDesktop: { width: '31.5%' },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { color: authTheme.text, fontSize: 15.5, fontWeight: '800', marginBottom: 6 },
  cardDesc: { color: authTheme.textMuted, fontSize: 13, lineHeight: 19 },

  // ADVANTAGES GRID
  gridDesktop2: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  advRow: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: authTheme.bgSoft,
    borderColor: authTheme.line,
    borderWidth: 1,
    borderRadius: authRadius.lg,
    padding: 16,
  },
  advRowDesktop: { width: '48.5%' },
  advIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advTitle: { color: authTheme.text, fontSize: 14.5, fontWeight: '800', marginBottom: 4 },
  advDesc: { color: authTheme.textMuted, fontSize: 12.5, lineHeight: 18 },

  // FINAL CTA
  finalCta: {
    marginTop: 40,
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    borderRadius: authRadius.xl,
    padding: 28,
    alignItems: 'center',
  },
  finalCtaDesktop: { paddingVertical: 44 },
  finalTitle: { color: '#fff', fontSize: 21, fontWeight: '900', textAlign: 'center' },
  finalSubtitle: { color: authTheme.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  finalBtn: {
    backgroundColor: '#fff',
    borderRadius: authRadius.xl,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  finalBtnText: { color: authTheme.primary, fontSize: 15, fontWeight: '800' },

  // FOOTER
  footer: {
    marginTop: 32,
    alignItems: 'center',
    gap: 10,
  },
  footerDesktop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { color: authTheme.textMuted, fontSize: 12 },
  footerLinks: { flexDirection: 'row', gap: 18 },
  footerLink: { color: authTheme.textSoft, fontSize: 12, fontWeight: '700' },
});

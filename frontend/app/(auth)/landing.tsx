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
// yoktu, ve masaüstünde tek sütun/dar mobil düzeni "mobil uygulama gibi"
// görünüyordu (geliştirici arkadaş + kullanıcı geri bildirimi). Bu sürümde:
// masaüstünde hero iki sütuna bölündü (metin + gerçek teklif PDF'ine
// gönderme yapan bir "belge kartı" görseli -- ürünün ne ürettiğini
// resmediyor), yeni bir "Nasıl Çalışır" adım adım akışı eklendi, tip
// ölçeği büyütüldü. Marka renkleri (lacivert/mavi/altın) bilinçli olarak
// korundu -- bunlar zaten uygulamanın kendi kimliği (bkz. auth-theme.ts),
// register/login/splash ile aynı kimlikte kalması gerekiyordu.
function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 960;
}

type Feature = { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };
type Advantage = { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };
type Step = { icon: keyof typeof Ionicons.glyphMap; title: string; desc: string };

// Hero'daki "belge kartı" -- ürünün ürettiği gerçek çıktının (PDF teklif)
// stilize bir minyatürü. Gerçek bir ekran görüntüsü yerine, kurumsal
// kimlikle aynı lacivert/altın paleti kullanan bir kart olarak inşa edildi;
// böylece metin + soyut ikonlar yerine "bu uygulama ne üretir" sorusu
// görsel olarak da cevaplanıyor.
function QuoteMockup() {
  return (
    <View style={m.wrap}>
      <View style={m.badgeTop}>
        <Ionicons name="flash" size={12} color="#fff" />
        <Text style={m.badgeTopText}>30 saniyede hazır</Text>
      </View>
      <View style={m.card}>
        <View style={m.cardHdr}>
          <View style={m.cardHdrLogo}>
            <Ionicons name="checkmark" size={14} color={authTheme.goldLight} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={[m.line, { width: '58%', height: 7 }]} />
            <View style={[m.line, { width: '38%', height: 5, marginTop: 5, opacity: 0.6 }]} />
          </View>
          <Text style={m.cardHdrTag}>TEKLİF{'\n'}FORMU</Text>
        </View>
        <View style={m.cardDivider} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={m.row}>
            <View style={m.rowDot} />
            <View style={{ flex: 1 }}>
              <View style={[m.line, { width: i === 0 ? '80%' : i === 1 ? '65%' : '72%', height: 6 }]} />
            </View>
            <View style={[m.line, { width: 34, height: 6, opacity: 0.5 }]} />
          </View>
        ))}
        <View style={m.totalRow}>
          <Text style={m.totalLabel}>TOPLAM</Text>
          <Text style={m.totalValue}>₺48.750</Text>
        </View>
      </View>
      <View style={m.badgeBottom}>
        <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
        <Text style={m.badgeBottomText}>Tek dokunuşla gönder</Text>
      </View>
    </View>
  );
}

export default function LandingScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const goRegister = () => router.push('/register');
  const goLogin = () => router.push('/login');

  const steps: Step[] = [
    { icon: 'list-outline', title: t('landing.s043'), desc: t('landing.s044') },
    { icon: 'document-text-outline', title: t('landing.s045'), desc: t('landing.s046') },
    { icon: 'logo-whatsapp', title: t('landing.s047'), desc: t('landing.s048') },
  ];

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
          <View style={[s.hero, isDesktop && s.heroDesktopRow]}>
            <View style={s.heroGlow} pointerEvents="none" />
            <View style={[s.heroCol, isDesktop && s.heroColDesktop]}>
              <View style={s.badge}>
                <Ionicons name="sparkles" size={13} color={authTheme.gold} />
                <Text style={s.badgeText}>{t('landing.s005')}</Text>
              </View>
              <Text style={[s.heroTitle, isDesktop && s.heroTitleDesktop, !isDesktop && { textAlign: 'center' }]}>
                {t('landing.s006')}
              </Text>
              <Text style={[s.heroSubtitle, isDesktop && s.heroSubtitleDesktop, !isDesktop && { textAlign: 'center' }]}>
                {t('landing.s007')}
              </Text>
              <View style={[s.heroActions, !isDesktop && { justifyContent: 'center' }]}>
                <TouchableOpacity style={s.primaryCta} onPress={goRegister} activeOpacity={0.9} testID="landing-hero-cta">
                  <Text style={s.primaryCtaText}>{t('landing.s008')}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
                <TouchableOpacity style={s.secondaryCta} onPress={goLogin} activeOpacity={0.85}>
                  <Text style={s.secondaryCtaText}>{t('landing.s009')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.trustRow, !isDesktop && { justifyContent: 'center' }]}>
                <Ionicons name="lock-closed" size={12} color={authTheme.textMuted} />
                <Text style={s.trustText}>{t('landing.s010')}</Text>
              </View>
            </View>
            {isDesktop && (
              <View style={s.heroColMockup}>
                <QuoteMockup />
              </View>
            )}
          </View>

          {/* HOW IT WORKS */}
          <View style={s.section}>
            <Text style={s.eyebrow}>{t('landing.s041')}</Text>
            <Text style={s.sectionTitle}>{t('landing.s042')}</Text>
            <View style={[s.stepsRow, isDesktop && s.stepsRowDesktop]}>
              {steps.map((st, i) => (
                <React.Fragment key={i}>
                  <View style={[s.stepCard, isDesktop && s.stepCardDesktop]}>
                    <View style={s.stepNumWrap}>
                      <Text style={s.stepNum}>{i + 1}</Text>
                    </View>
                    <View style={s.stepIconWrap}>
                      <Ionicons name={st.icon} size={20} color={authTheme.primary} />
                    </View>
                    <Text style={s.cardTitle}>{st.title}</Text>
                    <Text style={s.cardDesc}>{st.desc}</Text>
                  </View>
                  {isDesktop && i < steps.length - 1 && (
                    <View style={s.stepConnector}>
                      <Ionicons name="arrow-forward" size={16} color={authTheme.cardBorder} />
                    </View>
                  )}
                </React.Fragment>
              ))}
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

// Belge kartı (hero mockup) stilleri -- ana s stilinden ayrı tutuldu, kendi
// içinde kapalı bir bileşen.
const m = StyleSheet.create({
  wrap: { alignItems: 'center', ...Platform.select({ web: { transform: [{ rotate: '-3deg' }] } as any }) },
  badgeTop: {
    position: 'absolute', top: -14, right: 6, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: authTheme.primary, borderRadius: authRadius.pill,
    paddingVertical: 6, paddingHorizontal: 12,
    ...Platform.select({ web: { boxShadow: '0 10px 24px rgba(59,130,246,0.45)' } as any }),
  },
  badgeTopText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  card: {
    width: 300,
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    borderRadius: authRadius.lg,
    padding: 18,
    ...Platform.select({ web: { boxShadow: '0 30px 70px rgba(0,0,0,0.55)' } as any }),
  },
  cardHdr: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHdrLogo: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: authTheme.gold,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  cardHdrTag: { color: authTheme.textMuted, fontSize: 7.5, fontWeight: '800', textAlign: 'right', lineHeight: 9, letterSpacing: 0.4 },
  cardDivider: { height: 2, backgroundColor: authTheme.line, marginVertical: 14, borderRadius: 1 },
  line: { backgroundColor: authTheme.line, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  rowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: authTheme.primary },
  totalRow: {
    marginTop: 6, backgroundColor: authTheme.bg, borderRadius: authRadius.md,
    paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  totalLabel: { color: authTheme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  totalValue: { color: authTheme.goldLight, fontSize: 15, fontWeight: '900' },
  badgeBottom: {
    position: 'absolute', bottom: -14, left: 4, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: authTheme.bgSoft, borderColor: authTheme.cardBorder, borderWidth: 1,
    borderRadius: authRadius.pill, paddingVertical: 7, paddingHorizontal: 12,
    ...Platform.select({ web: { boxShadow: '0 14px 30px rgba(0,0,0,0.45)' } as any }),
  },
  badgeBottomText: { color: authTheme.textSoft, fontSize: 11, fontWeight: '700' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  scroll: { flexGrow: 1 },
  page: { paddingHorizontal: 20, paddingTop: authSpacing.md, paddingBottom: 40 },
  pageDesktop: { paddingHorizontal: 48, maxWidth: 1240, width: '100%', alignSelf: 'center' },

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
  heroDesktopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 56,
    gap: 40,
  },
  heroCol: { alignItems: 'center', width: '100%' },
  heroColDesktop: { alignItems: 'flex-start', width: '52%' },
  heroColMockup: { width: '40%', alignItems: 'center', justifyContent: 'center' },
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
    lineHeight: 38,
    maxWidth: 640,
  },
  heroTitleDesktop: { fontSize: 48, lineHeight: 56, maxWidth: 620, textAlign: 'left', letterSpacing: -0.5 },
  heroSubtitle: {
    color: authTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    maxWidth: 520,
  },
  heroSubtitleDesktop: { fontSize: 17, lineHeight: 27, maxWidth: 540, textAlign: 'left' },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
      web: { boxShadow: '0 12px 28px rgba(59,130,246,0.35)' } as any,
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

  // HOW IT WORKS
  stepsRow: { gap: 14 },
  stepsRowDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  stepCard: {
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder,
    borderWidth: 1,
    borderRadius: authRadius.lg,
    padding: 18,
    position: 'relative',
  },
  stepCardDesktop: { flex: 1 },
  stepConnector: { alignItems: 'center', justifyContent: 'center', width: 36 },
  stepNumWrap: {
    position: 'absolute', top: 14, right: 14,
  },
  stepNum: { color: authTheme.textMuted, fontSize: 12, fontWeight: '900' },
  stepIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
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

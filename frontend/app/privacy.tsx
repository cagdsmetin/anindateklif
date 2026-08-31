import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { useLanguage } from '@/src/lib/i18n';

// Public, unauthenticated page — required by Google Play (Data Safety form)
// and the App Store (App Privacy). Kept outside the auth-gated navigator;
// see app/_layout.tsx RouteGuard `isPublic` check.
export default function PrivacyPolicy() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.headerTitle} onPress={() => router.push('/')}>
          {t('privacy.s001')}</Text>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.h1}>{t('privacy.s002')}</Text>
        <Text style={s.updated}>{t('privacy.s003')}</Text>

        <Text style={s.p}>
          {t('privacy.s004')}</Text>

        <Section title={t('privacy.s005')}>
          <Text style={s.p}>
            {t('privacy.s006')}</Text>
        </Section>

        <Section title={t('privacy.s007')}>
          <Bullet>{t('privacy.s008')}</Bullet>
          <Bullet>{t('privacy.s009')}</Bullet>
          <Bullet>{t('privacy.s010')}</Bullet>
          <Bullet>{t('privacy.s011')}</Bullet>
          <Bullet>{t('privacy.s012')}</Bullet>
        </Section>

        <Section title={t('privacy.s013')}>
          <Bullet>{t('privacy.s014')}</Bullet>
          <Bullet>{t('privacy.s015')}</Bullet>
          <Bullet>{t('privacy.s016')}</Bullet>
          <Bullet>{t('privacy.s017')}</Bullet>
          <Bullet>{t('privacy.s018')}</Bullet>
        </Section>

        <Section title={t('privacy.s019')}>
          <Text style={s.p}>
            {t('privacy.s020')}</Text>
        </Section>

        <Section title={t('privacy.s021')}>
          <Text style={s.p}>
            {t('privacy.s022')}</Text>
        </Section>

        <Section title={t('privacy.s023')}>
          <Text style={s.p}>
            {t('privacy.s024')}</Text>
        </Section>

        <Section title={t('privacy.s025')}>
          <Text style={s.p}>
            {t('privacy.s026')}</Text>
        </Section>

        <Section title={t('privacy.s027')}>
          <Text style={s.p}>
            {t('privacy.s028')}</Text>
        </Section>

        <Text style={s.footer}>© {new Date().getFullYear()} {t('privacy.s030')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bulletRow}>
      <Ionicons name="ellipse" size={6} color={theme.colors.primary} style={s.bulletDot} />
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.navyDark },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 24, fontWeight: '900', color: theme.colors.navyDark, marginBottom: 4 },
  updated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 18 },
  h2: { fontSize: 16, fontWeight: '800', color: theme.colors.navyDark, marginBottom: 8 },
  p: { fontSize: 14, lineHeight: 21, color: theme.colors.textSoft },
  section: { marginBottom: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bulletDot: { marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: theme.colors.textSoft },
  footer: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: 20 },
});

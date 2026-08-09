import React, { useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

type Slide = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    key: '1',
    icon: 'rocket-outline',
    title: 'Saniyeler İçinde Teklif Ver',
    desc: 'Müşterilerinizi bekletmeyin. Profesyonel tekliflerinizi anında hazırlayıp rakiplerinizin bir adım önüne geçin.',
  },
  {
    key: '2',
    icon: 'document-text-outline',
    title: 'Profesyonel PDF Teklifler',
    desc: 'Şık, kurumsal tasarımlı PDF çıktılarını tek dokunuşla oluşturun ve WhatsApp üzerinden hemen paylaşın.',
  },
  {
    key: '3',
    icon: 'people-outline',
    title: 'Müşterilerini Tek Yerden Yönet',
    desc: 'Tüm müşterilerin, teklif geçmişin ve şirket ayarların tek bir kurumsal panelde güvende.',
  },
];

export default function SplashOnboarding() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const goRegister = () => router.replace('/register');
  const goLogin = () => router.replace('/login');

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      goRegister();
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.topBar}>
        <View style={s.brandRow}>
          <Text style={s.brand}>Anında</Text>
          <Text style={s.brandAccent}> Teklif</Text>
        </View>
        <TouchableOpacity onPress={goLogin} accessibilityLabel="Geç" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.skip}>Geç</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View style={[s.slide, { width, minHeight: height * 0.55 }]}>
            <View style={s.iconWrap}>
              <View style={s.iconGlow} />
              <View style={s.iconInner}>
                <Ionicons name={item.icon} size={64} color={authTheme.primary} />
              </View>
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.desc}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={s.dotsWrap}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              i === index ? s.dotActive : s.dotInactive,
              i === index && { width: 26 },
            ]}
          />
        ))}
      </View>

      <View style={s.bottom}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={s.cta}
          onPress={next}
          testID="splash-cta"
        >
          <Text style={s.ctaText}>
            {index === SLIDES.length - 1 ? 'Ücretsiz Başla' : 'İleri'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <View style={s.trust}>
          <Ionicons name="lock-closed" size={12} color={authTheme.textMuted} />
          <Text style={s.trustText}>256-bit SSL ile güvendedir</Text>
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
  iconWrap: {
    marginBottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  dotsWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
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

import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { interpolate, Extrapolation, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Aurora from './Aurora';
import CountUp from './CountUp';
import { useScrollScene } from './scene';
import { alpha, mix, themedStyles } from './paint';
import { localeUpper, useLangSafe } from '@/src/lib/i18n';

export type HeroStat = {
  label: string;
  value: number;
  format?: (n: number) => string;
  /** Değerin rengi (varsayılan beyaz). */
  tone?: string;
  /** Değerin altındaki küçük ek satır (ör. dövizli karşılıklar). */
  sub?: string | null;
};

// Sekme ekranlarının üstündeki koyu "aurora" başlık bloğu -- modül rengiyle
// boyanır, ikon + başlık + canlı sayaçlı özet kartları içerir. Sayfa
// kaydırılınca içerik daha yavaş kayıp söner (parallax), bulutlar farklı
// hızlarda kayar. MotionScrollView'ın ilk çocuğu olarak kullanılır.
export default function ScreenHero({
  icon,
  title,
  subtitle,
  color,
  stats,
  right,
  children,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color: string;
  stats?: HeroStat[];
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scene = useScrollScene();
  // Etiketler VERSAL gosterilir; donusum locale duyarli olmali (Turkce "i"
  // harfi locale'siz toUpperCase'te noktasiz "I"ya donuyordu: "Personel
  // Teklifleri" -> "PERSONEL TEKLIFLERI").
  const lang = useLangSafe();

  const drift = useAnimatedStyle(() => {
    if (!scene) return {};
    const y = scene.scrollY.value;
    return {
      opacity: interpolate(y, [0, 170], [1, 0.15], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(y, [0, 260], [0, 80], Extrapolation.CLAMP) },
        { scale: interpolate(y, [0, 260], [1, 0.95], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Aurora colors={[color, mix(color, '#A855F7', 0.55), '#22D3EE']} style={[s.hero, style]}>
      <Animated.View style={[s.inner, drift]}>
        <View style={s.topRow}>
          <View style={[s.iconWrap, { backgroundColor: alpha(color, 0.28), borderColor: alpha(color, 0.55) }]}>
            <Ionicons name={icon} size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            {subtitle ? (
              <Text style={s.subtitle} numberOfLines={1}>
                {localeUpper(subtitle, lang)}
              </Text>
            ) : null}
            <Text style={s.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {right}
        </View>
        {stats && stats.length > 0 ? (
          <View style={s.statsRow}>
            {stats.map((st, i) => (
              <View key={i} style={s.stat}>
                <CountUp
                  value={st.value}
                  format={st.format}
                  style={[s.statValue, st.tone ? { color: st.tone } : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                />
                <Text style={s.statLabel} numberOfLines={2}>
                  {localeUpper(st.label, lang)}
                </Text>
                {st.sub ? (
                  <Text style={s.statSub} numberOfLines={1}>
                    {st.sub}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {children}
      </Animated.View>
    </Aurora>
  );
}

const s = themedStyles(() => StyleSheet.create({
  hero: { borderRadius: 22, marginBottom: 14 },
  inner: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { color: 'rgba(203,213,225,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900', letterSpacing: -0.3, marginTop: 1 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  stat: {
    flexGrow: 1,
    flexBasis: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  statValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  statSub: { color: 'rgba(148,163,184,0.85)', fontSize: 9.5, fontWeight: '700', marginTop: 2 },
  statLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 3,
  },
}));

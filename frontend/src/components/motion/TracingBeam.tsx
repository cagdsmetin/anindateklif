import React, { createContext, useContext } from 'react';
import { StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import Animated, {
  measure,
  SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollScene } from './scene';
import { themedStyles } from './paint';

const RAIL_X = 14;
const BeamContext = createContext<SharedValue<number> | null>(null);

// "Tracing Beam" / "Timeline" (21st.dev / Manu Arora) -- solda ince bir ray;
// sayfa kaydırıldıkça üstten aşağı doğru dolan parlak bir ışın. Işın bir
// satırın düğümüne ulaşınca o düğüm yanar (BeamNode). Geri kaydırınca söner.
export default function TracingBeam({
  children,
  colors = ['#22D3EE', '#6366F1', '#A855F7'],
  style,
}: {
  children: React.ReactNode;
  colors?: string[];
  style?: StyleProp<ViewStyle>;
}) {
  const scene = useScrollScene();
  const { height: winH } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  // Işının ucunun, kapsayıcının üstünden itibaren px cinsinden konumu.
  const front = useSharedValue(scene && !scene.reduced ? 0 : 1e6);
  const boxH = useSharedValue(0);

  useAnimatedReaction(
    () => (scene ? scene.scrollY.value + scene.tick.value * 0 : 0),
    () => {
      if (!scene || scene.reduced) return;
      const m = measure(ref);
      if (!m) return;
      boxH.value = m.height;
      front.value = Math.max(0, winH * 0.66 - m.pageY);
    },
    [winH, scene]
  );

  const beamStyle = useAnimatedStyle(() => {
    const h = Math.min(boxH.value, front.value);
    return { height: Math.max(0, h) };
  });

  return (
    <BeamContext.Provider value={front}>
      <Animated.View ref={ref} collapsable={false} style={[s.wrap, style]}>
        <View style={s.rail} />
        <Animated.View style={[s.beam, beamStyle]}>
          <LinearGradient colors={colors as any} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {children}
      </Animated.View>
    </BeamContext.Provider>
  );
}

// Zaman çizelgesi satırı: soldaki düğüm + içerik. Düğüm, ışın bu satırın
// hizasına geldiğinde kendi rengiyle yanar ve büyür.
export function BeamRow({
  color,
  ringColor = '#fff',
  children,
  style,
}: {
  color: string;
  /** Düğümün çevresindeki halka -- kart zeminiyle aynı renk olmalı. */
  ringColor?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const front = useContext(BeamContext);
  const y = useSharedValue(1e6);
  const lit = useSharedValue(front ? 0 : 1);

  useAnimatedReaction(
    () => (front ? front.value >= y.value + 18 : true),
    (on, prev) => {
      if (on !== prev) lit.value = withTiming(on ? 1 : 0, { duration: 260 });
    },
    [front]
  );

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * lit.value,
    transform: [{ scale: 0.7 + 0.3 * lit.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: lit.value * 0.35, transform: [{ scale: 0.6 + 0.8 * lit.value }] }));

  return (
    <View
      style={[s.row, style]}
      onLayout={(e) => {
        y.value = e.nativeEvent.layout.y;
      }}
    >
      <View style={s.nodeCol}>
        <Animated.View style={[s.halo, { backgroundColor: color }, haloStyle]} />
        <Animated.View style={[s.dot, { backgroundColor: color, borderColor: ringColor }, dotStyle]} />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  wrap: { position: 'relative', paddingVertical: 4 },
  rail: {
    position: 'absolute',
    left: RAIL_X - 1,
    top: 10,
    bottom: 10,
    width: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(100,116,139,0.18)',
  },
  beam: {
    position: 'absolute',
    left: RAIL_X - 1,
    top: 10,
    width: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  nodeCol: { width: RAIL_X * 2, alignItems: 'center', paddingTop: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  halo: { position: 'absolute', top: 11, width: 20, height: 20, borderRadius: 10 },
}));

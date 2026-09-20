import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollScene } from './scene';
import { alpha, cssGradient, glowBlob, themedStyles } from './paint';

const GRID = 24;

// "Aurora Background" + "Grid Pattern" + "Parallax" (21st.dev) -- koyu
// lacivert zemin üstünde yavaşça süzülen renkli ışık bulutları ve ince bir
// ızgara. Sahne (MotionScrollView) içindeyse bulutlar farklı hızlarda kayar
// (derinlik hissi). Tüm efektler dekoratif: desteklenmeyen bir cihazda sade
// koyu gradyan kalır.
export default function Aurora({
  colors,
  base = ['#0A0F1F', '#131A36'],
  grid = true,
  style,
  children,
}: {
  colors: [string, string, string];
  base?: [string, string];
  grid?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const scene = useScrollScene();
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduced, drift]);

  const depth = (factor: number) => {
    'worklet';
    if (!scene) return 0;
    return Math.min(420, Math.max(0, scene.scrollY.value)) * factor;
  };

  const b1 = useAnimatedStyle(() => ({
    transform: [{ translateX: -24 + drift.value * 56 }, { translateY: -10 + drift.value * 22 + depth(0.22) }],
  }));
  const b2 = useAnimatedStyle(() => ({
    transform: [{ translateX: 30 - drift.value * 46 }, { translateY: -drift.value * 26 + depth(0.42) }],
  }));
  const b3 = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 34 }, { translateY: 12 - drift.value * 18 + depth(0.12) }],
  }));

  const cols = box.w > 0 ? Math.ceil(box.w / GRID) : 0;
  const rows = box.h > 0 ? Math.ceil(box.h / GRID) : 0;

  return (
    <View
      style={[s.wrap, { backgroundColor: base[0] }, style]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (Math.abs(w - box.w) > 2 || Math.abs(h - box.h) > 2) setBox({ w, h });
      }}
    >
      <LinearGradient colors={base} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <Animated.View pointerEvents="none" style={[s.blob, { width: 340, height: 340, left: -110, top: -150 }, glowBlob(colors[0], 0.6), b1]} />
      <Animated.View pointerEvents="none" style={[s.blob, { width: 300, height: 300, right: -110, top: -70 }, glowBlob(colors[1], 0.5), b2]} />
      <Animated.View
        pointerEvents="none"
        style={[s.blob, { width: 320, height: 320, left: box.w * 0.3, bottom: -190 }, glowBlob(colors[2], 0.45), b3]}
      />

      {grid && box.w > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: cols }, (_, i) => (
            <View key={`v${i}`} style={[s.gridV, { left: (i + 1) * GRID }]} />
          ))}
          {Array.from({ length: rows }, (_, i) => (
            <View key={`h${i}`} style={[s.gridH, { top: (i + 1) * GRID }]} />
          ))}
          {/* Izgarayı kenarlara doğru söndüren vinyet */}
          <View
            style={[
              StyleSheet.absoluteFill,
              cssGradient(`radial-gradient(ellipse at 30% 0%, ${alpha(base[0], 0)} 0%, ${alpha(base[0], 0.35)} 45%, ${alpha(base[0], 0.92)} 100%)`),
            ]}
          />
        </View>
      ) : null}

      <View style={s.content}>{children}</View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  wrap: { overflow: 'hidden', position: 'relative' },
  blob: { position: 'absolute', borderRadius: 999 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.07)' },
  content: { position: 'relative' },
}));

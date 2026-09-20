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

const DEFAULT_BEAM = ['rgba(129,140,248,0)', '#818CF8', '#E879F9', 'rgba(232,121,249,0)'];

// "Border Beam" / "Shine Border" (21st.dev / Magic UI) -- kartın kenarında
// sürekli dönen ışıklı bir gradyan. Kart içeriği `padding: width` kadar içeride
// kaldığı için sadece kenar halkası görünür; dönen katman arkada kalır.
export default function BorderBeam({
  children,
  radius = 22,
  width = 1.5,
  colors = DEFAULT_BEAM,
  duration = 6000,
  background,
  baseBorder = 'rgba(255,255,255,0.10)',
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  radius?: number;
  width?: number;
  colors?: string[];
  duration?: number;
  /** İç kartın zemin rengi (kenarın içini kapatır). */
  background: string;
  baseBorder?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rot = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    rot.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [reduced, duration, rot]);

  const beamStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  const size = Math.ceil(Math.sqrt(box.w * box.w + box.h * box.h)) + 8;

  return (
    <View
      style={[{ borderRadius: radius, padding: width, overflow: 'hidden', backgroundColor: baseBorder }, style]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (Math.abs(w - box.w) > 1 || Math.abs(h - box.h) > 1) setBox({ w, h });
      }}
    >
      {box.w > 0 && !reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', width: size, height: size, left: (box.w - size) / 2, top: (box.h - size) / 2 }, beamStyle]}
        >
          <LinearGradient colors={colors as any} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      <View style={[{ borderRadius: Math.max(0, radius - width), backgroundColor: background, overflow: 'hidden' }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

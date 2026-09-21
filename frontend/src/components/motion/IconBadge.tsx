import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { alpha, mix, readableOn } from './paint';
import { useRevealVisible } from './Reveal';

export type IconMotion = 'pop' | 'float' | 'pulse' | 'tilt' | 'none';

// Gradyan dolgulu, yumuşak gölgeli ikon rozeti. Kartı ekrana girdiğinde
// (Reveal içindeyse) küçük bir hareketle karşılar: "pop" yaylanarak büyür,
// "float" yavaşça süzülür, "pulse" nefes alır, "tilt" hafifçe sallanır.
// Panel'deki modül karolarıyla aynı görsel dil -- listelerde de aynı his.
export default function IconBadge({
  icon,
  color,
  size = 38,
  radius,
  iconSize,
  motion = 'pop',
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
  radius?: number;
  iconSize?: number;
  motion?: IconMotion;
  style?: StyleProp<ViewStyle>;
}) {
  const visible = useRevealVisible();
  const reduced = useReducedMotion();
  const anim = useSharedValue(motion === 'pop' ? 0 : 1);
  const loop = useSharedValue(0);
  const r = radius ?? Math.round(size * 0.34);

  useEffect(() => {
    if (reduced) {
      anim.value = 1;
      return;
    }
    if (motion === 'pop') {
      if (visible) anim.value = withDelay(80, withTiming(1, { duration: 520, easing: Easing.out(Easing.back(2)) }));
      return;
    }
    if (motion === 'float' || motion === 'pulse' || motion === 'tilt') {
      loop.value = withRepeat(
        withSequence(
          withTiming(1, { duration: motion === 'tilt' ? 1600 : 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: motion === 'tilt' ? 1600 : 2200, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
      return () => cancelAnimation(loop);
    }
  }, [visible, reduced, motion, anim, loop]);

  const aStyle = useAnimatedStyle(() => {
    if (motion === 'pop') {
      return { opacity: 0.2 + 0.8 * anim.value, transform: [{ scale: 0.6 + 0.4 * anim.value }] };
    }
    if (motion === 'float') return { transform: [{ translateY: -2 + loop.value * 4 }] };
    if (motion === 'pulse') return { transform: [{ scale: 0.97 + loop.value * 0.06 }] };
    if (motion === 'tilt') return { transform: [{ rotate: `${-5 + loop.value * 10}deg` }] };
    return {};
  });

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 14px ${alpha(color, 0.35)}` },
        aStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={[mix(color, '#ffffff', 0.25), color] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.48)} color={readableOn(color)} />
    </Animated.View>
  );
}

// Renkli, yumuşak zeminli küçük ikon kutusu (gradyan yerine saydam ton) --
// satır içi ikincil ikonlar için.
export function SoftIcon({
  icon,
  color,
  size = 30,
  iconSize,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.34),
          backgroundColor: alpha(color, 0.14),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={color} />
    </View>
  );
}

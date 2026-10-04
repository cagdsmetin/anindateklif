import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

// 21st.dev "sign-in-card-2" tasarımının React Native / Reanimated uyarlaması:
// cam kart + kenarlarda sırayla gezen ışık hüzmeleri + fareyle 3B eğilme (web),
// odakta parlayan cam girişler ve beyaz CTA. Arka plan (BlackHoleBackground)
// ekranda kalır; bu dosya yalnız kartın kendisini çizer.

const isWeb = Platform.OS === 'web';
const RADIUS = 24;
const BEAM_COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'] as const;
const TILT_MAX = 8; // derece
const TILT_RANGE = 300; // px -- bu uzaklıkta en büyük eğime ulaşır
const SPRING = { damping: 18, stiffness: 140, mass: 0.6 };

export const glass = {
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.38)',
  field: 'rgba(255,255,255,0.05)',
  fieldFocus: 'rgba(255,255,255,0.10)',
  border: 'rgba(255,255,255,0.07)',
  borderFocus: 'rgba(255,255,255,0.24)',
  ink: '#0B1220',
};

type Edge = 'top' | 'right' | 'bottom' | 'left';
const EDGE_DELAY: Record<Edge, number> = { top: 0, right: 600, bottom: 1200, left: 1800 };

function EdgeBeam({ edge, w, h }: { edge: Edge; w: number; h: number }) {
  const p = useSharedValue(0);
  const glow = useSharedValue(0);
  const horizontal = edge === 'top' || edge === 'bottom';
  const span = horizontal ? w : h;
  const len = span * 0.5;
  // Üst ve sağ hüzme saat yönünde, alt ve sol ters yönde akar -- kartın
  // çevresinde tek bir ışık dolaşıyormuş gibi görünür.
  const forward = edge === 'top' || edge === 'right';

  useEffect(() => {
    const d = EDGE_DELAY[edge];
    p.value = withDelay(
      d,
      withRepeat(withDelay(1000, withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })), -1, false)
    );
    glow.value = withDelay(d, withRepeat(withTiming(1, { duration: 1200 }), -1, true));
    return () => {
      cancelAnimation(p);
      cancelAnimation(glow);
    };
  }, [edge, p, glow]);

  const aStyle = useAnimatedStyle(() => {
    const from = forward ? -len : span;
    const to = forward ? span : -len;
    const v = from + (to - from) * p.value;
    return {
      opacity: 0.3 + 0.4 * glow.value,
      transform: [horizontal ? { translateX: v } : { translateY: v }],
    };
  });

  const pos: ViewStyle = horizontal
    ? { left: 0, width: len, height: 3, [edge]: 0 }
    : { top: 0, height: len, width: 3, [edge]: 0 };

  return (
    <Animated.View pointerEvents="none" style={[s.beam, pos, isWeb && ({ filter: 'blur(1.5px)' } as any), aStyle]}>
      <LinearGradient
        colors={BEAM_COLORS as any}
        start={horizontal ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={horizontal ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function CornerDot({ style, size, delay }: { style: ViewStyle; size: number; delay: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200 }), -1, true));
    return () => cancelAnimation(o);
  }, [delay, o]);
  const aStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.35 * o.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff' },
        isWeb && ({ filter: 'blur(1.5px)' } as any),
        style,
        aStyle,
      ]}
    />
  );
}

export function GlassAuthCard({
  children,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const hostRef = useRef<View>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const enter = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [enter]);

  // 3B eğilme yalnız web'de ve fareyle: react-native-web'de host View ref'i
  // doğrudan DOM düğümü olduğundan dinleyiciyi ona bağlıyoruz.
  useEffect(() => {
    if (!isWeb || reduced) return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v / TILT_RANGE));
    const move = (e: MouseEvent) => {
      const r = node.getBoundingClientRect();
      tiltY.value = withSpring(clamp(e.clientX - r.left - r.width / 2) * TILT_MAX, SPRING);
      tiltX.value = withSpring(-clamp(e.clientY - r.top - r.height / 2) * TILT_MAX, SPRING);
    };
    const leave = () => {
      tiltX.value = withSpring(0, SPRING);
      tiltY.value = withSpring(0, SPRING);
    };
    node.addEventListener('mousemove', move);
    node.addEventListener('mouseleave', leave);
    return () => {
      node.removeEventListener('mousemove', move);
      node.removeEventListener('mouseleave', leave);
    };
  }, [reduced, tiltX, tiltY]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { perspective: 1500 },
      { translateY: (1 - enter.value) * 20 },
      { rotateX: `${tiltX.value}deg` },
      { rotateY: `${tiltY.value}deg` },
    ],
  }));

  return (
    <View ref={hostRef} style={[s.host, style]}>
      <Animated.View
        style={cardStyle}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (Math.abs(w - box.w) > 1 || Math.abs(h - box.h) > 1) setBox({ w, h });
        }}
      >
        <View style={[s.glass, contentStyle]}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
          {children}
        </View>
        {box.w > 0 && !reduced ? (
          <View pointerEvents="none" style={s.edges}>
            {(['top', 'right', 'bottom', 'left'] as Edge[]).map((edge) => (
              <EdgeBeam key={edge} edge={edge} w={box.w} h={box.h} />
            ))}
            <CornerDot size={5} delay={0} style={{ top: 1, left: 1 }} />
            <CornerDot size={8} delay={500} style={{ top: 0, right: 0 }} />
            <CornerDot size={8} delay={1000} style={{ bottom: 0, right: 0 }} />
            <CornerDot size={5} delay={1500} style={{ bottom: 1, left: 1 }} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function GlassInput({
  icon,
  trailing,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & {
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const f = useSharedValue(0);

  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(f.value, [0, 1], [glass.field, glass.fieldFocus]),
    borderColor: interpolateColor(f.value, [0, 1], [glass.border, glass.borderFocus]),
    transform: [{ scale: 1 + 0.015 * f.value }],
  }));

  return (
    <Animated.View style={[s.inputRow, rowStyle, focused && isWeb && ({ boxShadow: '0 0 18px rgba(255,255,255,0.06)' } as any)]}>
      <Ionicons name={icon} size={19} color={focused ? glass.text : glass.textFaint} style={{ marginRight: 12 }} />
      <TextInput
        {...rest}
        placeholderTextColor="rgba(255,255,255,0.32)"
        style={s.input}
        onFocus={(e) => {
          f.value = withTiming(1, { duration: 200 });
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          f.value = withTiming(0, { duration: 220 });
          setFocused(false);
          onBlur?.(e);
        }}
      />
      {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
    </Animated.View>
  );
}

export function GlassButton({
  label,
  onPress,
  busy,
  dimmed,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  dimmed?: boolean;
  testID?: string;
}) {
  const press = useSharedValue(0);
  const shine = useSharedValue(0);
  const [w, setW] = useState(0);

  // Yüklenirken butonun üzerinden soldan sağa bir parıltı geçer.
  useEffect(() => {
    if (!busy) {
      cancelAnimation(shine);
      shine.value = 0;
      return;
    }
    shine.value = withRepeat(withDelay(400, withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })), -1, false);
    return () => cancelAnimation(shine);
  }, [busy, shine]);

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.02 * press.value }] }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -w + 2 * w * shine.value }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      testID={testID}
      onPressIn={() => (press.value = withTiming(1, { duration: 90 }))}
      onPressOut={() => (press.value = withTiming(0, { duration: 160 }))}
      style={{ marginTop: 6 }}
    >
      {(state) => {
        const hovered = !!(state as { hovered?: boolean }).hovered;
        return (
          <Animated.View
            onLayout={(e) => setW(e.nativeEvent.layout.width)}
            style={[
              s.cta,
              dimmed && { opacity: 0.6 },
              hovered && isWeb && ({ boxShadow: '0 8px 30px rgba(255,255,255,0.16)' } as any),
              btnStyle,
            ]}
          >
            {busy && w > 0 ? (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shineStyle]}>
                <LinearGradient
                  colors={['rgba(59,130,246,0)', 'rgba(59,130,246,0.22)', 'rgba(59,130,246,0)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            ) : null}
            {busy ? (
              <ActivityIndicator color={glass.ink} />
            ) : (
              <View style={s.ctaInner}>
                <Text style={s.ctaText}>{label}</Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={glass.ink}
                  style={{ transform: [{ translateX: hovered ? 4 : 0 }] }}
                />
              </View>
            )}
          </Animated.View>
        );
      }}
    </Pressable>
  );
}

const s = StyleSheet.create({
  host: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  glass: {
    backgroundColor: 'rgba(6,10,20,0.55)',
    borderColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
    paddingHorizontal: 32,
    paddingVertical: 30,
    ...Platform.select({
      web: { backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' } as any,
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 20 } },
      android: { elevation: 10 },
    }),
  },
  edges: { ...StyleSheet.absoluteFillObject, borderRadius: RADIUS, overflow: 'hidden' },
  beam: { position: 'absolute' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: glass.text,
    fontSize: 15,
    paddingVertical: 0,
    ...Platform.select({ web: { outlineWidth: 0, outlineStyle: 'none' } as any }),
  },
  cta: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctaText: { color: glass.ink, fontSize: 15.5, fontWeight: '800', letterSpacing: 0.2 },
});

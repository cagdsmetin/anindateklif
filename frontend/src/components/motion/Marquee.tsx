import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useScrollScene } from './scene';
import { alpha } from './paint';

// "Scroll Based Velocity" / "Marquee" (21st.dev / Magic UI) -- içerik sonsuz
// bir bant halinde sola akar; sayfa kaydırıldıkça kaydırma hızı kadar
// hızlanır, sonra yavaşça normal hızına döner. Dokununca (web'de fare
// üstüne gelince) durur ki kullanıcı bir değeri rahatça okuyabilsin.
// "Azaltılmış hareket" açıksa sıradan yatay kaydırılabilir satıra döner.
export default function Marquee({
  children,
  speed = 26,
  gap = 10,
  fadeColor,
  style,
}: {
  children: React.ReactNode;
  /** Temel hız (px/sn). */
  speed?: number;
  gap?: number;
  /** Kenarlardaki yumuşak solma rengi (arka plan rengi). */
  fadeColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const scene = useScrollScene();
  const reduced = useReducedMotion();
  const loopW = useSharedValue(0);
  const offset = useSharedValue(0);
  const paused = useSharedValue(0);
  const boost = useSharedValue(0);
  const lastY = useSharedValue(0);

  useFrameCallback((frame) => {
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    if (scene) {
      const dy = Math.abs(scene.scrollY.value - lastY.value);
      lastY.value = scene.scrollY.value;
      boost.value = boost.value * 0.92 + Math.min(dy, 40) * 1.8;
    }
    if (loopW.value <= 0 || paused.value) return;
    offset.value = (offset.value + (speed + boost.value) * dt) % loopW.value;
  }, !reduced);

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value }] }));

  if (reduced) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap }}>
        {children}
      </ScrollView>
    );
  }

  const hoverProps: any = {
    onMouseEnter: () => {
      paused.value = 1;
    },
    onMouseLeave: () => {
      paused.value = 0;
    },
  };

  return (
    <View
      style={[s.clip, style]}
      onTouchStart={() => {
        paused.value = 1;
      }}
      onTouchEnd={() => {
        paused.value = 0;
      }}
      onTouchCancel={() => {
        paused.value = 0;
      }}
      {...hoverProps}
    >
      <Animated.View style={[s.track, trackStyle]}>
        <View
          style={[s.track, { gap, paddingRight: gap }]}
          onLayout={(e) => {
            loopW.value = e.nativeEvent.layout.width;
          }}
        >
          {children}
        </View>
        {/* Kesintisiz döngü için ikinci kopya -- ekran okuyucudan gizli. */}
        <View style={[s.track, { gap, paddingRight: gap }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
          {children}
        </View>
      </Animated.View>
      {fadeColor ? (
        <>
          <LinearGradient pointerEvents="none" colors={[fadeColor, alpha(fadeColor, 0)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[s.fade, { left: 0 }]} />
          <LinearGradient pointerEvents="none" colors={[alpha(fadeColor, 0), fadeColor]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[s.fade, { right: 0 }]} />
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  clip: { overflow: 'hidden' },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 28 },
});

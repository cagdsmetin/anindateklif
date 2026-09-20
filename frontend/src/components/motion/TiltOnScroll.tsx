import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';
import { useViewportProgress } from './scene';

// "Container Scroll Animation" (21st.dev / Manu Arora) -- kart ekrana alttan
// girerken arkaya yatık (3B eğim) ve hafif küçük başlar; kaydırdıkça
// doğrulup tam boyuna gelir. Kaydırma geri alınınca tekrar yatar.
export default function TiltOnScroll({
  children,
  style,
  maxRotate = 16,
  minScale = 0.93,
  lift = 34,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  maxRotate?: number;
  minScale?: number;
  lift?: number;
}) {
  const ref = useAnimatedRef<Animated.View>();
  const p = useViewportProgress(ref, { from: 1, to: 0.5 });

  const aStyle = useAnimatedStyle(() => {
    const q = 1 - p.value;
    return {
      opacity: 0.45 + 0.55 * p.value,
      transform: [
        { perspective: 1100 },
        { translateY: q * lift },
        { rotateX: `${q * maxRotate}deg` },
        { scale: minScale + (1 - minScale) * p.value },
      ],
    };
  });

  return (
    <Animated.View ref={ref} collapsable={false} style={style}>
      <Animated.View style={aStyle}>{children}</Animated.View>
    </Animated.View>
  );
}

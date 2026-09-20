import React, { createContext, useCallback, useContext, useState } from 'react';
import { StyleProp, useWindowDimensions, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  measure,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useScrollScene } from './scene';

// Reveal'ın içindeki öğeler (ör. CountUp) "ekrana girdim" anını beklesin diye.
const RevealVisibleContext = createContext(true);
export function useRevealVisible() {
  return useContext(RevealVisibleContext);
}

export type RevealVariant = 'up' | 'fade' | 'scale' | 'left' | 'right' | 'tilt';

type RevealProps = {
  children: React.ReactNode;
  variant?: RevealVariant;
  /** Kayma mesafesi (px). */
  distance?: number;
  duration?: number;
  delay?: number;
  /** Aynı anda görünür olan öğeler arası gecikme (ms). */
  stagger?: number;
  /** Verilirse sahnenin otomatik sırası yerine bu sıra kullanılır. */
  index?: number;
  /** Öğenin üst kenarı ekran yüksekliğinin bu oranının üstüne gelince tetiklenir. */
  threshold?: number;
  /** Dış sarmalayıcıya uygulanır -- genişlik/flex/margin gibi yerleşim stilleri buraya. */
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

// "Scroll Reveal" / "In view" / "Stagger Reveal Grid" (21st.dev) -- öğe
// kaydırılarak görünür alana girdiğinde bir kez yumuşakça belirir. Aynı karede
// görünür olan öğeler sırayla (stagger) gelir. Ölçüm dıştaki (dönüşümsüz)
// sarmalayıcıdan yapılır, animasyon içtekine uygulanır; böylece öğenin kendi
// kayması ölçümü bozmaz. Ölçülemeyen bir durumda (ör. native'de görünüm
// düzleştirildiyse) içerik gizli kalmasın diye hemen gösterilir.
export default function Reveal({
  children,
  variant = 'up',
  distance = 22,
  duration = 540,
  delay = 0,
  stagger = 55,
  index,
  threshold = 0.94,
  style,
  disabled,
}: RevealProps) {
  const scene = useScrollScene();
  const reducedMotion = useReducedMotion();
  const skip = !!disabled || reducedMotion || !!scene?.reduced;
  const { height: winH } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const progress = useSharedValue(skip ? 1 : 0);
  const done = useSharedValue(skip ? 1 : 0);
  const lastTop = useSharedValue(1e9);
  const lastScroll = useSharedValue(0);
  const lastTick = useSharedValue(-1);
  const [visible, setVisible] = useState(skip);
  const markVisible = useCallback(() => setVisible(true), []);

  const trigger = () => {
    'worklet';
    if (done.value) return;
    done.value = 1;
    let extra = 0;
    if (index !== undefined) {
      extra = (index % 10) * stagger;
    } else if (scene) {
      const now = Date.now();
      if (now - scene.batchAt.value > 90) {
        scene.batchAt.value = now;
        scene.batchN.value = 0;
      }
      extra = Math.min(scene.batchN.value, 6) * stagger;
      scene.batchN.value += 1;
    }
    progress.value = withDelay(delay + extra, withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    runOnJS(markVisible)();
  };

  const inView = (top: number, height: number) => {
    'worklet';
    return top < winH * threshold && top + height > -40;
  };

  // Kaydırma/yerleşim değiştikçe: öğe hâlâ ekranın çok altındaysa ölçmeden
  // geç (son ölçüm + kaydırma farkından tahmin) -- uzun listelerde her karede
  // yüzlerce ölçüm yapılmasın.
  useAnimatedReaction(
    () => (scene ? scene.scrollY.value + scene.tick.value * 0 : 0),
    () => {
      if (done.value || !scene) return;
      const sy = scene.scrollY.value;
      const tickChanged = scene.tick.value !== lastTick.value;
      const predicted = lastTop.value - (sy - lastScroll.value);
      if (!tickChanged && predicted > winH * threshold + 160) return;
      lastTick.value = scene.tick.value;
      const m = measure(ref);
      if (!m) return;
      lastTop.value = m.pageY;
      lastScroll.value = sy;
      if (inView(m.pageY, m.height)) trigger();
    },
    [winH, threshold, scene]
  );

  const checkOnLayout = () => {
    'worklet';
    if (done.value) return;
    const m = measure(ref);
    if (m === null || !scene) {
      trigger();
      return;
    }
    lastTop.value = m.pageY;
    lastScroll.value = scene.scrollY.value;
    if (inView(m.pageY, m.height)) trigger();
  };

  const aStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const q = 1 - p;
    switch (variant) {
      case 'fade':
        return { opacity: p };
      case 'scale':
        return { opacity: p, transform: [{ scale: 0.86 + 0.14 * p }] };
      case 'left':
        return { opacity: p, transform: [{ translateX: -q * distance }] };
      case 'right':
        return { opacity: p, transform: [{ translateX: q * distance }] };
      case 'tilt':
        return {
          opacity: p,
          transform: [{ perspective: 900 }, { translateY: q * distance * 1.3 }, { rotateX: `${q * 32}deg` }, { scale: 0.94 + 0.06 * p }],
        };
      default:
        return { opacity: p, transform: [{ translateY: q * distance }, { scale: 0.97 + 0.03 * p }] };
    }
  });

  if (skip) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }

  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      style={style}
      onLayout={() => {
        if (!done.value) runOnUI(checkOnLayout)();
      }}
    >
      <Animated.View style={[{ flexGrow: 1 }, aStyle]}>
        <RevealVisibleContext.Provider value={visible}>{children}</RevealVisibleContext.Provider>
      </Animated.View>
    </Animated.View>
  );
}

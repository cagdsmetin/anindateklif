import React, { createContext, forwardRef, useContext, useMemo } from 'react';
import { LayoutChangeEvent, ScrollView, ScrollViewProps, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  AnimatedRef,
  measure,
  SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

// ============================================================================
// Scroll sahnesi -- 21st.dev'deki scroll animasyonlarının (Scroll Progress,
// Scroll Reveal, Container Scroll, Tracing Beam, Scroll Velocity) React Native
// karşılığının temeli. Hem native (iOS/Android) hem web'de Reanimated ile
// çalışır: kaydırma konumu UI thread'inde bir SharedValue'da tutulur, sahnenin
// içindeki bileşenler (Reveal, TiltOnScroll, Marquee...) bu değere göre
// kendilerini canlandırır -- React yeniden render'ı tetiklenmez.
// ============================================================================

export type ScrollScene = {
  scrollY: SharedValue<number>;
  viewportH: SharedValue<number>;
  contentH: SharedValue<number>;
  // Yerleşim (layout) değişince artar -- görünürlük kontrolleri kaydırma
  // olmadan da (veri yüklenince, filtre değişince) yeniden çalışsın diye.
  tick: SharedValue<number>;
  // Aynı karede görünür olan Reveal'ların sırayla (stagger) gelmesi için.
  batchAt: SharedValue<number>;
  batchN: SharedValue<number>;
  reduced: boolean;
};

const SceneContext = createContext<ScrollScene | null>(null);

export function useScrollScene(): ScrollScene | null {
  return useContext(SceneContext);
}

export function useCreateScrollScene(): ScrollScene {
  const reduced = useReducedMotion();
  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const contentH = useSharedValue(0);
  const tick = useSharedValue(0);
  const batchAt = useSharedValue(0);
  const batchN = useSharedValue(0);
  return useMemo(
    () => ({ scrollY, viewportH, contentH, tick, batchAt, batchN, reduced }),
    // SharedValue referansları sabit; sadece "azaltılmış hareket" tercihi değişebilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced]
  );
}

type MotionScrollViewProps = ScrollViewProps & {
  /** Dışarıda (useCreateScrollScene) oluşturulan sahne -- ScrollView dışındaki
   *  öğeler de kaydırmaya tepki verecekse verilir. */
  scene?: ScrollScene;
  /** Üst kenarda ince, gradyanlı kaydırma ilerleme çubuğu. */
  progressBar?: boolean;
  progressColors?: string[];
};

// ScrollView'ın birebir yerine geçer (aynı prop'lar, ref ile scrollTo çalışır).
// Tek fark: onScroll prop'u desteklenmez -- kaydırma olayını sahne kullanıyor.
export const MotionScrollView = forwardRef<ScrollView, MotionScrollViewProps>(function MotionScrollView(
  { scene: external, progressBar = true, progressColors, onLayout, onContentSizeChange, style, children, ...rest },
  ref
) {
  const own = useCreateScrollScene();
  const scene = external || own;

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scene.scrollY.value = e.contentOffset.y;
    },
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    scene.viewportH.value = e.nativeEvent.layout.height;
    scene.tick.value += 1;
    onLayout?.(e);
  };
  const handleContentSize = (w: number, h: number) => {
    scene.contentH.value = h;
    scene.tick.value += 1;
    onContentSizeChange?.(w, h);
  };

  return (
    <SceneContext.Provider value={scene}>
      <View style={[s.wrap, style]}>
        <Animated.ScrollView
          ref={ref as any}
          {...rest}
          style={s.fill}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={handleLayout}
          onContentSizeChange={handleContentSize}
        >
          {children}
        </Animated.ScrollView>
        {progressBar && !scene.reduced ? <ScrollProgressBar scene={scene} colors={progressColors} /> : null}
      </View>
    </SceneContext.Provider>
  );
});

const DEFAULT_PROGRESS = ['#6366F1', '#A855F7', '#EC4899'];

// "Scroll Progress" (21st.dev / Cnippet, Bundui) -- içerik kaydıkça soldan
// sağa dolan 3px'lik gradyan çizgi. Sadece içerik gerçekten kaydırılabilir
// olduğunda ve kaydırma başladığında görünür.
function ScrollProgressBar({ scene, colors = DEFAULT_PROGRESS }: { scene: ScrollScene; colors?: string[] }) {
  const trackW = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => {
    const max = scene.contentH.value - scene.viewportH.value;
    const p = max > 40 ? Math.min(1, Math.max(0, scene.scrollY.value / max)) : 0;
    return { transform: [{ translateX: -(1 - p) * trackW.value }] };
  });
  const trackStyle = useAnimatedStyle(() => {
    const max = scene.contentH.value - scene.viewportH.value;
    const shown = max > 40 ? Math.min(1, Math.max(0, scene.scrollY.value / 24)) : 0;
    return { opacity: shown };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.progressTrack, trackStyle]}
      onLayout={(e) => {
        trackW.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
        <LinearGradient colors={colors as any} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

// Bir öğenin ekrandaki konumuna bağlı 0..1 ilerleme (scroll-linked). Öğenin
// üst kenarı ekran yüksekliğinin `from` oranındayken 0, `to` oranına
// geldiğinde 1 olur. Kaydırma geri alınınca geri sarar (Container Scroll,
// Tracing Beam gibi "scrub" efektleri için). Sahne yoksa hep 1 döner.
export function useViewportProgress(
  ref: AnimatedRef<any>,
  { from = 1, to = 0.45 }: { from?: number; to?: number } = {}
): SharedValue<number> {
  const scene = useScrollScene();
  const { height: winH } = useWindowDimensions();
  const progress = useSharedValue(scene && !scene.reduced ? 0 : 1);

  useAnimatedReaction(
    () => (scene ? scene.scrollY.value + scene.tick.value * 0 : 0),
    () => {
      if (!scene || scene.reduced) return;
      const m = measure(ref);
      if (!m) return;
      const startY = from * winH;
      const endY = to * winH;
      const p = (startY - m.pageY) / Math.max(1, startY - endY);
      progress.value = Math.min(1, Math.max(0, p));
    },
    [winH, from, to, scene]
  );

  return progress;
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  fill: { flex: 1 },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
    zIndex: 20,
  },
});

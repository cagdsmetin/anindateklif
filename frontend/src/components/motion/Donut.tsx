import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRevealVisible } from './Reveal';

export type DonutSlice = { value: number; color: string };

type Chunk = { start: number; sweep: number; color: string; slice: number };

// Her dilim 180°'yi geçmeyecek parçalara bölünür (yarım-disk döndürme tekniği
// en fazla 180° çizebilir).
function toChunks(data: DonutSlice[]): Chunk[] {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  if (!(total > 0)) return [];
  const out: Chunk[] = [];
  let acc = 0;
  data.forEach((d, i) => {
    let sweep = (Math.max(0, d.value) / total) * 360;
    let start = acc;
    acc += sweep;
    while (sweep > 0.01) {
      const part = Math.min(180, sweep);
      out.push({ start, sweep: part, color: d.color, slice: i });
      start += part;
      sweep -= part;
    }
  });
  return out;
}

// Tek parça: pastanın sağ yarısını gösteren bir kırpma penceresi, içinde sol
// yarısı boyalı tam boy bir disk. Disk θ kadar döndükçe pencerede 0..θ arası
// bir dilim görünür; dış kap `start` kadar döndürülerek dilim yerine oturur.
// SVG gerektirmez -- native ve web'de aynı çizilir.
function ChunkView({ chunk, size, progress }: { chunk: Chunk; size: number; progress: SharedValue<number> }) {
  const half = size / 2;
  const turn = useAnimatedStyle(() => {
    const shown = Math.min(chunk.sweep, Math.max(0, progress.value * 360 - chunk.start));
    return { transform: [{ rotate: `${shown}deg` }] };
  });
  return (
    <View style={[s.abs, { width: size, height: size, transform: [{ rotate: `${chunk.start}deg` }] }]}>
      <View style={[s.abs, { left: half, width: half, height: size, overflow: 'hidden' }]}>
        <Animated.View style={[s.abs, { left: -half, width: size, height: size }, turn]}>
          <View
            style={[
              s.abs,
              { width: half, height: size, backgroundColor: chunk.color, borderTopLeftRadius: half, borderBottomLeftRadius: half },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

// Halka (donut) grafik -- kartı ekrana girince saat yönünde çizilerek dolar.
// Web'de dilimin ya da açıklama satırının üstüne gelince o dilim dışarı kayar
// (hoverIndex dışarıdan yönetilir).
export default function Donut({
  data,
  size = 116,
  thickness = 16,
  holeColor,
  trackColor,
  centerLabel,
  centerValue,
  labelColor,
  valueColor,
  hoverIndex = null,
  onHoverSlice,
}: {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  holeColor: string;
  trackColor: string;
  centerLabel?: string;
  centerValue?: string;
  labelColor: string;
  valueColor: string;
  hoverIndex?: number | null;
  onHoverSlice?: (i: number | null) => void;
}) {
  const visible = useRevealVisible();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!visible) return;
    progress.value = reduced ? 1 : withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [visible, reduced, progress]);

  const chunks = toChunks(data);
  const bySlice = new Map<number, Chunk[]>();
  chunks.forEach((c) => bySlice.set(c.slice, [...(bySlice.get(c.slice) || []), c]));
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);

  return (
    <View style={{ width: size, height: size }}>
      <View style={[s.abs, { width: size, height: size, borderRadius: size / 2, backgroundColor: trackColor }]} />
      {[...bySlice.entries()].map(([sliceIdx, list]) => {
        const hovered = hoverIndex === sliceIdx;
        const first = list[0];
        const sliceSweep = (Math.max(0, data[sliceIdx].value) / Math.max(total, 1e-9)) * 360;
        const mid = ((first.start + sliceSweep / 2) * Math.PI) / 180;
        const dx = hovered ? Math.sin(mid) * 5 : 0;
        const dy = hovered ? -Math.cos(mid) * 5 : 0;
        const hoverProps: any = onHoverSlice
          ? { onMouseEnter: () => onHoverSlice(sliceIdx), onMouseLeave: () => onHoverSlice(null) }
          : {};
        return (
          <View
            key={sliceIdx}
            {...hoverProps}
            style={[s.abs, { width: size, height: size, transform: [{ translateX: dx }, { translateY: dy }] }]}
          >
            {list.map((c, i) => (
              <ChunkView key={i} chunk={c} size={size} progress={progress} />
            ))}
          </View>
        );
      })}
      <View
        pointerEvents="none"
        style={[
          s.hole,
          {
            width: size - thickness * 2,
            height: size - thickness * 2,
            borderRadius: (size - thickness * 2) / 2,
            left: thickness,
            top: thickness,
            backgroundColor: holeColor,
          },
        ]}
      >
        {centerLabel ? <Text style={[s.centerLabel, { color: labelColor }]} numberOfLines={1}>{centerLabel}</Text> : null}
        {centerValue ? (
          <Text style={[s.centerValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
            {centerValue}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  hole: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  centerLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },
  centerValue: { fontSize: 13, fontWeight: '900', marginTop: 1, maxWidth: '92%' },
});

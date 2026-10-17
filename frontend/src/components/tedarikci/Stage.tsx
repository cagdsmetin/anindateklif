import React, { useEffect } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/src/lib/theme';
import { Aurora, CountUp, alpha, themedStyles, useViewportProgress } from '@/src/components/motion';

// Tedarikçi ekranlarının görsel dili. Ana yön Raylight: gece siyahı bir
// "sahne", sıkı aralıklı çok büyük rakam, beyaz hap ana buton + koyu ikincil
// buton, ince kenarlı paneller. 21st.dev'den yalnız iki şey alındı: sahnenin
// üstünden sönen ışıltı (tek vurgu rengi: modülün turuncusu) ve sayaçlı hap
// sekmeler. Hareketler amaca bağlı: sayı sayarak gelir (hiyerarşi), şerit ve
// çubuklar ekrana girdikçe dolar (süreklilik), basınca küçülür (geri bildirim).

const INK = '#0B0B0C';
const EMBER = '#EA580C';

export function PillButton({
  label, icon, onPress, variant = 'light', testID, style,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'light' | 'ghost';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const light = variant === 'light';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.95, { duration: 110 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 160 }); }}
      testID={testID}
      style={style}
    >
      <Animated.View style={[st.pill, light ? st.pillLight : st.pillGhost, anim]}>
        {icon ? <Ionicons name={icon} size={15} color={light ? INK : '#fff'} /> : null}
        <Text style={[st.pillText, { color: light ? INK : '#fff' }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// Koyu sahne: küçük üst etiket, başlık, sayarak gelen dev rakam, alt satır
// ve hap butonlar. children sahnenin altına (şerit, halka) eklenir.
export function TedStage({
  eyebrow, title, value, format, valueColor = '#fff', sub, actions, children, testID,
}: {
  eyebrow: string;
  title: string;
  value: number;
  format: (n: number) => string;
  valueColor?: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={st.stageShell} testID={testID}>
      <Aurora colors={[EMBER, '#7C2D12', '#1F2937']} base={[INK, '#141416']} style={st.stage}>
        <Text style={st.eyebrow} numberOfLines={1}>{eyebrow}</Text>
        <Text style={st.title} numberOfLines={2}>{title}</Text>
        <CountUp value={value} format={format} style={[st.bigNumber, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit />
        {sub ? <View style={{ marginTop: 6 }}>{sub}</View> : null}
        {actions ? <View style={st.actions}>{actions}</View> : null}
        {children}
      </Aurora>
    </View>
  );
}

export type StripSegment = { id: string; label: string; value: number; color: string };

// "Borç şeridi": tedarikçilerin borç payı tek bir yatay çubukta. Ekrana
// girdikçe soldan sağa dolar; dilime ya da açıklamaya dokununca o
// tedarikçinin carisi açılır.
export function DebtStrip({ segments, onPress, emptyLabel }: { segments: StripSegment[]; onPress: (id: string) => void; emptyLabel: string }) {
  const ref = useAnimatedRef<Animated.View>();
  const p = useViewportProgress(ref, { from: 1, to: 0.55 });
  const grow = useAnimatedStyle(() => ({ width: `${Math.round(p.value * 1000) / 10}%` as any }));
  const total = segments.reduce((a, x) => a + x.value, 0);
  if (!total) return <Text style={st.stripEmpty}>{emptyLabel}</Text>;
  return (
    <View style={{ marginTop: 18 }}>
      <Animated.View ref={ref} collapsable={false} style={st.stripTrack}>
        <Animated.View style={[st.stripFill, grow]}>
          {segments.map((x) => (
            <Pressable key={x.id} onPress={() => onPress(x.id)} style={{ flex: x.value / total, backgroundColor: x.color }} testID={`ted-strip-${x.id}`} />
          ))}
        </Animated.View>
      </Animated.View>
      <View style={st.legend}>
        {segments.slice(0, 5).map((x) => (
          <Pressable key={x.id} onPress={() => onPress(x.id)} style={st.legendItem}>
            <View style={[st.legendDot, { backgroundColor: x.color }]} />
            <Text style={st.legendText} numberOfLines={1}>{x.label}</Text>
            <Text style={st.legendPct}>%{Math.round((x.value / total) * 100)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Ekrana girdikçe hedef oranına kadar dolan ince çubuk (ödenen / alınan).
export function ScrollFill({ ratio, color, track }: { ratio: number; color: string; track: string }) {
  const ref = useAnimatedRef<Animated.View>();
  const p = useViewportProgress(ref, { from: 0.98, to: 0.6 });
  const r = Math.max(0, Math.min(1, ratio));
  const fill = useAnimatedStyle(() => ({ width: `${Math.round(p.value * r * 1000) / 10}%` as any }));
  return (
    <Animated.View ref={ref} collapsable={false} style={[st.fillTrack, { backgroundColor: track }]}>
      <Animated.View style={[st.fillBar, { backgroundColor: color }, fill]} />
    </Animated.View>
  );
}

// 21st.dev tarzı sayaçlı hap sekmeler; seçili sekmenin zemini yumuşakça
// koyulaşır (durum geçişi ~180ms).
export function PillTabs<K extends string>({
  items, value, onChange, testIDPrefix,
}: {
  items: { key: K; label: string; count?: number; tone?: string }[];
  value: K;
  onChange: (k: K) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={st.tabs}>
      {items.map((it) => <PillTab key={it.key} item={it} on={it.key === value} onPress={() => onChange(it.key)} testID={`${testIDPrefix}-${it.key}`} />)}
    </View>
  );
}

function PillTab({ item, on, onPress, testID }: { item: { label: string; count?: number; tone?: string }; on: boolean; onPress: () => void; testID: string }) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => { t.value = withTiming(on ? 1 : 0, { duration: 180, easing: Easing.out(Easing.quad) }); }, [on, t]);
  const bg = useAnimatedStyle(() => ({ opacity: t.value }));
  return (
    <Pressable onPress={onPress} testID={testID} style={st.tab}>
      <Animated.View style={[StyleSheet.absoluteFill, st.tabOn, bg]} />
      <Text style={[st.tabText, on && { color: theme.colors.bg }]}>{item.label}</Text>
      {item.count != null ? (
        <View style={[st.tabCount, on ? { backgroundColor: alpha('#ffffff', 0.18) } : { backgroundColor: item.tone ? alpha(item.tone, 0.14) : theme.colors.surfaceSoft }]}>
          <Text style={[st.tabCountText, { color: on ? theme.colors.bg : item.tone || theme.colors.textMuted }]}>{item.count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const st = themedStyles(() => StyleSheet.create({
  stageShell: { borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', ...theme.shadow.md },
  stage: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22 },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.6, marginTop: 4 },
  bigNumber: { fontSize: 46, fontWeight: '900', letterSpacing: -1.8, marginTop: 10, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999 },
  pillLight: { backgroundColor: '#fff' },
  pillGhost: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  pillText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.1 },
  stripTrack: { height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  stripFill: { height: '100%', flexDirection: 'row', gap: 2 },
  stripEmpty: { marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', maxWidth: '100%' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', maxWidth: 140 },
  legendPct: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)', fontVariant: ['tabular-nums'] },
  fillTrack: { height: 5, borderRadius: 999, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 999 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  tabOn: { backgroundColor: theme.colors.text, borderRadius: 999 },
  tabText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textSoft },
  tabCount: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, alignItems: 'center' },
  tabCountText: { fontSize: 10.5, fontWeight: '900', fontVariant: ['tabular-nums'] },
}));

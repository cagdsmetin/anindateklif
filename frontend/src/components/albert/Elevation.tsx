import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AG } from './ag-kit';

// ============================================================================
// Canlı cephe çizimi
// ----------------------------------------------------------------------------
// Ekranın tek "cesur" öğesi. Bayi genişlik/yükseklik/derinlik yazdıkça çizim
// gerçek orana göre yeniden ölçeklenir, kot çizgileri ve ölçü yazıları
// güncellenir. Amaç: ölçü alanlarını boş bir form hissinden çıkarıp "önce
// ölçüyü gir, sistemi gör" davranışını doğal hale getirmek.
//
// react-native-svg projede yok; çizim tamamen View'lardan kuruluyor (dikmeler
// ince View, ok uçları 45° döndürülmüş kenarlıklar) -- native ve web'de aynı.
// ============================================================================

const STAGE_H = 208;
const PAD_L = 34; // sol kot çizgisi
const PAD_R = 16;
const PAD_T = 26; // üst ölçü yazısı
const PAD_B = 40; // alt kot çizgisi + zemin

function num(v: string | number | undefined): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

function fmtMm(n: number): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

export default function Elevation({
  w,
  h,
  d,
  /** Yükseklik girilmeyen tipler (ayaksız) için plan görünümü: genişlik × derinlik. */
  plan,
  /** Başlık künyesinde görünen sistem adı. */
  caption,
}: {
  w: string;
  h?: string;
  d?: string;
  plan?: boolean;
  caption?: string;
}) {
  const reduced = useReducedMotion();
  const [stageW, setStageW] = useState(0);

  const W = num(w);
  const H = num(plan ? d : h);
  const D = num(d);
  const hasAny = W > 0 || H > 0;
  const ready = W > 0 && H > 0;

  const areaW = Math.max(40, stageW - PAD_L - PAD_R);
  const areaH = STAGE_H - PAD_T - PAD_B;

  // Gerçek oranı koruyarak alana sığdır. Ölçü yoksa davetkâr bir hayalet
  // orana (altın orana yakın) otur.
  const { bw, bh } = useMemo(() => {
    const ratio = ready ? W / H : 1.55;
    let width = areaW;
    let height = width / ratio;
    if (height > areaH) {
      height = areaH;
      width = height * ratio;
    }
    // Çok dar/çok geniş girişlerde çizim okunaksız olmasın diye sınırla.
    width = Math.max(44, Math.min(width, areaW));
    height = Math.max(34, Math.min(height, areaH));
    return { bw: width, bh: height };
  }, [W, H, ready, areaW, areaH]);

  const aw = useSharedValue(0);
  const ah = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!stageW) return;
    if (reduced) {
      aw.value = bw;
      ah.value = bh;
      return;
    }
    aw.value = withSpring(bw, { damping: 19, stiffness: 150, mass: 0.9 });
    ah.value = withSpring(bh, { damping: 19, stiffness: 150, mass: 0.9 });
  }, [bw, bh, stageW, reduced, aw, ah]);

  // Ölçü girilmeden önce kot çizgisi yavaşça nefes alır -- "buraya ölçü gir"
  // çağrısı. Ölçü girilince durur (dikkat artık çizimin kendisinde).
  useEffect(() => {
    if (reduced || hasAny) {
      glow.value = withTiming(0, { duration: 260 });
      return;
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1150, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [hasAny, reduced, glow]);

  const frame = useAnimatedStyle(() => ({ width: aw.value, height: ah.value }));
  const wDim = useAnimatedStyle(() => ({ width: aw.value }));
  const hDim = useAnimatedStyle(() => ({ height: ah.value }));
  const pulse = useAnimatedStyle(() => ({ opacity: 0.35 + 0.5 * glow.value }));

  // Dikme sayısı: ~700mm'lik kanat varsayımı, 2..8 arası.
  const mullions = useMemo(() => {
    if (!ready || plan) return 0;
    return Math.max(1, Math.min(7, Math.round(W / 700) - 1));
  }, [W, ready, plan]);

  return (
    <View style={st.wrap} onLayout={(e: LayoutChangeEvent) => setStageW(e.nativeEvent.layout.width)}>
      <View style={st.titleBlock}>
        <Text style={st.titleText} numberOfLines={1}>
          {plan ? 'PLAN' : 'CEPHE'}
        </Text>
        <View style={st.titleRule} />
        <Text style={st.titleCaption} numberOfLines={1}>
          {caption || 'ölçek: otomatik'}
        </Text>
      </View>

      <View style={st.stage}>
        {/* ---- üst ölçü yazısı (genişlik) ---- */}
        <View style={[st.topLabelRow, { left: PAD_L, right: PAD_R }]}>
          <Animated.View style={[st.topLabelCenter, wDim]}>
            <Text style={[st.dimText, !ready && st.dimTextGhost]} numberOfLines={1}>
              {W > 0 ? `${fmtMm(W)} mm` : 'genişlik'}
            </Text>
          </Animated.View>
        </View>

        {/* ---- sol kot çizgisi (yükseklik / derinlik) ---- */}
        <View style={[st.leftRail, { top: PAD_T, bottom: PAD_B }]}>
          <Animated.View style={[st.leftRailInner, hDim]}>
            <View style={[st.vRule, ready ? st.vRuleOn : st.vRuleOff]} />
            <View style={[st.arrowUp, ready && st.arrowUpOn]} />
            <View style={[st.arrowDown, ready && st.arrowDownOn]} />
            {/* Kot yazısı çizimlerdeki gibi 90° döndürülür -- böylece dar
                sol şeride sığar, uzun kelimeler ("yükseklik") kırpılmaz. */}
            <View style={st.vLabelWrap}>
              <Text style={[st.vLabelText, !ready && st.dimTextGhost]} numberOfLines={1}>
                {H > 0 ? fmtMm(H) : plan ? 'derinlik' : 'yükseklik'}
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* ---- çizim ---- */}
        <View style={[st.canvas, { paddingLeft: PAD_L, paddingRight: PAD_R, paddingTop: PAD_T, paddingBottom: PAD_B }]}>
          <Animated.View style={[st.frame, ready ? st.frameOn : st.frameGhost, frame]}>
            {/* cam yüzey */}
            <View style={ready ? st.glass : st.glassGhost} />
            {/* dikmeler */}
            {Array.from({ length: mullions }).map((_, i) => (
              <View
                key={i}
                style={[
                  st.mullion,
                  { left: `${((i + 1) * 100) / (mullions + 1)}%` },
                ]}
              />
            ))}
            {/* derinlik: sağ üstte perspektif payandası */}
            {!plan && D > 0 && ready ? (
              <View style={st.depthTag}>
                <View style={st.depthLine} />
                <Text style={st.depthText} numberOfLines={1}>
                  {fmtMm(D)}
                </Text>
              </View>
            ) : null}
          </Animated.View>
        </View>

        {/* ---- zemin ---- */}
        <View style={[st.ground, { left: PAD_L, right: PAD_R, bottom: PAD_B - 10 }]} />

        {/* ---- alt kot çizgisi ---- */}
        <View style={[st.bottomRail, { left: PAD_L, right: PAD_R }]}>
          <Animated.View style={[st.bottomRailInner, wDim]}>
            <Animated.View style={[st.hRule, ready ? st.hRuleOn : st.hRuleOff, !hasAny && pulse]} />
            <View style={[st.arrowLeft, ready && st.arrowLeftOn]} />
            <View style={[st.arrowRight, ready && st.arrowRightOn]} />
          </Animated.View>
        </View>
      </View>

      {!ready ? (
        <Text style={st.invite}>
          {W > 0 || H > 0
            ? 'Bir ölçü daha girin; çizim gerçek oranına otursun.'
            : 'Ölçüleri girdikçe sistem burada gerçek oranıyla çizilir.'}
        </Text>
      ) : (
        <View style={st.readout}>
          <Readout label="Genişlik" value={`${fmtMm(W)} mm`} />
          <View style={st.readoutSep} />
          <Readout label={plan ? 'Derinlik' : 'Yükseklik'} value={`${fmtMm(H)} mm`} />
          {!plan && D > 0 ? (
            <>
              <View style={st.readoutSep} />
              <Readout label="Derinlik" value={`${fmtMm(D)} mm`} />
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.readoutCell}>
      <Text style={st.readoutLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={st.readoutValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const ARROW = 5;
const ARROW_ON = 'rgba(232,83,108,0.8)';

const st = StyleSheet.create({
  wrap: {
    backgroundColor: AG.well,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AG.lineSoft,
    overflow: 'hidden',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: AG.lineSoft,
  },
  titleText: { color: AG.redLift, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  titleRule: { flex: 1, height: 1, backgroundColor: AG.lineSoft },
  titleCaption: { color: AG.graphiteDim, fontSize: 10, fontWeight: '700', maxWidth: '52%' },

  stage: { height: STAGE_H, position: 'relative' },
  canvas: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  frame: { borderWidth: 1.5, borderRadius: 3, position: 'relative', overflow: 'visible' },
  frameOn: { borderColor: AG.redLift },
  frameGhost: { borderColor: 'rgba(148,155,168,0.32)', borderStyle: 'dashed' },
  glass: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(182,18,49,0.10)' },
  glassGhost: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.025)' },
  mullion: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(232,83,108,0.55)' },

  depthTag: { position: 'absolute', right: -2, top: -16, flexDirection: 'row', alignItems: 'center', gap: 4 },
  depthLine: { width: 14, height: 1.5, backgroundColor: 'rgba(232,83,108,0.7)', transform: [{ rotate: '-38deg' }] },
  depthText: { color: AG.redLift, fontSize: 9.5, fontWeight: '900', fontVariant: ['tabular-nums'] },

  topLabelRow: { position: 'absolute', top: 6, alignItems: 'center' },
  topLabelCenter: { alignItems: 'center' },
  dimText: { color: AG.chalk, fontSize: 12.5, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.2 },
  dimTextSm: { color: AG.chalk, fontSize: 10.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dimTextGhost: { color: AG.graphiteDim, fontWeight: '700', letterSpacing: 0.2 },

  leftRail: { position: 'absolute', left: 0, width: PAD_L, alignItems: 'center', justifyContent: 'center' },
  leftRailInner: { width: PAD_L, alignItems: 'center', justifyContent: 'center' },
  vRule: { position: 'absolute', top: 0, bottom: 0, width: 1.5, left: PAD_L / 2 - 0.75 },
  vRuleOn: { backgroundColor: 'rgba(232,83,108,0.6)' },
  vRuleOff: { backgroundColor: 'rgba(148,155,168,0.28)' },
  vLabelWrap: {
    position: 'absolute',
    left: PAD_L / 2 - 60,
    width: 120,
    alignItems: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  vLabelText: {
    color: AG.chalk,
    fontSize: 10.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    backgroundColor: AG.well,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },

  bottomRail: { position: 'absolute', bottom: 16, alignItems: 'center', justifyContent: 'center' },
  bottomRailInner: { height: 12, justifyContent: 'center' },
  hRule: { height: 1.5, width: '100%' },
  hRuleOn: { backgroundColor: 'rgba(232,83,108,0.6)' },
  hRuleOff: { backgroundColor: 'rgba(148,155,168,0.3)' },

  arrowUp: {
    position: 'absolute',
    top: -1,
    left: PAD_L / 2 - ARROW,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderBottomWidth: ARROW + 1,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(148,155,168,0.35)',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -1,
    left: PAD_L / 2 - ARROW,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderTopWidth: ARROW + 1,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(148,155,168,0.35)',
  },
  arrowLeft: {
    position: 'absolute',
    left: -1,
    width: 0,
    height: 0,
    borderTopWidth: ARROW,
    borderBottomWidth: ARROW,
    borderRightWidth: ARROW + 1,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: 'rgba(148,155,168,0.35)',
  },
  arrowRight: {
    position: 'absolute',
    right: -1,
    width: 0,
    height: 0,
    borderTopWidth: ARROW,
    borderBottomWidth: ARROW,
    borderLeftWidth: ARROW + 1,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(148,155,168,0.35)',
  },
  // Ucgen ok uclari: sadece dolgu kenarinin rengi degisir, yan kenarlar
  // saydam kalmali -- dordunu birden boyamak ucgeni dolu kareye cevirir.
  arrowUpOn: { borderBottomColor: ARROW_ON },
  arrowDownOn: { borderTopColor: ARROW_ON },
  arrowLeftOn: { borderRightColor: ARROW_ON },
  arrowRightOn: { borderLeftColor: ARROW_ON },

  ground: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },

  invite: {
    color: AG.graphite,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 18,
    paddingBottom: 13,
    paddingTop: 2,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: AG.lineSoft,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  readoutCell: { flex: 1, alignItems: 'center' },
  readoutSep: { width: 1, alignSelf: 'stretch', backgroundColor: AG.lineSoft },
  readoutLabel: { color: AG.graphiteDim, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  readoutValue: { color: AG.chalk, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
});

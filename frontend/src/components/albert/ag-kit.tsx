import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { themedStyles } from '@/src/components/motion/paint';

// ============================================================================
// Albert Genau "teknik föy" kiti
// ----------------------------------------------------------------------------
// Bu ekran uygulamanın geri kalanından bilinçli olarak ayrı bir görsel dile
// sahip: bayi buraya girdiğinde bir uygulama formu değil, Albert Genau'nun
// kendi ölçü föyünü doldurduğunu hissetmeli. Bu yüzden:
//
//   * Kartlar "sheet" (föy paneli) -- hepsi aynı yuvarlaklıkta değil, künye
//     bloğu (title block) taşıyan, numaralandırılmış paftalar.
//   * Sayılar içeriğin kendisi: ölçü değerleri display boyutunda, tabular.
//   * Etiketler cümle düzeninde. (Türkçe "i" harfi locale'siz uppercase'te
//     noktasız "I"ya dönüşüyor; ayrıca harf aralıklı VERSAL etiketler uzun
//     Türkçe başlıkları -- "İmalat ve Diğer Giderler" -- kesiyordu.)
//   * VERSAL sadece birim rozetlerinde ve künye satırında -- teknik çizim
//     geleneğine sadık kalan tek yer.
// ============================================================================

export const AG = {
  red: '#B61231',
  redLift: '#E8536C',
  redDeep: '#7A0E22',
  ink: '#0A0A0C',
  paper: '#141419',
  paperSoft: '#1C1C23',
  well: '#101015',
  line: 'rgba(255,255,255,0.10)',
  lineSoft: 'rgba(255,255,255,0.055)',
  chalk: '#F2F3F5',
  graphite: '#949BA8',
  graphiteDim: '#6C7280',
};

// 4px modülüne oturan ölçek. Bloklar arası boşluk alan içi boşluğun iki
// katından fazla -- kullanıcı "balonlar çok yakın, bitişik" dediği için
// gruplar arası ayrım gruplar içindekinden belirgin biçimde büyük.
export const AGS = {
  gutter: 18,
  blockGap: 22,
  blockPad: 16,
  fieldGap: 12,
  rowGap: 14,
  radius: 16,
  radiusSm: 12,
};

// --- Birim ayrıştırma ---------------------------------------------------
// Etiketler tarih boyunca "Genişlik (mm)", "Kar Marjı (%)", "Fiyat (₺/m²)"
// biçiminde yazılmıştı; birim etiketin içinde kalınca hem etiket taşıyor hem
// de alanın sağındaki birim rozeti her alanda "mm" gösteriyordu. Birimi
// etiketten ayırıp rozete taşıyoruz.
const UNIT_RE = /\s*\(([^()]{1,10})\)\s*$/;
const KNOWN_UNITS = new Set(['mm', 'cm', 'm', 'm²', '%', '₺', '₺/m²', '€', '$', 'adet', 'kg']);

export function splitUnit(label: string, fallbackUnit?: string): { label: string; unit?: string; optional?: boolean } {
  const m = label.match(UNIT_RE);
  if (!m || m.index === undefined) return { label, unit: fallbackUnit };
  const inner = m[1].trim();
  const head = label.slice(0, m.index).trim();
  if (KNOWN_UNITS.has(inner)) return { label: head, unit: inner };
  if (inner.toLocaleLowerCase('tr') === 'opsiyonel') return { label: head, unit: fallbackUnit, optional: true };
  return { label, unit: fallbackUnit };
}

export function groupTr(raw: string): string {
  const n = Number(String(raw).replace(',', '.'));
  if (!raw || !isFinite(n) || n === 0) return '';
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

// --- Eksen işareti ------------------------------------------------------
// Ölçü alanının insanı "buraya ölçü gir" diye çağıran görseli: alanın hangi
// ekseni ölçtüğünü gösteren minik kot işareti (genişlik yatay, yükseklik
// dikey, derinlik perspektif). Değer girilince bordoya döner.
export type Axis = 'w' | 'h' | 'd' | 'n' | 'money' | 'pct';

export function AxisGlyph({ axis, active, size = 26 }: { axis: Axis; active: boolean; size?: number }) {
  const tint = active ? AG.redLift : AG.graphiteDim;
  if (axis === 'money' || axis === 'pct' || axis === 'n') {
    const name = axis === 'money' ? 'cash-outline' : axis === 'pct' ? 'trending-up-outline' : 'layers-outline';
    return <Ionicons name={name as any} size={size * 0.62} color={tint} />;
  }
  if (axis === 'w') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[g.hLine, { backgroundColor: tint, width: size - 6 }]} />
        <View style={[g.tickV, { backgroundColor: tint, left: 3 }]} />
        <View style={[g.tickV, { backgroundColor: tint, right: 3 }]} />
      </View>
    );
  }
  if (axis === 'h') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[g.vLine, { backgroundColor: tint, height: size - 6 }]} />
        <View style={[g.tickH, { backgroundColor: tint, top: 3 }]} />
        <View style={[g.tickH, { backgroundColor: tint, bottom: 3 }]} />
      </View>
    );
  }
  // depth -- perspektif kaçış çizgisi
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[g.dLine, { backgroundColor: tint, width: size - 8 }]} />
      <View style={[g.dot, { backgroundColor: tint, top: 5, left: 5 }]} />
      <View style={[g.dot, { backgroundColor: tint, bottom: 5, right: 5 }]} />
    </View>
  );
}

const g = StyleSheet.create({
  hLine: { height: 1.5, borderRadius: 1 },
  vLine: { width: 1.5, borderRadius: 1 },
  tickV: { position: 'absolute', width: 1.5, height: 11, borderRadius: 1 },
  tickH: { position: 'absolute', height: 1.5, width: 11, borderRadius: 1 },
  dLine: { height: 1.5, borderRadius: 1, transform: [{ rotate: '-38deg' }] },
  dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
});

// --- Ölçü alanı --------------------------------------------------------
// Eski NumField'in yerini alır. Farkları: birim etiketten ayrışır, etiket
// kesilmez (cümle düzeni + iki satır hakkı), solda eksen işareti, değer
// girilince alan "okundu" durumuna geçer.
export function DimField({
  label,
  value,
  onChange,
  unit,
  axis = 'n',
  hint,
  testID,
  style,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  axis?: Axis;
  hint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const parsed = splitUnit(label, unit);
  const [focused, setFocused] = useState(false);
  const filled = !!value && Number(String(value).replace(',', '.')) > 0;
  const f = useSharedValue(0);

  useEffect(() => {
    f.value = withTiming(focused ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [focused, f]);

  const shell = useAnimatedStyle(() => ({
    borderColor:
      f.value > 0.5 ? AG.red : filled ? 'rgba(182,18,49,0.32)' : AG.line,
    backgroundColor: f.value > 0.5 ? AG.paperSoft : AG.well,
  }));
  const rule = useAnimatedStyle(() => ({
    transform: [{ scaleX: filled ? 1 : 0.12 + 0.88 * f.value }],
    opacity: 0.35 + 0.65 * Math.max(f.value, filled ? 1 : 0),
  }));

  return (
    <Animated.View style={[k.field, compact && k.fieldCompact, shell, style]}>
      {/* Etiket tüm genişliği alır (kesilmesin), birim değerin sağında
          durur. TextInput'a minWidth:0 şart: web'de <input> kendi içsel
          genişliğinin altına inemediği için birim kutunun dışında kalıyor
          ve hiç görünmüyordu. */}
      <View style={k.fieldHead}>
        <AxisGlyph axis={axis} active={focused || filled} size={compact ? 22 : 26} />
        <View style={k.fieldHeadText}>
          <Text style={k.fieldLabel} numberOfLines={2}>
            {parsed.label}
          </Text>
          {parsed.optional ? <Text style={k.fieldOptional}>opsiyonel</Text> : null}
        </View>
      </View>
      <View style={k.fieldValueRow}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
          placeholder="0"
          placeholderTextColor="rgba(148,155,168,0.38)"
          style={[k.fieldInput, compact && k.fieldInputCompact]}
          selectionColor={AG.redLift}
        />
        {parsed.unit ? (
          <View style={k.unitChip}>
            <Text style={k.fieldUnit}>{parsed.unit}</Text>
          </View>
        ) : null}
      </View>
      <View style={k.ruleTrack}>
        <Animated.View style={[k.rule, rule]} />
      </View>
      {hint ? <Text style={k.fieldHint}>{hint}</Text> : null}
    </Animated.View>
  );
}

// --- Föy paneli --------------------------------------------------------
// Uygulamanın geri kalanındaki "aynı yarıçap + aynı gölge" kart yığınının
// yerine: sol kenarında kot şeridi, üstünde künye satırı olan pafta.
export function Sheet({
  index,
  title,
  note,
  status,
  children,
  style,
  tone = 'default',
}: {
  index?: string;
  title?: string;
  note?: string;
  /** Sağ üstte durum rozeti -- ör. "3 ölçü" / "eksik". */
  status?: { text: string; done?: boolean };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'accent';
}) {
  return (
    <View style={[k.sheet, tone === 'accent' && k.sheetAccent, style]}>
      {title ? (
        <View style={k.sheetHead}>
          {index ? <Text style={k.sheetIndex}>{index}</Text> : null}
          <View style={{ flex: 1 }}>
            <Text style={k.sheetTitle}>{title}</Text>
            {note ? <Text style={k.sheetNote}>{note}</Text> : null}
          </View>
          {status ? (
            <View style={[k.sheetStatus, status.done && k.sheetStatusDone]}>
              {status.done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
              <Text style={[k.sheetStatusText, status.done && k.sheetStatusTextDone]} numberOfLines={1}>
                {status.text}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={title ? k.sheetBody : undefined}>{children}</View>
    </View>
  );
}

// --- Sistem/aile satırı -------------------------------------------------
// "Balon" (pill) yerine katalog fihristi satırı: solda kot şeridi, ortada
// isim + açıklama, sağda seçim işareti. Uzun isimler (BC AİLESİ (TIARA /
// SLIDER / SLIDE MASTER / HD / TANGO / OPTIMA)) artık kesilmiyor.
export function SystemRow({
  label,
  caption,
  selected,
  onPress,
  testID,
  code,
}: {
  label: string;
  caption?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  code?: string;
}) {
  const reduced = useReducedMotion();
  const sel = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    sel.value = reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 17, stiffness: 240, mass: 0.6 });
  }, [selected, reduced, sel]);

  const shell = useAnimatedStyle(() => ({
    backgroundColor: sel.value > 0.5 ? 'rgba(182,18,49,0.13)' : AG.well,
    borderColor: sel.value > 0.5 ? 'rgba(182,18,49,0.55)' : AG.line,
    transform: [{ scale: 1 - press.value * 0.012 }],
  }));
  const bar = useAnimatedStyle(() => ({
    backgroundColor: sel.value > 0.5 ? AG.red : 'rgba(255,255,255,0.10)',
    transform: [{ scaleY: 0.34 + 0.66 * sel.value }],
  }));

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 14, stiffness: 240 });
      }}
    >
      <Animated.View style={[k.sysRow, shell]}>
        <Animated.View style={[k.sysBar, bar]} />
        <View style={k.sysText}>
          <Text style={[k.sysLabel, selected && k.sysLabelActive]}>{label}</Text>
          {caption ? <Text style={k.sysCaption}>{caption}</Text> : null}
        </View>
        {code ? <Text style={[k.sysCode, selected && k.sysCodeActive]}>{code}</Text> : null}
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={selected ? AG.red : 'rgba(255,255,255,0.22)'}
        />
      </Animated.View>
    </Pressable>
  );
}

// Tek satırlık, kompakt seçim (yüzey rengi, ray tipi gibi çok seçenekli
// gruplar için). SystemRow'un yatay kardeşi.
export function SpecPill({
  label,
  selected,
  onPress,
  testID,
  style,
  labelStyle,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const sel = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    sel.value = reduced ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 16, stiffness: 240, mass: 0.6 });
  }, [selected, reduced, sel]);
  const shell = useAnimatedStyle(() => ({
    backgroundColor: sel.value > 0.5 ? AG.red : AG.well,
    borderColor: sel.value > 0.5 ? AG.red : AG.line,
  }));
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={style}
    >
      <Animated.View style={[k.pill, shell]}>
        <Text style={[k.pillText, selected && k.pillTextActive, labelStyle]} numberOfLines={2}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const k = themedStyles(() =>
  StyleSheet.create({
    // --- ölçü alanı ---
    field: {
      flex: 1,
      borderRadius: AGS.radiusSm,
      borderWidth: 1,
      paddingHorizontal: 13,
      paddingTop: 11,
      paddingBottom: 0,
      minHeight: 96,
      overflow: 'hidden',
    },
    fieldCompact: { minHeight: 86, paddingTop: 9 },
    fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    fieldHeadText: { flex: 1 },
    fieldLabel: { color: AG.chalk, fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
    fieldOptional: { color: AG.graphiteDim, fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    unitChip: {
      flexShrink: 0,
      marginBottom: 6,
      backgroundColor: 'rgba(182,18,49,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(182,18,49,0.4)',
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      minWidth: 24,
      alignItems: 'center',
    },
    fieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
    fieldInput: {
      flex: 1,
      // Web'de <input> icsel genisliginin altina inemiyor; minWidth:0 olmadan
      // birim rozeti kutunun disina tasip goruunmez oluyordu.
      minWidth: 0,
      color: AG.chalk,
      fontSize: 25,
      fontWeight: '800',
      letterSpacing: -0.5,
      paddingVertical: Platform.OS === 'ios' ? 6 : 3,
      paddingHorizontal: 0,
      fontVariant: ['tabular-nums'],
      ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
    },
    fieldInputCompact: { fontSize: 21 },
    fieldUnit: { color: AG.redLift, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.4 },
    fieldHint: { color: AG.graphiteDim, fontSize: 10.5, lineHeight: 14, marginTop: 5, marginBottom: 7 },
    ruleTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 2 },
    rule: { height: 2, backgroundColor: AG.red, transformOrigin: 'left' },

    // --- föy paneli ---
    sheet: {
      backgroundColor: AG.paper,
      borderRadius: AGS.radius,
      borderWidth: 1,
      borderColor: AG.lineSoft,
      padding: AGS.blockPad,
      marginBottom: AGS.blockGap,
    },
    sheetAccent: { borderColor: 'rgba(182,18,49,0.38)', backgroundColor: '#17131A' },
    sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    sheetIndex: {
      color: AG.redLift,
      fontSize: 11,
      fontWeight: '900',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.4,
      paddingTop: 3,
      minWidth: 18,
    },
    sheetTitle: { color: AG.chalk, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
    sheetNote: { color: AG.graphite, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
    sheetStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
      maxWidth: 120,
    },
    sheetStatusDone: { backgroundColor: AG.red },
    sheetStatusText: { color: AG.graphite, fontSize: 10.5, fontWeight: '800' },
    sheetStatusTextDone: { color: '#fff' },
    sheetBody: { marginTop: 14 },

    // --- sistem satırı ---
    sysRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1,
      borderRadius: AGS.radiusSm,
      paddingRight: 12,
      paddingLeft: 0,
      paddingVertical: 11,
      marginBottom: 9,
      overflow: 'hidden',
      minHeight: 50,
    },
    sysBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
    sysText: { flex: 1, paddingLeft: 3 },
    sysLabel: { color: AG.graphite, fontSize: 12.5, fontWeight: '800', lineHeight: 17 },
    sysLabelActive: { color: AG.chalk },
    sysCaption: { color: AG.graphiteDim, fontSize: 10.5, lineHeight: 14, marginTop: 2 },
    sysCode: { color: AG.graphiteDim, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
    sysCodeActive: { color: AG.redLift },

    // --- kompakt seçim ---
    pill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 9,
      minHeight: 40,
      justifyContent: 'center',
    },
    pillText: { color: AG.graphite, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    pillTextActive: { color: '#fff', fontWeight: '800' },
  })
);

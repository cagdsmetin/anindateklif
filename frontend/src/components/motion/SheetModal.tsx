import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/lib/theme';
import { alpha, themedStyles } from './paint';

// ============================================================================
// Alt sayfa (bottom sheet) -- uygulamadaki tüm seçim pencerelerinin ortak
// kabuğu. Eskiden her modal düz bir beyaz dikdörtgen + kalın başlıktı;
// kullanıcı "çok basit düz duruyor" dedi. Buradaki kabuk:
//
//   * Arka planı bulanıklaştırır (expo-blur) -- seçim penceresi sayfanın
//     üstünde "yüzer", sayfayı örtmez.
//   * Yaylanarak girer, aşağı kayarak çıkar; azaltılmış hareket tercihinde
//     sadece belirir.
//   * Üstte tutamak (grabber) + künye satırı; içerik kaydırılabilir ve
//     klavye/çentik güvenli alanına saygı duyar.
//
// Satırlar için SheetRow / SheetPick kullanılır.
// ============================================================================

export function SheetModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  /** İçeriği kaydırılabilir yap (uzun listeler). */
  scroll = false,
  maxHeightPct = 0.86,
  accent,
  footer,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  maxHeightPct?: number;
  accent?: string;
  footer?: React.ReactNode;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const tint = accent || theme.colors.primary;

  const body = (
    <View style={s.sheetInner}>
      {/* tutamak */}
      <View style={s.grabberWrap}>
        <View style={s.grabber} />
      </View>

      {title ? (
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={s.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={s.closeBtn}
            testID={testID ? `${testID}-close` : undefined}
          >
            <Ionicons name="close" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* başlık altındaki ince vurgu çizgisi -- soldan sağa söner */}
      {title ? (
        <LinearGradient
          colors={[alpha(tint, 0.55), alpha(tint, 0)] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.headRule}
        />
      ) : null}

      {scroll ? (
        <ScrollView
          style={{ flexGrow: 0 }}
          contentContainerStyle={s.scrollBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={s.body}>{children}</View>
      )}

      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root} testID={testID}>
        <Animated.View
          style={StyleSheet.absoluteFill}
          entering={reduced ? undefined : FadeIn.duration(180)}
          exiting={reduced ? undefined : FadeOut.duration(140)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat">
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, s.scrimWeb]} />
            ) : (
              <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill}>
                <View style={[StyleSheet.absoluteFill, s.scrim]} />
              </BlurView>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[s.sheet, { maxHeight: `${Math.round(maxHeightPct * 100)}%` }]}
          entering={reduced ? undefined : SlideInDown.springify().damping(22).stiffness(210).mass(0.75)}
          exiting={reduced ? undefined : SlideOutDown.duration(180)}
        >
          {body}
        </Animated.View>
      </View>
    </Modal>
  );
}

// Seçim satırı: ikon plakası + başlık + açıklama + ok. Basınca hafifçe
// içeri çöker ve ikon plakası markanın rengiyle dolar.
export function SheetRow({
  icon,
  title,
  desc,
  onPress,
  color,
  trailing,
  testID,
  disabled,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc?: string;
  onPress: () => void;
  color?: string;
  trailing?: React.ReactNode;
  testID?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const press = useSharedValue(0);
  const tint = color || theme.colors.primary;

  const shell = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.015 }],
    backgroundColor:
      press.value > 0.5 ? alpha(tint, 0.1) : theme.colors.surfaceSoft,
    borderColor: press.value > 0.5 ? alpha(tint, 0.45) : theme.colors.line,
  }));

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={() => {
        if (!reduced) press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        if (!reduced) press.value = withSpring(0, { damping: 15, stiffness: 240 });
      }}
      style={style}
    >
      <Animated.View style={[s.row, shell, disabled && { opacity: 0.45 }]}>
        <LinearGradient
          colors={[alpha(tint, 0.22), alpha(tint, 0.07)] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.rowIcon, { borderColor: alpha(tint, 0.3) }]}
        >
          <Ionicons name={icon} size={19} color={tint} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={2}>
            {title}
          </Text>
          {desc ? (
            <Text style={s.rowDesc} numberOfLines={2}>
              {desc}
            </Text>
          ) : null}
        </View>
        {trailing !== undefined ? trailing : <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
      </Animated.View>
    </Pressable>
  );
}

// Liste seçimi satırı (katalog, müşteri, sistem tipi...). Sol tarafta
// seçili durumu gösteren nokta, sağda değer/ok.
export function SheetPick({
  title,
  meta,
  badge,
  selected,
  onPress,
  right,
  testID,
}: {
  title: string;
  meta?: string;
  badge?: string;
  selected?: boolean;
  onPress: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const press = useSharedValue(0);
  const shell = useAnimatedStyle(() => ({
    backgroundColor: press.value > 0.5 ? theme.colors.primarySoft : 'transparent',
  }));
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 15, stiffness: 240 });
      }}
    >
      <Animated.View style={[s.pick, shell]}>
        <View style={[s.pickDot, selected && s.pickDotOn]} />
        <View style={{ flex: 1 }}>
          {badge ? <Text style={s.pickBadge}>{badge}</Text> : null}
          <Text style={s.pickTitle} numberOfLines={2}>
            {title}
          </Text>
          {meta ? (
            <Text style={s.pickMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {right !== undefined ? right : <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
      </Animated.View>
    </Pressable>
  );
}

// Boş durum: yönlendiren bir cümle, süs değil.
export function SheetEmpty({ icon = 'file-tray-outline', text, action }: { icon?: keyof typeof Ionicons.glyphMap; text: string; action?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={22} color={theme.colors.textMuted} />
      </View>
      <Text style={s.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: 'rgba(8,11,20,0.42)' },
    scrimWeb: { backgroundColor: 'rgba(8,11,20,0.58)', backdropFilter: 'blur(10px)' } as any,
    sheet: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.colors.line,
      overflow: 'hidden',
      boxShadow: '0 -18px 50px rgba(2,6,23,0.35)',
    },
    sheetInner: { paddingBottom: Platform.OS === 'ios' ? 26 : 14 },
    grabberWrap: { alignItems: 'center', paddingTop: 9, paddingBottom: 4 },
    grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.lineDark },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 4 },
    title: { fontSize: 16.5, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
    subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3, lineHeight: 17 },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headRule: { height: 2, marginTop: 10, marginHorizontal: 16, borderRadius: 1 },
    body: { paddingHorizontal: 12, paddingTop: 10 },
    scrollBody: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
    footer: { paddingHorizontal: 18, paddingTop: 10 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 13,
      paddingHorizontal: 13,
      marginBottom: 9,
      minHeight: 64,
    },
    rowIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { fontSize: 14.5, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.1 },
    rowDesc: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },

    pick: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 11,
      marginBottom: 1,
      minHeight: 46,
    },
    pickDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.lineDark,
    },
    pickDotOn: { backgroundColor: theme.colors.primary },
    pickBadge: { fontSize: 9, color: theme.colors.primary, fontWeight: '900', letterSpacing: 0.5 },
    pickTitle: { fontSize: 13.5, fontWeight: '700', color: theme.colors.text },
    pickMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },

    empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 10 },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },
  })
);

export default SheetModal;

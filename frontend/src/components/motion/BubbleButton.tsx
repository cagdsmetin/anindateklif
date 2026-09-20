import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { alpha, mix } from './paint';

// "Balon" aksiyon butonu (21st.dev'deki parlayan/yaylanan buton kalıplarından
// uyarlandı): gradyan dolgu, içinde cam görünümlü ikon baloncuğu, üstünden
// periyodik geçen ışık huzmesi ve basınca yaylanan geri bildirim.
// variant="solid" ana eylem, "soft" ikincil, "dashed" ise "ekle/yükle" gibi
// boş alan eylemleri için.
export default function BubbleButton({
  icon,
  label,
  color,
  onPress,
  variant = 'solid',
  size = 'md',
  disabled,
  loading,
  style,
  labelStyle,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  variant?: 'solid' | 'soft' | 'dashed';
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const press = useSharedValue(0);
  const shine = useSharedValue(0);
  const solid = variant === 'solid';

  useEffect(() => {
    if (reduced || !solid) return;
    // Işık huzmesi: uzun aralıklarla bir kez geçer -- dikkat çeker, yormaz.
    shine.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(shine);
  }, [reduced, solid, shine]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.045 }] }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value < 0.35 ? 0.5 - shine.value : 0,
    transform: [{ translateX: -160 + shine.value * 520 }, { rotate: '18deg' }],
  }));

  const pad = size === 'lg' ? 16 : 12;
  const radius = 999;

  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 14, stiffness: 220 });
      }}
      style={style}
    >
      <Animated.View
        style={[
          s.shell,
          {
            borderRadius: radius,
            paddingVertical: pad,
            paddingHorizontal: pad + 2,
            backgroundColor: solid ? color : variant === 'soft' ? alpha(color, 0.12) : alpha(color, 0.07),
            borderWidth: variant === 'dashed' ? 1.5 : variant === 'soft' ? 1 : 0,
            borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
            borderColor: alpha(color, variant === 'dashed' ? 0.5 : 0.28),
            // Animated.View'a verilen stilde boxShadow undefined bırakılamaz
            // (Reanimated web tarafı çöküyor) -- yerine şeffaf bir gölge yazılır.
            boxShadow: solid ? `0 10px 24px ${alpha(color, 0.4)}` : '0 0px 0px rgba(0,0,0,0)',
            opacity: disabled || loading ? 0.6 : 1,
          },
          pressStyle,
        ]}
      >
        {solid ? (
          <LinearGradient
            colors={[mix(color, '#ffffff', 0.22), color, mix(color, '#000000', 0.12)] as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          />
        ) : null}
        {solid && !reduced ? (
          <Animated.View pointerEvents="none" style={[s.shine, shineStyle]} />
        ) : null}
        {loading ? (
          <ActivityIndicator color={solid ? '#fff' : color} />
        ) : (
          <>
            <View style={[s.iconBubble, { backgroundColor: solid ? 'rgba(255,255,255,0.22)' : alpha(color, 0.16) }]}>
              <Ionicons name={icon} size={16} color={solid ? '#fff' : color} />
            </View>
            <Text style={[s.label, { color: solid ? '#fff' : color }, labelStyle]} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  shell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  shine: { position: 'absolute', top: -40, bottom: -40, width: 60, backgroundColor: 'rgba(255,255,255,0.55)' },
  iconBubble: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '900', letterSpacing: 0.2, flexShrink: 1 },
});

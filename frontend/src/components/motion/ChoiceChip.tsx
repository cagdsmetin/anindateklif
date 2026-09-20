import React, { useEffect } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme } from '@/src/lib/theme';
import { alpha } from './paint';

// Seçilebilir "hap" (pill) -- seçili duruma yaylanarak geçer, rengi yumuşak
// bir geçişle dolar, basınca hafifçe küçülür. Para birimi/nakliye/kategori
// gibi tek seçimli gruplar için (21st.dev'deki Radio Group / Toggle
// kalıplarının React Native karşılığı).
export default function ChoiceChip({
  label,
  selected,
  onPress,
  color = theme.colors.primary,
  style,
  labelStyle,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const sel = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    sel.value = reduced
      ? selected
        ? 1
        : 0
      : withSpring(selected ? 1 : 0, { damping: 15, stiffness: 220, mass: 0.6 });
  }, [selected, reduced, sel]);

  const scale = useDerivedValue(() => (1 + sel.value * 0.03) * (1 - press.value * 0.05));

  const shell = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sel.value, [0, 1], [theme.colors.surface, color]),
    borderColor: interpolateColor(sel.value, [0, 1], [theme.colors.lineDark, color]),
    transform: [{ scale: scale.value }],
    // Not: animasyonlu stilde boxShadow HER ZAMAN geçerli bir dize olmalı --
    // undefined bırakılırsa Reanimated'ın web tarafı çöküyor.
    boxShadow: sel.value > 0.5 ? `0 6px 14px ${alpha(color, 0.35)}` : '0 0px 0px rgba(0,0,0,0)',
  }));
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [theme.colors.textMuted, '#ffffff']),
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
      style={style}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <Animated.View style={[s.shell, shell]}>
        <Animated.Text style={[s.label, text, labelStyle]} numberOfLines={1} allowFontScaling={false}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  shell: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  label: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
});

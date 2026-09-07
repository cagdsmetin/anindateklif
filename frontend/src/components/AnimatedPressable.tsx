import React, { useRef } from 'react';
import { Animated, GestureResponderEvent, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Basılı tutulduğunda küçüleceği ölçek -- 1'e yakın = ince/hafif his. */
  scaleTo?: number;
  /** Native'de dokunmatik geri bildirim (web'de otomatik atlanır). */
  haptic?: boolean;
}

// Genel amaçlı, yay (spring) animasyonlu buton sarmalayıcı -- basınca
// hafifçe küçülüp bırakınca geri sekerek büyür. FloatingTabBar'daki aynı
// dokunma hissini uygulamanın diğer öne çıkan CTA'larında da tekrar
// kullanmak için (bkz. kullanıcı isteği: "diğer arayüzlerde de bu tarz
// animasyonları kullanmak istiyorum").
export default function AnimatedPressable({
  children,
  style,
  scaleTo = 0.96,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
    onPressOut?.(e);
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (haptic && Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress?.(e);
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

import React, { useRef } from 'react';
import { Animated, GestureResponderEvent, Platform, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

// Flex-layout ile ilgili özellikler -- bunlar dıştaki Pressable'a taşınmalı,
// çünkü flex-wrap'li bir grid'in (ör. Panel'deki Modüller grid'i) genişlik
// hesaplaması ancak GERÇEK flex child'da (Pressable) doğru çalışır. Bunlar
// içteki Animated.View'da kalırsa (width: '31%' gibi) o child'ın kendisi flex
// item olmadığından yüzde hesaplaması content-size'a çöker (bkz. Modüller
// grid'inin tek satıra sıkışıp etiketlerin kısalması bugu).
const LAYOUT_KEYS = [
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'flex', 'flexBasis', 'flexGrow', 'flexShrink', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right',
] as const;

function splitLayoutStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const layout: any = {};
  const rest: any = {};
  for (const key of Object.keys(flat)) {
    if ((LAYOUT_KEYS as readonly string[]).includes(key)) {
      layout[key] = (flat as any)[key];
    } else {
      rest[key] = (flat as any)[key];
    }
  }
  return [layout, rest];
}

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

  const [layoutStyle, restStyle] = splitLayoutStyle(style);

  return (
    <Pressable style={layoutStyle} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress} {...rest}>
      <Animated.View style={[restStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

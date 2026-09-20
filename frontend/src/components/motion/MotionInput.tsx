import React, { forwardRef, useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from '@/src/lib/theme';
import { alpha } from './paint';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Uygulamanın her yerindeki TextInput'un birebir yerine geçer: odaklanınca
// kenarlığı markanın rengine döner ve etrafında yumuşak bir ışık belirir,
// odak çıkınca geri söner. Kenarlığı olmayan alanlarda (ör. arama kutusunun
// içindeki input) hiçbir görsel fark oluşturmaz -- güvenli bir yükseltme.
const MotionInput = forwardRef<TextInput, TextInputProps>(function MotionInput(
  { style, onFocus, onBlur, ...rest },
  ref
) {
  const focus = useSharedValue(0);
  const [focused, setFocused] = useState(false);

  const aStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [theme.colors.line, theme.colors.primary]),
  }));

  return (
    <AnimatedTextInput
      ref={ref as any}
      {...rest}
      style={[style, aStyle, focused ? { boxShadow: `0 0 0 3px ${alpha(theme.colors.primary, 0.14)}` } : null]}
      onFocus={(e) => {
        focus.value = withTiming(1, { duration: 180 });
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focus.value = withTiming(0, { duration: 220 });
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
});

export default MotionInput;

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { theme } from '@/src/lib/theme';

// WhatsApp Web tarzı: okunmamış Ekip Sohbeti mesajı olduğu sürece sol
// menüdeki ilgili öğenin yanında yanıp sönen küçük bir kırmızı nokta.
export default function BlinkingDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.15, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[s.dot, { opacity: pulse }]} />;
}

const s = StyleSheet.create({
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: theme.colors.red,
    marginLeft: 6,
  },
});

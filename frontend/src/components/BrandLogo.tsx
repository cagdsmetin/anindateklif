import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authTheme } from '@/src/lib/auth-theme';

/**
 * Brand mark — gold circular check for the "Anında Teklif" auth screens.
 */
export function BrandLogo({ size = 88 }: { size?: number }) {
  const ring = size;
  const inner = size * 0.86;
  const iconSize = size * 0.56;
  return (
    <View style={[s.wrap, { width: ring, height: ring }]}>
      <View
        style={[
          s.ring,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: Math.max(3, size * 0.06),
          },
        ]}
      >
        <View
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="checkmark" size={iconSize} color={authTheme.goldLight} style={s.check} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: authTheme.gold,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  ring: {
    borderColor: authTheme.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  check: {
    // Slightly nudged to appear centered in the ring visually.
    marginTop: -2,
    textShadowColor: authTheme.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});

import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { theme } from '@/src/lib/theme';

// Her sekmenin ikonu ve aktifken alacağı renk -- (tabs)/_layout.tsx'teki
// Tabs.Screen tanımlarıyla birebir aynı eşleşme (bkz. tabIcon() ve
// theme.colors.modules). route.name üzerinden eşleniyor.
const TAB_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  index: { icon: 'grid', color: theme.colors.primary },
  teklif: { icon: 'create', color: theme.colors.modules.teklif },
  history: { icon: 'time', color: theme.colors.modules.gecmis },
  customers: { icon: 'people', color: theme.colors.modules.musteri },
  services: { icon: 'construct', color: theme.colors.modules.servis },
  reminders: { icon: 'notifications', color: theme.colors.modules.hatirlatma },
  kasa: { icon: 'wallet', color: theme.colors.modules.kasa },
  tahsilat: { icon: 'cash', color: theme.colors.modules.tahsilat },
  company: { icon: 'business', color: theme.colors.modules.firma },
};

function TabItem({
  meta,
  focused,
  onPress,
}: {
  meta: { icon: keyof typeof Ionicons.glyphMap; color: string };
  focused: boolean;
  onPress: () => void;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      damping: 14,
      stiffness: 180,
      mass: 0.6,
    }).start();
  }, [focused, focusAnim]);

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.82, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  };
  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  const iconLift = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const glowScale = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const topBarWidth = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={s.item}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      {/* Aktifken ikonun üstünde beliren ince parlayan çubuk */}
      <Animated.View
        style={[s.topGlowBar, { backgroundColor: meta.color, width: topBarWidth, opacity: focusAnim }]}
      />
      {/* İkonun arkasında yumuşak, bulanık gibi hissettiren dairesel parıltı */}
      <Animated.View
        style={[
          s.glowCircle,
          { backgroundColor: meta.color, opacity: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }), transform: [{ scale: glowScale }] },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: pressScale }, { translateY: iconLift }] }}>
        <Ionicons
          name={(focused ? meta.icon : (`${meta.icon}-outline` as any)) as any}
          size={19}
          color={focused ? meta.color : 'rgba(255,255,255,0.5)'}
        />
      </Animated.View>
    </Pressable>
  );
}

// Referans: yüzen, siyah/lacivert haplı (pill) alt navigasyon barı -- aktif
// sekme ikonu yumuşak bir parıltıyla öne çıkar, geçişler yay (spring)
// animasyonuyla akıcı olur. Mevcut 9 sekmenin tamamı korunur, sadece kabuk
// ve etkileşim biçimi değişir (bkz. AskUserQuestion kararı: "Tüm ikonları
// koru, sadece stili değiştir").
export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    return opts?.tabBarItemStyle?.display !== 'none';
  });

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={s.bar}>
        {visibleRoutes.map((route) => {
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const focused = state.index === routeIndex;
          const meta = TAB_META[route.name] || { icon: 'ellipse' as const, color: theme.colors.primary };

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return <TabItem key={route.key} meta={meta} focused={focused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surfaceSoft,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.navyDark,
    borderRadius: 999,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...Platform.select({
      web: { boxShadow: '0 10px 26px rgba(15,23,42,0.28)' } as any,
      ios: { shadowColor: '#0F172A', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
      android: { elevation: 8 },
    }),
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40 },
  topGlowBar: {
    position: 'absolute',
    top: -8,
    height: 3,
    borderRadius: 2,
  },
  glowCircle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
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

const BUBBLE_SIZE = 34;

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

  const iconLift = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={s.item}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Animated.View style={{ transform: [{ scale: pressScale }, { translateY: iconLift }] }}>
        <Ionicons
          name={(focused ? meta.icon : (`${meta.icon}-outline` as any)) as any}
          size={19}
          color={focused ? '#fff' : 'rgba(255,255,255,0.5)'}
        />
      </Animated.View>
    </Pressable>
  );
}

// Referans: "Navigation Tabs V2" örneğindeki kayan baloncuk (bubble) geçişi
// -- aktif sekme değişince renkli bir daire, önceki ikondan yeni ikonun
// altına yay (spring) animasyonuyla kayarak/hafifçe zıplayarak gider. Kendi
// yüzen siyah pilimizin arka planında tek bir paylaşılan daire öğesi olarak
// render edilip yatayda konum değiştiriyor (icon'ların kendi başına
// fade/scale yapmasından farklı olarak gerçek bir "kayma" hissi verir).
export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const bubbleX = useRef(new Animated.Value(0)).current;
  const bubbleScale = useRef(new Animated.Value(1)).current;

  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    return opts?.tabBarItemStyle?.display !== 'none';
  });

  // -1 olabilir: kullanıcı drawer'dan alt barda olmayan bir ekrandaysa
  // (ör. Takvim, Ekip Sohbeti) hiçbir sekme "aktif" görünmemeli, baloncuk
  // gizlenir -- eskiden de bu ekranlarda hiçbir ikon vurgulanmıyordu.
  const activeVisibleIndex = visibleRoutes.findIndex(
    (r) => state.routes.findIndex((rr) => rr.key === r.key) === state.index,
  );
  const activeMeta =
    activeVisibleIndex >= 0
      ? TAB_META[visibleRoutes[activeVisibleIndex].name] || { icon: 'ellipse' as const, color: theme.colors.primary }
      : null;

  const [renderColor, setRenderColor] = useState(activeMeta?.color || theme.colors.primary);
  const bubbleOpacity = useRef(new Animated.Value(activeVisibleIndex >= 0 ? 1 : 0)).current;

  useEffect(() => {
    if (!barWidth || visibleRoutes.length === 0) return;

    Animated.timing(bubbleOpacity, { toValue: activeVisibleIndex >= 0 ? 1 : 0, duration: 150, useNativeDriver: true }).start();
    if (activeVisibleIndex < 0 || !activeMeta) return;

    const itemWidth = barWidth / visibleRoutes.length;
    const targetX = itemWidth * activeVisibleIndex + itemWidth / 2 - BUBBLE_SIZE / 2;

    Animated.spring(bubbleX, {
      toValue: targetX,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
      mass: 0.7,
    }).start();

    // Kayış sırasında hafif bir "pop" -- büyüyüp normale dönerek canlı bir his verir.
    setRenderColor(activeMeta.color);
    bubbleScale.setValue(0.7);
    Animated.spring(bubbleScale, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 200 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVisibleIndex, barWidth, visibleRoutes.length]);

  const onBarLayout = (e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={s.bar} onLayout={onBarLayout}>
        {barWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.bubble,
              {
                backgroundColor: renderColor,
                opacity: bubbleOpacity,
                transform: [{ translateX: bubbleX }, { scale: bubbleScale }],
              },
            ]}
          />
        )}
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
  bubble: {
    position: 'absolute',
    top: 11,
    left: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    ...Platform.select({
      web: { boxShadow: '0 6px 16px rgba(0,0,0,0.35)' } as any,
      ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
    }),
  },
});

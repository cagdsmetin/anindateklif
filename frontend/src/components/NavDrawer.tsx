import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { buildNavItems, isNavItemActive, navItemRoute } from '@/src/lib/navItems';
import { useAuth } from '@/src/state/AuthContext';

// Mobile counterpart to the desktop left sidebar (app/(tabs)/_layout.tsx) —
// same destinations, same colors, opened from the hamburger button in
// TopHeader and slid in from the left over the current screen. The bottom
// tab bar keeps working exactly as before; this is just an extra way in
// to reach modules that don't fit in the bottom bar (Kasa, Tahsilat, ...).
export default function NavDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const items = buildNavItems({
    restricted: !!user?.is_staff && user?.staff_role !== 'admin',
    isOwner: !user?.is_staff,
  });

  const go = (route: string) => {
    onClose();
    router.push(route as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={[s.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={s.brandRow}>
            <TouchableOpacity style={s.brand} onPress={() => go('/(tabs)')} testID="drawer-brand">
              <View style={s.brandIcon}>
                <Ionicons name="flash" size={16} color="#fff" />
              </View>
              <Text style={s.brandText} numberOfLines={1}>Anında Teklif</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} testID="drawer-close-btn" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={theme.colors.textOnDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.navList} showsVerticalScrollIndicator={false}>
            {items.map((it) => {
              const active = isNavItemActive(it, pathname);
              return (
                <TouchableOpacity
                  key={it.name}
                  style={[s.navItem, active && { backgroundColor: it.color }]}
                  onPress={() => go(navItemRoute(it))}
                  testID={`drawer-${it.name}`}
                >
                  <Ionicons name={(active ? it.icon : `${it.icon}-outline`) as any} size={19} color={active ? '#fff' : theme.colors.textOnDark} />
                  <Text style={[s.navText, active && s.navTextActive]} numberOfLines={1}>{it.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} testID="drawer-overlay" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  panel: { width: 250, backgroundColor: theme.colors.navyDark, paddingHorizontal: 14, ...theme.shadow.lg },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingBottom: 18, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#fff', fontSize: 14, fontWeight: '900', flexShrink: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  navList: { flex: 1 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  navText: { fontSize: 14, fontWeight: '700', color: theme.colors.textOnDark },
  navTextActive: { color: '#fff', fontWeight: '900' },
});

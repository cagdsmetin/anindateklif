import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { buildNavItems, isNavItemActive, navItemRoute } from '@/src/lib/navItems';
import { useOrderedNames } from '@/src/lib/orderPrefs';
import { useAuth } from '@/src/state/AuthContext';
import { useApp } from '@/src/state/AppContext';
import BlinkingDot from '@/src/components/BlinkingDot';

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
  const { teamUnreadTotal } = useApp();
  const items = buildNavItems({
    restricted: !!user?.is_staff && user?.staff_role !== 'admin',
    isOwner: !user?.is_staff,
    isAdmin: (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com',
  });
  const [reordering, setReordering] = useState(false);
  const { applyOrder, moveUp, moveDown } = useOrderedNames(
    'sidebarOrder_v1',
    items.map((it) => it.name)
  );
  const orderedItems = applyOrder(items);

  // Navigating no longer auto-closes the drawer -- it stays open (like a
  // persistent side menu) across page changes. The user only closes it
  // explicitly via the X button, tapping the overlay, or the hardware
  // back button (onRequestClose), then reopens it with the hamburger.
  const go = (route: string) => {
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
            <TouchableOpacity
              style={[s.reorderToggle, reordering && s.reorderToggleActive]}
              onPress={() => setReordering((v) => !v)}
              testID="drawer-reorder-toggle"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="swap-vertical" size={16} color={reordering ? '#fff' : theme.colors.textOnDark} />
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} testID="drawer-close-btn" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={theme.colors.textOnDark} />
            </TouchableOpacity>
          </View>
          {reordering && (
            <Text style={s.reorderHint}>Oklarla menü sırasını istediğin gibi değiştirebilirsin.</Text>
          )}
          <ScrollView style={s.navList} showsVerticalScrollIndicator={false}>
            {orderedItems.map((it, idx) => {
              const active = isNavItemActive(it, pathname);
              return (
                <View key={it.name} style={s.navItemRow}>
                  <TouchableOpacity
                    style={[s.navItem, { flex: 1 }, active && { backgroundColor: it.color }]}
                    onPress={() => (reordering ? undefined : go(navItemRoute(it)))}
                    disabled={reordering}
                    testID={`drawer-${it.name}`}
                  >
                    <Ionicons name={(active ? it.icon : `${it.icon}-outline`) as any} size={19} color={active ? '#fff' : theme.colors.textOnDark} />
                    <Text style={[s.navText, active && s.navTextActive]} numberOfLines={1}>{it.title}</Text>
                    {it.name === 'team-chat' && teamUnreadTotal > 0 ? <BlinkingDot /> : null}
                  </TouchableOpacity>
                  {reordering && (
                    <View style={s.reorderArrows}>
                      <TouchableOpacity
                        style={[s.reorderArrowBtn, idx === 0 && s.reorderArrowBtnDisabled]}
                        disabled={idx === 0}
                        onPress={() => moveUp(it.name)}
                        testID={`drawer-move-up-${it.name}`}
                      >
                        <Ionicons name="chevron-up" size={16} color={theme.colors.textOnDark} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.reorderArrowBtn, idx === orderedItems.length - 1 && s.reorderArrowBtnDisabled]}
                        disabled={idx === orderedItems.length - 1}
                        onPress={() => moveDown(it.name)}
                        testID={`drawer-move-down-${it.name}`}
                      >
                        <Ionicons name="chevron-down" size={16} color={theme.colors.textOnDark} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
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
  reorderToggle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  reorderToggleActive: { backgroundColor: theme.colors.primary },
  reorderHint: { fontSize: 11, color: theme.colors.textOnDark, opacity: 0.75, paddingHorizontal: 6, marginBottom: 8, lineHeight: 15 },
  navList: { flex: 1 },
  navItemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  navText: { fontSize: 14, fontWeight: '700', color: theme.colors.textOnDark },
  navTextActive: { color: '#fff', fontWeight: '900' },
  reorderArrows: { flexDirection: 'column', marginBottom: 4 },
  reorderArrowBtn: { width: 24, height: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 1 },
  reorderArrowBtnDisabled: { opacity: 0.3 },
});

import { useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { buildNavItems, isNavItemActive, navItemRoute, NavItem } from '@/src/lib/navItems';
import { useOrderedNames } from '@/src/lib/orderPrefs';
import { useAuth } from '@/src/state/AuthContext';
import { useApp } from '@/src/state/AppContext';
import BlinkingDot from '@/src/components/BlinkingDot';

function tabIcon(name: string, color: string) {
  return ({ focused }: { focused: boolean }) => (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? color : 'transparent',
      }}
    >
      <Ionicons name={(focused ? name : `${name}-outline`) as any} size={19} color={focused ? '#fff' : theme.colors.textOnDark} />
    </View>
  );
}

// Sidebar shown instead of the bottom tab bar on wide desktop web windows —
// same destinations, same colors, just laid out as a left rail like a
// typical desktop dashboard instead of a phone-style bottom bar. The same
// item list also powers the mobile slide-in drawer (src/components/NavDrawer.tsx).
function Sidebar({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { teamUnreadTotal } = useApp();
  const { signOut } = useAuth();
  const [reordering, setReordering] = useState(false);
  const { applyOrder, moveUp, moveDown } = useOrderedNames(
    'sidebarOrder_v1',
    items.map((it) => it.name)
  );
  const orderedItems = applyOrder(items);

  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Çıkış yapmak istediğinize emin misiniz?')) signOut();
      return;
    }
    Alert.alert('Çıkış Yap', 'Çıkış yapmak istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={sb.container}>
      <View style={sb.brandRow}>
        <TouchableOpacity style={sb.brand} onPress={() => router.push('/(tabs)')} testID="sidebar-brand">
          <View style={sb.brandIcon}>
            <Ionicons name="flash" size={16} color="#fff" />
          </View>
          <Text style={sb.brandText} numberOfLines={1}>Anında Teklif</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sb.reorderToggle, reordering && sb.reorderToggleActive]}
          onPress={() => setReordering((v) => !v)}
          testID="sidebar-reorder-toggle"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="swap-vertical" size={16} color={reordering ? '#fff' : theme.colors.textOnDark} />
        </TouchableOpacity>
      </View>
      {reordering && (
        <Text style={sb.reorderHint}>Oklarla menü sırasını istediğin gibi değiştirebilirsin.</Text>
      )}
      <ScrollView style={sb.navList} showsVerticalScrollIndicator={false}>
        {orderedItems.map((it, idx) => {
          const active = isNavItemActive(it, pathname);
          return (
            <View key={it.name} style={sb.navItemRow}>
              <TouchableOpacity
                style={[sb.navItem, { flex: 1 }, active && { backgroundColor: it.color }]}
                onPress={() => (reordering ? undefined : router.push(navItemRoute(it) as any))}
                disabled={reordering}
                testID={`sidebar-${it.name}`}
              >
                <Ionicons name={(active ? it.icon : `${it.icon}-outline`) as any} size={18} color={active ? '#fff' : theme.colors.textOnDark} />
                <Text style={[sb.navText, active && sb.navTextActive]} numberOfLines={1}>{it.title}</Text>
                {it.name === 'team-chat' && teamUnreadTotal > 0 ? <BlinkingDot /> : null}
              </TouchableOpacity>
              {reordering && (
                <View style={sb.reorderArrows}>
                  <TouchableOpacity
                    style={[sb.reorderArrowBtn, idx === 0 && sb.reorderArrowBtnDisabled]}
                    disabled={idx === 0}
                    onPress={() => moveUp(it.name)}
                    testID={`sidebar-move-up-${it.name}`}
                  >
                    <Ionicons name="chevron-up" size={16} color={theme.colors.textOnDark} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[sb.reorderArrowBtn, idx === orderedItems.length - 1 && sb.reorderArrowBtnDisabled]}
                    disabled={idx === orderedItems.length - 1}
                    onPress={() => moveDown(it.name)}
                    testID={`sidebar-move-down-${it.name}`}
                  >
                    <Ionicons name="chevron-down" size={16} color={theme.colors.textOnDark} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={sb.signoutItem} onPress={confirmSignOut} testID="sidebar-signout">
        <Ionicons name="log-out-outline" size={18} color={theme.colors.red} />
        <Text style={sb.signoutText} numberOfLines={1}>Çıkış Yap</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = theme.colors.modules;
  // "Desktop" here means a wide web browser window (not the phone-sized
  // web view) — swap the bottom tab bar for a left sidebar, the way most
  // desktop business dashboards are laid out.
  const isDesktopWeb = Platform.OS === 'web' && width >= 900;
  const { user } = useAuth();
  const restricted = !!user?.is_staff && user?.staff_role !== 'admin';
  const isOwner = !user?.is_staff;
  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  const navItems: NavItem[] = buildNavItems({ restricted, isOwner, isAdmin });

  const tabs = (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktopWeb
          ? { display: 'none' }
          : {
              height: 52 + insets.bottom,
              paddingTop: 8,
              paddingBottom: insets.bottom + 6,
              borderTopWidth: 0,
              backgroundColor: theme.colors.navyDark,
              elevation: 8,
            },
        tabBarShowLabel: false,
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Panel', tabBarIcon: tabIcon('grid', theme.colors.primary) }} />
      <Tabs.Screen name="teklif" options={{ title: 'Teklif', tabBarIcon: tabIcon('create', m.teklif) }} />
      <Tabs.Screen name="catalog" options={{ title: 'Katalog', tabBarIcon: tabIcon('library', m.katalog) }} />
      <Tabs.Screen name="history" options={{ title: 'Geçmiş', tabBarIcon: tabIcon('time', m.gecmis) }} />
      <Tabs.Screen name="customers" options={{ title: 'Müşteri', tabBarIcon: tabIcon('people', m.musteri) }} />
      <Tabs.Screen name="services" options={{ title: 'Servis', tabBarIcon: tabIcon('construct', m.servis) }} />
      <Tabs.Screen name="campaigns" options={{ title: 'Kampanya', tabBarIcon: tabIcon('megaphone', m.kampanya) }} />
      <Tabs.Screen name="reminders" options={{ title: 'Hatırlatmalar', tabBarIcon: tabIcon('notifications', m.hatirlatma) }} />
      <Tabs.Screen name="kasa" options={{ title: 'Kasa', tabBarIcon: tabIcon('wallet', m.kasa), href: restricted ? null : undefined }} />
      <Tabs.Screen name="tahsilat" options={{ title: 'Tahsilat', tabBarIcon: tabIcon('cash', m.tahsilat), href: restricted ? null : undefined }} />
      <Tabs.Screen name="company" options={{ title: 'Firma', tabBarIcon: tabIcon('business', m.firma) }} />
      {/* assistant/personel: kendi başlığı ve geri tuşu olan sayfalar -- bottom
          tab bar'da ikon olarak görünmesinler, ama artık (tabs) grubunun içinde
          oldukları için masaüstünde sol sidebar'la birlikte render edilirler. */}
      <Tabs.Screen name="assistant" options={{ href: null }} />
      <Tabs.Screen name="team-chat" options={{ href: null }} />
      <Tabs.Screen name="personel" options={{ href: null }} />
      <Tabs.Screen name="promo-admin" options={{ href: null }} />
      <Tabs.Screen name="lead-admin" options={{ href: null }} />
      <Tabs.Screen name="leads" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );

  if (!isDesktopWeb) return tabs;

  return (
    <View style={sb.desktopRow}>
      <Sidebar items={navItems} />
      <View style={sb.contentOuter}>
        <View style={sb.contentInner}>{tabs}</View>
      </View>
    </View>
  );
}

const sb = StyleSheet.create({
  desktopRow: { flex: 1, flexDirection: 'row' },
  container: { width: 232, backgroundColor: theme.colors.navyDark, paddingHorizontal: 12, paddingVertical: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 18, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#fff', fontSize: 14, fontWeight: '900', flexShrink: 1 },
  reorderToggle: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  reorderToggleActive: { backgroundColor: theme.colors.primary },
  reorderHint: { fontSize: 10.5, color: theme.colors.textOnDark, opacity: 0.75, paddingHorizontal: 8, marginBottom: 8, lineHeight: 14 },
  navList: { flex: 1 },
  navItemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  navText: { fontSize: 13, fontWeight: '700', color: theme.colors.textOnDark },
  navTextActive: { color: '#fff', fontWeight: '900' },
  reorderArrows: { flexDirection: 'column', marginBottom: 4 },
  reorderArrowBtn: { width: 22, height: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 1 },
  reorderArrowBtnDisabled: { opacity: 0.3 },
  signoutItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  signoutText: { fontSize: 13, fontWeight: '800', color: theme.colors.red },
  contentOuter: { flex: 1, backgroundColor: '#F5F7FA' },
  contentInner: { flex: 1, width: '100%' },
});

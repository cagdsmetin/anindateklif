import { Tabs, usePathname, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { buildNavItems, isNavItemActive, navItemRoute, NavItem } from '@/src/lib/navItems';

function tabIcon(name: string, color: string) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
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
      <Ionicons name={(focused ? name : `${name}-outline`) as any} size={size - 4} color={focused ? '#fff' : theme.colors.textOnDark} />
    </View>
  );
}

function tabLabel() {
  return ({ focused, children }: { focused: boolean; children: string }) => (
    <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0, color: focused ? '#fff' : theme.colors.textOnDark, marginTop: -2 }}>
      {children}
    </Text>
  );
}

// Sidebar shown instead of the bottom tab bar on wide desktop web windows —
// same destinations, same colors, just laid out as a left rail like a
// typical desktop dashboard instead of a phone-style bottom bar. The same
// item list also powers the mobile slide-in drawer (src/components/NavDrawer.tsx).
function Sidebar({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={sb.container}>
      <TouchableOpacity style={sb.brand} onPress={() => router.push('/(tabs)')} testID="sidebar-brand">
        <View style={sb.brandIcon}>
          <Ionicons name="flash" size={16} color="#fff" />
        </View>
        <Text style={sb.brandText} numberOfLines={1}>Anında Teklif</Text>
      </TouchableOpacity>
      <ScrollView style={sb.navList} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const active = isNavItemActive(it, pathname);
          return (
            <TouchableOpacity
              key={it.name}
              style={[sb.navItem, active && { backgroundColor: it.color }]}
              onPress={() => router.push(navItemRoute(it) as any)}
              testID={`sidebar-${it.name}`}
            >
              <Ionicons name={(active ? it.icon : `${it.icon}-outline`) as any} size={18} color={active ? '#fff' : theme.colors.textOnDark} />
              <Text style={[sb.navText, active && sb.navTextActive]} numberOfLines={1}>{it.title}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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

  const navItems: NavItem[] = buildNavItems();

  const tabs = (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktopWeb
          ? { display: 'none' }
          : {
              height: 60 + insets.bottom,
              paddingTop: 6,
              paddingBottom: insets.bottom + 6,
              borderTopWidth: 0,
              backgroundColor: theme.colors.navyDark,
              elevation: 8,
            },
        tabBarItemStyle: { paddingHorizontal: 1 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Panel', tabBarIcon: tabIcon('grid', theme.colors.primary), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="teklif" options={{ title: 'Teklif', tabBarIcon: tabIcon('create', m.teklif), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="catalog" options={{ title: 'Katalog', tabBarIcon: tabIcon('library', m.katalog), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="history" options={{ title: 'Geçmiş', tabBarIcon: tabIcon('time', m.gecmis), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="customers" options={{ title: 'Müşteri', tabBarIcon: tabIcon('people', m.musteri), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="services" options={{ title: 'Servis', tabBarIcon: tabIcon('construct', m.servis), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="campaigns" options={{ title: 'Kampanya', tabBarIcon: tabIcon('megaphone', m.kampanya), tabBarLabel: tabLabel() }} />
      <Tabs.Screen name="reminders" options={{ title: 'Hatırlat.', tabBarIcon: tabIcon('notifications', m.hatirlatma), tabBarLabel: tabLabel() }} />
      {/* Kasa & Tahsilat live inside the (tabs) group so the desktop sidebar
          wrapper stays visible on them too — they're just hidden from the
          mobile bottom bar (tabBarButton: null) since that's already full;
          reachable via the Panel module cards and the mobile drawer instead. */}
      <Tabs.Screen name="kasa" options={{ title: 'Kasa', tabBarButton: () => null }} />
      <Tabs.Screen name="tahsilat" options={{ title: 'Tahsilat', tabBarButton: () => null }} />
      <Tabs.Screen name="company" options={{ title: 'Firma', tabBarIcon: tabIcon('business', m.firma), tabBarLabel: tabLabel() }} />
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 18, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  brandIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#fff', fontSize: 14, fontWeight: '900', flexShrink: 1 },
  navList: { flex: 1 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  navText: { fontSize: 13, fontWeight: '700', color: theme.colors.textOnDark },
  navTextActive: { color: '#fff', fontWeight: '900' },
  contentOuter: { flex: 1, alignItems: 'center', backgroundColor: '#fff' },
  contentInner: { flex: 1, width: '100%', maxWidth: 900 },
});

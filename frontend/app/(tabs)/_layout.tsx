import { Tabs, usePathname, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';
import { buildNavItems, isNavItemActive, navItemRoute, NavItem } from '@/src/lib/navItems';

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
      <Tabs.Screen name="kasa" options={{ title: 'Kasa', tabBarIcon: tabIcon('wallet', m.kasa) }} />
      <Tabs.Screen name="tahsilat" options={{ title: 'Tahsilat', tabBarIcon: tabIcon('cash', m.tahsilat) }} />
      <Tabs.Screen name="company" options={{ title: 'Firma', tabBarIcon: tabIcon('business', m.firma) }} />
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

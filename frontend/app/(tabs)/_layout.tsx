import { Tabs } from 'expo-router';
// redeploy trigger
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';

function tabIcon(name: string, color: string, desktop: boolean) {
  const boxSize = desktop ? 40 : 30;
  const iconSize = desktop ? 24 : 20;
  return ({ focused }: { focused: boolean; size: number }) => (
    <View
      style={{
        width: boxSize,
        height: boxSize,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? color : 'transparent',
      }}
    >
      <Ionicons name={(focused ? name : `${name}-outline`) as any} size={iconSize} color={focused ? '#fff' : theme.colors.textOnDark} />
    </View>
  );
}

function tabLabel(desktop: boolean) {
  return ({ focused, children }: { focused: boolean; children: string }) => (
    <Text style={{ fontSize: desktop ? 12 : 9, fontWeight: '800', letterSpacing: 0, color: focused ? '#fff' : theme.colors.textOnDark, marginTop: desktop ? 2 : -2 }}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = theme.colors.modules;
  // "Desktop" here means a wide web browser window (not the phone-sized
  // web view) — the bottom nav icons/labels get a comfortable bump so they
  // don't look tiny on a large monitor.
  const isDesktopWeb = Platform.OS === 'web' && width >= 700;
  const tabBarHeight = (isDesktopWeb ? 76 : 60) + insets.bottom;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: isDesktopWeb ? 10 : 6,
          paddingBottom: insets.bottom + (isDesktopWeb ? 10 : 6),
          borderTopWidth: 0,
          backgroundColor: theme.colors.navyDark,
          elevation: 8,
        },
        tabBarItemStyle: { paddingHorizontal: isDesktopWeb ? 4 : 1 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: tabIcon('grid', theme.colors.primary, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="teklif"
        options={{
          title: 'Teklif',
          tabBarIcon: tabIcon('create', m.teklif, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Katalog',
          tabBarIcon: tabIcon('library', m.katalog, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Geçmiş',
          tabBarIcon: tabIcon('time', m.gecmis, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Müşteri',
          tabBarIcon: tabIcon('people', m.musteri, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servis',
          tabBarIcon: tabIcon('construct', m.servis, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: 'Kampanya',
          tabBarIcon: tabIcon('megaphone', m.kampanya, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Hatırlat.',
          tabBarIcon: tabIcon('notifications', m.hatirlatma, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
      <Tabs.Screen
        name="company"
        options={{
          title: 'Firma',
          tabBarIcon: tabIcon('business', m.firma, isDesktopWeb),
          tabBarLabel: tabLabel(isDesktopWeb),
        }}
      />
    </Tabs>
  );
}

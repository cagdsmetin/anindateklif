import { Tabs } from 'expo-router';
// redeploy trigger
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';

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

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const m = theme.colors.modules;
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: tabIcon('grid', theme.colors.primary),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="teklif"
        options={{
          title: 'Teklif',
          tabBarIcon: tabIcon('create', m.teklif),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Katalog',
          tabBarIcon: tabIcon('library', m.katalog),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Geçmiş',
          tabBarIcon: tabIcon('time', m.gecmis),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Müşteri',
          tabBarIcon: tabIcon('people', m.musteri),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servis',
          tabBarIcon: tabIcon('construct', m.servis),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: 'Kampanya',
          tabBarIcon: tabIcon('megaphone', m.kampanya),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Hatırlat.',
          tabBarIcon: tabIcon('notifications', m.hatirlatma),
          tabBarLabel: tabLabel(),
        }}
      />
      <Tabs.Screen
        name="company"
        options={{
          title: 'Firma',
          tabBarIcon: tabIcon('business', m.firma),
          tabBarLabel: tabLabel(),
        }}
      />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';

function tabIcon(name: string, color: string) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
    <Ionicons name={(focused ? name : `${name}-outline`) as any} size={size} color={focused ? color : theme.colors.textMuted} />
  );
}

function tabLabel(color: string) {
  return ({ focused, children }: { focused: boolean; children: string }) => (
    <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0, color: focused ? color : theme.colors.textMuted, marginTop: -2 }}>
      {children}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="panel"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          borderTopWidth: 1,
          borderTopColor: theme.colors.line,
          backgroundColor: '#fff',
          elevation: 8,
        },
        tabBarItemStyle: { paddingHorizontal: 1 },
      }}
    >
      <Tabs.Screen
        name="panel"
        options={{
          title: 'Panel',
          tabBarIcon: tabIcon('grid', theme.colors.primary),
          tabBarLabel: tabLabel(theme.colors.primary),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Teklif',
          tabBarIcon: tabIcon('create', '#2563EB'),
          tabBarLabel: tabLabel('#2563EB'),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Katalog',
          tabBarIcon: tabIcon('library', '#7C3AED'),
          tabBarLabel: tabLabel('#7C3AED'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Geçmiş',
          tabBarIcon: tabIcon('time', '#EA580C'),
          tabBarLabel: tabLabel('#EA580C'),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Müşteri',
          tabBarIcon: tabIcon('people', '#059669'),
          tabBarLabel: tabLabel('#059669'),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servis',
          tabBarIcon: tabIcon('construct', '#DC2626'),
          tabBarLabel: tabLabel('#DC2626'),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: 'Kampanya',
          tabBarIcon: tabIcon('megaphone', '#DB2777'),
          tabBarLabel: tabLabel('#DB2777'),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Hatırlat.',
          tabBarIcon: tabIcon('notifications', '#D97706'),
          tabBarLabel: tabLabel('#D97706'),
        }}
      />
      <Tabs.Screen
        name="company"
        options={{
          title: 'Firma',
          tabBarIcon: tabIcon('business', '#4F46E5'),
          tabBarLabel: tabLabel('#4F46E5'),
        }}
      />
    </Tabs>
  );
}

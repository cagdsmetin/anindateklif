import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/state/AuthContext';
import { AppProvider } from '@/src/state/AppContext';
import { authTheme } from '@/src/lib/auth-theme';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const g = segments[0] as string | undefined;
    const inAuth = g === '(auth)';
    const inSetup = g === '(setup)';

    if (!user) {
      // Not authenticated → force auth group (splash)
      if (!inAuth) router.replace('/splash');
      return;
    }

    // Authenticated
    if (!user.onboarding_completed) {
      if (!inSetup) router.replace('/wizard');
      return;
    }

    // Fully onboarded — redirect out of auth/setup groups
    if (inAuth || inSetup) router.replace('/(tabs)');
  }, [loading, user, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: authTheme.bg }}>
        <ActivityIndicator size="large" color={authTheme.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <WebFrame>
            <RouteGuard>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }} />
            </RouteGuard>
          </WebFrame>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Desktop web only: this is a phone-first UI, so on a wide monitor letting
// every card/button stretch edge-to-edge just spreads them thin with dead
// space in between. Cap the content at a comfortable reading width and
// center it — no box, no shadow, no background color change, just a quiet
// width limit. Mobile browsers are already narrower than the cap, so
// nothing changes there.
function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return <View style={webStyles.center}>{children}</View>;
}

const webStyles = StyleSheet.create({
  center: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
});

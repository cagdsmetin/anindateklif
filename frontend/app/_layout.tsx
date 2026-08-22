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

// On the web, a phone-shaped UI stretched edge-to-edge across a wide desktop
// browser window looks broken. Constrain it to a comfortable, centered
// column on large screens while leaving mobile browsers untouched (the
// max-width simply never kicks in below that width).
function WebFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={webStyles.outer}>
      <View style={webStyles.inner}>{children}</View>
    </View>
  );
}

const webStyles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    // @ts-ignore web-only CSS custom property fallback
    backgroundColor: '#E2E8F0',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    // @ts-ignore web-only box shadow, ignored on native
    boxShadow: '0 0 40px rgba(15,23,42,0.12)',
  },
});

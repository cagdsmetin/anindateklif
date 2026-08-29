import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/state/AuthContext';
import { AppProvider } from '@/src/state/AppContext';
import { authTheme } from '@/src/lib/auth-theme';
import SupportBubble from '@/src/components/SupportBubble';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    const g = segments[0] as string | undefined;
    const inAuth = g === '(auth)';
    const inSetup = g === '(setup)';
    const isPublic = g === 'privacy' || g === 'join' || g === 'verify-email'; // Play/App Store review + Data Safety form, the staff-invite join page, and the e-mail verification link must all load without login

    if (isPublic) return;

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
  // Destek baloncuğu tek bir yerden, tüm ekranların üstünde render edilir --
  // sadece giriş yapmış ve kurulumu tamamlamış kullanıcılar için (splash,
  // giriş, kurulum sihirbazı, gizlilik/davet sayfalarında gösterilmez).
  // AI Asistan ve Ekip Sohbeti ekranlarında da gizleniyor: bu sayfaların
  // kendi mesaj gönderme çubuğu aynı sağ-alt köşede duruyor ve sabit
  // baloncuk üstüne binip gönder butonunu görünmez/tıklanamaz hale
  // getiriyordu (kullanıcı raporu: "gönder tuşu yok").
  const bubbleHiddenRoutes = ['/assistant', '/team-chat'];
  const showSupportBubble = !!user && user.onboarding_completed && !bubbleHiddenRoutes.includes(pathname);
  return (
    <>
      {children}
      {showSupportBubble && <SupportBubble />}
    </>
  );
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
          <RouteGuard>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#fff' } }} />
          </RouteGuard>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

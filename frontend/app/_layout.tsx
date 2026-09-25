import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, LogBox, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { useBrandFonts } from '@/src/hooks/use-brand-fonts';
import { AuthProvider, useAuth } from '@/src/state/AuthContext';
import { AppProvider } from '@/src/state/AppContext';
import { LanguageProvider } from '@/src/lib/i18n';
import { ThemeProvider } from '@/src/lib/theme-context';
import { authTheme } from '@/src/lib/auth-theme';
import SupportBubble from '@/src/components/SupportBubble';
import { theme } from '@/src/lib/theme';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Web: "Ana Ekrana Ekle" ile uygulama gibi açılabilsin (iPhone'da web push
// için şart). Web çıktısı "single" olduğu için +html.tsx kullanılmıyor;
// etiketleri açılışta ekliyoruz.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.querySelector('link[rel="manifest"]')) {
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  add('link', { rel: 'manifest', href: '/manifest.json' });
  add('link', { rel: 'apple-touch-icon', href: '/icon-192.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Anında Teklif' });
  add('meta', { name: 'theme-color', content: '#2563EB' });
}

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
      // Not authenticated → force auth group. Web'de gerçek bir tanıtım
      // (landing) sayfası var -- "Anında Teklif nedir, ne işe yarar,
      // avantajları neler" burada anlatılıyor; native app'te ise mağazadan
      // indirilen kullanıcı zaten niyetini biliyor, o yüzden orada eskisi
      // gibi kısa onboarding carousel'i (splash) gösteriliyor.
      if (!inAuth) router.replace(Platform.OS === 'web' ? '/landing' : '/splash');
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
  // Marka yazı tipi (Plus Jakarta Sans). Yüklenmesi beklenmez: hazır
  // olduğunda kendiliğinden yeniden çizilir, o ana kadar sistem fontu
  // kullanılır -- açılış hiç gecikmez, font gelmezse uygulama yine çalışır.
  useBrandFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AppProvider>
              <RouteGuard>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.surface } }} />
              </RouteGuard>
            </AppProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

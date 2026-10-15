import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authTheme, authRadius, authSpacing } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import BlackHoleBackground from '@/src/components/BlackHoleBackground';
import { useAuth } from '@/src/state/AuthContext';

// iyzico ödeme formu bittikten sonra backend /subscription/callback
// kullanıcıyı buraya yönlendirir (?status=success | failed). Abonelik
// backend'de zaten uzatılmış olur; burada yalnızca sonucu gösterip
// kullanıcı bilgisini tazeliyoruz.
export default function SubscriptionResultScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ status?: string }>();
  const ok = params.status === 'success';
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900;
  const [refreshing, setRefreshing] = useState(ok && !!user);

  useEffect(() => {
    if (!ok || !user) return;
    refreshUser()
      .catch(() => {})
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  const goApp = () => router.replace(user ? '/(tabs)' : '/login');
  const goSubscription = () => router.replace(user ? '/(tabs)/subscription' : '/login');

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BlackHoleBackground centerX={0.5} spread={1.4} />
      </View>
      <View style={[s.card, wide && s.cardWide]}>
        <View style={s.logoWrap}>
          <BrandLogo size={64} />
        </View>
        <View style={[s.iconWrap, { backgroundColor: ok ? authTheme.success : authTheme.danger }]}>
          <Ionicons name={ok ? 'checkmark' : 'close'} size={34} color="#fff" />
        </View>
        <Text style={s.title}>{ok ? 'Ödemeniz alındı' : 'Ödeme tamamlanamadı'}</Text>
        <Text style={s.subtitle}>
          {ok
            ? 'Aboneliğiniz hesabınıza tanımlandı. Teşekkür ederiz!'
            : 'Kartınızdan para çekilmedi. Bilgileri kontrol edip tekrar deneyebilirsiniz.'}
        </Text>

        {refreshing ? (
          <ActivityIndicator color={authTheme.primary} style={{ marginTop: authSpacing.xl }} />
        ) : ok ? (
          <TouchableOpacity style={s.primary} onPress={goApp} testID="subscription-result-continue">
            <Text style={s.primaryText}>Uygulamaya geç</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={s.primary} onPress={goSubscription} testID="subscription-result-retry">
              <Text style={s.primaryText}>Tekrar dene</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={goApp}>
              <Text style={s.secondaryText}>Uygulamaya dön</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480, paddingHorizontal: authSpacing.xl, paddingVertical: authSpacing.xxl },
  cardWide: { backgroundColor: 'rgba(17,26,46,0.85)', borderRadius: authRadius.xl, borderWidth: 1, borderColor: authTheme.cardBorder },
  logoWrap: { alignItems: 'center', marginBottom: authSpacing.lg },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: authSpacing.lg },
  title: { color: authTheme.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: authTheme.textSoft, fontSize: 15, textAlign: 'center', marginTop: authSpacing.sm, marginBottom: authSpacing.xl, lineHeight: 22 },
  primary: { backgroundColor: authTheme.primary, borderRadius: authRadius.md, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: authTheme.primaryText, fontWeight: '700', fontSize: 16 },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: authTheme.link, fontWeight: '600', fontSize: 15 },
});

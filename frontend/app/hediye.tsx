import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authTheme, authRadius, authSpacing } from '@/src/lib/auth-theme';
import { BrandLogo } from '@/src/components/BrandLogo';
import BlackHoleBackground from '@/src/components/BlackHoleBackground';
import { api } from '@/src/lib/api';
import { storage } from '@/src/utils/storage';
import { CAMPAIGN_STORAGE_KEY, useAuth } from '@/src/state/AuthContext';

// Instagram kampanyasının karşılama sayfası (anindateklif.co/hediye).
// Yoruma "TEKLİF" yazana Business Suite otomatik mesajla bu bağlantıyı
// gönderir. Kod elden verilmez: ziyaretçi burada üye olur, kampanya kodu
// kayıtla birlikte sunucuda uygulanır (mevcut üye giriş yapınca uygulanır).
const DEFAULT_CAMPAIGN = 'TEKLIF30';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'flash', text: 'Sınırsız teklif: ölçüyü girin, fiyat kendiliğinden hesaplansın' },
  { icon: 'document-text', text: 'Logonuzla PDF, tek dokunuşla WhatsApp' },
  { icon: 'sparkles', text: 'Yapay zekâ ile sözleşme ve Müşteri Avcısı' },
  { icon: 'wallet', text: 'Kasa, tahsilat ve hatırlatmalar tek uygulamada' },
];

export default function HediyeScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ kod?: string }>();
  const campaign = (params.kod || DEFAULT_CAMPAIGN).toUpperCase().replace('İ', 'I');
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 900;

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) storage.setItem(CAMPAIGN_STORAGE_KEY, campaign);
  }, [user, campaign]);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.redeemPromoCode(campaign);
      await refreshUser();
      setDone(true);
    } catch (e: any) {
      const msg = (e?.body || '').match(/"detail":\s*"([^"]+)"/)?.[1];
      setError(msg || 'Hediye tanımlanamadı, tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <BlackHoleBackground centerX={0.5} spread={1.4} />
      </View>
      <View style={[s.card, wide && s.cardWide]}>
        <View style={s.logoWrap}>
          <BrandLogo size={64} />
        </View>
        <View style={s.badge}>
          <Ionicons name="gift" size={16} color="#fff" />
          <Text style={s.badgeText}>Instagram'a özel hediye</Text>
        </View>
        <Text style={s.title}>1 ay Pro ücretsiz</Text>
        <Text style={s.subtitle}>Üye olun, hediye hesabınıza kendiliğinden tanımlansın. Kredi kartı gerekmez.</Text>

        <View style={s.perks}>
          {PERKS.map((p) => (
            <View key={p.text} style={s.perkRow}>
              <Ionicons name={p.icon} size={18} color={authTheme.goldLight} />
              <Text style={s.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>

        {done ? (
          <>
            <Text style={s.success}>Hediyeniz tanımlandı: 1 ay Pro hesabınızda.</Text>
            <TouchableOpacity style={s.primary} onPress={() => router.replace('/(tabs)')}>
              <Text style={s.primaryText}>Uygulamaya geç</Text>
            </TouchableOpacity>
          </>
        ) : user ? (
          <TouchableOpacity style={s.primary} onPress={claim} disabled={busy} testID="hediye-claim">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Hediyemi al</Text>}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={s.primary} onPress={() => router.push('/register')} testID="hediye-register">
              <Text style={s.primaryText}>Ücretsiz üye ol, hediyeni al</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondary} onPress={() => router.push('/login')}>
              <Text style={s.secondaryText}>Zaten üyeyim, giriş yap</Text>
            </TouchableOpacity>
          </>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Text style={s.fine}>Her firma hediyeden bir kez yararlanabilir.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 480, paddingHorizontal: authSpacing.xl, paddingVertical: authSpacing.xxl },
  cardWide: { backgroundColor: 'rgba(17,26,46,0.85)', borderRadius: authRadius.xl, borderWidth: 1, borderColor: authTheme.cardBorder },
  logoWrap: { alignItems: 'center', marginBottom: authSpacing.lg },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, backgroundColor: authTheme.gold, borderRadius: authRadius.pill, paddingHorizontal: 14, paddingVertical: 6, marginBottom: authSpacing.md },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  title: { color: authTheme.text, fontSize: 32, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: authTheme.textSoft, fontSize: 15, textAlign: 'center', marginTop: authSpacing.sm, lineHeight: 22 },
  perks: { marginVertical: authSpacing.xl, gap: authSpacing.md },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: authSpacing.md },
  perkText: { color: authTheme.textSoft, fontSize: 14, flex: 1, lineHeight: 20 },
  primary: { backgroundColor: authTheme.primary, borderRadius: authRadius.md, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: authTheme.primaryText, fontWeight: '700', fontSize: 16 },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: authTheme.link, fontWeight: '600', fontSize: 15 },
  success: { color: authTheme.success, textAlign: 'center', fontWeight: '700', marginBottom: authSpacing.md },
  error: { color: authTheme.danger, textAlign: 'center', marginTop: authSpacing.sm },
  fine: { color: authTheme.textMuted, fontSize: 12, textAlign: 'center', marginTop: authSpacing.lg },
});

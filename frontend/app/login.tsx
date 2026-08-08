import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useAuth } from '@/src/state/AuthContext';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setTimeout(() => setBusy(false), 3000);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.hero}>
        <View style={s.logoWrap}>
          <View style={s.logoRing}>
            <View style={s.logoInner}>
              <Ionicons name="flash" size={40} color="#fff" />
            </View>
          </View>
          <Text style={s.brand} testID="brand-title">Anında Teklif</Text>
          <Text style={s.tagline}>Profesyonel B2B Teklif Hazırlama Aracı</Text>
        </View>

        <View style={s.featureRow}>
          <FeaturePill icon="document-text-outline" label="Otomatik PDF" />
          <FeaturePill icon="logo-whatsapp" label="WhatsApp" />
          <FeaturePill icon="business-outline" label="Çoklu Firma" />
        </View>
      </View>

      <View style={s.bottomCard}>
        <Text style={s.welcome}>Hoş Geldiniz</Text>
        <Text style={s.sub}>Devam etmek için Google hesabınızla giriş yapın</Text>

        <TouchableOpacity
          testID="google-signin-btn"
          style={s.googleBtn}
          onPress={onGoogle}
          disabled={busy}
          activeOpacity={0.9}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <>
              <View style={s.gIcon}>
                <Text style={s.gLetter}>G</Text>
              </View>
              <Text style={s.googleText}>Google ile Devam Et</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.legal}>
          Giriş yaparak <Text style={s.legalStrong}>Kullanım Koşulları</Text> ve{' '}
          <Text style={s.legalStrong}>Gizlilik Politikası</Text>&apos;nı kabul etmiş olursunuz.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function FeaturePill({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.pill}>
      <Ionicons name={icon} size={14} color="#fff" />
      <Text style={s.pillText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.primary },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrap: { alignItems: 'center' },
  logoRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.lg,
    shadowColor: '#000',
  },
  brand: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 0.3, marginBottom: 6 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  featureRow: { flexDirection: 'row', gap: 8, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  bottomCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 28,
    paddingBottom: 40,
    alignItems: 'center',
    ...theme.shadow.lg,
  },
  welcome: { fontSize: 22, fontWeight: '900', color: theme.colors.navy, marginBottom: 4 },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 22, textAlign: 'center' },
  googleBtn: {
    width: '100%',
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    ...theme.shadow.sm,
  },
  gIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: { fontSize: 14, fontWeight: '900', color: '#4285F4' },
  googleText: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  legal: { fontSize: 10.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 15 },
  legalStrong: { fontWeight: '700', color: theme.colors.primary },
});

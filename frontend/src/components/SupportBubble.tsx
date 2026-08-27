import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';

// Global "Nasıl yardımcı olabiliriz?" baloncuğu — her sayfanın sağ altında
// sabit görünsün diye kök layout'ta (app/_layout.tsx) bir kez render edilir,
// tek tek her ekrana eklemeye gerek kalmadan tüm uygulamada aynı yerde durur.
// WhatsApp/e-posta seçeneklerinin altında artık gerçek numara/adres YAZILMIYOR
// (sadece uygulama içinde açılıyor) — sade görünmesi istendi.
export default function SupportBubble() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    api.getAppConfig().then((r: any) => setWhatsappNumber(r?.whatsapp_number || '905415858988')).catch(() => setWhatsappNumber('905415858988'));
  }, []);

  return (
    <>
      <TouchableOpacity
        style={[s.bubble, { bottom: insets.bottom + 20 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        testID="support-bubble"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[s.sheet, { marginBottom: insets.bottom + 88 }]}>
            <Text style={s.title}>Nasıl yardımcı olabiliriz?</Text>
            <TouchableOpacity
              style={s.option}
              onPress={() => { setOpen(false); router.push('/(tabs)/assistant' as any); }}
              testID="support-ai"
            >
              <View style={[s.icon, { backgroundColor: theme.colors.primarySoft }]}>
                <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.optionTitle}>AI Asistan'a Sor</Text>
                <Text style={s.optionSub}>Kullanım soruları, teklif metni önerisi</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            {!!whatsappNumber && (
              <TouchableOpacity
                style={s.option}
                onPress={() => { setOpen(false); Linking.openURL(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`); }}
                testID="support-whatsapp"
              >
                <View style={[s.icon, { backgroundColor: '#DCFCE7' }]}>
                  <Ionicons name="logo-whatsapp" size={18} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.optionTitle}>WhatsApp ile Destek</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.option}
              onPress={() => { setOpen(false); Linking.openURL('mailto:ncagdasm@gmail.com?subject=Anında%20Teklif%20Destek'); }}
              testID="support-email"
            >
              <View style={[s.icon, { backgroundColor: theme.colors.surfaceSoft }]}>
                <Ionicons name="mail-outline" size={18} color={theme.colors.textSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.optionTitle}>E-posta ile Destek</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    ...theme.shadow.lg,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end', alignItems: 'flex-end', paddingRight: 16 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 14, width: 280, ...theme.shadow.lg },
  title: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  optionSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
});

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useLanguage } from '@/src/lib/i18n';

/**
 * Standalone "Yeni Kampanya" creation screen — mirrors service-add.tsx's layout
 * (back-arrow header, card of icon-prefixed fields, sticky footer CTA).
 */
export default function CampaignAddScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, createCampaign, showToast, toast } = useApp();

  const [baslik, setBaslik] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [busy, setBusy] = useState(false);
  const [errBaslik, setErrBaslik] = useState(false);
  const [errMesaj, setErrMesaj] = useState(false);

  const onCreate = async () => {
    if (busy) return;
    const bOk = baslik.trim().length >= 2;
    const mOk = mesaj.trim().length >= 2;
    setErrBaslik(!bOk);
    setErrMesaj(!mOk);
    if (!bOk || !mOk) {
      showToast(t('campaignAdd.s002'));
      return;
    }
    if (!activeCompany) {
      showToast(t('campaignAdd.s003'));
      return;
    }
    setBusy(true);
    try {
      await createCampaign({ baslik: baslik.trim(), mesaj: mesaj.trim() });
      showToast(t('campaignAdd.s004'));
      router.back();
    } catch (e: any) {
      showToast(t('campaignAdd.s005') + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {toast ? (
        <View style={s.toast} testID="toast-msg" pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('campaignAdd.s006')}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={s.heroCircle}>
              <Ionicons name="megaphone" size={36} color={theme.colors.primary} />
            </View>
            <Text style={s.heroCaption}>{t('campaignAdd.s007')}</Text>
          </View>

          <View style={s.card}>
            <View style={s.field}>
              <Text style={s.fieldLabel}>{t('campaignAdd.s008')}<Text style={{ color: theme.colors.red }}>*</Text></Text>
              <View style={[s.inputWrap, errBaslik && s.inputWrapError]}>
                <Ionicons name="pricetag-outline" size={20} color={theme.colors.primary} style={{ marginRight: 10 }} />
                <TextInput
                  testID="campadd-baslik"
                  value={baslik}
                  onChangeText={(v) => { setBaslik(v); if (errBaslik) setErrBaslik(false); }}
                  placeholder={t('campaignAdd.s009')}
                  placeholderTextColor="#94a3b8"
                  style={s.input}
                />
              </View>
            </View>

            <View style={[s.field, { marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>{t('campaignAdd.s010')}<Text style={{ color: theme.colors.red }}>*</Text></Text>
              <View style={[s.inputWrap, s.inputWrapMultiline, errMesaj && s.inputWrapError]}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.colors.primary} style={{ marginRight: 10, marginTop: 2 }} />
                <TextInput
                  testID="campadd-mesaj"
                  value={mesaj}
                  onChangeText={(v) => { setMesaj(v); if (errMesaj) setErrMesaj(false); }}
                  placeholder={t('campaignAdd.s011')}
                  placeholderTextColor="#94a3b8"
                  style={[s.input, s.inputMultiline]}
                  multiline
                  numberOfLines={6}
                />
              </View>
              <Text style={s.helperText}>
                {t('campaignAdd.s012')}<Text style={s.helperCode}>{'{musteri}'}</Text> ve <Text style={s.helperCode}>{'{firma}'}</Text> {t('campaignAdd.s013')}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: (insets.bottom || 12) + 12 }]}>
          <View style={s.footerRow}>
            <TouchableOpacity
              style={[s.ctaSecondary]}
              onPress={() => router.back()}
              disabled={busy}
              activeOpacity={0.85}
              testID="campadd-cancel"
            >
              <Text style={s.ctaSecondaryText}>{t('campaignAdd.s014')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.cta, busy && s.ctaDisabled]}
              onPress={onCreate}
              disabled={busy}
              activeOpacity={0.9}
              testID="campadd-create"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('campaignAdd.s015')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  hero: { alignItems: 'center', marginBottom: 26 },
  heroCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroCaption: { fontSize: 13.5, color: theme.colors.textMuted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.05,
  },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14, minHeight: 140 },
  inputWrapError: { borderColor: theme.colors.red, backgroundColor: '#FEF2F2' },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  inputMultiline: { minHeight: 112, textAlignVertical: 'top' },
  helperText: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 8, lineHeight: 16 },
  helperCode: { fontWeight: '800', color: theme.colors.primary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: '#F5F7FA',
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  cta: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.lg,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  ctaSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
  },
  ctaSecondaryText: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '800' },
  toast: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: theme.colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    zIndex: 9999,
    gap: 6,
    elevation: 12,
    ...theme.shadow.md,
  },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});

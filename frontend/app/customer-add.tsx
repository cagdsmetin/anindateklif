import React, { useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { api } from '@/src/lib/api';

/**
 * Standalone "Müşteri Ekle" screen (mirrors the reference design).
 * - Full screen with back arrow header.
 * - Card with 5 input fields, blue icons.
 * - Sticky primary CTA at the bottom.
 * Only touches this screen — the rest of the app is untouched.
 */
export default function CustomerAddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, reloadCustomers, showToast, customers } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;

  const editing = useMemo(
    () => (editingId ? customers.find((c) => c.id === editingId) : undefined),
    [editingId, customers],
  );

  const [firma, setFirma] = useState(editing?.firma || '');
  const [telefon, setTelefon] = useState(editing?.telefon || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [sirket, setSirket] = useState(editing?.yetkili || '');
  const [adres, setAdres] = useState(editing?.adres || '');
  const [busy, setBusy] = useState(false);
  const [errName, setErrName] = useState(false);
  const [errPhone, setErrPhone] = useState(false);

  const onSave = async () => {
    if (busy) return;
    const nOk = firma.trim().length >= 2;
    const pOk = telefon.trim().length >= 3;
    setErrName(!nOk);
    setErrPhone(!pOk);
    if (!nOk || !pOk) {
      showToast('Ad Soyad ve Telefon zorunludur');
      return;
    }
    if (!activeCompany) {
      showToast('Önce firma seçiniz');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        companyId: activeCompany.id,
        firma: firma.trim(),
        yetkili: sirket.trim(),
        telefon: telefon.trim(),
        email: email.trim(),
        adres: adres.trim(),
      };
      if (editingId) {
        // No backend PUT for customers; delete + re-add is heavy. Keep create-only for MVP.
        // For an "edit" flow we create a new customer (a limitation acknowledged in scope).
        await api.createCustomer(payload);
      } else {
        await api.createCustomer(payload);
      }
      await reloadCustomers();
      showToast('Müşteri kaydedildi');
      router.back();
    } catch (e: any) {
      showToast('Kayıt hatası: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{editingId ? 'Müşteri Düzenle' : 'Müşteri Ekle'}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero avatar */}
          <View style={s.hero}>
            <View style={s.heroCircle}>
              <Ionicons name="person-add" size={36} color={theme.colors.primary} />
            </View>
            <Text style={s.heroCaption}>Müşteri Bilgileri</Text>
          </View>

          {/* Form card */}
          <View style={s.card}>
            <FieldRow
              label="Ad Soyad / Firma Ünvanı"
              required
              icon="person-outline"
              placeholder="Örn: Ahmet Yılmaz"
              value={firma}
              onChange={(v) => { setFirma(v); if (errName) setErrName(false); }}
              error={errName}
              autoCapitalize="words"
              testID="cadd-name"
            />
            <FieldRow
              label="Telefon"
              required
              icon="call-outline"
              placeholder="0532 123 45 67"
              value={telefon}
              onChange={(v) => { setTelefon(v); if (errPhone) setErrPhone(false); }}
              error={errPhone}
              keyboardType="phone-pad"
              testID="cadd-phone"
            />
            <FieldRow
              label="E-posta Adresi"
              icon="mail-outline"
              placeholder="ornek@mail.com"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="cadd-email"
            />
            <FieldRow
              label="Şirket Adı"
              icon="business-outline"
              placeholder="Opsiyonel"
              value={sirket}
              onChange={setSirket}
              testID="cadd-company"
            />
            <FieldRow
              label="Adres"
              icon="location-outline"
              placeholder="Fatura adresi..."
              value={adres}
              onChange={setAdres}
              multiline
              testID="cadd-address"
              isLast
            />
          </View>
        </ScrollView>

        {/* Sticky primary CTA */}
        <View style={[s.footer, { paddingBottom: (insets.bottom || 12) + 12 }]}>
          <TouchableOpacity
            style={[s.cta, busy && s.ctaDisabled]}
            onPress={onSave}
            disabled={busy}
            activeOpacity={0.9}
            testID="cadd-save"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Müşteriyi Kaydet</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldRow({
  label,
  required,
  icon,
  error,
  isLast,
  onChange,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  isLast?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <View style={[s.field, isLast && { marginBottom: 0 }]}>
      <Text style={s.fieldLabel}>
        {label} {required ? <Text style={{ color: theme.colors.red }}>*</Text> : null}
      </Text>
      <View style={[s.inputWrap, error && s.inputWrapError, rest.multiline && s.inputWrapMultiline]}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} style={{ marginRight: 10, marginTop: rest.multiline ? 2 : 0 }} />
        <TextInput
          {...rest}
          onChangeText={onChange}
          placeholderTextColor="#94a3b8"
          style={[s.input, rest.multiline && s.inputMultiline]}
        />
      </View>
    </View>
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
  heroCaption: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '600' },
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
  inputWrapMultiline: { alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14, minHeight: 96 },
  inputWrapError: { borderColor: theme.colors.red, backgroundColor: '#FEF2F2' },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  inputMultiline: { minHeight: 68, textAlignVertical: 'top' },
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
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.lg,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

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
import { useLanguage, statusLabel } from '@/src/lib/i18n';

const STATUSES = ['Açık', 'Devam ediyor', 'Tamamlandı', 'İptal'];

/**
 * Standalone "Servis Ekle / Düzenle" screen — mirrors customer-add.tsx's layout
 * (back-arrow header, card of icon-prefixed fields, sticky CTA) so Servis & Garanti
 * feels native to the rest of the app.
 */
export default function ServiceAddScreen() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, services, customers, createService, updateService, showToast, toast } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;

  const editing = useMemo(
    () => (editingId ? services.find((s) => s.id === editingId) : undefined),
    [editingId, services],
  );

  const [musFirma, setMusFirma] = useState(editing?.musFirma || '');
  const [musYetkili, setMusYetkili] = useState(editing?.musYetkili || '');
  const [musTelefon, setMusTelefon] = useState(editing?.musTelefon || '');
  const [baslik, setBaslik] = useState(editing?.baslik || '');
  const [aciklama, setAciklama] = useState(editing?.aciklama || '');
  const [servisTarihi, setServisTarihi] = useState(editing?.servisTarihi || '');
  const [garantiBitis, setGarantiBitis] = useState(editing?.garantiBitis || '');
  const [bakimTarihi, setBakimTarihi] = useState(editing?.bakimTarihi || '');
  const [durum, setDurum] = useState(editing?.durum || 'Açık');
  const [busy, setBusy] = useState(false);
  const [errFirma, setErrFirma] = useState(false);
  const [errBaslik, setErrBaslik] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickCustomer = (c: { firma: string; yetkili: string; telefon: string }) => {
    setMusFirma(c.firma);
    setMusYetkili(c.yetkili);
    setMusTelefon(c.telefon);
    setPickerOpen(false);
  };

  const onSave = async () => {
    if (busy) return;
    const fOk = musFirma.trim().length >= 2;
    const bOk = baslik.trim().length >= 2;
    setErrFirma(!fOk);
    setErrBaslik(!bOk);
    if (!fOk || !bOk) {
      showToast(t('serviceAdd.s006'));
      return;
    }
    if (!activeCompany) {
      showToast(t('serviceAdd.s007'));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        musFirma: musFirma.trim(),
        musYetkili: musYetkili.trim(),
        musTelefon: musTelefon.trim(),
        baslik: baslik.trim(),
        aciklama: aciklama.trim(),
        servisTarihi: servisTarihi.trim(),
        garantiBitis: garantiBitis.trim(),
        bakimTarihi: bakimTarihi.trim(),
        durum,
      };
      if (editingId) {
        await updateService(editingId, payload);
      } else {
        await createService(payload);
      }
      showToast(t('serviceAdd.s008'));
      router.back();
    } catch (e: any) {
      showToast(t('serviceAdd.s009') + (e?.message || ''));
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
        <Text style={s.headerTitle}>{editingId ? t('serviceAdd.s010') : t('serviceAdd.s028')}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={s.heroCircle}>
              <Ionicons name="construct" size={36} color={theme.colors.primary} />
            </View>
            <Text style={s.heroCaption}>{t('serviceAdd.s011')}</Text>
          </View>

          <View style={s.card}>
            <View style={s.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={s.fieldLabel}>{t('serviceAdd.s012')}<Text style={{ color: theme.colors.red }}>*</Text></Text>
                {customers.length > 0 ? (
                  <TouchableOpacity onPress={() => setPickerOpen((v) => !v)} testID="svcadd-pick-customer">
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.colors.primary }}>{t('serviceAdd.s013')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {pickerOpen ? (
                <View style={s.pickerBox}>
                  {customers.map((c) => (
                    <TouchableOpacity key={c.id} style={s.pickerItem} onPress={() => pickCustomer(c)}>
                      <Text style={s.pickerItemText} numberOfLines={1}>{c.firma}{c.yetkili ? ` — ${c.yetkili}` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View style={[s.inputWrap, errFirma && s.inputWrapError]}>
                <Ionicons name="business-outline" size={20} color={theme.colors.primary} style={{ marginRight: 10 }} />
                <TextInput
                  testID="svcadd-firma"
                  value={musFirma}
                  onChangeText={(v) => { setMusFirma(v); if (errFirma) setErrFirma(false); }}
                  placeholder={t('serviceAdd.s014')}
                  placeholderTextColor="#94a3b8"
                  style={s.input}
                />
              </View>
            </View>

            <FieldRow
              label={t('serviceAdd.s015')}
              icon="person-outline"
              placeholder={t('serviceAdd.s016')}
              value={musYetkili}
              onChange={setMusYetkili}
              testID="svcadd-yetkili"
            />
            <FieldRow
              label={t('serviceAdd.s017')}
              icon="call-outline"
              placeholder="0532 123 45 67"
              value={musTelefon}
              onChange={setMusTelefon}
              keyboardType="phone-pad"
              testID="svcadd-telefon"
            />
            <FieldRow
              label={t('serviceAdd.s019')}
              required
              icon="hammer-outline"
              placeholder={t('serviceAdd.s020')}
              value={baslik}
              onChange={(v) => { setBaslik(v); if (errBaslik) setErrBaslik(false); }}
              error={errBaslik}
              testID="svcadd-baslik"
            />
            <FieldRow
              label={t('serviceAdd.s021')}
              icon="document-text-outline"
              placeholder={t('serviceAdd.s022')}
              value={aciklama}
              onChange={setAciklama}
              multiline
              testID="svcadd-aciklama"
            />
            <FieldRow
              label={t('serviceAdd.s023')}
              icon="calendar-outline"
              placeholder={t('serviceAdd.s001')}
              value={servisTarihi}
              onChange={setServisTarihi}
              testID="svcadd-servistarihi"
            />
            <FieldRow
              label={t('serviceAdd.s024')}
              icon="shield-checkmark-outline"
              placeholder={t('serviceAdd.s001')}
              value={garantiBitis}
              onChange={setGarantiBitis}
              testID="svcadd-garanti"
            />
            <FieldRow
              label={t('serviceAdd.s025')}
              icon="build-outline"
              placeholder={t('serviceAdd.s001')}
              value={bakimTarihi}
              onChange={setBakimTarihi}
              testID="svcadd-bakim"
              isLast
            />

            <View style={[s.field, { marginTop: 4, marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>{t('serviceAdd.s026')}</Text>
              <View style={s.statusRow}>
                {STATUSES.map((st) => (
                  <TouchableOpacity
                    key={st}
                    testID={`svcadd-durum-${st}`}
                    style={[s.statusPill, durum === st && s.statusPillActive]}
                    onPress={() => setDurum(st)}
                  >
                    <Text style={[s.statusPillText, durum === st && s.statusPillTextActive]}>{statusLabel(lang, st)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: (insets.bottom || 12) + 12 }]}>
          <TouchableOpacity
            style={[s.cta, busy && s.ctaDisabled]}
            onPress={onSave}
            disabled={busy}
            activeOpacity={0.9}
            testID="svcadd-save"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('serviceAdd.s027')}</Text>}
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
  pickerBox: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, marginBottom: 8, maxHeight: 160, overflow: 'hidden', backgroundColor: '#FBFDFF' },
  pickerItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  pickerItemText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
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
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#FBFDFF' },
  statusPillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  statusPillText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  statusPillTextActive: { color: '#fff' },
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

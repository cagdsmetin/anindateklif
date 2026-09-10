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
  const [showFirmaSuggestions, setShowFirmaSuggestions] = useState(false);

  const pickCustomer = (c: { firma: string; yetkili: string; telefon: string }) => {
    setMusFirma(c.firma);
    setMusYetkili(c.yetkili);
    setMusTelefon(c.telefon);
    setPickerOpen(false);
    setShowFirmaSuggestions(false);
  };

  // Müşteri Firma'ya yazarken kayıtlı müşterilerden filtrelenmiş öneri göster
  // -- Teklif ekranındaki "Firma Adı" otomatik tamamlama ile aynı mantık.
  const firmaSuggestions = useMemo(() => {
    const q = musFirma.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(q)).slice(0, 6);
  }, [musFirma, customers]);

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
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.hero}>
            <View style={s.heroCircle}>
              <Ionicons name="construct" size={24} color={theme.colors.primary} />
            </View>
            <Text style={s.heroCaption}>{t('serviceAdd.s011')}</Text>
          </View>

          <View style={s.card}>
            <View style={[s.field, { zIndex: 30 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={s.fieldLabel}>{t('serviceAdd.s012')}<Text style={{ color: theme.colors.red }}>*</Text></Text>
                {customers.length > 0 ? (
                  <TouchableOpacity onPress={() => setPickerOpen((v) => !v)} testID="svcadd-pick-customer">
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.colors.primary }}>{t('serviceAdd.s013')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {pickerOpen ? (
                <ScrollView style={s.pickerBox} nestedScrollEnabled showsVerticalScrollIndicator>
                  {customers.map((c) => (
                    <TouchableOpacity key={c.id} style={s.pickerItem} onPress={() => pickCustomer(c)}>
                      <Text style={s.pickerItemText} numberOfLines={1}>{c.firma}{c.yetkili ? ` — ${c.yetkili}` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <View style={[s.inputWrap, errFirma && s.inputWrapError]}>
                <Ionicons name="business-outline" size={20} color={theme.colors.primary} style={{ marginRight: 10 }} />
                <TextInput
                  testID="svcadd-firma"
                  value={musFirma}
                  onChangeText={(v) => { setMusFirma(v); if (errFirma) setErrFirma(false); setShowFirmaSuggestions(true); }}
                  onFocus={() => setShowFirmaSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowFirmaSuggestions(false), 150)}
                  placeholder={t('serviceAdd.s014')}
                  placeholderTextColor="#94a3b8"
                  style={s.input}
                />
              </View>
              {showFirmaSuggestions && firmaSuggestions.length > 0 ? (
                <View style={s.suggestBox}>
                  {firmaSuggestions.map((c) => (
                    <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => pickCustomer(c)}>
                      <Ionicons name="business-outline" size={14} color={theme.colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.suggestName} numberOfLines={1}>{c.firma}</Text>
                        <Text style={s.suggestSub} numberOfLines={1}>{[c.yetkili, c.telefon].filter(Boolean).join(' • ') || '-'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={s.row}>
              <FieldRow
                rowStyle={{ flex: 1 }}
                label={t('serviceAdd.s015')}
                icon="person-outline"
                placeholder={t('serviceAdd.s016')}
                value={musYetkili}
                onChange={setMusYetkili}
                testID="svcadd-yetkili"
              />
              <FieldRow
                rowStyle={{ flex: 1 }}
                label={t('serviceAdd.s017')}
                icon="call-outline"
                placeholder="0532 123 45 67"
                value={musTelefon}
                onChange={setMusTelefon}
                keyboardType="phone-pad"
                testID="svcadd-telefon"
              />
            </View>
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
            <View style={s.row}>
              <FieldRow
                rowStyle={{ flex: 1 }}
                label={t('serviceAdd.s023')}
                icon="calendar-outline"
                placeholder={t('serviceAdd.s001')}
                value={servisTarihi}
                onChange={setServisTarihi}
                testID="svcadd-servistarihi"
              />
              <FieldRow
                rowStyle={{ flex: 1 }}
                label={t('serviceAdd.s024')}
                icon="shield-checkmark-outline"
                placeholder={t('serviceAdd.s001')}
                value={garantiBitis}
                onChange={setGarantiBitis}
                testID="svcadd-garanti"
              />
            </View>
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
  rowStyle,
  onChange,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  required?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  isLast?: boolean;
  rowStyle?: any;
  onChange: (v: string) => void;
}) {
  return (
    <View style={[s.field, isLast && { marginBottom: 0 }, rowStyle]}>
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
  headerTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  hero: { alignItems: 'center', marginBottom: 12 },
  heroCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroCaption: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.05,
  },
  row: { flexDirection: 'row', gap: 10 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text, marginBottom: 5 },
  pickerBox: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, marginBottom: 8, maxHeight: 160, backgroundColor: '#FBFDFF' },
  pickerItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  pickerItemText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 11,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10, minHeight: 64 },
  inputWrapError: { borderColor: theme.colors.red, backgroundColor: '#FEF2F2' },
  input: {
    flex: 1,
    fontSize: 13.5,
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  inputMultiline: { minHeight: 48, textAlignVertical: 'top' },
  suggestBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
    ...theme.shadow.sm,
    zIndex: 30,
    elevation: 6,
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  suggestName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  suggestSub: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 1 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#FBFDFF' },
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
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.lg,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.3 },
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

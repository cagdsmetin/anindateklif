import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { authTheme, authRadius } from '@/src/lib/auth-theme';
import { useAuth } from '@/src/state/AuthContext';
import { api } from '@/src/lib/api';

const TOTAL_STEPS = 6;

type Country = { code: string; flag: string; name: string; currency: string; taxLabel: string };
const COUNTRIES: Country[] = [
  { code: 'TR', flag: '🇹🇷', name: 'Türkiye', currency: 'TRY', taxLabel: 'KDV' },
  { code: 'GB', flag: '🇬🇧', name: 'İngiltere', currency: 'GBP', taxLabel: 'KDV' },
  { code: 'US', flag: '🇺🇸', name: 'Amerika Birleşik Devletleri', currency: 'USD', taxLabel: 'Satış Vergisi' },
  { code: 'CA', flag: '🇨🇦', name: 'Kanada', currency: 'CAD', taxLabel: 'GST/HST' },
];

type BankRow = { banka: string; turu: string; hesapSahibi: string; iban: string };

export default function SetupWizard() {
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1 – country
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  // Step 2 – business identity
  const [sirketAdi, setSirketAdi] = useState('');
  const [imzaMetni, setImzaMetni] = useState(user?.name || '');
  // Step 3 – logo
  const [logoBase64, setLogoBase64] = useState('');
  // Step 4 – contact
  const [adres, setAdres] = useState('');
  const [telefon, setTelefon] = useState('');
  const [vergiDairesi, setVergiDairesi] = useState('');
  const [vergiNo, setVergiNo] = useState('');
  // Step 5 – banks
  const [banks, setBanks] = useState<BankRow[]>([{ banka: '', turu: '', hesapSahibi: '', iban: '' }]);
  // Step 6 – first system type
  const [systemName, setSystemName] = useState('');
  const [systemFieldsRaw, setSystemFieldsRaw] = useState('');

  const canNext = (): boolean => {
    if (step === 1) return !!country;
    if (step === 2) return sirketAdi.trim().length >= 2;
    return true; // steps 3–6 optional
  };

  const goNext = async () => {
    if (busy) return;
    if (step < TOTAL_STEPS) {
      if (!canNext()) return;
      setStep(step + 1);
      return;
    }
    // Final step — persist everything
    setBusy(true);
    try {
      // 1) User profile: country/currency/tax label + onboarding_completed
      await updateUser({
        country: country.code,
        currency: country.currency,
        tax_label: country.taxLabel,
      });

      // 2) Create the company with all collected info
      const sistemTipleri =
        systemName.trim().length >= 2
          ? [
              {
                id: cryptoRandom(),
                name: systemName.trim(),
                fields: systemFieldsRaw
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 6)
                  .map((label) => ({ id: cryptoRandom(), label, type: 'text', options: [] })),
              },
            ]
          : [];

      const cleanBanks = banks
        .filter((b) => b.banka.trim() || b.iban.trim())
        .map((b) => ({
          id: cryptoRandom(),
          banka: b.banka.trim(),
          turu: b.turu.trim(),
          hesapSahibi: b.hesapSahibi.trim(),
          iban: b.iban.trim(),
        }));

      await api.createCompany({
        sirketAdi: sirketAdi.trim(),
        imzaMetni: imzaMetni.trim(),
        logoBase64,
        adres: adres.trim(),
        telefon: telefon.trim(),
        vergiDairesi: vergiDairesi.trim(),
        vergiNo: vergiNo.trim(),
        banklar: cleanBanks,
        hazirlayanEmails: user?.email ? [user.email] : [],
        sistemTipleri,
      });

      // 3) Mark onboarding complete → route guard sends to tabs
      await updateUser({ onboarding_completed: true });
    } catch (e: any) {
      Alert.alert('Kurulum Hatası', 'Bilgiler kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (busy) return;
    if (step > 1) setStep(step - 1);
  };

  const pickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('İzin Gerekli', 'Galeriye erişim izni verilmedi.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        setLogoBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
      }
    } catch {
      Alert.alert('Hata', 'Logo seçilemedi.');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          {step > 1 ? (
            <TouchableOpacity onPress={goBack} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color={authTheme.text} />
            </TouchableOpacity>
          ) : (
            <View style={s.backBtn} />
          )}
          <Text style={s.stepLabel}>{`Adım ${step} / ${TOTAL_STEPS}`}</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Çıkış', 'Kurulumdan çıkıp giriş ekranına dönmek ister misin?', [
              { text: 'İptal', style: 'cancel' },
              { text: 'Çık', style: 'destructive', onPress: () => signOut() },
            ])}
            style={s.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={authTheme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={s.progressWrap}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[s.progressSeg, i < step ? s.progressSegActive : s.progressSegInactive]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 1 && (
            <StepShell icon="globe-outline" title="Nerede çalışıyorsun?" subtitle="Ülken; para birimini, vergi etiketini, tarih biçimini ve bölge listesini belirler. Daha sonra Ayarlar'dan değiştirebilirsin.">
              {COUNTRIES.map((c) => {
                const sel = country.code === c.code;
                return (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.row, sel && s.rowSelected]}
                    onPress={() => setCountry(c)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.flag}>{c.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{c.name}</Text>
                      <Text style={s.rowSub}>{`${currencySymbol(c.currency)} ${c.currency} · ${c.taxLabel}`}</Text>
                    </View>
                    <View style={[s.radio, sel && s.radioOn]}>
                      {sel ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </StepShell>
          )}

          {step === 2 && (
            <StepShell icon="business-outline" title="İşletmeni tanıtalım" subtitle="Bu bilgiler tekliflerinin başlığında ve imza bölümünde görünür.">
              <Field label="Şirket / İşletme Adı" required>
                <TextInput
                  value={sirketAdi}
                  onChangeText={setSirketAdi}
                  placeholder="Örn: Rüya Yapı Dekorasyon"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  testID="setup-company-name"
                />
              </Field>
              <Field label="İmza Metni (Ad Soyad)">
                <TextInput
                  value={imzaMetni}
                  onChangeText={setImzaMetni}
                  placeholder="Ad Soyad"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  testID="setup-signature"
                />
              </Field>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell icon="image-outline" title="Logonu ekleyelim" subtitle="Logon PDF tekliflerinin sol üstünde marka olarak yer alacak. İstersen atlayabilirsin.">
              <TouchableOpacity onPress={pickLogo} activeOpacity={0.85} style={s.logoBox} testID="setup-logo">
                {logoBase64 ? (
                  <Image source={{ uri: logoBase64 }} style={s.logoImg} resizeMode="contain" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={40} color={authTheme.primary} />
                    <Text style={s.logoTitle}>Logo Yükle</Text>
                    <Text style={s.logoHint}>PNG / JPG · Kare oran önerilir</Text>
                  </>
                )}
              </TouchableOpacity>
              {logoBase64 ? (
                <TouchableOpacity onPress={() => setLogoBase64('')} style={s.linkBtn}>
                  <Text style={s.linkText}>Logoyu Kaldır</Text>
                </TouchableOpacity>
              ) : null}
            </StepShell>
          )}

          {step === 4 && (
            <StepShell icon="call-outline" title="İletişim & Vergi Bilgileri" subtitle="Bu bilgiler tekliflerin alt bölümünde ve fatura başlığında yer alır.">
              <Field label="Adres">
                <TextInput value={adres} onChangeText={setAdres} placeholder="İş yeri adresi" placeholderTextColor={authTheme.textMuted} style={[s.input, s.textarea]} multiline testID="setup-address" />
              </Field>
              <Field label="Telefon">
                <TextInput value={telefon} onChangeText={setTelefon} placeholder="+90 ..." placeholderTextColor={authTheme.textMuted} style={s.input} keyboardType="phone-pad" testID="setup-phone" />
              </Field>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Vergi Dairesi">
                    <TextInput value={vergiDairesi} onChangeText={setVergiDairesi} placeholder="—" placeholderTextColor={authTheme.textMuted} style={s.input} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Vergi No">
                    <TextInput value={vergiNo} onChangeText={setVergiNo} placeholder="—" placeholderTextColor={authTheme.textMuted} style={s.input} keyboardType="number-pad" />
                  </Field>
                </View>
              </View>
            </StepShell>
          )}

          {step === 5 && (
            <StepShell icon="card-outline" title="Banka Hesapların" subtitle="Bu bilgiler PDF'in alt bölümünde 'Ödeme Bilgileri' başlığı altında görünür. Sonradan ekleyebilirsin.">
              {banks.map((b, idx) => (
                <View key={idx} style={s.bankCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={s.bankTitle}>{`Hesap ${idx + 1}`}</Text>
                    <View style={{ flex: 1 }} />
                    {banks.length > 1 ? (
                      <TouchableOpacity onPress={() => setBanks(banks.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="trash-outline" size={18} color={authTheme.danger} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TextInput value={b.banka} onChangeText={(t) => updateBank(banks, setBanks, idx, { banka: t })} placeholder="Banka Adı" placeholderTextColor={authTheme.textMuted} style={s.input} />
                  <View style={{ height: 8 }} />
                  <TextInput value={b.hesapSahibi} onChangeText={(t) => updateBank(banks, setBanks, idx, { hesapSahibi: t })} placeholder="Hesap Sahibi" placeholderTextColor={authTheme.textMuted} style={s.input} />
                  <View style={{ height: 8 }} />
                  <TextInput value={b.iban} onChangeText={(t) => updateBank(banks, setBanks, idx, { iban: t })} placeholder="IBAN" placeholderTextColor={authTheme.textMuted} style={s.input} autoCapitalize="characters" />
                </View>
              ))}
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => setBanks([...banks, { banka: '', turu: '', hesapSahibi: '', iban: '' }])}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={18} color={authTheme.primary} />
                <Text style={s.addBtnText}>Yeni Hesap Ekle</Text>
              </TouchableOpacity>
            </StepShell>
          )}

          {step === 6 && (
            <StepShell icon="cube-outline" title="İlk Sistem Tipin" subtitle="Sık kullandığın bir sistem tipini tanımla. Alanları virgülle ayır. Daha sonra Ayarlar'dan sistem tiplerini genişletebilirsin.">
              <Field label="Sistem Tipi Adı">
                <TextInput
                  value={systemName}
                  onChangeText={setSystemName}
                  placeholder="Örn: Cam Balkon"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  testID="setup-system-name"
                />
              </Field>
              <Field label="Alanlar (virgülle ayır)">
                <TextInput
                  value={systemFieldsRaw}
                  onChangeText={setSystemFieldsRaw}
                  placeholder="Örn: Cam Kalınlığı, Renk, Motor Çeşidi"
                  placeholderTextColor={authTheme.textMuted}
                  style={s.input}
                  testID="setup-system-fields"
                />
              </Field>
              <View style={s.finishNote}>
                <Ionicons name="sparkles" size={16} color={authTheme.goldLight} />
                <Text style={s.finishNoteText}>
                  Kurulumu tamamladığında ilk teklifini oluşturmaya hazır olacaksın!
                </Text>
              </View>
            </StepShell>
          )}
        </ScrollView>

        {/* Bottom CTA */}
        <View style={s.bottom}>
          <TouchableOpacity
            style={[s.cta, (busy || !canNext()) && s.ctaDisabled]}
            onPress={goNext}
            disabled={busy || !canNext()}
            activeOpacity={0.9}
            testID="setup-next"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={s.ctaText}>{step === TOTAL_STEPS ? 'Kurulumu Tamamla' : 'İleri'}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function updateBank(banks: BankRow[], setBanks: (b: BankRow[]) => void, idx: number, patch: Partial<BankRow>) {
  setBanks(banks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
}

function currencySymbol(c: string): string {
  return { TRY: '₺', USD: '$', GBP: '£', CAD: 'C$' }[c] || c;
}

function cryptoRandom(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function StepShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <View style={s.stepIcon}>
        <Ionicons name={icon} size={22} color={authTheme.primary} />
      </View>
      <Text style={s.stepTitle}>{title}</Text>
      {subtitle ? <Text style={s.stepSubtitle}>{subtitle}</Text> : null}
      <View style={{ marginTop: 18 }}>{children}</View>
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>
        {label} {required ? <Text style={{ color: authTheme.danger }}>*</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: authTheme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: authTheme.textMuted, fontSize: 14, fontWeight: '600' },
  progressWrap: { flexDirection: 'row', paddingHorizontal: 24, gap: 6, marginBottom: 22 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },
  progressSegActive: { backgroundColor: authTheme.primary },
  progressSegInactive: { backgroundColor: authTheme.dotInactive },
  scroll: { paddingHorizontal: 24, paddingBottom: 120 },
  stepIcon: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  stepTitle: { color: authTheme.text, fontSize: 24, fontWeight: '900', marginBottom: 6 },
  stepSubtitle: { color: authTheme.textMuted, fontSize: 14, lineHeight: 20 },
  fieldLabel: { color: authTheme.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    color: authTheme.text, fontSize: 15,
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder, borderWidth: 1,
    borderRadius: authRadius.md, paddingHorizontal: 14, paddingVertical: 14,
    ...Platform.select({ web: { outlineWidth: 0 } as any }),
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: authTheme.card, borderColor: authTheme.cardBorder, borderWidth: 1,
    borderRadius: authRadius.lg, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
  },
  rowSelected: { borderColor: authTheme.primary, borderWidth: 1.5 },
  flag: { fontSize: 28, marginRight: 12 },
  rowTitle: { color: authTheme.text, fontSize: 15, fontWeight: '800' },
  rowSub: { color: authTheme.textMuted, fontSize: 12, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: authTheme.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { backgroundColor: authTheme.primary, borderColor: authTheme.primary },
  logoBox: {
    minHeight: 180, alignItems: 'center', justifyContent: 'center',
    backgroundColor: authTheme.card,
    borderColor: authTheme.cardBorder, borderWidth: 1.5,
    borderRadius: authRadius.lg, borderStyle: 'dashed', padding: 16,
  },
  logoImg: { width: '100%', height: 180 },
  logoTitle: { color: authTheme.text, fontWeight: '800', fontSize: 15, marginTop: 10 },
  logoHint: { color: authTheme.textMuted, fontSize: 12, marginTop: 4 },
  linkBtn: { alignSelf: 'center', marginTop: 12 },
  linkText: { color: authTheme.link, fontSize: 13, fontWeight: '700' },
  bankCard: {
    backgroundColor: authTheme.bgSoft, borderRadius: authRadius.md,
    borderColor: authTheme.line, borderWidth: 1,
    padding: 12, marginBottom: 12,
  },
  bankTitle: { color: authTheme.text, fontWeight: '800', fontSize: 13 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: authRadius.md,
    borderWidth: 1, borderColor: authTheme.primary, borderStyle: 'dashed',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  addBtnText: { color: authTheme.primary, fontWeight: '700' },
  finishNote: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.10)',
    borderColor: 'rgba(212,175,55,0.35)', borderWidth: 1,
    borderRadius: authRadius.md, padding: 12, marginTop: 12,
  },
  finishNoteText: { color: authTheme.textSoft, fontSize: 13, flex: 1 },
  bottom: {
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12,
    backgroundColor: authTheme.bg,
    borderTopColor: authTheme.line, borderTopWidth: 1,
  },
  cta: {
    backgroundColor: authTheme.primary, borderRadius: authRadius.xl, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

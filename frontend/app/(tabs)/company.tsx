import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage, LANGUAGES } from '@/src/lib/i18n';
import TopHeader from '@/src/components/TopHeader';
import { api, BankAccountT, CompanyT } from '@/src/lib/api';

const uid = () => 'x-' + Date.now() + Math.random().toString(36).slice(2, 8);

export default function CompanyScreen() {
  const router = useRouter();
  const { companies, activeCompany, setActiveCompanyId, createCompany, updateCompany, deleteCompany, showToast } = useApp();
  const { t } = useLanguage();
  const { user, refreshUser, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CompanyT | null>(null);

  // Telefon doğrulama (WhatsApp OTP)
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [otpStep, setOtpStep] = useState<'idle' | 'code_sent'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  const onResendVerification = async () => {
    if (resendBusy) return;
    setResendBusy(true);
    try {
      await api.resendVerificationEmail();
      showToast(t('firma.toastVerifyResent'));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || t('firma.toastResendFailed')));
    } finally {
      setResendBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!phoneInput.trim()) { showToast(t('firma.toastEnterPhone')); return; }
    setOtpBusy(true);
    try {
      await api.sendPhoneCode(phoneInput.trim());
      setOtpStep('code_sent');
      showToast(t('firma.toastOtpSent'));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || t('firma.toastOtpSendFailed')));
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) { showToast(t('firma.toastEnterCode')); return; }
    setOtpBusy(true);
    try {
      await api.verifyPhoneCode(phoneInput.trim(), otpCode.trim());
      await refreshUser();
      setOtpStep('idle');
      setOtpCode('');
      showToast(t('firma.toastPhoneVerified'));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || t('firma.toastCodeWrong')));
    } finally {
      setOtpBusy(false);
    }
  };
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmDeleteAccount, setShowConfirmDeleteAccount] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

  useEffect(() => { if (activeCompany) setForm({ ...activeCompany }); }, [activeCompany]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast(t('firma.toastPhotoPermission')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const b64 = asset.base64 ? `data:image/${asset.uri.endsWith('.png') ? 'png' : 'jpeg'};base64,${asset.base64}` : '';
    if (!b64) { showToast(t('firma.toastImageError')); return; }
    setForm((f) => (f ? { ...f, logoBase64: b64 } : f));
  };
  const removeLogo = () => setForm((f) => (f ? { ...f, logoBase64: '' } : f));

  const save = async () => {
    if (!form) return;
    if (!form.sirketAdi.trim()) { showToast(t('firma.toastNameRequired')); return; }
    try { await updateCompany(form.id, form); showToast(t('firma.toastSaved')); }
    catch (e: any) { showToast(t('common.errorPrefix') + (e?.message || '')); }
  };

  // Bank management
  const addBank = () => {
    if (!form) return;
    setForm({ ...form, banklar: [...(form.banklar || []), { id: uid(), banka: '', turu: '', hesapSahibi: '', iban: '' }] });
  };
  const updateBank = (id: string, patch: Partial<BankAccountT>) => form && setForm({ ...form, banklar: (form.banklar || []).map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const removeBank = (id: string) => form && setForm({ ...form, banklar: (form.banklar || []).filter((b) => b.id !== id) });

  const createNewCompany = async () => {
    try { const c = await createCompany({ sirketAdi: 'Yeni Firma' }); await setActiveCompanyId(c.id); showToast(t('firma.toastCreated')); }
    catch (e: any) { showToast(t('common.errorPrefix') + (e?.message || '')); }
  };
  const doDelete = async () => {
    if (!form) return;
    try { await deleteCompany(form.id); setShowConfirmDelete(false); showToast(t('firma.toastDeleted')); }
    catch (e: any) { showToast(t('common.errorPrefix') + (e?.message || '')); }
  };

  const doDeleteAccount = async () => {
    if (deleteAccountBusy) return;
    setDeleteAccountBusy(true);
    try {
      await api.deleteAccount();
      setShowConfirmDeleteAccount(false);
      await signOut();
      router.replace('/login');
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || t('firma.toastAccountDeleteFailed')));
    } finally {
      setDeleteAccountBusy(false);
    }
  };

  if (!form) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('firma.headerTitle')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('firma.loading')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('firma.headerTitle')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          {!user?.is_staff && (
            <>
            {/* Companies list */}
            <View style={s.companyListBox}>
              <View style={s.compHdr}>
                <Text style={s.sectionH2}>{t('firma.myCompanies')} ({companies.length})</Text>
                <TouchableOpacity onPress={createNewCompany} testID="add-company-btn"><Ionicons name="add-circle" size={22} color={theme.colors.primary} /></TouchableOpacity>
              </View>
              {companies.map((c) => {
                const active = c.id === activeCompany?.id;
                return (
                  <TouchableOpacity key={c.id} testID={`switch-company-${c.id}`} style={[s.compItem, active && s.compItemActive]} onPress={() => setActiveCompanyId(c.id)}>
                    {c.logoBase64 ? <Image source={{ uri: c.logoBase64 }} style={s.compLogo} /> : (
                      <View style={[s.compLogo, { backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="business-outline" size={16} color={theme.colors.primary} />
                      </View>
                    )}
                    <Text style={[s.compName, active && s.compNameActive]} numberOfLines={1}>{c.sirketAdi}</Text>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? theme.colors.primary : theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Logo */}
            <SectionHeader title={t('firma.companyLogo')} />
            <View style={s.logoBox}>
              {form.logoBase64 ? <Image source={{ uri: form.logoBase64 }} style={s.logoPreview} resizeMode="contain" /> : (
                <View style={s.logoPlaceholder}>
                  <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                  <Text style={s.logoHint}>{t('firma.logoNotUploaded')}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={[s.btnPri, { flex: 1 }]} onPress={pickLogo} testID="pick-logo-btn">
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                  <Text style={s.btnPriText}>{form.logoBase64 ? t('firma.changeLogo') : t('firma.uploadLogo')}</Text>
                </TouchableOpacity>
                {form.logoBase64 && (
                  <TouchableOpacity style={s.btnDangerSmall} onPress={removeLogo}>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Info */}
            <SectionHeader title={t('firma.companyInfo')} />
            <Field label={t('firma.companyName')}><TextInput style={s.input} value={form.sirketAdi} onChangeText={(v) => setForm({ ...form, sirketAdi: v })} testID="company-name-input" /></Field>
            <Field label={t('firma.address')}><TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={form.adres} onChangeText={(v) => setForm({ ...form, adres: v })} testID="company-address-input" /></Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label={t('firma.phone')} flex={1}><TextInput style={s.input} value={form.telefon} onChangeText={(v) => setForm({ ...form, telefon: v })} testID="company-phone-input" /></Field>
              <Field label={t('firma.phone2')} flex={1}><TextInput style={s.input} value={form.telefon2} onChangeText={(v) => setForm({ ...form, telefon2: v })} /></Field>
            </View>
            <Field label={t('firma.email')}><TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} testID="company-email-input" /></Field>
            <Field label={t('firma.website')}><TextInput style={s.input} autoCapitalize="none" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} /></Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label={t('firma.taxOffice')} flex={1}><TextInput style={s.input} value={form.vergiDairesi} onChangeText={(v) => setForm({ ...form, vergiDairesi: v })} /></Field>
              <Field label={t('firma.taxNo')} flex={1}><TextInput style={s.input} value={form.vergiNo} onChangeText={(v) => setForm({ ...form, vergiNo: v })} /></Field>
            </View>

            {/* Bank Accounts */}
            <SectionHeader title={t('firma.bankAccounts')} />
            <Text style={s.hint}>{t('firma.bankAccountsHint')}</Text>
            {(form.banklar || []).map((b) => (
              <View key={b.id} style={s.bankCard}>
                <View style={s.bankHdr}>
                  <Text style={s.bankNo}>{t('firma.bank')}</Text>
                  <TouchableOpacity onPress={() => removeBank(b.id)}><Ionicons name="close-circle" size={20} color={theme.colors.red} /></TouchableOpacity>
                </View>
                <TextInput style={[s.input, { marginBottom: 6 }]} placeholder={t('firma.bankTypePlaceholder')} placeholderTextColor="#94a3b8" value={b.turu} onChangeText={(v) => updateBank(b.id, { turu: v })} />
                <TextInput style={[s.input, { marginBottom: 6 }]} placeholder={t('firma.accountHolder')} placeholderTextColor="#94a3b8" value={b.hesapSahibi} onChangeText={(v) => updateBank(b.id, { hesapSahibi: v })} />
                <TextInput style={s.input} placeholder={t('firma.ibanPlaceholder')} placeholderTextColor="#94a3b8" value={b.iban} onChangeText={(v) => updateBank(b.id, { iban: v })} autoCapitalize="characters" />
              </View>
            ))}
            <TouchableOpacity style={s.addDashed} onPress={addBank} testID="add-bank-btn">
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={s.addDashedText}>{t('firma.addBankAccount')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.saveBtn} onPress={save} testID="save-company-btn">
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.saveBtnText}>{t('firma.saveCompanyInfo')}</Text>
            </TouchableOpacity>

            {companies.length > 1 && (
              <TouchableOpacity style={s.deleteCompanyBtn} onPress={() => setShowConfirmDelete(true)} testID="delete-company-btn">
                <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                <Text style={s.deleteCompanyText}>{t('firma.deleteThisCompany')}</Text>
              </TouchableOpacity>
            )}
            </>
          )}

          {user?.is_staff && (
            <>
              <SectionHeader title={t('firma.companyLogo')} />
              <View style={s.logoBox}>
                {form.logoBase64 ? <Image source={{ uri: form.logoBase64 }} style={s.logoPreview} resizeMode="contain" /> : (
                  <View style={s.logoPlaceholder}>
                    <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                    <Text style={s.logoHint}>{t('firma.logoNotUploaded')}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* Uygulama dili — kayıt olduktan sonra da her an değiştirilebilir;
              seçim backend'e (User.language) kaydedilir, tüm cihazlarda aynı
              dilde açılır. Sıra bilerek TR -> EN -> IT: en tanıdıktan en
              yeni pazara doğru. */}
          <SectionHeader title={t('firma.appLanguage')} />
          <LanguageSwitcher />

          {/* Hesabım — e-posta + telefon doğrulama */}
          <SectionHeader title={t('firma.myAccount')} />
          {user?.email_verified === false && (
            <View style={[s.supportBox, { marginBottom: 10 }]}>
              <View style={{ paddingHorizontal: 4, paddingTop: 2, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="alert-circle-outline" size={16} color={theme.colors.gold} />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.text }}>{t('firma.emailNotVerified')}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 10, lineHeight: 16 }}>
                  {t('firma.emailVerifyText').replace('{email}', user.email || '')}
                </Text>
                <TouchableOpacity style={[s.subscriptionBtn, resendBusy && { opacity: 0.6 }]} disabled={resendBusy} onPress={onResendVerification} testID="resend-email-verify-btn">
                  <Ionicons name="mail-outline" size={18} color={theme.colors.primary} />
                  <Text style={s.subscriptionBtnText}>{resendBusy ? t('firma.sending') : t('firma.resendVerifyLink')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={s.supportBox}>
            <View style={{ paddingHorizontal: 4, paddingTop: 2, paddingBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name={user?.phone_verified ? 'checkmark-circle' : 'alert-circle-outline'} size={16} color={user?.phone_verified ? theme.colors.green : theme.colors.textMuted} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.text }}>
                  {user?.phone_verified ? t('firma.phoneVerified') : t('firma.phoneNotVerified')}
                </Text>
              </View>
              <Text style={{ fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16 }}>
                {t('firma.phoneMaintenanceText')}
              </Text>
            </View>
          </View>

          {/* Support */}
          <SectionHeader title={t('firma.support')} />
          <View style={s.supportBox}>
            <TouchableOpacity style={s.remindersBtn} onPress={() => router.push('/reminders')} testID="reminders-btn">
              <Ionicons name="notifications-outline" size={18} color={theme.colors.primary} />
              <Text style={s.remindersBtnText}>{t('firma.reminders')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reportsBtn} onPress={() => router.push('/reports')} testID="reports-btn">
              <Ionicons name="bar-chart-outline" size={18} color={theme.colors.primary} />
              <Text style={s.reportsBtnText}>{t('firma.reports')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.whatsappBtn} onPress={() => Linking.openURL('https://wa.me/905415858988')} testID="whatsapp-support-btn">
            <Text style={s.whatsappBtnText}>{t('firma.writeWhatsapp')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.assistantBtn} onPress={() => router.push('/(tabs)/assistant')} testID="ai-assistant-btn">
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={s.assistantBtnText}>{t('firma.talkToAssistant')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.subscriptionBtn} onPress={() => router.push('/subscription')} testID="subscription-btn">
              <Ionicons name="star" size={18} color={theme.colors.primary} />
              <Text style={s.subscriptionBtnText}>{t('firma.subscriptionManagement')}</Text>
            </TouchableOpacity>
          </View>

          {/* Hesap silme (Google Play / App Store zorunlu) — sayfanın en altında,
              yanlışlıkla dokunulmasın diye ayrı ve son bölüm olarak duruyor. */}
          <View style={[s.supportBox, { marginTop: 10, borderColor: theme.colors.red + '33' }]}>
            <View style={{ paddingHorizontal: 4, paddingTop: 2, paddingBottom: 10 }}>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.red, marginBottom: 6 }}>{t('firma.deleteMyAccount')}</Text>
              <Text style={{ fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 10, lineHeight: 16 }}>
                {user?.is_staff
                  ? t('firma.deleteAccountTextStaff')
                  : t('firma.deleteAccountTextOwner')}
              </Text>
              <TouchableOpacity style={[s.subscriptionBtn, { borderColor: theme.colors.red }]} onPress={() => setShowConfirmDeleteAccount(true)} testID="delete-account-btn">
                <Ionicons name="trash-outline" size={18} color={theme.colors.red} />
                <Text style={[s.subscriptionBtnText, { color: theme.colors.red }]}>{t('firma.deletePermanently')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Confirm */}
      <Modal visible={showConfirmDelete} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowConfirmDelete(false)}>
          <View style={s.confirmBox}>
            <Ionicons name="warning" size={30} color={theme.colors.red} />
            <Text style={s.confirmTitle}>{t('firma.deleteCompanyTitle')}</Text>
            <Text style={s.confirmText}>{t('firma.deleteCompanyText').replace('{name}', form.sirketAdi)}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.line }]} onPress={() => setShowConfirmDelete(false)}><Text style={{ fontWeight: '800', color: theme.colors.text }}>{t('firma.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.red }]} onPress={doDelete} testID="confirm-delete-btn"><Text style={{ fontWeight: '900', color: '#fff' }}>{t('firma.yesDelete')}</Text></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Account Confirm */}
      <Modal visible={showConfirmDeleteAccount} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowConfirmDeleteAccount(false)}>
          <View style={s.confirmBox}>
            <Ionicons name="warning" size={30} color={theme.colors.red} />
            <Text style={s.confirmTitle}>{t('firma.deleteAccountTitle')}</Text>
            <Text style={s.confirmText}>{t('firma.deleteAccountConfirmText')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.line }]} onPress={() => setShowConfirmDeleteAccount(false)}><Text style={{ fontWeight: '800', color: theme.colors.text }}>{t('firma.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.red }, deleteAccountBusy && { opacity: 0.6 }]} disabled={deleteAccountBusy} onPress={doDeleteAccount} testID="confirm-delete-account-btn"><Text style={{ fontWeight: '900', color: '#fff' }}>{deleteAccountBusy ? t('firma.deleting') : t('firma.yesDeleteAccount')}</Text></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) { return <Text style={s.sectionH}>{title}</Text>; }

function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const { showToast } = useApp();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 10 }}>{t('firma.dilAciklama')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {LANGUAGES.map((l) => {
          const active = l.code === lang;
          return (
            <TouchableOpacity
              key={l.code}
              onPress={async () => { await setLang(l.code); showToast(t('firma.dilDegisti')); }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: active ? theme.colors.primary : theme.colors.line,
                backgroundColor: active ? theme.colors.primary + '12' : '#fff',
              }}
              testID={`lang-${l.code}`}
            >
              <Text style={{ fontSize: 18 }}>{l.flag}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: active ? '900' : '600', color: active ? theme.colors.primary : theme.colors.text }}>{l.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 10 }, flex ? { flex } : {}]}><Text style={s.label}>{label}</Text>{children}</View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  companyListBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 4, ...theme.shadow.sm },
  compHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  compItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  compItemActive: { backgroundColor: theme.colors.primarySoft },
  compLogo: { width: 34, height: 34, borderRadius: 8 },
  compName: { fontSize: 13, color: theme.colors.text, flex: 1 },
  compNameActive: { fontWeight: '900', color: theme.colors.primary },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 18, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.primary, letterSpacing: 0.5 },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.5 },
  logoBox: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 16, alignItems: 'center', ...theme.shadow.sm },
  logoPreview: { width: 180, height: 90, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  logoPlaceholder: { width: 180, height: 90, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', gap: 4 },
  logoHint: { fontSize: 11, color: theme.colors.textMuted },
  btnPri: { backgroundColor: theme.colors.primary, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...theme.shadow.sm },
  btnPriText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  btnDangerSmall: { width: 48, paddingVertical: 12, backgroundColor: theme.colors.redSoft, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  subLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.primary, marginTop: 6, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 8, lineHeight: 16 },
  hintMuted: { fontSize: 11.5, color: theme.colors.textMuted, fontStyle: 'italic' },
  bankCard: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8 },
  bankHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bankNo: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.4 },
  addDashed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: 12, backgroundColor: theme.colors.primarySoft, marginTop: 2 },
  addDashedText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12.5 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.primaryBorder, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  chipTxt: { fontSize: 11.5, fontWeight: '700', color: theme.colors.primary, maxWidth: 200 },
  addPlusBtn: { width: 48, backgroundColor: theme.colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  systemCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, overflow: 'hidden', ...theme.shadow.sm },
  systemHdr: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  systemName: { fontSize: 14, fontWeight: '900', color: theme.colors.navy },
  systemMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  systemBody: { padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 6 },
  fieldLabel: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  fieldType: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  dragHandle: { width: 20, alignItems: 'center', justifyContent: 'center', opacity: 0.65 },
  reorderCol: { flexDirection: 'column', alignItems: 'center', gap: 2, marginRight: 2 },
  reorderBtn: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: theme.colors.primarySoft },
  reorderBtnDisabled: { backgroundColor: theme.colors.surfaceSoft, opacity: 0.5 },
  addFieldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginTop: 4 },
  addFieldText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  saveBtn: { marginTop: 24, backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: theme.colors.primary, shadowOpacity: 0.35 },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  deleteCompanyBtn: { marginTop: 12, borderWidth: 1, borderColor: theme.colors.red, borderStyle: 'dashed', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deleteCompanyText: { color: theme.colors.red, fontWeight: '800', fontSize: 12 },
  goCatalogBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 14, ...theme.shadow.sm },
  goCatalogBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5, letterSpacing: 0.2 },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 30 },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.navy },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: '#fff' },
  typeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  typeChipTextActive: { color: '#fff' },
  confirmBox: { backgroundColor: '#fff', padding: 20, borderRadius: 16, alignItems: 'center', ...theme.shadow.lg },
  confirmTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.navy, marginTop: 8 },
  confirmText: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  supportBox: { marginBottom: 4 },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 14 },
  whatsappBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  assistantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 14, marginTop: 10 },
  assistantBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  subscriptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginTop: 10 },
  subscriptionBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  remindersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  remindersBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  reportsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  reportsBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
});

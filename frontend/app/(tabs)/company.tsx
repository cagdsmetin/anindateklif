import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
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
import { useLanguage, LANGUAGES, upper } from '@/src/lib/i18n';
import { useAppTheme } from '@/src/lib/theme-context';
import TopHeader from '@/src/components/TopHeader';
import { api, BankAccountT, CompanyT } from '@/src/lib/api';
import { BubbleButton, IconBadge, MotionInput, MotionScrollView, Reveal, ScreenHero, alpha, hashColor, readableOn, themedStyles, useViewportProgress } from '@/src/components/motion';
import AnimatedPressable from '@/src/components/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';

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
        <MotionScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 1100, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled"
          progressColors={[theme.colors.modules.firma, theme.colors.primary, '#A855F7']}
        >
          <ScreenHero
            icon="business"
            title={t('firma.headerTitle')}
            subtitle={activeCompany?.sirketAdi}
            color={theme.colors.primary}
            stats={
              user?.is_staff
                ? undefined
                : [
                    { label: t('firma.myCompanies'), value: companies.length },
                    { label: t('firma.bankAccounts'), value: (form.banklar || []).length },
                  ]
            }
          />
          {!user?.is_staff && (
            <>
            {/* Companies list */}
            <Reveal>
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
                      <View style={[s.compLogo, { backgroundColor: hashColor(c.sirketAdi || c.id), alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={[s.compLogoLetter, { color: readableOn(hashColor(c.sirketAdi || c.id)) }]}>{(c.sirketAdi || '?').trim().charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={[s.compName, active && s.compNameActive]} numberOfLines={1}>{c.sirketAdi}</Text>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? theme.colors.primary : theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
            </Reveal>
            {/* Logo */}
            <SectionHeader title={t('firma.companyLogo')} icon="image" />
            {/* Logo: dar ve yatay -- önizleme solda, işlemler sağda. Eskiden
                sayfanın yarısını kaplayan büyük bir kutuydu. */}
            <Reveal>
              <View style={s.logoBox}>
                {form.logoBase64 ? (
                  <Image source={{ uri: form.logoBase64 }} style={s.logoPreview} resizeMode="contain" />
                ) : (
                  <View style={s.logoPlaceholder}>
                    <Ionicons name="image-outline" size={22} color={theme.colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.logoTitle} numberOfLines={1}>
                    {form.logoBase64 ? t('firma.companyLogo') : t('firma.logoNotUploaded')}
                  </Text>
                  <Text style={s.logoHint} numberOfLines={2}>PDF tekliflerin üst kısmında görünür.</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <BubbleButton
                      icon="cloud-upload"
                      label={form.logoBase64 ? t('firma.changeLogo') : t('firma.uploadLogo')}
                      color={theme.colors.primary}
                      onPress={pickLogo}
                      testID="pick-logo-btn"
                      labelStyle={{ fontSize: 12.5 }}
                    />
                    {form.logoBase64 && (
                      <TouchableOpacity style={s.btnDangerSmall} onPress={removeLogo}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </Reveal>

            {/* Info */}
            <SectionHeader title={t('firma.companyInfo')} icon="business" />
            <View style={s.formCard}>
            <Field label={t('firma.companyName')}><MotionInput style={s.input} value={form.sirketAdi} onChangeText={(v) => setForm({ ...form, sirketAdi: v })} testID="company-name-input" /></Field>
            <Field label={t('firma.address')}><MotionInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={form.adres} onChangeText={(v) => setForm({ ...form, adres: v })} testID="company-address-input" /></Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label={t('firma.phone')} flex={1}><MotionInput style={s.input} value={form.telefon} onChangeText={(v) => setForm({ ...form, telefon: v })} testID="company-phone-input" /></Field>
              <Field label={t('firma.phone2')} flex={1}><MotionInput style={s.input} value={form.telefon2} onChangeText={(v) => setForm({ ...form, telefon2: v })} /></Field>
            </View>
            <Field label={t('firma.email')}><MotionInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} testID="company-email-input" /></Field>
            <Field label={t('firma.website')}><MotionInput style={s.input} autoCapitalize="none" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} /></Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Field label={t('firma.taxOffice')} flex={1}><MotionInput style={s.input} value={form.vergiDairesi} onChangeText={(v) => setForm({ ...form, vergiDairesi: v })} /></Field>
              <Field label={t('firma.taxNo')} flex={1}><MotionInput style={s.input} value={form.vergiNo} onChangeText={(v) => setForm({ ...form, vergiNo: v })} /></Field>
            </View>

            </View>

            {/* Bank Accounts */}
            <SectionHeader title={t('firma.bankAccounts')} icon="card" />
            <Text style={s.hint}>{t('firma.bankAccountsHint')}</Text>
            {(form.banklar || []).map((b) => (
              <View key={b.id} style={s.bankCard}>
                <View style={s.bankHdr}>
                  <Text style={s.bankNo}>{t('firma.bank')}</Text>
                  <TouchableOpacity onPress={() => removeBank(b.id)}><Ionicons name="close-circle" size={20} color={theme.colors.red} /></TouchableOpacity>
                </View>
                <MotionInput style={[s.input, { marginBottom: 6 }]} placeholder={t('firma.bankTypePlaceholder')} placeholderTextColor="#94a3b8" value={b.turu} onChangeText={(v) => updateBank(b.id, { turu: v })} />
                <MotionInput style={[s.input, { marginBottom: 6 }]} placeholder={t('firma.accountHolder')} placeholderTextColor="#94a3b8" value={b.hesapSahibi} onChangeText={(v) => updateBank(b.id, { hesapSahibi: v })} />
                <MotionInput style={s.input} placeholder={t('firma.ibanPlaceholder')} placeholderTextColor="#94a3b8" value={b.iban} onChangeText={(v) => updateBank(b.id, { iban: v })} autoCapitalize="characters" />
              </View>
            ))}
            <TouchableOpacity style={s.addDashed} onPress={addBank} testID="add-bank-btn">
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={s.addDashedText}>{t('firma.addBankAccount')}</Text>
            </TouchableOpacity>

            <Reveal variant="scale">
              <TouchableOpacity style={s.saveBtn} onPress={save} testID="save-company-btn" activeOpacity={0.9}>
                <LinearGradient
                  colors={['#6366F1', '#4F46E5', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={s.saveBtnText}>{t('firma.saveCompanyInfo')}</Text>
              </TouchableOpacity>
            </Reveal>

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
              <SectionHeader title={t('firma.companyLogo')} icon="image" />
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
          <SectionHeader title={t('firma.appLanguage')} icon="language" />
          <LanguageSwitcher />

          {/* Görünüm — açık/koyu tema. Dil ile aynı desen: seçim backend'e
              (User.theme) kaydedilir, tüm cihazlarda aynı temada açılır. */}
          <SectionHeader title="Görünüm" icon="color-palette" />
          <ThemeSwitcher />

          {/* Hesabım — e-posta + telefon doğrulama */}
          <SectionHeader title={t('firma.myAccount')} icon="person-circle" />
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
          {/* Kısayollar -- Panel'deki modül karolarıyla aynı dil: renkli
              gradyan ikon rozeti, kaydırdıkça sırayla beliren kartlar.
              (Google Play / App Store zorunluluğu: gizlilik politikası
              uygulama içinden de erişilebilir kalmalı.) */}
          <View style={s.tileGrid}>
            {[
              { key: 'reminders', icon: 'notifications' as const, label: t('firma.reminders'), color: theme.colors.modules.hatirlatma, onPress: () => router.push('/reminders'), testID: 'reminders-btn' },
              { key: 'reports', icon: 'bar-chart' as const, label: t('firma.reports'), color: theme.colors.modules.raporlar, onPress: () => router.push('/reports'), testID: 'reports-btn' },
              { key: 'whatsapp', icon: 'logo-whatsapp' as const, label: t('firma.writeWhatsapp'), color: '#16A34A', onPress: () => Linking.openURL('https://wa.me/905415858988'), testID: 'whatsapp-support-btn' },
              { key: 'assistant', icon: 'sparkles' as const, label: t('firma.talkToAssistant'), color: theme.colors.modules.mesaj, onPress: () => router.push('/(tabs)/assistant'), testID: 'ai-assistant-btn' },
              { key: 'subscription', icon: 'star' as const, label: t('firma.subscriptionManagement'), color: theme.colors.gold, onPress: () => router.push('/subscription'), testID: 'subscription-btn' },
              { key: 'privacy', icon: 'shield-checkmark' as const, label: t('firma.privacyPolicy'), color: theme.colors.modules.firma, onPress: () => router.push('/privacy'), testID: 'privacy-policy-btn' },
            ].map((item, i) => (
              <Reveal key={item.key} variant="tilt" style={s.tileCell}>
                <AnimatedPressable style={s.tile} onPress={item.onPress} testID={item.testID} scaleTo={0.95}>
                  <LinearGradient
                    colors={[alpha(item.color, 0.14), alpha(item.color, 0)] as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <IconBadge icon={item.icon} color={item.color} size={40} motion="pop" />
                  <Text style={s.tileLabel} numberOfLines={2}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} style={s.tileChevron} />
                </AnimatedPressable>
              </Reveal>
            ))}
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
              <BubbleButton
                icon="trash"
                label={t('firma.deletePermanently')}
                color={theme.colors.red}
                variant="soft"
                onPress={() => setShowConfirmDeleteAccount(true)}
                testID="delete-account-btn"
              />
            </View>
          </View>
        </MotionScrollView>
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

// Bölüm başlığı -- altındaki ince çizgi, bölüm ekrana girerken soldan sağa
// dolar (Panel'deki SectionTitle ile aynı dil).
function SectionHeader({ title, icon = 'ellipse' }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const ref = useAnimatedRef<Animated.View>();
  const p = useViewportProgress(ref, { from: 0.96, to: 0.62 });
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.02, p.value) }] }));
  return (
    <Animated.View ref={ref} collapsable={false} style={s.sectionWrap}>
      <View style={s.sectionRow}>
        <View style={s.sectionIcon}>
          <Ionicons name={icon} size={12} color={theme.colors.primary} />
        </View>
        <Text style={s.sectionH}>{upper(title)}</Text>
      </View>
      <Animated.View style={[s.sectionLine, lineStyle]}>
        <LinearGradient
          colors={[theme.colors.primary, alpha(theme.colors.primary, 0)] as [string, string]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

function ThemeSwitcher() {
  const { mode, setMode } = useAppTheme();
  const { showToast } = useApp();
  const OPTIONS: { code: 'light' | 'dark'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { code: 'light', label: 'Açık', icon: 'sunny-outline' },
    { code: 'dark', label: 'Koyu', icon: 'moon-outline' },
  ];
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 10 }}>
        Uygulamanın açık veya koyu renk temasıyla açılmasını seçin. Tercih hesabınıza kaydedilir, tüm cihazlarda aynı temada açılır.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {OPTIONS.map((o) => {
          const active = o.code === mode;
          return (
            <TouchableOpacity
              key={o.code}
              onPress={async () => { await setMode(o.code); showToast('Tema değiştirildi'); }}
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
                backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
              }}
              testID={`theme-${o.code}`}
            >
              <Ionicons name={o.icon} size={16} color={active ? theme.colors.primary : theme.colors.textMuted} />
              <Text style={{ fontSize: 12.5, fontWeight: active ? '900' : '600', color: active ? theme.colors.primary : theme.colors.text }}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

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
                backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceSoft,
              }}
              testID={`lang-${l.code}`}
            >
              <Text style={{ fontSize: 18, color: theme.colors.text }}>{l.flag}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: active ? '900' : '600', color: active ? theme.colors.primary : theme.colors.text }}>{l.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 10 }, flex ? { flex } : {}]}><Text style={s.label}>{upper(label)}</Text>{children}</View>;
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  companyListBox: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 4, ...theme.shadow.sm },
  compHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  compItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  compItemActive: { backgroundColor: theme.colors.primarySoft },
  compLogo: { width: 34, height: 34, borderRadius: 8 },
  compName: { fontSize: 13, color: theme.colors.text, flex: 1 },
  compNameActive: { fontWeight: '900', color: theme.colors.primary },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 13,
    ...theme.shadow.sm,
  },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tileCell: { width: '48%', flexGrow: 1 },
  tile: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 14,
    gap: 10,
    minHeight: 112,
    overflow: 'hidden',
    ...theme.shadow.sm,
  },
  tileLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text, lineHeight: 17 },
  tileChevron: { position: 'absolute', top: 14, right: 12, opacity: 0.6 },
  compLogoLetter: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sectionWrap: { marginTop: 20, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 22, height: 22, borderRadius: 7, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionLine: { height: 2, borderRadius: 1, marginTop: 8, overflow: 'hidden', transformOrigin: 'left' },
  sectionH: { fontSize: 11.5, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.6, },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.5 },
  logoBox: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.line, padding: 13, ...theme.shadow.sm },
  logoPreview: { width: 92, height: 62, borderRadius: 12, backgroundColor: theme.colors.surfaceSoft },
  logoPlaceholder: { width: 92, height: 62, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  logoTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  logoHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, lineHeight: 15 },
  btnPri: { backgroundColor: theme.colors.primary, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...theme.shadow.sm },
  btnPriText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  btnDangerSmall: { width: 42, borderRadius: 999, backgroundColor: theme.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4 },
  subLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.primary, marginTop: 6, marginBottom: 4, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
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
  systemCard: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, overflow: 'hidden', ...theme.shadow.sm },
  systemHdr: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  systemName: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  systemMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  systemBody: { padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 6 },
  fieldLabel: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  fieldType: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  dragHandle: { width: 20, alignItems: 'center', justifyContent: 'center', opacity: 0.65 },
  reorderCol: { flexDirection: 'column', alignItems: 'center', gap: 2, marginRight: 2 },
  reorderBtn: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: theme.colors.primarySoft },
  reorderBtnDisabled: { backgroundColor: theme.colors.surfaceSoft, opacity: 0.5 },
  addFieldBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginTop: 4 },
  addFieldText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  saveBtn: { marginTop: 20, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  deleteCompanyBtn: { marginTop: 12, borderWidth: 1, borderColor: theme.colors.red, borderStyle: 'dashed', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deleteCompanyText: { color: theme.colors.red, fontWeight: '800', fontSize: 12 },
  goCatalogBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 14, ...theme.shadow.sm },
  goCatalogBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5, letterSpacing: 0.2 },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 30 },
  modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.colors.line, padding: 18, maxHeight: '90%', boxShadow: '0 -18px 50px rgba(2,6,23,0.35)' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  typeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  typeChipTextActive: { color: '#fff' },
  confirmBox: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: 16, alignItems: 'center', ...theme.shadow.lg },
  confirmTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text, marginTop: 8 },
  confirmText: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  supportBox: { marginBottom: 4 },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', paddingVertical: 14, borderRadius: 14 },
  whatsappBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  assistantBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 14, marginTop: 10 },
  assistantBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  subscriptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginTop: 10 },
  subscriptionBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  remindersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  remindersBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
  reportsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.primaryBorder, paddingVertical: 14, borderRadius: 14, marginBottom: 10 },
  reportsBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 0.2 },
}));

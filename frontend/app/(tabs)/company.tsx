import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
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
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { CompanyT } from '@/src/lib/api';

export default function CompanyScreen() {
  const {
    companies,
    activeCompany,
    setActiveCompanyId,
    createCompany,
    updateCompany,
    deleteCompany,
    showToast,
  } = useApp();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState<CompanyT | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (activeCompany) setForm({ ...activeCompany });
  }, [activeCompany]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Fotoğraf izni gerekli');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const b64 = asset.base64 ? `data:image/${asset.uri.endsWith('.png') ? 'png' : 'jpeg'};base64,${asset.base64}` : '';
    if (!b64) {
      showToast('Görsel okunamadı');
      return;
    }
    setForm((f) => (f ? { ...f, logoBase64: b64 } : f));
  };

  const removeLogo = () => setForm((f) => (f ? { ...f, logoBase64: '' } : f));

  const save = async () => {
    if (!form) return;
    if (!form.sirketAdi.trim()) {
      showToast('Firma adı zorunlu');
      return;
    }
    try {
      await updateCompany(form.id, form);
      showToast('Firma bilgileri kaydedildi');
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const addEmail = () => {
    if (!newEmail.trim() || !form) return;
    if (form.hazirlayanEmails?.includes(newEmail.trim())) {
      showToast('Bu email zaten var');
      return;
    }
    setForm({ ...form, hazirlayanEmails: [...(form.hazirlayanEmails || []), newEmail.trim()] });
    setNewEmail('');
  };
  const removeEmail = (em: string) => {
    if (!form) return;
    setForm({ ...form, hazirlayanEmails: (form.hazirlayanEmails || []).filter((e) => e !== em) });
  };

  const createNewCompany = async () => {
    try {
      const created = await createCompany({ sirketAdi: 'Yeni Firma' });
      await setActiveCompanyId(created.id);
      showToast('Yeni firma oluşturuldu');
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const doDelete = async () => {
    if (!form) return;
    try {
      await deleteCompany(form.id);
      setShowConfirmDelete(false);
      showToast('Firma silindi');
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  if (!form) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Firma Yönetimi" />
        <View style={s.empty}>
          <Text style={s.emptyText}>Firma yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Firma Yönetimi" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Company selector */}
          <View style={s.companyListBox}>
            <View style={s.compHdr}>
              <Text style={s.sectionH}>KAYITLI FİRMALARIM ({companies.length})</Text>
              <TouchableOpacity onPress={createNewCompany} testID="add-company-btn">
                <Ionicons name="add-circle" size={22} color={theme.colors.accent} />
              </TouchableOpacity>
            </View>
            {companies.map((c) => {
              const active = c.id === activeCompany?.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  testID={`switch-company-${c.id}`}
                  style={[s.compItem, active && s.compItemActive]}
                  onPress={() => setActiveCompanyId(c.id)}
                >
                  {c.logoBase64 ? (
                    <Image source={{ uri: c.logoBase64 }} style={s.compLogo} />
                  ) : (
                    <View style={[s.compLogo, { backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="business-outline" size={16} color={theme.colors.accent} />
                    </View>
                  )}
                  <Text style={[s.compName, active && s.compNameActive]} numberOfLines={1}>
                    {c.sirketAdi}
                  </Text>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={active ? theme.colors.accent : theme.colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Logo */}
          <Text style={s.sectionH}>ŞİRKET LOGOSU</Text>
          <View style={s.logoBox}>
            {form.logoBase64 ? (
              <Image source={{ uri: form.logoBase64 }} style={s.logoPreview} resizeMode="contain" />
            ) : (
              <View style={s.logoPlaceholder}>
                <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                <Text style={s.logoHint}>Logo yüklenmedi</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[s.btnAcc, { flex: 1 }]} onPress={pickLogo} testID="pick-logo-btn">
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={s.btnAccText}>{form.logoBase64 ? 'Logo Değiştir' : 'Logo Yükle'}</Text>
              </TouchableOpacity>
              {form.logoBase64 && (
                <TouchableOpacity style={s.btnGhost} onPress={removeLogo} testID="remove-logo-btn">
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Info */}
          <Text style={s.sectionH}>FİRMA BİLGİLERİ</Text>
          <Field label="Firma Adı *">
            <TextInput style={s.input} value={form.sirketAdi} onChangeText={(v) => setForm({ ...form, sirketAdi: v })} testID="company-name-input" />
          </Field>
          <Field label="Adres">
            <TextInput
              style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
              multiline
              value={form.adres}
              onChangeText={(v) => setForm({ ...form, adres: v })}
              testID="company-address-input"
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Telefon" flex={1}>
              <TextInput style={s.input} value={form.telefon} onChangeText={(v) => setForm({ ...form, telefon: v })} testID="company-phone-input" />
            </Field>
            <Field label="Telefon 2" flex={1}>
              <TextInput style={s.input} value={form.telefon2} onChangeText={(v) => setForm({ ...form, telefon2: v })} />
            </Field>
          </View>
          <Field label="E-Posta">
            <TextInput
              style={s.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              testID="company-email-input"
            />
          </Field>
          <Field label="Website">
            <TextInput style={s.input} autoCapitalize="none" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Vergi Dairesi" flex={1}>
              <TextInput style={s.input} value={form.vergiDairesi} onChangeText={(v) => setForm({ ...form, vergiDairesi: v })} />
            </Field>
            <Field label="Vergi No" flex={1}>
              <TextInput style={s.input} value={form.vergiNo} onChangeText={(v) => setForm({ ...form, vergiNo: v })} />
            </Field>
          </View>
          <Field label="Banka Bilgileri">
            <TextInput
              style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              value={form.bankaBilgileri}
              onChangeText={(v) => setForm({ ...form, bankaBilgileri: v })}
              placeholder="Banka adı, IBAN, hesap sahibi..."
              placeholderTextColor="#94a3b8"
              testID="company-bank-input"
            />
          </Field>

          {/* Hazırlayan Emails */}
          <Text style={s.sectionH}>HAZIRLAYAN E-MAIL LİSTESİ</Text>
          <Text style={s.hint}>Teklif hazırlarken hazırlayan alanında görünecek emailler.</Text>
          {(form.hazirlayanEmails || []).map((em) => (
            <View key={em} style={s.emailChip}>
              <Ionicons name="mail-outline" size={14} color={theme.colors.accent} />
              <Text style={s.emailChipText} numberOfLines={1}>{em}</Text>
              <TouchableOpacity onPress={() => removeEmail(em)} testID={`remove-email-${em}`}>
                <Ionicons name="close-circle" size={18} color={theme.colors.red} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="yeni@firma.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              value={newEmail}
              onChangeText={setNewEmail}
              testID="new-email-input"
            />
            <TouchableOpacity style={s.addEmailBtn} onPress={addEmail} testID="add-email-btn">
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.saveBtn} onPress={save} testID="save-company-btn">
            <Ionicons name="checkmark-done" size={18} color={theme.colors.navy} />
            <Text style={s.saveBtnText}>Firma Bilgilerini Kaydet</Text>
          </TouchableOpacity>

          {companies.length > 1 && (
            <TouchableOpacity
              style={s.deleteCompanyBtn}
              onPress={() => setShowConfirmDelete(true)}
              testID="delete-company-btn"
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
              <Text style={s.deleteCompanyText}>Bu Firmayı Sil</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showConfirmDelete} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowConfirmDelete(false)}>
          <View style={s.confirmBox}>
            <Ionicons name="warning" size={30} color={theme.colors.red} />
            <Text style={s.confirmTitle}>Firmayı Sil?</Text>
            <Text style={s.confirmText}>
              &quot;{form.sirketAdi}&quot; firmasına ait tüm ürünler, müşteriler ve teklifler silinecek. Bu işlem geri alınamaz.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.line }]} onPress={() => setShowConfirmDelete(false)}>
                <Text style={{ fontWeight: '700', color: theme.colors.text }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.red }]} onPress={doDelete} testID="confirm-delete-btn">
                <Text style={{ fontWeight: '800', color: '#fff' }}>Evet, Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <View style={[{ marginBottom: 10 }, flex ? { flex } : {}]}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  companyListBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 12,
    marginBottom: 4,
  },
  compHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  compItemActive: { backgroundColor: theme.colors.accentSoft },
  compLogo: { width: 34, height: 34, borderRadius: 6 },
  compName: { fontSize: 13, color: theme.colors.text, flex: 1 },
  compNameActive: { fontWeight: '800', color: theme.colors.accent },
  sectionH: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.accent,
    marginTop: 14,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    letterSpacing: 0.3,
  },
  logoBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 16,
    alignItems: 'center',
  },
  logoPreview: {
    width: 160,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  logoPlaceholder: {
    width: 160,
    height: 90,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.lineDark,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  logoHint: { fontSize: 11, color: theme.colors.textMuted },
  btnAcc: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnAccText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  btnGhost: {
    width: 48,
    paddingVertical: 12,
    backgroundColor: theme.colors.redSoft,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontWeight: '700', color: theme.colors.textSoft, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 13.5,
    color: theme.colors.text,
  },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 8 },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    marginBottom: 6,
  },
  emailChipText: { flex: 1, fontSize: 12.5, color: theme.colors.text, fontWeight: '600' },
  addEmailBtn: {
    width: 48,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.gold,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: { color: theme.colors.navy, fontWeight: '900', fontSize: 13.5, letterSpacing: 0.3 },
  deleteCompanyBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.red,
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteCompanyText: { color: theme.colors.red, fontWeight: '700', fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  confirmBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, alignItems: 'center' },
  confirmTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 8 },
  confirmText: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
});

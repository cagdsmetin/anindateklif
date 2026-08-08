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
import { BankAccountT, CompanyT } from '@/src/lib/api';

export default function CompanyScreen() {
  const {
    companies, activeCompany, setActiveCompanyId,
    createCompany, updateCompany, deleteCompany, showToast,
  } = useApp();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CompanyT | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newMotor, setNewMotor] = useState('');
  const [newLight, setNewLight] = useState('');
  const [newSystem, setNewSystem] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => { if (activeCompany) setForm({ ...activeCompany }); }, [activeCompany]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Fotoğraf izni gerekli'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const b64 = asset.base64 ? `data:image/${asset.uri.endsWith('.png') ? 'png' : 'jpeg'};base64,${asset.base64}` : '';
    if (!b64) { showToast('Görsel okunamadı'); return; }
    setForm((f) => (f ? { ...f, logoBase64: b64 } : f));
  };

  const removeLogo = () => setForm((f) => (f ? { ...f, logoBase64: '' } : f));

  const save = async () => {
    if (!form) return;
    if (!form.sirketAdi.trim()) { showToast('Firma adı zorunlu'); return; }
    try {
      await updateCompany(form.id, form);
      showToast('Firma bilgileri kaydedildi');
    } catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };

  const addToList = (key: 'motorlar' | 'aydinlatmalar' | 'sistemTipleri' | 'hazirlayanEmails', val: string) => {
    if (!form || !val.trim()) return;
    const cur = form[key] || [];
    if (cur.includes(val.trim())) { showToast('Zaten var'); return; }
    setForm({ ...form, [key]: [...cur, val.trim()] } as CompanyT);
  };
  const removeFromList = (key: 'motorlar' | 'aydinlatmalar' | 'sistemTipleri' | 'hazirlayanEmails', val: string) => {
    if (!form) return;
    setForm({ ...form, [key]: (form[key] || []).filter((x) => x !== val) } as CompanyT);
  };

  const addBank = () => {
    if (!form) return;
    const empty: BankAccountT = { id: 'bnk-' + Date.now() + Math.random().toString(36).slice(2, 6), banka: '', turu: '', hesapSahibi: '', iban: '' };
    setForm({ ...form, banklar: [...(form.banklar || []), empty] });
  };
  const updateBank = (id: string, patch: Partial<BankAccountT>) => {
    if (!form) return;
    setForm({ ...form, banklar: (form.banklar || []).map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  };
  const removeBank = (id: string) => {
    if (!form) return;
    setForm({ ...form, banklar: (form.banklar || []).filter((b) => b.id !== id) });
  };

  const createNewCompany = async () => {
    try { const c = await createCompany({ sirketAdi: 'Yeni Firma' }); await setActiveCompanyId(c.id); showToast('Yeni firma oluşturuldu'); }
    catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };
  const doDelete = async () => {
    if (!form) return;
    try { await deleteCompany(form.id); setShowConfirmDelete(false); showToast('Firma silindi'); }
    catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };

  if (!form) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Firma Yönetimi" />
        <View style={s.empty}><Text style={s.emptyText}>Firma yükleniyor...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Firma Yönetimi" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          {/* Company selector */}
          <View style={s.companyListBox}>
            <View style={s.compHdr}>
              <Text style={s.sectionH2}>KAYITLI FİRMALARIM ({companies.length})</Text>
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

          {/* LOGO */}
          <SectionHeader title="ŞİRKET LOGOSU" />
          <View style={s.logoBox}>
            {form.logoBase64 ? <Image source={{ uri: form.logoBase64 }} style={s.logoPreview} resizeMode="contain" /> : (
              <View style={s.logoPlaceholder}>
                <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                <Text style={s.logoHint}>Logo yüklenmedi</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[s.btnPri, { flex: 1 }]} onPress={pickLogo} testID="pick-logo-btn">
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={s.btnPriText}>{form.logoBase64 ? 'Logo Değiştir' : 'Logo Yükle'}</Text>
              </TouchableOpacity>
              {form.logoBase64 && (
                <TouchableOpacity style={s.btnDangerSmall} onPress={removeLogo}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* INFO */}
          <SectionHeader title="FİRMA BİLGİLERİ" />
          <Field label="Firma Adı *"><TextInput style={s.input} value={form.sirketAdi} onChangeText={(v) => setForm({ ...form, sirketAdi: v })} testID="company-name-input" /></Field>
          <Field label="Adres"><TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={form.adres} onChangeText={(v) => setForm({ ...form, adres: v })} testID="company-address-input" /></Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Telefon" flex={1}><TextInput style={s.input} value={form.telefon} onChangeText={(v) => setForm({ ...form, telefon: v })} testID="company-phone-input" /></Field>
            <Field label="Telefon 2" flex={1}><TextInput style={s.input} value={form.telefon2} onChangeText={(v) => setForm({ ...form, telefon2: v })} /></Field>
          </View>
          <Field label="E-Posta"><TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} testID="company-email-input" /></Field>
          <Field label="Website"><TextInput style={s.input} autoCapitalize="none" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} /></Field>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Vergi Dairesi" flex={1}><TextInput style={s.input} value={form.vergiDairesi} onChangeText={(v) => setForm({ ...form, vergiDairesi: v })} /></Field>
            <Field label="Vergi No" flex={1}><TextInput style={s.input} value={form.vergiNo} onChangeText={(v) => setForm({ ...form, vergiNo: v })} /></Field>
          </View>

          {/* ÖZEL NOTLAR */}
          <SectionHeader title="VARSAYILAN ÖZEL NOTLAR (PDF)" />
          <Text style={s.hint}>Her yeni teklif oluşturduğunuzda bu notlar önceden dolu gelir.</Text>
          <TextInput
            style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
            multiline
            value={form.ozelNotlar}
            onChangeText={(v) => setForm({ ...form, ozelNotlar: v })}
            placeholder="Örn: Garanti süresi 2 yıldır. Aksesuar dahildir."
            placeholderTextColor="#94a3b8"
            testID="company-notes-input"
          />

          {/* BANKA HESAPLARI */}
          <SectionHeader title="BANKA HESAPLARI" />
          <Text style={s.hint}>PDF alt kısmında görünür.</Text>
          {(form.banklar || []).map((b) => (
            <View key={b.id} style={s.bankCard} testID={`bank-${b.id}`}>
              <View style={s.bankHdr}>
                <Text style={s.bankNo}>BANKA</Text>
                <TouchableOpacity onPress={() => removeBank(b.id)}><Ionicons name="close-circle" size={20} color={theme.colors.red} /></TouchableOpacity>
              </View>
              <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Banka türü/adı (örn: GARANTİ (TL))" placeholderTextColor="#94a3b8" value={b.turu} onChangeText={(v) => updateBank(b.id, { turu: v })} />
              <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Hesap Sahibi" placeholderTextColor="#94a3b8" value={b.hesapSahibi} onChangeText={(v) => updateBank(b.id, { hesapSahibi: v })} />
              <TextInput style={s.input} placeholder="IBAN (TR ...)" placeholderTextColor="#94a3b8" value={b.iban} onChangeText={(v) => updateBank(b.id, { iban: v })} autoCapitalize="characters" />
            </View>
          ))}
          <TouchableOpacity style={s.addDashed} onPress={addBank} testID="add-bank-btn">
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addDashedText}>Yeni Banka Hesabı Ekle</Text>
          </TouchableOpacity>

          {/* HAZIRLAYAN EMAIL LISTESİ */}
          <SectionHeader title="HAZIRLAYAN E-MAIL LİSTESİ" />
          <ListEditor
            items={form.hazirlayanEmails || []}
            onAdd={() => { addToList('hazirlayanEmails', newEmail); setNewEmail(''); }}
            onRemove={(v) => removeFromList('hazirlayanEmails', v)}
            value={newEmail}
            onChangeValue={setNewEmail}
            placeholder="yeni@firma.com"
            keyboardType="email-address"
            iconName="mail-outline"
            testIdPrefix="hzr"
          />

          {/* MOTOR */}
          <SectionHeader title="MOTOR SEÇENEKLERİ" />
          <ListEditor
            items={form.motorlar || []}
            onAdd={() => { addToList('motorlar', newMotor); setNewMotor(''); }}
            onRemove={(v) => removeFromList('motorlar', v)}
            value={newMotor}
            onChangeValue={setNewMotor}
            placeholder="Örn: Mosel"
            iconName="cog-outline"
            testIdPrefix="motor"
          />

          {/* AYDINLATMA */}
          <SectionHeader title="AYDINLATMA SEÇENEKLERİ" />
          <ListEditor
            items={form.aydinlatmalar || []}
            onAdd={() => { addToList('aydinlatmalar', newLight); setNewLight(''); }}
            onRemove={(v) => removeFromList('aydinlatmalar', v)}
            value={newLight}
            onChangeValue={setNewLight}
            placeholder="Örn: Günışığı"
            iconName="bulb-outline"
            testIdPrefix="light"
          />

          {/* SİSTEM TİPLERİ */}
          <SectionHeader title="SİSTEM TİPLERİ" />
          <ListEditor
            items={form.sistemTipleri || []}
            onAdd={() => { addToList('sistemTipleri', newSystem); setNewSystem(''); }}
            onRemove={(v) => removeFromList('sistemTipleri', v)}
            value={newSystem}
            onChangeValue={setNewSystem}
            placeholder="Örn: Pistonlu Bioklimatik Sistem"
            iconName="cube-outline"
            testIdPrefix="sistem"
          />

          <TouchableOpacity style={s.saveBtn} onPress={save} testID="save-company-btn">
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={s.saveBtnText}>Firma Bilgilerini Kaydet</Text>
          </TouchableOpacity>

          {companies.length > 1 && (
            <TouchableOpacity style={s.deleteCompanyBtn} onPress={() => setShowConfirmDelete(true)} testID="delete-company-btn">
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
            <Text style={s.confirmText}>&quot;{form.sirketAdi}&quot; firmasının tüm verileri silinecek.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.line }]} onPress={() => setShowConfirmDelete(false)}>
                <Text style={{ fontWeight: '800', color: theme.colors.text }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.red }]} onPress={doDelete} testID="confirm-delete-btn">
                <Text style={{ fontWeight: '900', color: '#fff' }}>Evet, Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) { return <Text style={s.sectionH}>{title}</Text>; }
function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 10 }, flex ? { flex } : {}]}><Text style={s.label}>{label}</Text>{children}</View>;
}

function ListEditor({
  items, onAdd, onRemove, value, onChangeValue, placeholder, iconName, testIdPrefix, keyboardType,
}: {
  items: string[]; onAdd: () => void; onRemove: (v: string) => void;
  value: string; onChangeValue: (v: string) => void;
  placeholder: string; iconName: any; testIdPrefix: string; keyboardType?: any;
}) {
  return (
    <>
      <View style={s.chipList}>
        {items.map((v) => (
          <View key={v} style={s.chip} testID={`${testIdPrefix}-chip-${v}`}>
            <Ionicons name={iconName} size={12} color={theme.colors.primary} />
            <Text style={s.chipTxt} numberOfLines={1}>{v}</Text>
            <TouchableOpacity onPress={() => onRemove(v)}><Ionicons name="close" size={13} color={theme.colors.red} /></TouchableOpacity>
          </View>
        ))}
        {items.length === 0 && <Text style={s.hintMuted}>Henüz eklenmedi</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeValue}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          keyboardType={keyboardType}
          testID={`${testIdPrefix}-input`}
        />
        <TouchableOpacity style={s.addPlusBtn} onPress={onAdd} testID={`${testIdPrefix}-add-btn`}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  );
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
  sectionH: {
    fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 18, marginBottom: 8, paddingBottom: 5,
    borderBottomWidth: 2, borderBottomColor: theme.colors.primary, letterSpacing: 0.5,
  },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.5 },
  logoBox: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 16, alignItems: 'center', ...theme.shadow.sm },
  logoPreview: { width: 180, height: 90, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  logoPlaceholder: { width: 180, height: 90, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', gap: 4 },
  logoHint: { fontSize: 11, color: theme.colors.textMuted },
  btnPri: {
    backgroundColor: theme.colors.primary, paddingVertical: 12, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...theme.shadow.sm,
  },
  btnPriText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  btnDangerSmall: { width: 48, paddingVertical: 12, backgroundColor: theme.colors.redSoft, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text,
  },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 8 },
  hintMuted: { fontSize: 11.5, color: theme.colors.textMuted, fontStyle: 'italic' },
  bankCard: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8 },
  bankHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bankNo: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.4 },
  addDashed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: 12,
    backgroundColor: theme.colors.primarySoft, marginTop: 2,
  },
  addDashedText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12.5 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primarySoft, borderWidth: 1, borderColor: theme.colors.primaryBorder, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  chipTxt: { fontSize: 11.5, fontWeight: '700', color: theme.colors.primary, maxWidth: 220 },
  addPlusBtn: { width: 48, backgroundColor: theme.colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: {
    marginTop: 24, backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    ...theme.shadow.md, shadowColor: theme.colors.primary, shadowOpacity: 0.35,
  },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  deleteCompanyBtn: {
    marginTop: 12, borderWidth: 1, borderColor: theme.colors.red, borderStyle: 'dashed',
    paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  deleteCompanyText: { color: theme.colors.red, fontWeight: '800', fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 30 },
  confirmBox: { backgroundColor: '#fff', padding: 20, borderRadius: 16, alignItems: 'center', ...theme.shadow.lg },
  confirmTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.navy, marginTop: 8 },
  confirmText: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
});

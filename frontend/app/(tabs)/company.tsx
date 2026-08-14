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
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { BankAccountT, CompanyT, SystemField, SystemTypeDefT } from '@/src/lib/api';

const FIELD_TYPES: { value: SystemField['type']; label: string; icon: any }[] = [
  { value: 'text', label: 'Metin', icon: 'text-outline' },
  { value: 'number', label: 'Sayı', icon: 'calculator-outline' },
  { value: 'select', label: 'Liste', icon: 'list-outline' },
  { value: 'checkbox', label: 'Onay', icon: 'checkbox-outline' },
];

const uid = () => 'x-' + Date.now() + Math.random().toString(36).slice(2, 8);

export default function CompanyScreen() {
  const { companies, activeCompany, setActiveCompanyId, createCompany, updateCompany, deleteCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CompanyT | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [expandedSystem, setExpandedSystem] = useState<string | null>(null);
  const [newSystemName, setNewSystemName] = useState('');
  const [showAddField, setShowAddField] = useState<string | null>(null); // system id
  const [newField, setNewField] = useState<{ label: string; type: SystemField['type']; options: string[]; optionInput: string }>({ label: '', type: 'text', options: [], optionInput: '' });

  useEffect(() => { if (activeCompany) setForm({ ...activeCompany }); }, [activeCompany]);

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('Fotoğraf izni gerekli'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: true });
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
    try { await updateCompany(form.id, form); showToast('Firma bilgileri kaydedildi'); }
    catch (e: any) { showToast('Hata: ' + (e?.message || '')); }
  };

  const addEmail = () => {
    if (!form || !newEmail.trim()) return;
    if (form.hazirlayanEmails?.includes(newEmail.trim())) { showToast('Bu email zaten var'); return; }
    setForm({ ...form, hazirlayanEmails: [...(form.hazirlayanEmails || []), newEmail.trim()] });
    setNewEmail('');
  };
  const removeEmail = (em: string) => form && setForm({ ...form, hazirlayanEmails: (form.hazirlayanEmails || []).filter((e) => e !== em) });

  // Bank management
  const addBank = () => {
    if (!form) return;
    setForm({ ...form, banklar: [...(form.banklar || []), { id: uid(), banka: '', turu: '', hesapSahibi: '', iban: '' }] });
  };
  const updateBank = (id: string, patch: Partial<BankAccountT>) => form && setForm({ ...form, banklar: (form.banklar || []).map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const removeBank = (id: string) => form && setForm({ ...form, banklar: (form.banklar || []).filter((b) => b.id !== id) });

  // System Configurator
  const addSystemType = () => {
    if (!form || !newSystemName.trim()) return;
    const s: SystemTypeDefT = { id: uid(), name: newSystemName.trim(), fields: [] };
    setForm({ ...form, sistemTipleri: [...(form.sistemTipleri || []), s] });
    setNewSystemName('');
    setExpandedSystem(s.id);
  };
  const updateSystemName = (id: string, name: string) => form && setForm({ ...form, sistemTipleri: (form.sistemTipleri || []).map((s) => (s.id === id ? { ...s, name } : s)) });
  const removeSystemType = (id: string) => form && setForm({ ...form, sistemTipleri: (form.sistemTipleri || []).filter((s) => s.id !== id) });

  const openAddField = (sysId: string) => {
    setShowAddField(sysId);
    setNewField({ label: '', type: 'text', options: [], optionInput: '' });
  };
  const commitAddField = () => {
    if (!form || !showAddField || !newField.label.trim()) { showToast('Alan adı zorunlu'); return; }
    const field: SystemField = {
      id: uid(),
      label: newField.label.trim(),
      type: newField.type,
      options: newField.type === 'select' ? newField.options : [],
    };
    if (newField.type === 'select' && field.options.length === 0) { showToast('Liste tipi için en az bir seçenek ekleyin'); return; }
    setForm({
      ...form,
      sistemTipleri: (form.sistemTipleri || []).map((s) => (s.id === showAddField ? { ...s, fields: [...(s.fields || []), field] } : s)),
    });
    setShowAddField(null);
  };
  const removeField = (sysId: string, fieldId: string) => form && setForm({
    ...form,
    sistemTipleri: (form.sistemTipleri || []).map((s) => (s.id === sysId ? { ...s, fields: (s.fields || []).filter((f) => f.id !== fieldId) } : s)),
  });

  // Reorder a field within its parent system type by swapping positions.
  const moveField = (sysId: string, fromIdx: number, direction: -1 | 1) => {
    if (!form) return;
    setForm({
      ...form,
      sistemTipleri: (form.sistemTipleri || []).map((sys) => {
        if (sys.id !== sysId) return sys;
        const fields = [...(sys.fields || [])];
        const toIdx = fromIdx + direction;
        if (toIdx < 0 || toIdx >= fields.length) return sys;
        [fields[fromIdx], fields[toIdx]] = [fields[toIdx], fields[fromIdx]];
        return { ...sys, fields };
      }),
    });
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
        <View style={s.empty}><Text style={s.emptyText}>Yükleniyor...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Firma Yönetimi" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
          {/* Companies list */}
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
          {/* Support */}
          <SectionHeader title="DESTEK" />
          <View style={s.supportBox}>
            <TouchableOpacity style={s.whatsappBtn} onPress={() => Linking.openURL('https://wa.me/905415858988')} testID="whatsapp-support-btn">
            <Text style={s.whatsappBtnText}>WhatsApp'tan Yaz</Text>
            </TouchableOpacity>
          </View>
          {/* Logo */}
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

          {/* Info */}
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

          {/* Default Notes */}
          <SectionHeader title="VARSAYILAN ÖZEL NOTLAR (PDF)" />
          <Text style={s.hint}>Her yeni teklif oluşturduğunuzda bu notlar önceden dolu gelir.</Text>
          <TextInput style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={form.ozelNotlar} onChangeText={(v) => setForm({ ...form, ozelNotlar: v })} placeholder="Örn: Garanti süresi 2 yıldır." placeholderTextColor="#94a3b8" testID="company-notes-input" />

          {/* Bank Accounts */}
          <SectionHeader title="BANKA HESAPLARI" />
          <Text style={s.hint}>PDF alt kısmında görünür.</Text>
          {(form.banklar || []).map((b) => (
            <View key={b.id} style={s.bankCard}>
              <View style={s.bankHdr}>
                <Text style={s.bankNo}>BANKA</Text>
                <TouchableOpacity onPress={() => removeBank(b.id)}><Ionicons name="close-circle" size={20} color={theme.colors.red} /></TouchableOpacity>
              </View>
              <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Banka türü (örn: GARANTİ (TL))" placeholderTextColor="#94a3b8" value={b.turu} onChangeText={(v) => updateBank(b.id, { turu: v })} />
              <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Hesap Sahibi" placeholderTextColor="#94a3b8" value={b.hesapSahibi} onChangeText={(v) => updateBank(b.id, { hesapSahibi: v })} />
              <TextInput style={s.input} placeholder="IBAN (TR ...)" placeholderTextColor="#94a3b8" value={b.iban} onChangeText={(v) => updateBank(b.id, { iban: v })} autoCapitalize="characters" />
            </View>
          ))}
          <TouchableOpacity style={s.addDashed} onPress={addBank} testID="add-bank-btn">
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addDashedText}>Yeni Banka Hesabı Ekle</Text>
          </TouchableOpacity>

          {/* Hazırlayan Emails */}
          <SectionHeader title="HAZIRLAYAN E-MAIL LİSTESİ" />
          <View style={s.chipList}>
            {(form.hazirlayanEmails || []).map((em) => (
              <View key={em} style={s.emChip}>
                <Ionicons name="mail-outline" size={12} color={theme.colors.primary} />
                <Text style={s.chipTxt} numberOfLines={1}>{em}</Text>
                <TouchableOpacity onPress={() => removeEmail(em)}><Ionicons name="close" size={13} color={theme.colors.red} /></TouchableOpacity>
              </View>
            ))}
            {form.hazirlayanEmails.length === 0 && <Text style={s.hintMuted}>Henüz eklenmedi</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="yeni@firma.com" placeholderTextColor="#94a3b8" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" testID="hzr-input" />
            <TouchableOpacity style={s.addPlusBtn} onPress={addEmail} testID="hzr-add-btn"><Ionicons name="add" size={20} color="#fff" /></TouchableOpacity>
          </View>

          {/* System Configurator — the star of the show */}
          <SectionHeader title="🎯 HİZMET / ÜRÜN YAPILANDIRICI" />
          <Text style={s.hint}>{"Her hizmeti veya ürünü bir kere tanımlayın (Örn: Cam Balkon → Cam Tipi, Profil Rengi, Ölçü, Motor). Teklif oluştururken sadece seçenekleri tıklayarak ilerleyeceksiniz. Alanları sürükleme tutamağıyla yeniden sıralayabilirsiniz — bu sıra hem form hem PDF'de birebir kullanılır."}</Text>

          {(form.sistemTipleri || []).map((sys) => {
            const isExpanded = expandedSystem === sys.id;
            return (
              <View key={sys.id} style={s.systemCard} testID={`system-${sys.id}`}>
                <TouchableOpacity style={s.systemHdr} onPress={() => setExpandedSystem(isExpanded ? null : sys.id)}>
                  <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.systemName}>{sys.name || '(Adsız Hizmet / Ürün)'}</Text>
                    <Text style={s.systemMeta}>{(sys.fields || []).length} alan tanımlı</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeSystemType(sys.id)}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.red} />
                  </TouchableOpacity>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={s.systemBody}>
                    <Field label="Hizmet / Ürün Adı">
                      <TextInput style={s.input} value={sys.name} onChangeText={(v) => updateSystemName(sys.id, v)} placeholder="Örn: Cam Balkon" placeholderTextColor="#94a3b8" />
                    </Field>
                    <Text style={s.subLabel}>ALT ALANLAR ({(sys.fields || []).length})</Text>
                    {(sys.fields || []).length === 0 && <Text style={s.hintMuted}>Henüz alan eklenmedi</Text>}
                    {(sys.fields || []).map((f, fi) => {
                      const typeMeta = FIELD_TYPES.find((t) => t.value === f.type);
                      const isFirst = fi === 0;
                      const isLast = fi === (sys.fields || []).length - 1;
                      return (
                        <View key={f.id} style={s.fieldRow} testID={`field-${f.id}`}>
                          <View style={s.dragHandle} accessibilityLabel="Sıralama tutamağı">
                            <Ionicons name="reorder-two" size={18} color={theme.colors.textMuted} />
                          </View>
                          <Ionicons name={(typeMeta?.icon as any) || 'square-outline'} size={14} color={theme.colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.fieldLabel} numberOfLines={1}>{f.label}</Text>
                            <Text style={s.fieldType}>
                              {typeMeta?.label}{f.type === 'select' && f.options.length ? ` • ${f.options.length} seçenek` : ''}
                            </Text>
                          </View>
                          <View style={s.reorderCol}>
                            <TouchableOpacity
                              disabled={isFirst}
                              onPress={() => moveField(sys.id, fi, -1)}
                              style={[s.reorderBtn, isFirst && s.reorderBtnDisabled]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              testID={`field-${f.id}-up`}
                            >
                              <Ionicons name="chevron-up" size={16} color={isFirst ? theme.colors.line : theme.colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              disabled={isLast}
                              onPress={() => moveField(sys.id, fi, 1)}
                              style={[s.reorderBtn, isLast && s.reorderBtnDisabled]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              testID={`field-${f.id}-down`}
                            >
                              <Ionicons name="chevron-down" size={16} color={isLast ? theme.colors.line : theme.colors.primary} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity onPress={() => removeField(sys.id, f.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle" size={18} color={theme.colors.red} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                    <TouchableOpacity style={s.addFieldBtn} onPress={() => openAddField(sys.id)} testID={`add-field-${sys.id}`}>
                      <Ionicons name="add-circle" size={16} color={theme.colors.primary} />
                      <Text style={s.addFieldText}>+ Alt Alan Ekle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Yeni Hizmet / Ürün Adı (örn: Kış Bahçesi)" placeholderTextColor="#94a3b8" value={newSystemName} onChangeText={setNewSystemName} testID="new-system-input" />
            <TouchableOpacity style={s.addPlusBtn} onPress={addSystemType} testID="add-system-btn"><Ionicons name="add" size={20} color="#fff" /></TouchableOpacity>
          </View>

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

      {/* Add Field Modal */}
      <Modal visible={!!showAddField} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlayBottom}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Yeni Alan Ekle</Text>
              <TouchableOpacity onPress={() => setShowAddField(null)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Alan Adı">
                <TextInput style={s.input} value={newField.label} onChangeText={(v) => setNewField({ ...newField, label: v })} placeholder="Örn: Cam Tipi, Motor Çeşidi" placeholderTextColor="#94a3b8" testID="field-label-input" />
              </Field>
              <Field label="Alan Tipi">
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {FIELD_TYPES.map((t) => {
                    const active = newField.type === t.value;
                    return (
                      <TouchableOpacity key={t.value} testID={`field-type-${t.value}`} style={[s.typeChip, active && s.typeChipActive]} onPress={() => setNewField({ ...newField, type: t.value })}>
                        <Ionicons name={t.icon} size={14} color={active ? '#fff' : theme.colors.textMuted} />
                        <Text style={[s.typeChipText, active && s.typeChipTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>
              {newField.type === 'select' && (
                <>
                  <Field label="Seçenekler">
                    <View style={s.chipList}>
                      {newField.options.map((op) => (
                        <View key={op} style={s.emChip}>
                          <Text style={s.chipTxt}>{op}</Text>
                          <TouchableOpacity onPress={() => setNewField({ ...newField, options: newField.options.filter((o) => o !== op) })}>
                            <Ionicons name="close" size={13} color={theme.colors.red} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {newField.options.length === 0 && <Text style={s.hintMuted}>En az bir seçenek ekleyin</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <TextInput style={[s.input, { flex: 1 }]} placeholder="örn: Isıcam" placeholderTextColor="#94a3b8" value={newField.optionInput} onChangeText={(v) => setNewField({ ...newField, optionInput: v })} testID="field-option-input" />
                      <TouchableOpacity style={s.addPlusBtn} testID="add-option-btn" onPress={() => {
                        const v = newField.optionInput.trim();
                        if (!v || newField.options.includes(v)) return;
                        setNewField({ ...newField, options: [...newField.options, v], optionInput: '' });
                      }}><Ionicons name="add" size={20} color="#fff" /></TouchableOpacity>
                    </View>
                  </Field>
                </>
              )}
              <TouchableOpacity style={s.saveBtn} onPress={commitAddField} testID="save-field-btn">
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Alanı Ekle</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirm */}
      <Modal visible={showConfirmDelete} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowConfirmDelete(false)}>
          <View style={s.confirmBox}>
            <Ionicons name="warning" size={30} color={theme.colors.red} />
            <Text style={s.confirmTitle}>Firmayı Sil?</Text>
            <Text style={s.confirmText}>&quot;{form.sirketAdi}&quot; firmasının tüm verileri silinecek.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.line }]} onPress={() => setShowConfirmDelete(false)}><Text style={{ fontWeight: '800', color: theme.colors.text }}>Vazgeç</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: theme.colors.red }]} onPress={doDelete} testID="confirm-delete-btn"><Text style={{ fontWeight: '900', color: '#fff' }}>Evet, Sil</Text></TouchableOpacity>
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
});

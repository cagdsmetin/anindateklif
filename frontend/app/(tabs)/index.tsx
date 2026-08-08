import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { QuoteItemT, QuoteT } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';

function todayIso() {
  return new Date().toISOString().split('T')[0];
}
function plusDaysIso(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
}
function newTeklifNo() {
  return 'AT-' + Math.floor(100000 + Math.random() * 900000);
}
function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${s} ${sym}`;
}

export default function EditorScreen() {
  const { activeCompany, catalog, customers, saveQuote, showToast, loading } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ quoteId?: string; quoteData?: string }>();
  const { quotes } = useApp();

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [teklifNo, setTeklifNo] = useState(newTeklifNo());
  const [tarih, setTarih] = useState(todayIso());
  const [gecerlilik, setGecerlilik] = useState(plusDaysIso(7));
  const [hazirlayanEmail, setHazirlayanEmail] = useState('');
  const [musFirma, setMusFirma] = useState('');
  const [musYetkili, setMusYetkili] = useState('');
  const [musTelefon, setMusTelefon] = useState('');
  const [musEmail, setMusEmail] = useState('');
  const [musAdres, setMusAdres] = useState('');
  const [projeAdi, setProjeAdi] = useState('');
  const [nakliye, setNakliye] = useState('EXW');
  const [paraBirimi, setParaBirimi] = useState('USD');
  const [odemeSekli, setOdemeSekli] = useState('%50 Peşin - %50 Fab. Teslim');
  const [mensei, setMensei] = useState('TÜRKİYE');
  const [teslimGun, setTeslimGun] = useState('15-20 GÜN');
  const [iskonto, setIskonto] = useState('0');
  const [kdvOrani, setKdvOrani] = useState('20');
  const [notlar, setNotlar] = useState('');
  const [items, setItems] = useState<QuoteItemT[]>([]);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const bootedRef = useRef(false);

  // Load quote if navigated with quoteId
  useEffect(() => {
    if (bootedRef.current) return;
    if (params.quoteId) {
      const q = quotes.find((qq) => qq.id === params.quoteId);
      if (q) {
        loadFromQuote(q);
        bootedRef.current = true;
      }
    }
  }, [params.quoteId, quotes]);

  const loadFromQuote = (q: QuoteT) => {
    setEditingId(q.id);
    setTeklifNo(q.teklifNo);
    setTarih(q.tarih);
    setGecerlilik(q.gecerlilik);
    setHazirlayanEmail(q.hazirlayanEmail);
    setMusFirma(q.musFirma);
    setMusYetkili(q.musYetkili);
    setMusTelefon(q.musTelefon);
    setMusEmail(q.musEmail);
    setMusAdres(q.musAdres);
    setProjeAdi(q.projeAdi);
    setNakliye(q.nakliye);
    setParaBirimi(q.paraBirimi);
    setOdemeSekli(q.odemeSekli);
    setMensei(q.mensei);
    setTeslimGun(q.teslimGun);
    setIskonto(String(q.iskonto));
    setKdvOrani(String(q.kdvOrani));
    setNotlar(q.notlar);
    setItems(q.items);
  };

  const resetForm = useCallback(() => {
    setEditingId(undefined);
    setTeklifNo(newTeklifNo());
    setTarih(todayIso());
    setGecerlilik(plusDaysIso(7));
    setHazirlayanEmail(activeCompany?.hazirlayanEmails?.[0] || '');
    setMusFirma('');
    setMusYetkili('');
    setMusTelefon('');
    setMusEmail('');
    setMusAdres('');
    setProjeAdi('');
    setIskonto('0');
    setKdvOrani('20');
    setNotlar('');
    setItems([]);
    bootedRef.current = false;
  }, [activeCompany]);

  useEffect(() => {
    if (activeCompany && !hazirlayanEmail && activeCompany.hazirlayanEmails?.length) {
      setHazirlayanEmail(activeCompany.hazirlayanEmails[0]);
    }
  }, [activeCompany, hazirlayanEmail]);

  const subtotal = useMemo(
    () => items.reduce((a, it) => a + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0),
    [items]
  );
  const iskontoOr = Number(iskonto) || 0;
  const kdvOr = Number(kdvOrani) || 0;
  const iskontoTutar = (subtotal * iskontoOr) / 100;
  const araToplam = subtotal - iskontoTutar;
  const kdvTutar = (araToplam * kdvOr) / 100;
  const genelToplam = araToplam + kdvTutar;

  const currentQuote = (): Partial<QuoteT> => ({
    teklifNo,
    tarih,
    gecerlilik,
    hazirlayanEmail,
    musFirma,
    musYetkili,
    musTelefon,
    musEmail,
    musAdres,
    projeAdi,
    nakliye,
    paraBirimi,
    odemeSekli,
    mensei,
    teslimGun,
    iskonto: iskontoOr,
    kdvOrani: kdvOr,
    notlar,
    items,
    durum: 'Beklemede',
  });

  const updateItem = (id: string, field: keyof QuoteItemT, val: any) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: val } : it)));
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const addBlankItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: 'it-' + Date.now() + Math.random(),
        kategori: '',
        urunAdi: '',
        aciklama: '',
        adet: 1,
        birim: 'Adet',
        birimFiyat: 0,
      },
    ]);
  };

  const addFromCatalog = (catId: string) => {
    const c = catalog.find((x) => x.id === catId);
    if (!c) return;
    setItems((prev) => [
      ...prev,
      {
        id: 'it-' + Date.now() + Math.random(),
        kategori: c.kategori,
        urunAdi: c.urunAdi,
        aciklama: c.aciklama || '',
        adet: 1,
        birim: c.birim,
        birimFiyat: c.birimFiyat,
      },
    ]);
    setShowCatalogPicker(false);
    showToast('Kalem eklendi');
  };

  const fillFromCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setMusFirma(c.firma);
    setMusYetkili(c.yetkili);
    setMusTelefon(c.telefon);
    setMusEmail(c.email);
    setMusAdres(c.adres);
    setShowCustomerPicker(false);
    showToast('Müşteri bilgileri dolduruldu');
  };

  const handleSave = async (): Promise<QuoteT | null> => {
    if (!activeCompany) {
      showToast('Önce firma seçiniz');
      return null;
    }
    if (!musFirma.trim()) {
      showToast('Müşteri firma adı zorunlu');
      return null;
    }
    setSaving(true);
    try {
      const saved = await saveQuote(currentQuote(), editingId);
      setEditingId(saved.id);
      showToast('Teklif kaydedildi');
      return saved;
    } catch (e: any) {
      showToast('Kayıt hatası: ' + (e?.message || 'bilinmeyen'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const generatePdfUri = async (savedQuote: QuoteT) => {
    if (!activeCompany) throw new Error('Aktif firma yok');
    const html = buildQuotePdfHtml(activeCompany, savedQuote);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    return uri;
  };

  const handleGeneratePdf = async () => {
    const saved = await handleSave();
    if (!saved) return;
    try {
      const uri = await generatePdfUri(saved);
      if (Platform.OS === 'web') {
        showToast('PDF oluşturuldu (web indirmesi başlatıldı)');
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Teklif PDF Paylaş' });
      } else {
        showToast('Paylaşım desteklenmiyor');
      }
    } catch (e: any) {
      showToast('PDF hatası: ' + (e?.message || 'bilinmeyen'));
    }
  };

  const handleShareWhatsApp = async () => {
    const saved = await handleSave();
    if (!saved) return;
    try {
      const uri = await generatePdfUri(saved);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showToast('Paylaşım desteklenmiyor');
        return;
      }
      // Native share sheet — kullanıcı WhatsApp seçer. Message'ı PDF'e gömemeyiz ama başlıktan görünür.
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Teklifiniz ekte yer almaktadır',
        UTI: 'com.adobe.pdf',
      });
    } catch {
      showToast('WhatsApp paylaşım hatası');
    }
  };

  const handlePreview = () => {
    // Save first then navigate
    (async () => {
      const saved = await handleSave();
      if (saved) {
        router.push({ pathname: '/preview', params: { quoteId: saved.id } });
      }
    })();
  };

  const cur = paraBirimi;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingBox}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Text style={s.loadingText}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={editingId ? 'Teklif Düzenleme' : 'Yeni Teklif'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Sticky total banner */}
          <View style={s.totalBanner} testID="grand-total-banner">
            <View style={{ flex: 1 }}>
              <Text style={s.totalLabel}>GENEL TOPLAM ({cur})</Text>
              <Text style={s.totalValue} numberOfLines={1}>{fmt(genelToplam, cur)}</Text>
            </View>
            <View style={s.miniStats}>
              <Text style={s.miniStat}>{items.length} kalem</Text>
              <Text style={s.miniStatSub}>KDV %{kdvOr}</Text>
            </View>
          </View>

          <SectionHeader title="TEKLİF BİLGİLERİ" />
          {activeCompany?.hazirlayanEmails?.length ? (
            <FGroup label="Hazırlayan E-Mail">
              <TouchableOpacity
                style={s.selectBox}
                onPress={() => setShowEmailPicker(true)}
                testID="hazirlayan-email-select"
              >
                <Text style={s.selectText} numberOfLines={1}>{hazirlayanEmail || 'Seçiniz'}</Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </FGroup>
          ) : null}
          <Row>
            <FGroup label="Teklif No" flex={1}>
              <TextInput style={s.input} value={teklifNo} onChangeText={setTeklifNo} testID="teklif-no-input" />
            </FGroup>
            <FGroup label="Tarih" flex={1}>
              <TextInput style={s.input} value={tarih} onChangeText={setTarih} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" testID="tarih-input" />
            </FGroup>
          </Row>
          <FGroup label="Geçerlilik Tarihi">
            <TextInput style={s.input} value={gecerlilik} onChangeText={setGecerlilik} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" testID="gecerlilik-input" />
          </FGroup>

          <SectionHeaderWithAction
            title="MÜŞTERİ BİLGİLERİ"
            actionLabel={customers.length ? `📇 Geçmişten Seç (${customers.length})` : ''}
            onAction={customers.length ? () => setShowCustomerPicker(true) : undefined}
          />
          <FGroup label="Firma Adı">
            <TextInput style={s.input} placeholder="Müşteri firma adı" placeholderTextColor="#9ca3af" value={musFirma} onChangeText={setMusFirma} testID="mus-firma-input" />
          </FGroup>
          <Row>
            <FGroup label="Yetkili" flex={1}>
              <TextInput style={s.input} value={musYetkili} onChangeText={setMusYetkili} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" testID="mus-yetkili-input" />
            </FGroup>
            <FGroup label="Telefon" flex={1}>
              <TextInput style={s.input} value={musTelefon} onChangeText={setMusTelefon} placeholder="+90 5XX ..." placeholderTextColor="#9ca3af" keyboardType="phone-pad" testID="mus-tel-input" />
            </FGroup>
          </Row>
          <FGroup label="E-Mail">
            <TextInput style={s.input} value={musEmail} onChangeText={setMusEmail} placeholder="ornek@firma.com" placeholderTextColor="#9ca3af" keyboardType="email-address" autoCapitalize="none" testID="mus-mail-input" />
          </FGroup>
          <FGroup label="Adres">
            <TextInput style={[s.input, s.multiline]} multiline value={musAdres} onChangeText={setMusAdres} placeholder="Açık adres" placeholderTextColor="#9ca3af" testID="mus-adres-input" />
          </FGroup>

          <SectionHeader title="SİPARİŞ BİLGİLERİ" />
          <FGroup label="Proje Adı">
            <TextInput style={s.input} value={projeAdi} onChangeText={setProjeAdi} placeholder="Proje / iş adı" placeholderTextColor="#9ca3af" testID="proje-adi-input" />
          </FGroup>
          <Row>
            <FGroup label="Para Birimi" flex={1}>
              <View style={s.chipRow}>
                {['USD', 'EUR', 'TRY'].map((c) => (
                  <TouchableOpacity
                    key={c}
                    testID={`cur-${c}`}
                    style={[s.chip, paraBirimi === c && s.chipActive]}
                    onPress={() => setParaBirimi(c)}
                  >
                    <Text style={[s.chipText, paraBirimi === c && s.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FGroup>
            <FGroup label="Nakliye" flex={1}>
              <View style={s.chipRow}>
                {['EXW', 'FOB', 'CIF', 'DAP'].map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[s.chip, nakliye === c && s.chipActive]}
                    onPress={() => setNakliye(c)}
                  >
                    <Text style={[s.chipText, nakliye === c && s.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </FGroup>
          </Row>
          <FGroup label="Ödeme Şekli">
            <TextInput style={s.input} value={odemeSekli} onChangeText={setOdemeSekli} testID="odeme-input" />
          </FGroup>
          <Row>
            <FGroup label="Menşei" flex={1}>
              <TextInput style={s.input} value={mensei} onChangeText={setMensei} />
            </FGroup>
            <FGroup label="Teslim" flex={1}>
              <TextInput style={s.input} value={teslimGun} onChangeText={setTeslimGun} />
            </FGroup>
          </Row>
          <Row>
            <FGroup label="İskonto (%)" flex={1}>
              <TextInput style={s.input} keyboardType="numeric" value={iskonto} onChangeText={setIskonto} testID="iskonto-input" />
            </FGroup>
            <FGroup label="KDV (%)" flex={1}>
              <TextInput style={s.input} keyboardType="numeric" value={kdvOrani} onChangeText={setKdvOrani} testID="kdv-input" />
            </FGroup>
          </Row>

          <SectionHeader title={`ÜRÜN / HİZMET KALEMLERİ (${items.length})`} />
          {items.length === 0 && (
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={22} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Henüz kalem eklenmedi. Katalogdan seçin veya boş kalem ekleyin.</Text>
            </View>
          )}
          {items.map((it, idx) => {
            const line = (it.adet || 0) * (it.birimFiyat || 0);
            return (
              <View key={it.id} style={s.itemCard} testID={`quote-item-${idx}`}>
                <View style={s.itemHdr}>
                  <Text style={s.itemHdrText}>Kalem #{idx + 1}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.itemLineTotal}>{fmt(line, cur)}</Text>
                    <TouchableOpacity onPress={() => removeItem(it.id)} testID={`remove-item-${idx}`}>
                      <Ionicons name="close-circle" size={20} color={theme.colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
                <TextInput
                  style={s.input}
                  placeholder="Ürün / Hizmet Adı"
                  placeholderTextColor="#9ca3af"
                  value={it.urunAdi}
                  onChangeText={(v) => updateItem(it.id, 'urunAdi', v)}
                  testID={`item-name-${idx}`}
                />
                <TextInput
                  style={[s.input, s.multiline, { marginTop: 6 }]}
                  placeholder="Açıklama (opsiyonel)"
                  placeholderTextColor="#9ca3af"
                  value={it.aciklama}
                  onChangeText={(v) => updateItem(it.id, 'aciklama', v)}
                  multiline
                />
                <Row style={{ marginTop: 6 }}>
                  <FGroup label="Adet" flex={1}>
                    <TextInput
                      style={s.input}
                      keyboardType="numeric"
                      value={String(it.adet)}
                      onChangeText={(v) => updateItem(it.id, 'adet', v.replace(',', '.'))}
                      testID={`item-qty-${idx}`}
                    />
                  </FGroup>
                  <FGroup label="Birim" flex={1}>
                    <TextInput style={s.input} value={it.birim} onChangeText={(v) => updateItem(it.id, 'birim', v)} />
                  </FGroup>
                  <FGroup label={`Fiyat`} flex={1.2}>
                    <TextInput
                      style={s.input}
                      keyboardType="numeric"
                      value={String(it.birimFiyat)}
                      onChangeText={(v) => updateItem(it.id, 'birimFiyat', v.replace(',', '.'))}
                      testID={`item-price-${idx}`}
                    />
                  </FGroup>
                </Row>
              </View>
            );
          })}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              style={[s.addBtn, { flex: 1 }]}
              onPress={() => setShowCatalogPicker(true)}
              testID="add-from-catalog-btn"
            >
              <Ionicons name="library-outline" size={16} color={theme.colors.accent} />
              <Text style={s.addBtnText}>Katalogdan Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, { flex: 1 }]} onPress={addBlankItem} testID="add-blank-btn">
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.accent} />
              <Text style={s.addBtnText}>Boş Kalem Ekle</Text>
            </TouchableOpacity>
          </View>

          <SectionHeader title="ÖZEL NOTLAR" />
          <FGroup>
            <TextInput
              style={[s.input, s.multiline, { minHeight: 80 }]}
              multiline
              value={notlar}
              onChangeText={setNotlar}
              placeholder="Notlar, garanti, koşullar..."
              placeholderTextColor="#9ca3af"
              testID="notlar-input"
            />
          </FGroup>

          {/* Toplamlar */}
          <View style={s.totalsCard} testID="totals-card">
            <TotRow label="Ara Toplam" value={fmt(subtotal, cur)} />
            {iskontoOr > 0 && (
              <TotRow label={`İskonto (%${iskontoOr})`} value={`-${fmt(iskontoTutar, cur)}`} negative />
            )}
            <TotRow label={`KDV (%${kdvOr})`} value={fmt(kdvTutar, cur)} />
            <View style={s.grand}>
              <Text style={s.grandLabel}>GENEL TOPLAM</Text>
              <Text style={s.grandValue} numberOfLines={1}>{fmt(genelToplam, cur)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={resetForm} testID="reset-form-btn">
              <Ionicons name="refresh-outline" size={16} color={theme.colors.textSoft} />
              <Text style={s.btnGhostText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnSecondary, { flex: 1 }]}
              onPress={handlePreview}
              disabled={saving}
              testID="preview-btn"
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={s.btnPrimaryText}>Önizleme</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.btnPrimary, saving && { opacity: 0.6 }]}
            onPress={handleGeneratePdf}
            disabled={saving}
            testID="pdf-download-btn"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="document-text" size={16} color="#fff" />
                <Text style={s.btnPrimaryText}>Kaydet & PDF İndir/Paylaş</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnWhatsapp, saving && { opacity: 0.6 }]}
            onPress={handleShareWhatsApp}
            disabled={saving}
            testID="whatsapp-share-btn"
          >
            <Ionicons name="logo-whatsapp" size={16} color="#fff" />
            <Text style={s.btnPrimaryText}>WhatsApp&apos;ta Paylaş</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Catalog picker modal */}
      <Modal visible={showCatalogPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Katalogdan Kalem Ekle</Text>
              <TouchableOpacity onPress={() => setShowCatalogPicker(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {catalog.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
                  Bu firmanın kataloğunda ürün yok. Önce Katalog sekmesinden ekleyin.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 500 }}>
                {catalog.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={s.catalogRow}
                    testID={`picker-cat-${c.id}`}
                    onPress={() => addFromCatalog(c.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.catBadge}>{c.kategori}</Text>
                      <Text style={s.catName} numberOfLines={2}>{c.urunAdi}</Text>
                      <Text style={s.catPrice}>{fmt(c.birimFiyat, c.paraBirimi)} / {c.birim}</Text>
                    </View>
                    <Ionicons name="add-circle" size={26} color={theme.colors.accent} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Email picker */}
      <Modal visible={showEmailPicker} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowEmailPicker(false)}>
          <View style={s.pickerSheet}>
            <Text style={s.modalTitle}>Hazırlayan Seç</Text>
            {(activeCompany?.hazirlayanEmails || []).map((em) => (
              <TouchableOpacity
                key={em}
                style={[s.emailRow, hazirlayanEmail === em && s.emailRowActive]}
                testID={`email-opt-${em}`}
                onPress={() => {
                  setHazirlayanEmail(em);
                  setShowEmailPicker(false);
                }}
              >
                <Ionicons
                  name={hazirlayanEmail === em ? 'radio-button-on' : 'radio-button-off'}
                  size={16}
                  color={hazirlayanEmail === em ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[s.emailText, hazirlayanEmail === em && s.emailTextActive]} numberOfLines={1}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Customer picker */}
      <Modal visible={showCustomerPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Müşteri Geçmişinden Seç</Text>
              <TouchableOpacity onPress={() => setShowCustomerPicker(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={s.catalogRow}
                  testID={`picker-cust-${c.id}`}
                  onPress={() => fillFromCustomer(c.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.catName} numberOfLines={1}>{c.firma}</Text>
                    <Text style={s.catPrice} numberOfLines={1}>
                      {[c.yetkili, c.telefon, c.email].filter(Boolean).join(' • ') || '-'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.accent} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionH}>{title}</Text>;
}

function SectionHeaderWithAction({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionH2}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} testID="section-action-btn">
          <Text style={s.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FGroup({ label, children, flex }: { label?: string; children: React.ReactNode; flex?: number }) {
  return (
    <View style={[{ marginBottom: 8 }, flex ? { flex } : {}]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      {children}
    </View>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{children}</View>;
}

function TotRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <View style={s.totRow}>
      <Text style={s.totLabel}>{label}</Text>
      <Text style={[s.totVal, negative && { color: theme.colors.red }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: theme.colors.textMuted },
  totalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.navy,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  totalLabel: { color: '#94a3b8', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  miniStats: { alignItems: 'flex-end' },
  miniStat: { color: '#fff', fontSize: 12, fontWeight: '700' },
  miniStatSub: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
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
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
  },
  sectionH2: { fontSize: 11, fontWeight: '800', color: theme.colors.accent, letterSpacing: 0.3 },
  sectionAction: { fontSize: 11, fontWeight: '700', color: theme.colors.accent },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSoft,
    marginBottom: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 14,
    color: theme.colors.text,
  },
  multiline: { minHeight: 55, textAlignVertical: 'top' },
  selectBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 4 },
  chip: {
    flex: 1,
    paddingVertical: 9,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 6,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  emptyBox: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.lineDark,
    borderRadius: 10,
    padding: 22,
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 10,
  },
  itemHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemHdrText: { fontSize: 11, fontWeight: '800', color: theme.colors.accent, letterSpacing: 0.3 },
  itemLineTotal: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
    borderRadius: 8,
    marginTop: 4,
  },
  addBtnText: { color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 },
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 8,
    marginTop: 12,
  },
  totRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  totLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  totVal: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.navy,
    borderRadius: 6,
    marginTop: 4,
  },
  grandLabel: { color: '#94a3b8', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5 },
  grandValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  btnPrimary: {
    marginTop: 10,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnSecondary: {
    backgroundColor: theme.colors.navy,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
  },
  btnGhostText: { color: theme.colors.textSoft, fontWeight: '700', fontSize: 12.5 },
  btnWhatsapp: {
    marginTop: 8,
    backgroundColor: '#25D366',
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '85%',
  },
  modalHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    marginBottom: 10,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    gap: 10,
  },
  catBadge: {
    fontSize: 9.5,
    color: theme.colors.accent,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  catName: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  catPrice: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  pickerSheet: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 16,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  emailRowActive: { backgroundColor: theme.colors.accentSoft },
  emailText: { fontSize: 12.5, color: theme.colors.text, flex: 1 },
  emailTextActive: { color: theme.colors.accent, fontWeight: '700' },
});

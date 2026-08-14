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
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { QuoteItemT, QuoteT, QuoteEkT, SystemTypeDefT } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';
import { buildItemDescription, buildQuoteFileName, buildTeklifNo } from '@/src/lib/quote-utils';
import { shareQuoteViaWhatsApp } from '@/src/lib/whatsapp';
import { AttachmentT, mergeAttachmentsIntoPdf } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import * as DocumentPicker from 'expo-document-picker';

function todayIso() { return new Date().toISOString().split('T')[0]; }
function plusDaysIso(days: number) { return new Date(Date.now() + days * 86400000).toISOString().split('T')[0]; }
function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}
function newItemId() { return 'it-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

const SHARE_MESSAGE = 'Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz.';

export default function EditorScreen() {
  const { activeCompany, catalog, customers, quotes, saveQuote, showToast, loading, setQuoteAttachments } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ quoteId?: string }>();

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [teklifNo, setTeklifNo] = useState(buildTeklifNo());
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
  const [ekler, setEkler] = useState<QuoteEkT[]>([]);
  // Local-only attached files (PDF/Word/Image) merged into the outgoing PDF at share time.
  const [attachments, setAttachments] = useState<AttachmentT[]>([]);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showModeSheet, setShowModeSheet] = useState(false);
  const [showSystemPicker, setShowSystemPicker] = useState<string | null>(null); // itemId
  const [showSelectPicker, setShowSelectPicker] = useState<{ itemId: string; fieldId: string; options: string[]; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const bootedRef = useRef<string | null>(null);

  useEffect(() => {
    if (params.quoteId && bootedRef.current !== params.quoteId) {
      const q = quotes.find((qq) => qq.id === params.quoteId);
      if (q) { loadFromQuote(q); bootedRef.current = params.quoteId; }
    }
  }, [params.quoteId, quotes]);

  const loadFromQuote = (q: QuoteT) => {
    setEditingId(q.id); setTeklifNo(q.teklifNo); setTarih(q.tarih); setGecerlilik(q.gecerlilik);
    setHazirlayanEmail(q.hazirlayanEmail); setMusFirma(q.musFirma); setMusYetkili(q.musYetkili);
    setMusTelefon(q.musTelefon); setMusEmail(q.musEmail); setMusAdres(q.musAdres); setProjeAdi(q.projeAdi);
    setNakliye(q.nakliye); setParaBirimi(q.paraBirimi); setOdemeSekli(q.odemeSekli); setMensei(q.mensei);
    setTeslimGun(q.teslimGun); setIskonto(String(q.iskonto)); setKdvOrani(String(q.kdvOrani));
    setNotlar(q.notlar); setItems(q.items); setEkler(q.ekler || []); setAttachments([]);
  };

  const resetForm = useCallback(() => {
    setEditingId(undefined); setTeklifNo(buildTeklifNo()); setTarih(todayIso()); setGecerlilik(plusDaysIso(7));
    setHazirlayanEmail(activeCompany?.hazirlayanEmails?.[0] || ''); setMusFirma(''); setMusYetkili('');
    setMusTelefon(''); setMusEmail(''); setMusAdres(''); setProjeAdi(''); setIskonto('0'); setKdvOrani('20');
    setNotlar(activeCompany?.ozelNotlar || ''); setItems([]); setEkler([]); setAttachments([]); bootedRef.current = null;
  }, [activeCompany]);

  const pickAttachments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const picked = res.assets || [];
      const wordCount = picked.filter((a) => /\.(docx?|)$/i.test(a.name) && (a.mimeType || '').includes('word')).length;
      if (wordCount > 0) showToast('Word dosyaları PDF\'e otomatik eklenemez — atlanacak');
      const additions: AttachmentT[] = picked
        .filter((a) => {
          const m = (a.mimeType || '').toLowerCase();
          return m === 'application/pdf' || m.startsWith('image/') || /\.(pdf|png|jpe?g)$/i.test(a.name);
        })
        .map((a) => ({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: a.name || 'dosya',
          uri: a.uri,
          mime: a.mimeType || 'application/octet-stream',
          size: (a as any).size,
        }));
      if (additions.length === 0 && wordCount === 0) {
        showToast('Desteklenmeyen dosya türü'); return;
      }
      setAttachments((prev) => [...prev, ...additions]);
      if (additions.length > 0) showToast(`${additions.length} dosya eklendi`);
    } catch (e: any) {
      showToast('Dosya seçilemedi: ' + (e?.message || ''));
    }
  };

  useEffect(() => {
    if (activeCompany && !hazirlayanEmail && activeCompany.hazirlayanEmails?.length) {
      setHazirlayanEmail(activeCompany.hazirlayanEmails[0]);
    }
  }, [activeCompany, hazirlayanEmail]);

  useEffect(() => {
    if (!editingId && !notlar && activeCompany?.ozelNotlar) setNotlar(activeCompany.ozelNotlar);
  }, [activeCompany, editingId, notlar]);

  const subtotal = useMemo(() => items.reduce((a, it) => a + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0), [items]);
  const iskontoOr = Number(iskonto) || 0;
  const kdvOr = Number(kdvOrani) || 0;
  const iskontoTutar = (subtotal * iskontoOr) / 100;
  const araToplam = subtotal - iskontoTutar;
  const kdvTutar = (araToplam * kdvOr) / 100;
  const genelToplam = araToplam + kdvTutar;

  const currentQuote = (): Partial<QuoteT> => ({
    teklifNo, tarih, gecerlilik, hazirlayanEmail, musFirma, musYetkili, musTelefon, musEmail, musAdres,
    projeAdi, nakliye, paraBirimi, odemeSekli, mensei, teslimGun,
    iskonto: iskontoOr, kdvOrani: kdvOr, notlar, items, ekler, durum: 'Beklemede',
  });

  const updateItem = (id: string, patch: Partial<QuoteItemT>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const makeItem = (mode: 'technical' | 'manual' | 'general'): QuoteItemT => ({
    id: newItemId(), mode, urunAdi: '', sistemTipiId: '', sistemTipi: '',
    sistemFields: [], customFields: [], aciklama: '', adet: 1, birim: 'Adet', birimFiyat: 0,
  });

  const addItem = (mode: 'technical' | 'manual' | 'general') => {
    setItems((prev) => [...prev, makeItem(mode)]);
    setShowModeSheet(false);
  };

  const addFromCatalog = (catId: string) => {
    const c = catalog.find((x) => x.id === catId); if (!c) return;
    setItems((prev) => [...prev, { ...makeItem('general'), urunAdi: c.urunAdi, birim: c.birim, birimFiyat: c.birimFiyat, aciklama: c.aciklama }]);
    setShowCatalogPicker(false); showToast('Kalem eklendi');
  };

  const fillFromCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id); if (!c) return;
    setMusFirma(c.firma); setMusYetkili(c.yetkili); setMusTelefon(c.telefon); setMusEmail(c.email); setMusAdres(c.adres);
    setShowCustomerPicker(false); showToast('Müşteri bilgileri dolduruldu');
  };

  const selectSystemType = (itemId: string, sys: SystemTypeDefT) => {
    // Initialize sistemFields with empty values for each field
    const initFields = (sys.fields || []).map((f) => ({ label: f.label, value: f.type === 'checkbox' ? '' : '' }));
    updateItem(itemId, { sistemTipiId: sys.id, sistemTipi: sys.name, sistemFields: initFields });
    setShowSystemPicker(null);
  };

  const updateSystemFieldValue = (itemId: string, fieldIndex: number, value: string) => {
    const it = items.find((x) => x.id === itemId); if (!it) return;
    const next = [...(it.sistemFields || [])];
    next[fieldIndex] = { ...next[fieldIndex], value };
    updateItem(itemId, { sistemFields: next });
  };

  const handleSave = async (): Promise<QuoteT | null> => {
    if (!activeCompany) return null;
    if (!musFirma.trim()) { showToast('Müşteri firma adı zorunlu'); return null; }
    setSaving(true);
    try {
      const saved = await saveQuote(currentQuote(), editingId);
      setEditingId(saved.id);
      // Keep the currently-picked local attachments available to Preview/History
      // for this quote, so they can also include them when generating a PDF.
      setQuoteAttachments(saved.id, attachments);
      showToast('Teklif kaydedildi'); return saved;
    } catch (e: any) {
      if (e?.status === 402) {
        showToast('Ücretsiz teklif hakkınız bu ay doldu');
        router.push('/subscription');
        return null;
      }
      showToast('Kayıt hatası: ' + (e?.message || ''));
      return null;
    }
    finally { setSaving(false); }
  };

  const generatePdfUri = async (savedQuote: QuoteT): Promise<{ uri: string; fileName: string }> => {
    if (!activeCompany) throw new Error('Aktif firma yok');
    const html = buildQuotePdfHtml(activeCompany, savedQuote);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    let baseUri = uri;
    const desiredName = buildQuoteFileName(new Date()) + '.pdf';
    if (Platform.OS !== 'web') {
      try {
        const dirIdx = uri.lastIndexOf('/');
        const newUri = uri.substring(0, dirIdx + 1) + desiredName;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        baseUri = newUri;
      } catch { baseUri = uri; }
    }
    // Merge any user-picked PDF/image attachments at the end of the generated PDF.
    if (attachments.length > 0) {
      try {
        const merged = await mergeAttachmentsIntoPdf(baseUri, attachments);
        return { uri: merged, fileName: desiredName };
      } catch (e) {
        // On failure, fall back to the base PDF without attachments.
        return { uri: baseUri, fileName: desiredName };
      }
    }
    return { uri: baseUri, fileName: desiredName };
  };

  const handleShare = async () => {
    const saved = await handleSave(); if (!saved) return;
    try {
      const { uri, fileName } = await generatePdfUri(saved);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: SHARE_MESSAGE, UTI: 'com.adobe.pdf' });
      } else {
        // Web: no native share sheet — trigger a real browser download instead.
        await downloadFileWeb(uri, fileName);
        showToast('PDF indirildi');
      }
    } catch (e: any) { showToast('PDF hatası: ' + (e?.message || '')); }
  };

  // Direct WhatsApp: open the customer's chat pre-filled, then trigger the share sheet
  // so the user can attach the PDF into that same chat with one tap.
  const handleWhatsAppShare = async () => {
    const saved = await handleSave(); if (!saved) return;
    try {
      const { uri, fileName } = await generatePdfUri(saved);
      await shareQuoteViaWhatsApp({
        pdfUri: uri,
        fileName,
        quote: saved,
        companyName: activeCompany?.sirketAdi,
      });
    } catch (e: any) { showToast('WhatsApp hatası: ' + (e?.message || '')); }
  };

  const handlePreview = async () => {
    const saved = await handleSave();
    if (saved) router.push({ pathname: '/preview', params: { quoteId: saved.id } });
  };

  const cur = paraBirimi;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingBox}><ActivityIndicator color={theme.colors.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  const noSystemTypes = !activeCompany?.sistemTipleri?.length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={editingId ? 'Teklif Düzenle' : 'Yeni Teklif'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Grand total sticky */}
          <View style={s.totalBanner}>
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
              <TouchableOpacity style={s.selectBox} onPress={() => setShowEmailPicker(true)}>
                <Text style={s.selectText} numberOfLines={1}>{hazirlayanEmail || 'Seçiniz'}</Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </FGroup>
          ) : null}
          <Row>
            <FGroup label="Teklif No" flex={1}><TextInput style={s.input} value={teklifNo} onChangeText={setTeklifNo} testID="teklif-no-input" /></FGroup>
            <FGroup label="Tarih" flex={1}><TextInput style={s.input} value={tarih} onChangeText={setTarih} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" /></FGroup>
          </Row>
          <FGroup label="Geçerlilik Tarihi"><TextInput style={s.input} value={gecerlilik} onChangeText={setGecerlilik} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" /></FGroup>

          <SectionHeaderWithAction title="MÜŞTERİ BİLGİLERİ" actionLabel={customers.length ? `📇 Geçmiş (${customers.length})` : ''} onAction={customers.length ? () => setShowCustomerPicker(true) : undefined} />
          <FGroup label="Firma Adı"><TextInput style={s.input} placeholder="Müşteri firma adı" placeholderTextColor="#94a3b8" value={musFirma} onChangeText={setMusFirma} testID="mus-firma-input" /></FGroup>
          <Row>
            <FGroup label="Müşteri Adı" flex={1}><TextInput style={s.input} value={musYetkili} onChangeText={setMusYetkili} placeholder="Ad Soyad" placeholderTextColor="#94a3b8" /></FGroup>
            <FGroup label="Telefon" flex={1}><TextInput style={s.input} value={musTelefon} onChangeText={setMusTelefon} placeholder="Telefon" placeholderTextColor="#94a3b8" keyboardType="phone-pad" /></FGroup>
          </Row>
          <FGroup label="E-Mail"><TextInput style={s.input} value={musEmail} onChangeText={setMusEmail} placeholder="ornek@firma.com" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" /></FGroup>
          <FGroup label="Adres"><TextInput style={[s.input, s.multiline]} multiline value={musAdres} onChangeText={setMusAdres} placeholder="Açık adres" placeholderTextColor="#94a3b8" /></FGroup>

          <SectionHeader title="SİPARİŞ BİLGİLERİ" />
          <FGroup label="Proje Adı"><TextInput style={s.input} value={projeAdi} onChangeText={setProjeAdi} placeholder="Proje / iş adı" placeholderTextColor="#94a3b8" /></FGroup>
          <Row>
            <FGroup label="Para Birimi" flex={1}>
              <View style={s.chipRow}>{['USD', 'EUR', 'TRY'].map((c) => (
                <TouchableOpacity key={c} testID={`cur-${c}`} style={[s.chip, paraBirimi === c && s.chipActive]} onPress={() => setParaBirimi(c)}>
                  <Text style={[s.chipText, paraBirimi === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}</View>
            </FGroup>
            <FGroup label="Nakliye" flex={1}>
              <View style={s.chipRow}>{['EXW', 'FOB', 'CIF', 'DAP'].map((c) => (
                <TouchableOpacity key={c} style={[s.chip, nakliye === c && s.chipActive]} onPress={() => setNakliye(c)}>
                  <Text style={[s.chipText, nakliye === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}</View>
            </FGroup>
          </Row>
          <FGroup label="Ödeme Şekli"><TextInput style={s.input} value={odemeSekli} onChangeText={setOdemeSekli} /></FGroup>
          <Row>
            <FGroup label="Menşei" flex={1}><TextInput style={s.input} value={mensei} onChangeText={setMensei} /></FGroup>
            <FGroup label="Teslim" flex={1}><TextInput style={s.input} value={teslimGun} onChangeText={setTeslimGun} /></FGroup>
          </Row>
          <Row>
            <FGroup label="İskonto (%)" flex={1}><TextInput style={s.input} keyboardType="numeric" value={iskonto} onChangeText={setIskonto} /></FGroup>
            <FGroup label="KDV (%)" flex={1}><TextInput style={s.input} keyboardType="numeric" value={kdvOrani} onChangeText={setKdvOrani} /></FGroup>
          </Row>

          <SectionHeader title={`KALEMLER (${items.length})`} />
          {items.length === 0 && (
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={22} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Kalem eklemek için aşağıdaki butonu kullanın.</Text>
            </View>
          )}

          {items.map((it, idx) => (
            <ItemCard
              key={it.id}
              item={it}
              idx={idx}
              currency={cur}
              sistemTipleri={activeCompany?.sistemTipleri || []}
              onChange={(patch) => updateItem(it.id, patch)}
              onRemove={() => removeItem(it.id)}
              onOpenSystemPicker={() => setShowSystemPicker(it.id)}
              onOpenSelectPicker={(fieldId, options, title) => setShowSelectPicker({ itemId: it.id, fieldId, options, title })}
              onUpdateSystemFieldValue={(fi, val) => updateSystemFieldValue(it.id, fi, val)}
            />
          ))}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={[s.addBtn, { flex: 1.2 }]} onPress={() => setShowModeSheet(true)} testID="add-item-btn">
              <Ionicons name="add-circle" size={18} color={theme.colors.primary} />
              <Text style={s.addBtnText}>Kalem Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtnAlt, { flex: 1 }]} onPress={() => setShowCatalogPicker(true)} testID="add-from-catalog-btn">
              <Ionicons name="library-outline" size={16} color={theme.colors.navy} />
              <Text style={s.addBtnAltText}>Katalog</Text>
            </TouchableOpacity>
          </View>

          {noSystemTypes && (
            <View style={s.warningBox}>
              <Ionicons name="warning" size={16} color={theme.colors.gold} />
              <Text style={s.warningText}>
                Henüz hizmet / ürün tanımlamadınız. <Text style={{ fontWeight: '900' }} onPress={() => router.push('/(tabs)/company')}>Firma sekmesinden</Text> Hizmet / Ürün Yapılandırıcı ile tanımlayın.
              </Text>
            </View>
          )}

          <SectionHeader title="ÖZEL NOTLAR" />
          <FGroup>
            <TextInput style={[s.input, s.multiline, { minHeight: 90 }]} multiline value={notlar} onChangeText={setNotlar} placeholder="Notlar, garanti, koşullar..." placeholderTextColor="#94a3b8" />
          </FGroup>

          {/* EKLER — Additional attachment pages (References, Katalog, etc.) */}
          <SectionHeader title="EKLER (İSTEĞE BAĞLI)" />
          <Text style={s.helperTinyMuted}>{"Teklifin altına özel sayfalar ekleyebilirsiniz (örn. Referanslar listesi, Katalog). Her ek, PDF'de teklifle aynı stilde yeni sayfa olarak eklenir."}</Text>
          {ekler.map((ek, ei) => (
            <View key={ek.id} style={s.ekCard} testID={`ek-${ei}`}>
              <View style={s.ekHdr}>
                <Text style={s.ekBadge}>EK {ei + 1}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setEkler(ekler.filter((_, i) => i !== ei))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ek-remove-${ei}`}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.input, { marginBottom: 6 }]}
                value={ek.baslik}
                onChangeText={(v) => setEkler(ekler.map((x, i) => (i === ei ? { ...x, baslik: v } : x)))}
                placeholder="Başlık (örn: Referanslarımız)"
                placeholderTextColor="#94a3b8"
                testID={`ek-title-${ei}`}
              />
              <TextInput
                style={[s.input, s.multiline, { minHeight: 100 }]}
                multiline
                value={ek.icerik}
                onChangeText={(v) => setEkler(ekler.map((x, i) => (i === ei ? { ...x, icerik: v } : x)))}
                placeholder="İçerik (referans firma listeniz, açıklamalar, teknik notlar...)"
                placeholderTextColor="#94a3b8"
                testID={`ek-content-${ei}`}
              />
            </View>
          ))}
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setEkler([...ekler, { id: 'ek-' + Date.now() + Math.random().toString(36).slice(2, 8), baslik: '', icerik: '' }])}
            testID="add-ek-btn"
          >
            <Ionicons name="document-attach-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addBtnText}>Ek Sayfa Ekle</Text>
          </TouchableOpacity>

          {/* EK DOSYALAR — user-uploaded PDFs / images, merged into the outgoing PDF */}
          <SectionHeader title="EK DOSYALAR (PDF · GÖRSEL)" />
          <Text style={s.helperTinyMuted}>{"Yüklediğin dosyalar teklif PDF'inin sonuna otomatik eklenir (PDF: sayfa sayfa, görsel: A4 sayfa olarak). Word dosyaları desteklenmez."}</Text>
          {attachments.map((att, ai) => {
            const isImg = (att.mime || '').startsWith('image/') || /\.(png|jpe?g)$/i.test(att.name);
            const kb = att.size ? Math.round(att.size / 1024) : null;
            return (
              <View key={att.id} style={s.attachRow} testID={`attach-${ai}`}>
                <View style={s.attachIcon}>
                  <Ionicons name={isImg ? 'image' : 'document-text'} size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attachName} numberOfLines={1}>{att.name}</Text>
                  <Text style={s.attachMeta}>{isImg ? 'Görsel' : 'PDF'}{kb ? ` · ${kb} KB` : ''}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAttachments(attachments.filter((_, i) => i !== ai))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  testID={`attach-remove-${ai}`}
                >
                  <Ionicons name="close-circle" size={20} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity style={s.addBtn} onPress={pickAttachments} testID="pick-attachment-btn">
            <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addBtnText}>Dosya Yükle (PDF · Görsel)</Text>
          </TouchableOpacity>

          {/* LIVE PDF PREVIEW */}
          <View style={s.livePreviewSection}>
            <View style={s.livePreviewHdr}>
              <Ionicons name="eye" size={16} color="#fff" />
              <Text style={s.livePreviewHdrText}>CANLI PDF ÖNİZLEME</Text>
              <View style={s.liveDot} />
              <Text style={s.livePreviewCount}>{items.length} kalem</Text>
            </View>
            <View style={s.miniTable}>
              <View style={s.miniTHead}>
                <Text style={[s.miniTh, { width: 22, textAlign: 'center' }]}>#</Text>
                <Text style={[s.miniTh, { flex: 1 }]}>HİZMET / ÜRÜN</Text>
                <Text style={[s.miniTh, { width: 38, textAlign: 'center' }]}>ADET</Text>
                <Text style={[s.miniTh, { width: 66, textAlign: 'right' }]}>TOPLAM</Text>
              </View>
              {items.length === 0 ? (
                <Text style={s.miniEmpty}>Kalem eklendikçe burada görüntülenecek.</Text>
              ) : items.map((it, i) => {
                const line = (it.adet || 0) * (it.birimFiyat || 0);
                const desc = buildItemDescription(it);
                return (
                  <View key={it.id} style={[s.miniRow, i % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                    <Text style={[s.miniTd, { width: 22, textAlign: 'center' }]}>{i + 1}</Text>
                    <Text style={[s.miniTdBold, { flex: 1 }]}>{desc || <Text style={s.miniPlaceholder}>—</Text>}</Text>
                    <Text style={[s.miniTd, { width: 38, textAlign: 'center' }]}>{it.adet}</Text>
                    <Text style={[s.miniTdBold, { width: 66, textAlign: 'right' }]} numberOfLines={1}>{fmt(line, cur)}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.totalsCard}>
            <TotRow label="Ara Toplam" value={fmt(subtotal, cur)} />
            {iskontoOr > 0 && <TotRow label={`İskonto (%${iskontoOr})`} value={`-${fmt(iskontoTutar, cur)}`} negative />}
            <TotRow label={`KDV (%${kdvOr})`} value={fmt(kdvTutar, cur)} />
            <View style={s.grand}>
              <Text style={s.grandLabel}>GENEL TOPLAM</Text>
              <Text style={s.grandValue} numberOfLines={1}>{fmt(genelToplam, cur)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity style={[s.btnGhost, { flex: 0.8 }]} onPress={resetForm}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.textSoft} />
              <Text style={s.btnGhostText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={handlePreview} disabled={saving} testID="preview-btn">
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={s.btnSecondaryText}>Önizle</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[s.btnPrimary, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleShare} disabled={saving} testID="share-pdf-btn">
              {saving ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="share-social" size={17} color="#fff" /><Text style={s.btnPrimaryText}>Kaydet & PDF</Text></>)}
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnWhatsApp, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={handleWhatsAppShare} disabled={saving} testID="share-whatsapp-btn">
              <Ionicons name="logo-whatsapp" size={17} color="#fff" />
              <Text style={s.btnPrimaryText}>WhatsApp Gönder</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mode select */}
      <Modal visible={showModeSheet} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowModeSheet(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Kalem Tipi Seçin</Text>
            <ModeChoice icon="construct" title="Hizmet / Ürün" desc="Firma ayarlarında tanımlı hizmet/ürün tiplerinden seçin" onPress={() => addItem('technical')} tid="add-technical" />
            <ModeChoice icon="list" title="Manuel Bilgi" desc="Kendi Key: Value çiftlerinizi ekleyin" onPress={() => addItem('manual')} tid="add-manual" />
            <ModeChoice icon="pricetag" title="Genel Ürün" desc="İsim + adet + fiyat" onPress={() => addItem('general')} tid="add-general" />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Catalog picker */}
      <Modal visible={showCatalogPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Katalogdan Ekle</Text>
              <TouchableOpacity onPress={() => setShowCatalogPicker(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            {catalog.length === 0 ? <Text style={s.emptyMuted}>Katalog boş.</Text> : (
              <ScrollView style={{ maxHeight: 500 }}>{catalog.map((c) => (
                <TouchableOpacity key={c.id} style={s.catalogRow} onPress={() => addFromCatalog(c.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.catBadge}>{c.kategori}</Text>
                    <Text style={s.catName} numberOfLines={2}>{c.urunAdi}</Text>
                    <Text style={s.catPrice}>{fmt(c.birimFiyat, c.paraBirimi)} / {c.birim}</Text>
                  </View>
                  <Ionicons name="add-circle" size={26} color={theme.colors.primary} />
                </TouchableOpacity>
              ))}</ScrollView>
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
              <TouchableOpacity key={em} style={[s.emailRow, hazirlayanEmail === em && s.emailRowActive]} onPress={() => { setHazirlayanEmail(em); setShowEmailPicker(false); }}>
                <Ionicons name={hazirlayanEmail === em ? 'radio-button-on' : 'radio-button-off'} size={16} color={hazirlayanEmail === em ? theme.colors.primary : theme.colors.textMuted} />
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
              <Text style={s.modalTitle}>Müşteri Geçmişi</Text>
              <TouchableOpacity onPress={() => setShowCustomerPicker(false)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>{customers.map((c) => (
              <TouchableOpacity key={c.id} style={s.catalogRow} onPress={() => fillFromCustomer(c.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.catName} numberOfLines={1}>{c.firma}</Text>
                  <Text style={s.catPrice} numberOfLines={1}>{[c.yetkili, c.telefon, c.email].filter(Boolean).join(' • ') || '-'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            ))}</ScrollView>
          </View>
        </View>
      </Modal>

      {/* System type picker (for technical items) */}
      <Modal visible={!!showSystemPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Hizmet / Ürün Seç</Text>
              <TouchableOpacity onPress={() => setShowSystemPicker(null)}><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            {(activeCompany?.sistemTipleri || []).length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="warning-outline" size={32} color={theme.colors.gold} />
                <Text style={s.emptyMuted}>Henüz sistem tipi tanımlamadınız. Firma sekmesinden ekleyin.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 500 }}>{(activeCompany?.sistemTipleri || []).map((sys) => (
                <TouchableOpacity key={sys.id} style={s.catalogRow} onPress={() => showSystemPicker && selectSystemType(showSystemPicker, sys)} testID={`sys-pick-${sys.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.catName} numberOfLines={1}>{sys.name}</Text>
                    <Text style={s.catPrice}>{sys.fields?.length || 0} teknik alan</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              ))}</ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Select-field picker */}
      <Modal visible={!!showSelectPicker} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowSelectPicker(null)}>
          <View style={s.pickerSheet}>
            <Text style={s.modalTitle}>{showSelectPicker?.title || 'Seç'}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(showSelectPicker?.options || []).map((op) => (
                <TouchableOpacity key={op} style={s.emailRow} onPress={() => {
                  if (showSelectPicker) {
                    const it = items.find((x) => x.id === showSelectPicker.itemId);
                    if (it) {
                      const fi = it.sistemFields.findIndex((f, idx) => `f-${idx}` === showSelectPicker.fieldId);
                      if (fi >= 0) updateSystemFieldValue(it.id, fi, op);
                    }
                  }
                  setShowSelectPicker(null);
                }}>
                  <Ionicons name="ellipse-outline" size={12} color={theme.colors.textMuted} />
                  <Text style={s.emailText}>{op}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ============ ITEM CARD ============
function ItemCard({
  item, idx, currency, sistemTipleri, onChange, onRemove, onOpenSystemPicker, onOpenSelectPicker, onUpdateSystemFieldValue,
}: {
  item: QuoteItemT;
  idx: number;
  currency: string;
  sistemTipleri: SystemTypeDefT[];
  onChange: (patch: Partial<QuoteItemT>) => void;
  onRemove: () => void;
  onOpenSystemPicker: () => void;
  onOpenSelectPicker: (fieldId: string, options: string[], title: string) => void;
  onUpdateSystemFieldValue: (fieldIndex: number, value: string) => void;
}) {
  const line = (item.adet || 0) * (item.birimFiyat || 0);
  const modeMeta =
    item.mode === 'technical' ? { label: 'HİZMET / ÜRÜN', color: theme.colors.primary } :
    item.mode === 'manual' ? { label: 'MANUEL', color: theme.colors.gold } :
    { label: 'GENEL ÜRÜN', color: theme.colors.textMuted };
  const preview = buildItemDescription(item);
  const selectedSys = sistemTipleri.find((s) => s.id === item.sistemTipiId);

  return (
    <View style={itemStyles.card} testID={`quote-item-${idx}`}>
      <View style={itemStyles.hdr}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text style={itemStyles.no}>#{idx + 1}</Text>
          <View style={[itemStyles.modeBadge, { backgroundColor: modeMeta.color + '20', borderColor: modeMeta.color }]}>
            <Text style={[itemStyles.modeBadgeText, { color: modeMeta.color }]}>{modeMeta.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={itemStyles.linePrice}>{fmt(line, currency)}</Text>
          <TouchableOpacity onPress={onRemove} testID={`remove-item-${idx}`}>
            <Ionicons name="close-circle" size={20} color={theme.colors.red} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TECHNICAL MODE — dynamic fields based on selected system */}
      {item.mode === 'technical' && (
        <>
          <FieldGroup label="Hizmet / Ürün">
            <TouchableOpacity style={[itemStyles.select, !item.sistemTipiId && itemStyles.selectHighlight]} onPress={onOpenSystemPicker} testID={`item-${idx}-syspick`}>
              <Text style={[itemStyles.selectText, !item.sistemTipiId && { color: theme.colors.primary, fontWeight: '800' }]} numberOfLines={1}>
                {item.sistemTipi || '👆 Bir Hizmet / Ürün Seçin'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
          </FieldGroup>

          {/* Dynamic fields */}
          {selectedSys && selectedSys.fields.map((f, fi) => {
            const currentVal = (item.sistemFields?.[fi]?.value) || '';
            if (f.type === 'select') {
              return (
                <FieldGroup key={f.id} label={f.label}>
                  <TouchableOpacity
                    style={itemStyles.select}
                    onPress={() => onOpenSelectPicker(`f-${fi}`, f.options, f.label)}
                    testID={`item-${idx}-field-${fi}`}
                  >
                    <Text style={itemStyles.selectText} numberOfLines={1}>{currentVal || 'Seçiniz'}</Text>
                    <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            if (f.type === 'checkbox') {
              const on = currentVal === 'Evet' || currentVal === 'true';
              return (
                <FieldGroup key={f.id} label={f.label}>
                  <TouchableOpacity style={itemStyles.checkboxRow} onPress={() => onUpdateSystemFieldValue(fi, on ? '' : 'Evet')} testID={`item-${idx}-field-${fi}`}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.colors.primary : theme.colors.textMuted} />
                    <Text style={itemStyles.checkboxText}>{on ? 'Evet' : 'Hayır'}</Text>
                  </TouchableOpacity>
                </FieldGroup>
              );
            }
            return (
              <FieldGroup key={f.id} label={f.label}>
                <TextInput
                  style={itemStyles.input}
                  keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                  value={currentVal}
                  onChangeText={(v) => onUpdateSystemFieldValue(fi, v)}
                  placeholder={`${f.label} girin`}
                  placeholderTextColor="#94a3b8"
                  testID={`item-${idx}-field-${fi}`}
                />
              </FieldGroup>
            );
          })}
        </>
      )}

      {/* MANUAL MODE */}
      {item.mode === 'manual' && (
        <>
          <FieldGroup label="Başlık / Ürün Adı">
            <TextInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder="örn: Elektrik Kablosu" placeholderTextColor="#94a3b8" />
          </FieldGroup>
          {(item.customFields || []).map((cf, ci) => (
            <View key={ci} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              <TextInput style={[itemStyles.input, { flex: 1 }]} placeholder="Anahtar" placeholderTextColor="#94a3b8" value={cf.key} onChangeText={(v) => {
                const next = [...item.customFields]; next[ci] = { ...cf, key: v }; onChange({ customFields: next });
              }} />
              <TextInput style={[itemStyles.input, { flex: 1.5 }]} placeholder="Değer" placeholderTextColor="#94a3b8" value={cf.value} onChangeText={(v) => {
                const next = [...item.customFields]; next[ci] = { ...cf, value: v }; onChange({ customFields: next });
              }} />
              <TouchableOpacity style={itemStyles.removeKv} onPress={() => onChange({ customFields: item.customFields.filter((_, i) => i !== ci) })}>
                <Ionicons name="close" size={16} color={theme.colors.red} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={itemStyles.addKv} onPress={() => onChange({ customFields: [...(item.customFields || []), { key: '', value: '' }] })} testID={`add-kv-${idx}`}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={itemStyles.addKvText}>+ Özel Bilgi Ekle</Text>
          </TouchableOpacity>
        </>
      )}

      {/* GENERAL MODE */}
      {item.mode === 'general' && (
        <>
          <FieldGroup label="Ürün / Hizmet Adı">
            <TextInput style={itemStyles.input} value={item.urunAdi} onChangeText={(v) => onChange({ urunAdi: v })} placeholder="örn: Danışmanlık" placeholderTextColor="#94a3b8" testID={`item-name-${idx}`} />
          </FieldGroup>
          <FieldGroup label="Açıklama (opsiyonel)">
            <TextInput style={[itemStyles.input, { minHeight: 40, textAlignVertical: 'top' }]} multiline value={item.aciklama} onChangeText={(v) => onChange({ aciklama: v })} />
          </FieldGroup>
        </>
      )}

      {/* Quantity / Unit / Price */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <FieldGroup label="Adet" flex={1}><TextInput style={itemStyles.input} keyboardType="numeric" value={String(item.adet)} onChangeText={(v) => onChange({ adet: Number(v.replace(',', '.')) || 0 })} testID={`item-qty-${idx}`} /></FieldGroup>
        <FieldGroup label="Birim" flex={1}><TextInput style={itemStyles.input} value={item.birim} onChangeText={(v) => onChange({ birim: v })} /></FieldGroup>
        <FieldGroup label="Birim Fiyat" flex={1.4}><TextInput style={itemStyles.input} keyboardType="numeric" value={String(item.birimFiyat)} onChangeText={(v) => onChange({ birimFiyat: Number(v.replace(',', '.')) || 0 })} testID={`item-price-${idx}`} /></FieldGroup>
      </View>

      {/* Per-item PDF cell preview */}
      {(item.mode === 'technical' || item.mode === 'manual') && (
        <View style={itemStyles.previewBox}>
          <Text style={itemStyles.previewLabel}>PDF HÜCRESİ</Text>
          <Text style={itemStyles.previewText}>{preview || <Text style={{ color: theme.colors.textMuted }}>Boş kalem</Text>}</Text>
        </View>
      )}
    </View>
  );
}

function ModeChoice({ icon, title, desc, onPress, tid }: { icon: any; title: string; desc: string; onPress: () => void; tid: string }) {
  return (
    <TouchableOpacity style={s.modeChoice} onPress={onPress} testID={tid}>
      <View style={s.modeIcon}><Ionicons name={icon} size={20} color={theme.colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.modeTitle}>{title}</Text>
        <Text style={s.modeDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) { return <Text style={s.sectionH}>{title}</Text>; }
function SectionHeaderWithAction({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionH2}>{title}</Text>
      {actionLabel && onAction ? <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{actionLabel}</Text></TouchableOpacity> : null}
    </View>
  );
}
function FGroup({ label, children, flex }: { label?: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 8 }, flex ? { flex } : {}]}>{label ? <Text style={s.label}>{label}</Text> : null}{children}</View>;
}
function FieldGroup({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return <View style={[{ marginBottom: 8 }, flex ? { flex } : {}]}><Text style={itemStyles.label}>{label}</Text>{children}</View>;
}
function Row({ children, style }: { children: React.ReactNode; style?: any }) { return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{children}</View>; }
function TotRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (<View style={s.totRow}><Text style={s.totLabel}>{label}</Text><Text style={[s.totVal, negative && { color: theme.colors.red }]} numberOfLines={1}>{value}</Text></View>);
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  totalBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.navy, padding: 14, borderRadius: 14, marginBottom: 10, gap: 12, ...theme.shadow.md },
  totalLabel: { color: '#94a3b8', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 },
  totalValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2, letterSpacing: 0.3 },
  miniStats: { alignItems: 'flex-end' },
  miniStat: { color: '#fff', fontSize: 12, fontWeight: '700' },
  miniStatSub: { color: theme.colors.primary, fontSize: 10, marginTop: 2, fontWeight: '800' },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, marginTop: 16, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.primary, letterSpacing: 0.5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  sectionH2: { fontSize: 11, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.5 },
  sectionAction: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 14, color: theme.colors.text },
  multiline: { minHeight: 55, textAlignVertical: 'top' },
  selectBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 4 },
  chip: { flex: 1, paddingVertical: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 8, alignItems: 'center' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  emptyBox: { backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 22, alignItems: 'center', marginBottom: 10, gap: 6 },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  emptyMuted: { color: theme.colors.textMuted, textAlign: 'center', padding: 16, fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: theme.colors.primarySoft, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.primary, borderRadius: 12, marginTop: 4 },
  addBtnText: { color: theme.colors.primary, fontWeight: '900', fontSize: 13, letterSpacing: 0.2 },
  addBtnAlt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 12, marginTop: 4 },
  addBtnAltText: { color: theme.colors.navy, fontWeight: '800', fontSize: 12.5 },
  warningBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.goldSoft, borderWidth: 1, borderColor: theme.colors.goldBorder, borderRadius: 12, padding: 12, marginTop: 8 },
  warningText: { flex: 1, fontSize: 11.5, color: theme.colors.goldDark, lineHeight: 16 },
  livePreviewSection: { marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, overflow: 'hidden', ...theme.shadow.sm },
  livePreviewHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.navy, paddingVertical: 10, paddingHorizontal: 12 },
  livePreviewHdrText: { color: '#fff', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  livePreviewCount: { color: '#cbd5e1', fontSize: 10.5, fontWeight: '700' },
  miniTable: { backgroundColor: '#fff' },
  miniTHead: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 6, gap: 4 },
  miniTh: { fontSize: 9, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.3 },
  miniRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 4, alignItems: 'flex-start' },
  miniEmpty: { padding: 20, textAlign: 'center', fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic' },
  miniTd: { fontSize: 10, color: theme.colors.text, lineHeight: 13 },
  miniTdBold: { fontSize: 10, color: theme.colors.text, fontWeight: '700', lineHeight: 13 },
  miniPlaceholder: { color: theme.colors.textMuted, fontStyle: 'italic' },
  totalsCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 8, marginTop: 12, ...theme.shadow.sm },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  totLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  totVal: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: theme.colors.navy, borderRadius: 8, marginTop: 4 },
  grandLabel: { color: '#cbd5e1', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.6 },
  grandValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  btnPrimary: { marginTop: 12, backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: theme.colors.primary, shadowOpacity: 0.35 },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 0.3 },
  btnWhatsApp: { marginTop: 12, backgroundColor: '#25D366', paddingVertical: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...theme.shadow.md, shadowColor: '#25D366', shadowOpacity: 0.35 },
  ekCard: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 8 },
  ekHdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  ekBadge: { fontSize: 10, fontWeight: '900', color: theme.colors.primary, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.4 },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 6 },
  attachIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  attachName: { fontSize: 12.5, color: theme.colors.text, fontWeight: '700' },
  attachMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15, marginBottom: 8, marginTop: -4 },
  btnSecondary: { backgroundColor: theme.colors.navy, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnSecondaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark },
  btnGhostText: { color: theme.colors.textSoft, fontWeight: '800', fontSize: 12.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '85%' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.navy, marginBottom: 8 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line, gap: 10 },
  catBadge: { fontSize: 9.5, color: theme.colors.primary, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  catName: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  catPrice: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  pickerSheet: { backgroundColor: '#fff', margin: 20, borderRadius: 16, padding: 16, ...theme.shadow.lg },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  emailRowActive: { backgroundColor: theme.colors.primarySoft },
  emailText: { fontSize: 12.5, color: theme.colors.text, flex: 1 },
  emailTextActive: { color: theme.colors.primary, fontWeight: '800' },
  modeChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, backgroundColor: '#fff' },
  modeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.navy },
  modeDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});

const itemStyles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 10, ...theme.shadow.sm },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  no: { fontSize: 11, fontWeight: '900', color: theme.colors.textMuted },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  modeBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  linePrice: { fontSize: 13, fontWeight: '900', color: theme.colors.navy },
  label: { fontSize: 9.5, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 4, letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 13.5, color: theme.colors.text },
  select: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectHighlight: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.primarySoft },
  selectText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10 },
  checkboxText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  addKv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, marginBottom: 6, marginTop: 2 },
  addKvText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  removeKv: { width: 36, backgroundColor: theme.colors.redSoft, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  previewBox: { marginTop: 10, backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  previewLabel: { fontSize: 9, fontWeight: '900', color: theme.colors.primary, letterSpacing: 0.5, marginBottom: 4 },
  previewText: { fontSize: 12, color: theme.colors.text, lineHeight: 17 },
});

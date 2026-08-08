import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Share,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { INITIAL_QUOTES, CATEGORIES, REPRESANTATIVES, CustomerQuote, QuoteItem } from '../src/mock';

// const { width } = Dimensions.get('window');

export default function HomeScreen() {
  // Navigation tabs: 'list' | 'editor' | 'preview' | 'customers'
  const [activeTab, setActiveTab] = useState<'list' | 'editor' | 'preview' | 'customers'>('list');

  // Quotes history state
  const [quotes, setQuotes] = useState<CustomerQuote[]>(INITIAL_QUOTES);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Filter / Search state for List
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Tümü');

  // Form Editor State
  const [hazirlayanMail, setHazirlayanMail] = useState(REPRESANTATIVES[0].email);
  const [teklifNo, setTeklifNo] = useState('SKY-2026-003');
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [gecerlilik, setGecerlilik] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [musFirma, setMusFirma] = useState('');
  const [musAdi, setMusAdi] = useState('');
  const [musTel, setMusTel] = useState('');
  const [musMail, setMusMail] = useState('');
  const [musAdres, setMusAdres] = useState('');
  const [projeAdi, setProjeAdi] = useState('');
  const [nakliye, setNakliye] = useState('EXW');
  const [paraBirimi, setParaBirimi] = useState('USD');
  const [odemeSekli, setOdemeSekli] = useState('%50 Peşin-%50 Fab. Teslim');
  const [mensei, setMensei] = useState('TÜRKİYE');
  const [teslimGun, setTeslimGun] = useState('15-20 GÜN');
  const [iskonto, setIskonto] = useState('0');
  const [notlar, setNotlar] = useState(
    'Fabrika Teslim Fiyatıdır. Ahşap Sandıklama Fiyata Dahil Değildir. Türkiye Gümrük Ücreti Dahil Değildir. Ödeme Şekli % 50 Peşin, % 50 Fabrika Teslimidir.'
  );

  // Items State
  const [items, setItems] = useState<QuoteItem[]>([
    {
      id: 'item-1',
      type: 'urun',
      kategori: 'Akustik Paneller',
      urunAdi: 'Akustik Ahşap Duvar Paneli',
      aciklama: 'Yüksek kaliteli ses yalıtımlı panel',
      kumasRal: 'RAL 9005',
      yerlesim: 'Dikey',
      montaj: 'Dahil',
      adet: 5,
      birim: 'Adet',
      birimFiyat: 450
    }
  ]);

  // Toast / Notification state
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Calculations
  const subtotal = items.reduce((acc, it) => acc + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0);
  const iskontoOrani = Number(iskonto) || 0;
  const iskontoTutar = (subtotal * iskontoOrani) / 100;
  const araToplam = subtotal - iskontoTutar;
  const kdvTutar = araToplam * 0.20;
  const genelToplam = araToplam + kdvTutar;

  const currentRep = REPRESANTATIVES.find((r) => r.email === hazirlayanMail) || REPRESANTATIVES[0];

  const handleAddItem = () => {
    const newItem: QuoteItem = {
      id: 'item-' + Date.now(),
      type: 'urun',
      kategori: CATEGORIES[0],
      urunAdi: 'Yeni Ürün / Hizmet',
      aciklama: '',
      kumasRal: '',
      yerlesim: 'Standart',
      montaj: 'Dahil',
      adet: 1,
      birim: 'Adet',
      birimFiyat: 100
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof QuoteItem, value: any) => {
    setItems(
      items.map((it) => {
        if (it.id === id) {
          return { ...it, [field]: value };
        }
        return it;
      })
    );
  };

  const handleSaveQuote = () => {
    if (!musFirma.trim()) {
      showToast('Lütfen Müşteri / Firma Adı girin!');
      return;
    }
    const newQuote: CustomerQuote = {
      id: selectedQuoteId || 'q-' + Date.now(),
      teklifNo,
      tarih,
      gecerlilik,
      musFirma,
      musAdi,
      musTel,
      musMail,
      musAdres,
      projeAdi,
      nakliye,
      paraBirimi,
      odemeSekli,
      mensei,
      teslimGun,
      iskonto: Number(iskonto),
      notlar,
      hazirlayanMail,
      status: selectedQuoteId ? (quotes.find(q => q.id === selectedQuoteId)?.status || 'Taslak') : 'Taslak',
      items: [...items],
      createdAt: new Date().toISOString(),
      totalAmount: genelToplam
    };

    if (selectedQuoteId) {
      setQuotes(quotes.map((q) => (q.id === selectedQuoteId ? newQuote : q)));
      showToast('Teklif başarıyla güncellendi!');
    } else {
      setQuotes([newQuote, ...quotes]);
      showToast('Yeni teklif kaydedildi!');
    }
    setActiveTab('list');
  };

  const handleCreateNew = () => {
    setSelectedQuoteId(null);
    setTeklifNo(`SKY-2026-${Math.floor(100 + Math.random() * 900)}`);
    setMusFirma('');
    setMusAdi('');
    setMusTel('');
    setMusMail('');
    setMusAdres('');
    setProjeAdi('');
    setItems([
      {
        id: 'item-' + Date.now(),
        type: 'urun',
        kategori: CATEGORIES[0],
        urunAdi: 'Akustik Panel',
        aciklama: 'Yüksek kaliteli panel',
        kumasRal: 'RAL 9005',
        yerlesim: 'Dikey',
        montaj: 'Dahil',
        adet: 5,
        birim: 'Adet',
        birimFiyat: 450
      }
    ]);
    setActiveTab('editor');
  };

  const handleEditQuote = (q: CustomerQuote) => {
    setSelectedQuoteId(q.id);
    setTeklifNo(q.teklifNo);
    setTarih(q.tarih);
    setGecerlilik(q.gecerlilik);
    setMusFirma(q.musFirma);
    setMusAdi(q.musAdi);
    setMusTel(q.musTel);
    setMusMail(q.musMail);
    setMusAdres(q.musAdres);
    setProjeAdi(q.projeAdi);
    setNakliye(q.nakliye);
    setParaBirimi(q.paraBirimi);
    setOdemeSekli(q.odemeSekli);
    setMensei(q.mensei);
    setTeslimGun(q.teslimGun);
    setIskonto(String(q.iskonto));
    setNotlar(q.notlar);
    setHazirlayanMail(q.hazirlayanMail);
    setItems(q.items);
    setActiveTab('editor');
  };

  const handleDeleteQuote = (id: string) => {
    Alert.alert('Teklifi Sil', 'Bu teklifi silmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          setQuotes(quotes.filter((q) => q.id !== id));
          showToast('Teklif silindi');
        }
      }
    ]);
  };

  const handleUpdateStatus = (id: string, status: CustomerQuote['status']) => {
    setQuotes(quotes.map((q) => (q.id === id ? { ...q, status } : q)));
    showToast(`Teklif durumu: ${status}`);
  };

  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch =
      q.musFirma.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.teklifNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.projeAdi.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'Tümü' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Toast Notification */}
      {toastMsg && (
        <View style={styles.toast} testID="toast-notification">
          <Ionicons name="information-circle" size={18} color="#fff" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>SKY</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>PRO TEKLİF & CRM</Text>
            <Text style={styles.headerSubtitle}>Profesyonel Teklif Hazırlama ve Takip</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="new-quote-top-btn"
          style={styles.headerNewBtn}
          onPress={handleCreateNew}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.headerNewBtnText}>Yeni Teklif</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.contentBody}>
        {activeTab === 'list' && (
          <View style={styles.tabContainer} testID="quotes-list-view">
            {/* Search & Filters */}
            <View style={styles.filterCard}>
              <View style={styles.searchBox} testID="search-input-container">
                <Ionicons name="search" size={18} color="#6b7280" />
                <TextInput
                  testID="quote-search-input"
                  style={styles.searchInput}
                  placeholder="Firma, teklif no veya proje ara..."
                  placeholderTextColor="#9ca3af"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#6b7280" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Chips Row */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScrollContainer}
              >
                {['Tümü', 'Taslak', 'Görüldü', 'Onaylandı', 'Reddedildi'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    testID={`filter-chip-${st}`}
                    style={[styles.chip, statusFilter === st && styles.chipActive]}
                    onPress={() => setStatusFilter(st)}
                  >
                    <Text style={[styles.chipText, statusFilter === st && styles.chipTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* List of Quotes */}
            <ScrollView contentContainerStyle={styles.listScrollContent} showsVerticalScrollIndicator={false}>
              {filteredQuotes.length === 0 ? (
                <View style={styles.emptyContainer} testID="empty-quotes-state">
                  <Ionicons name="document-text-outline" size={56} color="#9ca3af" />
                  <Text style={styles.emptyTitle}>Teklif Bulunamadı</Text>
                  <Text style={styles.emptySubtitle}>Arama kriterlerinize uygun kayıt bulunmuyor.</Text>
                  <TouchableOpacity testID="create-first-quote-btn" style={styles.emptyBtn} onPress={handleCreateNew}>
                    <Text style={styles.emptyBtnText}>Yeni Teklif Oluştur</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filteredQuotes.map((q) => (
                  <View key={q.id} style={styles.quoteCard} testID={`quote-card-${q.teklifNo}`}>
                    <View style={styles.quoteCardTop}>
                      <View>
                        <Text style={styles.quoteNoText}>{q.teklifNo}</Text>
                        <Text style={styles.quoteFirmaText}>{q.musFirma}</Text>
                      </View>
                      <View style={styles.quoteAmountWrap}>
                        <Text style={styles.quoteAmountText}>
                          {q.totalAmount.toLocaleString('tr-TR')} {q.paraBirimi}
                        </Text>
                        <Text style={styles.quoteDateText}>{q.tarih}</Text>
                      </View>
                    </View>

                    <Text style={styles.quoteProjectText} numberOfLines={1}>
                      {q.projeAdi || 'Proje adı girilmedi'}
                    </Text>

                    <View style={styles.quoteCardBottom}>
                      {/* Status Selector */}
                      <View style={styles.statusButtonsRow}>
                        {(['Taslak', 'Görüldü', 'Onaylandı', 'Reddedildi'] as const).map((st) => (
                          <TouchableOpacity
                            key={st}
                            testID={`status-btn-${q.teklifNo}-${st}`}
                            style={[
                              styles.miniStatusBtn,
                              q.status === st && styles.miniStatusBtnActive,
                              st === 'Onaylandı' && q.status === st && { backgroundColor: '#10b981' },
                              st === 'Reddedildi' && q.status === st && { backgroundColor: '#ef4444' }
                            ]}
                            onPress={() => handleUpdateStatus(q.id, st)}
                          >
                            <Text
                              style={[
                                styles.miniStatusText,
                                q.status === st && styles.miniStatusTextActive
                              ]}
                            >
                              {st}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Action buttons */}
                      <View style={styles.quoteActionsRow}>
                        <TouchableOpacity
                          testID={`preview-quote-${q.teklifNo}`}
                          style={styles.cardActionBtn}
                          onPress={() => {
                            handleEditQuote(q);
                            setActiveTab('preview');
                          }}
                        >
                          <Ionicons name="eye-outline" size={16} color="#3a3b40" />
                          <Text style={styles.cardActionText}>Önizle / PDF</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          testID={`edit-quote-${q.teklifNo}`}
                          style={styles.cardActionBtn}
                          onPress={() => handleEditQuote(q)}
                        >
                          <Ionicons name="create-outline" size={16} color="#3a3b40" />
                          <Text style={styles.cardActionText}>Düzenle</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          testID={`delete-quote-${q.teklifNo}`}
                          style={[styles.cardActionBtn, { borderColor: '#fca5a5' }]}
                          onPress={() => handleDeleteQuote(q.id)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {activeTab === 'editor' && (
          <ScrollView contentContainerStyle={styles.editorContent} testID="quote-editor-view" showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionHeader}>1. Teklif ve Temsilci Bilgileri</Text>
            
            <View style={styles.fgroup}>
              <Text style={styles.label}>Hazırlayan Temsilci</Text>
              <View style={styles.pickerRow}>
                {REPRESANTATIVES.map((rep) => (
                  <TouchableOpacity
                    key={rep.email}
                    testID={`rep-option-${rep.name}`}
                    style={[styles.repChip, hazirlayanMail === rep.email && styles.repChipActive]}
                    onPress={() => setHazirlayanMail(rep.email)}
                  >
                    <Text style={[styles.repChipText, hazirlayanMail === rep.email && styles.repChipTextActive]}>
                      {rep.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Teklif No</Text>
                <TextInput
                  testID="editor-teklifNo"
                  style={styles.input}
                  value={teklifNo}
                  onChangeText={setTeklifNo}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Para Birimi</Text>
                <View style={styles.pickerRow}>
                  {['USD', 'EUR', 'TRY', 'GBP'].map((cur) => (
                    <TouchableOpacity
                      key={cur}
                      testID={`currency-${cur}`}
                      style={[styles.currChip, paraBirimi === cur && styles.currChipActive]}
                      onPress={() => setParaBirimi(cur)}
                    >
                      <Text style={[styles.currChipText, paraBirimi === cur && styles.currChipTextActive]}>
                        {cur}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Teklif Tarihi</Text>
                <TextInput
                  testID="editor-tarih"
                  style={styles.input}
                  value={tarih}
                  onChangeText={setTarih}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Geçerlilik Tarihi</Text>
                <TextInput
                  testID="editor-gecerlilik"
                  style={styles.input}
                  value={gecerlilik}
                  onChangeText={setGecerlilik}
                />
              </View>
            </View>

            <Text style={styles.sectionHeader}>2. Müşteri Bilgileri</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Firma Adı</Text>
              <TextInput
                testID="editor-musFirma"
                style={styles.input}
                placeholder="Örn: ABC Mimarlık A.Ş."
                value={musFirma}
                onChangeText={setMusFirma}
              />
            </View>
            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>İlgili Kişi</Text>
                <TextInput
                  testID="editor-musAdi"
                  style={styles.input}
                  placeholder="Örn: Ahmet Yılmaz"
                  value={musAdi}
                  onChangeText={setMusAdi}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  testID="editor-musTel"
                  style={styles.input}
                  placeholder="+90 532 ..."
                  value={musTel}
                  onChangeText={setMusTel}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                testID="editor-musMail"
                style={styles.input}
                placeholder="ornek@firma.com"
                value={musMail}
                onChangeText={setMusMail}
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Adres</Text>
              <TextInput
                testID="editor-musAdres"
                style={styles.input}
                placeholder="Şehir / İlçe / Açık Adres"
                value={musAdres}
                onChangeText={setMusAdres}
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Proje Adı</Text>
              <TextInput
                testID="editor-projeAdi"
                style={styles.input}
                placeholder="Örn: Merkez Ofis Tadilat ve Donatı"
                value={projeAdi}
                onChangeText={setProjeAdi}
              />
            </View>

            <Text style={styles.sectionHeader}>3. Teklif Kalemleri ({items.length})</Text>
            {items.map((it, idx) => (
              <View key={it.id} style={styles.itemEditorBox} testID={`item-box-${idx}`}>
                <View style={styles.itemEditorHdr}>
                  <Text style={styles.itemEditorTitle}>Kalem #{idx + 1}</Text>
                  <TouchableOpacity testID={`remove-item-${idx}`} onPress={() => handleRemoveItem(it.id)}>
                    <Ionicons name="trash-bin-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.fgroup}>
                  <Text style={styles.label}>Kategori</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catChip, it.kategori === cat && styles.catChipActive]}
                        onPress={() => handleUpdateItem(it.id, 'kategori', cat)}
                      >
                        <Text style={[styles.catChipText, it.kategori === cat && styles.catChipTextActive]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.fgroup}>
                  <Text style={styles.label}>Ürün / Hizmet Adı</Text>
                  <TextInput
                    style={styles.input}
                    value={it.urunAdi}
                    onChangeText={(val) => handleUpdateItem(it.id, 'urunAdi', val)}
                  />
                </View>

                <View style={styles.fgroup}>
                  <Text style={styles.label}>Açıklama / Detay</Text>
                  <TextInput
                    style={styles.input}
                    value={it.aciklama}
                    onChangeText={(val) => handleUpdateItem(it.id, 'aciklama', val)}
                  />
                </View>

                <View style={styles.row2}>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Adet</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(it.adet)}
                      onChangeText={(val) => handleUpdateItem(it.id, 'adet', val)}
                    />
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Birim</Text>
                    <TextInput
                      style={styles.input}
                      value={it.birim}
                      onChangeText={(val) => handleUpdateItem(it.id, 'birim', val)}
                    />
                  </View>
                </View>

                <View style={styles.fgroup}>
                  <Text style={styles.label}>Birim Fiyat ({paraBirimi})</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(it.birimFiyat)}
                    onChangeText={(val) => handleUpdateItem(it.id, 'birimFiyat', val)}
                  />
                </View>
              </View>
            ))}

            <TouchableOpacity testID="add-item-btn" style={styles.addItemBtn} onPress={handleAddItem}>
              <Ionicons name="add-circle-outline" size={18} color="#3a3b40" />
              <Text style={styles.addItemBtnText}>Yeni Kalem Ekle</Text>
            </TouchableOpacity>

            <Text style={styles.sectionHeader}>4. Ticari Koşullar & İskonto</Text>
            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>İskonto Oranı (%)</Text>
                <TextInput
                  testID="editor-iskonto"
                  style={styles.input}
                  keyboardType="numeric"
                  value={iskonto}
                  onChangeText={setIskonto}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Nakliye Şekli</Text>
                <TextInput
                  style={styles.input}
                  value={nakliye}
                  onChangeText={setNakliye}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Ödeme Şekli</Text>
                <TextInput
                  style={styles.input}
                  value={odemeSekli}
                  onChangeText={setOdemeSekli}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Teslim Süresi</Text>
                <TextInput
                  style={styles.input}
                  value={teslimGun}
                  onChangeText={setTeslimGun}
                />
              </View>
            </View>

            <View style={styles.fgroup}>
              <Text style={styles.label}>Notlar / Açıklamalar</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                multiline
                value={notlar}
                onChangeText={setNotlar}
              />
            </View>

            <TouchableOpacity testID="save-quote-btn" style={styles.saveBtn} onPress={handleSaveQuote}>
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Teklifi Kaydet & Listeye Dön</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'preview' && (
          <ScrollView contentContainerStyle={styles.previewContent} testID="quote-preview-view" showsVerticalScrollIndicator={false}>
            {/* A4 Sheet Simulation */}
            <View style={styles.sheet} testID="pdf-preview-sheet">
              {/* Header */}
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetCompanyTitle}>SKYART GROUP PRO</Text>
                  <Text style={styles.sheetCompanySub}>Profesyonel Çözüm ve Teklif Sistemleri</Text>
                  <Text style={styles.sheetCompanySub}>Temsilci: {currentRep.name} ({currentRep.email})</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.sheetDocTitle}>FİYAT TEKLİFİ</Text>
                  <Text style={styles.sheetMeta}>Teklif No: {teklifNo}</Text>
                  <Text style={styles.sheetMeta}>Tarih: {tarih}</Text>
                  <Text style={styles.sheetMeta}>Geçerlilik: {gecerlilik}</Text>
                </View>
              </View>

              {/* Customer Box */}
              <View style={styles.sheetInfoGrid}>
                <View style={styles.sheetInfoBox}>
                  <Text style={styles.sheetBoxHdr}>MÜŞTERİ BİLGİLERİ</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Firma:</Text> {musFirma || '-'}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>İlgili:</Text> {musAdi || '-'}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Telefon:</Text> {musTel || '-'}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>E-posta:</Text> {musMail || '-'}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Adres:</Text> {musAdres || '-'}</Text>
                </View>
                <View style={styles.sheetInfoBox}>
                  <Text style={styles.sheetBoxHdr}>PROJE & KOŞULLAR</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Proje:</Text> {projeAdi || '-'}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Nakliye:</Text> {nakliye}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Ödeme:</Text> {odemeSekli}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Teslim:</Text> {teslimGun}</Text>
                  <Text style={styles.sheetBoxText}><Text style={styles.bold}>Menşei:</Text> {mensei}</Text>
                </View>
              </View>

              {/* Items Table */}
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, { flex: 0.5 }]}>#</Text>
                  <Text style={[styles.th, { flex: 2.5 }]}>Ürün / Açıklama</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Miktar</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Birim Fiyat</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Toplam</Text>
                </View>
                {items.map((it, idx) => {
                  const lineTotal = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
                  return (
                    <View key={it.id} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 0.5 }]}>{idx + 1}</Text>
                      <View style={[styles.td, { flex: 2.5 }]}>
                        <Text style={styles.tdBold}>{it.urunAdi}</Text>
                        <Text style={styles.tdSub}>{it.kategori} {it.aciklama ? `• ${it.aciklama}` : ''}</Text>
                      </View>
                      <Text style={[styles.td, { flex: 1 }]}>{it.adet} {it.birim}</Text>
                      <Text style={[styles.td, { flex: 1.2 }]}>{Number(it.birimFiyat).toLocaleString('tr-TR')} {paraBirimi}</Text>
                      <Text style={[styles.td, styles.tdBold, { flex: 1.2 }]}>{lineTotal.toLocaleString('tr-TR')} {paraBirimi}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Totals & Notes */}
              <View style={styles.sheetBottomGrid}>
                <View style={styles.sheetNotesBox}>
                  <Text style={styles.sheetBoxHdr}>NOTLAR VE ŞARTLAR</Text>
                  <Text style={styles.sheetNotesText}>{notlar}</Text>
                </View>
                <View style={styles.sheetTotalsBox}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Ara Toplam:</Text>
                    <Text style={styles.totalVal}>{subtotal.toLocaleString('tr-TR')} {paraBirimi}</Text>
                  </View>
                  {iskontoOrani > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>İskonto (%{iskontoOrani}):</Text>
                      <Text style={[styles.totalVal, { color: '#ef4444' }]}>-{iskontoTutar.toLocaleString('tr-TR')} {paraBirimi}</Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>KDV (%20):</Text>
                    <Text style={styles.totalVal}>{kdvTutar.toLocaleString('tr-TR')} {paraBirimi}</Text>
                  </View>
                  <View style={[styles.totalRow, styles.totalGrand]}>
                    <Text style={styles.grandLabel}>GENEL TOPLAM:</Text>
                    <Text style={styles.grandVal}>{genelToplam.toLocaleString('tr-TR')} {paraBirimi}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.previewActionsRow}>
              <TouchableOpacity
                testID="share-whatsapp-btn"
                style={[styles.actionBtn, styles.whatsappBtn]}
                onpress={() => {
                  Share.share({
                    message: `Sayın ${musFirma || 'Müşterimiz'}, ${teklifNo} nolu ${genelToplam.toLocaleString('tr-TR')} ${paraBirimi} tutarındaki teklifimiz hazır. Proje: ${projeAdi}`
                  });
                }}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>WhatsApp ile Paylaş</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="download-pdf-btn"
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={() => showToast('PDF cihazınıza kaydedildi (Simüle edildi)!')}
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>PDF İndir</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Bottom Navigation Tab Bar */}
      <View style={styles.tabBar} testID="bottom-tab-bar">
        <TouchableOpacity
          testID="tab-list"
          style={[styles.tabItem, activeTab === 'list' && styles.tabItemActive]}
          onPress={() => setActiveTab('list')}
        >
          <Ionicons
            name="document-text"
            size={22}
            color={activeTab === 'list' ? '#3a3b40' : '#9ca3af'}
          />
          <Text style={[styles.tabLabel, activeTab === 'list' && styles.tabLabelActive]}>Teklifler</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-editor"
          style={[styles.tabItem, activeTab === 'editor' && styles.tabItemActive]}
          onPress={() => setActiveTab('editor')}
        >
          <Ionicons
            name="create"
            size={22}
            color={activeTab === 'editor' ? '#3a3b40' : '#9ca3af'}
          />
          <Text style={[styles.tabLabel, activeTab === 'editor' && styles.tabLabelActive]}>Yeni / Düzenle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-preview"
          style={[styles.tabItem, activeTab === 'preview' && styles.tabItemActive]}
          onPress={() => setActiveTab('preview')}
        >
          <Ionicons
            name="eye"
            size={22}
            color={activeTab === 'preview' ? '#3a3b40' : '#9ca3af'}
          />
          <Text style={[styles.tabLabel, activeTab === 'preview' && styles.tabLabelActive]}>Önizleme</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f9'
  },
  toast: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: '#232428',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    zIndex: 9999,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600'
  },
  header: {
    height: 64,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d8dee6'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  logoBadge: {
    width: 38,
    height: 38,
    backgroundColor: '#3a3b40',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#232428'
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280'
  },
  headerNewBtn: {
    backgroundColor: '#3a3b40',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4
  },
  headerNewBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  contentBody: {
    flex: 1
  },
  tabContainer: {
    flex: 1
  },
  filterCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d8dee6'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f6f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: '#d8dee6',
    marginBottom: 8
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#1a1a1a'
  },
  chipsScrollContainer: {
    gap: 8,
    paddingVertical: 4
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f4f6f9',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d8dee6',
    flexShrink: 0
  },
  chipActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563'
  },
  chipTextActive: {
    color: '#fff'
  },
  listScrollContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 12
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#232428',
    marginTop: 12
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20
  },
  emptyBtn: {
    backgroundColor: '#3a3b40',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  quoteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dee6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  quoteCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6
  },
  quoteNoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280'
  },
  quoteFirmaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#232428',
    marginTop: 2
  },
  quoteAmountWrap: {
    alignItems: 'flex-end'
  },
  quoteAmountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3a3b40'
  },
  quoteDateText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2
  },
  quoteProjectText: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 12
  },
  quoteCardBottom: {
    borderTopWidth: 1,
    borderTopColor: '#f4f6f9',
    paddingTop: 10,
    gap: 10
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6
  },
  miniStatusBtn: {
    flex: 1,
    paddingVertical: 5,
    backgroundColor: '#f4f6f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d8dee6',
    alignItems: 'center'
  },
  miniStatusBtnActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  miniStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4b5563'
  },
  miniStatusTextActive: {
    color: '#fff'
  },
  quoteActionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d8dee6',
    backgroundColor: '#fff',
    gap: 6
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3a3b40'
  },
  editorContent: {
    padding: 16,
    paddingBottom: 100
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#232428',
    marginTop: 16,
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#3a3b40',
    paddingBottom: 4,
    textTransform: 'uppercase'
  },
  fgroup: {
    marginBottom: 12
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a1a'
  },
  row2: {
    flexDirection: 'row',
    gap: 12
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  repChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 6
  },
  repChipActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  repChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563'
  },
  repChipTextActive: {
    color: '#fff'
  },
  currChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 6
  },
  currChipActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  currChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563'
  },
  currChipTextActive: {
    color: '#fff'
  },
  itemEditorBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12
  },
  itemEditorHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  itemEditorTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3a3b40',
    textTransform: 'uppercase'
  },
  catChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#f4f6f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d8dee6',
    marginRight: 6
  },
  catChipActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563'
  },
  catChipTextActive: {
    color: '#fff'
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#3a3b40',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3a3b40'
  },
  saveBtn: {
    backgroundColor: '#3a3b40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
    marginTop: 10,
    marginBottom: 40
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  previewContent: {
    padding: 16,
    paddingBottom: 100,
    alignItems: 'center'
  },
  sheet: {
    width: '100%',
    maxWidth: 650,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#d8dee6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderBottomColor: '#3a3b40',
    paddingBottom: 12,
    marginBottom: 14
  },
  sheetCompanyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3a3b40'
  },
  sheetCompanySub: {
    fontSize: 11,
    color: '#6b7280'
  },
  sheetDocTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#232428',
    textAlign: 'right'
  },
  sheetMeta: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'right'
  },
  sheetInfoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14
  },
  sheetInfoBox: {
    flex: 1,
    backgroundColor: '#f4f6f9',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d8dee6'
  },
  sheetBoxHdr: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#3a3b40',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  sheetBoxText: {
    fontSize: 11,
    color: '#1a1a1a',
    marginBottom: 2
  },
  bold: {
    fontWeight: '700'
  },
  table: {
    borderWidth: 1,
    borderColor: '#3a3b40',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#3a3b40',
    paddingVertical: 8,
    paddingHorizontal: 6
  },
  th: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'left'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d8dee6',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center'
  },
  td: {
    fontSize: 11,
    color: '#1a1a1a'
  },
  tdBold: {
    fontWeight: '700'
  },
  tdSub: {
    fontSize: 10,
    color: '#6b7280'
  },
  sheetBottomGrid: {
    flexDirection: 'row',
    gap: 12
  },
  sheetNotesBox: {
    flex: 1,
    backgroundColor: '#f4f6f9',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d8dee6'
  },
  sheetNotesText: {
    fontSize: 10,
    color: '#4b5563',
    lineHeight: 14
  },
  sheetTotalsBox: {
    flex: 1,
    gap: 4
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 4
  },
  totalLabel: {
    fontSize: 11,
    color: '#6b7280'
  },
  totalVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1a1a'
  },
  totalGrand: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  grandLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff'
  },
  grandVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff'
  },
  previewActionsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 650,
    marginTop: 16
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8
  },
  whatsappBtn: {
    backgroundColor: '#25D366'
  },
  primaryBtn: {
    backgroundColor: '#3a3b40'
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#fff',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#d8dee6',
    elevation: 8
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#3a3b40'
  },
  tabLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2
  },
  tabLabelActive: {
    color: '#3a3b40',
    fontWeight: '700'
  }
});

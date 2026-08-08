import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Share,
  Modal,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface CompanyProfile {
  sirketAdi: string;
  logoUrl: string;
  adres: string;
  telefon: string;
  email: string;
  bankaBilgileri: string;
}

interface ProductItem {
  id: string;
  kategori: string;
  urunAdi: string;
  birim: string;
  birimFiyat: number;
}

interface QuoteItem {
  id: string;
  kategori: string;
  urunAdi: string;
  aciklama: string;
  adet: number;
  birim: string;
  birimFiyat: number;
}

interface SavedQuote {
  id: string;
  teklifNo: string;
  tarih: string;
  gecerlilik: string;
  musFirma: string;
  musAdi: string;
  musTel: string;
  musMail: string;
  musAdres: string;
  projeAdi: string;
  nakliye: string;
  paraBirimi: string;
  odemeSekli: string;
  mensei: string;
  teslimGun: string;
  iskonto: number;
  notlar: string;
  items: QuoteItem[];
  totalAmount: number;
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'products' | 'company' | 'history'>('editor');

  // 1. Şirket Profili (Çoklu Şirket)
  const [company, setCompany] = useState<CompanyProfile>({
    sirketAdi: 'Anında Teklif Çözümleri A.Ş.',
    logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
    adres: 'Maslak Mah. Büyükdere Cad. No:199 Sarıyer/İstanbul',
    telefon: '0 850 555 00 00',
    email: 'info@anindateklif.com',
    bankaBilgileri: 'GARANTİ BANKASI (TR12 0006 ...)'
  });

  // 2. Kayıtlı Ürün / Kalem Kataloğu
  const [catalog, setCatalog] = useState<ProductItem[]>([
    { id: 'cat-1', kategori: 'Yazılım', urunAdi: 'Özel Mobil Uygulama Geliştirme', birim: 'Proje', birimFiyat: 3500 },
    { id: 'cat-2', kategori: 'Danışmanlık', urunAdi: 'UI/UX Tasarım ve Mimari Danışmanlık', birim: 'Ay', birimFiyat: 1200 },
    { id: 'cat-3', kategori: 'Donanım', urunAdi: 'Endüstriyel Akustik Panel (10lu)', birim: 'Paket', birimFiyat: 750 }
  ]);

  // Yeni ürün ekleme modal state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newCat, setNewCat] = useState('Genel');
  const [newUrunAdi, setNewUrunAdi] = useState('');
  const [newBirim, setNewBirim] = useState('Adet');
  const [newBirimFiyat, setNewBirimFiyat] = useState('500');

  // Teklif Form State
  const [teklifNo, setTeklifNo] = useState('AT-' + Math.floor(100000 + Math.random() * 900000));
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [gecerlilik, setGecerlilik] = useState(
    new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
  );
  const [musFirma, setMusFirma] = useState('');
  const [musAdi, setMusAdi] = useState('');
  const [musTel, setMusTel] = useState('');
  const [musMail, setMusMail] = useState('');
  const [musAdres, setMusAdres] = useState('');
  const [projeAdi, setProjeAdi] = useState('');
  const [nakliye, setNakliye] = useState('EXW');
  const [paraBirimi, setParaBirimi] = useState('USD');
  const [odemeSekli, setOdemeSekli] = useState('%50 Peşin-%50 Teslim');
  const [mensei, setMensei] = useState('TÜRKİYE');
  const [teslimGun, setTeslimGun] = useState('15-20 GÜN');
  const [iskonto, setIskonto] = useState('0');
  const [notlar, setNotlar] = useState(
    'Fiyatlarımıza KDV hariçtir. Ödeme koşulları sözleşme esasına dayalıdır.'
  );

  const [items, setItems] = useState<QuoteItem[]>([]);
  const [history, setHistory] = useState<SavedQuote[]>([]);
  const [customers, setCustomers] = useState<{ firma: string; adi: string; tel: string; mail: string; adres: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const subtotal = items.reduce((acc, it) => acc + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0);
  const iskontoOrani = Number(iskonto) || 0;
  const iskontoTutar = (subtotal * iskontoOrani) / 100;
  const araToplam = subtotal - iskontoTutar;
  const kdvTutar = araToplam * 0.20;
  const genelToplam = araToplam + kdvTutar;

  const handleAddCatalogItemToQuote = (prod: ProductItem) => {
    const newItem: QuoteItem = {
      id: 'item-' + Date.now() + Math.random(),
      kategori: prod.kategori,
      urunAdi: prod.urunAdi,
      aciklama: '',
      adet: 1,
      birim: prod.birim,
      birimFiyat: prod.birimFiyat
    };
    setItems([...items, newItem]);
    showToast(`"${prod.urunAdi}" teklife eklendi.`);
  };

  const handleRemoveQuoteItem = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const handleUpdateQuoteItem = (id: string, field: keyof QuoteItem, val: any) => {
    setItems(items.map((it) => (it.id === id ? { ...it, [field]: val } : it)));
  };

  const handleSaveAndShare = () => {
    if (!musFirma.trim()) {
      showToast('Lütfen Müşteri / Firma Adı girin!');
      return;
    }
    const newQuote: SavedQuote = {
      id: 'q-' + Date.now(),
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
      items: [...items],
      totalAmount: genelToplam
    };

    const existingCustIndex = customers.findIndex(c => c.firma.toLowerCase() === musFirma.toLowerCase());
    if (existingCustIndex >= 0) {
      const updated = [...customers];
      updated[existingCustIndex] = { firma: musFirma, adi: musAdi, tel: musTel, mail: musMail, adres: musAdres };
      setCustomers(updated);
    } else {
      setCustomers([...customers, { firma: musFirma, adi: musAdi, tel: musTel, mail: musMail, adres: musAdres }]);
    }

    setHistory([newQuote, ...history]);
    showToast('Teklif kaydedildi!');
    setActiveTab('preview');
  };

  const currencySymbol = paraBirimi === 'USD' ? '$' : paraBirimi === 'EUR' ? '€' : '₺';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {toast && (
        <View style={styles.toast} testID="toast-msg">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Image source={{ uri: company.logoUrl }} style={styles.brandLogoImg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle} numberOfLines={1}>{company.sirketAdi}</Text>
            <Text style={styles.brandSubtitle} numberOfLines={1}>Anında Teklif Sistemi</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="company-settings-btn"
          style={styles.settingsHeaderBtn}
          onPress={() => setActiveTab('company')}
        >
          <Ionicons name="business-outline" size={16} color="#2563eb" />
          <Text style={styles.settingsHeaderText}>Şirket</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* 1. EDİTÖR / TEKLİF FORMU */}
        {activeTab === 'editor' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>TEKLİF BİLGİLERİ</Text>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Teklif No</Text>
                <TextInput style={styles.input} value={teklifNo} onChangeText={setTeklifNo} />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Tarih</Text>
                <TextInput style={styles.input} value={tarih} onChangeText={setTarih} />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Geçerlilik Tarihi</Text>
              <TextInput style={styles.input} value={gecerlilik} onChangeText={setGecerlilik} />
            </View>

            <Text style={styles.secHeader}>MÜŞTERİ BİLGİLERİ</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Firma Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Firma adını yazın..."
                placeholderTextColor="#9ca3af"
                value={musFirma}
                onChangeText={(val) => {
                  setMusFirma(val);
                  const found = customers.find(c => c.firma.toLowerCase() === val.toLowerCase());
                  if (found) {
                    setMusAdi(found.adi);
                    setMusTel(found.tel);
                    setMusMail(found.mail);
                    setMusAdres(found.adres);
                  }
                }}
              />
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Müşteri Adı</Text>
                <TextInput style={styles.input} placeholder="Yetkili" placeholderTextColor="#9ca3af" value={musAdi} onChangeText={setMusAdi} />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Telefon</Text>
                <TextInput style={styles.input} placeholder="+90 5XX..." placeholderTextColor="#9ca3af" value={musTel} onChangeText={setMusTel} />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>E-Mail</Text>
              <TextInput style={styles.input} placeholder="musteri@firma.com" placeholderTextColor="#9ca3af" value={musMail} onChangeText={setMusMail} />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Adres</Text>
              <TextInput style={styles.input} placeholder="Açık Adres / Şehir" placeholderTextColor="#9ca3af" value={musAdres} onChangeText={setMusAdres} />
            </View>

            <Text style={styles.secHeader}>SİPARİŞ BİLGİLERİ</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Proje Adı</Text>
              <TextInput style={styles.input} placeholder="Proje veya iş adı" placeholderTextColor="#9ca3af" value={projeAdi} onChangeText={setProjeAdi} />
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Nakliye</Text>
                <TextInput style={styles.input} value={nakliye} onChangeText={setNakliye} />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Para Birimi</Text>
                <View style={styles.pickerRow}>
                  {['USD', 'EUR', 'TRY'].map((cur) => (
                    <TouchableOpacity
                      key={cur}
                      style={[styles.currChip, paraBirimi === cur && styles.currChipActive]}
                      onPress={() => setParaBirimi(cur)}
                    >
                      <Text style={[styles.currText, paraBirimi === cur && styles.currTextActive]}>{cur}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Ödeme Şekli</Text>
                <TextInput style={styles.input} value={odemeSekli} onChangeText={setOdemeSekli} />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>İskonto (%)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={iskonto} onChangeText={setIskonto} />
              </View>
            </View>

            <Text style={styles.secHeader}>ÜRÜN VE HİZMET KALEMLERİ ({items.length})</Text>
            {items.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.emptyItemsText}>Henüz kalem eklenmedi. Ürün kataloğundan veya aşağıdan ekleyin.</Text>
              </View>
            ) : (
              items.map((it, idx) => (
                <View key={it.id} style={styles.itemCard} testID={`item-box-${idx}`}>
                  <View style={styles.itemCardHdr}>
                    <Text style={styles.itemCardTitle}>Kalem #{idx + 1}</Text>
                    <TouchableOpacity onPress={() => handleRemoveQuoteItem(it.id)}>
                      <Ionicons name="trash-outline" size={16} color="#c0392b" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Ürün / Hizmet Adı</Text>
                    <TextInput
                      style={styles.input}
                      value={it.urunAdi}
                      onChangeText={(val) => handleUpdateQuoteItem(it.id, 'urunAdi', val)}
                    />
                  </View>
                  <View style={styles.row2}>
                    <View style={[styles.fgroup, { flex: 1 }]}>
                      <Text style={styles.label}>Adet</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(it.adet)}
                        onChangeText={(val) => handleUpdateQuoteItem(it.id, 'adet', val)}
                      />
                    </View>
                    <View style={[styles.fgroup, { flex: 1 }]}>
                      <Text style={styles.label}>Birim Fiyat ({currencySymbol})</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(it.birimFiyat)}
                        onChangeText={(val) => handleUpdateQuoteItem(it.id, 'birimFiyat', val)}
                      />
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Katalogdan Seç Butonu */}
            <TouchableOpacity
              testID="open-catalog-btn"
              style={styles.addItemBtn}
              onPress={() => setActiveTab('products')}
            >
              <Ionicons name="library-outline" size={16} color="#2563eb" />
              <Text style={styles.addItemBtnText}>+ Ürün/Katalog Yönetiminden Kalem Seç</Text>
            </TouchableOpacity>

            <Text style={styles.secHeader}>ÖZEL NOTLAR</Text>
            <View style={styles.fgroup}>
              <TextInput
                style={[styles.input, { height: 75, textAlignVertical: 'top' }]}
                multiline
                value={notlar}
                onChangeText={setNotlar}
              />
            </View>

            <TouchableOpacity
              testID="save-and-preview-btn"
              style={styles.primaryBtn}
              onPress={handleSaveAndShare}
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Teklifi Tamamla & Önizle</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* 2. TAM EKRAN PDF ÖNİZLEME */}
        {activeTab === 'preview' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheet} testID="quote-sheet-preview">
              <View style={styles.sheetHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Image source={{ uri: company.logoUrl }} style={styles.previewLogoImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetCompanyName}>{company.sirketAdi}</Text>
                    <Text style={styles.sheetCompanySub}>{company.adres}</Text>
                    <Text style={styles.sheetCompanySub}>Tel: {company.telefon} • {company.email}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.sheetDocTitle}>FİYAT TEKLİFİ</Text>
                  <Text style={styles.sheetMeta}>No: {teklifNo}</Text>
                  <Text style={styles.sheetMeta}>Tarih: {tarih}</Text>
                  <Text style={styles.sheetMeta}>Geçerlilik: {gecerlilik}</Text>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoBox}>
                  <Text style={styles.boxTitle}>MÜŞTERİ BİLGİLERİ</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>FİRMA:</Text> {musFirma || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>İLGİLİ:</Text> {musAdi || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>TEL:</Text> {musTel || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>E-POSTA:</Text> {musMail || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>ADRES:</Text> {musAdres || '-'}</Text>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.boxTitle}>SİPARİŞ KOŞULLARI</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>PROJE:</Text> {projeAdi || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>NAKLİYE:</Text> {nakliye}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>PARA BİRİMİ:</Text> {paraBirimi}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>ÖDEME:</Text> {odemeSekli}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>TESLİM:</Text> {teslimGun}</Text>
                </View>
              </View>

              {/* Tablo */}
              <View style={styles.table}>
                <View style={styles.tableHdr}>
                  <Text style={[styles.th, { width: 32, textAlign: 'center' }]}>#</Text>
                  <Text style={[styles.th, { flex: 2 }]}>HİZMET / ÜRÜN</Text>
                  <Text style={[styles.th, { width: 45, textAlign: 'center' }]}>ADET</Text>
                  <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>BİRİM</Text>
                  <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>TOPLAM</Text>
                </View>
                {items.length === 0 ? (
                  <View style={styles.tableEmptyRow}>
                    <Text style={styles.tableEmptyText}>Henüz kalem eklenmedi.</Text>
                  </View>
                ) : (
                  items.map((it, idx) => {
                    const lineTotal = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
                    return (
                      <View key={it.id} style={styles.tableRow}>
                        <Text style={[styles.td, { width: 32, textAlign: 'center' }]}>{idx + 1}</Text>
                        <View style={[styles.td, { flex: 2 }]}>
                          <Text style={styles.tdBold} numberOfLines={2}>{it.urunAdi || 'İsimsiz Ürün'}</Text>
                          {it.aciklama ? <Text style={styles.tdSub} numberOfLines={1}>{it.aciklama}</Text> : null}
                        </View>
                        <Text style={[styles.td, { width: 45, textAlign: 'center' }]} numberOfLines={1}>{it.adet} {it.birim}</Text>
                        <Text style={[styles.td, { width: 70, textAlign: 'right' }]} numberOfLines={1}>{Number(it.birimFiyat).toLocaleString('tr-TR')} {currencySymbol}</Text>
                        <Text style={[styles.td, styles.tdBold, { width: 70, textAlign: 'right' }]} numberOfLines={1}>{lineTotal.toLocaleString('tr-TR')} {currencySymbol}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              <Text style={styles.warnText}>ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR. KDV HARİÇTİR.</Text>

              <View style={styles.sheetFooterGrid}>
                <View style={styles.sheetNotesBox}>
                  <Text style={styles.boxTitle}>ÖZEL NOTLAR</Text>
                  <Text style={styles.notesText}>{notlar}</Text>
                  <Text style={[styles.boxTitle, { marginTop: 8 }]}>BANKA HESAPLARI</Text>
                  <Text style={styles.notesText}>{company.bankaBilgileri}</Text>
                </View>
                <View style={styles.sheetTotalsBox}>
                  <View style={styles.totRow}>
                    <Text style={styles.totLabel}>ARA TOPLAM:</Text>
                    <Text style={styles.totVal} numberOfLines={1}>{subtotal.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                  {iskontoOrani > 0 && (
                    <View style={styles.totRow}>
                      <Text style={styles.totLabel}>İSKONTO (%{iskontoOrani}):</Text>
                      <Text style={[styles.totVal, { color: '#c0392b' }]} numberOfLines={1}>-{iskontoTutar.toLocaleString('tr-TR')} {currencySymbol}</Text>
                    </View>
                  )}
                  <View style={styles.totRow}>
                    <Text style={styles.totLabel}>KDV (%20):</Text>
                    <Text style={styles.totVal} numberOfLines={1}>{kdvTutar.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                  <View style={[styles.totRow, styles.totGrand]}>
                    <Text style={styles.grandLabel}>GENEL TOPLAM:</Text>
                    <Text style={styles.grandVal} numberOfLines={1}>{genelToplam.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.signBox}>
                <Text style={styles.signText}>Onay / İmza :</Text>
              </View>
            </View>

            {/* WhatsApp ve Paylaşım butonları */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                testID="whatsapp-share-btn"
                style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                onPress={() => {
                  Share.share({
                    message: `Teklifiniz ekte yer almaktadır. Sayın ${musFirma || 'Müşterimiz'}, ${teklifNo} nolu ${genelToplam.toLocaleString('tr-TR')} ${currencySymbol} tutarındaki teklifimiz hazırdır.`
                  });
                }}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>WhatsApp'ta Paylaş</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="back-to-editor-btn"
                style={[styles.actionBtn, { backgroundColor: '#3a3b40' }]}
                onPress={() => setActiveTab('editor')}
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Düzenlemeye Dön</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* 3. ÜRÜN / KALEM YÖNETİMİ */}
        {activeTab === 'products' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.secHeader}>ŞİRKET ÜRÜN / HİZMET KATALOĞU</Text>
              <TouchableOpacity
                testID="add-product-modal-open"
                style={styles.miniAddBtn}
                onPress={() => setShowAddProductModal(true)}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.miniAddBtnText}>Yeni Kalem</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.infoSubText}>Buraya kaydettiğiniz kalemleri teklif hazırlarken tek tıkla ekleyebilirsiniz.</Text>

            {catalog.map((prod) => (
              <View key={prod.id} style={styles.catalogCard} testID={`catalog-item-${prod.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.catalogCat}>{prod.kategori}</Text>
                  <Text style={styles.catalogTitle}>{prod.urunAdi}</Text>
                  <Text style={styles.catalogPrice}>{prod.birimFiyat} USD / {prod.birim}</Text>
                </View>
                <TouchableOpacity
                  testID={`add-to-quote-${prod.id}`}
                  style={styles.addQuoteBtn}
                  onPress={() => {
                    handleAddCatalogItemToQuote(prod);
                    setActiveTab('editor');
                  }}
                >
                  <Ionicons name="add-circle" size={20} color="#2563eb" />
                  <Text style={styles.addQuoteText}>Teklife Ekle</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* 4. ŞİRKET PROFİLİ (ŞİRKET AYARLARI) */}
        {activeTab === 'company' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>ŞİRKET PROFİLİ & LOGO AYARLARI</Text>
            <Text style={styles.infoSubText}>Buradaki bilgiler ve logo tüm tekliflerde ve önizlemede otomatik yer alır.</Text>

            <View style={styles.fgroup}>
              <Text style={styles.label}>Şirket Adı</Text>
              <TextInput
                style={styles.input}
                value={company.sirketAdi}
                onChangeText={(val) => setCompany({ ...company, sirketAdi: val })}
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Şirket Logo URL (Görsel Bağlantısı)</Text>
              <TextInput
                style={styles.input}
                value={company.logoUrl}
                onChangeText={(val) => setCompany({ ...company, logoUrl: val })}
                placeholder="https://..."
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Şirket Adresi</Text>
              <TextInput
                style={styles.input}
                value={company.adres}
                onChangeText={(val) => setCompany({ ...company, adres: val })}
              />
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  value={company.telefon}
                  onChangeText={(val) => setCompany({ ...company, telefon: val })}
                />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>E-posta</Text>
                <TextInput
                  style={styles.input}
                  value={company.email}
                  onChangeText={(val) => setCompany({ ...company, email: val })}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Banka Hesap Bilgileri</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                multiline
                value={company.bankaBilgileri}
                onChangeText={(val) => setCompany({ ...company, bankaBilgileri: val })}
              />
            </View>

            <TouchableOpacity
              testID="save-company-btn"
              style={styles.primaryBtn}
              onPress={() => showToast('Şirket profili güncellendi!')}
            >
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Şirket Bilgilerini Kaydet</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* 5. GEÇMİŞ & MÜŞTERİLER */}
        {activeTab === 'history' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>KAYITLI MÜŞTERİLER ({customers.length})</Text>
            {customers.length === 0 ? (
              <Text style={styles.emptySubText}>Henüz kayıtlı müşteri yok.</Text>
            ) : (
              customers.map((c, idx) => (
                <View key={idx} style={styles.historyCard}>
                  <Text style={styles.historyFirma} numberOfLines={1}>{c.firma}</Text>
                  <Text style={styles.historyProj} numberOfLines={1}>Yetkili: {c.adi || '-'} • Tel: {c.tel || '-'}</Text>
                </View>
              ))
            )}

            <Text style={[styles.secHeader, { marginTop: 16 }]}>GEÇMİŞ TEKLİFLER ({history.length})</Text>
            {history.length === 0 ? (
              <Text style={styles.emptySubText}>Henüz kayıtlı teklif yok.</Text>
            ) : (
              history.map((q) => (
                <View key={q.id} style={styles.historyCard}>
                  <View style={styles.historyCardTop}>
                    <Text style={styles.historyNo} numberOfLines={1}>{q.teklifNo}</Text>
                    <Text style={styles.historyAmount} numberOfLines={1}>
                      {q.totalAmount.toLocaleString('tr-TR')} {q.paraBirimi}
                    </Text>
                  </View>
                  <Text style={styles.historyFirma} numberOfLines={1}>{q.musFirma}</Text>
                  <Text style={styles.historyProj} numberOfLines={1}>{q.projeAdi || 'Proje adı yok'} • {q.tarih}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {/* Yeni Kalem Ekleme Modalı */}
      <Modal visible={showAddProductModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Kataloğa Yeni Kalem Ekle</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Kategori</Text>
              <TextInput style={styles.input} value={newCat} onChangeText={setNewCat} />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Ürün / Hizmet Adı</Text>
              <TextInput style={styles.input} placeholder="Örn: Özel Danışmanlık" value={newUrunAdi} onChangeText={setNewUrunAdi} />
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Birim</Text>
                <TextInput style={styles.input} value={newBirim} onChangeText={setNewBirim} />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Birim Fiyat</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={newBirimFiyat} onChangeText={setNewBirimFiyat} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1, backgroundColor: '#64748b', marginTop: 0 }]}
                onPress={() => setShowAddProductModal(false)}
              >
                <Text style={styles.primaryBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-catalog-item-btn"
                style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                onPress={() => {
                  if (!newUrunAdi.trim()) return;
                  const newItem: ProductItem = {
                    id: 'cat-' + Date.now(),
                    kategori: newCat,
                    urunAdi: newUrunAdi,
                    birim: newBirim,
                    birimFiyat: Number(newBirimFiyat) || 0
                  };
                  setCatalog([...catalog, newItem]);
                  setShowAddProductModal(false);
                  setNewUrunAdi('');
                  showToast('Kalem kataloğa eklendi!');
                }}
              >
                <Text style={styles.primaryBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar} testID="bottom-tab-bar">
        <TouchableOpacity
          testID="tab-editor"
          style={[styles.tabItem, activeTab === 'editor' && styles.tabItemActive]}
          onPress={() => setActiveTab('editor')}
        >
          <Ionicons name="create-outline" size={20} color={activeTab === 'editor' ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, activeTab === 'editor' && styles.tabLabelActive]} numberOfLines={1}>Teklif</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-preview"
          style={[styles.tabItem, activeTab === 'preview' && styles.tabItemActive]}
          onPress={() => setActiveTab('preview')}
        >
          <Ionicons name="eye-outline" size={20} color={activeTab === 'preview' ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, activeTab === 'preview' && styles.tabLabelActive]} numberOfLines={1}>Önizleme</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-products"
          style={[styles.tabItem, activeTab === 'products' && styles.tabItemActive]}
          onPress={() => setActiveTab('products')}
        >
          <Ionicons name="library-outline" size={20} color={activeTab === 'products' ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, activeTab === 'products' && styles.tabLabelActive]} numberOfLines={1}>Katalog</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-company"
          style={[styles.tabItem, activeTab === 'company' && styles.tabItemActive]}
          onPress={() => setActiveTab('company')}
        >
          <Ionicons name="business-outline" size={20} color={activeTab === 'company' ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, activeTab === 'company' && styles.tabLabelActive]} numberOfLines={1}>Şirket</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-history"
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="time-outline" size={20} color={activeTab === 'history' ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]} numberOfLines={1}>Geçmiş</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  toast: {
    position: 'absolute',
    top: 45,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    zIndex: 9999,
    gap: 6,
    elevation: 5
  },
  toastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  header: {
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8
  },
  brandLogoImg: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  brandSubtitle: {
    fontSize: 10,
    color: '#64748b'
  },
  settingsHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 4
  },
  settingsHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb'
  },
  body: {
    flex: 1
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 80
  },
  secHeader: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#2563eb',
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    textTransform: 'uppercase'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    paddingBottom: 3
  },
  miniAddBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    gap: 2
  },
  miniAddBtnText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700'
  },
  infoSubText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 10
  },
  fgroup: {
    marginBottom: 8
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a'
  },
  row2: {
    flexDirection: 'row',
    gap: 8
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 4,
    flex: 1
  },
  currChip: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  currChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  currText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  currTextActive: {
    color: '#fff'
  },
  emptyItemsBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  emptyItemsText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center'
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 8
  },
  itemCardHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  itemCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase'
  },
  addItemBtn: {
    width: '100%',
    padding: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb'
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 6,
    gap: 6,
    marginTop: 10
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13.5
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2.5,
    borderBottomColor: '#2563eb',
    paddingBottom: 8,
    marginBottom: 10
  },
  previewLogoImg: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sheetCompanyName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a'
  },
  sheetCompanySub: {
    fontSize: 9.5,
    color: '#64748b'
  },
  sheetDocTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right'
  },
  sheetMeta: {
    fontSize: 9.5,
    color: '#475569',
    textAlign: 'right'
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  infoBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 6,
    backgroundColor: '#f8fafc'
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#2563eb',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  boxText: {
    fontSize: 9.5,
    color: '#0f172a',
    marginBottom: 2,
    lineHeight: 14
  },
  bold: {
    fontWeight: '700'
  },
  table: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6
  },
  tableHdr: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 5,
    paddingHorizontal: 4
  },
  th: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '700'
  },
  tableEmptyRow: {
    padding: 12,
    alignItems: 'center'
  },
  tableEmptyText: {
    fontSize: 11,
    color: '#64748b'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center'
  },
  td: {
    fontSize: 10,
    color: '#0f172a'
  },
  tdBold: {
    fontWeight: '700'
  },
  tdSub: {
    fontSize: 9,
    color: '#64748b'
  },
  warnText: {
    backgroundColor: '#dc2626',
    color: '#fff',
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: '700',
    padding: 5,
    marginBottom: 10
  },
  sheetFooterGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  sheetNotesBox: {
    flex: 1.2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 6
  },
  notesText: {
    fontSize: 9,
    color: '#475569',
    lineHeight: 13
  },
  sheetTotalsBox: {
    flex: 1,
    gap: 3
  },
  totRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderRadius: 4
  },
  totLabel: {
    fontSize: 9.5,
    color: '#64748b'
  },
  totVal: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  totGrand: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  grandLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff'
  },
  grandVal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff'
  },
  signBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 45,
    padding: 5,
    marginTop: 8,
    borderRadius: 6
  },
  signText: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '600'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    gap: 5
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  catalogCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  catalogCat: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
    textTransform: 'uppercase'
  },
  catalogTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2
  },
  catalogPrice: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 2
  },
  addQuoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 4
  },
  addQuoteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center'
  },
  emptySubText: {
    fontSize: 11.5,
    color: '#64748b',
    marginBottom: 8
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 6
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2
  },
  historyNo: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b'
  },
  historyAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#2563eb'
  },
  historyFirma: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a'
  },
  historyProj: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    elevation: 8
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#2563eb'
  },
  tabLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1
  },
  tabLabelActive: {
    color: '#2563eb',
    fontWeight: '700'
  }
});

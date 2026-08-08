import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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
  hazirlayanMail: string;
  items: QuoteItem[];
  totalAmount: number;
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'history'>('editor');

  const [hazirlayanMail, setHazirlayanMail] = useState('');
  const [teklifNo, setTeklifNo] = useState('2026-' + Math.floor(100000 + Math.random() * 900000));
  const [tarih, setTarih] = useState(new Date().toISOString().split('T')[0]);
  const [gecerlilik, setGecerlilik] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
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

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: 'item-' + Date.now(),
        kategori: 'Genel',
        urunAdi: '',
        aciklama: '',
        adet: 1,
        birim: 'Adet',
        birimFiyat: 0
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof QuoteItem, val: any) => {
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
      hazirlayanMail,
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
    setActiveTab('history');
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
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>AT</Text>
          </View>
          <View>
            <Text style={styles.brandTitle} numberOfLines={1}>ANINDA TEKLİF</Text>
            <Text style={styles.brandSubtitle} numberOfLines={1}>Fiyat Teklif Aracı</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="reset-form-btn"
          style={styles.resetBtnHeader}
          onPress={() => {
            setTeklifNo('2026-' + Math.floor(100000 + Math.random() * 900000));
            setMusFirma('');
            setMusAdi('');
            setMusTel('');
            setMusMail('');
            setMusAdres('');
            setProjeAdi('');
            setItems([]);
            setHazirlayanMail('');
            showToast('Form sıfırlandı.');
          }}
        >
          <Ionicons name="refresh" size={14} color="#3a3b40" />
          <Text style={styles.resetBtnHeaderText}>Sıfırla</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {activeTab === 'editor' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>HAZIRLAYAN / İLETİŞİM</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>E-Mail (Hazırlayan)</Text>
              <TextInput
                style={styles.input}
                placeholder="ornek@sirketiniz.com"
                placeholderTextColor="#9ca3af"
                value={hazirlayanMail}
                onChangeText={setHazirlayanMail}
              />
            </View>

            <Text style={styles.secHeader}>TEKLİF BİLGİLERİ</Text>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Teklif No</Text>
                <TextInput
                  style={styles.input}
                  value={teklifNo}
                  onChangeText={setTeklifNo}
                />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Tarih</Text>
                <TextInput
                  style={styles.input}
                  value={tarih}
                  onChangeText={setTarih}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Geçerlilik Tarihi</Text>
              <TextInput
                style={styles.input}
                value={gecerlilik}
                onChangeText={setGecerlilik}
              />
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
                <TextInput
                  style={styles.input}
                  placeholder="Yetkili"
                  placeholderTextColor="#9ca3af"
                  value={musAdi}
                  onChangeText={setMusAdi}
                />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+90 5XX..."
                  placeholderTextColor="#9ca3af"
                  value={musTel}
                  onChangeText={setMusTel}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>E-Mail</Text>
              <TextInput
                style={styles.input}
                placeholder="musteri@firma.com"
                placeholderTextColor="#9ca3af"
                value={musMail}
                onChangeText={setMusMail}
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Adres</Text>
              <TextInput
                style={styles.input}
                placeholder="Açık Adres / Şehir"
                placeholderTextColor="#9ca3af"
                value={musAdres}
                onChangeText={setMusAdres}
              />
            </View>

            <Text style={styles.secHeader}>SİPARİŞ BİLGİLERİ</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Proje Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Proje veya iş adı"
                placeholderTextColor="#9ca3af"
                value={projeAdi}
                onChangeText={setProjeAdi}
              />
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Nakliye</Text>
                <TextInput
                  style={styles.input}
                  value={nakliye}
                  onChangeText={setNakliye}
                />
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
                      <Text style={[styles.currText, paraBirimi === cur && styles.currTextActive]}>
                        {cur}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Ödeme Şekli</Text>
                <TextInput
                  style={styles.input}
                  value={odemeSekli}
                  onChangeText={setOdemeSekli}
                />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Menşei</Text>
                <TextInput
                  style={styles.input}
                  value={mensei}
                  onChangeText={setMensei}
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>Teslim Süresi</Text>
                <TextInput
                  style={styles.input}
                  value={teslimGun}
                  onChangeText={setTeslimGun}
                />
              </View>
              <View style={[styles.fgroup, { flex: 1 }]}>
                <Text style={styles.label}>İskonto (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={iskonto}
                  onChangeText={setIskonto}
                />
              </View>
            </View>

            <Text style={styles.secHeader}>SİSTEM / ÜRÜN KALEMLERİ ({items.length})</Text>
            {items.length === 0 ? (
              <View style={styles.emptyItemsBox}>
                <Text style={styles.emptyItemsText}>Henüz kalem eklenmedi. Başlamak için butona basın.</Text>
              </View>
            ) : (
              items.map((it, idx) => (
                <View key={it.id} style={styles.itemCard} testID={`item-box-${idx}`}>
                  <View style={styles.itemCardHdr}>
                    <Text style={styles.itemCardTitle}>Kalem #{idx + 1}</Text>
                    <TouchableOpacity onPress={() => handleRemoveItem(it.id)}>
                      <Ionicons name="trash-outline" size={16} color="#c0392b" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Kategori / Sistem</Text>
                    <TextInput
                      style={styles.input}
                      value={it.kategori}
                      onChangeText={(val) => handleUpdateItem(it.id, 'kategori', val)}
                    />
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Ürün / Hizmet Adı</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ürün adı"
                      placeholderTextColor="#9ca3af"
                      value={it.urunAdi}
                      onChangeText={(val) => handleUpdateItem(it.id, 'urunAdi', val)}
                    />
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Açıklama</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Teknik detay"
                      placeholderTextColor="#9ca3af"
                      value={it.aciklama}
                      onChangeText={(val) => handleUpdateItem(it.id, 'aciklama', val)}
                    />
                  </View>
                  <View style={styles.row2}>
                    <View style={[styles.fgroup, { flex: 1 }]}>
                      <Text style={styles.label}>Adet</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(it.adet)}
                        onChangeText={(val) => handleUpdateItem(it.id, 'adet', val)}
                      />
                    </View>
                    <View style={[styles.fgroup, { flex: 1 }]}>
                      <Text style={styles.label}>Birim</Text>
                      <TextInput
                        style={styles.input}
                        value={it.birim}
                        onChangeText={(val) => handleUpdateItem(it.id, 'birim', val)}
                      />
                    </View>
                  </View>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Birim Fiyat ({currencySymbol})</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(it.birimFiyat)}
                      onChangeText={(val) => handleUpdateItem(it.id, 'birimFiyat', val)}
                    />
                  </View>
                </View>
              ))
            )}

            <TouchableOpacity testID="add-item-btn" style={styles.addItemBtn} onPress={handleAddItem}>
              <Ionicons name="add-circle-outline" size={16} color="#3a3b40" />
              <Text style={styles.addItemBtnText}>+ Kalem Ekle</Text>
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
              testID="preview-go-btn"
              style={styles.primaryBtn}
              onPress={() => setActiveTab('preview')}
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Teklifi Önizle</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'preview' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Teklif Belgesi Önizleme (HTML yapısına tam uyumlu) */}
            <View style={styles.sheet} testID="quote-sheet-preview">
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.sheetCompanyName}>ANINDA TEKLİF SİSTEMLERİ</Text>
                  <Text style={styles.sheetCompanySub}>Temsilci: {hazirlayanMail || 'Belirtilmedi'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.sheetDocTitle}>FİYAT TEKLİFİ</Text>
                  <Text style={styles.sheetMeta}>Teklif No: {teklifNo}</Text>
                  <Text style={styles.sheetMeta}>Tarih: {tarih}</Text>
                  <Text style={styles.sheetMeta}>Geçerlilik: {gecerlilik}</Text>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoBox}>
                  <Text style={styles.boxTitle}>MÜŞTERİ BİLGİLERİ</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>FİRMA:</Text> {musFirma || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>MÜŞTERİ ADI:</Text> {musAdi || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>TELEFON:</Text> {musTel || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>E-Mail:</Text> {musMail || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>ADRES:</Text> {musAdres || '-'}</Text>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.boxTitle}>SİPARİŞ BİLGİLERİ</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>PROJE ADI:</Text> {projeAdi || '-'}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>NAKLİYE:</Text> {nakliye}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>PARA BİRİMİ:</Text> {paraBirimi}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>ÖDEME ŞEKLİ:</Text> {odemeSekli}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>MENŞEİ:</Text> {mensei}</Text>
                  <Text style={styles.boxText}><Text style={styles.bold}>TESLİM:</Text> {teslimGun}</Text>
                </View>
              </View>

              {/* Tablo */}
              <View style={styles.table}>
                <View style={styles.tableHdr}>
                  <Text style={[styles.th, { width: 36, textAlign: 'center' }]}>S.NO</Text>
                  <Text style={[styles.th, { flex: 2 }]}>SİSTEM / HİZMET</Text>
                  <Text style={[styles.th, { width: 50, textAlign: 'center' }]}>ADET</Text>
                  <Text style={[styles.th, { width: 75, textAlign: 'right' }]}>BİRİM</Text>
                  <Text style={[styles.th, { width: 75, textAlign: 'right' }]}>TOPLAM</Text>
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
                        <Text style={[styles.td, { width: 36, textAlign: 'center' }]}>{idx + 1}</Text>
                        <View style={[styles.td, { flex: 2 }]}>
                          <Text style={styles.tdBold} numberOfLines={2}>{it.urunAdi || 'İsimsiz Ürün'}</Text>
                          <Text style={styles.tdSub} numberOfLines={1}>{it.kategori} {it.aciklama ? `• ${it.aciklama}` : ''}</Text>
                        </View>
                        <Text style={[styles.td, { width: 50, textAlign: 'center' }]} numberOfLines={1}>{it.adet} {it.birim}</Text>
                        <Text style={[styles.td, { width: 75, textAlign: 'right' }]} numberOfLines={1}>{Number(it.birimFiyat).toLocaleString('tr-TR')} {currencySymbol}</Text>
                        <Text style={[styles.td, styles.tdBold, { width: 75, textAlign: 'right' }]} numberOfLines={1}>{lineTotal.toLocaleString('tr-TR')} {currencySymbol}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              <Text style={styles.warnText}>ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR. KDV HARİÇ FİYATTIR</Text>

              <View style={styles.sheetFooterGrid}>
                <View style={styles.sheetNotesBox}>
                  <Text style={styles.boxTitle}>ÖZEL NOTLAR & SATIŞ DETAYLARI</Text>
                  <Text style={styles.notesText}>{notlar}</Text>
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

            <View style={styles.actionRow}>
              <TouchableOpacity
                testID="whatsapp-share-btn"
                style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                onPress={() => {
                  Share.share({
                    message: `Sayın ${musFirma || 'Müşterimiz'}, ${teklifNo} nolu ${genelToplam.toLocaleString('tr-TR')} ${currencySymbol} tutarındaki teklifimiz hazırdır. Proje: ${projeAdi}`
                  });
                }}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>WhatsApp İle Paylaş</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="save-quote-btn"
                style={[styles.actionBtn, { backgroundColor: '#3a3b40' }]}
                onPress={handleSaveAndShare}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

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

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar} testID="bottom-tab-bar">
        <TouchableOpacity
          testID="tab-editor"
          style={[styles.tabItem, activeTab === 'editor' && styles.tabItemActive]}
          onPress={() => setActiveTab('editor')}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={activeTab === 'editor' ? '#3a3b40' : '#6b7280'}
          />
          <Text style={[styles.tabLabel, activeTab === 'editor' && styles.tabLabelActive]} numberOfLines={1}>Form</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-preview"
          style={[styles.tabItem, activeTab === 'preview' && styles.tabItemActive]}
          onPress={() => setActiveTab('preview')}
        >
          <Ionicons
            name="eye-outline"
            size={20}
            color={activeTab === 'preview' ? '#3a3b40' : '#6b7280'}
          />
          <Text style={[styles.tabLabel, activeTab === 'preview' && styles.tabLabelActive]} numberOfLines={1}>Önizleme</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-history"
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="time-outline"
            size={20}
            color={activeTab === 'history' ? '#3a3b40' : '#6b7280'}
          />
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]} numberOfLines={1}>Geçmiş</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e9edf2'
  },
  toast: {
    position: 'absolute',
    top: 45,
    alignSelf: 'center',
    backgroundColor: '#232428',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    borderBottomColor: '#d8dee6'
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8
  },
  logoBadge: {
    width: 32,
    height: 32,
    backgroundColor: '#3a3b40',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  logoText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3a3b40'
  },
  brandSubtitle: {
    fontSize: 10,
    color: '#6b7280'
  },
  resetBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f6f9',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d8dee6',
    gap: 3,
    flexShrink: 0
  },
  resetBtnHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3a3b40'
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
    fontWeight: '700',
    color: '#3a3b40',
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 2,
    borderBottomColor: '#3a3b40',
    textTransform: 'uppercase'
  },
  fgroup: {
    marginBottom: 8
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#1a1a1a'
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
    borderColor: '#d8dee6',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  currChipActive: {
    backgroundColor: '#3a3b40',
    borderColor: '#3a3b40'
  },
  currText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6b7280'
  },
  currTextActive: {
    color: '#fff'
  },
  emptyItemsBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderStyle: 'dashed',
    borderRadius: 5,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8
  },
  emptyItemsText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center'
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d8dee6',
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
    color: '#3a3b40',
    textTransform: 'uppercase'
  },
  addItemBtn: {
    width: '100%',
    padding: 9,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#3a3b40',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    marginBottom: 12
  },
  addItemBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#3a3b40'
  },
  primaryBtn: {
    backgroundColor: '#3a3b40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 5,
    gap: 6,
    marginTop: 8
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13.5
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d8dee6'
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2.5,
    borderBottomColor: '#3a3b40',
    paddingBottom: 8,
    marginBottom: 10
  },
  sheetCompanyName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3a3b40'
  },
  sheetCompanySub: {
    fontSize: 10,
    color: '#333',
    marginTop: 2
  },
  sheetDocTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#232428',
    textAlign: 'right'
  },
  sheetMeta: {
    fontSize: 10,
    color: '#333',
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
    borderColor: '#d8dee6',
    borderRadius: 4,
    padding: 6,
    backgroundColor: '#f4f6f9'
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#3a3b40',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  boxText: {
    fontSize: 10,
    color: '#333',
    marginBottom: 2,
    lineHeight: 14
  },
  bold: {
    fontWeight: '700'
  },
  table: {
    borderWidth: 1,
    borderColor: '#3a3b40',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6
  },
  tableHdr: {
    flexDirection: 'row',
    backgroundColor: '#3a3b40',
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
    color: '#6b7280'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d8dee6',
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center'
  },
  td: {
    fontSize: 10,
    color: '#1a1a1a'
  },
  tdBold: {
    fontWeight: '700'
  },
  tdSub: {
    fontSize: 9,
    color: '#6b7280'
  },
  warnText: {
    backgroundColor: '#c0392b',
    color: '#fff',
    textAlign: 'center',
    fontSize: 9,
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
    borderColor: '#d8dee6',
    padding: 6,
    backgroundColor: '#f4f6f9',
    borderRadius: 4
  },
  notesText: {
    fontSize: 9.5,
    color: '#333',
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
    borderColor: '#d8dee6',
    backgroundColor: '#fff',
    borderRadius: 3
  },
  totLabel: {
    fontSize: 9.5,
    color: '#6b7280'
  },
  totVal: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1a1a1a'
  },
  totGrand: {
    backgroundColor: '#e9e9ea',
    borderColor: '#3a3b40'
  },
  grandLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#232428'
  },
  grandVal: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#232428'
  },
  signBox: {
    borderWidth: 1,
    borderColor: '#d8dee6',
    height: 50,
    padding: 5,
    marginTop: 8,
    borderRadius: 4
  },
  signText: {
    fontSize: 9.5,
    color: '#6b7280',
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
    borderRadius: 5,
    gap: 5
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  emptySubText: {
    fontSize: 11.5,
    color: '#6b7280',
    marginBottom: 8
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d8dee6',
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
    color: '#6b7280'
  },
  historyAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#3a3b40'
  },
  historyFirma: {
    fontSize: 13,
    fontWeight: '800',
    color: '#232428'
  },
  historyProj: {
    fontSize: 11,
    color: '#6b7280',
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
    borderTopCode: '#3a3b40',
    borderTopColor: '#3a3b40'
  },
  tabLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 1
  },
  tabLabelActive: {
    color: '#3a3b40',
    fontWeight: '700'
  }
});

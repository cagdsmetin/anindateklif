import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Share,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface QuoteItem {
  id: string;
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
  hazirlayan: string;
  items: QuoteItem[];
  totalAmount: number;
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'history'>('editor');

  // Form State
  const [hazirlayan, setHazirlayan] = useState('Anında Teklif Uzmanı');
  const [teklifNo, setTeklifNo] = useState('AT-' + Math.floor(1000 + Math.random() * 9000));
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

  const [items, setItems] = useState<QuoteItem[]>([
    {
      id: 'i-1',
      urunAdi: 'Özel Yazılım / Danışmanlık Hizmeti',
      aciklama: 'Kapsamlı profesyonel çözüm paketi',
      adet: 1,
      birim: 'Adet',
      birimFiyat: 1500
    }
  ]);

  const [history, setHistory] = useState<SavedQuote[]>([]);
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
        id: 'i-' + Date.now(),
        urunAdi: 'Yeni Ürün / Hizmet',
        aciklama: '',
        adet: 1,
        birim: 'Adet',
        birimFiyat: 500
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((it) => it.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof QuoteItem, val: any) => {
    setItems(
      items.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    );
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
      hazirlayan,
      items: [...items],
      totalAmount: genelToplam
    };

    setHistory([newQuote, ...history]);
    showToast('Teklif kaydedildi ve geçmişe eklendi!');
    setActiveTab('history');
  };

  const currencySymbol = paraBirimi === 'USD' ? '$' : paraBirimi === 'EUR' ? '€' : '₺';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Toast */}
      {toast && (
        <View style={styles.toast} testID="toast-msg">
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
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
            <Text style={styles.brandTitle}>ANINDA TEKLİF</Text>
            <Text style={styles.brandSubtitle}>Hızlı & Profesyonel Fiyat Teklifi</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="new-quote-btn"
          style={styles.newBtn}
          onPress={() => {
            setTeklifNo('AT-' + Math.floor(1000 + Math.random() * 9000));
            setActiveTab('editor');
          }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>Yeni</Text>
        </TouchableOpacity>
      </View>

      {/* Main Body */}
      <View style={styles.body}>
        {activeTab === 'editor' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>1. TEKLİF & TEMSİLCİ</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Hazırlayan / Temsilci</Text>
              <TextInput
                style={styles.input}
                value={hazirlayan}
                onChangeText={setHazirlayan}
                placeholder="Adınız Soyadınız"
              />
            </View>
            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Teklif No</Text>
                <TextInput
                  style={styles.input}
                  value={teklifNo}
                  onChangeText={setTeklifNo}
                />
              </View>
              <View style={styles.fgroup}>
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
              <View style={styles.fgroup}>
                <Text style={styles.label}>Tarih</Text>
                <TextInput
                  style={styles.input}
                  value={tarih}
                  onChangeText={setTarih}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Geçerlilik</Text>
                <TextInput
                  style={styles.input}
                  value={gecerlilik}
                  onChangeText={setGecerlilik}
                />
              </View>
            </View>

            <Text style={styles.secHeader}>2. MÜŞTERİ BİLGİLERİ</Text>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Firma Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Örn: ABC A.Ş."
                value={musFirma}
                onChangeText={setMusFirma}
              />
            </View>
            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Müşteri / İlgili</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ad Soyad"
                  value={musAdi}
                  onChangeText={setMusAdi}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+90 5XX ..."
                  value={musTel}
                  onChangeText={setMusTel}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>E-posta</Text>
              <TextInput
                style={styles.input}
                placeholder="ornek@firma.com"
                value={musMail}
                onChangeText={setMusMail}
              />
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Proje Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Örn: Dijital Dönüşüm Projesi"
                value={projeAdi}
                onChangeText={setProjeAdi}
              />
            </View>

            <Text style={styles.secHeader}>3. ÜRÜN & HİZMET KALEMLERİ ({items.length})</Text>
            {items.map((it, idx) => (
              <View key={it.id} style={styles.itemCard}>
                <View style={styles.itemCardHdr}>
                  <Text style={styles.itemCardTitle}>Kalem #{idx + 1}</Text>
                  <TouchableOpacity onPress={() => handleRemoveItem(it.id)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
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
                  <Text style={styles.label}>Açıklama</Text>
                  <TextInput
                    style={styles.input}
                    value={it.aciklama}
                    onChangeText={(val) => handleUpdateItem(it.id, 'aciklama', val)}
                  />
                </View>
                <View style={styles.row2}>
                  <View style={styles.fgroup}>
                    <Text style={styles.label}>Miktar / Adet</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={String(it.adet)}
                      onChangeText={(val) => handleUpdateItem(it.id, 'adet', val)}
                    />
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
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
              <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
              <Text style={styles.addItemBtnText}>Yeni Kalem Ekle</Text>
            </TouchableOpacity>

            <Text style={styles.secHeader}>4. KOŞULLAR VE İSKONTO</Text>
            <View style={styles.row2}>
              <View style={styles.fgroup}>
                <Text style={styles.label}>İskonto Oranı (%)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={iskonto}
                  onChangeText={setIskonto}
                />
              </View>
              <View style={styles.fgroup}>
                <Text style={styles.label}>Nakliye</Text>
                <TextInput
                  style={styles.input}
                  value={nakliye}
                  onChangeText={setNakliye}
                />
              </View>
            </View>
            <View style={styles.fgroup}>
              <Text style={styles.label}>Notlar</Text>
              <TextInput
                style={[styles.input, { height: 70 }]}
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
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Teklifi Önizle</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'preview' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheet} testID="quote-sheet-preview">
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetBrand}>ANINDA TEKLİF</Text>
                  <Text style={styles.sheetBrandSub}>Hazırlayan: {hazirlayan}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.sheetDocTitle}>FİYAT TEKLİFİ</Text>
                  <Text style={styles.sheetMeta}>No: {teklifNo}</Text>
                  <Text style={styles.sheetMeta}>Tarih: {tarih}</Text>
                </View>
              </View>

              <View style={styles.sheetInfoBox}>
                <Text style={styles.boxTitle}>MÜŞTERİ BİLGİLERİ</Text>
                <Text style={styles.boxText}><Text style={styles.bold}>Firma:</Text> {musFirma || '-'}</Text>
                <Text style={styles.boxText}><Text style={styles.bold}>İlgili:</Text> {musAdi || '-'}</Text>
                <Text style={styles.boxText}><Text style={styles.bold}>Proje:</Text> {projeAdi || '-'}</Text>
              </View>

              <View style={styles.table}>
                <View style={styles.tableHdr}>
                  <Text style={[styles.th, { flex: 0.5 }]}>#</Text>
                  <Text style={[styles.th, { flex: 2.5 }]}>Hizmet / Ürün</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Adet</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Birim</Text>
                  <Text style={[styles.th, { flex: 1.2 }]}>Toplam</Text>
                </View>
                {items.map((it, idx) => {
                  const lineTotal = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
                  return (
                    <View key={it.id} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 0.5 }]}>{idx + 1}</Text>
                      <View style={[styles.td, { flex: 2.5 }]}>
                        <Text style={styles.tdBold}>{it.urunAdi}</Text>
                        <Text style={styles.tdSub}>{it.aciklama}</Text>
                      </View>
                      <Text style={[styles.td, { flex: 1 }]}>{it.adet}</Text>
                      <Text style={[styles.td, { flex: 1.2 }]}>{Number(it.birimFiyat).toLocaleString('tr-TR')} {currencySymbol}</Text>
                      <Text style={[styles.td, styles.tdBold, { flex: 1.2 }]}>{lineTotal.toLocaleString('tr-TR')} {currencySymbol}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.sheetFooterBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boxTitle}>NOTLAR</Text>
                  <Text style={styles.notesText}>{notlar}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.totRow}>
                    <Text style={styles.totLabel}>Ara Toplam:</Text>
                    <Text style={styles.totVal}>{subtotal.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                  {iskontoOrani > 0 && (
                    <View style={styles.totRow}>
                      <Text style={styles.totLabel}>İskonto (%{iskontoOrani}):</Text>
                      <Text style={[styles.totVal, { color: '#ef4444' }]}>-{iskontoTutar.toLocaleString('tr-TR')} {currencySymbol}</Text>
                    </View>
                  )}
                  <View style={styles.totRow}>
                    <Text style={styles.totLabel}>KDV (%20):</Text>
                    <Text style={styles.totVal}>{kdvTutar.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                  <View style={[styles.totRow, styles.totGrand]}>
                    <Text style={styles.grandLabel}>GENEL TOPLAM:</Text>
                    <Text style={styles.grandVal}>{genelToplam.toLocaleString('tr-TR')} {currencySymbol}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                testID="whatsapp-share-btn"
                style={[styles.actionBtn, { backgroundColor: '#25D366' }]}
                onPress={() => {
                  Share.share({
                    message: `Sayın ${musFirma || 'Müşterimiz'}, ${teklifNo} nolu ${genelToplam.toLocaleString('tr-TR')} ${currencySymbol} tutarındaki teklifimiz hazırdır.`
                  });
                }}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>WhatsApp İle Paylaş</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="save-history-btn"
                style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                onPress={handleSaveAndShare}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Kaydet & Geçmişe Ekle</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {activeTab === 'history' && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.secHeader}>KAYITLI GEÇMİŞ TEKLİFLER ({history.length})</Text>
            {history.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="folder-open-outline" size={50} color="#94a3b8" />
                <Text style={styles.emptyTitle}>Henüz Kayıtlı Teklif Yok</Text>
                <Text style={styles.emptySub}>Hazırladığınız teklifleri kaydettiğinizde burada listelenir.</Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => setActiveTab('editor')}
                >
                  <Text style={styles.primaryBtnText}>Yeni Teklif Oluştur</Text>
                </TouchableOpacity>
              </View>
            ) : (
              history.map((q) => (
                <View key={q.id} style={styles.historyCard}>
                  <View style={styles.historyCardTop}>
                    <Text style={styles.historyNo}>{q.teklifNo}</Text>
                    <Text style={styles.historyAmount}>
                      {q.totalAmount.toLocaleString('tr-TR')} {q.paraBirimi}
                    </Text>
                  </View>
                  <Text style={styles.historyFirma}>{q.musFirma}</Text>
                  <Text style={styles.historyProj}>{q.projeAdi || 'Proje adı yok'} • {q.tarih}</Text>
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
            size={22}
            color={activeTab === 'editor' ? '#2563eb' : '#64748b'}
          />
          <Text style={[styles.tabLabel, activeTab === 'editor' && styles.tabLabelActive]}>Teklif Hazırla</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-preview"
          style={[styles.tabItem, activeTab === 'preview' && styles.tabItemActive]}
          onPress={() => setActiveTab('preview')}
        >
          <Ionicons
            name="eye-outline"
            size={22}
            color={activeTab === 'preview' ? '#2563eb' : '#64748b'}
          />
          <Text style={[styles.tabLabel, activeTab === 'preview' && styles.tabLabelActive]}>Önizleme</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="tab-history"
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="time-outline"
            size={22}
            color={activeTab === 'history' ? '#2563eb' : '#64748b'}
          />
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>Geçmiş ({history.length})</Text>
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
    top: 50,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
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
    borderBottomColor: '#e2e8f0'
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  logoBadge: {
    width: 40,
    height: 40,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500'
  },
  newBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 4
  },
  newBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13
  },
  body: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90
  },
  secHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  fgroup: {
    marginBottom: 10
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a'
  },
  row2: {
    flexDirection: 'row',
    gap: 10
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 6
  },
  currChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center'
  },
  currChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  currText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  currTextActive: {
    color: '#fff'
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 10
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb'
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 10,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    paddingBottom: 10,
    marginBottom: 12
  },
  sheetBrand: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563eb'
  },
  sheetBrandSub: {
    fontSize: 10,
    color: '#64748b'
  },
  sheetDocTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  sheetMeta: {
    fontSize: 10,
    color: '#475569'
  },
  sheetInfoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#2563eb',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
    textTransform: 'uppercase'
  },
  boxText: {
    fontSize: 11,
    color: '#0f172a',
    marginBottom: 2
  },
  bold: {
    fontWeight: '700'
  },
  table: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12
  },
  tableHdr: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 6
  },
  th: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 6,
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
  sheetFooterBox: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  notesText: {
    fontSize: 9,
    color: '#475569',
    lineHeight: 13
  },
  totRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  totLabel: {
    fontSize: 10,
    color: '#64748b'
  },
  totVal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f172a'
  },
  totGrand: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  grandLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff'
  },
  grandVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 10
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  historyNo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563eb'
  },
  historyFirma: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2
  },
  historyProj: {
    fontSize: 12,
    color: '#64748b'
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
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  tabLabelActive: {
    color: '#2563eb',
    fontWeight: '700'
  }
});

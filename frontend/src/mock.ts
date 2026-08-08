export interface QuoteItem {
  id: string;
  type: 'urun' | 'ozel';
  kategori: string;
  urunAdi: string;
  aciklama: string;
  kumasRal: string;
  yerlesim: string;
  montaj: string;
  adet: number;
  birim: string;
  birimFiyat: number;
}

export interface CustomerQuote {
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
  status: 'Taslak' | 'Görüldü' | 'Onaylandı' | 'Reddedildi';
  items: QuoteItem[];
  createdAt: string;
  totalAmount: number;
}

export const INITIAL_QUOTES: CustomerQuote[] = [
  {
    id: 'q-101',
    teklifNo: 'SKY-2026-001',
    tarih: '2026-07-01',
    gecerlilik: '2026-08-01',
    musFirma: 'Yıldız Mimarlık Ltd. Şti.',
    musAdi: 'Ahmet Yıldız',
    musTel: '+90 532 555 4433',
    musMail: 'ahmet@yildizmimarlik.com',
    musAdres: 'Levent Mah. Büyükdere Cad. No:142 Beşiktaş/İstanbul',
    projeAdi: 'Genel Merkez Toplantı Odası Akustik Tasarım',
    nakliye: 'EXW',
    paraBirimi: 'USD',
    odemeSekli: '%50 Peşin-%50 Fab. Teslim',
    mensei: 'TÜRKİYE',
    teslimGun: '15-20 GÜN',
    iskonto: 5,
    notlar: 'Fabrika Teslim Fiyatıdır. Ahşap Sandıklama Dahildir.',
    hazirlayanMail: 'cagdas@skyart-group.com',
    status: 'Onaylandı',
    createdAt: '2026-07-01T10:00:00.000Z',
    totalAmount: 4750,
    items: [
      {
        id: 'i-1',
        type: 'urun',
        kategori: 'Akustik Paneller',
        urunAdi: 'HexaWood Akustik Ahşap Panel (10lu Paket)',
        aciklama: 'Doğal meşe kaplama özel akustik panel',
        kumasRal: 'RAL 9005 Siyah',
        yerlesim: 'Yan yana 5 sıra',
        montaj: 'Dahil',
        adet: 10,
        birim: 'Paket',
        birimFiyat: 500
      }
    ]
  },
  {
    id: 'q-102',
    teklifNo: 'SKY-2026-002',
    tarih: '2026-07-05',
    gecerlilik: '2026-08-05',
    musFirma: 'Nova Holding A.Ş.',
    musAdi: 'Selin Demir',
    musTel: '+90 533 111 2233',
    musMail: 's.demir@novaholding.com.tr',
    musAdres: 'Maslak Mah. İTÜ Ayazağa Kampüsü Kat: 4 Sarıyer/İstanbul',
    projeAdi: 'Yönetici Katı Özel Karşılama Bankosu ve Mobilya',
    nakliye: 'DAP',
    paraBirimi: 'EUR',
    odemeSekli: '%30 Peşin-%70 Sevkiyat Öncesi',
    mensei: 'TÜRKİYE',
    teslimGun: '25-30 GÜN',
    iskonto: 10,
    notlar: 'Özel tasarım lake boyalı karşılama bankosu.',
    hazirlayanMail: 'cagdas@skyart-group.com',
    status: 'Görüldü',
    createdAt: '2026-07-05T14:30:00.000Z',
    totalAmount: 11250,
    items: [
      {
        id: 'i-2',
        type: 'ozel',
        kategori: 'Özel Mobilya',
        urunAdi: 'Özel Tasarım Oval Karşılama Bankosu (3m)',
        aciklama: 'Özel lake boya ve LED entegreli',
        kumasRal: 'RAL 7016 Antrasit',
        yerlesim: 'Merkez',
        montaj: 'Dahil',
        adet: 1,
        birim: 'Adet',
        birimFiyat: 12500
      }
    ]
  }
];

export const CATEGORIES = [
  'Akustik Paneller',
  'Özel Mobilya',
  'Mimari Donatılar',
  'Aydınlatma & LED',
  'Zemin Kaplama',
  'Genel Hizmet & İşçilik'
];

export const REPRESANTATIVES = [
  { name: 'Ahmet Yılmaz', email: 'ahmet@anindateklif.com', phone: '+90 532 000 0000', title: 'Satış Direktörü' },
  { name: 'Zeynep Kaya', email: 'zeynep@anindateklif.com', phone: '+90 533 111 1111', title: 'Proje Müdürü' },
  { name: 'Can Demir', email: 'can@anindateklif.com', phone: '+90 535 222 2222', title: 'Teklif Uzmanı' }
];

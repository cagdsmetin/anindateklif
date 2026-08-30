import type { TahsilatEntryT } from './api';

// Ödeme/tahsilat yöntemleri -- Tahsilat ekranı ve müşteri bazlı cari hesap
// (customer-ledger) ekranı ile paylaşılan tek liste, ikisi de aynı seçenekleri
// göstersin diye. "Çek" burada eklendi -- önceden sadece Nakit/Kart/Havale-EFT/
// Diğer vardı, çekle ödeme yapan müşteriler için ayrı bir seçenek yoktu.
export const YONTEMLER = ['Nakit', 'Kart', 'Havale/EFT', 'Çek', 'Diğer'];

// Aynı müşterinin tüm borç/tahsilat kayıtlarını tek bir grupta toplamak için
// kullanılan anahtar. Müşteri, sisteme kayıtlı bir Customer'a bağlıysa
// (customerId doluysa) onunla, değilse yazılan isimle eşleştirilir -- bu,
// hem "BEKLEYEN ALACAKLAR" listesindeki gruplama hem de müşteri bazlı cari
// hesap (customer-ledger) ekranındaki filtreleme için AYNI mantık, tek
// yerden -- ikisi arasında tutarsızlık olmasın diye.
export function customerKey(t: Pick<TahsilatEntryT, 'customerId' | 'musteriAdi'>): string {
  return t.customerId ? t.customerId : `ad:${t.musteriAdi}`;
}

export type CurrencyBalance = { paraBirimi: string; bakiye: number };

export type CustomerBalance = {
  key: string;
  musteriAdi: string;
  musteriTelefon: string;
  customerId: string;
  balances: CurrencyBalance[]; // para birimine göre net bakiye (borç - tahsilat), sadece pozitif olanlar
  hasOverdue: boolean;
};

// Tüm tahsilat kayıtlarını müşteri + para birimi bazında net bakiyeye
// indirger. Önceden bu hesap sadece TRY kayıtlarını sayıyordu -- teklif
// USD/EUR ise (uygulamada çok yaygın) o borç sessizce hesaba hiç girmiyordu,
// "TOPLAM ALACAK" ve "BORÇLU MÜŞTERİ" kartları gerçek durumu yansıtmıyordu.
// Artık her para birimi kendi içinde toplanıyor, hiçbir kayıt atlanmıyor.
export function computeCustomerBalances(tahsilat: TahsilatEntryT[]): CustomerBalance[] {
  const map: Record<string, CustomerBalance & { _sums: Record<string, number> }> = {};
  const today = new Date().toISOString().slice(0, 10);

  tahsilat.forEach((t) => {
    const key = customerKey(t);
    if (!map[key]) {
      map[key] = {
        key,
        musteriAdi: t.musteriAdi,
        musteriTelefon: t.musteriTelefon,
        customerId: t.customerId || '',
        balances: [],
        hasOverdue: false,
        _sums: {},
      };
    }
    const cur = t.paraBirimi || 'TRY';
    const entry = map[key];
    entry._sums[cur] = (entry._sums[cur] || 0) + (t.tur === 'borc' ? t.tutar : -t.tutar);
    if (t.tur === 'borc' && t.vadeTarihi && t.vadeTarihi < today) entry.hasOverdue = true;
    // En güncel telefon/isim bilgisini tutalım (kayıtlar tarihe göre karışık
    // gelebilir, ama pratikte hepsi aynı müşteri için tutarlı olur).
    if (t.musteriTelefon) entry.musteriTelefon = t.musteriTelefon;
  });

  return Object.values(map)
    .map((entry) => {
      const balances = Object.entries(entry._sums)
        .map(([paraBirimi, bakiye]) => ({ paraBirimi, bakiye }))
        .filter((b) => b.bakiye > 0.009);
      return {
        key: entry.key,
        musteriAdi: entry.musteriAdi,
        musteriTelefon: entry.musteriTelefon,
        customerId: entry.customerId,
        balances,
        hasOverdue: entry.hasOverdue,
      };
    })
    .filter((c) => c.balances.length > 0)
    .sort((a, b) => {
      // Büyükten küçüğe -- birden çok para birimi varsa en büyük bakiyeye göre.
      const maxA = Math.max(...a.balances.map((x) => x.bakiye));
      const maxB = Math.max(...b.balances.map((x) => x.bakiye));
      return maxB - maxA;
    });
}

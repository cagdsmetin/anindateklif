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

// --- Canlı kurla TRY dönüşümü -----------------------------------------
// Tahsilat/Kasa ekranlarındaki üst özet kartları artık Panel'deki "hacim"
// kartıyla aynı mantıkla çalışıyor: teklifler/kayıtlar USD ya da EUR olsa
// bile üstte TEK bir TL toplamı, altında da o toplamın $/€ karşılığı
// gösteriliyor. Dönüşüm her zaman GÜNCEL (canlı) kurla yapılır -- kaydın
// üzerinde saklanan `kurTRY` sadece "o gün kur kaçtı" bilgisini korumak
// içindir, özet kartların hesabına karışmaz.
export type RatesLike = { usd_try?: number | null; eur_try?: number | null } | null | undefined;

export function convertToTRY(amount: number, cur: string, rates: RatesLike): number | null {
  const c = (cur || 'TRY').toUpperCase();
  if (c === 'TRY' || c === 'TL') return amount;
  if (c === 'USD') return rates?.usd_try ? amount * rates.usd_try : null;
  if (c === 'EUR') return rates?.eur_try ? amount * rates.eur_try : null;
  return null;
}

export function currentRateFor(cur: string, rates: RatesLike): number {
  const c = (cur || 'TRY').toUpperCase();
  if (c === 'USD') return rates?.usd_try || 0;
  if (c === 'EUR') return rates?.eur_try || 0;
  return 0;
}

// Bir tutarı bir para biriminden başka bir para birimine çevirir (TRY köprü
// olarak kullanılır: fromCur -> TRY -> toCur). Örn. müşteri $6.000 borçluyken
// ₺50.000 ödediğinde, bu ödemeyi borcun kendi para biriminde (USD) doğru
// şekilde düşebilmek için önce ₺50.000'i o günkü kurla dolara çevirmek
// gerekiyor -- aksi halde ödeme ayrı bir TL bakiyesi olarak "boşta" kalıp
// USD borcu hiç etkilemiyordu. Kur bilinmiyorsa (rates eksik) null döner --
// çağıran taraf bu durumda ORİJİNAL para birimiyle kaydetmeye devam eder,
// asla yanlış/tahmini bir kurla sessizce yanlış tutar kaydetmez.
export function convertBetween(amount: number, fromCur: string, toCur: string, rates: RatesLike): number | null {
  const from = (fromCur || 'TRY').toUpperCase();
  const to = (toCur || 'TRY').toUpperCase();
  if (from === to) return amount;
  const inTRY = convertToTRY(amount, from, rates);
  if (inTRY == null) return null;
  if (to === 'TRY' || to === 'TL') return inTRY;
  const toRate = currentRateFor(to, rates);
  if (!toRate) return null;
  return inTRY / toRate;
}

// Bir müşterinin o an TEK BİR para biriminde borcu varsa o para birimini
// döndürür (ör. sadece USD borcu varsa 'USD'). Birden fazla para biriminde
// aynı anda borcu varsa (nadir, karışık durum) null döner -- hangi borcun
// kapatılmak istendiği belirsiz olduğu için otomatik çevirme yapılmaz,
// kullanıcının seçtiği para birimiyle kaydedilmeye devam edilir.
export function singleDebtCurrency(balances: CurrencyBalance[]): string | null {
  const owed = balances.filter((b) => b.bakiye > 0.009);
  if (owed.length !== 1) return null;
  return owed[0].paraBirimi;
}

// Bir dizi {paraBirimi, tutar} (veya {paraBirimi, bakiye}) kaydını tek bir TL
// toplamına indirger. Herhangi bir para birimi için kur bilinmiyorsa (kur
// servisine erişilemedi vs.) `null` döner -- ekran bu durumda TL toplamını
// gizleyip sadece döviz dökümünü göstermeye devam edebilir.
export function sumToTRY(entries: { paraBirimi: string; tutar?: number; bakiye?: number }[], rates: RatesLike): number | null {
  let total = 0;
  let missing = false;
  entries.forEach((e) => {
    const amt = e.tutar ?? e.bakiye ?? 0;
    const v = convertToTRY(amt, e.paraBirimi, rates);
    if (v == null) { missing = true; return; }
    total += v;
  });
  return missing ? null : total;
}

// --- Borçlu müşteriler listesi (Toplam Borç / Kalan Borç) --------------
// "BORÇLU MÜŞTERİ" kartına tıklanınca açılan ayrı sayfa için: her müşterinin
// her para biriminde BUGÜNE KADAR toplam ne kadar borçlandığı (TOPLAM BORÇ --
// brüt, hiç ödeme düşülmeden) ve şu an hâlâ ne kadar borcu kaldığı (KALAN
// BORÇ -- net, computeCustomerBalances ile aynı rakam) ayrı ayrı gösterilir.
export type CustomerDebtCurrency = { paraBirimi: string; toplamBorc: number; kalanBorc: number };
export type CustomerDebtSummary = {
  key: string;
  musteriAdi: string;
  musteriTelefon: string;
  customerId: string;
  perCurrency: CustomerDebtCurrency[];
};

export function computeCustomerDebtSummaries(tahsilat: TahsilatEntryT[]): CustomerDebtSummary[] {
  const map: Record<string, CustomerDebtSummary & { _sums: Record<string, { borc: number; tahsilat: number }> }> = {};

  tahsilat.forEach((t) => {
    const key = customerKey(t);
    if (!map[key]) {
      map[key] = {
        key, musteriAdi: t.musteriAdi, musteriTelefon: t.musteriTelefon,
        customerId: t.customerId || '', perCurrency: [], _sums: {},
      };
    }
    const entry = map[key];
    const cur = t.paraBirimi || 'TRY';
    if (!entry._sums[cur]) entry._sums[cur] = { borc: 0, tahsilat: 0 };
    if (t.tur === 'borc') entry._sums[cur].borc += t.tutar;
    else entry._sums[cur].tahsilat += t.tutar;
    if (t.musteriTelefon) entry.musteriTelefon = t.musteriTelefon;
  });

  return Object.values(map)
    .map((entry) => {
      const perCurrency = Object.entries(entry._sums)
        .filter(([, v]) => v.borc > 0.009)
        .map(([paraBirimi, v]) => ({ paraBirimi, toplamBorc: v.borc, kalanBorc: v.borc - v.tahsilat }));
      return { key: entry.key, musteriAdi: entry.musteriAdi, musteriTelefon: entry.musteriTelefon, customerId: entry.customerId, perCurrency };
    })
    // Sadece hâlâ bir para biriminde kalan borcu (>0) olan müşteriler listelenir.
    .filter((c) => c.perCurrency.some((x) => x.kalanBorc > 0.009))
    .sort((a, b) => {
      const maxA = Math.max(...a.perCurrency.map((x) => x.kalanBorc));
      const maxB = Math.max(...b.perCurrency.map((x) => x.kalanBorc));
      return maxB - maxA;
    });
}


// --- Alacak yaşlandırma ------------------------------------------------
// Her müşterinin (ve para biriminin) tahsilatları en eski borçtan başlayarak
// düşülür (FIFO); kalan borç parçaları vadesine (vade yoksa kayıt tarihine)
// göre gecikme gününe ayrılır. Böylece "toplam alacak"ın ne kadarının
// 0-30 / 31-60 / 61-90 / 90+ gündür beklediği görülür.
export type AgingBucket = 'notDue' | 'd30' | 'd60' | 'd90' | 'd90p';
export const AGING_BUCKETS: AgingBucket[] = ['notDue', 'd30', 'd60', 'd90', 'd90p'];

export type AgingCustomer = {
  key: string;
  musteriAdi: string;
  musteriTelefon: string;
  customerId: string;
  totalTRY: number;
  overdueTRY: number;
  maxDays: number; // en eski geciken parçanın gecikme günü (0 = gecikme yok)
};

export type AgingResult = {
  buckets: Record<AgingBucket, number>; // TL karşılığı
  customers: AgingCustomer[]; // gecikmesi olanlar, riske göre sıralı
  unconverted: boolean; // kuru bilinmeyen dövizli alacak atlandı mı
};

function bucketOf(days: number): AgingBucket {
  if (days <= 0) return 'notDue';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'd90p';
}

export function computeAging(tahsilat: TahsilatEntryT[], rates: RatesLike, today: string = new Date().toISOString().slice(0, 10)): AgingResult {
  const buckets: Record<AgingBucket, number> = { notDue: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  const groups: Record<string, TahsilatEntryT[]> = {};
  tahsilat.forEach((t) => {
    const g = `${customerKey(t)}|${t.paraBirimi || 'TRY'}`;
    (groups[g] = groups[g] || []).push(t);
  });
  const cust: Record<string, AgingCustomer> = {};
  let unconverted = false;
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  Object.values(groups).forEach((list) => {
    let paid = list.filter((t) => t.tur === 'tahsilat').reduce((s, t) => s + (t.tutar || 0), 0);
    const debts = list
      .filter((t) => t.tur === 'borc')
      .map((t) => ({ t, due: t.vadeTarihi || t.tarih || today }))
      .sort((a, b) => a.due.localeCompare(b.due));
    debts.forEach(({ t, due }) => {
      let rest = t.tutar || 0;
      const used = Math.min(rest, paid);
      rest -= used; paid -= used;
      if (rest <= 0.009) return;
      const v = convertToTRY(rest, t.paraBirimi, rates);
      if (v == null) { unconverted = true; return; }
      const dueMs = Date.parse(`${due}T00:00:00Z`);
      const days = isNaN(dueMs) ? 0 : Math.round((todayMs - dueMs) / 86400000);
      buckets[bucketOf(days)] += v;
      const k = customerKey(t);
      const c = (cust[k] = cust[k] || { key: k, musteriAdi: t.musteriAdi, musteriTelefon: t.musteriTelefon, customerId: t.customerId || '', totalTRY: 0, overdueTRY: 0, maxDays: 0 });
      c.totalTRY += v;
      if (days > 0) { c.overdueTRY += v; c.maxDays = Math.max(c.maxDays, days); }
      if (t.musteriTelefon) c.musteriTelefon = t.musteriTelefon;
    });
  });

  const customers = Object.values(cust)
    .filter((c) => c.overdueTRY > 0.009)
    .sort((a, b) => b.maxDays * b.overdueTRY - a.maxDays * a.overdueTRY);
  return { buckets, customers, unconverted };
}

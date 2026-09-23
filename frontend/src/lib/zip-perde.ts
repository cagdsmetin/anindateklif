import type { QuoteItemT, RatesT, ZipPerdeTableT } from '@/src/lib/api';
import { readRaw, writeRaw } from '@/src/lib/itemPricePrefs';

// Zip Perde bayi fiyat tablosu yardımcıları. Arama kuralı backend'deki
// zip_perde.lookup ile birebir aynıdır (ara ölçü -> BİR ÜST basamak); teklif
// ekranında her tuş vuruşunda sunucuya gitmemek için burada da yapılıyor.

export type ZipLookupT =
  | { ok: true; price: number; en: number; boy: number; currency: string }
  | { ok: false; reason: string };

export function zipLookup(table: ZipPerdeTableT, enCm: number, boyCm: number): ZipLookupT {
  const { widths, heights, prices } = table;
  const ci = widths.findIndex((w) => w >= enCm);
  const ri = heights.findIndex((h) => h >= boyCm);
  if (!(enCm > 0) || !(boyCm > 0) || ci < 0 || ri < 0) {
    return { ok: false, reason: `Ölçü tablo dışında (en fazla EN ${widths[widths.length - 1]} × BOY ${heights[heights.length - 1]} cm)` };
  }
  const price = prices[ri]?.[ci];
  if (!price) return { ok: false, reason: `EN ${widths[ci]} × BOY ${heights[ri]} cm üretilmiyor` };
  return { ok: true, price, en: widths[ci], boy: heights[ri], currency: table.currency || 'EUR' };
}

/** Tablo EUR; teklifin para birimine canlı kurla çevirir. Kur yoksa null. */
export function convertFromEur(eur: number, target: string, rates: RatesT | null): number | null {
  if (target === 'EUR') return eur;
  if (!rates?.eur_try) return null;
  const tl = eur * rates.eur_try;
  if (target === 'TRY' || target === 'TL') return Math.round(tl);
  if (target === 'USD') return rates.usd_try ? Math.round((tl / rates.usd_try) * 100) / 100 : null;
  return null;
}

const norm = (s: string) => (s || '').toLocaleLowerCase('tr-TR');

export function isZipItem(item: Pick<QuoteItemT, 'mode' | 'sistemTipi' | 'urunAdi'>): boolean {
  const name = item.mode === 'technical' ? item.sistemTipi : item.urunAdi;
  return norm(name).includes('zip');
}

// Kullanıcı ölçüyü cm, mm ya da metre yazabilir: tablo 125–580 cm arası,
// bu yüzden >= 1000 mm, < 20 metre kabul edilip cm'ye çevrilir.
function toCm(raw: string): number | null {
  const n = Number(String(raw || '').trim().replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  if (n >= 1000) return n / 10;
  if (n < 20) return n * 100;
  return n;
}

const WORD = '[^a-zçğıöşü0-9]';
// "EN", "Genişlik", "Cephe genişliği", "BOY", "Boyu", "Yükseklik (mm)" ...
const EN_RE = new RegExp(`(^|${WORD})(en|width)(${WORD}|$)|geni[sş]li[kğg]`);
const BOY_RE = new RegExp(`(^|${WORD})(boy|boyu|height)(${WORD}|$)|y[uü]ksekli[kğg]`);
const COMBO_RE = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i;

/** Kalemin alanlarından EN ve BOY'u (cm) çıkarır. Teknik modda sistem
 *  alanları, manuel modda anahtar/değer satırları, genel modda açıklama
 *  ("300x250") okunur. */
export function extractZipSize(item: QuoteItemT): { en: number; boy: number } | null {
  const pairs: { label: string; value: string }[] =
    item.mode === 'technical'
      ? (item.sistemFields || []).map((f) => ({ label: f.label, value: f.value }))
      : item.mode === 'manual'
        ? (item.customFields || []).map((f) => ({ label: f.key, value: f.value }))
        : [];
  let en: number | null = null;
  let boy: number | null = null;
  for (const p of pairs) {
    const l = norm(p.label);
    if (en == null && EN_RE.test(l)) en = toCm(p.value);
    else if (boy == null && BOY_RE.test(l)) boy = toCm(p.value);
  }
  // Serbest metin: "EN 210 × BOY 240 cm" (Zip Perde hesaplayıcısının
  // yazdığı açıklama) ya da "300x250".
  const texts = [item.aciklama || '', item.urunAdi || ''].map(norm);
  for (const txt of texts) {
    const e = new RegExp(`(^|${WORD})en\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)`).exec(txt);
    const b = new RegExp(`(^|${WORD})boy\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)`).exec(txt);
    if (en == null && e) en = toCm(e[2]);
    if (boy == null && b) boy = toCm(b[2]);
  }
  if (en == null || boy == null) {
    const sources = [...pairs.map((p) => p.value), item.aciklama || '', item.urunAdi || ''];
    for (const src of sources) {
      const m = COMBO_RE.exec(src || '');
      if (m) {
        const a = toCm(m[1]);
        const b = toCm(m[2]);
        if (a && b) { en = en ?? a; boy = boy ?? b; break; }
      }
    }
  }
  return en && boy ? { en, boy } : null;
}

const karKey = (companyId: string) => `zip-perde-kar:${companyId}`;

export async function loadZipKar(companyId: string): Promise<number> {
  const raw = await readRaw(karKey(companyId));
  const n = Number(raw);
  return raw != null && isFinite(n) ? n : 0;
}

export async function saveZipKar(companyId: string, pct: number): Promise<void> {
  await writeRaw(karKey(companyId), String(pct));
}

// Seçenek grupları: her grupta TEK seçim yapılır, ilk seçenek varsayılandır.
// Ek fiyat tablo fiyatının ÜSTÜNE, kârdan ÖNCE eklenir. `adet` ekleri perde
// başına sabit, `m2` ekleri GİRİLEN gerçek ölçünün (EN × BOY) m²'si başına.
export type ZipSecenekT = { id: string; label: string; eur: number; per: 'adet' | 'm2'; re?: RegExp; aciklama?: string };
export type ZipGrupT = { key: string; label: string; secenekler: ZipSecenekT[] };

export const ZIP_GRUPLAR: ZipGrupT[] = [
  {
    key: 'motor',
    label: 'Motor',
    secenekler: [
      { id: 'mosel', label: 'Mosel', eur: 0, per: 'adet', re: /mosel/, aciklama: 'Mosel motor' },
      { id: 'somfy', label: 'Somfy', eur: 70, per: 'adet', re: /somfy/, aciklama: 'Somfy motor' },
    ],
  },
  {
    key: 'kumas',
    label: 'Kumaş',
    secenekler: [
      { id: 'screen', label: 'Screen', eur: 0, per: 'm2', re: /screen/, aciklama: 'Screen kumaş' },
      { id: 'sergeFerrari', label: 'Serge Ferrari', eur: 10, per: 'm2', re: /ferrari/, aciklama: 'Serge Ferrari kumaş' },
    ],
  },
  {
    key: 'logo',
    label: 'Logo baskı',
    secenekler: [
      { id: 'yok', label: 'Yok', eur: 0, per: 'adet' },
      { id: 'var', label: 'Var', eur: 40, per: 'adet', re: /logo/, aciklama: 'Logo baskı' },
    ],
  },
];

export type ZipSecimT = Record<string, string>;

export const varsayilanZipSecim = (): ZipSecimT =>
  Object.fromEntries(ZIP_GRUPLAR.map((g) => [g.key, g.secenekler[0].id]));

const HAYIR_RE = /^(|-|—|yok|hayır|hayir|no|0)$/;

/** Kalemdeki seçim; yoksa metinden tahmin: "Motor: Somfy", "Kumaş: Serge
 *  Ferrari", "Logo Baskı: Evet" alanları ya da hesaplayıcının yazdığı
 *  açıklama. Eski {logo: true, sergeFerrari: true} kayıtları da okunur. */
export function zipSecimOf(item: QuoteItemT): ZipSecimT {
  const secim = varsayilanZipSecim();
  const kayitli = (item.zipEkler || null) as Record<string, unknown> | null;
  if (kayitli) {
    for (const g of ZIP_GRUPLAR) {
      const v = kayitli[g.key];
      if (typeof v === 'string' && g.secenekler.some((o) => o.id === v)) secim[g.key] = v;
    }
    if (kayitli.logo === true) secim.logo = 'var';
    if (kayitli.sergeFerrari === true) secim.kumas = 'sergeFerrari';
    return secim;
  }
  const pairs =
    item.mode === 'technical'
      ? (item.sistemFields || []).map((f) => [f.label, f.value])
      : (item.customFields || []).map((f) => [f.key, f.value]);
  const metin = norm(`${item.aciklama || ''} ${item.urunAdi || ''}`);
  for (const g of ZIP_GRUPLAR) {
    for (const o of g.secenekler) {
      if (!o.re) continue;
      let on = o.re.test(metin);
      for (const [l, v] of pairs) {
        const val = norm(v || '').trim();
        if (o.re.test(val)) on = true;
        // "Logo Baskı: Evet" -- etiket eşleşir, değer olumsuz değilse seçili.
        else if (o.re.test(norm(l || '')) && !HAYIR_RE.test(val) && !g.secenekler.some((x) => x.re?.test(val))) {
          if (g.key === 'logo') on = true;
        }
      }
      if (on) secim[g.key] = o.id;
    }
  }
  return secim;
}

export function zipSecilenler(secim: ZipSecimT): ZipSecenekT[] {
  return ZIP_GRUPLAR.map((g) => g.secenekler.find((o) => o.id === secim[g.key]) || g.secenekler[0]);
}

/** Teklif açıklamasına yazılacak seçenek adları (Mosel motor, Screen kumaş ...). */
export function zipSecimAciklama(secim: ZipSecimT): string[] {
  return zipSecilenler(secim).map((o) => o.aciklama).filter(Boolean) as string[];
}

export type ZipFiyatT = {
  bayi: number;
  m2: number;
  ekKalemler: { label: string; tutar: number }[];
  ekTutar: number;
  maliyet: number;
  satis: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function zipFiyat(tabloFiyati: number, enCm: number, boyCm: number, secim: ZipSecimT, karPct: number): ZipFiyatT {
  const m2 = r2((enCm * boyCm) / 10000);
  const ekKalemler = zipSecilenler(secim)
    .filter((o) => o.eur > 0)
    .map((o) => ({
      label: o.per === 'm2' ? `${o.aciklama} (${m2.toLocaleString('tr-TR')} m² × €${o.eur})` : `${o.aciklama} (+€${o.eur})`,
      tutar: r2(o.per === 'm2' ? o.eur * m2 : o.eur),
    }));
  const ekTutar = r2(ekKalemler.reduce((a, k) => a + k.tutar, 0));
  const maliyet = r2(tabloFiyati + ekTutar);
  return { bayi: tabloFiyati, m2, ekKalemler, ekTutar, maliyet, satis: r2(maliyet * (1 + karPct / 100)) };
}

/** Seçim değişince kalem açıklamasındaki seçenek adlarını da günceller
 *  ("..., Somfy motor, ..." -> "..., Mosel motor, ..."), böylece teklif
 *  PDF'ine eski seçim yazılmaz. Her grupta o gruba ait TÜM adlar silinip
 *  yerine yalnız seçili olan yazılır (tutarsız eski açıklamalar da düzelir).
 *  Grubun hiçbir adı yoksa ve açıklama hesaplayıcının biçimindeyse
 *  ("EN … × BOY … cm") sona eklenir; elle yazılmış açıklamaya dokunulmaz. */
export function zipAciklamaGuncelle(aciklama: string, eski: ZipSecimT, yeni: ZipSecimT): string {
  let parts = (aciklama || '').split(',').map((p) => p.trim()).filter(Boolean);
  const hesaplayiciBicimi = /^EN \d/.test(parts[0] || '');
  for (const g of ZIP_GRUPLAR) {
    if (eski[g.key] === yeni[g.key]) continue;
    const adlar = g.secenekler.map((o) => o.aciklama).filter(Boolean).map((x) => norm(x as string));
    const idx = parts.findIndex((p) => adlar.includes(norm(p)));
    const yeniAd = g.secenekler.find((o) => o.id === yeni[g.key])?.aciklama;
    if (idx < 0 && !hesaplayiciBicimi) continue;
    const kalan = parts.filter((p) => !adlar.includes(norm(p)));
    if (yeniAd) kalan.splice(idx < 0 ? kalan.length : Math.min(idx, kalan.length), 0, yeniAd);
    parts = kalan;
  }
  return parts.join(', ');
}

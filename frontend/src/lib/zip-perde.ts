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

// Ek seçenekler: tablo fiyatının ÜSTÜNE m² başına EUR eklenir. m², yuvarlanmış
// tablo basamağından değil GİRİLEN gerçek ölçüden (EN × BOY) hesaplanır.
export const ZIP_EKLER = [
  { key: 'logo', label: 'Logo baskı', eurM2: 5, re: /logo/ },
  { key: 'sergeFerrari', label: 'Serge Ferrari kumaş', eurM2: 5, re: /ferrari/ },
] as const;

const HAYIR_RE = /^(|-|—|yok|hayır|hayir|no|0)$/;

/** Kalem henüz seçim yapılmamışsa (zipEkler yok) metinden tahmin eder:
 *  "Logo Baskı: Evet" alanı, "Serge Ferrari" yazan kumaş alanı ya da
 *  hesaplayıcının yazdığı açıklama. */
export function zipEklerOf(item: QuoteItemT): Record<string, boolean> {
  if (item.zipEkler) return item.zipEkler;
  const pairs =
    item.mode === 'technical'
      ? (item.sistemFields || []).map((f) => [f.label, f.value])
      : (item.customFields || []).map((f) => [f.key, f.value]);
  const out: Record<string, boolean> = {};
  for (const ek of ZIP_EKLER) {
    let on = false;
    for (const [l, v] of pairs) {
      const val = norm(v || '').trim();
      if (ek.re.test(norm(val))) on = true;
      else if (ek.re.test(norm(l || '')) && !HAYIR_RE.test(val)) on = true;
    }
    if (!on && ek.re.test(norm(`${item.aciklama || ''} ${item.urunAdi || ''}`))) on = true;
    out[ek.key] = on;
  }
  return out;
}

export type ZipFiyatT = { bayi: number; m2: number; ekTutar: number; maliyet: number; satis: number };

export function zipFiyat(tabloFiyati: number, enCm: number, boyCm: number, ekler: Record<string, boolean>, karPct: number): ZipFiyatT {
  const m2 = Math.round((enCm * boyCm) / 10000 * 100) / 100;
  const ekTutar = Math.round(ZIP_EKLER.reduce((a, ek) => a + (ekler[ek.key] ? ek.eurM2 * m2 : 0), 0) * 100) / 100;
  const maliyet = Math.round((tabloFiyati + ekTutar) * 100) / 100;
  const satis = Math.round(maliyet * (1 + karPct / 100) * 100) / 100;
  return { bayi: tabloFiyati, m2, ekTutar, maliyet, satis };
}

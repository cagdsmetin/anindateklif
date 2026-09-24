import type { KasaEntryT, QuoteT, RatesT } from '@/src/lib/api';
import { convertToTRY } from '@/src/lib/tahsilat-utils';
import { fill, getLang, statusLabel, translate } from '@/src/lib/i18n';

// Kasa > Analiz / Raporlar ekranlarinin hesaplari. Tum toplamlar TL'dir:
// dovizli kasa kaydi, kayit anindaki kurla (kurTRY) -- yoksa canli kurla --
// TL'ye cevrilir; kur hic bilinmiyorsa kayit toplama katilmaz.

export type PeriodKey = 'thisMonth' | 'lastMonth' | 'thisYear' | 'last12';
export type Period = { key: PeriodKey; label: string; start: string; end: string; prevStart: string; prevEnd: string };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Aktif dilde kisa ay adlari (Oca/Jan/Gen...). */
export function monthNames(): string[] {
  return translate('finance.months').split(',');
}

export function buildPeriod(key: PeriodKey, now = new Date()): Period {
  const MONTHS_TR = monthNames();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'lastMonth') {
    const ly = m === 0 ? y - 1 : y, lm = m === 0 ? 11 : m - 1;
    const py = lm === 0 ? ly - 1 : ly, pm = lm === 0 ? 11 : lm - 1;
    return {
      key, label: `${MONTHS_TR[lm]} ${ly}`,
      start: `${ly}-${pad(lm + 1)}-01`, end: `${ly}-${pad(lm + 1)}-${lastDay(ly, lm)}`,
      prevStart: `${py}-${pad(pm + 1)}-01`, prevEnd: `${py}-${pad(pm + 1)}-${lastDay(py, pm)}`,
    };
  }
  if (key === 'thisYear') {
    // Onceki donem: gecen yilin AYNI gunune kadar (yil ici adil karsilastirma).
    return {
      key, label: String(y),
      start: `${y}-01-01`, end: iso(now),
      prevStart: `${y - 1}-01-01`, prevEnd: `${y - 1}-${pad(m + 1)}-${pad(Math.min(now.getDate(), lastDay(y - 1, m)))}`,
    };
  }
  if (key === 'last12') {
    const s = new Date(y, m - 11, 1);
    const ps = new Date(y, m - 23, 1);
    const pe = new Date(y, m - 11, 0);
    return { key, label: translate('finance.last12'), start: iso(s), end: iso(now), prevStart: iso(ps), prevEnd: iso(pe) };
  }
  // thisMonth: onceki donem = gecen ayin ayni gunune kadar
  const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
  return {
    key, label: `${MONTHS_TR[m]} ${y}`,
    start: `${y}-${pad(m + 1)}-01`, end: iso(now),
    prevStart: `${py}-${pad(pm + 1)}-01`, prevEnd: `${py}-${pad(pm + 1)}-${pad(Math.min(now.getDate(), lastDay(py, pm)))}`,
  };
}

export function inRange(date: string, start: string, end: string) {
  const d = (date || '').slice(0, 10);
  return d >= start && d <= end;
}

export function entryTRY(k: KasaEntryT, rates: RatesT | null): number | null {
  const cur = (k.paraBirimi || 'TRY').toUpperCase();
  if (cur === 'TRY') return k.tutar;
  if (k.kurTRY && k.kurTRY > 0) return k.tutar * k.kurTRY;
  return convertToTRY(k.tutar, cur, rates);
}

export function sumTRY(list: KasaEntryT[], rates: RatesT | null) {
  let gelir = 0, gider = 0;
  list.forEach((k) => {
    const v = entryTRY(k, rates);
    if (v == null) return;
    if (k.tur === 'gelir') gelir += v; else gider += v;
  });
  return { gelir, gider, net: gelir - gider };
}

/** % degisim; onceki donem 0 ise null (sonsuz/anlamsiz). */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function monthlySeries(kasa: KasaEntryT[], rates: RatesT | null, months = 6, now = new Date()) {
  const MONTHS_TR = monthNames();
  const out: { key: string; label: string; gelir: number; gider: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: MONTHS_TR[d.getMonth()], gelir: 0, gider: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  kasa.forEach((k) => {
    const i = idx.get((k.tarih || '').slice(0, 7));
    if (i == null) return;
    const v = entryTRY(k, rates);
    if (v == null) return;
    if (k.tur === 'gelir') out[i].gelir += v; else out[i].gider += v;
  });
  return out;
}

export function categoryBreakdown(list: KasaEntryT[], rates: RatesT | null, tur: 'gelir' | 'gider') {
  const map: Record<string, number> = {};
  list.filter((k) => k.tur === tur).forEach((k) => {
    const v = entryTRY(k, rates);
    if (v == null) return;
    map[k.kategori] = (map[k.kategori] || 0) + v;
  });
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return Object.entries(map)
    .map(([kategori, toplam]) => ({ kategori, toplam, pct: total ? (toplam / total) * 100 : 0 }))
    .sort((a, b) => b.toplam - a.toplam);
}

export function accountBalances(kasa: KasaEntryT[], rates: RatesT | null, hesaplar: string[]) {
  const map: Record<string, number> = {};
  hesaplar.forEach((h) => { map[h] = 0; });
  kasa.forEach((k) => {
    const v = entryTRY(k, rates);
    if (v == null) return;
    const h = k.hesap || 'Ana Kasa';
    map[h] = (map[h] || 0) + (k.tur === 'gelir' ? v : -v);
  });
  return Object.entries(map).map(([hesap, bakiye]) => ({ hesap, bakiye }));
}

// ---- Kar / zarar (onaylanan teklifler) ----
// Ciro KDV haric (araToplam = kalemler - iskonto). Maliyet teklif bazinda
// (Gecmis > "Maliyet ekle") girildiyse kar hesaplanir; girilmemis teklifler
// ciroya dahil ama kar/marj hesabina dahil degildir -- kapsama orani gosterilir.
export function profitAnalysis(quotes: QuoteT[], rates: RatesT | null, start: string, end: string) {
  const approved = quotes.filter((q) => q.durum === 'Onaylandı' && inRange(q.tarih, start, end));
  let ciro = 0, ciroMaliyetli = 0, maliyet = 0, maliyetliSayi = 0, kdv = 0;
  const products: Record<string, { ad: string; ciro: number; adet: number; kar: number | null }> = {};
  approved.forEach((q) => {
    const cur = q.paraBirimi || 'USD';
    const toTRY = (n: number) => convertToTRY(n, cur, rates);
    const c = toTRY(q.araToplam || 0);
    if (c == null) return;
    ciro += c;
    kdv += toTRY(q.kdvTutar || 0) || 0;
    if (q.maliyet != null) {
      const m = toTRY(q.maliyet) || 0;
      maliyet += m; ciroMaliyetli += c; maliyetliSayi += 1;
    }
    const iskontoOran = q.iskonto ? q.iskonto / 100 : 0;
    (q.items || []).forEach((it) => {
      const ad = (it.sistemTipi || it.urunAdi || 'Diğer').trim() || 'Diğer';
      const satir = (it.adet || 0) * (it.birimFiyat || 0) * (1 - iskontoOran);
      const satirTRY = toTRY(satir) || 0;
      const p = products[ad] || (products[ad] = { ad, ciro: 0, adet: 0, kar: null });
      p.ciro += satirTRY;
      p.adet += it.adet || 0;
      if (it.maliyet != null) {
        const mm = toTRY((it.maliyet || 0) * (it.adet || 0)) || 0;
        p.kar = (p.kar || 0) + (satirTRY - mm);
      }
    });
  });
  const kar = ciroMaliyetli - maliyet;
  return {
    teklifSayisi: approved.length,
    ciro,
    kdv,
    maliyet,
    kar,
    marj: ciroMaliyetli ? (kar / ciroMaliyetli) * 100 : null,
    maliyetliSayi,
    urunler: Object.values(products).sort((a, b) => b.ciro - a.ciro).slice(0, 6),
  };
}

// ---- KDV ozeti (tahmini) ----
// Hesaplanan KDV: donemde onaylanan tekliflerin KDV'si.
// Indirilecek KDV: KDV orani girilmis gider kayitlarinin icindeki KDV.
export function kdvSummary(kasa: KasaEntryT[], quotes: QuoteT[], rates: RatesT | null, start: string, end: string) {
  const hesaplanan = profitAnalysis(quotes, rates, start, end).kdv;
  let indirilecek = 0, satisKdvKasa = 0;
  kasa.filter((k) => inRange(k.tarih, start, end) && (k.kdvOrani || 0) > 0).forEach((k) => {
    const v = entryTRY(k, rates);
    if (v == null) return;
    const r = k.kdvOrani || 0;
    const kdv = (v * r) / (100 + r);
    if (k.tur === 'gider') indirilecek += kdv; else satisKdvKasa += kdv;
  });
  return { hesaplanan: hesaplanan + satisKdvKasa, indirilecek, odenecek: hesaplanan + satisKdvKasa - indirilecek };
}

// ---- Disa aktarim ----
const csvCell = (v: any) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Excel (TR) uyumlu: noktali virgul ayraci + BOM. */
export function kasaCsv(list: KasaEntryT[], rates: RatesT | null) {
  const head = translate('finance.csvHead').split(';');
  const rows = [...list]
    .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''))
    .map((k) => {
      const tl = entryTRY(k, rates);
      return [
        k.tarih, translate(k.tur === 'gelir' ? 'kasaX.income' : 'kasaX.expense'), statusLabel(getLang(), k.kategori), statusLabel(getLang(), k.hesap || 'Ana Kasa'), statusLabel(getLang(), k.yontem),
        (k.tutar || 0).toFixed(2).replace('.', ','), k.paraBirimi || 'TRY',
        tl == null ? '' : tl.toFixed(2).replace('.', ','), k.kdvOrani || '', k.notlar || '',
      ].map(csvCell).join(';');
    });
  return '﻿' + [head.join(';'), ...rows].join('\n');
}

export const tl = (n: number) =>
  '₺' + new Intl.NumberFormat(getLang() === 'tr' ? 'tr-TR' : getLang() === 'it' ? 'it-IT' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const escHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function financeSummaryHtml(opts: {
  firma: string;
  period: Period;
  totals: { gelir: number; gider: number; net: number };
  gelirKat: { kategori: string; toplam: number; pct: number }[];
  giderKat: { kategori: string; toplam: number; pct: number }[];
  profit: ReturnType<typeof profitAnalysis>;
  kdv: ReturnType<typeof kdvSummary>;
  hesaplar: { hesap: string; bakiye: number }[];
}) {
  const { firma, period, totals, gelirKat, giderKat, profit, kdv, hesaplar } = opts;
  const T = translate;
  const lang = getLang();
  const katTable = (title: string, rows: typeof gelirKat) =>
    `<h3>${title}</h3><table>${rows.length ? rows.map((r) => `<tr><td>${escHtml(statusLabel(lang, r.kategori))}</td><td class="r">${tl(r.toplam)}</td><td class="r m">%${r.pct.toFixed(1)}</td></tr>`).join('') : `<tr><td>${T('finance.noRecords')}</td></tr>`}</table>`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/><style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; font-size: 11.5px; }
  h1 { font-size: 18px; margin: 0; } .sub { color: #64748b; margin: 2px 0 16px; }
  .cards { display: flex; gap: 10px; margin-bottom: 14px; }
  .card { flex: 1; border-radius: 10px; padding: 10px 12px; }
  .card b { display: block; font-size: 16px; margin-top: 4px; }
  h3 { font-size: 12.5px; margin: 16px 0 6px; border-bottom: 2px solid #0D9488; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 5px 4px; border-bottom: 1px solid #e2e8f0; }
  .r { text-align: right; } .m { color: #64748b; width: 60px; }
  .note { color: #64748b; font-size: 10px; margin-top: 18px; }
</style></head><body>
  <h1>${T('kasaX.summaryTitle')}</h1>
  <div class="sub">${escHtml(firma)} · ${escHtml(period.label)} (${period.start} – ${period.end})</div>
  <div class="cards">
    <div class="card" style="background:#DCFCE7">${T('kasaX.income')}<b>${tl(totals.gelir)}</b></div>
    <div class="card" style="background:#FEE2E2">${T('kasaX.expense')}<b>${tl(totals.gider)}</b></div>
    <div class="card" style="background:#E0E7FF">${T('kasaX.net')}<b>${tl(totals.net)}</b></div>
  </div>
  ${katTable(T('finance.incomeCats'), gelirKat)}
  ${katTable(T('finance.expenseCats'), giderKat)}
  <h3>${T('finance.balances')}</h3>
  <table>${hesaplar.map((h) => `<tr><td>${escHtml(statusLabel(lang, h.hesap))}</td><td class="r">${tl(h.bakiye)}</td></tr>`).join('')}</table>
  <h3>${T('finance.profitSec')}</h3>
  <table>
    <tr><td>${T('kasaX.approvedCount')}</td><td class="r">${profit.teklifSayisi} ${T('finance.pcs')}</td></tr>
    <tr><td>${T('finance.revenue')}</td><td class="r">${tl(profit.ciro)}</td></tr>
    <tr><td>${fill(T('finance.costWithN'), { n: profit.maliyetliSayi })}</td><td class="r">${tl(profit.maliyet)}</td></tr>
    <tr><td><b>${T('kasaX.grossProfit')}</b></td><td class="r"><b>${tl(profit.kar)}</b>${profit.marj != null ? ` (%${profit.marj.toFixed(1)})` : ''}</td></tr>
  </table>
  <h3>${T('finance.vatSec')}</h3>
  <table>
    <tr><td>${T('kasaX.vatOut')}</td><td class="r">${tl(kdv.hesaplanan)}</td></tr>
    <tr><td>${T('kasaX.vatIn')}</td><td class="r">${tl(kdv.indirilecek)}</td></tr>
    <tr><td><b>${T('kasaX.vatPay')}</b></td><td class="r"><b>${tl(kdv.odenecek)}</b></td></tr>
  </table>
  <div class="note">${T('finance.note')}</div>
</body></html>`;
}

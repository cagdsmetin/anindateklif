import type { TedarikciHareketT } from './api';
import type { CurrencyBalance } from './tahsilat-utils';

// Tedarikçi carisi: "alis" tedarikçiye borçlandığımız tutar, "odeme" ona
// yaptığımız ödeme. Bakiye = alış - ödeme; pozitifse tedarikçiye borçluyuz,
// negatifse fazla ödemişiz (avans). Müşteri carisindeki gibi her para birimi
// kendi içinde toplanır, kur farkı yüzünden kayıt atlanmaz.

export type TedarikciBalance = {
  tedarikciId: string;
  balances: CurrencyBalance[]; // sıfır olmayan bakiyeler
  hasOverdue: boolean; // vadesi geçmiş alış var ve o para biriminde borç kapanmamış
  lastTarih: string;
  count: number;
};

export function fmtMoney(n: number, cur: string = 'TRY') {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n || 0));
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${n < 0 ? '-' : ''}${sym}${s}`;
}

/** Yüzde değeri Türkçe ondalıkla: 34.7 -> "34,7". */
export function fmtPct(n: number) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n);
}

export function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Vadeye kalan gün (geçmişse negatif). */
export function daysUntil(vade: string, today: string = localToday()): number {
  const a = Date.parse(`${vade}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "12.000,50", "12,000.50", "12000.5", "₺3.200" -> sayı; anlaşılmazsa NaN. */
export function parseAmount(raw: string): number {
  let s = String(raw || '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTedarikciBalances(list: TedarikciHareketT[], today: string): Record<string, TedarikciBalance> {
  const sums: Record<string, Record<string, number>> = {};
  const overdueCur: Record<string, Set<string>> = {};
  const out: Record<string, TedarikciBalance> = {};
  list.forEach((h) => {
    const id = h.tedarikciId;
    const cur = h.paraBirimi || 'TRY';
    sums[id] = sums[id] || {};
    sums[id][cur] = (sums[id][cur] || 0) + (h.tur === 'alis' ? h.tutar : -h.tutar);
    if (h.tur === 'alis' && h.vadeTarihi && h.vadeTarihi < today) {
      overdueCur[id] = overdueCur[id] || new Set();
      overdueCur[id].add(cur);
    }
    const prev = out[id];
    out[id] = {
      tedarikciId: id,
      balances: [],
      hasOverdue: false,
      lastTarih: prev && prev.lastTarih > h.tarih ? prev.lastTarih : h.tarih,
      count: (prev?.count || 0) + 1,
    };
  });
  Object.keys(out).forEach((id) => {
    out[id].balances = Object.entries(sums[id])
      .map(([paraBirimi, b]) => ({ paraBirimi, bakiye: round2(b) }))
      .filter((b) => Math.abs(b.bakiye) >= 0.01);
    out[id].hasOverdue = out[id].balances.some((b) => b.bakiye > 0 && overdueCur[id]?.has(b.paraBirimi));
  });
  return out;
}

/** Satış ve alış birim fiyatından kâr ve kâr marjı (satışa göre %). */
export function karOf(satis: number, alis: number): { kar: number; marj: number | null } {
  const kar = round2(satis - alis);
  return { kar, marj: satis > 0 ? Math.round((kar / satis) * 1000) / 10 : null };
}

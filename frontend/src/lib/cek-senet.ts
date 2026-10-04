import type { CekDurum, CekSenetInput, CekSenetT, CekTur, CekYon } from './api';
import { norm } from './customer-import';
import { translate } from './i18n';

// Çek & Senet ekranının saf yardımcıları: vade hesabı, Excel (CSV) dışa
// aktarım ve Excel/CSV içe aktarımda satır -> kayıt dönüşümü.

export const CEK_DURUMLAR: CekDurum[] = ['portfoy', 'tahsilde', 'odendi', 'karsiliksiz', 'ciro'];

/** Hâlâ vadesi beklenen (henüz ödenmemiş, karşılıksız çıkmamış, ciro edilmemiş) kayıt. */
export const isOpen = (d: Pick<CekSenetT, 'durum'>) => d.durum === 'portfoy' || d.durum === 'tahsilde';

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

/** "25.09.2026", "25/09/2026", "2026-09-25" ya da Excel seri günü -> YYYY-MM-DD; anlaşılmazsa ''. */
export function parseDate(raw: string): string {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(s)) {
    // Excel seri tarihi (1900 tabanlı)
    return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  }
  return '';
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

const ALIASES: Record<string, string[]> = {
  yon: ['yon', 'yonu', 'alinan verilen', 'direction', 'tip'],
  tur: ['tur', 'turu', 'cek senet', 'evrak', 'type', 'kind'],
  kesideci: ['kesideci', 'borclu', 'lehtar', 'kisi', 'musteri', 'cari', 'firma', 'kimden', 'kime', 'ad soyad', 'unvan', 'name', 'drawer', 'party'],
  telefon: ['telefon', 'tel', 'gsm', 'phone'],
  tutar: ['tutar', 'miktar', 'bedel', 'amount'],
  paraBirimi: ['para birimi', 'doviz', 'currency', 'pb'],
  vadeTarihi: ['vade', 'vade tarihi', 'vadesi', 'due', 'due date', 'maturity'],
  banka: ['banka', 'bank'],
  no: ['no', 'cek no', 'senet no', 'seri no', 'numara', 'number'],
  durum: ['durum', 'durumu', 'status'],
  ciroEdilen: ['ciro edilen', 'ciro', 'endorsed to'],
  notlar: ['not', 'notlar', 'aciklama', 'note', 'notes'],
};

function pickEnum<T extends string>(raw: string, table: Record<T, string[]>, fallback: T): T {
  const n = norm(raw);
  if (!n) return fallback;
  for (const k of Object.keys(table) as T[]) {
    if (table[k].some((a) => n === a || n.startsWith(a))) return k;
  }
  return fallback;
}

const YON_WORDS: Record<CekYon, string[]> = {
  alinan: ['alinan', 'alacak', 'tahsil', 'received', 'incoming', 'ricevut'],
  verilen: ['verilen', 'borc', 'odenecek', 'odeme', 'given', 'issued', 'outgoing', 'emess'],
};
const TUR_WORDS: Record<CekTur, string[]> = { cek: ['cek', 'cheque', 'check', 'assegno'], senet: ['senet', 'note', 'bono', 'cambiale'] };
const DURUM_WORDS: Record<CekDurum, string[]> = {
  portfoy: ['portfoy', 'portfolio', 'in portfolio', 'in portafoglio', 'bekliyor'],
  tahsilde: ['tahsilde', 'bankada', 'collection', 'at bank', 'in banca'],
  odendi: ['odendi', 'tahsil edildi', 'paid', 'kapandi', 'pagat'],
  karsiliksiz: ['karsiliksiz', 'protesto', 'bounced', 'dishonoured', 'scopert'],
  ciro: ['ciro', 'endorsed', 'girat'],
};

export type ParsedCek = { items: Omit<CekSenetInput, 'companyId'>[]; skipped: number };

/** Excel/CSV satırlarını kayda çevirir. Başlık satırı zorunlu (Tutar + Vade + kişi sütunu). */
export function rowsToCekSenet(rows: string[][], defaultYon: CekYon): ParsedCek | null {
  if (!rows.length) return null;
  const map: Record<string, number> = {};
  rows[0].forEach((cell, i) => {
    const n = norm(cell);
    for (const k of Object.keys(ALIASES)) {
      if (map[k] == null && ALIASES[k].includes(n)) { map[k] = i; break; }
    }
  });
  if (map.tutar == null || map.vadeTarihi == null || map.kesideci == null) return null;
  const get = (r: string[], k: string) => (map[k] == null ? '' : String(r[map[k]] ?? '').trim());
  let skipped = 0;
  const items: ParsedCek['items'] = [];
  rows.slice(1).forEach((r) => {
    const kesideci = get(r, 'kesideci');
    const tutar = parseAmount(get(r, 'tutar'));
    const vadeTarihi = parseDate(get(r, 'vadeTarihi'));
    if (!kesideci || !(tutar > 0) || !vadeTarihi) { skipped++; return; }
    const cur = get(r, 'paraBirimi').toUpperCase();
    const durum = pickEnum<CekDurum>(get(r, 'durum'), DURUM_WORDS, 'portfoy');
    items.push({
      yon: pickEnum<CekYon>(get(r, 'yon'), YON_WORDS, defaultYon),
      tur: pickEnum<CekTur>(get(r, 'tur'), TUR_WORDS, 'cek'),
      customerId: '',
      kesideci,
      telefon: get(r, 'telefon'),
      tutar,
      paraBirimi: cur.includes('USD') || cur === '$' ? 'USD' : cur.includes('EUR') || cur === '€' ? 'EUR' : 'TRY',
      vadeTarihi,
      banka: get(r, 'banka'),
      no: get(r, 'no'),
      durum,
      ciroEdilen: durum === 'ciro' ? get(r, 'ciroEdilen') : '',
      cariDus: false,
      notlar: get(r, 'notlar'),
      kurTRY: 0,
    });
  });
  return { items, skipped };
}

const csvCell = (v: any) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Excel (TR) uyumlu CSV: noktalı virgül ayracı + BOM. Başlıklar içe aktarımla birebir uyumlu. */
export function cekSenetCsv(list: CekSenetT[]): string {
  const T = (k: string) => translate('cek.' + k);
  const head = ['Yön', 'Tür', 'Keşideci', 'Telefon', 'Tutar', 'Para Birimi', 'Vade', 'Banka', 'No', 'Durum', 'Ciro Edilen', 'Not'];
  const rows = [...list]
    .sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi))
    .map((d) => [
      T(d.yon === 'alinan' ? 'alinan' : 'verilen'), T(d.tur), d.kesideci, d.telefon,
      d.tutar.toFixed(2).replace('.', ','), d.paraBirimi || 'TRY',
      d.vadeTarihi.split('-').reverse().join('.'), d.banka, d.no, T('d_' + d.durum), d.ciroEdilen, d.notlar,
    ].map(csvCell).join(';'));
  return '﻿' + [head.join(';'), ...rows].join('\n');
}

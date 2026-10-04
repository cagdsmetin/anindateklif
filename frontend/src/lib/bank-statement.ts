import type { CustomerT, TahsilatEntryT } from './api';
import { norm } from './customer-import';
import { parseAmount, parseDate } from './cek-senet';
import { computeCustomerBalances } from './tahsilat-utils';

// Banka ekstresi (Excel/CSV) -> para girişleri -> müşteri önerisi.
// Bankalar tabloyu farklı satırdan başlatır (üstte hesap bilgisi olur), bu
// yüzden başlık satırı ilk 40 satır içinde aranır. Tutar ya tek "Tutar"
// sütunudur (girişler pozitif) ya da ayrı "Alacak"/"Borç" sütunlarıdır.

export type StatementRow = {
  ref: string; // tarih|tutar|açıklama parmak izi (mükerrer aktarımı önler)
  tarih: string;
  aciklama: string;
  tutar: number;
  customerId: string;
  musteriAdi: string;
  musteriTelefon: string;
  score: number; // 0 = eşleşme yok
  reason: '' | 'name' | 'amount' | 'both';
};

const H = {
  tarih: ['tarih', 'islem tarihi', 'date', 'valor', 'valor tarihi', 'islem tarih', 'tarih saat'],
  aciklama: ['aciklama', 'islem aciklamasi', 'description', 'detay', 'aciklamalar', 'islem', 'karsi taraf', 'gonderen', 'alici gonderen'],
  tutar: ['tutar', 'islem tutari', 'amount', 'tutar tl', 'tutar try'],
  alacak: ['alacak', 'giris', 'yatan', 'credit', 'gelen'],
  borc: ['borc', 'cikis', 'cekilen', 'debit', 'giden'],
};

function findHeader(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const map: Record<string, number> = {};
    rows[i].forEach((cell, j) => {
      const n = norm(cell);
      (Object.keys(H) as (keyof typeof H)[]).forEach((k) => {
        if (map[k] == null && H[k].includes(n)) map[k] = j;
      });
    });
    if (map.tarih != null && (map.tutar != null || map.alacak != null)) return { row: i, map };
  }
  return null;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STOP = new Set(['ltd', 'sti', 'san', 'tic', 'a s', 'as', 'insaat', 'yapi', 'ticaret', 'sanayi', 'limited', 'sirketi', 've', 'fast', 'eft', 'havale']);

function tokens(name: string): string[] {
  return norm(name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Ekstre satırlarından yalnız para girişlerini çıkarır; başlık bulunamazsa null. */
export function parseStatement(rows: string[][]): { items: Omit<StatementRow, 'customerId' | 'musteriAdi' | 'musteriTelefon' | 'score' | 'reason'>[] } | null {
  const h = findHeader(rows);
  if (!h) return null;
  const get = (r: string[], k: string) => (h.map[k] == null ? '' : String(r[h.map[k]] ?? '').trim());
  const items: { ref: string; tarih: string; aciklama: string; tutar: number }[] = [];
  rows.slice(h.row + 1).forEach((r) => {
    const tarih = parseDate(get(r, 'tarih').split(' ')[0]);
    if (!tarih) return;
    let tutar: number;
    if (h.map.alacak != null) {
      tutar = parseAmount(get(r, 'alacak'));
      if (!(tutar > 0) && h.map.tutar != null) tutar = parseAmount(get(r, 'tutar'));
    } else {
      tutar = parseAmount(get(r, 'tutar'));
    }
    if (!(tutar > 0)) return; // çıkış ya da boş
    const aciklama = get(r, 'aciklama');
    items.push({ ref: 'ek_' + hash(`${tarih}|${tutar.toFixed(2)}|${norm(aciklama)}`), tarih, aciklama, tutar });
  });
  return { items };
}

/** Her girişe en olası müşteriyi önerir: açıklamada adı geçen ve/veya bakiyesi tutara eşit olan. */
export function matchCustomers(
  items: { ref: string; tarih: string; aciklama: string; tutar: number }[],
  customers: CustomerT[],
  tahsilat: TahsilatEntryT[],
): StatementRow[] {
  const balances = computeCustomerBalances(tahsilat);
  const tryBalance = (c: CustomerT) =>
    balances.find((b) => b.customerId === c.id || b.musteriAdi.trim().toLowerCase() === c.firma.trim().toLowerCase())
      ?.balances.find((x) => x.paraBirimi === 'TRY')?.bakiye || 0;
  const prepared = customers.map((c) => ({ c, toks: [...tokens(c.firma), ...tokens(c.yetkili || '')], bal: tryBalance(c) }));
  return items.map((it) => {
    const text = ` ${norm(it.aciklama)} `;
    let best: { c: CustomerT; score: number; reason: StatementRow['reason'] } | null = null;
    prepared.forEach(({ c, toks, bal }) => {
      const hits = toks.filter((w) => text.includes(` ${w} `)).length;
      const nameScore = toks.length ? hits / toks.length : 0;
      const amountHit = bal > 0 && Math.abs(bal - it.tutar) < 0.01;
      const score = (nameScore >= 0.5 ? nameScore * 2 : 0) + (amountHit ? 1 : 0);
      if (score > 0 && (!best || score > best.score)) {
        best = { c, score, reason: nameScore >= 0.5 && amountHit ? 'both' : nameScore >= 0.5 ? 'name' : 'amount' };
      }
    });
    const b = best as { c: CustomerT; score: number; reason: StatementRow['reason'] } | null;
    return {
      ...it,
      customerId: b?.c.id || '',
      musteriAdi: b?.c.firma || '',
      musteriTelefon: b?.c.telefon || '',
      score: b?.score || 0,
      reason: b?.reason || '',
    };
  });
}

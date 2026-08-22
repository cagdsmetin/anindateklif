import type { QuoteItemT, QuoteT } from './api';

/**
 * Builds the "SİSTEM / HİZMET" cell text for a quote item based on its mode.
 * Technical mode → concatenates dimensions + motor + lighting + foam + RAL comma-separated.
 * Manual mode → concatenates the product name + Key: Value pairs.
 * General mode → returns the product name (with optional description).
 */
export function buildItemDescription(it: QuoteItemT): string {
  const parts: string[] = [];
  if (it.mode === 'technical') {
    const head = it.sistemTipi || it.urunAdi || '';
    if (head) parts.push(head);
    for (const f of it.sistemFields || []) {
      const label = (f.label || '').trim();
      const value = (f.value || '').trim();
      if (!label && !value) continue;
      if (label && value) parts.push(`${label}: ${value}`);
      else if (value) parts.push(value);
      else parts.push(label);
    }
  } else if (it.mode === 'manual') {
    const head = it.urunAdi || '';
    if (head) parts.push(head);
    for (const f of it.customFields || []) {
      const key = (f.key || '').trim();
      const value = (f.value || '').trim();
      if (!key && !value) continue;
      if (key && value) parts.push(`${key}: ${value}`);
      else if (value) parts.push(value);
      else parts.push(key);
    }
  } else {
    const head = it.urunAdi || '';
    if (head) parts.push(head);
    if (it.aciklama) parts.push(it.aciklama);
  }
  return parts.length ? parts.join(', ') + '.' : '';
}

/**
 * Dynamic file name: Teklif_YYYY-DDMMYY-HHMM
 * Example: Teklif_2026-080826-1830
 * (YYYY: full year, DDMMYY: day+month+2digit year, HHMM: hour+minute)
 */
export function buildQuoteFileName(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `Teklif_${yyyy}-${dd}${mm}${yy}-${hh}${mi}`;
}

/**
 * Counts how many quotes were already created "today" (matched by the
 * quote's `tarih` field, YYYY-MM-DD) — used to number today's next quote.
 */
export function countQuotesToday(quotes: QuoteT[], d: Date = new Date()): number {
  const todayIso = d.toISOString().split('T')[0];
  return quotes.filter((q) => q.tarih === todayIso).length;
}

/**
 * Auto-generated Teklif No shown on the PDF header (short form).
 * Format: YYYY-DDMMNN, where NN is that day's quote sequence (01, 02, ...).
 * Example: the 1st quote created on 2026-08-22 → 2026-220801
 */
export function buildTeklifNo(seq: number = 1, d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const nn = String(Math.max(1, seq)).padStart(2, '0');
  return `${yyyy}-${dd}${mm}${nn}`;
}

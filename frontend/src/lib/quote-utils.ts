import type { QuoteItemT } from './api';

/**
 * Builds the "SİSTEM / HİZMET" cell text for a quote item based on its mode.
 * Technical mode → concatenates dimensions + motor + lighting + foam + RAL comma-separated.
 * Manual mode → concatenates the product name + Key: Value pairs.
 * General mode → returns the product name (with optional description).
 */
export function buildItemDescription(it: QuoteItemT): string {
  const parts: string[] = [];
  const head = it.urunAdi || it.sistemTipi || '';
  if (head) parts.push(head);

  if (it.mode === 'technical') {
    // Dimensions: prefer WxU pattern, then H separately
    const dims: string[] = [];
    if (it.genislikMm && it.uzunlukMm) dims.push(`${format(it.genislikMm)}x${format(it.uzunlukMm)}mm`);
    else if (it.genislikMm) dims.push(`Genişlik: ${format(it.genislikMm)}mm`);
    else if (it.uzunlukMm) dims.push(`Uzunluk: ${format(it.uzunlukMm)}mm`);
    if (it.yukseklikMm) dims.push(`H: ${format(it.yukseklikMm)}mm`);
    parts.push(...dims);
    if (it.motor) parts.push(`${it.motor} Motor`);
    if (it.aydinlatma) parts.push(`Led: ${it.aydinlatma}`);
    if (it.kopukDolgu) parts.push('Strafor Köpük Dolgulu');
    if (it.ralAna) parts.push(`Ral: ${it.ralAna}`);
    if (it.ralPanel) parts.push(`Panel Ral: ${it.ralPanel}`);
    if (it.ekBilgi) parts.push(it.ekBilgi);
  } else if (it.mode === 'manual') {
    for (const f of it.customFields || []) {
      if (f.key || f.value) parts.push(`${f.key}: ${f.value}`);
    }
  }
  return parts.filter(Boolean).join(', ') + (parts.length ? '.' : '');
}

function format(n: number): string {
  if (n === Math.floor(n)) return String(n);
  return String(n);
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
 * Auto-generated Teklif No shown on the PDF header (short form).
 * Matches example: 2026-260806 → YYYY-DDMMHH
 */
export function buildTeklifNo(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${dd}${mm}${hh}`;
}

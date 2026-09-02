import type { QuoteItemT, QuoteT } from './api';

/**
 * Builds the "SİSTEM / HİZMET" cell text for a quote item based on its mode.
 * Technical mode → concatenates dimensions + motor + lighting + foam + RAL comma-separated.
 * Manual mode → concatenates the product name + Key: Value pairs.
 * General mode → returns the product name (with optional description).
 */
// Loose Turkish-aware label matching so "Genişlik", "genislik", "Cephe (Genişlik)"
// etc. all resolve to the same dimension role, regardless of exact casing/
// diacritics/spacing the person used when they set up the configurator field.
const normalizeLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

const HEIGHT_LABELS = new Set(['yukseklik', 'h', 'height']);
const WIDTH_LABELS = new Set(['genislik', 'cephe', 'en', 'width', 'w']);
const DEPTH_LABELS = new Set(['derinlik', 'uzunluk', 'boy', 'depth', 'length', 'd', 'l']);

type DimRole = 'height' | 'width' | 'depth' | null;
const dimRole = (label: string): DimRole => {
  const n = normalizeLabel(label);
  if (HEIGHT_LABELS.has(n)) return 'height';
  if (WIDTH_LABELS.has(n)) return 'width';
  if (DEPTH_LABELS.has(n)) return 'depth';
  return null;
};

/**
 * Renders a technical-mode item's dimension fields (Genişlik/Cephe, Derinlik/
 * Uzunluk, Yükseklik) the way they read on a real teklif: width and depth
 * combined as "120 x 80 mm", height always as "H: 200 mm" -- instead of three
 * separate "Label: value" segments. Any field that isn't one of these three
 * dimension roles (motor, renk, RAL, vb.) is left exactly as-is.
 */
function renderDimensionFields(fields: { label?: string; value?: string }[]): string[] {
  const items = fields.map((f) => ({
    label: (f.label || '').trim(),
    value: (f.value || '').trim(),
    role: dimRole((f.label || '').trim()),
  }));
  const widthHasValue = items.some((f) => f.role === 'width' && f.value);
  const depthHasValue = items.some((f) => f.role === 'depth' && f.value);
  const combineWidthDepth = widthHasValue && depthHasValue;
  const parts: string[] = [];
  let widthDepthEmitted = false;
  for (const f of items) {
    if (!f.label && !f.value) continue;
    if (f.role === 'height' && f.value) {
      parts.push(`H: ${f.value} mm`);
      continue;
    }
    if ((f.role === 'width' || f.role === 'depth') && combineWidthDepth) {
      if (!widthDepthEmitted) {
        const w = items.find((x) => x.role === 'width')!.value;
        const d = items.find((x) => x.role === 'depth')!.value;
        parts.push(`${w} x ${d} mm`);
        widthDepthEmitted = true;
      }
      continue;
    }
    if (f.label && f.value) parts.push(`${f.label}: ${f.value}`);
    else if (f.value) parts.push(f.value);
    else parts.push(f.label);
  }
  return parts;
}

export function buildItemDescription(it: QuoteItemT): string {
  const parts: string[] = [];
  if (it.mode === 'technical') {
    const head = it.sistemTipi || it.urunAdi || '';
    if (head) parts.push(head);
    parts.push(...renderDimensionFields(it.sistemFields || []));
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


/**
 * Lightweight "rich" segment for Ozel Notlar: text wrapped in **double
 * asterisks** renders bold + black + underlined + slightly larger wherever
 * notes are shown (editor onizleme and the generated PDF, since preview.tsx
 * reuses the same PDF HTML).
 */
export type NoteSegment = { text: string; emphasis: boolean };

export function parseNoteSegments(raw: string): NoteSegment[] {
  if (!raw) return [];
  const segments: NoteSegment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > lastIndex) segments.push({ text: raw.slice(lastIndex, m.index), emphasis: false });
    segments.push({ text: m[1], emphasis: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < raw.length) segments.push({ text: raw.slice(lastIndex), emphasis: false });
  return segments;
}

/**
 * Toggles ** markers around the [start,end) selection so the person can turn
 * bold/underline emphasis on or off for whatever text they've selected in
 * the Ozel Notlar field. With no selection, inserts an empty ** ** pair and
 * places the cursor between the markers so the next typed text is emphasized.
 */
export function toggleNoteEmphasis(
  text: string,
  start: number,
  end: number
): { text: string; start: number; end: number } {
  if (start === end) {
    const next = text.slice(0, start) + '****' + text.slice(start);
    return { text: next, start: start + 2, end: start + 2 };
  }
  const before2 = text.slice(Math.max(0, start - 2), start);
  const after2 = text.slice(end, end + 2);
  if (before2 === '**' && after2 === '**') {
    const next = text.slice(0, start - 2) + text.slice(start, end) + text.slice(end + 2);
    return { text: next, start: start - 2, end: end - 2 };
  }
  const selected = text.slice(start, end);
  const next = text.slice(0, start) + '**' + selected + '**' + text.slice(end);
  return { text: next, start: start + 2, end: end + 2 };
}

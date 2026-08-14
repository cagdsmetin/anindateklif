import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
// NOTE: `pdf-lib` bundles an outdated `tslib@1.x` that crashes RN Web (`__extends`
// undefined) when Metro bundles it into the app. To keep native untouched we still
// lazy-require() the npm package there. On web we instead load pdf-lib's prebuilt
// UMD bundle from a CDN at runtime (a plain <script> tag, never touched by Metro),
// which exposes `window.PDFLib` with the exact same API.

/**
 * A single user-picked attachment held only in local component state.
 * We intentionally do NOT persist these to the backend — they are merged
 * into the outgoing PDF at share time, then discarded with the form state.
 */
export type AttachmentT = {
  id: string;
  name: string;
  uri: string;            // native file://, cache path, or data:/blob: URI on web
  mime: string;           // application/pdf, image/jpeg, image/png, ...
  size?: number;
};

const PDF_LIB_CDN_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

let pdfLibWebPromise: Promise<any> | null = null;

// Loads pdf-lib's UMD build as a plain <script> tag on web, so Metro never sees
// (and never breaks on) the package. Cached so repeated merges don't re-fetch it.
function loadPdfLibWeb(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window yok'));
  const w = window as any;
  if (w.PDFLib) return Promise.resolve(w.PDFLib);
  if (pdfLibWebPromise) return pdfLibWebPromise;

  pdfLibWebPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdf-lib-cdn]') as HTMLScriptElement | null;
    const onReady = () => {
      if (w.PDFLib) resolve(w.PDFLib);
      else reject(new Error('pdf-lib yüklenemedi'));
    };
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => reject(new Error('pdf-lib script hatası')));
      if (w.PDFLib) onReady();
      return;
    }
    const script = document.createElement('script');
    script.src = PDF_LIB_CDN_URL;
    script.async = true;
    script.setAttribute('data-pdf-lib-cdn', 'true');
    script.onload = onReady;
    script.onerror = () => reject(new Error('pdf-lib script hatası'));
    document.head.appendChild(script);
  });
  return pdfLibWebPromise;
}

const b64ToBytes = (b64: string): Uint8Array => {
  const bin =
    typeof atob !== 'undefined'
      ? atob(b64)
      : // Node/RN fallback — extremely unlikely on user devices.
        (globalThis as any).Buffer?.from(b64, 'base64').toString('binary') || '';
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa !== 'undefined') {
    // Chunked to avoid "Maximum call stack" on large PDFs.
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
    }
    return btoa(s);
  }
  return (globalThis as any).Buffer?.from(bytes).toString('base64') || '';
};

async function readAsBase64(uri: string): Promise<string> {
  if (!uri) return '';
  if (uri.startsWith('data:')) return uri.split(',')[1] || '';
  if (Platform.OS === 'web' && (uri.startsWith('blob:') || uri.startsWith('http'))) {
    // expo-document-picker / expo-print on web return blob: (or occasionally http) URIs.
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    return bytesToBase64(new Uint8Array(buf));
  }
  return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Merge attached PDFs and images at the end of the base PDF.
 * - PDFs: all pages appended verbatim.
 * - Images (jpg/png): one A4 page per image, letterboxed and centred.
 * - Unsupported types (e.g. .docx): silently skipped.
 *
 * If the merge fails or `attachments` is empty, `basePdfUri` is returned unchanged.
 * Works on both native (iOS/Android, via the npm `pdf-lib` package) and web
 * (via a CDN-loaded `pdf-lib` UMD bundle).
 */
export async function mergeAttachmentsIntoPdf(
  basePdfUri: string,
  attachments: AttachmentT[],
): Promise<string> {
  if (!attachments || attachments.length === 0) return basePdfUri;

  let PDFDocument: any;
  try {
    if (Platform.OS === 'web') {
      const PDFLib = await loadPdfLibWeb();
      PDFDocument = PDFLib.PDFDocument;
    } else {
      // Lazy-require so the web bundle never resolves pdf-lib via Metro.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ PDFDocument } = require('pdf-lib') as typeof import('pdf-lib'));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[pdf-merge] pdf-lib yüklenemedi, ekler olmadan devam ediliyor', e);
    return basePdfUri;
  }

  try {
    const baseB64 = await readAsBase64(basePdfUri);
    if (!baseB64) return basePdfUri;
    const base = await PDFDocument.load(b64ToBytes(baseB64));

    for (const att of attachments) {
      try {
        const mime = (att.mime || '').toLowerCase();
        const b64 = await readAsBase64(att.uri);
        if (!b64) continue;
        const bytes = b64ToBytes(b64);

        if (mime === 'application/pdf' || att.name.toLowerCase().endsWith('.pdf')) {
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await base.copyPages(doc, doc.getPageIndices());
          pages.forEach((p: any) => base.addPage(p));
        } else if (mime.startsWith('image/') || /\.(png|jpe?g)$/i.test(att.name)) {
          const isPng = mime.includes('png') || /\.png$/i.test(att.name);
          const img = isPng ? await base.embedPng(bytes) : await base.embedJpg(bytes);
          // A4 in points at 72 DPI
          const PAGE_W = 595;
          const PAGE_H = 842;
          const page = base.addPage([PAGE_W, PAGE_H]);
          const scale = Math.min(PAGE_W / img.width, PAGE_H / img.height) * 0.92;
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, {
            x: (PAGE_W - w) / 2,
            y: (PAGE_H - h) / 2,
            width: w,
            height: h,
          });
        }
        // Word / other types are intentionally skipped.
      } catch (e) {
        // Skip individual failures — a bad attachment shouldn't nuke the whole share.
        // eslint-disable-next-line no-console
        console.warn('[pdf-merge] skipped attachment', att.name, e);
      }
    }

    const merged = await base.save();
    const outB64 = bytesToBase64(merged);

    if (Platform.OS === 'web') {
      // File writes are unreliable on web — return a data URI so callers can open/download it.
      return `data:application/pdf;base64,${outB64}`;
    }
    const dir = FileSystem.cacheDirectory || '';
    const outUri = `${dir}teklif-merged-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(outUri, outB64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outUri;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[pdf-merge] fatal, returning base pdf', e);
    return basePdfUri;
  }
}

// Web-only PDF generation.
//
// expo-print's `printToFileAsync` on web is literally `window.print()` — it
// ignores the html we pass in and opens the browser's native print dialog
// for whatever page is currently on screen. That means on web, the "PDF"
// flow never produced a real file: no download, no attachment merging, and
// (if the user manually saved from that dialog) a washed-out result with
// no background colors and a browser-added URL/date header/footer.
//
// This module replaces that path on web only: it renders the exact same
// HTML produced by buildQuotePdfHtml() into a real multi-page A4 PDF Blob,
// client-side, with no dialog and no user interaction — using jsPDF +
// html2canvas loaded from CDN (same pattern as pdf-lib in pdf-merge.ts, to
// avoid Metro trying to bundle them for web).

const JSPDF_CDN = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js';
const HTML2CANVAS_CDN = 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js';

// Bir CDN betiği hiç 'load' ya da 'error' tetiklemezse (zayıf/kararsız
// internet, kurumsal güvenlik duvarı, isteğin sessizce askıda kalması) bu
// promise sonsuza kadar bekler -- WhatsApp/PDF paylaşım butonlarının hiçbir
// hata göstermeden "ekranda takılıp kalması" tam olarak buydu. Sabit bir
// zaman aşımıyla bu bekleyişi kesin bir hataya çeviriyoruz ki çağıran taraf
// (doWhatsApp/doShare) her zaman bir toast gösterip kullanıcıyı bilgilendirsin.
const SCRIPT_LOAD_TIMEOUT_MS = 15000;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      finish(() => reject(new Error('İnternet bağlantınız zayıf olabilir, PDF kütüphanesi yüklenemedi.')));
    }, SCRIPT_LOAD_TIMEOUT_MS);

    const existing = document.querySelector(`script[data-src="${src}"]`) as any;
    if (existing) {
      if (existing._loaded) return finish(resolve);
      existing.addEventListener('load', () => finish(resolve));
      existing.addEventListener('error', () => finish(() => reject(new Error('Betik yüklenemedi: ' + src))));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-src', src);
    s.onload = () => { (s as any)._loaded = true; finish(resolve); };
    s.onerror = () => finish(() => reject(new Error('Betik yüklenemedi: ' + src)));
    document.body.appendChild(s);
  });
}

let libsPromise: Promise<{ jsPDF: any; html2canvas: any }> | null = null;
function loadLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      await Promise.all([loadScript(JSPDF_CDN), loadScript(HTML2CANVAS_CDN)]);
      const w = window as any;
      if (!w.jspdf?.jsPDF || !w.html2canvas) throw new Error('PDF kütüphaneleri yüklenemedi');
      return { jsPDF: w.jspdf.jsPDF, html2canvas: w.html2canvas };
    })();
  }
  return libsPromise;
}

const PAGE_PX_WIDTH = 794; // ~A4 width at 96dpi, matches the @page A4 sizing in buildQuotePdfHtml's CSS

// Renders a full HTML document string (as returned by buildQuotePdfHtml) into
// a real, downloadable, multi-page A4 PDF and returns it as a Blob.
export async function htmlToPdfBlobWeb(html: string): Promise<Blob> {
  const { jsPDF, html2canvas } = await loadLibs();

  // Render in a hidden same-origin iframe so the document's own <style> block
  // (colors, fonts, layout) applies exactly as authored, isolated from the
  // live app's DOM/CSS.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${PAGE_PX_WIDTH}px`;
  iframe.style.height = '10px';
  iframe.style.border = '0';
  iframe.style.background = '#fff';
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('İçerik oluşturulamadı (zaman aşımı)')), SCRIPT_LOAD_TIMEOUT_MS);
      iframe.onload = () => { clearTimeout(timer); resolve(); };
      iframe.onerror = () => { clearTimeout(timer); reject(new Error('İçerik oluşturulamadı')); };
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) throw new Error('PDF içeriği oluşturulamadı');

    // Let images (logo) and web fonts settle, then size the iframe to the
    // full rendered content height. Templates @import Montserrat from Google
    // Fonts -- a real network fetch, not something a fixed short timeout
    // reliably covers. `document.fonts.ready` only resolves once every font
    // the page *requested* has settled, but a font is only "requested" once
    // the browser lays out text that needs it -- so explicitly `.load()`
    // each weight the templates actually use first. That fires the fetch
    // immediately (rather than waiting on layout to discover it's needed)
    // and gives a much more reliable, generous window for it to land before
    // html2canvas takes its snapshot; every PDF renders in a brand-new
    // throwaway iframe with no warm font cache, so this really does need to
    // be a real network round trip every single time, not just a formality.
    const fontSet: any = (doc as any).fonts;
    if (fontSet) {
      const weights = [400, 500, 600, 700, 800, 900];
      try {
        await Promise.all(weights.map((w) => fontSet.load(`${w} 16px Montserrat`).catch(() => {})));
      } catch {}
      await Promise.race([fontSet.ready, new Promise((r) => setTimeout(r, 4000))]);
    }
    await new Promise((r) => setTimeout(r, 150));
    const totalHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 100);
    iframe.style.height = `${totalHeight}px`;
    await new Promise((r) => setTimeout(r, 60));

    // Capture the website credit link's position (in CSS px, relative to
    // the iframe body -- there's no scrolling since the iframe is sized to
    // fit the full content) *before* rasterizing, so we can lay a real
    // clickable jsPDF link annotation over the flattened image afterwards.
    // html2canvas only produces pixels; without this the "www.anindateklif.co"
    // text would just be inert text baked into the page image.
    const creditEl = doc.getElementById('app-credit-link');
    const creditRectCss = creditEl ? creditEl.getBoundingClientRect() : null;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: PAGE_PX_WIDTH,
      height: totalHeight,
      windowWidth: PAGE_PX_WIDTH,
      windowHeight: totalHeight,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const pxScale = canvas.width / PAGE_PX_WIDTH; // canvas px per CSS px (html2canvas scale)
    const ptPerCss = pageWidthPt / PAGE_PX_WIDTH;
    // Devam sayfalarının üstünde ve her sayfanın altında kenar boşluğu --
    // önceden içerik kağıdın kenarına kadar dayanıyordu.
    const MARGIN_PT = 28; // ~10mm

    const srcCtx = canvas.getContext('2d')!;
    let bgRef: Uint8ClampedArray | null = null;
    try { bgRef = srcCtx.getImageData(4, 4, 1, 1).data; } catch {}

    const rowIsBackground = (y: number): boolean => {
      if (!bgRef || y < 0 || y >= canvas.height) return false;
      const row = srcCtx.getImageData(0, y, canvas.width, 1).data;
      const tol = 12;
      const step = 16; // sample every 4th pixel (4 bytes/px) — plenty dense, keeps it fast
      let samples = 0;
      let mismatches = 0;
      for (let i = 0; i < row.length; i += step) {
        samples++;
        if (
          Math.abs(row[i] - bgRef[0]) > tol ||
          Math.abs(row[i + 1] - bgRef[1]) > tol ||
          Math.abs(row[i + 2] - bgRef[2]) > tol
        ) {
          mismatches++;
          if (mismatches / samples > 0.03) return false; // clearly not blank — bail early
        }
      }
      return samples > 0;
    };

    // Trim any trailing blank rows at the very bottom of the full canvas
    // first, so a document that fits on one page doesn't get an extra,
    // essentially empty page for a 1-2px overflow.
    let effectiveHeight = canvas.height;
    if (bgRef) {
      while (effectiveHeight > 1 && rowIsBackground(effectiveHeight - 1)) effectiveHeight--;
    }
    const effectiveCss = effectiveHeight / pxScale;

    // Sayfa sonları DOM'a göre seçilir: bölünmemesi gereken her öğenin
    // (tablo satırı, görsel, metin satırı/kutusu, toplam satırı) dikey aralığı
    // toplanır; kesim yalnız hiçbir öğenin ortasına denk gelmeyen bir y'de
    // yapılır. Eski yöntem boş piksel satırı arıyordu; tablo kenarlıkları ve
    // satır zeminleri yüzünden tabloda boş satır bulamayıp satırları ortadan
    // kesiyordu.
    const win = iframe.contentWindow!;
    const atoms: [number, number][] = [];
    const forcedBreaks: number[] = [];
    const tables: { top: number; headTop: number; headBottom: number; bottom: number }[] = [];
    const isInline = (el: Element) => (win.getComputedStyle(el).display || '').startsWith('inline');
    doc.body.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      const cs = win.getComputedStyle(el);
      const bb = cs.breakBefore || (cs as any).pageBreakBefore;
      if ((bb === 'page' || bb === 'always') && r.top > 1) forcedBreaks.push(r.top);
      const avoid = cs.breakInside === 'avoid' || (cs as any).pageBreakInside === 'avoid';
      const atomic = tag === 'TR' || tag === 'IMG' || tag === 'svg' || tag === 'CANVAS' || avoid
        || (tag !== 'TABLE' && tag !== 'TBODY' && tag !== 'THEAD' && (el.childElementCount === 0 || Array.from(el.children).every(isInline)));
      if (atomic && r.height < 1000) atoms.push([r.top, r.bottom]);
      if (tag === 'TABLE') {
        const head = (el as HTMLTableElement).tHead;
        const hr = head ? head.getBoundingClientRect() : null;
        if (hr && hr.height > 0 && hr.height < 120) {
          tables.push({ top: r.top, headTop: hr.top, headBottom: hr.bottom, bottom: r.bottom });
          // Başlık sayfa dibinde tek başına kalmasın: başlık + ilk satır bölünmez.
          const firstRow = (el as HTMLTableElement).tBodies[0]?.rows[0];
          if (firstRow) atoms.push([hr.top, firstRow.getBoundingClientRect().bottom]);
        }
      }
    });
    forcedBreaks.sort((a, b) => a - b);
    const isSafeCss = (y: number) => !atoms.some(([t, b]) => t < y - 0.5 && b > y + 0.5);

    // naiveEnd'den geriye, sayfanın en fazla %45'i kadar, güvenli bir kesim
    // noktası ara; DOM'da bulunamazsa boş piksel satırına, o da yoksa düz
    // kesime düş (tek başına bir sayfadan uzun bir blok -- yapacak bir şey yok).
    const findSafeCutCss = (start: number, naiveEnd: number, pageCss: number): number => {
      if (naiveEnd >= effectiveCss) return effectiveCss;
      const minY = Math.max(start + 20, naiveEnd - pageCss * 0.45);
      for (let y = Math.floor(naiveEnd); y > minY; y--) if (isSafeCss(y)) return y;
      for (let y = Math.floor(naiveEnd * pxScale); y > minY * pxScale; y--) if (rowIsBackground(y)) return y / pxScale;
      return naiveEnd;
    };

    const slice = (fromCss: number, toCss: number) => {
      const y0 = Math.round(fromCss * pxScale);
      const h = Math.max(1, Math.round(toCss * pxScale) - y0);
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
      return { data: c.toDataURL('image/jpeg', 0.95), heightPt: (h * pageWidthPt) / canvas.width };
    };

    let renderedCss = 0;
    let pageIndex = 0;
    while (renderedCss < effectiveCss - 0.5) {
      const topPad = pageIndex > 0 ? MARGIN_PT : 0;
      // Kesim bir tablonun ortasına düştüyse yeni sayfada tablo başlığını tekrarla.
      const tbl = pageIndex > 0 ? tables.find((x) => renderedCss >= x.headBottom - 0.5 && renderedCss < x.bottom - 1) : undefined;
      const headerPt = tbl ? (tbl.headBottom - tbl.headTop) * ptPerCss : 0;
      const pageCss = (pageHeightPt - topPad - MARGIN_PT - headerPt) / ptPerCss;
      const naiveEnd = Math.min(renderedCss + pageCss, effectiveCss);
      const forced = forcedBreaks.find((f) => f > renderedCss + 1 && f < naiveEnd);
      const cutCss = forced != null ? forced : findSafeCutCss(renderedCss, naiveEnd, pageCss);

      if (pageIndex > 0) pdf.addPage();
      if (bgRef && (bgRef[0] < 250 || bgRef[1] < 250 || bgRef[2] < 250)) {
        // Şablonun kendi zemin rengini (Modern/Minimal krem) kenar
        // boşlukları dahil tüm sayfaya yay.
        pdf.setFillColor(bgRef[0], bgRef[1], bgRef[2]);
        pdf.rect(0, 0, pageWidthPt, pageHeightPt, 'F');
      }
      if (tbl) {
        const head = slice(tbl.headTop, tbl.headBottom);
        pdf.addImage(head.data, 'JPEG', 0, topPad, pageWidthPt, head.heightPt);
      }
      const body = slice(renderedCss, cutCss);
      const bodyTop = topPad + headerPt;
      pdf.addImage(body.data, 'JPEG', 0, bodyTop, pageWidthPt, body.heightPt);

      // If the website credit line's vertical center lands on this page,
      // overlay an invisible clickable link at its exact rasterized
      // position so tapping "www.anindateklif.co" in the final PDF opens
      // the site, even though the text itself is just pixels in the image.
      if (creditRectCss) {
        const centerY = creditRectCss.top + creditRectCss.height / 2;
        if (centerY >= renderedCss && centerY < cutCss) {
          const pad = 2;
          pdf.link(
            Math.max(0, creditRectCss.left * ptPerCss - pad),
            Math.max(0, bodyTop + (creditRectCss.top - renderedCss) * ptPerCss - pad),
            creditRectCss.width * ptPerCss + pad * 2,
            creditRectCss.height * ptPerCss + pad * 2,
            { url: 'https://www.anindateklif.co' }
          );
        }
      }

      renderedCss = Math.max(cutCss, renderedCss + 1);
      pageIndex += 1;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(iframe);
  }
}

// Convenience: render html -> Blob -> object URL (blob: URI), ready to hand
// to mergeAttachmentsIntoPdf / downloadFileWeb / shareQuoteViaWhatsApp, all
// of which already understand blob: URIs on web.
export async function htmlToPdfObjectUrlWeb(html: string): Promise<string> {
  const blob = await htmlToPdfBlobWeb(html);
  return URL.createObjectURL(blob);
}

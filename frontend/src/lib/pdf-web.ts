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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`) as any;
    if (existing) {
      if (existing._loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Betik yüklenemedi: ' + src)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-src', src);
    s.onload = () => { (s as any)._loaded = true; resolve(); };
    s.onerror = () => reject(new Error('Betik yüklenemedi: ' + src));
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
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('İçerik oluşturulamadı'));
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

    // html2canvas scale:2 above means canvas pixels = CSS px * 2.
    const creditRectCanvas = creditRectCss
      ? {
          left: creditRectCss.left * 2,
          top: creditRectCss.top * 2,
          width: creditRectCss.width * 2,
          height: creditRectCss.height * 2,
        }
      : null;

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const pxPerPage = Math.floor((pageHeightPt * canvas.width) / pageWidthPt);

    // Naive fixed-height slicing cuts straight through whatever happens to sit
    // at the page boundary — a table row, a line of text — right down the
    // middle. To avoid that we snap each cut up to a nearby "blank" row (a
    // strip that's uniformly the page's own background color, i.e. an actual
    // gap between rows/paragraphs) instead of the exact naive pixel line.
    // Sampled against the ACTUAL rendered background (read from a corner
    // that's always inside the sheet's own padding, so this works for every
    // template regardless of its background color) rather than a hardcoded
    // white, and bounded to a search window near each boundary so it stays
    // fast even on long multi-page documents.
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
    // first. Without this, a document whose real content fits on exactly
    // one page but whose scrollHeight ends up 1-2px taller than the page
    // (a stray margin, a sub-pixel rounding in the DOM) would still trigger
    // one more iteration of the loop below purely to render that sliver —
    // producing an unwanted, essentially empty extra page.
    let effectiveHeight = canvas.height;
    if (bgRef) {
      while (effectiveHeight > 1 && rowIsBackground(effectiveHeight - 1)) effectiveHeight--;
    }

    // Search backward from the naive boundary for the nearest safe (blank) row,
    // within a bounded window. Falls back to the naive cut if nothing is found
    // (e.g. a single block taller than one full page — can't be helped).
    const findSafeCut = (naiveEnd: number): number => {
      if (naiveEnd >= effectiveHeight) return naiveEnd;
      const maxBack = Math.floor(pxPerPage * 0.25);
      for (let y = naiveEnd; y > naiveEnd - maxBack && y > 0; y--) {
        if (rowIsBackground(y)) return y;
      }
      return naiveEnd;
    };

    let renderedPx = 0;
    let pageIndex = 0;
    while (renderedPx < effectiveHeight) {
      const naiveEnd = Math.min(renderedPx + pxPerPage, effectiveHeight);
      const cutY = findSafeCut(naiveEnd);
      const sliceHeight = Math.max(1, cutY - renderedPx);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      const pageImgHeightPt = (sliceHeight * pageWidthPt) / canvas.width;

      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(pageImgData, 'JPEG', 0, 0, pageWidthPt, pageImgHeightPt);

      // When a page's content is shorter than a full A4 page (typically the
      // last page, once the "safe cut" search above has trimmed it to the
      // last full paragraph), the image above only covers the top part of
      // the page -- jsPDF leaves the rest of that physical page plain white
      // by default. That produced a visible white gap under the content on
      // templates whose own background isn't white (Modern/Minimal's cream
      // tone), as if the page were cut off early. Filling the leftover strip
      // with the document's own sampled background color extends that color
      // all the way to the true page edge instead.
      if (bgRef && pageImgHeightPt < pageHeightPt - 0.5) {
        pdf.setFillColor(bgRef[0], bgRef[1], bgRef[2]);
        pdf.rect(0, pageImgHeightPt, pageWidthPt, pageHeightPt - pageImgHeightPt + 1, 'F');
      }

      // If the website credit line's vertical center lands on this page,
      // overlay an invisible clickable link at its exact rasterized
      // position so tapping "www.anindateklif.co" in the final PDF opens
      // the site, even though the text itself is just pixels in the image.
      if (creditRectCanvas) {
        const centerY = creditRectCanvas.top + creditRectCanvas.height / 2;
        if (centerY >= renderedPx && centerY < cutY) {
          const scale = pageWidthPt / canvas.width;
          const pad = 2;
          pdf.link(
            Math.max(0, creditRectCanvas.left * scale - pad),
            Math.max(0, (creditRectCanvas.top - renderedPx) * scale - pad),
            creditRectCanvas.width * scale + pad * 2,
            creditRectCanvas.height * scale + pad * 2,
            { url: 'https://www.anindateklif.co' }
          );
        }
      }

      renderedPx += sliceHeight;
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

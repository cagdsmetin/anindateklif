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
    // full rendered content height.
    await new Promise((r) => setTimeout(r, 200));
    const totalHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 100);
    iframe.style.height = `${totalHeight}px`;
    await new Promise((r) => setTimeout(r, 60));

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
    const pxPerPage = Math.floor((pageHeightPt * canvas.width) / pageWidthPt);

    let renderedPx = 0;
    let pageIndex = 0;
    while (renderedPx < canvas.height) {
      const sliceHeight = Math.min(pxPerPage, canvas.height - renderedPx);
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

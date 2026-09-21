// Web-only helper: forces the browser to download a blob:/data:/http(s) URI as a
// real file with a chosen filename, instead of just navigating to it (which many
// browsers render inline or ignore for large data: URIs).
//
// Used because expo-sharing's Sharing.isAvailableAsync() is ALWAYS false on web —
// screens must fall back to a manual download rather than silently doing nothing.

// Object URLs we minted here, kept alive until the page itself goes away.
//
// They used to be revoked on a 4-second timer, which is where the full-page
// "Safari sayfayı açamıyor — WebKitBlobResource hatası 1" came from: iOS Safari
// treats `<a download>` on a blob: URL as a navigation, and for a PDF it first
// asks the person to confirm the download. Tapping through that prompt takes
// longer than four seconds, so by the time Safari actually went to fetch the
// blob we had already thrown it away and it had nothing to load. A blob URL is
// just a pointer into memory the page already holds — letting it live until
// pagehide costs nothing extra and removes the race entirely.
const pendingUrls = new Set<string>();
let unloadHooked = false;

function keepAliveUntilPageHide(url: string) {
  pendingUrls.add(url);
  if (!unloadHooked) {
    unloadHooked = true;
    const flush = () => {
      pendingUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      pendingUrls.clear();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }
}

export async function downloadFileWeb(uri: string, fileName: string): Promise<void> {
  if (!uri) throw new Error('İndirilecek dosya yok');

  let blobUrl = uri;

  try {
    // data:/blob:/http(s): all work with fetch() in the browser.
    const res = await fetch(uri);
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
    keepAliveUntilPageHide(blobUrl);
  } catch {
    // Fall back to the raw uri (e.g. if fetch is blocked for some odd scheme) —
    // the browser will still try to navigate/download it below.
    blobUrl = uri;
  }

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName || 'teklif.pdf';
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

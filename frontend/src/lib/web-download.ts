// Web-only helper: forces the browser to download a blob:/data:/http(s) URI as a
// real file with a chosen filename, instead of just navigating to it (which many
// browsers render inline or ignore for large data: URIs).
//
// Used because expo-sharing's Sharing.isAvailableAsync() is ALWAYS false on web —
// screens must fall back to a manual download rather than silently doing nothing.
export async function downloadFileWeb(uri: string, fileName: string): Promise<void> {
  if (!uri) throw new Error('İndirilecek dosya yok');

  let blobUrl = uri;
  let createdObjectUrl = false;

  try {
    // data:/blob:/http(s): all work with fetch() in the browser.
    const res = await fetch(uri);
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
    createdObjectUrl = true;
  } catch {
    // Fall back to the raw uri (e.g. if fetch is blocked for some odd scheme) —
    // the browser will still try to navigate/download it below.
    blobUrl = uri;
  }

  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'teklif.pdf';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    if (createdObjectUrl) {
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 4000);
    }
  }
}

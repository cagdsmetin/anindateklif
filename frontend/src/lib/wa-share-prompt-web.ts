// Web-only: the small sheet that owns the FINAL tap of a WhatsApp share.
//
// WHY THIS EXISTS (the "bazen gönderiyor bazen göndermiyor" bug)
// --------------------------------------------------------------
// `navigator.share()` may only run while the document still holds *transient
// user activation* — i.e. inside a real user gesture, and only for a second or
// two after it. Our share flow can't satisfy that on its own: between the tap
// and the share call we render the PDF (jsPDF + html2canvas, plus a first-time
// CDN fetch), merge attachments, and read the blob back. On a fast phone with
// warm caches that finishes inside the activation window and WhatsApp opens;
// on a slower one — or the first time, or on mobile data — it doesn't, and iOS
// Safari rejects the call with NotAllowedError. Same code, same button, two
// different outcomes: exactly the intermittent failure people reported.
//
// No amount of reordering fixes that, because the PDF genuinely has to be built
// first. So we split the flow in two: do all the slow work up front, then hand
// the finished file to this sheet, whose button click is a brand-new gesture.
// `navigator.share()` is the first statement in that handler — nothing is
// awaited before it — so the activation is always fresh and the share sheet
// always opens.
//
// Raw DOM on purpose: this needs a genuine DOM click event, dispatched straight
// from the browser, with no React/Pressability scheduling in between that could
// push the call into a later task and lose the activation. Same reasoning (and
// the same file-naming convention) as web-download.ts and pdf-web.ts.

import { downloadFileWeb } from './web-download';

export type WaSharePromptResult = {
  action: 'shared' | 'downloaded' | 'chat-opened' | 'cancelled';
};

const COLORS = {
  wa: '#25D366',
  waDark: '#1EA855',
  text: '#0F172A',
  textDark: '#F1F5F9',
  muted: '#64748B',
  mutedDark: '#94A3B8',
  card: '#FFFFFF',
  cardDark: '#1E293B',
  border: '#E2E8F0',
  borderDark: '#334155',
};

function prefersDark(): boolean {
  try { return !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
  catch { return false; }
}

// Dismissing the iOS share sheet normally surfaces as AbortError, but some
// Safari versions report that same cancellation as a NotAllowedError whose
// message still says so — which we must not confuse with the activation
// NotAllowedError this whole module exists to avoid.
function isAbort(e: any): boolean {
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  return e.name === 'NotAllowedError' && /abort|cancel/i.test(e.message || '');
}

/**
 * Show the "hazır, göndermek için dokunun" sheet and resolve once the person
 * has picked one of the options (or backed out).
 *
 * @param file     the finished PDF, already built — nothing may be awaited
 *                 between the button click and navigator.share().
 * @param message  the WhatsApp message text to travel with the file.
 * @param pdfUri   blob:/data: URI of the same PDF, for the "indir" fallback.
 * @param waUrl    wa.me link (pre-filled chat) for the text-only fallback.
 */
export function promptWhatsAppShareWeb(opts: {
  file: File;
  message: string;
  fileName: string;
  pdfUri: string;
  waUrl: string;
}): Promise<WaSharePromptResult> {
  const { file, message, fileName, pdfUri, waUrl } = opts;
  const dark = prefersDark();

  return new Promise<WaSharePromptResult>((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'wa-share-prompt');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(15,23,42,0.55)',
      // iOS Safari's bottom toolbar overlaps `100vh`; the dynamic viewport unit
      // keeps the sheet's buttons reachable instead of tucked under it.
      height: '100dvh',
      font: '15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitTapHighlightColor: 'transparent',
    } as any);

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '100%', maxWidth: '440px',
      background: dark ? COLORS.cardDark : COLORS.card,
      color: dark ? COLORS.textDark : COLORS.text,
      borderRadius: '20px 20px 0 0',
      padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
      boxShadow: '0 -8px 40px rgba(15,23,42,0.28)',
      boxSizing: 'border-box',
    } as any);

    const title = document.createElement('div');
    title.textContent = 'Teklif hazır';
    Object.assign(title.style, { fontSize: '18px', fontWeight: '700', marginBottom: '6px' } as any);

    const sub = document.createElement('div');
    sub.textContent = `${fileName} — WhatsApp'a göndermek için aşağıdaki düğmeye dokunun.`;
    Object.assign(sub.style, {
      fontSize: '13.5px', color: dark ? COLORS.mutedDark : COLORS.muted,
      marginBottom: '18px', wordBreak: 'break-word',
    } as any);

    const err = document.createElement('div');
    Object.assign(err.style, {
      display: 'none', fontSize: '13px', color: '#DC2626',
      background: dark ? 'rgba(220,38,38,0.12)' : '#FEF2F2',
      border: '1px solid rgba(220,38,38,0.35)', borderRadius: '10px',
      padding: '10px 12px', marginBottom: '14px',
    } as any);

    const mkBtn = (label: string, kind: 'primary' | 'ghost' | 'link') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        width: '100%', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        borderRadius: '13px', fontWeight: '600', boxSizing: 'border-box',
        ...(kind === 'primary'
          ? { background: COLORS.wa, color: '#fff', fontSize: '16px', padding: '15px 16px', minHeight: '50px' }
          : kind === 'ghost'
          ? {
              background: 'transparent', fontSize: '14px', padding: '12px 10px', minHeight: '44px',
              color: dark ? COLORS.textDark : COLORS.text,
              border: `1px solid ${dark ? COLORS.borderDark : COLORS.border}`,
            }
          : {
              background: 'transparent', fontSize: '14px', padding: '12px', minHeight: '44px',
              color: dark ? COLORS.mutedDark : COLORS.muted, fontWeight: '500',
            }),
      } as any);
      return b;
    };

    const sendBtn = mkBtn("WhatsApp'a Gönder", 'primary');
    sendBtn.setAttribute('data-testid', 'wa-share-prompt-send');

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '10px', marginTop: '10px' } as any);
    const dlBtn = mkBtn("PDF'i İndir", 'ghost');
    const chatBtn = mkBtn('Sohbeti Aç', 'ghost');
    row.append(dlBtn, chatBtn);

    const cancelBtn = mkBtn('Vazgeç', 'link');

    card.append(title, sub, err, sendBtn, row, cancelBtn);
    overlay.append(card);

    let settled = false;
    const close = (action: WaSharePromptResult['action']) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey);
      try { overlay.remove(); } catch {}
      resolve({ action });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close('cancelled'); };
    window.addEventListener('keydown', onKey);

    const showError = (msg: string) => {
      err.textContent = msg;
      err.style.display = 'block';
      setBusy(false);
    };
    const setBusy = (busy: boolean) => {
      [sendBtn, dlBtn, chatBtn].forEach((b) => {
        b.disabled = busy;
        b.style.opacity = busy ? '0.55' : '1';
      });
      sendBtn.textContent = busy ? 'WhatsApp açılıyor...' : "WhatsApp'a Gönder";
    };

    // THE critical handler: navigator.share() is called synchronously, as the
    // very first thing this click does. Anything awaited before it would spend
    // the activation this whole module exists to preserve.
    sendBtn.addEventListener('click', () => {
      const nav: any = navigator;
      let p: Promise<void>;
      try {
        p = nav.share({ files: [file], text: message, title: fileName });
      } catch {
        showError('WhatsApp paylaşımı açılamadı. "PDF’i İndir" ile kaydedip sohbete ekleyebilirsiniz.');
        return;
      }
      setBusy(true);
      p.then(() => close('shared')).catch((e: any) => {
        if (isAbort(e)) { close('cancelled'); return; }
        showError('WhatsApp paylaşımı açılamadı. "PDF’i İndir" ile kaydedip sohbete ekleyebilirsiniz.');
      });
    });

    dlBtn.addEventListener('click', () => {
      // Fire-and-forget: the download starts inside this gesture, and closing
      // the sheet must not wait on it.
      downloadFileWeb(pdfUri, fileName).catch(() => {});
      close('downloaded');
    });

    chatBtn.addEventListener('click', () => {
      // A same-tab navigation inside the click — never popup-blocked, unlike
      // the window.open() this flow used to reach only after the PDF was done.
      try { window.location.href = waUrl; } catch {}
      close('chat-opened');
    });

    cancelBtn.addEventListener('click', () => close('cancelled'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close('cancelled'); });

    document.body.appendChild(overlay);
  });
}

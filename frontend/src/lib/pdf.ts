import type { CompanyT, QuoteT } from './api';
import { buildItemDescription } from './quote-utils';

export type PdfTemplateId = 'classic' | 'modern' | 'minimal' | 'kurumsal' | 'renkli';

const fmt = (n: number, cur: string) => {
  const parts = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${parts}`;
};

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');

// Turns a raw website value ("firma.com", "www.firma.com", "https://firma.com")
// into a safe absolute https:// href -- so the mailto:/http(s): links below
// always resolve to something clickable regardless of how the person typed
// it into the Firma sayfası.
const websiteHref = (site: string) => {
  const trimmed = String(site ?? '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

// A plain-text email/website line, but wrapped in a real <a> so the person
// reading the PDF (desktop viewer or a phone) can tap straight into a mail
// compose window or the company site instead of having to copy the text.
const contactLink = (kind: 'email' | 'web', value: string, extraStyle: string = '') => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const href = kind === 'email' ? `mailto:${v}` : websiteHref(v);
  // text-underline-offset + hafif kucultulmus font: alt cizgi yaziya
  // (ozellikle 'y','g' gibi kuyruklu harflere) degmesin, duzenli dursun.
  return `<a href="${esc(href)}" style="color:inherit;text-decoration:underline;text-underline-offset:2.5px;font-size:0.94em;${extraStyle}">${esc(v)}</a>`;
};

const trDate = (iso: string) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return iso;
};

// QR kod -- sadece qrcode paketinin saf-JS matris uretici cekirdegini
// (qrcode/lib/core) kullanir; paketin ust seviye index'i (server.js) Node
// 'fs'/canvas API'lerine bagli oldugu icin React Native (mobil) tarafinda
// bundle edilemez -- core/qrcode.js ise yalnizca kendi ic modullerine
// (+ saf JS olan dijkstrajs) bagli, bu yuzden hem web hem native PDF
// olusturmada calisir. QR, matrisi kendimiz SVG <rect>'lere cizerek
// olusturuyoruz; hicbir async/network cagrisi yok, tamamen senkron.
const QrCore = require('qrcode/lib/core/qrcode.js') as {
  create: (data: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }) => {
    modules: { size: number; get: (row: number, col: number) => number };
  };
};

function buildQrSvg(text: string, sizePx: number): string {
  try {
    // 'L' (en dusuk hata duzeltme) bilerek secildi -- icerik uzun oldugu icin
    // 'M'/'Q' modul sayisini ciddi artirip 62-90px'lik kucuk baski alaninda
    // taranamaz hale getiriyordu; 'L' + kisa/oz metin, telefon kamerasiyla
    // rahat okunacak yogunlukta bir kare uretiyor.
    const qr = QrCore.create(text, { errorCorrectionLevel: 'L' });
    const modules = qr.modules;
    const count = modules.size;
    const quiet = 2; // QR standardinin onerdigi "sessiz bolge" kadar bosluk
    const total = count + quiet * 2;
    const cell = sizePx / total;
    let rects = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (modules.get(row, col)) {
          const x = ((col + quiet) * cell).toFixed(2);
          const y = ((row + quiet) * cell).toFixed(2);
          rects += `<rect x="${x}" y="${y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" shape-rendering="crispEdges"><rect width="${sizePx}" height="${sizePx}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`;
  } catch {
    return '';
  }
}

// QR icerigi -- teklifi veren firma + teklifi alan musteri bilgilerinin ozet
// metni (URL degil, duz metin -- taranınca telefonda kart gibi okunur).
function buildQuoteQrText(company: CompanyT, quote: QuoteT): string {
  // Bilerek kisa tutuluyor: her ek satir QR'nin modul sayisini (dolayisiyla
  // yogunlugunu) artirip kucuk baski alaninda taranmasini zorlastirir --
  // burada URL degil duz metin oldugu icin de tek onceligimiz okunabilirlik.
  const cur = quote.paraBirimi || 'USD';
  const lines: string[] = [];
  const tarihStr = quote.tarih ? `  ${trDate(quote.tarih)}` : '';
  lines.push(`TEKLIF NO: ${quote.teklifNo || ''}${tarihStr}`);
  if (company.sirketAdi) lines.push(company.sirketAdi);
  const firmaIletisim = [company.telefon, company.email].filter(Boolean).join('  ');
  if (firmaIletisim) lines.push(`Tel/E-posta: ${firmaIletisim}`);
  const musteri = [quote.musFirma, quote.musYetkili].filter(Boolean).join(' - ');
  if (musteri) lines.push(`Musteri: ${musteri}`);
  lines.push(`Toplam: ${fmt(quote.genelToplam || 0, cur)}`);
  return lines.join('\n');
}

// Dispatcher — picks one of the three visual templates. Defaults to
// 'classic' so every existing call site (quick-share from the editor,
// history re-share) keeps producing exactly the same PDF as before this
// file gained multiple templates.
export function buildQuotePdfHtml(company: CompanyT, quote: QuoteT, template: PdfTemplateId = 'classic'): string {
  if (template === 'modern') return buildModernHtml(company, quote);
  if (template === 'minimal') return buildMinimalHtml(company, quote);
  if (template === 'kurumsal') return buildKurumsalHtml(company, quote);
  if (template === 'renkli') return buildRenkliHtml(company, quote);
  return buildClassicHtml(company, quote);
}

// ============================================================================
// CLASSIC — the original letterhead-style template. Untouched.
// ============================================================================
function buildClassicHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'USD';

  const itemsHtml = (quote.items || [])
    .map((it, idx) => {
      const line = (it.adet || 0) * (it.birimFiyat || 0);
      const desc = buildItemDescription(it);
      return `
        <tr>
          <td class="c1">${idx + 1}</td>
          <td class="c2">${esc(desc)}</td>
          <td class="c3">${it.adet}</td>
          <td class="c4">${fmt(it.birimFiyat, cur)}</td>
          <td class="c5">${fmt(line, cur)}</td>
        </tr>`;
    })
    .join('');

  const logo = company.logoBase64
    ? `<img src="${esc(company.logoBase64)}" class="logo"/>`
    : `<div class="logo-fallback">${esc((company.sirketAdi || 'FIRMA').substring(0, 24))}</div>`;

  // Logonun altındaki QR -- taranınca teklifi veren firma ve teklifi alan
  // musterinin bilgilerini (URL degil, duz metin kart olarak) gosterir.
  const qrSvg = buildQrSvg(buildQuoteQrText(company, quote), 92);

  const bankRows = (company.banklar || [])
    .map(
      (b) => `
        <tr>
          <td class="bk-name">${esc(b.turu || b.banka || '-')}</td>
          <td class="bk-iban">${esc(b.iban || '-')}</td>
        </tr>`
    )
    .join('');

  const araToplamRaw = (quote.araToplam || 0) + (quote.iskontoTutar || 0);

  // Additional attachment pages (references, catalog etc.)
  const ekler = quote.ekler || [];
  const eklerHtml = ekler
    .filter((e) => (e.baslik || '').trim() || (e.icerik || '').trim())
    .map(
      (e) => `
    <div class="ek-page">
      <div class="ek-hdr">
        <div class="ek-brand">${esc(company.sirketAdi || '')}</div>
        <div class="ek-meta">Teklif No: <b>${esc(quote.teklifNo)}</b> · Sayfa Eki</div>
      </div>
      <div class="ek-title">${esc(e.baslik || 'EK')}</div>
      <div class="ek-body">${esc(e.icerik || '')}</div>
    </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @page { size: A4; margin: 10mm; }
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=block');
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  /* Kurumsal, tek tip görünüm için üç şablon da (Klasik/Modern/Minimal) aynı
     sans-serif aile üzerinden okunuyor — hem başlık/etiket metinleri hem de
     rakamlar (fiyatlar, adetler) burada devralınan tek font-family'den geliyor,
     böylece hiçbir hücre farklı bir yazı karakterinde görünmüyor. */
  body { font-family: 'Montserrat', 'Helvetica Neue', Arial, 'Segoe UI', sans-serif; margin: 0; color:#0f172a; font-size:11px; overflow-x:hidden; background:#ffffff; }
  .sheet { padding: 10mm; }

  /* HEADER — table-layout:fixed pins both columns to their declared % width
     no matter how long the company name/address/logo filename is, so long
     content wraps inside its own column instead of pushing the table wider
     than the page (the old cause of text bleeding past the right/left
     margins). A 3px navy rule + padding under the whole header turns it
     into a clean "letterhead" band, so the block reads as one deliberate
     unit even when the left (logo/company) and right (title/meta) columns
     end up different heights. */
  .hdr { width:100%; table-layout:fixed; border-collapse:collapse; border-bottom:3px solid #1E293B; padding-bottom:9px; margin-bottom:12px; }
  .hdr td { padding:0; vertical-align:top; }
  .hdr td.left-col { width:34%; padding-right:10px; }
  .hdr td.center-col { width:32%; padding:0 8px; text-align:center; vertical-align:middle; }
  .hdr td.right-col { width:34%; padding-left:10px; text-align:right; }

  /* Logo always sits first (top), company name directly under it, then the
     rest of the contact lines — left-aligned since this column now anchors
     the whole letterhead. */
  .logo { max-width:200px; max-height:150px; object-fit:contain; object-position:center; margin:0 auto; display:block; }
  .qr-wrap { margin:6px auto 0; width:92px; text-align:center; }
  .qr-wrap svg { display:block; width:92px; height:92px; }
  .qr-cap { font-size:6.5px; color:#94a3b8; letter-spacing:0.04em; margin-top:3px; }
  .logo-fallback { padding:14px 20px; border:2px solid #1E293B; font-weight:800; color:#1E293B; margin:0 auto; display:inline-block; font-size:17px; }
  .cname { font-weight:700; font-size:16.5px; color:#1E293B; margin:0 0 4px 0; line-height:1.15; word-wrap:break-word; overflow-wrap:break-word; }
  .cline { font-size:14px; color:#0f172a; line-height:1.05; margin:0; word-wrap:break-word; overflow-wrap:break-word; }

  .doc-title { margin: 0 0 10px 0; font-size:23px; font-weight:900; color:#1E293B; letter-spacing:0.04em; line-height:1.15; text-align:right; word-wrap:break-word; overflow-wrap:break-word; }
  .meta-table { border-collapse:collapse; margin:0 0 0 auto; max-width:100%; }
  .meta-table td { padding:3px 0 3px 12px; font-size:11.5px; }
  .meta-table td.k { color:#64748b; text-align:right; padding-right:8px; padding-left:0; }
  .meta-table td.v { font-weight:800; color:#0f172a; text-align:right; min-width:80px; word-wrap:break-word; overflow-wrap:break-word; }

  /* INFO BOXES */
  .info-grid { display: table; width:100%; margin-bottom:8px; border-spacing: 0 0; }
  .info-cell { display: table-cell; width:50%; vertical-align:top; }
  .info-cell:first-child { padding-right:7px; }
  .info-cell:last-child { padding-left:7px; }
  .info-box { border:1px solid #cbd5e1; border-radius:2px; overflow:hidden; }
  .info-box .hdr-cell { background:#1E293B; color:#fff; font-size:11px; font-weight:800; padding:5px 9px; letter-spacing:0.04em; }
  .info-box table { width:100%; border-collapse:collapse; }
  .info-box td { font-size:11px; padding:3.5px 9px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .info-box tr:last-child td { border-bottom:none; }
  .info-box td.k { color:#64748b; width:38%; font-weight:700; text-transform:uppercase; letter-spacing:0.02em; font-size:10px; }
  .info-box td.v { color:#0f172a; word-wrap:break-word; overflow-wrap:break-word; }

  /* ITEMS TABLE */
  .items { width:100%; border-collapse:collapse; margin-top:8px; border:1px solid #cbd5e1; }
  .items thead th { background:#1E293B; color:#fff; font-size:10.5px; font-weight:800; padding:7px 6px; text-align:center; letter-spacing:0.03em; border-right:1px solid rgba(255,255,255,0.15); }
  .items thead th:last-child { border-right:none; }
  .items thead th:nth-child(2) { text-align:left; }
  .items thead th:nth-child(4), .items thead th:nth-child(5) { text-align:right; }
  .items tbody td { font-size:11px; padding:7px 6px; border-bottom:1px solid #e2e8f0; vertical-align:middle; border-right:1px solid #e2e8f0; }
  .items tbody td:last-child { border-right:none; }
  .items .c1 { text-align:center; width:38px; }
  .items .c2 { text-align:left; line-height:1.4; word-wrap:break-word; overflow-wrap:break-word; }
  .items .c3 { text-align:center; width:58px; }
  .items .c4 { text-align:right; width:105px; white-space:nowrap; font-weight:600; }
  .items .c5 { text-align:right; width:105px; white-space:nowrap; font-weight:700; }
  .items tbody tr:nth-child(even) { background:#f8fafc; }

  /* BANNERS */
  .warn { background:#dc2626; color:#fff; text-align:center; font-size:10.5px; font-weight:800; padding:6px; }
  .app-credit { text-align:center; font-size:8.5px; color:#94a3b8; padding-top:9px; margin-top:9px; border-top:1px solid #e2e8f0; letter-spacing:0.02em; }

  /* BOTTOM GRID */
  .bottom { display:table; width:100%; margin-top:8px; }
  .bt-left { display:table-cell; width:60%; vertical-align:top; padding-right:7px; }
  .bt-right { display:table-cell; width:40%; vertical-align:top; padding-left:7px; }
  .notes-hdr { background:#1E293B; color:#fff; font-size:11px; font-weight:800; padding:6px 9px; letter-spacing:0.03em; }
  .notes-body { border:1px solid #cbd5e1; border-top:none; padding:8px; font-size:11px; line-height:1.5; color:#0f172a; min-height:44px; white-space:pre-wrap; }
  .tot-row { display:flex; justify-content:space-between; align-items:center; border:1px solid #cbd5e1; padding:6px 10px; font-size:12px; margin-bottom:4px; gap:8px; }
  .tot-row .l { color:#64748b; font-weight:600; min-width:0; }
  .tot-row .v { font-weight:700; color:#0f172a; white-space:nowrap; flex-shrink:0; }
  .tot-row.grand { background:#0f172a; color:#fff; border-color:#0f172a; font-size:13.5px; }
  .tot-row.grand .l { color:#fff; font-weight:800; letter-spacing:0.05em; }
  .tot-row.grand .v { color:#fff; font-weight:900; font-size:16px; }
  .sign-box { border:1px solid #cbd5e1; height:40px; padding:6px; font-size:11px; color:#64748b; margin-top:5px; white-space:pre-wrap; }

  /* BANK */
  .bank-title { background:#1E293B; color:#fff; font-size:11px; font-weight:800; padding:5px 9px; margin-top:8px; letter-spacing:0.03em; }
  .bank-table { width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-top:none; }
  .bank-table td { padding:4.5px 9px; font-size:11px; border-bottom:1px solid #e2e8f0; }
  .bank-table tr:last-child td { border-bottom:none; }
  .bank-table td.bk-name { color:#0f172a; width:35%; font-weight:700; }
  .bank-table td.bk-iban { color:#0f172a; letter-spacing:0.02em; }
  .bank-footer { font-size:9.5px; color:#64748b; padding:7px 0 0; }

  /* ATTACHMENTS */
  .ek-page { page-break-before: always; padding: 4mm 0 0 0; }
  .ek-hdr { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #1E293B; padding-bottom:6px; margin-bottom:12px; }
  .ek-brand { font-weight:800; font-size:12px; color:#1E293B; }
  .ek-meta { font-size:10px; color:#64748b; }
  .ek-title { font-size:15px; font-weight:900; color:#1E293B; margin-bottom:9px; letter-spacing:0.03em; text-transform:uppercase; }
  .ek-body { font-size:11px; line-height:1.55; color:#0f172a; white-space:pre-wrap; }
</style></head>
<body>
<div class="sheet">
  <!-- HEADER -->
  <table class="hdr">
    <tr>
      <td class="left-col">
        <div class="cname">${esc(company.sirketAdi || '')}</div>
        ${company.adres ? `<div class="cline">${esc(company.adres)}</div>` : ''}
        ${company.telefon ? `<div class="cline">${esc(company.telefon)}</div>` : ''}
        ${company.telefon2 ? `<div class="cline">${esc(company.telefon2)}</div>` : ''}
        ${company.email ? `<div class="cline">${contactLink('email', company.email)}</div>` : ''}
        ${company.website ? `<div class="cline">${contactLink('web', company.website)}</div>` : ''}
      </td>
      <td class="center-col">
        ${logo}
        ${qrSvg ? `<div class="qr-wrap">${qrSvg}<div class="qr-cap">TEKLİF BİLGİSİ</div></div>` : ''}
      </td>
      <td class="right-col">
        <div class="doc-title">TEKLİF FORMU</div>
        <table class="meta-table">
          <tr><td class="k">Teklif No</td><td class="v">${esc(quote.teklifNo)}</td></tr>
          <tr><td class="k">Tarih</td><td class="v">${esc(trDate(quote.tarih))}</td></tr>
          <tr><td class="k">Geçerlilik Tarihi</td><td class="v">${esc(trDate(quote.gecerlilik))}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- INFO BOXES -->
  <div class="info-grid">
    <div class="info-cell">
      <div class="info-box">
        <div class="hdr-cell">MÜŞTERİ BİLGİLERİ</div>
        <table>
          <tr><td class="k">FİRMA</td><td class="v">${esc(quote.musFirma || '-')}</td></tr>
          <tr><td class="k">MÜŞTERİ ADI</td><td class="v">${esc(quote.musYetkili || '-')}</td></tr>
          <tr><td class="k">TELEFON</td><td class="v">${esc(quote.musTelefon || '-')}</td></tr>
          <tr><td class="k">E-Mail</td><td class="v">${esc(quote.musEmail || '-')}</td></tr>
          <tr><td class="k">ADRES</td><td class="v">${esc(quote.musAdres || '-')}</td></tr>
        </table>
      </div>
    </div>
    <div class="info-cell">
      <div class="info-box">
        <div class="hdr-cell">SİPARİŞ BİLGİLERİ</div>
        <table>
          <tr><td class="k">PROJE ADI</td><td class="v">${esc(quote.projeAdi || '-')}</td></tr>
          <tr><td class="k">NAKLİYE</td><td class="v">${esc(quote.nakliye)}</td></tr>
          <tr><td class="k">PARA BİRİMİ</td><td class="v">${esc(cur)}</td></tr>
          <tr><td class="k">ÖDEME ŞEKLİ</td><td class="v">${esc(quote.odemeSekli || '-')}</td></tr>
          <tr><td class="k">MENŞEİ</td><td class="v">${esc(quote.mensei || '-')}</td></tr>
          <tr><td class="k">TESLİM</td><td class="v">${esc(quote.teslimGun || '-')}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items">
    <thead>
      <tr>
        <th>S.NO</th>
        <th>SİSTEM / HİZMET</th>
        <th>ADET</th>
        <th>BİRİM FİYAT</th>
        <th>TOPLAM FİYAT</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:14px;font-size:11px;">Kalem yok</td></tr>`}
    </tbody>
  </table>

  <div class="warn">ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR.</div>

  <!-- BOTTOM GRID -->
  <div class="bottom">
    <div class="bt-left">
      <div class="notes-hdr">ÖZEL NOTLAR &amp; SATIŞ DETAYLARI</div>
      <div class="notes-body">${esc(quote.notlar || company.ozelNotlar || '-')}</div>
    </div>
    <div class="bt-right">
      <div class="tot-row"><div class="l">ARA TOPLAM</div><div class="v">${fmt(araToplamRaw, cur)}</div></div>
      ${quote.iskonto > 0 ? `<div class="tot-row"><div class="l">İSKONTO (%${quote.iskonto})</div><div class="v" style="color:#dc2626">-${fmt(quote.iskontoTutar, cur)}</div></div>` : ''}
      ${quote.kdvOrani > 0 ? `<div class="tot-row"><div class="l">KDV (%${quote.kdvOrani})</div><div class="v">${fmt(quote.kdvTutar || 0, cur)}</div></div>` : ''}
      <div class="tot-row grand"><div class="l">GENEL TOPLAM${quote.kdvOrani > 0 ? ' (KDV DAHİL)' : ''}</div><div class="v">${fmt(quote.genelToplam || 0, cur)}</div></div>
      <div class="sign-box">Onay / İmza :${company.imzaMetni ? `\n${esc(company.imzaMetni)}` : ''}</div>
    </div>
  </div>

  <!-- BANK INFO -->
  ${bankRows ? `
  <div class="bank-title">BANKA BİLGİLERİ — ${esc(company.sirketAdi || '')}</div>
  <table class="bank-table">${bankRows}</table>
  <div class="bank-footer">Tüm banka masrafları ve transfer ücretleri alıcıya aittir.</div>
  ` : ''}

  <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.<br/><a href="https://www.anindateklif.co" id="app-credit-link" style="color:#1E293B;text-decoration:underline;text-underline-offset:2px;font-weight:700;letter-spacing:0.4px;">www.anindateklif.co</a></div>

  <!-- ATTACHMENT PAGES -->
  ${eklerHtml}
</div>
</body></html>`;
}

function buildModernHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'TL';
  const items = quote.items || [];
  const ekler = quote.ekler || [];
  const banklar = company.banklar || [];

  const v = (s?: string | number | null): string => {
    if (s === null || s === undefined) return '-';
    const str = String(s).trim();
    return str.length > 0 ? esc(str) : '-';
  };

  const monogram = ((company.sirketAdi || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase()) || '?';

  const logoSrc = company.logoBase64
    ? esc(company.logoBase64.startsWith('data:') ? company.logoBase64 : `data:image/png;base64,${company.logoBase64}`)
    : '';

  const phoneLine = [company.telefon, company.telefon2].filter(Boolean).map((p) => esc(String(p))).join('  /  ') || '-';

  const itemsRows = items.map((it, idx) => {
    const desc = buildItemDescription(it);
    const total = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
    return `<tr>
      <td class="c-idx">${idx + 1}</td>
      <td class="c-desc">${esc(desc)}</td>
      <td class="c-num">${esc(String(it.adet))}</td>
      <td class="c-num">${fmt(it.birimFiyat, cur)}</td>
      <td class="c-num c-total">${fmt(total, cur)}</td>
    </tr>`;
  }).join('');

  const showIskonto = !!quote.iskonto && quote.iskonto > 0;
  const showKdv = !!quote.kdvOrani && quote.kdvOrani > 0;
  const araToplamRaw = (quote.araToplam || 0) + (quote.iskontoTutar || 0);

  const bankSection = banklar.length > 0 ? `
    <section class="bank-card">
      <div class="bank-title">Banka Bilgileri &mdash; ${v(company.sirketAdi)}</div>
      <table class="bank">
        <tbody>
          ${banklar.map((b) => `<tr>
            <td><strong>${v(b.banka)}</strong>${b.turu ? ` <span class="bank-turu">(${v(b.turu)})</span>` : ''}</td>
            <td class="iban">${v(b.iban)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : '';

  const ekPages = ekler.map((ek) => `
    <section class="ek-page">
      <div class="ek-header">
        <span>${v(company.sirketAdi)}</span>
        <span>Teklif No: ${v(quote.teklifNo)} &middot; Sayfa Eki</span>
      </div>
      <div class="ek-title">${v(ek.baslik)}</div>
      <div class="ek-body">${esc(ek.icerik || '')}</div>
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=block');

  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Montserrat', 'Helvetica Neue', Arial, 'Segoe UI', sans-serif;
    color:#1c1c1e;
    background:#f6f4ef;
    font-size:9.5pt;
    line-height:1.45;
  }
  .sheet { padding: 14mm 13mm 16mm 13mm; } /* real padding — @page margin is ignored by html2canvas on web */

  /* Header */
  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:8px; border-bottom:2.5px solid #1c1c1e; margin-bottom:11px; }
  .company-block { flex:1; max-width:38%; }
  .company-name { font-size:16pt; font-weight:800; letter-spacing:-0.3px; margin:0 0 4px; }
  .company-meta { font-size:9.8pt; color:#6b6b6b; line-height:1.15; }
  .logo-center { flex:0 0 auto; max-width:24%; display:flex; align-items:flex-start; justify-content:center; padding:0 10px; }
  .head-right { flex:1; max-width:38%; text-align:right; display:flex; flex-direction:column; align-items:flex-end; }
  .logo-row { margin-bottom:8px; }
  .logo-img { max-width:170px; max-height:130px; object-fit:contain; object-position:center; display:block; margin:0 auto; }
  .logo-fallback { width:100px; height:100px; background:#4338ca; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:24pt; border-radius:4px; margin:0 auto; }
  .doc-tag { font-size:7.2pt; font-weight:800; letter-spacing:2px; color:#4338ca; }
  .doc-title { font-size:19pt; font-weight:800; letter-spacing:0.5px; margin-top:1px; }
  .meta-table { border-collapse:collapse; margin-top:8px; }
  .meta-table td { padding:2.5px 0 2.5px 16px; text-align:right; }
  .meta-label { display:block; color:#9a998f; text-transform:uppercase; letter-spacing:0.6px; font-size:6.8pt; }
  .meta-value { font-weight:700; font-size:9pt; }

  /* Info boxes */
  .info-row { display:flex; gap:14px; margin-bottom:9px; }
  .info-box { flex:1; background:#ffffff; border-top:3px solid #4338ca; padding:8px 12px; }
  .info-title { font-size:7.6pt; font-weight:800; letter-spacing:1.2px; color:#4338ca; margin-bottom:9px; text-transform:uppercase; }
  .info-line { display:table; width:100%; margin-bottom:3px; }
  .info-k { display:table-cell; width:36%; font-size:7.4pt; color:#9a998f; text-transform:uppercase; letter-spacing:.3px; vertical-align:top; padding:1px 0; }
  .info-v { display:table-cell; font-size:8.7pt; font-weight:600; vertical-align:top; padding:1px 0; }

  /* Items table — bordered box + column dividers so the grid reads clearly on
     print/PDF instead of relying only on the zebra-stripe row background. */
  table.items { width:100%; border-collapse:collapse; margin-bottom:10px; border:1px solid #1c1c1e; }
  table.items thead th { background:#1c1c1e; color:#fff; font-size:7.3pt; text-transform:uppercase; letter-spacing:.6px; padding:8px 9px; text-align:left; font-weight:700; border-right:1px solid rgba(255,255,255,0.18); }
  table.items thead th:last-child { border-right:none; }
  table.items thead th.num { text-align:right; }
  table.items tbody td { padding:7px 9px; border-bottom:1px solid #e4e1d8; border-right:1px solid #e4e1d8; font-size:8.8pt; vertical-align:top; }
  table.items tbody td:last-child { border-right:none; }
  table.items tbody tr:last-child td { border-bottom:none; }
  table.items tbody tr:nth-child(even) { background:#efece3; }
  td.c-idx { color:#9a998f; width:22px; font-weight:600; }
  td.c-num { text-align:right; white-space:nowrap; }
  td.c-total { font-weight:800; }

  /* Banners */
  .banner { padding:7px 12px; font-size:8pt; font-weight:700; margin-bottom:7px; border-left:3px solid; }
  .banner-warn { background:#fff1d6; color:#7a4a00; border-left-color:#c98a00; }
  .app-credit { text-align:center; font-size:7.3pt; color:#9a998f; padding-top:8px; margin-top:9px; border-top:1px solid #e4e1d8; }

  /* Bottom */
  .bottom { display:flex; gap:14px; align-items:stretch; }
  .notes-card { flex:1.5; background:#ffffff; padding:13px 15px; }
  .sub-title { font-size:7.4pt; color:#4338ca; font-weight:800; letter-spacing:.7px; text-transform:uppercase; margin-bottom:5px; }
  .sub-body { font-size:8.6pt; color:#333; margin-bottom:7px; line-height:1.55; }
  .sub-body:last-child { margin-bottom:0; }
  .sign-box { margin-top:10px; border-top:1px solid #e4e1d8; padding-top:7px; }
  .sign-label { font-size:8pt; font-weight:700; margin-bottom:16px; color:#1c1c1e; }
  .sign-line { border-top:1px solid #1c1c1e; width:62%; }

  .totals-card { flex:1; background:#1c1c1e; color:#fff; padding:12px 16px; }
  .totals-row { display:table; width:100%; margin-bottom:7px; }
  .totals-k { display:table-cell; font-size:8pt; color:#c9c8c3; }
  .totals-v { display:table-cell; text-align:right; font-size:9pt; font-weight:600; }
  .totals-div { border-top:1px solid #45443f; margin:10px 0; }
  .grand-label { font-size:7.6pt; color:#a5b4fc; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:3px; }
  .grand-value { font-size:17pt; font-weight:800; color:#fff; letter-spacing:-0.3px; }
  .kdv-note { margin-top:8px; font-size:7.4pt; color:#a09fb0; }

  /* Bank */
  .bank-card { margin-top:9px; background:#ffffff; border-top:3px solid #4338ca; padding:8px 13px; }
  .bank-title { font-size:7.6pt; font-weight:800; color:#4338ca; text-transform:uppercase; letter-spacing:.7px; margin-bottom:9px; }
  table.bank { width:100%; border-collapse:collapse; }
  table.bank td { padding:5px 6px; font-size:8.4pt; border-bottom:1px solid #eeece4; }
  .bank-turu { color:#9a998f; font-weight:400; }
  .iban { text-align:right; font-weight:600; letter-spacing:.3px; }

  /* Attachment pages */
  .ek-page { page-break-before:always; padding-top:2px; }
  .ek-header { display:flex; justify-content:space-between; border-bottom:2px solid #1c1c1e; padding-bottom:8px; margin-bottom:16px; font-size:8pt; color:#6b6b6b; }
  .ek-title { font-size:15pt; font-weight:800; color:#4338ca; margin-bottom:14px; }
  .ek-body { font-size:9pt; line-height:1.75; color:#222; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="company-block">
        <div class="company-name">${v(company.sirketAdi)}</div>
        ${(company.adres || company.telefon || company.telefon2 || company.email || company.website) ? `<div class="company-meta">
          ${company.adres ? `${esc(company.adres)}<br/>` : ''}
          ${(company.telefon || company.telefon2) ? `Tel: ${phoneLine}<br/>` : ''}
          ${(company.email || company.website) ? `${company.email ? 'E-Mail: ' + contactLink('email', company.email) : ''}${company.email && company.website ? ' &nbsp;&middot;&nbsp; ' : ''}${company.website ? contactLink('web', company.website) : ''}` : ''}
        </div>` : ''}
      </div>
      <div class="logo-center">
        ${logoSrc
          ? `<img class="logo-img" src="${logoSrc}" />`
          : `<div class="logo-fallback">${esc(monogram)}</div>`}
      </div>
      <div class="head-right">
        <div class="doc-title">TEKLİF FORMU</div>
        <table class="meta-table">
          <tr><td><span class="meta-label">Teklif No</span><span class="meta-value">${v(quote.teklifNo)}</span></td></tr>
          <tr><td><span class="meta-label">Tarih</span><span class="meta-value">${trDate(quote.tarih)}</span></td></tr>
          <tr><td><span class="meta-label">Geçerlilik Tarihi</span><span class="meta-value">${trDate(quote.gecerlilik)}</span></td></tr>
        </table>
      </div>
    </div>

    <div class="info-row">
      <div class="info-box">
        <div class="info-title">Müşteri Bilgileri</div>
        <div class="info-line"><div class="info-k">Firma</div><div class="info-v">${v(quote.musFirma)}</div></div>
        <div class="info-line"><div class="info-k">Müşteri Adı</div><div class="info-v">${v(quote.musYetkili)}</div></div>
        <div class="info-line"><div class="info-k">Telefon</div><div class="info-v">${v(quote.musTelefon)}</div></div>
        <div class="info-line"><div class="info-k">E-Mail</div><div class="info-v">${v(quote.musEmail)}</div></div>
        <div class="info-line"><div class="info-k">Adres</div><div class="info-v">${v(quote.musAdres)}</div></div>
      </div>
      <div class="info-box">
        <div class="info-title">Sipariş Bilgileri</div>
        <div class="info-line"><div class="info-k">Proje Adı</div><div class="info-v">${v(quote.projeAdi)}</div></div>
        <div class="info-line"><div class="info-k">Nakliye</div><div class="info-v">${v(quote.nakliye)}</div></div>
        <div class="info-line"><div class="info-k">Para Birimi</div><div class="info-v">${v(quote.paraBirimi)}</div></div>
        <div class="info-line"><div class="info-k">Ödeme Şekli</div><div class="info-v">${v(quote.odemeSekli)}</div></div>
        <div class="info-line"><div class="info-k">Menşei</div><div class="info-v">${v(quote.mensei)}</div></div>
        <div class="info-line"><div class="info-k">Teslim</div><div class="info-v">${v(quote.teslimGun)}</div></div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:24px;">S.No</th>
          <th>Sistem / Hizmet</th>
          <th class="num" style="width:64px;">Miktar</th>
          <th class="num" style="width:90px;">Birim Fiyat</th>
          <th class="num" style="width:100px;">Toplam Fiyat</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="banner banner-warn">ÖLÇÜ VE ÖZELLİKLERİ DİKKATLI KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR.</div>

    <div class="bottom">
      <div class="notes-card">
        <div class="sub-title">Özel Notlar</div>
        <div class="sub-body">${company.ozelNotlar ? esc(company.ozelNotlar) : '-'}</div>
        <div class="sub-title">Satış Detayları</div>
        <div class="sub-body">${quote.notlar ? esc(quote.notlar) : '-'}</div>
        <div class="sign-box">
          <div class="sign-label">${company.imzaMetni ? esc(company.imzaMetni) : 'Onay / İmza :'}</div>
          <div class="sign-line"></div>
        </div>
      </div>
      <div class="totals-card">
        <div class="totals-row"><div class="totals-k">Ara Toplam</div><div class="totals-v">${fmt(araToplamRaw, cur)}</div></div>
        ${showIskonto ? `<div class="totals-row"><div class="totals-k">İskonto (%${esc(String(quote.iskonto))})</div><div class="totals-v">- ${fmt(quote.iskontoTutar, cur)}</div></div>` : ''}
        ${showKdv ? `<div class="totals-row"><div class="totals-k">KDV (%${esc(String(quote.kdvOrani))})</div><div class="totals-v">${fmt(quote.kdvTutar, cur)}</div></div>` : ''}
        <div class="totals-div"></div>
        <div class="grand-label">Genel Toplam${showKdv ? ' (KDV Dahil)' : ''}</div>
        <div class="grand-value">${fmt(quote.genelToplam, cur)}</div>
      </div>
    </div>

    ${bankSection}
    <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.<br/><a href="https://www.anindateklif.co" id="app-credit-link" style="color:#4338ca;text-decoration:underline;text-underline-offset:2px;font-weight:700;letter-spacing:0.4px;">www.anindateklif.co</a></div>
  </div>
  ${ekPages}
</body>
</html>`;
}

function buildMinimalHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'TL';
  const items = quote.items || [];
  const ekler = quote.ekler || [];
  const banklar = company.banklar || [];

  const v = (s?: string | number | null): string => {
    if (s === null || s === undefined) return '-';
    const str = String(s).trim();
    return str.length > 0 ? esc(str) : '-';
  };

  const monogram = ((company.sirketAdi || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase()) || '?';

  const logoSrc = company.logoBase64
    ? esc(company.logoBase64.startsWith('data:') ? company.logoBase64 : `data:image/png;base64,${company.logoBase64}`)
    : '';

  const phoneLine = [company.telefon, company.telefon2].filter(Boolean).map((p) => esc(String(p))).join('  /  ') || '-';

  const itemsRows = items.map((it, idx) => {
    const desc = buildItemDescription(it);
    const total = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
    return `<tr>
      <td class="c-idx">${String(idx + 1).padStart(2, '0')}</td>
      <td class="c-desc">${esc(desc)}</td>
      <td class="c-num">${esc(String(it.adet))}</td>
      <td class="c-num">${fmt(it.birimFiyat, cur)}</td>
      <td class="c-num c-total">${fmt(total, cur)}</td>
    </tr>`;
  }).join('');

  const showIskonto = !!quote.iskonto && quote.iskonto > 0;
  const showKdv = !!quote.kdvOrani && quote.kdvOrani > 0;
  const araToplamRaw = (quote.araToplam || 0) + (quote.iskontoTutar || 0);

  const bankSection = banklar.length > 0 ? `
    <section class="bank-card">
      <div class="bank-title">Banka Bilgileri &mdash; ${v(company.sirketAdi)}</div>
      <table class="bank">
        <tbody>
          ${banklar.map((b) => `<tr>
            <td><strong>${v(b.banka)}</strong>${b.turu ? ` <span class="bank-turu">(${v(b.turu)})</span>` : ''}</td>
            <td class="iban">${v(b.iban)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : '';

  const ekPages = ekler.map((ek) => `
    <section class="ek-page">
      <div class="ek-header">
        <span>${v(company.sirketAdi)}</span>
        <span>Teklif No: ${v(quote.teklifNo)} &middot; Sayfa Eki</span>
      </div>
      <div class="ek-title">${v(ek.baslik)}</div>
      <div class="ek-body">${esc(ek.icerik || '')}</div>
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=block');

  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Montserrat', 'Helvetica Neue', Arial, sans-serif;
    color:#2b2926;
    background:#fbfaf7;
    font-size:9.5pt;
    line-height:1.6;
    padding: 18mm 16mm 20mm 16mm; /* real padding — @page margin is ignored by html2canvas on web */
  }
  .label, .sans { font-family: 'Montserrat', 'Helvetica Neue', Arial, 'Segoe UI', sans-serif; }

  /* Header */
  .top-row { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { flex:1; max-width:36%; }
  .logo-center { flex:0 0 auto; max-width:26%; display:flex; align-items:flex-start; justify-content:center; padding:0 10px; }
  .logo-row { margin-bottom:9px; }
  .logo-img { max-width:170px; max-height:130px; object-fit:contain; object-position:center; display:block; margin:0 auto; }
  .logo-fallback { width:110px; height:110px; border:1px solid #b5502e; color:#b5502e; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:27pt; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; margin:0 auto; }
  .brand-name { font-size:16pt; letter-spacing:.2px; font-weight:700; margin:0 0 4px; }
  .brand-meta { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:9.4pt; color:#8a8478; margin-top:2px; line-height:1.15; }
  .doc-id { flex:1; max-width:36%; text-align:right; }
  .doc-title { font-size:20pt; letter-spacing:3px; font-weight:400; color:#2b2926; }
  .doc-sub { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7pt; letter-spacing:1.8px; text-transform:uppercase; color:#b5502e; margin-top:3px; }
  .app-credit { text-align:center; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7pt; color:#8a8478; padding-top:8px; margin-top:9px; border-top:1px solid #e4ded2; }
  .meta-list { margin-top:10px; }
  .meta-list-row { display:table; width:230px; margin-left:auto; margin-bottom:5px; }
  .meta-list-k { display:table-cell; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:6.8pt; letter-spacing:1.1px; text-transform:uppercase; color:#8a8478; }
  .meta-list-v { display:table-cell; text-align:right; font-size:8.6pt; font-weight:700; }
  .divider { height:1px; background:#dcd6c9; margin:10px 0; }

  /* Info */
  .info-row { display:flex; gap:22px; margin-bottom:14px; }
  .info-col { flex:1; }
  .info-col-title { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:6.9pt; letter-spacing:1.6px; text-transform:uppercase; color:#b5502e; border-bottom:1px solid #2b2926; padding-bottom:7px; margin-bottom:11px; }
  .info-line { display:table; width:100%; margin-bottom:4px; }
  .info-line-k { display:table-cell; width:42%; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.1pt; text-transform:uppercase; letter-spacing:.4px; color:#8a8478; vertical-align:top; }
  .info-line-v { display:table-cell; font-size:8.8pt; vertical-align:top; }

  /* Items — bordered box + column dividers so the grid reads clearly on
     print/PDF instead of relying only on the thin row underlines. */
  table.items { width:100%; border-collapse:collapse; margin-bottom:12px; border:1px solid #2b2926; }
  table.items thead th { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:6.8pt; letter-spacing:1.2px; text-transform:uppercase; color:#8a8478; border-bottom:1px solid #2b2926; border-right:1px solid #2b2926; padding:7px 8px 9px; text-align:left; font-weight:400; }
  table.items thead th:last-child { border-right:none; }
  table.items thead th.num { text-align:right; }
  table.items tbody td { padding:8px 8px; border-bottom:1px solid #e5e0d4; border-right:1px solid #e5e0d4; font-size:9pt; vertical-align:top; }
  table.items tbody td:last-child { border-right:none; }
  table.items tbody tr:last-child td { border-bottom:none; }
  td.c-idx { font-size:13pt; color:#ddd1bd; font-weight:700; width:32px; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; }
  td.c-num { text-align:right; white-space:nowrap; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; }
  td.c-total { font-weight:700; }

  /* Banners */
  .banner { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.3pt; letter-spacing:1px; text-transform:uppercase; padding:7px 0; border-top:1px solid #2b2926; border-bottom:1px solid #2b2926; margin-bottom:8px; text-align:center; color:#5b5850; }
  .banner-warn { color:#b5502e; font-weight:700; }

  /* Bottom */
  .bottom { display:flex; gap:28px; margin-top:8px; }
  .notes-col { flex:1.4; }
  .totals-col { flex:1; }
  .sub-title { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:6.9pt; letter-spacing:1.6px; text-transform:uppercase; color:#b5502e; margin-bottom:7px; }
  .sub-body { font-size:9pt; margin-bottom:10px; line-height:1.6; }
  .sub-body:last-of-type { margin-bottom:0; }
  .sign-box { margin-top:12px; }
  .sign-label { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.4pt; text-transform:uppercase; letter-spacing:.6px; margin-bottom:18px; color:#5b5850; }
  .sign-line { border-top:1px solid #2b2926; width:72%; }

  .totals-row { display:table; width:100%; margin-bottom:6px; }
  .totals-k { display:table-cell; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.3pt; text-transform:uppercase; letter-spacing:.6px; color:#8a8478; }
  .totals-v { display:table-cell; text-align:right; font-size:9.5pt; }
  .grand-wrap { border-top:1px solid #2b2926; margin-top:8px; padding-top:8px; }
  .grand-label { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.3pt; letter-spacing:1.6px; text-transform:uppercase; color:#b5502e; }
  .grand-value { font-size:17pt; font-weight:600; letter-spacing:.3px; margin-top:3px; }
  .kdv-note { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.2pt; color:#8a8478; margin-top:9px; }

  /* Bank */
  .bank-card { margin-top:12px; padding-top:9px; border-top:1px solid #dcd6c9; }
  .bank-title { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:6.9pt; letter-spacing:1.6px; text-transform:uppercase; color:#b5502e; margin-bottom:9px; }
  table.bank { width:100%; border-collapse:collapse; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; }
  table.bank td { padding:6px 4px; font-size:8.4pt; border-bottom:1px solid #eee6d8; }
  .bank-turu { color:#8a8478; font-weight:400; }
  .iban { text-align:right; font-weight:600; letter-spacing:.3px; }

  /* Attachment pages */
  .ek-page { page-break-before:always; padding-top:2px; }
  .ek-header { display:flex; justify-content:space-between; border-bottom:1px solid #2b2926; padding-bottom:9px; margin-bottom:20px; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:7.6pt; letter-spacing:.4px; color:#8a8478; }
  .ek-title { font-size:18pt; font-weight:400; letter-spacing:1px; color:#2b2926; margin-bottom:16px; }
  .ek-title:after { content:''; display:block; width:48px; height:2px; background:#b5502e; margin-top:10px; }
  .ek-body { font-size:9.2pt; line-height:1.85; color:#2b2926; }
</style>
</head>
<body>
  <div class="header">
    <div class="top-row">
      <div class="brand">
        <div class="brand-name">${v(company.sirketAdi)}</div>
        ${(company.adres || company.telefon || company.telefon2 || company.email || company.website) ? `<div class="brand-meta">
          ${company.adres ? `${esc(company.adres)}<br/>` : ''}
          ${(company.telefon || company.telefon2) ? `Tel: ${phoneLine}<br/>` : ''}
          ${(company.email || company.website) ? `${company.email ? 'E-Mail: ' + contactLink('email', company.email) : ''}${company.email && company.website ? ' &nbsp;&middot;&nbsp; ' : ''}${company.website ? contactLink('web', company.website) : ''}` : ''}
        </div>` : ''}
      </div>
      <div class="logo-center">
        ${logoSrc
          ? `<img class="logo-img" src="${logoSrc}" />`
          : `<div class="logo-fallback">${esc(monogram)}</div>`}
      </div>
      <div class="doc-id">
        <div class="doc-title">TEKLİF</div>
        <div class="doc-sub">Form No ${v(quote.teklifNo)}</div>
        <div class="meta-list">
          <div class="meta-list-row"><div class="meta-list-k">Teklif No</div><div class="meta-list-v">${v(quote.teklifNo)}</div></div>
          <div class="meta-list-row"><div class="meta-list-k">Tarih</div><div class="meta-list-v">${trDate(quote.tarih)}</div></div>
          <div class="meta-list-row"><div class="meta-list-k">Geçerlilik Tarihi</div><div class="meta-list-v">${trDate(quote.gecerlilik)}</div></div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
  </div>

  <div class="info-row">
    <div class="info-col">
      <div class="info-col-title">Müşteri Bilgileri</div>
      <div class="info-line"><div class="info-line-k">Firma</div><div class="info-line-v">${v(quote.musFirma)}</div></div>
      <div class="info-line"><div class="info-line-k">Müşteri Adı</div><div class="info-line-v">${v(quote.musYetkili)}</div></div>
      <div class="info-line"><div class="info-line-k">Telefon</div><div class="info-line-v">${v(quote.musTelefon)}</div></div>
      <div class="info-line"><div class="info-line-k">E-Mail</div><div class="info-line-v">${v(quote.musEmail)}</div></div>
      <div class="info-line"><div class="info-line-k">Adres</div><div class="info-line-v">${v(quote.musAdres)}</div></div>
    </div>
    <div class="info-col">
      <div class="info-col-title">Sipariş Bilgileri</div>
      <div class="info-line"><div class="info-line-k">Proje Adı</div><div class="info-line-v">${v(quote.projeAdi)}</div></div>
      <div class="info-line"><div class="info-line-k">Nakliye</div><div class="info-line-v">${v(quote.nakliye)}</div></div>
      <div class="info-line"><div class="info-line-k">Para Birimi</div><div class="info-line-v">${v(quote.paraBirimi)}</div></div>
      <div class="info-line"><div class="info-line-k">Ödeme Şekli</div><div class="info-line-v">${v(quote.odemeSekli)}</div></div>
      <div class="info-line"><div class="info-line-k">Menşei</div><div class="info-line-v">${v(quote.mensei)}</div></div>
      <div class="info-line"><div class="info-line-k">Teslim</div><div class="info-line-v">${v(quote.teslimGun)}</div></div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:32px;">No</th>
        <th>Sistem / Hizmet</th>
        <th class="num" style="width:64px;">Miktar</th>
        <th class="num" style="width:90px;">Birim Fiyat</th>
        <th class="num" style="width:100px;">Toplam Fiyat</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="banner banner-warn">Ölçü ve Özellikleri Dikkatli Kontrol Ediniz. Olası Hatalardan Firmamız Sorumlu Değildir.</div>

  <div class="bottom">
    <div class="notes-col">
      <div class="sub-title">Özel Notlar</div>
      <div class="sub-body">${company.ozelNotlar ? esc(company.ozelNotlar) : '-'}</div>
      <div class="sub-title">Satış Detayları</div>
      <div class="sub-body">${quote.notlar ? esc(quote.notlar) : '-'}</div>
      <div class="sign-box">
        <div class="sign-label">${company.imzaMetni ? esc(company.imzaMetni) : 'Onay / İmza :'}</div>
        <div class="sign-line"></div>
      </div>
    </div>
    <div class="totals-col">
      <div class="totals-row"><div class="totals-k">Ara Toplam</div><div class="totals-v">${fmt(araToplamRaw, cur)}</div></div>
      ${showIskonto ? `<div class="totals-row"><div class="totals-k">İskonto (%${esc(String(quote.iskonto))})</div><div class="totals-v">- ${fmt(quote.iskontoTutar, cur)}</div></div>` : ''}
      ${showKdv ? `<div class="totals-row"><div class="totals-k">KDV (%${esc(String(quote.kdvOrani))})</div><div class="totals-v">${fmt(quote.kdvTutar, cur)}</div></div>` : ''}
      <div class="grand-wrap">
        <div class="grand-label">Genel Toplam${showKdv ? ' (KDV Dahil)' : ''}</div>
        <div class="grand-value">${fmt(quote.genelToplam, cur)}</div>
      </div>
    </div>
  </div>

  ${bankSection}
  <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.<br/><a href="https://www.anindateklif.co" id="app-credit-link" style="color:#b5502e;text-decoration:underline;text-underline-offset:2px;font-weight:700;letter-spacing:0.4px;">www.anindateklif.co</a></div>
  ${ekPages}
</body>
</html>`;
}

function buildKurumsalHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'TL';
  const items = quote.items || [];
  const ekler = quote.ekler || [];
  const banklar = company.banklar || [];

  const v = (s?: string | number | null): string => {
    if (s === null || s === undefined) return '-';
    const str = String(s).trim();
    return str.length > 0 ? esc(str) : '-';
  };

  const monogram = ((company.sirketAdi || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase()) || '?';

  const logoSrc = company.logoBase64
    ? esc(company.logoBase64.startsWith('data:') ? company.logoBase64 : `data:image/png;base64,${company.logoBase64}`)
    : '';

  const phoneLine = [company.telefon, company.telefon2].filter(Boolean).map((p) => esc(String(p))).join('  /  ') || '';

  const itemsRows = items.map((it, idx) => {
    const desc = buildItemDescription(it);
    const total = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
    return `<tr>
      <td class="c-idx">${idx + 1}</td>
      <td class="c-desc">${esc(desc)}</td>
      <td class="c-num">${esc(String(it.adet))}</td>
      <td class="c-num">${fmt(it.birimFiyat, cur)}</td>
      <td class="c-num c-total">${fmt(total, cur)}</td>
    </tr>`;
  }).join('');

  const showIskonto = !!quote.iskonto && quote.iskonto > 0;
  const showKdv = !!quote.kdvOrani && quote.kdvOrani > 0;
  const araToplamRaw = (quote.araToplam || 0) + (quote.iskontoTutar || 0);

  // Banka adı ve türü aynı bilgiyi tekrar ediyorsa (ör. "Garanti Bankası TL"
  // ve "Garanti Bankası (TL)") parantez içinde ikinci kez eklemiyoruz --
  // aksi halde dar kenar sütununda satır satır karışıp okunmaz hale geliyordu.
  const norm = (s: string) => s.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const bankLabel = (b: typeof banklar[number]) => {
    const banka = (b.banka || '').trim();
    const turu = (b.turu || '').trim();
    if (!turu) return v(banka);
    if (!banka) return v(turu);
    if (norm(banka).includes(norm(turu)) || norm(turu).includes(norm(banka))) return v(banka);
    return `${v(banka)} (${v(turu)})`;
  };
  const bankSection = banklar.length > 0 ? `
    <div class="strip-section-label">Banka Bilgileri</div>
    ${banklar.map((b) => `<div class="strip-row"><span class="strip-dot"></span><div style="flex:1;min-width:0;"><div class="strip-bank-name">${bankLabel(b)}</div><div class="strip-bank-iban">${v(b.iban)}</div></div></div>`).join('')}` : '';

  const ekPages = ekler.map((ek) => `
    <section class="ek-page">
      <div class="ek-header">
        <span>${v(company.sirketAdi)}</span>
        <span>Teklif No: ${v(quote.teklifNo)} &middot; Sayfa Eki</span>
      </div>
      <div class="ek-title">${v(ek.baslik)}</div>
      <div class="ek-body">${esc(ek.icerik || '')}</div>
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<style>
  @page { size: A4; margin: 0; }
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=block');
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body { font-family:'Montserrat','Helvetica Neue',Arial,sans-serif; color:#1E293B; background:#fff; font-size:9.5pt; line-height:1.5; }
  .page { display:flex; min-height: 1120px; }

  .strip { width:180px; flex-shrink:0; background:linear-gradient(180deg,#0F172A 0%,#1E293B 100%); color:#fff; padding:28px 20px; }
  .strip-logo-img { max-width:145px; max-height:110px; object-fit:contain; display:block; margin-bottom:16px; }
  .strip-logo-fallback { width:56px; height:56px; border-radius:14px; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:19pt; margin-bottom:16px; }
  .strip-company { font-size:12.5pt; font-weight:800; line-height:1.35; margin-bottom:3px; }
  .strip-tagline { font-size:7.6pt; color:#94A3B8; margin-bottom:11px; }
  .strip-section-label { font-size:6.8pt; letter-spacing:1.3px; color:#64748B; text-transform:uppercase; margin-bottom:7px; margin-top:18px; font-weight:700; }
  .strip-row { display:flex; gap:6px; align-items:flex-start; margin-bottom:6px; }
  .strip-dot { width:4px; height:4px; border-radius:2px; background:#38BDF8; margin-top:5px; flex-shrink:0; }
  .strip-bank-name { font-size:7.8pt; font-weight:700; color:#E2E8F0; line-height:1.4; word-break:break-word; }
  .strip-bank-iban { font-size:7.6pt; font-weight:600; color:#38BDF8; letter-spacing:0.2px; margin-top:3px; word-break:break-all; }
  .strip-footer { margin-top:auto; padding-top:14px; border-top:1px solid rgba(255,255,255,0.16); font-size:6.8pt; color:#64748B; }

  .content { flex:1; padding:30px 30px 22px; }
  .doc-tag { font-size:8pt; letter-spacing:2.4px; color:#94A3B8; font-weight:800; text-transform:uppercase; }
  .doc-heading { font-size:18pt; font-weight:900; color:#0F172A; margin:3px 0 2px; }
  .doc-meta { font-size:8pt; color:#64748B; margin-bottom:16px; }

  .cust-box { background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:11px 14px; margin-bottom:14px; }
  .cust-label { font-size:6.8pt; letter-spacing:1px; color:#94A3B8; text-transform:uppercase; font-weight:800; margin-bottom:5px; }
  .cust-grid { display:flex; gap:18px; flex-wrap:wrap; }
  .cust-item { min-width:140px; }
  .cust-item .k { font-size:6.6pt; letter-spacing:.5px; color:#94A3B8; text-transform:uppercase; font-weight:700; }
  .cust-item .val { font-size:9.5pt; font-weight:700; color:#0F172A; margin-top:1px; }

  table.items { width:100%; border-collapse:collapse; margin-bottom:14px; }
  table.items thead th { background:#0F172A; color:#fff; text-align:left; padding:8px 9px; font-size:7pt; letter-spacing:.6px; text-transform:uppercase; font-weight:700; }
  table.items thead th.num { text-align:right; }
  table.items tbody td { padding:8px 9px; font-size:8.6pt; color:#1E293B; border-bottom:1px solid #E2E8F0; }
  table.items tbody td.c-num { text-align:right; white-space:nowrap; }
  table.items tbody tr:nth-child(even) { background:#F8FAFC; }
  td.c-total { font-weight:800; }

  .banner-warn { font-size:6.9pt; letter-spacing:.4px; color:#7a4a00; background:#fff1d6; border-left:3px solid #c98a00; padding:6px 10px; margin-bottom:12px; font-weight:700; }

  .bottom-row { display:flex; gap:16px; margin-bottom:14px; }
  .notes-card { flex:1.4; }
  .sub-title { font-size:6.9pt; letter-spacing:1px; text-transform:uppercase; color:#0F172A; font-weight:800; margin-bottom:5px; }
  .sub-body { font-size:8.4pt; color:#334155; margin-bottom:9px; line-height:1.55; }
  .sign-box { margin-top:10px; border-top:1px solid #E2E8F0; padding-top:8px; }
  .sign-label { font-size:7.6pt; font-weight:700; margin-bottom:16px; color:#0F172A; }
  .sign-line { border-top:1px solid #94A3B8; width:70%; }

  .totals-card { flex:1; }
  .totals-row { display:flex; justify-content:space-between; font-size:8.6pt; color:#475569; padding:3px 0; }
  .totals-grand { display:flex; justify-content:space-between; align-items:center; background:#0F172A; color:#fff; border-radius:10px; padding:11px 14px; margin-top:7px; }
  .totals-grand .l { font-size:6.8pt; letter-spacing:1px; text-transform:uppercase; color:#94A3B8; font-weight:700; }
  .totals-grand .v { font-size:15pt; font-weight:900; }
  .kdv-note { font-size:6.8pt; color:#94A3B8; margin-top:6px; }

  .app-credit { text-align:center; font-size:6.9pt; color:#94A3B8; padding-top:8px; margin-top:6px; border-top:1px solid #E2E8F0; }

  .ek-page { page-break-before:always; padding:30px; }
  .ek-header { display:flex; justify-content:space-between; border-bottom:2px solid #0F172A; padding-bottom:8px; margin-bottom:16px; font-size:8pt; color:#64748B; }
  .ek-title { font-size:15pt; font-weight:800; color:#0F172A; margin-bottom:14px; }
  .ek-body { font-size:9pt; line-height:1.75; color:#1E293B; }
</style>
</head>
<body>
  <div class="page">
    <div class="strip">
      ${logoSrc ? `<img class="strip-logo-img" src="${logoSrc}" />` : `<div class="strip-logo-fallback">${esc(monogram)}</div>`}
      <div class="strip-company">${v(company.sirketAdi)}</div>
      ${company.website ? `<div class="strip-tagline">${contactLink('web', company.website, 'color:#94A3B8;')}</div>` : ''}

      <div class="strip-section-label">İletişim</div>
      ${company.adres ? `<div class="strip-row"><span class="strip-dot"></span>${v(company.adres)}</div>` : ''}
      ${phoneLine ? `<div class="strip-row"><span class="strip-dot"></span>${esc(phoneLine)}</div>` : ''}
      ${company.email ? `<div class="strip-row"><span class="strip-dot"></span>${contactLink('email', company.email, 'color:#E2E8F0;')}</div>` : ''}

      ${bankSection}

      <div class="strip-footer">
        Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.<br/>
        <a href="https://www.anindateklif.co" id="app-credit-link" style="color:#38BDF8;text-decoration:underline;text-underline-offset:2px;font-weight:700;letter-spacing:0.4px;">www.anindateklif.co</a>
      </div>
    </div>

    <div class="content">
      <div class="doc-tag">Teklif Formu</div>
      <div class="doc-heading">${v(quote.teklifNo)}</div>
      <div class="doc-meta">Tarih: ${trDate(quote.tarih)} &nbsp;·&nbsp; Geçerlilik: ${trDate(quote.gecerlilik)}</div>

      <div class="cust-box">
        <div class="cust-label">Müşteri &amp; Sipariş Bilgileri</div>
        <div class="cust-grid">
          <div class="cust-item"><div class="k">Firma</div><div class="val">${v(quote.musFirma)}</div></div>
          <div class="cust-item"><div class="k">Yetkili</div><div class="val">${v(quote.musYetkili)}</div></div>
          <div class="cust-item"><div class="k">Telefon</div><div class="val">${v(quote.musTelefon)}</div></div>
          <div class="cust-item"><div class="k">Proje</div><div class="val">${v(quote.projeAdi)}</div></div>
          <div class="cust-item"><div class="k">Ödeme Şekli</div><div class="val">${v(quote.odemeSekli)}</div></div>
          <div class="cust-item"><div class="k">Teslim</div><div class="val">${v(quote.teslimGun)}</div></div>
        </div>
      </div>

      <table class="items">
        <thead>
          <tr><th style="width:24px;">No</th><th>Sistem / Hizmet</th><th class="num" style="width:56px;">Miktar</th><th class="num" style="width:80px;">Birim Fiyat</th><th class="num" style="width:90px;">Toplam</th></tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="banner-warn">ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR.</div>

      <div class="bottom-row">
        <div class="notes-card">
          <div class="sub-title">Özel Notlar</div>
          <div class="sub-body">${company.ozelNotlar ? esc(company.ozelNotlar) : '-'}</div>
          <div class="sub-title">Satış Detayları</div>
          <div class="sub-body">${quote.notlar ? esc(quote.notlar) : '-'}</div>
          <div class="sign-box">
            <div class="sign-label">${company.imzaMetni ? esc(company.imzaMetni) : 'Onay / İmza :'}</div>
            <div class="sign-line"></div>
          </div>
        </div>
        <div class="totals-card">
          <div class="totals-row"><span>Ara Toplam</span><span>${fmt(araToplamRaw, cur)}</span></div>
          ${showIskonto ? `<div class="totals-row"><span>İskonto (%${esc(String(quote.iskonto))})</span><span>- ${fmt(quote.iskontoTutar, cur)}</span></div>` : ''}
          ${showKdv ? `<div class="totals-row"><span>KDV (%${esc(String(quote.kdvOrani))})</span><span>${fmt(quote.kdvTutar, cur)}</span></div>` : ''}
          <div class="totals-grand"><span class="l">Genel Toplam</span><span class="v">${fmt(quote.genelToplam, cur)}</span></div>
          ${showKdv ? `<div class="kdv-note">KDV Dahil</div>` : ''}
        </div>
      </div>
    </div>
  </div>
  ${ekPages}
</body>
</html>`;
}

function buildRenkliHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'TL';
  const items = quote.items || [];
  const ekler = quote.ekler || [];
  const banklar = company.banklar || [];

  const v = (s?: string | number | null): string => {
    if (s === null || s === undefined) return '-';
    const str = String(s).trim();
    return str.length > 0 ? esc(str) : '-';
  };

  const monogram = ((company.sirketAdi || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase()) || '?';

  const logoSrc = company.logoBase64
    ? esc(company.logoBase64.startsWith('data:') ? company.logoBase64 : `data:image/png;base64,${company.logoBase64}`)
    : '';

  const phoneLine = [company.telefon, company.telefon2].filter(Boolean).map((p) => esc(String(p))).join('  /  ') || '';

  const itemsRows = items.map((it, idx) => {
    const desc = buildItemDescription(it);
    const total = (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0);
    return `<tr>
      <td class="c-idx">${idx + 1}</td>
      <td class="c-desc">${esc(desc)}</td>
      <td class="c-num">${esc(String(it.adet))}</td>
      <td class="c-num">${fmt(it.birimFiyat, cur)}</td>
      <td class="c-num c-total">${fmt(total, cur)}</td>
    </tr>`;
  }).join('');

  const showIskonto = !!quote.iskonto && quote.iskonto > 0;
  const showKdv = !!quote.kdvOrani && quote.kdvOrani > 0;
  const araToplamRaw = (quote.araToplam || 0) + (quote.iskontoTutar || 0);

  const bankSection = banklar.length > 0 ? `
    <div class="card bank-card">
      <div class="bank-icon">${cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺'}</div>
      <div>
        ${banklar.map((b) => `<div><b>${v(b.banka)}</b>${b.turu ? ` (${v(b.turu)})` : ''} — ${v(b.iban)}</div>`).join('')}
      </div>
    </div>` : '';

  const ekPages = ekler.map((ek) => `
    <section class="ek-page">
      <div class="ek-header">
        <span>${v(company.sirketAdi)}</span>
        <span>Teklif No: ${v(quote.teklifNo)} &middot; Sayfa Eki</span>
      </div>
      <div class="ek-title">${v(ek.baslik)}</div>
      <div class="ek-body">${esc(ek.icerik || '')}</div>
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<style>
  @page { size: A4; margin: 0; }
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=block');
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body { font-family:'Poppins','Helvetica Neue',Arial,sans-serif; color:#1E1B4B; background:#EEF2FF; font-size:9.5pt; line-height:1.5; }
  .page { padding:26px; min-height:1120px; box-sizing:border-box; }

  .card { background:#fff; border-radius:14px; padding:16px 18px; margin-bottom:12px; }

  .head-card { display:flex; align-items:center; justify-content:space-between; }
  .head-left { display:flex; align-items:center; gap:12px; }
  .logo-badge-img { max-width:130px; max-height:96px; object-fit:contain; border-radius:10px; }
  .logo-badge { width:64px; height:64px; border-radius:14px; background:linear-gradient(135deg,#6366F1,#A855F7); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:20pt; }
  .head-company { font-size:12pt; font-weight:800; color:#1E1B4B; }
  .head-sub { font-size:7.6pt; color:#7C7A9C; margin-top:2px; }
  .head-right { text-align:right; }
  .head-badge { display:inline-block; background:#EEF2FF; color:#6366F1; font-size:7pt; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:999px; margin-bottom:5px; }
  .head-no { font-size:13.5pt; font-weight:900; color:#1E1B4B; }
  .head-date { font-size:7.6pt; color:#7C7A9C; margin-top:2px; }

  .cust-card { display:flex; gap:16px; flex-wrap:wrap; }
  .cust-chip { flex:1; min-width:120px; }
  .cust-chip-label { font-size:6.6pt; letter-spacing:.8px; text-transform:uppercase; color:#A5A3C4; font-weight:800; margin-bottom:4px; }
  .cust-chip-value { font-size:9.6pt; font-weight:700; color:#1E1B4B; }

  table.items { width:100%; border-collapse:separate; border-spacing:0 6px; }
  table.items thead th { text-align:left; font-size:6.6pt; letter-spacing:.8px; text-transform:uppercase; color:#A5A3C4; font-weight:800; padding:0 10px; }
  table.items thead th.num { text-align:right; }
  table.items tbody td { background:#F8F9FF; padding:9px 10px; font-size:8.4pt; color:#1E1B4B; font-weight:600; }
  table.items tbody tr td:first-child { border-radius:8px 0 0 8px; }
  table.items tbody tr td:last-child { border-radius:0 8px 8px 0; font-weight:800; }
  table.items tbody td.c-num { text-align:right; white-space:nowrap; }

  .banner-warn { font-size:6.9pt; letter-spacing:.3px; color:#9A3412; background:#FFF7ED; border-left:3px solid #F97316; padding:6px 10px; margin-bottom:10px; font-weight:700; border-radius:6px; }

  .totals-wrap { display:flex; justify-content:flex-end; margin-top:4px; }
  .totals-inner { width:250px; }
  .totals-row { display:flex; justify-content:space-between; font-size:8.4pt; color:#7C7A9C; padding:3px 4px; font-weight:600; }
  .grand-badge { margin-top:6px; background:linear-gradient(135deg,#6366F1,#EC4899); border-radius:12px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; color:#fff; }
  .grand-badge .l { font-size:6.8pt; letter-spacing:1.2px; text-transform:uppercase; font-weight:700; opacity:.85; }
  .grand-badge .v { font-size:15pt; font-weight:900; }
  .kdv-note { font-size:6.8pt; color:#A5A3C4; margin-top:5px; text-align:right; }

  .notes-card .sub-title { font-size:6.9pt; letter-spacing:.8px; text-transform:uppercase; color:#6366F1; font-weight:800; margin-bottom:4px; }
  .notes-card .sub-body { font-size:8.4pt; color:#4B4A73; margin-bottom:8px; line-height:1.5; }
  .sign-box { margin-top:6px; border-top:1px solid #EEF2FF; padding-top:8px; }
  .sign-label { font-size:7.6pt; font-weight:700; margin-bottom:14px; color:#1E1B4B; }
  .sign-line { border-top:1px solid #C7C6E6; width:60%; }

  .bank-card { display:flex; align-items:center; gap:10px; font-size:8.4pt; color:#1E1B4B; }
  .bank-icon { width:26px; height:26px; border-radius:8px; background:#ECFDF5; display:flex; align-items:center; justify-content:center; color:#059669; font-weight:900; font-size:11pt; flex-shrink:0; }

  .footer-note { text-align:center; font-size:8pt; color:#A5A3C4; margin-top:2px; }

  .ek-page { page-break-before:always; padding:26px; }
  .ek-header { display:flex; justify-content:space-between; border-bottom:2px solid #6366F1; padding-bottom:8px; margin-bottom:16px; font-size:8pt; color:#7C7A9C; }
  .ek-title { font-size:15pt; font-weight:800; color:#1E1B4B; margin-bottom:14px; }
  .ek-body { font-size:9pt; line-height:1.75; color:#1E1B4B; }
</style>
</head>
<body>
  <div class="page">

    <div class="card head-card">
      <div class="head-left">
        ${logoSrc ? `<img class="logo-badge-img" src="${logoSrc}" />` : `<div class="logo-badge">${esc(monogram)}</div>`}
        <div>
          <div class="head-company">${v(company.sirketAdi)}</div>
          <div class="head-sub">${[phoneLine, company.email ? contactLink('email', company.email) : '', company.website ? contactLink('web', company.website) : ''].filter(Boolean).join(' · ') || '&nbsp;'}</div>
        </div>
      </div>
      <div class="head-right">
        <div class="head-badge">Teklif Formu</div>
        <div class="head-no">${v(quote.teklifNo)}</div>
        <div class="head-date">${trDate(quote.tarih)}</div>
      </div>
    </div>

    <div class="card cust-card">
      <div class="cust-chip"><div class="cust-chip-label">Müşteri</div><div class="cust-chip-value">${v(quote.musFirma)}</div></div>
      <div class="cust-chip"><div class="cust-chip-label">Telefon</div><div class="cust-chip-value">${v(quote.musTelefon)}</div></div>
      <div class="cust-chip"><div class="cust-chip-label">Proje</div><div class="cust-chip-value">${v(quote.projeAdi)}</div></div>
      <div class="cust-chip"><div class="cust-chip-label">Ödeme Şekli</div><div class="cust-chip-value">${v(quote.odemeSekli)}</div></div>
    </div>

    <div class="card">
      <table class="items">
        <thead>
          <tr><th style="width:24px;">No</th><th>Açıklama</th><th class="num" style="width:56px;">Miktar</th><th class="num" style="width:80px;">Fiyat</th><th class="num" style="width:90px;">Tutar</th></tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="banner-warn">ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR.</div>

      <div class="totals-wrap">
        <div class="totals-inner">
          <div class="totals-row"><span>Ara Toplam</span><span>${fmt(araToplamRaw, cur)}</span></div>
          ${showIskonto ? `<div class="totals-row"><span>İskonto (%${esc(String(quote.iskonto))})</span><span>- ${fmt(quote.iskontoTutar, cur)}</span></div>` : ''}
          ${showKdv ? `<div class="totals-row"><span>KDV (%${esc(String(quote.kdvOrani))})</span><span>${fmt(quote.kdvTutar, cur)}</span></div>` : ''}
          <div class="grand-badge"><span class="l">Genel Toplam</span><span class="v">${fmt(quote.genelToplam, cur)}</span></div>
          ${showKdv ? `<div class="kdv-note">KDV Dahil</div>` : ''}
        </div>
      </div>
    </div>

    <div class="card notes-card">
      <div class="sub-title">Özel Notlar</div>
      <div class="sub-body">${company.ozelNotlar ? esc(company.ozelNotlar) : '-'}</div>
      <div class="sub-title">Satış Detayları</div>
      <div class="sub-body">${quote.notlar ? esc(quote.notlar) : '-'}</div>
      <div class="sign-box">
        <div class="sign-label">${company.imzaMetni ? esc(company.imzaMetni) : 'Onay / İmza :'}</div>
        <div class="sign-line"></div>
      </div>
    </div>

    ${bankSection}

    <div class="footer-note">
      Bu teklif Anında Teklif uygulaması ile hazırlanmıştır. &nbsp;<a href="https://www.anindateklif.co" id="app-credit-link" style="color:#6366F1;text-decoration:underline;text-underline-offset:2px;font-weight:700;letter-spacing:0.4px;">www.anindateklif.co</a>
    </div>

  </div>
  ${ekPages}
</body>
</html>`;
}

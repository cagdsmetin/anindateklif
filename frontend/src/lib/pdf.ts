import type { CompanyT, QuoteT } from './api';
import { buildItemDescription } from './quote-utils';

export type PdfTemplateId = 'classic' | 'modern' | 'minimal';

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

const trDate = (iso: string) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return iso;
};

// Dispatcher — picks one of the three visual templates. Defaults to
// 'classic' so every existing call site (quick-share from the editor,
// history re-share) keeps producing exactly the same PDF as before this
// file gained multiple templates.
export function buildQuotePdfHtml(company: CompanyT, quote: QuoteT, template: PdfTemplateId = 'classic'): string {
  if (template === 'modern') return buildModernHtml(company, quote);
  if (template === 'minimal') return buildMinimalHtml(company, quote);
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
  .hdr td.left-col { width:55%; padding-right:16px; }
  .hdr td.right-col { width:45%; padding-left:16px; text-align:right; }

  /* Logo always sits first (top), company name directly under it, then the
     rest of the contact lines — left-aligned since this column now anchors
     the whole letterhead. */
  .logo { max-width:380px; max-height:170px; object-fit:contain; object-position:left center; margin:0 0 9px 0; display:block; }
  .logo-fallback { padding:14px 20px; border:2px solid #1E293B; font-weight:800; color:#1E293B; margin:0 0 14px 0; display:inline-block; font-size:17px; }
  .cname { font-weight:700; font-size:16.5px; color:#1E293B; margin:0 0 7px 0; line-height:1.3; word-wrap:break-word; overflow-wrap:break-word; }
  .cline { font-size:14px; color:#0f172a; line-height:1.6; margin:0 0 3px 0; word-wrap:break-word; overflow-wrap:break-word; }

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
  .tot-row { display:flex; justify-content:space-between; align-items:center; border:1px solid #cbd5e1; padding:6px 10px; font-size:12px; margin-bottom:4px; }
  .tot-row .l { color:#64748b; font-weight:600; }
  .tot-row .v { font-weight:700; color:#0f172a; }
  .tot-row.grand { background:#0f172a; color:#fff; border-color:#0f172a; font-size:13.5px; }
  .tot-row.grand .l { color:#fff; font-weight:800; letter-spacing:0.05em; }
  .tot-row.grand .v { color:#fff; font-weight:900; }
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
        ${logo}
        ${company.adres ? `<div class="cline">${esc(company.adres)}</div>` : ''}
        ${company.telefon ? `<div class="cline">${esc(company.telefon)}</div>` : ''}
        ${company.telefon2 ? `<div class="cline">${esc(company.telefon2)}</div>` : ''}
        ${company.email ? `<div class="cline">${esc(company.email)}</div>` : ''}
        ${company.website ? `<div class="cline">${esc(company.website)}</div>` : ''}
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
      ${quote.kdvOrani > 0 ? `<div class="tot-row"><div class="l">KDV (%${quote.kdvOrani})</div><div class="v">+${fmt(quote.kdvTutar || 0, cur)}</div></div>` : ''}
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

  <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.</div>

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
  .company-block { max-width:60%; }
  .company-name { font-size:16pt; font-weight:800; letter-spacing:-0.3px; margin:0 0 7px; }
  .company-meta { font-size:9.8pt; color:#6b6b6b; line-height:1.7; }
  .head-right { text-align:right; display:flex; flex-direction:column; align-items:flex-end; }
  .logo-row { margin-bottom:8px; }
  .logo-img { max-width:380px; max-height:170px; object-fit:contain; object-position:left center; display:block; }
  .logo-fallback { width:100px; height:100px; background:#4338ca; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:24pt; border-radius:4px; }
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
  .grand-value { font-size:23pt; font-weight:800; color:#fff; letter-spacing:-0.5px; }
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
        <div class="logo-row">
          ${logoSrc
            ? `<img class="logo-img" src="${logoSrc}" />`
            : `<div class="logo-fallback">${esc(monogram)}</div>`}
        </div>
        ${(company.adres || company.telefon || company.telefon2 || company.email || company.website) ? `<div class="company-meta">
          ${company.adres ? `${esc(company.adres)}<br/>` : ''}
          ${(company.telefon || company.telefon2) ? `Tel: ${phoneLine}<br/>` : ''}
          ${(company.email || company.website) ? `${company.email ? 'E-Mail: ' + esc(company.email) : ''}${company.email && company.website ? ' &nbsp;&middot;&nbsp; ' : ''}${company.website ? esc(company.website) : ''}` : ''}
        </div>` : ''}
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
        ${showKdv ? `<div class="totals-row"><div class="totals-k">KDV (%${esc(String(quote.kdvOrani))})</div><div class="totals-v">+ ${fmt(quote.kdvTutar, cur)}</div></div>` : ''}
        <div class="totals-div"></div>
        <div class="grand-label">Genel Toplam${showKdv ? ' (KDV Dahil)' : ''}</div>
        <div class="grand-value">${fmt(quote.genelToplam, cur)}</div>
      </div>
    </div>

    ${bankSection}
    <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.</div>
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
  .brand { max-width:56%; }
  .logo-row { margin-bottom:9px; }
  .logo-img { max-width:380px; max-height:170px; object-fit:contain; object-position:left center; display:block; }
  .logo-fallback { width:110px; height:110px; border:1px solid #b5502e; color:#b5502e; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:27pt; font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; }
  .brand-name { font-size:16pt; letter-spacing:.2px; font-weight:700; margin:0 0 8px; }
  .brand-meta { font-family:'Montserrat', 'Helvetica Neue', Arial, sans-serif; font-size:9.4pt; color:#8a8478; margin-top:8px; line-height:1.85; }
  .doc-id { text-align:right; }
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
  .grand-value { font-size:27pt; font-weight:400; letter-spacing:.5px; margin-top:3px; }
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
        <div class="logo-row">
          ${logoSrc
            ? `<img class="logo-img" src="${logoSrc}" />`
            : `<div class="logo-fallback">${esc(monogram)}</div>`}
        </div>
        ${(company.adres || company.telefon || company.telefon2 || company.email || company.website) ? `<div class="brand-meta">
          ${company.adres ? `${esc(company.adres)}<br/>` : ''}
          ${(company.telefon || company.telefon2) ? `Tel: ${phoneLine}<br/>` : ''}
          ${(company.email || company.website) ? `${company.email ? 'E-Mail: ' + esc(company.email) : ''}${company.email && company.website ? ' &nbsp;&middot;&nbsp; ' : ''}${company.website ? esc(company.website) : ''}` : ''}
        </div>` : ''}
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
      ${showKdv ? `<div class="totals-row"><div class="totals-k">KDV (%${esc(String(quote.kdvOrani))})</div><div class="totals-v">+ ${fmt(quote.kdvTutar, cur)}</div></div>` : ''}
      <div class="grand-wrap">
        <div class="grand-label">Genel Toplam${showKdv ? ' (KDV Dahil)' : ''}</div>
        <div class="grand-value">${fmt(quote.genelToplam, cur)}</div>
      </div>
    </div>
  </div>

  ${bankSection}
  <div class="app-credit">Bu teklif Anında Teklif uygulaması ile hazırlanmıştır.</div>
  ${ekPages}
</body>
</html>`;
}

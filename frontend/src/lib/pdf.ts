import type { CompanyT, QuoteT } from './api';
import { buildItemDescription } from './quote-utils';

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

export function buildQuotePdfHtml(company: CompanyT, quote: QuoteT): string {
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
    ? `<img src="${company.logoBase64}" class="logo"/>`
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
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  body { font-family: 'Helvetica','Arial',sans-serif; margin: 0; color:#0f172a; font-size:10px; }
  .sheet { padding: 6mm 8mm; }

  /* HEADER — table layout guarantees strict top alignment between the two columns. */
  .hdr { width:100%; border-collapse:collapse; margin-bottom:14px; }
  .hdr td { padding:0; vertical-align:top; }
  .hdr td.left-col { width:55%; padding-right:12px; }
  .hdr td.right-col { width:45%; padding-left:12px; text-align:right; }

  .cname { font-weight:800; font-size:11px; color:#1E293B; margin:0 0 4px 0; line-height:1.3; }
  .cline { font-size:10px; color:#0f172a; line-height:1.4; margin:0 0 1px 0; }

  .logo { max-width:150px; max-height:56px; object-fit:contain; margin:0 0 6px auto; display:block; }
  .logo-fallback { padding:6px 10px; border:2px solid #1E293B; font-weight:800; color:#1E293B; margin:0 0 6px auto; display:inline-block; font-size:11px; }
  .doc-title { margin: 0 0 8px 0; font-size:20px; font-weight:900; color:#1E293B; letter-spacing:0.04em; line-height:1.15; text-align:right; }
  .meta-table { border-collapse:collapse; margin:0 0 0 auto; }
  .meta-table td { padding:2px 0 2px 10px; font-size:10px; }
  .meta-table td.k { color:#64748b; text-align:right; padding-right:6px; padding-left:0; }
  .meta-table td.v { font-weight:800; color:#0f172a; text-align:right; min-width:70px; }

  /* INFO BOXES */
  .info-grid { display: table; width:100%; margin-bottom:10px; border-spacing: 0 0; }
  .info-cell { display: table-cell; width:50%; vertical-align:top; }
  .info-cell:first-child { padding-right:6px; }
  .info-cell:last-child { padding-left:6px; }
  .info-box { border:1px solid #cbd5e1; border-radius:2px; overflow:hidden; }
  .info-box .hdr-cell { background:#1E293B; color:#fff; font-size:10px; font-weight:800; padding:5px 8px; letter-spacing:0.04em; }
  .info-box table { width:100%; border-collapse:collapse; }
  .info-box td { font-size:10px; padding:4px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .info-box tr:last-child td { border-bottom:none; }
  .info-box td.k { color:#64748b; width:38%; font-weight:700; text-transform:uppercase; letter-spacing:0.02em; font-size:9px; }
  .info-box td.v { color:#0f172a; }

  /* ITEMS TABLE */
  .items { width:100%; border-collapse:collapse; margin-top:8px; border:1px solid #cbd5e1; }
  .items thead th { background:#1E293B; color:#fff; font-size:9.5px; font-weight:800; padding:6px 6px; text-align:center; letter-spacing:0.03em; border-right:1px solid rgba(255,255,255,0.15); }
  .items thead th:last-child { border-right:none; }
  .items thead th:nth-child(2) { text-align:left; }
  .items thead th:nth-child(4), .items thead th:nth-child(5) { text-align:right; }
  .items tbody td { font-size:10px; padding:6px 6px; border-bottom:1px solid #e2e8f0; vertical-align:middle; border-right:1px solid #e2e8f0; }
  .items tbody td:last-child { border-right:none; }
  .items .c1 { text-align:center; width:34px; }
  .items .c2 { text-align:left; line-height:1.35; }
  .items .c3 { text-align:center; width:50px; }
  .items .c4 { text-align:right; width:95px; white-space:nowrap; font-weight:600; }
  .items .c5 { text-align:right; width:95px; white-space:nowrap; font-weight:700; }
  .items tbody tr:nth-child(even) { background:#f8fafc; }

  /* BANNERS */
  .warn { background:#dc2626; color:#fff; text-align:center; font-size:9.5px; font-weight:800; padding:5px; }
  .kdv { background:#0f172a; color:#fff; text-align:center; font-size:11px; font-weight:800; padding:5px; letter-spacing:0.05em; }

  /* BOTTOM GRID */
  .bottom { display:table; width:100%; margin-top:10px; }
  .bt-left { display:table-cell; width:60%; vertical-align:top; padding-right:6px; }
  .bt-right { display:table-cell; width:40%; vertical-align:top; padding-left:6px; }
  .notes-hdr { background:#1E293B; color:#fff; font-size:10px; font-weight:800; padding:5px 8px; letter-spacing:0.03em; }
  .notes-body { border:1px solid #cbd5e1; border-top:none; padding:8px; font-size:10px; line-height:1.5; color:#0f172a; min-height:60px; white-space:pre-wrap; }
  .tot-row { display:flex; justify-content:space-between; align-items:center; border:1px solid #cbd5e1; padding:6px 10px; font-size:11px; margin-bottom:4px; }
  .tot-row .l { color:#64748b; font-weight:600; }
  .tot-row .v { font-weight:700; color:#0f172a; }
  .tot-row.grand { background:#0f172a; color:#fff; border-color:#0f172a; font-size:12px; }
  .tot-row.grand .l { color:#fff; font-weight:800; letter-spacing:0.05em; }
  .tot-row.grand .v { color:#fff; font-weight:900; }
  .sign-box { border:1px solid #cbd5e1; height:58px; padding:6px; font-size:10px; color:#64748b; margin-top:6px; white-space:pre-wrap; }

  /* BANK */
  .bank-title { background:#1E293B; color:#fff; font-size:10px; font-weight:800; padding:5px 8px; margin-top:10px; letter-spacing:0.03em; }
  .bank-table { width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-top:none; }
  .bank-table td { padding:5px 8px; font-size:10px; border-bottom:1px solid #e2e8f0; }
  .bank-table tr:last-child td { border-bottom:none; }
  .bank-table td.bk-name { color:#0f172a; width:35%; font-weight:700; }
  .bank-table td.bk-iban { color:#0f172a; font-family:'Courier New',monospace; letter-spacing:0.02em; }
  .bank-footer { font-size:9px; color:#64748b; padding:6px 0 0; }

  /* ATTACHMENTS */
  .ek-page { page-break-before: always; padding: 4mm 0 0 0; }
  .ek-hdr { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #1E293B; padding-bottom:6px; margin-bottom:12px; }
  .ek-brand { font-weight:800; font-size:11px; color:#1E293B; }
  .ek-meta { font-size:9.5px; color:#64748b; }
  .ek-title { font-size:14px; font-weight:900; color:#1E293B; margin-bottom:8px; letter-spacing:0.03em; text-transform:uppercase; }
  .ek-body { font-size:10.5px; line-height:1.55; color:#0f172a; white-space:pre-wrap; }
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
        ${company.email ? `<div class="cline">${esc(company.email)}</div>` : ''}
        ${company.website ? `<div class="cline">${esc(company.website)}</div>` : ''}
      </td>
      <td class="right-col">
        ${logo}
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
  <div class="kdv">KDV HARİÇ FİYATTIR</div>

  <!-- BOTTOM GRID -->
  <div class="bottom">
    <div class="bt-left">
      <div class="notes-hdr">ÖZEL NOTLAR &amp; SATIŞ DETAYLARI</div>
      <div class="notes-body">${esc(quote.notlar || company.ozelNotlar || '-')}</div>
    </div>
    <div class="bt-right">
      <div class="tot-row"><div class="l">ARA TOPLAM</div><div class="v">${fmt(araToplamRaw, cur)}</div></div>
      ${quote.iskonto > 0 ? `<div class="tot-row"><div class="l">İSKONTO (%${quote.iskonto})</div><div class="v" style="color:#dc2626">-${fmt(quote.iskontoTutar, cur)}</div></div>` : ''}
      <div class="tot-row grand"><div class="l">GENEL TOPLAM</div><div class="v">${fmt(quote.genelToplam || 0, cur)}</div></div>
      <div class="sign-box">Onay / İmza :${company.imzaMetni ? `\n${esc(company.imzaMetni)}` : ''}</div>
    </div>
  </div>

  <!-- BANK INFO -->
  ${bankRows ? `
  <div class="bank-title">BANKA BİLGİLERİ — ${esc(company.sirketAdi || '')}</div>
  <table class="bank-table">${bankRows}</table>
  <div class="bank-footer">Tüm banka masrafları ve transfer ücretleri alıcıya aittir.</div>
  ` : ''}

  <!-- ATTACHMENT PAGES -->
  ${eklerHtml}
</div>
</body></html>`;
}

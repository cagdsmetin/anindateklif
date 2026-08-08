import type { CompanyT, QuoteT } from './api';

const fmt = (n: number, cur: string) => {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${s} ${sym}`;
};

const escapeHtml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');

export function buildQuotePdfHtml(company: CompanyT, quote: QuoteT): string {
  const cur = quote.paraBirimi || 'USD';
  const itemsHtml = (quote.items || [])
    .map((it, idx) => {
      const line = (it.adet || 0) * (it.birimFiyat || 0);
      return `
        <div class="row">
          <div class="c1">${idx + 1}</div>
          <div class="c2">
            <div class="pname">${escapeHtml(it.urunAdi || '-')}</div>
            ${it.aciklama ? `<div class="pdesc">${escapeHtml(it.aciklama)}</div>` : ''}
          </div>
          <div class="c3">${it.adet} ${escapeHtml(it.birim || '')}</div>
          <div class="c4">${fmt(it.birimFiyat, cur)}</div>
          <div class="c5">${fmt(line, cur)}</div>
        </div>`;
    })
    .join('');

  const logoImg = company.logoBase64
    ? `<img src="${company.logoBase64}" class="logo"/>`
    : `<div class="logo-placeholder">${escapeHtml((company.sirketAdi || 'FIRMA').substring(0, 20))}</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Helvetica','Arial',sans-serif; margin: 0; color:#1a1a1a; font-size:11px; }
  .sheet { padding: 6mm 8mm; }
  .doc-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #3a3b40; padding-bottom:10px; margin-bottom:12px; }
  .company-block { max-width: 60%; }
  .cname { font-weight:800; font-size:12px; color:#3a3b40; margin-bottom:3px; line-height:1.3; }
  .cline { font-size:10.5px; color:#333; line-height:1.5; }
  .doc-title-block { text-align:right; }
  .logo { max-width:160px; max-height:60px; object-fit:contain; margin-bottom:6px; display:block; margin-left:auto; }
  .logo-placeholder { padding:8px 12px; border:2px solid #3a3b40; font-weight:800; color:#3a3b40; margin-bottom:6px; display:inline-block; font-size:14px; }
  .doc-title { margin:0 0 8px 0; font-size:20px; font-weight:800; color:#232428; letter-spacing:0.03em; }
  .meta { font-size:10.5px; margin-bottom:2px; }
  .meta .k { color:#6b7280; }
  .meta .v { font-weight:700; }
  .info-grid { display:flex; gap:10px; margin-bottom:10px; }
  .info-box { flex:1; border:1px solid #d8dee6; border-radius:3px; overflow:hidden; }
  .info-box .hdr { background:#3a3b40; color:#fff; font-size:10.5px; font-weight:700; padding:5px 8px; letter-spacing:0.03em; }
  .info-box .kv { display:flex; padding:4px 8px; border-bottom:1px solid #eef1f5; font-size:10.5px; }
  .info-box .kv:last-child { border-bottom:none; }
  .info-box .kv .k { color:#6b7280; width:38%; font-weight:600; }
  .info-box .kv .v { flex:1; }
  .items-box { border:1px solid #3a3b40; border-radius:3px; overflow:hidden; margin-bottom:0; }
  .row { display:grid; grid-template-columns: 32px 1fr 60px 90px 90px; border-bottom:1px solid #d8dee6; }
  .row > div { padding:6px 7px; border-right:1px solid #d8dee6; font-size:10.5px; }
  .row > div:last-child { border-right:none; }
  .row.head { background:#3a3b40; color:#fff; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.02em; }
  .row.head > div { border-right:1px solid rgba(255,255,255,0.25); }
  .row .c1 { text-align:center; }
  .row .c3 { text-align:center; }
  .row .c4 { text-align:right; white-space:nowrap; }
  .row .c5 { text-align:right; white-space:nowrap; font-weight:700; }
  .pname { font-weight:700; }
  .pdesc { color:#6b7280; font-size:9.5px; margin-top:2px; }
  .warn-banner { background:#c0392b; color:#fff; text-align:center; font-size:10px; font-weight:700; padding:5px; margin-top:6px; }
  .kdv-banner { background:#232428; color:#fff; text-align:center; font-size:12px; font-weight:800; padding:6px; letter-spacing:0.04em; margin-bottom:10px; }
  .bottom-grid { display:grid; grid-template-columns:1.3fr 1fr; gap:12px; }
  .notes-hdr { font-size:10.5px; font-weight:700; color:#fff; background:#3a3b40; padding:5px 8px; }
  .notes-box { font-size:10.5px; line-height:1.55; border:1px solid #d8dee6; padding:8px; background:#f4f6f9; white-space:pre-wrap; }
  .bank-title { font-size:10px; font-weight:700; color:#fff; background:#3a3b40; padding:4px 8px; margin-top:10px; }
  .bank-body { font-size:10px; padding:6px 8px; border:1px solid #d8dee6; background:#fff; white-space:pre-wrap; line-height:1.5; }
  .totals .line { display:flex; justify-content:space-between; font-size:11px; padding:6px 10px; border:1px solid #d8dee6; margin-bottom:4px; background:#fff; }
  .totals .line.grand { font-weight:800; font-size:13px; background:#e9e9ea; color:#232428; }
  .totals .line.disc { color:#c0392b; }
  .signbox { margin-top:12px; border:1px solid #d8dee6; height:60px; padding:6px; font-size:10.5px; color:#6b7280; }
  .status-badge { display:inline-block; padding:3px 8px; border-radius:3px; font-size:10px; font-weight:700; margin-left:8px; }
  .status-Beklemede { background:#f1f1f1; color:#333; border:1px solid #d8dee6; }
  .status-Görüldü { background:#fff3cd; color:#856404; border:1px solid #f0d98c; }
  .status-Onaylandı { background:#d4f4dd; color:#155724; border:1px solid #8fd9a8; }
  .status-Reddedildi { background:#fbdada; color:#721c24; border:1px solid #e69a9a; }
</style></head>
<body>
<div class="sheet">
  <div class="doc-header">
    <div class="company-block">
      <div class="cname">${escapeHtml(company.sirketAdi || '')}</div>
      ${company.adres ? `<div class="cline">${escapeHtml(company.adres)}</div>` : ''}
      ${company.telefon ? `<div class="cline">Tel: ${escapeHtml(company.telefon)}${company.telefon2 ? ' • ' + escapeHtml(company.telefon2) : ''}</div>` : ''}
      ${company.email ? `<div class="cline">E-posta: ${escapeHtml(company.email)}${company.website ? ' • ' + escapeHtml(company.website) : ''}</div>` : ''}
      ${company.vergiDairesi || company.vergiNo ? `<div class="cline">V.D: ${escapeHtml(company.vergiDairesi)} - V.No: ${escapeHtml(company.vergiNo)}</div>` : ''}
    </div>
    <div class="doc-title-block">
      ${logoImg}
      <div class="doc-title">FİYAT TEKLİFİ</div>
      <div class="meta"><span class="k">Teklif No:</span> <span class="v">${escapeHtml(quote.teklifNo)}</span></div>
      <div class="meta"><span class="k">Tarih:</span> <span class="v">${escapeHtml(quote.tarih)}</span></div>
      <div class="meta"><span class="k">Geçerlilik:</span> <span class="v">${escapeHtml(quote.gecerlilik)}</span></div>
      ${quote.hazirlayanEmail ? `<div class="meta"><span class="k">Hazırlayan:</span> <span class="v">${escapeHtml(quote.hazirlayanEmail)}</span></div>` : ''}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="hdr">MÜŞTERİ BİLGİLERİ</div>
      <div class="kv"><div class="k">FİRMA</div><div class="v">${escapeHtml(quote.musFirma || '-')}</div></div>
      <div class="kv"><div class="k">YETKİLİ</div><div class="v">${escapeHtml(quote.musYetkili || '-')}</div></div>
      <div class="kv"><div class="k">TELEFON</div><div class="v">${escapeHtml(quote.musTelefon || '-')}</div></div>
      <div class="kv"><div class="k">E-POSTA</div><div class="v">${escapeHtml(quote.musEmail || '-')}</div></div>
      <div class="kv"><div class="k">ADRES</div><div class="v">${escapeHtml(quote.musAdres || '-')}</div></div>
    </div>
    <div class="info-box">
      <div class="hdr">SİPARİŞ BİLGİLERİ</div>
      <div class="kv"><div class="k">PROJE</div><div class="v">${escapeHtml(quote.projeAdi || '-')}</div></div>
      <div class="kv"><div class="k">NAKLİYE</div><div class="v">${escapeHtml(quote.nakliye)}</div></div>
      <div class="kv"><div class="k">PARA BİRİMİ</div><div class="v">${escapeHtml(cur)}</div></div>
      <div class="kv"><div class="k">ÖDEME</div><div class="v">${escapeHtml(quote.odemeSekli || '-')}</div></div>
      <div class="kv"><div class="k">MENŞEİ</div><div class="v">${escapeHtml(quote.mensei || '-')}</div></div>
      <div class="kv"><div class="k">TESLİM</div><div class="v">${escapeHtml(quote.teslimGun || '-')}</div></div>
    </div>
  </div>

  <div class="items-box">
    <div class="row head">
      <div class="c1">#</div>
      <div class="c2">ÜRÜN / HİZMET</div>
      <div class="c3">ADET</div>
      <div class="c4">BİRİM FİYAT</div>
      <div class="c5">TOPLAM</div>
    </div>
    ${itemsHtml || `<div class="row"><div style="grid-column:1/-1;text-align:center;color:#6b7280;padding:16px;font-size:11px;">Kalem eklenmedi.</div></div>`}
  </div>
  <div class="warn-banner">ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİCE KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR. KDV HARİÇTİR.</div>
  <div class="kdv-banner">FİYATLARIMIZA KDV (%${quote.kdvOrani}) DAHİL DEĞİLDİR</div>

  <div class="bottom-grid">
    <div>
      <div class="notes-hdr">ÖZEL NOTLAR</div>
      <div class="notes-box">${escapeHtml(quote.notlar || '-')}</div>
      ${company.bankaBilgileri ? `<div class="bank-title">BANKA HESAP BİLGİLERİ</div><div class="bank-body">${escapeHtml(company.bankaBilgileri)}</div>` : ''}
    </div>
    <div class="totals">
      <div class="line"><div>ARA TOPLAM</div><div>${fmt((quote.araToplam || 0) + (quote.iskontoTutar || 0), cur)}</div></div>
      ${quote.iskonto > 0 ? `<div class="line disc"><div>İSKONTO (%${quote.iskonto})</div><div>-${fmt(quote.iskontoTutar || 0, cur)}</div></div>` : ''}
      <div class="line"><div>KDV (%${quote.kdvOrani})</div><div>${fmt(quote.kdvTutar || 0, cur)}</div></div>
      <div class="line grand"><div>GENEL TOPLAM</div><div>${fmt(quote.genelToplam || 0, cur)}</div></div>
    </div>
  </div>

  <div class="signbox">Onay / İmza:</div>
</div>
</body></html>`;
}

import type { CompanyT, ContractT, QuoteT } from '@/src/lib/api';

// Sozlesme yardimcilari:
//  - buildContractTemplate: yapay zeka olmadan (ya da AI kapaliyken) tekliften
//    aninda dolu bir standart satis/montaj sozlesmesi uretir.
//  - buildContractPdfHtml: duz metin sozlesmeyi antetli, imza alanli PDF HTML'ine cevirir.

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function fmtMoney(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}

function todayTr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const BLANK = '........................';

export function buildContractTemplate(company: CompanyT, quote: QuoteT | null): { baslik: string; icerik: string } {
  const cur = quote?.paraBirimi || 'TRY';
  const musteri = quote?.musFirma || BLANK;
  const yetkili = quote?.musYetkili ? ` (Yetkili: ${quote.musYetkili})` : '';
  const kalemler = (quote?.items || [])
    .map((it, i) => {
      const ad = it.urunAdi || it.sistemTipi || 'Kalem';
      const alanlar = (it.sistemFields || []).filter((f) => f.value).map((f) => `${f.label}: ${f.value}`).join(', ');
      return `   ${i + 1}. ${ad} — ${it.adet} ${it.birim || 'Adet'} x ${fmtMoney(it.birimFiyat, cur)}${alanlar ? ` (${alanlar})` : ''}`;
    })
    .join('\n');
  const toplam = quote ? fmtMoney(quote.genelToplam, cur) : BLANK;
  const baslik = 'SATIŞ VE MONTAJ SÖZLEŞMESİ';
  const icerik = `${baslik}

MADDE 1 - TARAFLAR
1.1 SATICI: ${company.sirketAdi}, Adres: ${company.adres || BLANK}, Tel: ${company.telefon || BLANK}, Vergi Dairesi/No: ${company.vergiDairesi || BLANK} / ${company.vergiNo || BLANK} (bundan sonra "SATICI" olarak anılacaktır).
1.2 ALICI: ${musteri}${yetkili}, Adres: ${quote?.musAdres || BLANK}, Tel: ${quote?.musTelefon || BLANK} (bundan sonra "ALICI" olarak anılacaktır).

MADDE 2 - SÖZLEŞMENİN KONUSU
İşbu sözleşmenin konusu, SATICI'nın ${quote ? `${quote.teklifNo} numaralı ve ${quote.tarih} tarihli teklifinde` : 'aşağıda'} belirtilen ürün ve hizmetleri ALICI'ya satması, teslim etmesi ve montajını yapması ile tarafların karşılıklı hak ve yükümlülüklerinin belirlenmesidir.

MADDE 3 - ÜRÜN VE HİZMETLER
${kalemler || `   ${BLANK}`}
${quote?.projeAdi ? `Proje: ${quote.projeAdi}\n` : ''}
MADDE 4 - BEDEL VE ÖDEME KOŞULLARI
4.1 Sözleşme bedeli KDV dahil toplam ${toplam}'dir.
4.2 Ödeme şekli: ${quote?.odemeSekli || BLANK}.
4.3 Ödemelerin zamanında yapılmaması halinde SATICI, teslim ve montaj takvimini ödeme yapılana kadar durdurma hakkına sahiptir.

MADDE 5 - TESLİM VE MONTAJ
5.1 Teslim ve montaj, ${quote?.teslimGun ? `sipariş onayı ve ön ödemenin alınmasından itibaren ${quote.teslimGun} gün içinde` : `${BLANK} tarihine kadar`} gerçekleştirilecektir.
5.2 ALICI, montaj yerini çalışmaya uygun şekilde hazır bulundurmakla yükümlüdür. ALICI kaynaklı gecikmeler teslim süresine eklenir.
5.3 Teslim sırasında ürünler birlikte kontrol edilir; görünür ayıplar teslim tutanağına yazılır.

MADDE 6 - GARANTİ
Ürünler, teslim tarihinden itibaren ${BLANK} süreyle üretim ve montaj hatalarına karşı SATICI garantisi altındadır. Kullanım hatası, doğal afet ve yetkisiz müdahaleden kaynaklanan arızalar garanti kapsamı dışındadır.

MADDE 7 - CAYMA VE FESİH
7.1 ALICI'nın özel ölçü ile üretime başlanmış ürünlerde cayma hakkı bulunmamaktadır. Üretime başlanmadan önce yapılan fesihlerde, SATICI'nın o güne kadar yaptığı masraflar ALICI'ya aittir.
7.2 Taraflardan birinin sözleşme yükümlülüklerini yazılı ihtara rağmen yerine getirmemesi halinde diğer taraf sözleşmeyi feshedebilir.

MADDE 8 - MÜCBİR SEBEPLER
Tarafların kontrolü dışında gelişen doğal afet, salgın, savaş, grev ve resmi makam kararları gibi mücbir sebepler süresince yükümlülükler askıya alınır.

MADDE 9 - KİŞİSEL VERİLER
Taraflar, işbu sözleşme kapsamında edindikleri kişisel verileri 6698 sayılı KVKK hükümlerine uygun olarak yalnızca sözleşmenin ifası amacıyla işleyecektir.

MADDE 10 - UYUŞMAZLIKLAR
İşbu sözleşmeden doğacak uyuşmazlıklarda ${BLANK} Mahkemeleri ve İcra Daireleri yetkilidir.

MADDE 11 - YÜRÜRLÜK
11 (on bir) maddeden oluşan işbu sözleşme ${todayTr()} tarihinde iki nüsha olarak düzenlenmiş ve taraflarca okunarak imzalanmıştır.`;
  return { baslik, icerik };
}

// "MADDE 3 - ..." ve tamami buyuk harfli kisa satirlar baslik olarak kalin basilir.
function isHeading(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (/^MADDE\s+\d+/i.test(t)) return true;
  return t.length <= 70 && t === t.toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ]/.test(t);
}

export function buildContractPdfHtml(company: CompanyT, contract: Pick<ContractT, 'baslik' | 'icerik' | 'musFirma' | 'musYetkili'>): string {
  const lines = (contract.icerik || '').split('\n');
  // Ilk satir basliksa (AI ve sablon oyle uretiyor) ustte zaten gosteriliyor, tekrarlama.
  if (lines.length && lines[0].trim().toLocaleUpperCase('tr-TR') === (contract.baslik || '').trim().toLocaleUpperCase('tr-TR')) lines.shift();
  const body = lines
    .map((l) => (isHeading(l) ? `<h3>${esc(l.trim())}</h3>` : l.trim() ? `<p>${esc(l)}</p>` : '<div class="gap"></div>'))
    .join('');
  const logo = company.logoBase64
    ? `<img src="${esc(company.logoBase64)}" class="logo"/>`
    : `<div class="logo-fallback">${esc((company.sirketAdi || '').substring(0, 28))}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; font-size: 11.5px; line-height: 1.55; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; margin-bottom: 18px; }
  .logo { max-height: 54px; max-width: 200px; }
  .logo-fallback { font-weight: 900; font-size: 16px; color: #4F46E5; }
  .co { text-align: right; font-size: 10px; color: #475569; }
  h1 { text-align: center; font-size: 16px; letter-spacing: 0.5px; margin: 6px 0 18px; }
  h3 { font-size: 12px; margin: 14px 0 4px; }
  p { margin: 0 0 3px; white-space: pre-wrap; text-align: justify; }
  .gap { height: 6px; }
  .sign { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; page-break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10.5px; }
  .sign b { display: block; margin-bottom: 36px; }
</style></head><body>
  <div class="head">${logo}<div class="co"><b>${esc(company.sirketAdi)}</b><br/>${esc(company.adres || '')}<br/>${esc(company.telefon || '')} ${esc(company.email || '')}</div></div>
  <h1>${esc(contract.baslik)}</h1>
  ${body}
  <div class="sign">
    <div><b>SATICI</b>${esc(company.sirketAdi)}<br/>Ad Soyad / İmza / Kaşe</div>
    <div><b>ALICI</b>${esc(contract.musFirma || '')}${contract.musYetkili ? ` — ${esc(contract.musYetkili)}` : ''}<br/>Ad Soyad / İmza</div>
  </div>
</body></html>`;
}

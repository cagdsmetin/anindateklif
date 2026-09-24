import type { CompanyT, ContractT, QuoteT } from '@/src/lib/api';
import { getLang, translate, type Lang } from '@/src/lib/i18n';

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

const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-GB', it: 'it-IT' };

export function fmtMoney(n: number, cur: string, lang: Lang = getLang()) {
  const s = new Intl.NumberFormat(LOCALE[lang] || 'tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const BLANK = '........................';

export function buildContractTemplate(company: CompanyT, quote: QuoteT | null, lang: Lang = getLang()): { baslik: string; icerik: string } {
  const cur = quote?.paraBirimi || 'TRY';
  const m = (n: number) => fmtMoney(n, cur, lang);
  const B = BLANK;
  const unitDefault = lang === 'tr' ? 'Adet' : lang === 'it' ? 'pz' : 'pcs';
  const kalemler = (quote?.items || [])
    .map((it, i) => {
      const ad = it.urunAdi || it.sistemTipi || (lang === 'tr' ? 'Kalem' : lang === 'it' ? 'Voce' : 'Item');
      const alanlar = (it.sistemFields || []).filter((f) => f.value).map((f) => `${f.label}: ${f.value}`).join(', ');
      return `   ${i + 1}. ${ad} — ${it.adet} ${it.birim || unitDefault} x ${m(it.birimFiyat)}${alanlar ? ` (${alanlar})` : ''}`;
    })
    .join('\n') || `   ${B}`;
  const toplam = quote ? m(quote.genelToplam) : B;
  const c = {
    ad: company.sirketAdi, adres: company.adres || B, tel: company.telefon || B,
    vd: company.vergiDairesi || B, vn: company.vergiNo || B,
  };
  const q = {
    firma: quote?.musFirma || B, yetkili: quote?.musYetkili || '', adres: quote?.musAdres || B, tel: quote?.musTelefon || B,
    no: quote?.teklifNo || '', tarih: quote?.tarih || '', proje: quote?.projeAdi || '', odeme: quote?.odemeSekli || B, gun: quote?.teslimGun || '',
  };

  if (lang === 'en') {
    const baslik = 'SALES AND INSTALLATION AGREEMENT';
    return { baslik, icerik: `${baslik}

ARTICLE 1 - PARTIES
1.1 SELLER: ${c.ad}, Address: ${c.adres}, Phone: ${c.tel}, Tax Office/No: ${c.vd} / ${c.vn} (hereinafter the "SELLER").
1.2 BUYER: ${q.firma}${q.yetkili ? ` (Contact: ${q.yetkili})` : ''}, Address: ${q.adres}, Phone: ${q.tel} (hereinafter the "BUYER").

ARTICLE 2 - SUBJECT
The subject of this agreement is the sale, delivery and installation by the SELLER to the BUYER of the products and services ${quote ? `specified in quote no. ${q.no} dated ${q.tarih}` : 'listed below'}, and the mutual rights and obligations of the parties.

ARTICLE 3 - PRODUCTS AND SERVICES
${kalemler}
${q.proje ? `Project: ${q.proje}\n` : ''}
ARTICLE 4 - PRICE AND PAYMENT TERMS
4.1 The total contract price is ${toplam}, VAT included.
4.2 Payment terms: ${q.odeme}.
4.3 If payments are not made on time, the SELLER may suspend delivery and installation until payment is received.

ARTICLE 5 - DELIVERY AND INSTALLATION
5.1 Delivery and installation will be completed ${q.gun ? `within ${q.gun} days of order confirmation and receipt of the down payment` : `by ${B}`}.
5.2 The BUYER shall make the installation site ready for work. Delays caused by the BUYER extend the delivery period.
5.3 Products are inspected jointly on delivery; visible defects are recorded in the delivery note.

ARTICLE 6 - WARRANTY
The products are covered by the SELLER's warranty against manufacturing and installation defects for ${B} from the delivery date. Faults caused by misuse, natural disasters or unauthorised intervention are not covered.

ARTICLE 7 - CANCELLATION AND TERMINATION
7.1 Custom-made products whose production has started cannot be cancelled. If the agreement is cancelled before production starts, costs incurred by the SELLER up to that date are borne by the BUYER.
7.2 If either party fails to fulfil its obligations despite written notice, the other party may terminate this agreement.

ARTICLE 8 - FORCE MAJEURE
Obligations are suspended for the duration of force majeure events beyond the parties' control, such as natural disasters, epidemics, war, strikes and decisions of public authorities.

ARTICLE 9 - PERSONAL DATA
The parties shall process personal data obtained under this agreement in accordance with applicable data protection law and solely for the performance of this agreement.

ARTICLE 10 - DISPUTES
The courts of ${B} shall have jurisdiction over any disputes arising from this agreement.

ARTICLE 11 - ENTRY INTO FORCE
This agreement, consisting of 11 (eleven) articles, was drawn up in two copies on ${todayStr()} and signed by the parties after being read.` };
  }

  if (lang === 'it') {
    const baslik = 'CONTRATTO DI VENDITA E INSTALLAZIONE';
    return { baslik, icerik: `${baslik}

ARTICOLO 1 - PARTI
1.1 VENDITORE: ${c.ad}, Indirizzo: ${c.adres}, Tel: ${c.tel}, Ufficio fiscale/P.IVA: ${c.vd} / ${c.vn} (di seguito il "VENDITORE").
1.2 ACQUIRENTE: ${q.firma}${q.yetkili ? ` (Referente: ${q.yetkili})` : ''}, Indirizzo: ${q.adres}, Tel: ${q.tel} (di seguito l'"ACQUIRENTE").

ARTICOLO 2 - OGGETTO
Oggetto del presente contratto è la vendita, la consegna e l'installazione da parte del VENDITORE all'ACQUIRENTE dei prodotti e servizi ${quote ? `indicati nel preventivo n. ${q.no} del ${q.tarih}` : 'elencati di seguito'}, nonché i reciproci diritti e obblighi delle parti.

ARTICOLO 3 - PRODOTTI E SERVIZI
${kalemler}
${q.proje ? `Progetto: ${q.proje}\n` : ''}
ARTICOLO 4 - PREZZO E CONDIZIONI DI PAGAMENTO
4.1 Il prezzo totale del contratto è di ${toplam}, IVA inclusa.
4.2 Modalità di pagamento: ${q.odeme}.
4.3 In caso di mancato pagamento nei termini, il VENDITORE può sospendere consegna e installazione fino al pagamento.

ARTICOLO 5 - CONSEGNA E INSTALLAZIONE
5.1 La consegna e l'installazione saranno completate ${q.gun ? `entro ${q.gun} giorni dalla conferma dell'ordine e dal ricevimento dell'acconto` : `entro il ${B}`}.
5.2 L'ACQUIRENTE deve rendere il luogo di installazione idoneo ai lavori. I ritardi imputabili all'ACQUIRENTE prolungano i termini di consegna.
5.3 I prodotti vengono verificati congiuntamente alla consegna; i difetti visibili sono annotati nel verbale di consegna.

ARTICOLO 6 - GARANZIA
I prodotti sono coperti dalla garanzia del VENDITORE contro difetti di fabbricazione e installazione per ${B} dalla data di consegna. Sono esclusi i guasti dovuti a uso improprio, calamità naturali o interventi non autorizzati.

ARTICOLO 7 - RECESSO E RISOLUZIONE
7.1 Per i prodotti su misura la cui produzione è già iniziata non è previsto il recesso. In caso di recesso prima dell'inizio della produzione, le spese sostenute dal VENDITORE fino a quel momento sono a carico dell'ACQUIRENTE.
7.2 Se una delle parti non adempie ai propri obblighi nonostante una diffida scritta, l'altra parte può risolvere il contratto.

ARTICOLO 8 - FORZA MAGGIORE
Gli obblighi sono sospesi per la durata di eventi di forza maggiore indipendenti dalla volontà delle parti, quali calamità naturali, epidemie, guerre, scioperi e provvedimenti delle autorità.

ARTICOLO 9 - DATI PERSONALI
Le parti trattano i dati personali acquisiti in virtù del presente contratto nel rispetto della normativa vigente in materia di protezione dei dati (GDPR) ed esclusivamente per l'esecuzione del contratto.

ARTICOLO 10 - CONTROVERSIE
Per qualsiasi controversia derivante dal presente contratto è competente il Foro di ${B}.

ARTICOLO 11 - ENTRATA IN VIGORE
Il presente contratto, composto da 11 (undici) articoli, è stato redatto in duplice copia il ${todayStr()} e sottoscritto dalle parti previa lettura.` };
  }

  const baslik = 'SATIŞ VE MONTAJ SÖZLEŞMESİ';
  return { baslik, icerik: `${baslik}

MADDE 1 - TARAFLAR
1.1 SATICI: ${c.ad}, Adres: ${c.adres}, Tel: ${c.tel}, Vergi Dairesi/No: ${c.vd} / ${c.vn} (bundan sonra "SATICI" olarak anılacaktır).
1.2 ALICI: ${q.firma}${q.yetkili ? ` (Yetkili: ${q.yetkili})` : ''}, Adres: ${q.adres}, Tel: ${q.tel} (bundan sonra "ALICI" olarak anılacaktır).

MADDE 2 - SÖZLEŞMENİN KONUSU
İşbu sözleşmenin konusu, SATICI'nın ${quote ? `${q.no} numaralı ve ${q.tarih} tarihli teklifinde` : 'aşağıda'} belirtilen ürün ve hizmetleri ALICI'ya satması, teslim etmesi ve montajını yapması ile tarafların karşılıklı hak ve yükümlülüklerinin belirlenmesidir.

MADDE 3 - ÜRÜN VE HİZMETLER
${kalemler}
${q.proje ? `Proje: ${q.proje}\n` : ''}
MADDE 4 - BEDEL VE ÖDEME KOŞULLARI
4.1 Sözleşme bedeli KDV dahil toplam ${toplam}'dir.
4.2 Ödeme şekli: ${q.odeme}.
4.3 Ödemelerin zamanında yapılmaması halinde SATICI, teslim ve montaj takvimini ödeme yapılana kadar durdurma hakkına sahiptir.

MADDE 5 - TESLİM VE MONTAJ
5.1 Teslim ve montaj, ${q.gun ? `sipariş onayı ve ön ödemenin alınmasından itibaren ${q.gun} gün içinde` : `${B} tarihine kadar`} gerçekleştirilecektir.
5.2 ALICI, montaj yerini çalışmaya uygun şekilde hazır bulundurmakla yükümlüdür. ALICI kaynaklı gecikmeler teslim süresine eklenir.
5.3 Teslim sırasında ürünler birlikte kontrol edilir; görünür ayıplar teslim tutanağına yazılır.

MADDE 6 - GARANTİ
Ürünler, teslim tarihinden itibaren ${B} süreyle üretim ve montaj hatalarına karşı SATICI garantisi altındadır. Kullanım hatası, doğal afet ve yetkisiz müdahaleden kaynaklanan arızalar garanti kapsamı dışındadır.

MADDE 7 - CAYMA VE FESİH
7.1 ALICI'nın özel ölçü ile üretime başlanmış ürünlerde cayma hakkı bulunmamaktadır. Üretime başlanmadan önce yapılan fesihlerde, SATICI'nın o güne kadar yaptığı masraflar ALICI'ya aittir.
7.2 Taraflardan birinin sözleşme yükümlülüklerini yazılı ihtara rağmen yerine getirmemesi halinde diğer taraf sözleşmeyi feshedebilir.

MADDE 8 - MÜCBİR SEBEPLER
Tarafların kontrolü dışında gelişen doğal afet, salgın, savaş, grev ve resmi makam kararları gibi mücbir sebepler süresince yükümlülükler askıya alınır.

MADDE 9 - KİŞİSEL VERİLER
Taraflar, işbu sözleşme kapsamında edindikleri kişisel verileri 6698 sayılı KVKK hükümlerine uygun olarak yalnızca sözleşmenin ifası amacıyla işleyecektir.

MADDE 10 - UYUŞMAZLIKLAR
İşbu sözleşmeden doğacak uyuşmazlıklarda ${B} Mahkemeleri ve İcra Daireleri yetkilidir.

MADDE 11 - YÜRÜRLÜK
11 (on bir) maddeden oluşan işbu sözleşme ${todayStr()} tarihinde iki nüsha olarak düzenlenmiş ve taraflarca okunarak imzalanmıştır.` };
}

// "MADDE 3 - ..." ve tamami buyuk harfli kisa satirlar baslik olarak kalin basilir.
function isHeading(line: string, lang: Lang) {
  const t = line.trim();
  if (!t) return false;
  if (/^(MADDE|ARTICLE|ARTICOLO)\s+\d+/i.test(t)) return true;
  return t.length <= 70 && t === t.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : undefined) && /[A-ZÇĞİÖŞÜ]/.test(t);
}

export function buildContractPdfHtml(company: CompanyT, contract: Pick<ContractT, 'baslik' | 'icerik' | 'musFirma' | 'musYetkili'>, lang: Lang = getLang()): string {
  const T = (k: string) => translate(`contracts.${k}`, lang);
  const lines = (contract.icerik || '').split('\n');
  // Ilk satir basliksa (AI ve sablon oyle uretiyor) ustte zaten gosteriliyor, tekrarlama.
  if (lines.length && lines[0].trim().toLocaleUpperCase('tr-TR') === (contract.baslik || '').trim().toLocaleUpperCase('tr-TR')) lines.shift();
  const body = lines
    .map((l) => (isHeading(l, lang) ? `<h3>${esc(l.trim())}</h3>` : l.trim() ? `<p>${esc(l)}</p>` : '<div class="gap"></div>'))
    .join('');
  const logo = company.logoBase64
    ? `<img src="${esc(company.logoBase64)}" class="logo"/>`
    : `<div class="logo-fallback">${esc((company.sirketAdi || '').substring(0, 28))}</div>`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/>
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
    <div><b>${T('seller')}</b>${esc(company.sirketAdi)}<br/>${T('signStamp')}</div>
    <div><b>${T('buyer')}</b>${esc(contract.musFirma || '')}${contract.musYetkili ? ` — ${esc(contract.musYetkili)}` : ''}<br/>${T('sign')}</div>
  </div>
</body></html>`;
}

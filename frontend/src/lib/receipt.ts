import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { CompanyT, TahsilatEntryT } from '@/src/lib/api';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import { downloadFileWeb } from '@/src/lib/web-download';
import { fill, getLang, statusLabel, translate, type Lang } from '@/src/lib/i18n';

// Tahsilat makbuzu: musteriden alinan odeme icin tek sayfalik, imza alanli PDF.

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const BASAMAK = ['', 'bin', 'milyon', 'milyar', 'trilyon'];

function ucBasamak(n: number): string {
  const y = Math.floor(n / 100), o = Math.floor((n % 100) / 10), b = n % 10;
  return `${y ? (y === 1 ? '' : BIRLER[y]) + 'yüz' : ''}${ONLAR[o]}${BIRLER[b]}`;
}

/** 1250 -> "binikiyüzelli" (Turk makbuz yazimi: bitisik). */
export function sayiyiYaziyaCevir(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'sıfır';
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < BASAMAK.length) {
    const grup = n % 1000;
    if (grup) {
      const yazi = i === 1 && grup === 1 ? '' : ucBasamak(grup);
      parts.unshift(yazi + BASAMAK[i]);
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join('');
}

// ---- English ----
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALE = ['', 'thousand', 'million', 'billion', 'trillion'];
function enUnder1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? EN_ONES[r] : EN_TENS[Math.floor(r / 10)] + (r % 10 ? '-' + EN_ONES[r % 10] : '');
  return [h ? `${EN_ONES[h]} hundred` : '', rest].filter(Boolean).join(' ');
}
export function numberToWordsEn(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < EN_SCALE.length; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) parts.unshift(enUnder1000(g) + (EN_SCALE[i] ? ' ' + EN_SCALE[i] : ''));
  }
  return parts.join(' ');
}

// ---- Italiano ----
const IT_ONES = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
function itUnder100(n: number): string {
  if (n < 20) return IT_ONES[n];
  let t = IT_TENS[Math.floor(n / 10)];
  const u = n % 10;
  if (u === 1 || u === 8) t = t.slice(0, -1); // ventuno, ventotto
  return t + (u === 3 ? 'tré' : IT_ONES[u]);
}
function itUnder1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  let c = h ? (h === 1 ? 'cento' : IT_ONES[h] + 'cento') : '';
  if (c && Math.floor(r / 10) === 8) c = c.slice(0, -1); // centottanta
  return c + itUnder100(r);
}
export function numberToWordsIt(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const mld = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  let out = '';
  if (mld) out += mld === 1 ? 'unmiliardo' : itUnder1000(mld) + 'miliardi';
  if (mil) out += mil === 1 ? 'unmilione' : itUnder1000(mil) + 'milioni';
  if (k) out += k === 1 ? 'mille' : itUnder1000(k) + 'mila';
  if (r) out += itUnder1000(r);
  return out;
}

const PARA: Record<string, Record<Lang, [string, string]> & { sym: string }> = {
  TRY: { sym: '₺', tr: ['Türk Lirası', 'Kuruş'], en: ['Turkish Lira', 'kuruş'], it: ['lire turche', 'kuruş'] },
  USD: { sym: '$', tr: ['ABD Doları', 'Sent'], en: ['US Dollars', 'cents'], it: ['dollari USA', 'centesimi'] },
  EUR: { sym: '€', tr: ['Euro', 'Sent'], en: ['Euros', 'cents'], it: ['euro', 'centesimi'] },
};

export function tutarYaziyla(tutar: number, cur: string, lang: Lang = getLang()) {
  const p = PARA[cur] || PARA.TRY;
  const [ana, alt] = p[lang] || p.tr;
  const words = lang === 'en' ? numberToWordsEn : lang === 'it' ? numberToWordsIt : sayiyiYaziyaCevir;
  const tam = Math.floor(tutar);
  const kurus = Math.round((tutar - tam) * 100);
  const and = lang === 'en' ? ' and' : lang === 'it' ? ' e' : '';
  return `${translate('receipt.only', lang)} ${words(tam)} ${ana}${kurus ? `${and} ${words(kurus)} ${alt}` : ''}`;
}

export function buildReceiptHtml(company: CompanyT, tx: TahsilatEntryT, lang: Lang = getLang()): string {
  const T = (k: string) => translate(`receipt.${k}`, lang);
  const cur = tx.paraBirimi || 'TRY';
  const sym = (PARA[cur] || PARA.TRY).sym;
  const tutar = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : lang === 'it' ? 'it-IT' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tx.tutar || 0);
  const tarih = (tx.tarih || '').split('-').reverse().join('.');
  const no = `M-${(tx.tarih || '').replace(/-/g, '').slice(2)}-${(tx.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase()}`;
  const logo = company.logoBase64 ? `<img src="${esc(company.logoBase64)}" class="logo"/>` : `<div class="lf">${esc(company.sirketAdi)}</div>`;
  const nusha = (label: string) => `
  <div class="rc">
    <div class="head">${logo}<div class="co"><b>${esc(company.sirketAdi)}</b><br/>${esc(company.adres || '')}<br/>${esc(company.telefon || '')}${company.vergiNo ? ` · ${T('taxNo')} ${esc(company.vergiDairesi || '')} ${esc(company.vergiNo)}` : ''}</div></div>
    <div class="title"><span>${T('title')}</span><small>${label}</small></div>
    <table>
      <tr><td>${T('no')}</td><td><b>${esc(no)}</b></td><td>${T('date')}</td><td><b>${esc(tarih)}</b></td></tr>
      <tr><td>${T('payer')}</td><td colspan="3"><b>${esc(tx.musteriAdi)}</b>${tx.musteriTelefon ? ` · ${esc(tx.musteriTelefon)}` : ''}</td></tr>
      <tr><td>${T('method')}</td><td colspan="3">${esc(statusLabel(lang, tx.yontem || 'Nakit'))}</td></tr>
      ${tx.notlar ? `<tr><td>${T('desc')}</td><td colspan="3">${esc(tx.notlar)}</td></tr>` : ''}
    </table>
    <div class="amount"><div class="fig">${sym}${tutar}</div><div class="words">${esc(tutarYaziyla(tx.tutar || 0, cur, lang))}</div></div>
    <p class="txt">${fill(T('body'), { payer: esc(tx.musteriAdi), company: esc(company.sirketAdi) })}</p>
    <div class="sign"><div>${T('giver')}<br/><span>${T('nameSign')}</span></div><div>${T('receiver')}<br/><span>${esc(company.sirketAdi)} · ${T('stampSign')}</span></div></div>
  </div>`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/><style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; font-size: 11.5px; }
  .rc { border: 1.5px solid #0369A1; border-radius: 10px; padding: 14px 16px; height: 122mm; box-sizing: border-box; position: relative; }
  .rc + .rc { margin-top: 10mm; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .logo { max-height: 42px; max-width: 170px; } .lf { font-weight: 900; font-size: 15px; color: #0369A1; }
  .co { text-align: right; font-size: 9.5px; color: #475569; }
  .title { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #0369A1; margin: 10px 0 8px; padding-bottom: 4px; }
  .title span { font-weight: 900; font-size: 15px; letter-spacing: 1px; } .title small { color: #64748b; }
  table { width: 100%; border-collapse: collapse; } td { padding: 4px 4px; border-bottom: 1px solid #e2e8f0; } td:nth-child(odd) { color: #64748b; width: 90px; }
  .amount { background: #F0F9FF; border-radius: 8px; padding: 10px 12px; margin-top: 10px; display: flex; align-items: center; gap: 14px; }
  .fig { font-size: 22px; font-weight: 900; color: #0369A1; white-space: nowrap; } .words { font-style: italic; color: #334155; }
  .txt { margin: 10px 0 0; color: #334155; }
  .sign { position: absolute; left: 16px; right: 16px; bottom: 12px; display: flex; gap: 30px; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 4px; font-weight: 800; } .sign span { font-weight: 400; color: #64748b; font-size: 10px; }
</style></head><body>${nusha(T('custCopy'))}${nusha(T('compCopy'))}</body></html>`;
}

export async function shareReceiptPdf(company: CompanyT, tx: TahsilatEntryT) {
  const html = buildReceiptHtml(company, tx);
  const safe = (tx.musteriAdi || 'Musteri').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 30);
  const fileName = `Makbuz_${safe}_${tx.tarih}.pdf`;
  if (Platform.OS === 'web') {
    await downloadFileWeb(await htmlToPdfObjectUrlWeb(html), fileName);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  let finalUri = uri;
  try {
    finalUri = uri.substring(0, uri.lastIndexOf('/') + 1) + fileName;
    await FileSystem.moveAsync({ from: uri, to: finalUri });
  } catch { finalUri = uri; }
  await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: translate('receipt.fileTitle'), UTI: 'com.adobe.pdf' });
}

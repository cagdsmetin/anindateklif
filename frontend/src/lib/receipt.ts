import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { CompanyT, TahsilatEntryT } from '@/src/lib/api';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import { downloadFileWeb } from '@/src/lib/web-download';

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

const PARA: Record<string, [string, string, string]> = {
  TRY: ['₺', 'Türk Lirası', 'Kuruş'],
  USD: ['$', 'ABD Doları', 'Sent'],
  EUR: ['€', 'Euro', 'Sent'],
};

export function tutarYaziyla(tutar: number, cur: string) {
  const [, ana, alt] = PARA[cur] || PARA.TRY;
  const tam = Math.floor(tutar);
  const kurus = Math.round((tutar - tam) * 100);
  return `Yalnız ${sayiyiYaziyaCevir(tam)} ${ana}${kurus ? ` ${sayiyiYaziyaCevir(kurus)} ${alt}` : ''}`;
}

export function buildReceiptHtml(company: CompanyT, tx: TahsilatEntryT): string {
  const cur = tx.paraBirimi || 'TRY';
  const sym = (PARA[cur] || PARA.TRY)[0];
  const tutar = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tx.tutar || 0);
  const tarih = (tx.tarih || '').split('-').reverse().join('.');
  const no = `M-${(tx.tarih || '').replace(/-/g, '').slice(2)}-${(tx.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase()}`;
  const logo = company.logoBase64 ? `<img src="${esc(company.logoBase64)}" class="logo"/>` : `<div class="lf">${esc(company.sirketAdi)}</div>`;
  const nusha = (label: string) => `
  <div class="rc">
    <div class="head">${logo}<div class="co"><b>${esc(company.sirketAdi)}</b><br/>${esc(company.adres || '')}<br/>${esc(company.telefon || '')}${company.vergiNo ? ` · VKN ${esc(company.vergiDairesi || '')} ${esc(company.vergiNo)}` : ''}</div></div>
    <div class="title"><span>TAHSİLAT MAKBUZU</span><small>${label}</small></div>
    <table>
      <tr><td>Makbuz No</td><td><b>${esc(no)}</b></td><td>Tarih</td><td><b>${esc(tarih)}</b></td></tr>
      <tr><td>Ödeyen</td><td colspan="3"><b>${esc(tx.musteriAdi)}</b>${tx.musteriTelefon ? ` · ${esc(tx.musteriTelefon)}` : ''}</td></tr>
      <tr><td>Ödeme şekli</td><td colspan="3">${esc(tx.yontem || 'Nakit')}</td></tr>
      ${tx.notlar ? `<tr><td>Açıklama</td><td colspan="3">${esc(tx.notlar)}</td></tr>` : ''}
    </table>
    <div class="amount"><div class="fig">${sym}${tutar}</div><div class="words">${esc(tutarYaziyla(tx.tutar || 0, cur))}</div></div>
    <p class="txt">Yukarıda belirtilen tutar, ${esc(tx.musteriAdi)} tarafından ${esc(company.sirketAdi)} adına tahsil edilmiştir.</p>
    <div class="sign"><div>Teslim Eden<br/><span>Ad Soyad / İmza</span></div><div>Teslim Alan<br/><span>${esc(company.sirketAdi)} · Kaşe / İmza</span></div></div>
  </div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
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
</style></head><body>${nusha('Müşteri nüshası')}${nusha('Firma nüshası')}</body></html>`;
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
  await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: 'Tahsilat Makbuzu', UTI: 'com.adobe.pdf' });
}

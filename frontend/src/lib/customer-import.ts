import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

// Excel / CSV'den musteri aktarimi: dosyayi okur, basliklari (Firma, Ad Soyad,
// Telefon, GSM, E-posta, Adres...) esnek eslestirir; baslik yoksa sutun
// sirasini Firma, Yetkili, Telefon, E-posta, Adres kabul eder.

export type ImportCustomer = { firma: string; yetkili: string; telefon: string; email: string; adres: string };

const norm = (s: string) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ALIASES: Record<keyof ImportCustomer | 'ad' | 'soyad', string[]> = {
  firma: ['firma', 'firma adi', 'firma unvani', 'unvan', 'musteri', 'musteri adi', 'ad soyad', 'adi soyadi', 'isim', 'isim soyisim', 'sirket', 'company', 'name', 'customer', 'cari', 'cari adi'],
  yetkili: ['yetkili', 'yetkili kisi', 'ilgili', 'ilgili kisi', 'contact', 'contact person'],
  telefon: ['telefon', 'tel', 'gsm', 'cep', 'cep telefonu', 'telefon no', 'phone', 'mobile', 'telefon numarasi'],
  email: ['e posta', 'eposta', 'email', 'e mail', 'mail'],
  adres: ['adres', 'address', 'fatura adresi', 'acik adres'],
  ad: ['ad', 'adi', 'first name'],
  soyad: ['soyad', 'soyadi', 'last name'],
};

function detectHeader(row: string[]): Partial<Record<keyof typeof ALIASES, number>> | null {
  const map: Partial<Record<keyof typeof ALIASES, number>> = {};
  row.forEach((cell, i) => {
    const n = norm(cell);
    (Object.keys(ALIASES) as (keyof typeof ALIASES)[]).forEach((k) => {
      if (map[k] == null && ALIASES[k].includes(n)) map[k] = i;
    });
  });
  const hasName = map.firma != null || map.ad != null;
  return hasName && Object.keys(map).length >= 1 ? map : null;
}

export function rowsToCustomers(rows: string[][]): { customers: ImportCustomer[]; headerFound: boolean } {
  if (!rows.length) return { customers: [], headerFound: false };
  const header = detectHeader(rows[0]);
  const body = header ? rows.slice(1) : rows;
  const m = header || { firma: 0, yetkili: 1, telefon: 2, email: 3, adres: 4 };
  const get = (r: string[], i?: number) => (i == null ? '' : String(r[i] ?? '').trim());
  const customers = body
    .map((r) => {
      let firma = get(r, m.firma);
      if (!firma && (m.ad != null || m.soyad != null)) firma = `${get(r, m.ad)} ${get(r, m.soyad)}`.trim();
      return { firma, yetkili: get(r, m.yetkili), telefon: get(r, m.telefon), email: get(r, m.email), adres: get(r, m.adres) };
    })
    .filter((c) => c.firma);
  return { customers, headerFound: !!header };
}

function textToRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0] || '';
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  return lines.map((line) => {
    // Basit CSV: tirnak icindeki ayraci korur
    const out: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

/** Dosya secer ve musterileri cikarir; iptal edilirse null. */
export async function pickCustomerFile(): Promise<{ fileName: string; customers: ImportCustomer[]; headerFound: boolean } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = (asset.name || '').toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || !!asset.mimeType?.includes('spreadsheet') || !!asset.mimeType?.includes('ms-excel');
  const webFile: any = (asset as any).file;
  let rows: string[][];
  if (isExcel) {
    const wb = Platform.OS === 'web' && webFile
      ? XLSX.read(await webFile.arrayBuffer(), { type: 'array' })
      : XLSX.read(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }), { type: 'base64' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = sheet ? XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' }) : [];
    rows = raw.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : [])).filter((r) => r.some((c) => c));
  } else {
    const text = Platform.OS === 'web' && webFile ? await webFile.text() : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    rows = textToRows(text);
  }
  return { fileName: asset.name || 'dosya', ...rowsToCustomers(rows) };
}

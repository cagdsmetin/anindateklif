import type { PublicCardT } from './api';

const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);

/** Kartvizitten "Rehbere ekle" için vCard 3.0 metni. */
export function buildVCard(c: PublicCardT, url: string): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(c.sirketAdi)}`, `ORG:${esc(c.sirketAdi)}`];
  if (c.telefon) lines.push(`TEL;TYPE=WORK,VOICE:${c.telefon.replace(/\s+/g, '')}`);
  if (c.telefon2) lines.push(`TEL;TYPE=CELL:${c.telefon2.replace(/\s+/g, '')}`);
  if (c.email) lines.push(`EMAIL;TYPE=WORK:${c.email}`);
  if (c.adres) lines.push(`ADR;TYPE=WORK:;;${esc(c.adres)};;;;`);
  if (c.website) lines.push(`URL:${c.website.startsWith('http') ? c.website : 'https://' + c.website}`);
  lines.push(`URL:${url}`);
  if (c.slogan) lines.push(`NOTE:${esc(c.slogan)}`);
  const logo = (c.logoBase64 || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (logo && logo[2].length < 150000) lines.push(`PHOTO;ENCODING=b;TYPE=${logo[1] === 'png' ? 'PNG' : 'JPEG'}:${logo[2]}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

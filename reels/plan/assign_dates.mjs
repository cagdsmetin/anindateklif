#!/usr/bin/env node
// Paylaşım günlerini (day 1..N) takvime yeniden dağıtır.
//
// Kullanım (reels/ klasöründen):
//   node plan/assign_dates.mjs --start 2026-10-05 --skip 2026-10-07,2026-10-09
//   node plan/assign_dates.mjs --start 2026-10-05 --dry-run
//
// - day 1, start tarihine; sonraki günler, --skip listesinde OLMAYAN ardışık takvim günlerine atanır.
// - Bugünden (Europe/Istanbul) önceki hiçbir tarihe atama yapılmaz; varsa hata verip çıkar.
// - Bugüne düşen ve saati geçmiş paylaşımlar için uyarı yazar.
// - posts.json içindeki date, weekday, time (hafta sonu sabah hikâyesi 10:30), datetime ve
//   LinkedIn hafta sonu notunu günceller; takvim.md içindeki tabloyu
//   <!-- TAKVIM:START --> ... <!-- TAKVIM:END --> arasında yeniden yazar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const LI_WEEKEND_NOTE = "Hafta sonu LinkedIn erişimi düşük; isteğe bağlı paylaş ya da bir sonraki iş gününe 08:30'a kaydır.";

function args() {
  const a = process.argv.slice(2);
  const o = { skip: [], dryRun: false, file: path.join(HERE, 'posts.json'), takvim: path.join(HERE, 'takvim.md') };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--start') o.start = a[++i];
    else if (k === '--skip') o.skip = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--file') o.file = path.resolve(a[++i]);
    else if (k === '--takvim') o.takvim = path.resolve(a[++i]);
    else if (k === '--dry-run') o.dryRun = true;
    else if (k === '-h' || k === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n')); process.exit(0); }
    else { console.error('Bilinmeyen argüman: ' + k); process.exit(2); }
  }
  return o;
}

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();

function istanbulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

const o = args();
if (!o.start || !isDate(o.start)) { console.error('--start YYYY-AA-GG gerekli'); process.exit(2); }
for (const s of o.skip) if (!isDate(s)) { console.error('Geçersiz --skip tarihi: ' + s); process.exit(2); }

const now = istanbulNow();
if (o.start < now.date) {
  console.error(`Başlangıç ${o.start}, bugünden (${now.date}, Europe/Istanbul) önce. Geçmiş güne paylaşım planlanmaz.`);
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(o.file, 'utf8'));
const days = [...new Set(posts.map(p => p.day))].sort((a, b) => a - b);
const skip = new Set(o.skip);

// day index -> date
const map = new Map();
let cur = o.start;
for (const d of days) {
  while (skip.has(cur)) cur = addDays(cur, 1);
  map.set(d, cur);
  cur = addDays(cur, 1);
}

const warnings = [];
for (const p of posts) {
  const date = map.get(p.day);
  if (date < now.date) { console.error(`${p.id}: ${date} geçmiş bir tarih. İptal edildi.`); process.exit(1); }
  const wd = dow(date);
  const weekend = wd === 0 || wd === 6;
  p.date = date;
  p.weekday = GUNLER[wd];
  if (p.kind === 'story' && p.slot === 'sabah teaser') p.time = weekend ? '10:30' : '09:15';
  p.datetime = `${date}T${p.time}:00+03:00`;
  const li = p.platforms && p.platforms.linkedin;
  if (li) { if (weekend) li.note = LI_WEEKEND_NOTE; else delete li.note; }
  if (date === now.date && p.time <= now.time) warnings.push(`${p.id} bugün ${p.time} (saati geçmiş)`);
}
posts.sort((a, b) => a.datetime.localeCompare(b.datetime) || a.id.localeCompare(b.id));

function table(items) {
  const rows = [
    '| Gün | Tarih | Saat | Tür | ID | Dosya | Platformlar | Hook / Başlık |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const it of items) {
    const [y, m, d] = it.date.split('-');
    const plats = it.kind === 'reel'
      ? 'IG Reels · FB Reels · YT Shorts · LinkedIn' + (it.platforms.linkedin && it.platforms.linkedin.priority === 'yedek' ? ' (yedek)' : '')
      : 'IG Story · FB Story';
    const hook = it.kind === 'reel' ? it.title : `${it.slot}: ${it.platforms.instagram.note}`;
    rows.push(`| ${it.day} | ${d}.${m}.${y} ${it.weekday} | ${it.time} | ${it.kind === 'reel' ? 'Reel' : 'Story'} | ${it.id} | \`${it.asset}\` | ${plats} | ${String(hook).replace(/\|/g, '/')} |`);
  }
  return rows.join('\n');
}

console.log('Atama (day → tarih):');
for (const [d, date] of map) console.log(`  ${d} → ${date} ${GUNLER[dow(date)]}`);
if (warnings.length) console.warn('Uyarı:\n  ' + warnings.join('\n  '));
if (o.dryRun) { console.log('(dry-run: dosyalar yazılmadı)'); process.exit(0); }

fs.writeFileSync(o.file, JSON.stringify(posts, null, 2) + '\n');
console.log('Yazıldı: ' + o.file);

if (fs.existsSync(o.takvim)) {
  const md = fs.readFileSync(o.takvim, 'utf8');
  const re = /(<!-- TAKVIM:START -->)[\s\S]*?(<!-- TAKVIM:END -->)/;
  if (re.test(md)) {
    fs.writeFileSync(o.takvim, md.replace(re, `$1\n${table(posts)}\n$2`));
    console.log('Güncellendi: ' + o.takvim);
  } else console.warn('takvim.md içinde TAKVIM işaretleri yok; tablo güncellenmedi.');
}

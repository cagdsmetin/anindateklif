// Müzik/miks nesnel QA: preset demoları (preview/music_demos/*.wav) ve finaller (out/final/*.mp4).
//   node lib/music-qa.mjs                 # demolar + mevcut tüm finaller
//   node lib/music-qa.mjs file.mp4 ...    # yalnızca verilenler (nota günlüğü id'den bulunur)
// Ölçülenler: entegre LUFS, true peak, LRA (ffmpeg ebur128); spektral denge (<120, 120–500,
// 500–2k, 2–6k, >6k Hz enerji payı); telefon hoparlörü bandı (300 Hz–4 kHz) payı; clipping/DC;
// onset otokorelasyonu ile tempo tahmini (hedef BPM ile; yarım/çift kabul); nota günlüğünden
// (preview/music_notes/<id>.json) diyatoniklik, bas↔akor (kök/üçlü/beşli), melodi akor tonu payı,
// hook başlangıç zamanı. Çıktı: preview/music_qa.json + preview/music_qa.md
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './music.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const SR = 48000, MAJOR = [0, 2, 4, 5, 7, 9, 11];
const LIM = { I: [-14.5, -13.5], TP: -1.0, sub: 0.45, harsh: 0.12, phone: 0.30, bpm: [110, 128], hook: 1.0, nct: 0.2 };

function ebur(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const g = re => { const m = re.exec(s); return m ? parseFloat(m[1]) : null; };
  return { I: g(/I:\s+(-?[\d.]+) LUFS/), LRA: g(/LRA:\s+(-?[\d.]+) LU/), TP: g(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}
function decode(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', file, '-map', '0:a:0', '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const b = r.stdout; const x = new Float32Array(b.buffer, b.byteOffset, b.length >> 2);
  const n = x.length >> 1, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1]; }
  return { L, R, n };
}
function fft(re, im) { // yerinde radix-2
  const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
export function spectral(m) {
  const N = 4096, hop = 2048, win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const edges = [0, 120, 500, 2000, 6000, 24000], band = new Float64Array(5); let phone = 0, tot = 0;
  for (let s = 0; s + N <= m.length; s += hop) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = m[s + i] * win[i]; fft(re, im);
    for (let k = 1; k < N / 2; k++) { const f = k * SR / N, e = re[k] * re[k] + im[k] * im[k]; tot += e; if (f >= 300 && f <= 4000) phone += e;
      for (let b = 0; b < 5; b++) if (f >= edges[b] && f < edges[b + 1]) { band[b] += e; break; } } }
  return { bands: Array.from(band, e => +(e / tot).toFixed(3)), phone: +(phone / tot).toFixed(3) };
}
export function tempo(m, target) {
  const N = 1024, hop = 512, fps = SR / hop, win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let prev = null; const env = [];
  for (let s = 0; s + N <= m.length; s += hop) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = m[s + i] * win[i]; fft(re, im);
    const mag = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
    let fl = 0; if (prev) for (let k = 1; k < N / 2; k++) fl += Math.max(0, mag[k] - prev[k]); env.push(fl); prev = mag; }
  const mu = env.reduce((a, b) => a + b, 0) / env.length, e = env.map(v => v - mu);
  const ac = lag => { let s = 0; for (let i = 0; i + lag < e.length; i++) s += e[i] * e[i + lag]; return s / (e.length - lag); };
  // 80–180 BPM aralığında en güçlü periyot (kesirli gecikme: komşu doğrusal ara değer)
  // Puan: periyot + 2× + ½× (alt bölüm de nabız olmalı) × log-Gauss tempo önseli (120 BPM, σ=1 oktav)
  const acf = lag => { const l0 = Math.floor(lag), a = lag - l0; return ac(l0) * (1 - a) + ac(l0 + 1) * a; };
  let best = -Infinity, bestBpm = 0; for (let bpm = 80; bpm <= 180; bpm += 0.25) { const lag = 60 * fps / bpm;
    const v = (acf(lag) + 0.5 * acf(2 * lag) + 0.5 * acf(lag / 2)) * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2); if (v > best) { best = v; bestBpm = bpm; } }
  const ok = target ? [target, target / 2, target * 2, ].some(t => Math.abs(bestBpm - t) / t < 0.025) : null;
  return { est: bestBpm, ok };
}
function harmony(log) {
  if (!log) return null; const key = log.key, sc = MAJOR.map(x => (x + key) % 12), P = PRESETS[log.preset];
  const chordPcs = deg => [0, 2, 4].concat(P?.seventh ? [6] : []).map(k => sc[(deg + k) % 7]);
  let nonDia = 0, badBass = 0, badChord = 0, lead = 0, leadNct = 0; const perBar = {};
  for (const n of log.notes) { const pc = ((n.midi % 12) + 12) % 12, cp = chordPcs(n.deg);
    (perBar[n.bar] ||= []).push(n.midi);
    if (!sc.includes(pc)) nonDia++;
    if (n.role === 'bass' && !cp.slice(0, 3).includes(pc)) badBass++;
    if (n.role === 'chord' && !cp.includes(pc)) badChord++;
    if (n.role === 'lead') { lead++; if (!cp.slice(0, 3).includes(pc)) leadNct++; } }
  const leadHz = log.notes.filter(n => n.role === 'lead').map(n => 440 * 2 ** ((n.midi - 69) / 12)).sort((a, b) => a - b);
  return { notes: log.notes.length, nonDiatonic: nonDia, bassNotChordTone: badBass, chordNotInChord: badChord, leadNonChordShare: +(leadNct / Math.max(1, lead)).toFixed(3),
    leadMedianHz: Math.round(leadHz[leadHz.length >> 1] || 0), hookT: log.events?.hookT, bars: Object.keys(perBar).length };
}

function check(file, kind) {
  const base = path.basename(file).replace(/\.(wav|mp4)$/, ''), id = kind === 'demo' ? `demo_${base}` : base;
  let log = null; try { log = JSON.parse(fs.readFileSync(path.join(ROOT, 'preview/music_notes', `${id}.json`), 'utf8')); } catch {}
  const L = ebur(file), a = decode(file), m = new Float32Array(a.n); let clip = 0, dcL = 0, dcR = 0;
  for (let i = 0; i < a.n; i++) { m[i] = 0.5 * (a.L[i] + a.R[i]); if (Math.abs(a.L[i]) >= 0.999 || Math.abs(a.R[i]) >= 0.999) clip++; dcL += a.L[i]; dcR += a.R[i]; }
  const dc = Math.max(Math.abs(dcL), Math.abs(dcR)) / a.n, sp = spectral(m), bpm = log?.bpm ?? null, tp = tempo(m, bpm), h = harmony(log);
  const fails = [], warns = [];
  if (!(L.I >= LIM.I[0] && L.I <= LIM.I[1])) fails.push(`LUFS ${L.I}`);
  if (!(L.TP <= LIM.TP)) fails.push(`TP ${L.TP}`);
  if (sp.bands[0] > LIM.sub) fails.push(`sub ${sp.bands[0]}`);
  if (sp.bands[4] > LIM.harsh) fails.push(`>6k ${sp.bands[4]}`);
  if (sp.phone < LIM.phone) fails.push(`phone ${sp.phone}`);
  if (clip) fails.push(`clip ${clip}`); if (dc > 1e-3) fails.push(`DC ${dc.toExponential(1)}`);
  if (tp.ok === false) (kind === 'demo' ? fails : warns).push(`tempo ${tp.est}≠${bpm}`);
  if (h) { if (h.nonDiatonic) fails.push(`diyatonik dışı ${h.nonDiatonic}`); if (h.bassNotChordTone) fails.push(`bas ${h.bassNotChordTone}`); if (h.chordNotInChord) fails.push(`akor ${h.chordNotInChord}`);
    if (h.leadNonChordShare > LIM.nct) fails.push(`melodi akor dışı ${h.leadNonChordShare}`);
    if (h.hookT == null || h.hookT > LIM.hook) fails.push(`hook ${h.hookT}`);
    if (h.leadMedianHz < 250 || h.leadMedianHz > 2000) warns.push(`melodi ${h.leadMedianHz} Hz`); }
  else warns.push('nota günlüğü yok');
  if (bpm && (bpm < LIM.bpm[0] || bpm > LIM.bpm[1])) warns.push(`BPM ${bpm} tercih aralığı dışında`);
  return { file: path.relative(ROOT, file), kind, id, preset: log?.preset ?? null, bpm, ...L, bands: sp.bands, phone: sp.phone, clip, dc: +dc.toExponential(2), tempoEst: tp.est, tempoOk: tp.ok, harmony: h, pass: !fails.length, fails, warns };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const args = process.argv.slice(2);
let files = args.map(f => [path.resolve(f), /music_demos/.test(f) ? 'demo' : 'final']);
if (!files.length) {
  const dd = path.join(ROOT, 'preview/music_demos'), fd = path.join(ROOT, 'out/final');
  if (fs.existsSync(dd)) files.push(...fs.readdirSync(dd).filter(f => f.endsWith('.wav')).sort().map(f => [path.join(dd, f), 'demo']));
  if (fs.existsSync(fd)) files.push(...fs.readdirSync(fd).filter(f => f.endsWith('.mp4')).sort().map(f => [path.join(fd, f), 'final']));
}
const res = []; for (const [f, k] of files) { const r = check(f, k); res.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.file}  I ${r.I} TP ${r.TP} LRA ${r.LRA}  bands ${r.bands.join('/')}  phone ${r.phone}  tempo ${r.tempoEst}/${r.bpm}  ${r.fails.concat(r.warns.map(w => '(' + w + ')')).join(', ')}`); }
fs.writeFileSync(path.join(ROOT, 'preview/music_qa.json'), JSON.stringify({ limits: LIM, generated: new Date().toISOString(), results: res }, null, 1));
const md = ['# Müzik QA', '', `Sınırlar: I ${LIM.I.join('…')} LUFS, TP ≤ ${LIM.TP} dBTP, <120 Hz ≤ ${LIM.sub * 100}%, >6 kHz ≤ ${LIM.harsh * 100}%, 300 Hz–4 kHz ≥ ${LIM.phone * 100}%, hook ≤ ${LIM.hook} s, melodi akor dışı ≤ ${LIM.nct * 100}%, tempo ±2.5% (yarım/çift kabul)`, '',
  '| Sonuç | Dosya | Preset | BPM (tahmin) | LUFS | TP | LRA | <120 / 120–500 / 500–2k / 2–6k / >6k | 300–4k | Uyum (dışı/bas/akor/NCT) | Hook | Notlar |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...res.map(r => `| ${r.pass ? '✅ PASS' : '❌ FAIL'} | ${r.file} | ${r.preset ?? '-'} | ${r.bpm ?? '-'} (${r.tempoEst}) | ${r.I} | ${r.TP} | ${r.LRA} | ${r.bands.map(b => Math.round(b * 100) + '%').join(' / ')} | ${Math.round(r.phone * 100)}% | ${r.harmony ? `${r.harmony.nonDiatonic}/${r.harmony.bassNotChordTone}/${r.harmony.chordNotInChord}/${Math.round(r.harmony.leadNonChordShare * 100)}%` : '-'} | ${r.harmony?.hookT ?? '-'} s | ${r.fails.concat(r.warns).join('; ')} |`)];
fs.writeFileSync(path.join(ROOT, 'preview/music_qa.md'), md.join('\n') + '\n');
const nf = res.filter(r => !r.pass).length; console.log(`\n${res.length - nf}/${res.length} PASS → preview/music_qa.md`); if (nf) process.exitCode = 1;
}

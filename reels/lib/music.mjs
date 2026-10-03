// Prosedürel müzik motoru — 8 telifsiz, deterministik, majör tonda, neşeli preset.
// lib/audio.mjs kullanır. Her preset: BPM, ton, 4 akorluk dizi, davul/bas/akor/melodi
// desenleri ve 2 ölçülük akılda kalan bir "hook" motifi.
//
// Ortak yapı (sayfadaki CUES'a göre):
//   t=0 hook darbesi (sub drop + çatırtı + kısa riser kuyruğu), ilk ~1.5 sn filtreli
//   açılış (melodi t=0'da başlar), her 'whoosh'a kısa riser, CTA'dan hemen önce
//   break (davul/bas/melodi susar, V akoru + riser), CTA'da drop (ızgara CTA'ya
//   yeniden hizalanır, dizi baştan), logoda tonik akorla çözülme.
// Melodi notaları akor tonu merdiveninden (ladder) seçilir → her zaman konsonan;
// yarım indeks (ör. 3.5) iki akor tonu arasındaki diyatonik geçiş notasıdır.
// Üretilen her nota `notes` günlüğüne yazılır (lib/music-qa.mjs tutarlılık denetimi).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SR = 48000;
const TAU = Math.PI * 2;
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MAP_FILE = path.resolve(HERE, '../plan/music_map.json');

// ---------- yardımcılar ----------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const db = d => Math.pow(10, d / 20);
export class Bus {
  constructor(n) { this.n = n; this.L = new Float32Array(n); this.R = new Float32Array(n); }
  add(i, l, r) { if (i >= 0 && i < this.n) { this.L[i] += l; this.R[i] += r; } }
  mix(o, g = 1) { for (let i = 0; i < this.n; i++) { this.L[i] += o.L[i] * g; this.R[i] += o.R[i] * g; } }
  scale(g) { for (let i = 0; i < this.n; i++) { this.L[i] *= g; this.R[i] *= g; } }
}
export const panLR = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
export class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; }
  run(x, fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  }
}
export const edge = (t, len, a = 0.002, r = 0.006) => (a > 0 ? clamp(t / a) : 1) * (r > 0 ? clamp((len - t) / r) : 1);
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
const sawAt = (ph, dt) => 2 * ph - 1 - blep(ph, dt); // ph 0..1

// BS.1770 K-ağırlıklı entegre ses yüksekliği (48 kHz; kapılı). Stereo Bus ya da mono dizi.
export function lufs(L, R = L) {
  const b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], a1 = [-1.69065929318241, 0.73248077421585];
  const b2 = [1, -2, 1], a2 = [-1.99004745483398, 0.99007225036621];
  const kw = x => { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let i = 0; i < x.length; i++) { const s = b1[0] * x[i] + b1[1] * x1 + b1[2] * x2 - a1[0] * y1 - a1[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = s;
      const u = b2[0] * s + b2[1] * z1 + b2[2] * z2 - a2[0] * w1 - a2[1] * w2; z2 = z1; z1 = s; w2 = w1; w1 = u; y[i] = u; } return y; };
  const l = kw(L), r = R === L ? l : kw(R), blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR), z = [];
  for (let s = 0; s + blk <= l.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += l[i] * l[i] + r[i] * r[i]; z.push(e / blk); }
  const L_ = e => -0.691 + 10 * Math.log10(e);
  let g = z.filter(e => L_(e) > -70); if (!g.length) return -Infinity;
  const rel = L_(g.reduce((a, b) => a + b, 0) / g.length) - 10; g = g.filter(e => L_(e) > rel);
  return g.length ? L_(g.reduce((a, b) => a + b, 0) / g.length) : -Infinity;
}

// ---------- presetler ----------
// pat: 16'lık adımlar. X=1, x=.8, o=.5 vuruş; '-' bağ (uzatma); '.' sus.
// bas: R kök, O oktav, F beşli, r kısık kök. strum: D aşağı / U yukarı tel sırası.
// lead: [vuruş(0..8), ladder indeksi, süre(vuruş)]  — A ve B (cevap) motifleri.
export const PRESETS = {
  sunny_pop: { label: 'Sunny Pop', bpm: 120, key: 2, prog: [0, 4, 5, 3], sc: 0.35,
    drums: { kick: 'X...x...X...x...', clap: '....x.......x...', hat: '..x...x...x...x.' }, lift: { shaker: 'o.oo.oo.o.oo.oo.' },
    bass: { inst: 'synth', pat: 'R-R-R-R-R-R-O-R-' },
    chords: [{ inst: 'pad', pat: 'X---------------', g: 0.6 }, { inst: 'stab', pat: '..X-..X-..X-..X-' }],
    lead: { inst: 'pluck', A: [[0, 3, .5], [.5, 3, .5], [1, 4, .5], [1.5, 3, .5], [2, 2, 1], [3, 1, .5], [3.5, 2, .5], [4, 3, .75], [4.75, 4, .75], [5.5, 5, .5], [6, 4, 1.5]],
      B: [[0, 3, .5], [.5, 3, .5], [1, 4, .5], [1.5, 3, .5], [2, 2, 1], [3, 1, .5], [3.5, 2, .5], [4, 3, .75], [4.75, 2, .75], [5.5, 1, .5], [6, 0, 1.5]] } },
  tropical: { label: 'Tropical House', bpm: 110, key: 5, prog: [0, 3, 5, 4], sc: 0.4,
    drums: { kick: 'X...x...X...x...', clap: '....o.......o...', rim: '...x..x...x..x..', shaker: 'oxoxoxoxoxoxoxox' }, lift: { hat: '..o...o...o...o.' },
    bass: { inst: 'sub', pat: 'R-.R-.R-..R-.R-.' },
    chords: [{ inst: 'pad', pat: 'X---------------', g: 0.5 }, { inst: 'marimba', pat: '..x..x....x..x..' }],
    lead: { inst: 'marimba', A: [[0, 4, .5], [.75, 3, .5], [1.5, 4, .5], [2.5, 5, .5], [3, 4, .75], [4, 3, .5], [4.75, 2, .5], [5.5, 3, .5], [6.5, 2, 1]],
      B: [[0, 4, .5], [.75, 3, .5], [1.5, 4, .5], [2.5, 5, .5], [3, 6, .75], [4, 5, .5], [4.75, 4, .5], [5.5, 3, .5], [6.5, 4, 1]] } },
  disco: { label: 'Funky Disco', bpm: 116, key: 9, prog: [1, 4, 0, 5], sc: 0.3,
    drums: { kick: 'X...X...X...X...', clap: '....X.......X...', ohat: '..x...x...x...x.', hat: 'o...o...o...o...' }, lift: { hat: '.o.o.o.o.o.o.o.o' },
    bass: { inst: 'slap', pat: 'R.O.R.O.R.O.R.OF' },
    chords: [{ inst: 'pad', pat: 'X---------------', g: 0.55 }, { inst: 'stab', pat: '......X-.....X-.' }],
    lead: { inst: 'synthlead', A: [[0, 4, .25], [.5, 4, .25], [1, 5, .5], [1.5, 4, .5], [2, 3, .5], [2.75, 2, .75], [4, 4, .25], [4.5, 4, .25], [5, 5, .5], [5.5, 6, .5], [6, 5, 1.5]],
      B: [[0, 4, .25], [.5, 4, .25], [1, 5, .5], [1.5, 4, .5], [2, 3, .5], [2.75, 2, .75], [4, 4, .25], [4.5, 4, .25], [5, 5, .5], [5.5, 4, .5], [6, 3, 1.5]] } },
  ukulele: { label: 'Feel-good Ukulele', bpm: 112, key: 0, prog: [0, 3, 0, 4], sc: 0.15,
    drums: { kick: 'X.......x.......', snap: '....x.......x...' }, lift: { shaker: 'o.o.o.o.o.o.o.o.' },
    bass: { inst: 'sub', pat: 'R-------F-------' },
    chords: [{ inst: 'strum', pat: 'D...D.U...U.D.U.' }],
    lead: { inst: 'whistle', oct: 1, A: [[0, 2, .5], [.5, 3, .5], [1, 4, 1], [2, 3.5, .5], [2.5, 3, .5], [3, 2, 1], [4, 3, .5], [4.5, 4, .5], [5, 5, 1], [6, 4, .5], [6.5, 3, 1.5]],
      B: [[0, 2, .5], [.5, 3, .5], [1, 4, 1], [2, 3.5, .5], [2.5, 3, .5], [3, 2, 1], [4, 3, .5], [4.5, 2, .5], [5, 1, 1], [6, 1.5, .5], [6.5, 2, 1.5]] } },
  afro_house: { label: 'Afro House', bpm: 122, key: 7, prog: [0, 2, 3, 4], sc: 0.3,
    drums: { kick: 'X...x...X...x...', rim: '...x..x...x...x.', shaker: 'oxooxoooxoxoxooo', conga: '..o..x.o..o.x..o', clap: '....o.......o...' }, lift: { hat: '..o...o...o...o.' },
    bass: { inst: 'sub', pat: 'R-...R-.R-...R-.' },
    chords: [{ inst: 'pad', pat: 'X---------------' }],
    lead: { inst: 'bell', A: [[0, 4, .25], [.75, 4, .25], [1.5, 5, .25], [2, 4, .25], [2.75, 3, .25], [3.5, 4, .5], [4, 4, .25], [4.75, 4, .25], [5.5, 5, .25], [6, 6, .25], [6.75, 5, .5]],
      B: [[0, 4, .25], [.75, 4, .25], [1.5, 5, .25], [2, 4, .25], [2.75, 3, .25], [3.5, 4, .5], [4, 3, .25], [4.75, 3, .25], [5.5, 2, .25], [6, 3, .25], [6.75, 2, .5]] } },
  future_bass: { label: 'Future Bass / Synthwave', bpm: 128, key: 4, prog: [3, 0, 4, 5], sc: 0.6,
    drums: { kick: 'X...X...X...X...', clap: '....X.......X...', hat: '..o...o...o...o.' }, lift: { hat: '.o.o.o.o.o.o.o.o' },
    bass: { inst: 'synth', pat: 'R-------R-------' },
    chords: [{ inst: 'supersaw', pat: 'X---------------' }],
    lead: { inst: 'pluck', A: [[0, 3, .5], [.5, 4, .5], [1, 5, .5], [1.5, 4, .25], [1.75, 3, .25], [2, 4, 1], [3.5, 3, .5], [4, 3, .5], [4.5, 4, .5], [5, 5, .5], [5.5, 6, .5], [6, 5, 1.5]],
      B: [[0, 3, .5], [.5, 4, .5], [1, 5, .5], [1.5, 4, .25], [1.75, 3, .25], [2, 4, 1], [3.5, 3, .5], [4, 3, .5], [4.5, 2, .5], [5, 3, .5], [5.5, 2, .5], [6, 1, 1.5]] } },
  lofi_happy: { label: 'Chill-happy Lo-fi', bpm: 110, key: 3, prog: [0, 5, 1, 4], sc: 0.15, seventh: true, swing: 0.14, crackle: true,
    drums: { kick: 'X.........x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.' }, lift: { shaker: '..o...o...o...o.' },
    bass: { inst: 'sub', pat: 'R-----..R-----..' },
    chords: [{ inst: 'rhodes', pat: 'X---------x-----' }],
    lead: { inst: 'bell', A: [[0, 4, 1], [1.5, 3, .5], [2, 2, 1.5], [4, 3, .75], [4.75, 4, .25], [5, 5, 1], [6.5, 4, 1]],
      B: [[0, 4, 1], [1.5, 3, .5], [2, 2, 1.5], [4, 3, .75], [4.75, 2, .25], [5, 1, 1], [6.5, 2, 1]] }, mix: { lead: -27 } },
  stomp_folk: { label: 'Stomp & Clap Folk-pop', bpm: 124, key: 10, prog: [0, 5, 3, 4], sc: 0.25,
    drums: { stomp: 'X.......X.......', clap: '....X.......X...', tamb: '..x...x...x...x.' }, lift: { tamb: 'o.o.o.o.o.o.o.o.' },
    bass: { inst: 'pluck', pat: 'R...R...R...R...' },
    chords: [{ inst: 'strum', pat: 'D.D.D.D.D.D.D.D.', low: true }],
    lead: { inst: 'glock', A: [[0, 2, .5], [.5, 2, .5], [1, 3, .5], [1.5, 4, .5], [2, 4, 1], [3, 3, .5], [3.5, 2, .5], [4, 2, .5], [4.5, 3, .5], [5, 4, 1], [6, 3, .5], [6.5, 2, 1.5]],
      B: [[0, 2, .5], [.5, 2, .5], [1, 3, .5], [1.5, 4, .5], [2, 4, 1], [3, 5, .5], [3.5, 4, .5], [4, 4, .5], [4.5, 3, .5], [5, 2, 1], [6, 1, .5], [6.5, 0, 1.5]] } },
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SHELF = db(-3);
const MIX_DEFAULT = { drums: -22.5, bass: -27.5, chords: -23.5, lead: -22.5 };

// id → preset: plan/music_map.json (elle düzenlenebilir), yoksa id hash'i.
export function presetFor(id, override) {
  if (override) { if (!PRESETS[override]) throw new Error(`bilinmeyen müzik preset'i: ${override} (${Object.keys(PRESETS).join(', ')})`); return override; }
  try { const m = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); if (id && m[id] && PRESETS[m[id]]) return m[id]; } catch {}
  const names = Object.keys(PRESETS); let h = 0; for (const c of String(id || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return names[h % names.length];
}

// ---------- enstrümanlar (hepsi bus'a toplar; v = hız 0..1) ----------
const I = {
  kick(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.38; let ph = 0; const f = new SVF();
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * (58 + 140 * Math.exp(-t / 0.02) + 260 * Math.exp(-t / 0.0025)) / SR;
      const body = Math.sin(ph) * Math.exp(-t / 0.075) + 0.25 * Math.sin(2 * ph) * Math.exp(-t / 0.03), click = f.run(R() * 2 - 1, 3200, 0.7).bp * Math.exp(-t / 0.0025) * 1.3;
      const y = Math.tanh(1.7 * (body + click)) / Math.tanh(1.7) * 0.5 * v * edge(t, L, 0.0006, 0.04); bus.add(s + j, y, y); } },
  stomp(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.42; let ph = 0; const f = new SVF();
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * (60 + 45 * Math.exp(-t / 0.03)) / SR;
      const n = f.run(R() * 2 - 1, 900, 0.7).lp * Math.exp(-t / 0.06) * 2.2;
      const y = Math.tanh(1.4 * (Math.sin(ph) * Math.exp(-t / 0.08) + n)) * 0.5 * v * edge(t, L, 0.001, 0.05); bus.add(s + j, y, y); } },
  clap(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.3; const f = [new SVF(), new SVF()];
    for (let j = 0; j < L * SR; j++) { const t = j / SR;
      const e = Math.max(...[0, 0.009, 0.019].map(o => t >= o ? Math.exp(-(t - o) / 0.006) : 0)) * 0.8 + (t > 0.019 ? Math.exp(-(t - 0.019) / 0.085) : 0) * 0.55;
      const l = f[0].run(R() * 2 - 1, 1500, 1.1).bp, r = f[1].run(R() * 2 - 1, 1450, 1.1).bp;
      const g = 0.6 * v * e * edge(t, L, 0.0005, 0.05); bus.add(s + j, l * g, r * g); } },
  snare(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.28; let ph = 0; const f = new SVF(), f2 = new SVF();
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * (185 + 40 * Math.exp(-t / 0.01)) / SR;
      const n = f2.run(f.run(R() * 2 - 1, 1800, 0.7).hp, 7000, 0.7).lp;
      const y = (0.5 * Math.sin(ph) * Math.exp(-t / 0.05) + 0.7 * n * Math.exp(-t / 0.09)) * 0.55 * v * edge(t, L, 0.0006, 0.05); bus.add(s + j, y, y); } },
  snap(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.12; const f = new SVF(); let ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * 1100 / SR;
      const y = (f.run(R() * 2 - 1, 2400, 1.8).bp * Math.exp(-t / 0.018) + 0.2 * Math.sin(ph) * Math.exp(-t / 0.006)) * 0.6 * v * edge(t, L, 0.0004, 0.03);
      const [pl, pr] = panLR(0.1); bus.add(s + j, y * pl, y * pr); } },
  rim(bus, t0, v) { const s = Math.round(t0 * SR), L = 0.06; let a = 0, b = 0; const [pl, pr] = panLR(-0.3);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; a += TAU * 1650 / SR; b += TAU * 820 / SR;
      const y = (Math.sin(a) * 0.6 + Math.sin(b) * 0.5) * Math.exp(-t / 0.011) * 0.16 * v * edge(t, L, 0.0004, 0.01); bus.add(s + j, y * pl, y * pr); } },
  hat(bus, t0, v, R, open) { const s = Math.round(t0 * SR), L = open ? 0.28 : 0.07; const f1 = new SVF(), f2 = new SVF(); const [pl, pr] = panLR(open ? -0.25 : 0.3);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; const y = f2.run(f1.run(R() * 2 - 1, 7200, 0.7).hp, 11500, 0.7).lp;
      const e = Math.exp(-t / (open ? 0.09 : 0.016)) * edge(t, L, 0.0006, 0.03) * (open ? 0.12 : 0.13) * v; bus.add(s + j, y * e * pl, y * e * pr); } },
  shaker(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.09; const f = new SVF(); const [pl, pr] = panLR(-0.4);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; const y = f.run(R() * 2 - 1, 6200, 1.3).bp;
      const e = clamp(t / 0.012) * Math.exp(-Math.max(0, t - 0.012) / 0.025) * edge(t, L, 0, 0.02) * 0.17 * v; bus.add(s + j, y * e * pl, y * e * pr); } },
  tamb(bus, t0, v, R) { const s = Math.round(t0 * SR), L = 0.14; const f = new SVF(); const [pl, pr] = panLR(0.35); let a = 0, b = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; a += TAU * 6900 / SR; b += TAU * 8300 / SR;
      const n = f.run(R() * 2 - 1, 6500, 0.8).hp * (0.7 + 0.3 * Math.sin(a) * Math.sin(b));
      const e = clamp(t / 0.002) * Math.exp(-t / 0.045) * edge(t, L, 0, 0.03) * 0.15 * v; bus.add(s + j, n * e * pl, n * e * pr); } },
  conga(bus, t0, v, R, hi) { const s = Math.round(t0 * SR), L = 0.25, f0 = hi ? 330 : 225; let ph = 0; const [pl, pr] = panLR(hi ? 0.4 : -0.15);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * f0 * (1 + 0.15 * Math.exp(-t / 0.008)) / SR;
      const y = (Math.sin(ph) * Math.exp(-t / 0.12) + (R() - 0.5) * 0.3 * Math.exp(-t / 0.004)) * 0.2 * v * edge(t, L, 0.0008, 0.04); bus.add(s + j, y * pl, y * pr); } },

  // ---- ezgili sesler: (bus, t0, midi, dur, v, pan, R, ctx) ----
  pluck(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = dur + 0.25, s = Math.round(t0 * SR); const fl = new SVF(); let p1 = R(), p2 = R(); const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; p1 = (p1 + f * 1.003 / SR) % 1; p2 = (p2 + f * 0.997 / SR) % 1;
      const x = 0.5 * (sawAt(p1, f / SR) + sawAt(p2, f / SR));
      const y = fl.run(x, 700 + 2800 * v * Math.exp(-t / 0.12), 0.9).lp;
      const e = clamp(t / 0.003) * (0.35 + 0.65 * Math.exp(-t / 0.18)) * clamp((dur + 0.2 - t) / 0.2) * 0.3 * v; bus.add(s + j, y * e * pl, y * e * pr); } },
  synthlead(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = dur + 0.12, s = Math.round(t0 * SR); const fl = new SVF(); let p1 = R(), p2 = R(), ps = 0; const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; const vib = 1 + 0.003 * Math.sin(TAU * 5.5 * t) * clamp((t - 0.15) / 0.15);
      p1 = (p1 + f * vib * 1.004 / SR) % 1; p2 = (p2 + f * vib * 0.996 / SR) % 1; ps += TAU * f * vib * 0.5 / SR;
      const x = 0.5 * (sawAt(p1, f / SR) + sawAt(p2, f / SR)) + 0.25 * Math.sin(ps);
      const y = fl.run(x, 1300 + 1600 * Math.exp(-t / 0.15), 0.8).lp;
      const e = clamp(t / 0.006) * (0.7 + 0.3 * Math.exp(-t / 0.1)) * clamp((dur + 0.1 - t) / 0.1) * 0.25 * v; bus.add(s + j, y * e * pl, y * e * pr); } },
  marimba(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = 0.9, s = Math.round(t0 * SR); let a = 0, b = 0; const [pl, pr] = panLR(pan); const dk = 0.4 * Math.pow(440 / f, 0.3);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; a += TAU * f / SR; b += TAU * f * 3.93 / SR;
      const y = (Math.sin(a) * Math.exp(-t / dk) + 0.3 * Math.sin(b) * Math.exp(-t / 0.035)) * 0.32 * v * edge(t, L, 0.0015, 0.1); bus.add(s + j, y * pl, y * pr); } },
  glock(bus, t0, m, dur, v, pan) { const f = mtof(m), L = 1.2, s = Math.round(t0 * SR); const ph = [0, 0, 0]; const [pl, pr] = panLR(pan);
    const P = [[1, 1, 0.55], [2, 0.18, 0.2], [2.76, 0.08, 0.06]];
    for (let j = 0; j < L * SR; j++) { const t = j / SR; let y = 0; P.forEach(([r, w, d], k) => { ph[k] += TAU * f * r / SR; y += w * Math.sin(ph[k]) * Math.exp(-t / d); });
      y *= 0.26 * v * edge(t, L, 0.001, 0.15); bus.add(s + j, y * pl, y * pr); } },
  bell(bus, t0, m, dur, v, pan) { const f = mtof(m), L = Math.max(0.6, dur + 0.5), s = Math.round(t0 * SR); let c = 0, mo = 0; const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; mo += TAU * f * 2 / SR; c += TAU * f / SR;
      const y = Math.sin(c + (0.9 * Math.exp(-t / 0.08) + 0.15) * Math.sin(mo)) * Math.exp(-t / 0.35) * 0.27 * v * edge(t, L, 0.001, 0.12); bus.add(s + j, y * pl, y * pr); } },
  whistle(bus, t0, m, dur, v, pan, R, ctx) { const f = mtof(m), f0 = ctx.prevF || f, L = dur + 0.08, s = Math.round(t0 * SR); ctx.prevF = f; let ph = 0; const fl = new SVF(); const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; const glide = f0 + (f - f0) * clamp(t / 0.05);
      const fr = glide * (1 + 0.006 * Math.sin(TAU * 5.6 * t) * clamp((t - 0.12) / 0.2)); ph += TAU * fr / SR;
      const br = fl.run(R() * 2 - 1, fr, 6).bp * 0.12;
      const e = clamp(t / 0.025) * clamp((dur + 0.06 - t) / 0.06) * 0.26 * v; bus.add(s + j, (Math.sin(ph) + br) * e * pl, (Math.sin(ph) + br) * e * pr); } },
  ks(bus, t0, m, dur, v, pan, R, ctx, o = {}) { const f = mtof(m), s = Math.round(t0 * SR), L = dur + (o.ring ?? 0.12);
    const N = SR / f - 0.5, buf = new Float32Array(Math.ceil(N) + 4); const [pl, pr] = panLR(pan);
    let lp = 0; const br = o.bright ?? 0.5; for (let k = 0; k < buf.length; k++) { lp += (R() * 2 - 1 - lp) * br; buf[k] = lp; }
    let w = 0, prev = 0; const loss = o.decay ?? 0.996;
    for (let j = 0; j < L * SR; j++) { const t = j / SR, rp = (w - N + buf.length * 4) % buf.length, i0 = Math.floor(rp), fr = rp - i0;
      const d = buf[i0] * (1 - fr) + buf[(i0 + 1) % buf.length] * fr;
      const damp = t > dur ? 0.93 : loss; const y = damp * 0.5 * (d + prev); prev = d; buf[w] = y; w = (w + 1) % buf.length;
      const e = edge(t, L, 0.0008, 0.03) * (o.g ?? 0.4) * v; bus.add(s + j, y * e * pl, y * e * pr); } },
  // ---- akor sesleri ----
  pad(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = dur + 0.35, s = Math.round(t0 * SR); const pL = new Float64Array(6), pR = new Float64Array(6); const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; let l = 0, r = 0; const br = 0.5 + 0.1 * Math.sin(TAU * t / 3);
      for (let h = 1; h <= 6; h++) { const w = Math.pow(h, -1.5) * Math.pow(br, h - 1); pL[h - 1] += TAU * f * h * 1.0025 / SR; pR[h - 1] += TAU * f * h * 0.9975 / SR; l += w * Math.sin(pL[h - 1]); r += w * Math.sin(pR[h - 1]); }
      const e = clamp(t / 0.06) * clamp((dur + 0.3 - t) / 0.3) * 0.09 * v; bus.add(s + j, l * e * pl * 1.2, r * e * pr * 1.2); } },
  stab(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = Math.min(dur, 0.3) + 0.08, s = Math.round(t0 * SR); const fl = new SVF(); let p = R(); const [pl, pr] = panLR(pan);
    for (let j = 0; j < L * SR; j++) { const t = j / SR; p = (p + f / SR) % 1;
      const y = fl.run(sawAt(p, f / SR), 900 + 1500 * Math.exp(-t / 0.05), 0.8).lp * Math.exp(-t / 0.12) * edge(t, L, 0.002, 0.06) * 0.17 * v; bus.add(s + j, y * pl, y * pr); } },
  supersaw(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = dur + 0.2, s = Math.round(t0 * SR); const det = [-14, -7, 0, 7, 14].map(c => Math.pow(2, c / 1200)); const ph = det.map(() => R());
    const fl = [new SVF(), new SVF()];
    for (let j = 0; j < L * SR; j++) { const t = j / SR; let l = 0, r = 0;
      det.forEach((d, k) => { ph[k] = (ph[k] + f * d / SR) % 1; const x = sawAt(ph[k], f * d / SR); if (k % 2) l += x; else r += x; if (k === 2) l += x; });
      const fc = 2600 + 1200 * Math.exp(-t / 0.4);
      const e = clamp(t / 0.015) * clamp((dur + 0.15 - t) / 0.15) * 0.045 * v; bus.add(s + j, fl[0].run(l, fc, 0.7).lp * e, fl[1].run(r, fc, 0.7).lp * e); } },
  rhodes(bus, t0, m, dur, v, pan, R) { const f = mtof(m), L = dur + 0.4, s = Math.round(t0 * SR); let c = 0, mo = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; c += TAU * f / SR; mo += TAU * f / SR;
      const y = Math.sin(c + (1.1 * v * Math.exp(-t / 0.25) + 0.12) * Math.sin(mo));
      const e = clamp(t / 0.003) * Math.exp(-t / 1.6) * clamp((dur + 0.35 - t) / 0.35) * 0.12 * v, tr = 0.12 * Math.sin(TAU * 4.5 * t);
      const [pl, pr] = panLR(clamp(pan + tr, -1, 1)); bus.add(s + j, y * e * pl, y * e * pr); } },
  // ---- bas ----
  sub(bus, t0, m, dur, v, pan) { const f = mtof(m), L = dur + 0.04, s = Math.round(t0 * SR); let ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * f / SR;
      const y = (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) + 0.1 * Math.sin(4 * ph)) * edge(t, L, 0.006, 0.05) * (0.75 + 0.25 * Math.exp(-t / 0.2)) * 0.3 * v; bus.add(s + j, y, y); } },
  synth(bus, t0, m, dur, v) { const f = mtof(m), L = dur + 0.04, s = Math.round(t0 * SR); const fl = new SVF(); let p = 0, ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; p = (p + f / SR) % 1; ph += TAU * f / SR;
      const y = (fl.run(sawAt(p, f / SR), 280 + 900 * Math.exp(-t / 0.07), 1.0).lp * 0.7 + 0.6 * Math.sin(ph)) * edge(t, L, 0.004, 0.04) * 0.3 * v; bus.add(s + j, y, y); } },
  slap(bus, t0, m, dur, v) { const f = mtof(m), L = dur + 0.03, s = Math.round(t0 * SR); const fl = new SVF(); let p = 0, ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; p = (p + f / SR) % 1; ph += TAU * f / SR;
      const y = (fl.run(sawAt(p, f / SR), 320 + 2400 * Math.exp(-t / 0.025), 1.3).lp * 0.75 + 0.45 * Math.sin(ph)) * edge(t, L, 0.002, 0.03) * (0.6 + 0.4 * Math.exp(-t / 0.08)) * 0.32 * v; bus.add(s + j, y, y); } },
  bpluck(bus, t0, m, dur, v, pan, R, ctx) { I.ks(bus, t0, m, dur, v, 0, R, ctx, { bright: 0.25, decay: 0.997, g: 0.9, ring: 0.05 });
    I.sub(bus, t0, m, dur, v * 0.6, 0); },
};

// ---------- efekt katmanları (t=0 darbe, riser, drop) ----------
function impact(bus, t0, rootHz, scale, R, tail) {
  const s = Math.round(t0 * SR), L = 1.2; let ph = 0, a = 0, b = 0; const f = new SVF(), fb = [new SVF(), new SVF()];
  for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * (rootHz * 2 + rootHz * 4 * Math.exp(-t / 0.06)) / SR; a += TAU * rootHz * 4 / SR; b += TAU * rootHz * 6 / SR;
    const sub = Math.tanh(2.5 * Math.sin(ph) * Math.exp(-t / 0.22)) * 0.4; // oktav üstünden düşüş + doygunluk → telefonda duyulur
    const crack = f.run(R() * 2 - 1, 1500, 0.6).hp * Math.exp(-t / 0.05) * 0.7;
    const body = (Math.sin(a) + 0.6 * Math.sin(b)) * Math.exp(-t / 0.25) * 0.2; // kök + beşli (konsonan)
    const y = (sub + crack + body) * scale * edge(t, L, 0.0008, 0.3); bus.add(s + j, y, y); }
  if (tail) riser(bus, t0 + 0.12, 0.6, R, 0.6 * scale, true);
}
function riser(bus, t0, dur, R, amp = 1, soft = false) {
  if (dur < 0.25) return; const s = Math.round(t0 * SR); const f = [new SVF(), new SVF()];
  for (let j = 0; j < dur * SR; j++) { const t = j / SR, x = t / dur; const fc = 500 * Math.pow(14, x);
    const e = Math.pow(x, 2.2) * clamp((dur - t) / (soft ? 0.12 : 0.025)) * 0.13 * amp; const [pl, pr] = panLR(-0.5 + x);
    bus.add(s + j, f[0].run(R() * 2 - 1, fc, 2).bp * e * pl * 1.4, f[1].run(R() * 2 - 1, fc * 1.03, 2).bp * e * pr * 1.4); }
}
function crackle(bus, len, R) { const f = new SVF();
  for (let i = 0; i < bus.n; i++) { const h = f.run(R() * 2 - 1, 3000, 0.5).bp * 0.004; let c = 0; if (R() < 6 / SR) c = (R() - 0.5) * 0.08; bus.add(i, h + c, h + c * 0.8); }
  for (let k = 0; k < len * 9; k++) { const s = Math.floor(R() * bus.n), a = (R() - 0.5) * 0.05; for (let j = 0; j < 30; j++) bus.add(s + j, a * Math.exp(-j / 6), a * Math.exp(-j / 6)); }
}

// ---------- ana fonksiyon ----------
// Dönüş: { bus, notes, preset, key, bpm, events:{ctaT, breakStart, stopT, hookT} }
export function renderMusic(len, CUES, name, { musicLufs = -20, groups = false } = {}) {
  const P = PRESETS[name]; if (!P) throw new Error('preset yok: ' + name);
  const n = Math.round(len * SR), beat = 60 / P.bpm, bar = beat * 4, step = beat / 4;
  const R = rng(0xA11CE ^ (P.bpm * 977) ^ P.key);
  const logo = CUES.find(c => c.type === 'logo'); const stopT = logo ? logo.t : len;
  let ctaT = CUES.find(c => c.type === 'cta')?.t ?? null;
  if (ctaT == null && logo) { const w = CUES.filter(c => c.type === 'whoosh' && c.t < logo.t - 0.4 && c.t > 4).map(c => c.t); if (w.length >= 1 && CUES.filter(c => c.type === 'whoosh').length >= 2) ctaT = Math.max(...w); }
  const breakLen = clamp(2 * beat, 0.6, 1.0), breakStart = ctaT != null ? ctaT - breakLen : null;
  const segs = ctaT != null ? [{ o: 0, b: breakStart }, { o: ctaT, b: stopT }] : [{ o: 0, b: stopT }];
  const whooshes = CUES.filter(c => c.type === 'whoosh').map(c => c.t).sort((a, b) => a - b);
  const liftT = len > 10 ? (whooshes.find(t => t > 1.5) ?? 0) : 0;
  const keyPc = P.key, scalePc = MAJOR.map(x => (x + keyPc) % 12);
  const chordPcs = deg => { const d = [0, 2, 4].concat(P.seventh ? [6] : []).map(k => scalePc[(deg + k) % 7]); return d; };
  const rootMidi = deg => { const pc = scalePc[deg % 7]; let m = 24 + pc; while (m < 36) m += 12; return m; }; // C2..B2
  const voicing = (deg, low = 57) => chordPcs(deg).map(pc => { let m = low - ((low - pc) % 12 + 12) % 12; if (m < low) m += 12; return m; }).sort((a, b) => a - b);
  let leadLow = 60 + keyPc; if (keyPc > 5) leadLow -= 12; leadLow += 12 * (P.lead.oct || 0);
  const ladder = deg => { const pcs = chordPcs(deg).slice(0, 3), out = []; for (let m = leadLow; out.length < 9; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m); return out; };
  const ladderNote = (deg, x) => { const L = ladder(deg), lo = Math.floor(x); if (x === lo) return L[lo];
    const a = L[lo], b = L[lo + 1], mids = []; for (let m = a + 1; m < b; m++) if (scalePc.includes(m % 12)) mids.push(m); return mids[Math.floor(mids.length / 2)] ?? a; };

  const G = { drums: new Bus(n), bass: new Bus(n), chords: new Bus(n), lead: new Bus(n) };
  const notes = [], kicks = [], ctx = {};
  const vel = c => c === 'X' || c === 'D' || c === 'U' || c === 'R' || c === 'O' || c === 'F' ? 1 : c === 'x' ? 0.8 : 0.5;
  const parse = p => { const o = []; for (let s = 0; s < 16; s++) { const c = p[s]; if (!c || c === '.' || c === '-') continue; let tie = 1; while (s + tie < 16 && p[s + tie] === '-') tie++; o.push({ s, c, tie }); } return o; };
  const tAt = (seg, bi, s) => seg.o + bi * bar + s * step + (s % 4 === 2 ? (P.swing || 0) * step * 2 : 0);
  const log = (t, role, inst, m, deg, bi) => notes.push({ t: +t.toFixed(3), bar: bi, role, inst, midi: m, deg });

  segs.forEach((seg, si) => {
    for (let bi = 0; seg.o + bi * bar < seg.b - 0.02; bi++) {
      const deg = P.prog[bi % P.prog.length], barEnd = Math.min(seg.b, seg.o + (bi + 1) * bar), gbi = si * 1000 + bi;
      // davullar
      const kits = Object.entries(P.drums).concat(Object.entries(P.lift || {}).map(([k, p]) => [k, p, true]));
      for (const [inst, pat, isLift] of kits) for (const { s, c } of parse(pat)) { const t = tAt(seg, bi, s); if (t >= seg.b - 0.01) continue;
        if (isLift && t < liftT) continue;
        const v = vel(c), r = rng(Math.round(t * 1e4) ^ inst.length * 7919);
        if (inst === 'kick' || inst === 'stomp') { I[inst](G.drums, t, v, r); kicks.push(t); }
        else if (inst === 'ohat') I.hat(G.drums, t, v, r, true);
        else if (inst === 'conga') I.conga(G.drums, t, v, r, c === 'x');
        else I[inst](G.drums, t, v, r); }
      // bas
      for (const { s, c, tie } of parse(P.bass.pat)) { const t = tAt(seg, bi, s); if (t >= seg.b - 0.02) continue;
        const r0 = rootMidi(deg); const m = c === 'O' ? r0 + 12 : c === 'F' ? r0 + 7 : r0;
        const dur = Math.min(tie * step * 0.92, barEnd - t - 0.01); const inst = P.bass.inst === 'pluck' ? 'bpluck' : P.bass.inst;
        I[inst](G.bass, t, m, dur, c === 'r' ? 0.6 : 1, 0, rng(Math.round(t * 1e4) + 11), ctx); log(t, 'bass', inst, m, deg, gbi); }
      // akorlar
      for (const layer of P.chords) { const vc = voicing(deg, layer.low ? 52 : 57);
        for (const { s, c, tie } of parse(layer.pat)) { const t = tAt(seg, bi, s); if (t >= seg.b - 0.02) continue;
          const dur = Math.min(tie * step, barEnd - t) - 0.01, g = (layer.g ?? 1) * vel(c);
          if (layer.inst === 'strum') { const order = c === 'U' ? [...vc].reverse() : vc;
            order.forEach((m, k) => { I.ks(G.chords, t + k * 0.012, m, dur + 0.05, g * (c === 'U' ? 0.7 : 1) * (0.9 + 0.1 * k / 3), -0.3 + 0.2 * k, rng(Math.round(t * 1e4) + k * 31), ctx, { bright: layer.low ? 0.55 : 0.45, decay: 0.995, g: 0.28 }); log(t, 'chord', 'strum', m, deg, gbi); }); }
          else vc.forEach((m, k) => { I[layer.inst](G.chords, t, m, dur, g, -0.4 + 0.8 * k / Math.max(1, vc.length - 1), rng(Math.round(t * 1e4) + k * 17), ctx); log(t, 'chord', layer.inst, m, deg, gbi); }); } }
    }
    // melodi (2 ölçülük motif, A/B)
    for (let ph = 0; seg.o + ph * 2 * bar < seg.b - 0.02; ph++) {
      const mot = ph % 2 ? P.lead.B : P.lead.A;
      for (const [bt, x, dl] of mot) { const t = seg.o + ph * 2 * bar + bt * beat + ((bt * 2) % 2 === 1 ? (P.swing || 0) * step * 2 : 0); if (t >= seg.b - 0.05) continue;
        const bi = ph * 2 + Math.floor(bt / 4), deg = P.prog[bi % P.prog.length], m = ladderNote(deg, x);
        const dur = Math.min(dl * beat * 0.9, seg.b - t - 0.02);
        I[P.lead.inst](G.lead, t, m, dur, (bt % 1 === 0 ? 1 : 0.85), 0.05, rng(Math.round(t * 1e4) + 5), ctx); log(t, 'lead', P.lead.inst, m, deg, si * 1000 + bi); }
    }
  });
  // break: V akoru (gerilim) yumuşak pad; logo: tonik çözülme (pad + bas + melodi tonik)
  if (breakStart != null) voicing(4).forEach((m, k) => { I.pad(G.chords, breakStart, m, ctaT - breakStart - 0.02, 0.8, -0.3 + 0.3 * k, R, ctx); log(breakStart, 'chord', 'pad', m, 4, -1); });
  if (logo && len - stopT > 0.3) { const d = len - stopT - 0.35;
    voicing(0).forEach((m, k) => { I.pad(G.chords, stopT, m, d, 1, -0.4 + 0.4 * k, R, ctx); log(stopT, 'chord', 'pad', m, 0, -2); });
    I.sub(G.bass, stopT, rootMidi(0), Math.min(1.2, d), 0.8, 0); log(stopT, 'bass', 'sub', rootMidi(0), 0, -2);
    const tm = ladder(0)[3]; I[P.lead.inst](G.lead, stopT, tm, 0.9, 0.9, 0.05, R, ctx); log(stopT, 'lead', P.lead.inst, tm, 0, -2); }

  // sidechain (kick/stomp'a bağlı)
  const duck = new Float32Array(n).fill(1);
  for (const kt of kicks) { const s = Math.round(kt * SR); for (let j = 0; j < 0.32 * SR; j++) { const i = s + j; if (i >= n) break; const tt = j / SR;
    duck[i] = Math.min(duck[i], 1 - P.sc * Math.exp(-tt / 0.1) * clamp(tt / 0.004 + 0.3)); } }
  for (const [k, amt] of [['bass', 1], ['chords', 1], ['lead', 0.35]]) { const b = G[k]; for (let i = 0; i < n; i++) { const g = 1 - (1 - duck[i]) * amt; b.L[i] *= g; b.R[i] *= g; } }

  // grup dengesi (K-ağırlıklı ölçüm → hedef seviyeler)
  const mixT = { ...MIX_DEFAULT, ...(P.mix || {}) }, gains = {};
  const bus = new Bus(n);
  for (const k of Object.keys(G)) { const L = lufs(G[k].L, G[k].R); gains[k] = isFinite(L) ? db(mixT[k] - L) : 0; bus.mix(G[k], gains[k]); }
  // filtreli açılış: 0–1.4 sn alçak geçiren 900 Hz → 20 kHz, 1.6 sn'de kuru sese geçiş
  { const f = [new SVF(), new SVF()], end = Math.round(1.6 * SR);
    for (let i = 0; i < Math.min(n, end); i++) { const t = i / SR, fc = 900 * Math.pow(22, clamp(t / 1.4)), w = clamp((t - 1.35) / 0.25);
      bus.L[i] = f[0].run(bus.L[i], fc, 0.9).lp * (1 - w) + bus.L[i] * w; bus.R[i] = f[1].run(bus.R[i], fc, 0.9).lp * (1 - w) + bus.R[i] * w; } }
  // break boyunca ritim/bas/melodi zaten yok; pad'i hafifçe kıs
  // genel zarf
  for (let i = 0; i < n; i++) { const t = i / SR, g = clamp(t / 0.004) * clamp((len - t) / 0.08); bus.L[i] *= g; bus.R[i] *= g; }
  for (const ch of [bus.L, bus.R]) { const f1 = new SVF(), f2 = new SVF(), f3 = new SVF(); for (let i = 0; i < n; i++) { const x = f2.run(f1.run(ch[i], 38, 0.7).hp, 38, 0.7).hp; ch[i] = x + (SHELF - 1) * f3.run(x, 120, 0.6).lp; } } // 24 dB/okt HP + 120 Hz altı raf (telefon dengesi)
  const Lm = lufs(bus.L, bus.R); bus.scale(db(musicLufs - Lm));
  // efektler (normalize sonrası sabit seviye)
  const rootHz = mtof(rootMidi(0));
  const FX = process.env.MUSIC_NOFX ? 0 : 1;
  impact(bus, 0, rootHz, 0.55 * FX, R, true);
  for (const w of whooshes) { if (ctaT != null && Math.abs(w - ctaT) < 0.01) continue; const prev = Math.max(0, ...whooshes.filter(x => x < w - 0.01));
    riser(bus, Math.max(w - 0.75, prev + 0.15), Math.min(0.75, w - prev - 0.15), R, 0.8); }
  if (ctaT != null) { riser(bus, breakStart - 0.1, breakLen + 0.1, R, 1.1); impact(bus, ctaT, rootHz, 0.38 * FX, R, false); }
  if (P.crackle) crackle(bus, len, rng(99));
  return { bus, notes, preset: name, G: groups ? G : undefined, label: P.label, key: keyPc, bpm: P.bpm, gains,
    events: { ctaT, breakStart, stopT: logo ? stopT : null, hookT: notes.find(x => x.role === 'lead')?.t ?? null, liftT } };
}

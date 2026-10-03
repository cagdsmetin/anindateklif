// Reel ses tasarımı: sayfadaki window.DUR + window.CUES okunur, prosedürel
// müzik yatağı + UI efektleri sentezlenir (ağdan indirme yok, telifsiz),
// -14 LUFS / -1 dBTP'ye normalize edilip MP4'e AAC 192k olarak eklenir.
//
//   node lib/audio.mjs "reel.html?id=r07" in.mp4 out.mp4
//   node lib/audio.mjs --batch list.json      # [{page, in, out}, ...]
//   node lib/audio.mjs --wav "reel.html" out.wav   # yalnızca miks (debug)
//
// Çıktı deterministiktir (sabit tohumlu RNG, sabit BPM/akor dizisi).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SR = 48000;
const TAU = Math.PI * 2;
const TARGET_I = -14, LIMIT_DB = -2.0; // AAC kodlama aşımı için 1 dB pay
const MUSIC_LUFS = -20, SFX_LUFS = -15; // stem seviyeleri (son normalizasyondan önce)

// ---------- yardımcılar ----------
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const db = d => Math.pow(10, d / 20);

class Bus {
  constructor(n) { this.n = n; this.L = new Float32Array(n); this.R = new Float32Array(n); }
  add(i, l, r) { if (i >= 0 && i < this.n) { this.L[i] += l; this.R[i] += r; } }
}
// eşit güç pan: p -1..1
const panLR = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

// TPT state-variable filter (kararlı, modülasyona uygun)
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; }
  run(x, fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  }
}
// Her olay için yumuşak başlangıç/bitiş (klik önleme)
const edge = (t, len, a = 0.002, r = 0.006) => clamp(t / a) * clamp((len - t) / r);

// ---------- müzik yatağı ----------
// 104 BPM, A minör: Am – F – C – G (her akor 1 ölçü). Yumuşak kick, kısık
// hat'ler, sıcak pad, sub bas, hafif pluck arpej; kick'e bağlı sidechain.
function music(bus, len, logoT) {
  const BPM = 104, beat = 60 / BPM, bar = beat * 4;
  const R = rng(0xB0A7);
  const stopT = logoT ?? len; // logoda ritim biter, pad çözülür
  const CH = [ // [bas kök midi, pad notaları]
    [45, [57, 60, 64, 71]],      // Am(add9 tını: B)
    [41, [57, 60, 65, 69]],      // Fmaj7
    [48, [55, 60, 64, 67]],      // C
    [43, [55, 59, 62, 66]],      // G (F# yerine 67? -> sus tadı)
  ];
  CH[3][1][3] = 67; // G: G B D G
  const chordAt = t => CH[Math.floor(t / bar) % 4];
  const kicks = [];
  for (let k = 0; k * beat < stopT - 0.05; k++) kicks.push(k * beat);
  // sidechain zarfı
  const duck = new Float32Array(bus.n);
  for (let i = 0; i < bus.n; i++) duck[i] = 1;
  for (const kt of kicks) { const s = Math.round(kt * SR);
    for (let j = 0; j < 0.3 * SR; j++) { const i = s + j; if (i >= bus.n) break;
      const tt = j / SR; const d = 1 - 0.45 * Math.exp(-tt / 0.09) * clamp(tt / 0.004 + 0.3);
      duck[i] = Math.min(duck[i], d); } }
  // genel müzik zarfı: 0'da ~25ms fade-in (ilk karede duyulur), logoda çözülme
  const master = t => clamp(t / 0.025) * clamp((len - t) / 0.08);

  // Kick: sinüs pitch düşüşü + çok hafif tık
  const kc = new SVF(), KR = rng(0x4B1C);
  for (const kt of kicks) { const s = Math.round(kt * SR), L = 0.42 * SR; let ph = 0;
    const vel = (Math.round(kt / beat) % 4 === 0) ? 1 : 0.82;
    for (let j = 0; j < L; j++) { const t = j / SR;
      const f = 54 + 80 * Math.exp(-t / 0.03); ph += TAU * f / SR;
      const env = Math.exp(-t / 0.14) * edge(t, L / SR, 0.0015, 0.03);
      const click = kc.run(KR() * 2 - 1, 3200, 0.9).bp * Math.exp(-t / 0.003) * 0.5; // telefon hoparlöründe duyulsun
      const v = 0.42 * vel * (Math.sin(ph) * env + click * edge(t, 0.02, 0.0005, 0.005)) * master(kt + t);
      bus.add(s + j, v, v); } }
  // Hat: offbeat 8'lik + hafif 16'lık ghost, yüksek geçiren gürültü, hafif swing
  { const svf = [new SVF(), new SVF()];
    for (let k = 0; (k * beat / 2) < stopT - 0.05; k++) {
      const off = k % 2 === 1; const ht = k * beat / 2 + (off ? 0.018 : 0);
      if (!off && R() < 0.7) continue;
      const amp = off ? 0.07 : 0.025, L = (off ? 0.06 : 0.03), s = Math.round(ht * SR);
      const pan = off ? 0.25 : -0.2; const [pl, pr] = panLR(pan);
      for (let j = 0; j < L * SR; j++) { const t = j / SR;
        const n = R() * 2 - 1; const y = svf[0].run(n, 7500, 0.7).hp; const z = svf[1].run(y, 11000, 0.6).lp;
        const e = Math.exp(-t / (off ? 0.018 : 0.01)) * edge(t, L, 0.0008, 0.01) * amp * master(ht);
        bus.add(s + j, z * e * pl, z * e * pr); } } }
  // Pad: aditif testere benzeri, L/R detune, yavaş filtre nefesi, sidechain
  { const phL = new Float64Array(64), phR = new Float64Array(64);
    const n0 = Math.round(0 * SR), n1 = Math.min(bus.n, Math.round((stopT + 1.2) * SR));
    let prev = null, xf = 1;
    for (let i = n0; i < n1; i++) { const t = i / SR;
      const ch = chordAt(Math.min(t, stopT - 1e-3)); if (ch !== prev) { prev = ch; xf = 0; }
      xf = Math.min(1, xf + 1 / (0.04 * SR)); // akor değişiminde kısa crossfade
      const bright = 0.55 + 0.25 * Math.sin(TAU * t / (bar * 2));
      let l = 0, r = 0, v = 0;
      for (const m of ch[1]) { const f = mtof(m);
        for (let h = 1; h <= 7; h++) { const w = Math.pow(h, -1.6) * Math.pow(bright, h - 1);
          const idx = v++; phL[idx] += TAU * f * h * 1.0023 / SR; phR[idx] += TAU * f * h * 0.9977 / SR;
          l += w * Math.sin(phL[idx]); r += w * Math.sin(phR[idx]); } }
      const rel = t < stopT ? 1 : clamp(1 - (t - stopT) / 1.2) ** 2;
      const g = 0.05 * xf * duck[i] * master(t) * rel * clamp(t / 0.06);
      bus.add(i, l * g, r * g); } }
  // Sub bas: kök, 1 ve 3. vuruşta + senkop, yumuşak sinüs + 2. harmonik
  { const R2 = rng(77);
    for (let k = 0; k * beat < stopT - 0.05; k++) {
      const pos = k % 4; const steps = pos === 0 ? [0] : pos === 2 ? [0, 0.75] : [];
      for (const st of steps) { const bt = (k + st) * beat; if (bt >= stopT - 0.05) continue;
        const f = mtof(chordAt(bt)[0]), L = beat * (st ? 0.5 : 1.3), s = Math.round(bt * SR); let ph = R2() * 0;
        for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * f / SR;
          const e = edge(t, L, 0.008, 0.06) * (0.75 + 0.25 * Math.exp(-t / 0.2));
          const v = 0.15 * (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * e * duck[s + j] * master(bt + t);
          bus.add(s + j, v, v); } } } }
  // Pluck arpej: 8'likler, akor tonları üst oktav, ping-pong pan, çok kısık
  { const svf = new SVF(); const pat = [0, 2, 1, 3, 2, 1, 3, 2];
    for (let k = 0; (k * beat / 2) < stopT - 0.05; k++) {
      const pt = k * beat / 2, ch = chordAt(pt)[1], m = ch[pat[k % 8]] + 12;
      const f = mtof(m), L = 0.35, s = Math.round(pt * SR); const [pl, pr] = panLR(k % 2 ? 0.45 : -0.45);
      const acc = k % 4 === 0 ? 1 : 0.7; let ph = 0;
      for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * f / SR;
        const tri = (2 / Math.PI) * Math.asin(Math.sin(ph));
        const y = svf.run(tri, 900 + 2600 * Math.exp(-t / 0.05), 0.8).lp;
        const e = Math.exp(-t / 0.09) * edge(t, L, 0.002, 0.05) * 0.06 * acc * master(pt);
        const dd = duck[s + j] ?? 1;
        bus.add(s + j, y * e * pl * dd, y * e * pr * dd); } } }
}

// ---------- efektler ----------
const SFX = {
  // Hafif alçak 'thump' — kesmeler
  cut(bus, t0) { const s = Math.round(t0 * SR), L = 0.18; let ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * (40 + 45 * Math.exp(-t / 0.03)) / SR;
      const v = 0.32 * Math.sin(ph) * Math.exp(-t / 0.06) * edge(t, L, 0.002, 0.04);
      bus.add(s + j, v, v); } },
  // Havadar whoosh: bant geçiren gürültü süpürmesi, L→R pan; zirve cue anında
  whoosh(bus, t0, c, r) { const pre = 0.32, post = 0.3, L = pre + post, s = Math.round((t0 - pre) * SR);
    const f1 = new SVF(), f2 = new SVF();
    for (let j = 0; j < L * SR; j++) { const t = j / SR, x = (t - pre);
      const env = x < 0 ? Math.pow(clamp(t / pre), 2.2) : Math.exp(-x / 0.09);
      const fc = 350 * Math.pow(18, clamp(t / (pre + 0.08))); // 350 → ~6.3k
      const n = r() * 2 - 1; const y = f1.run(n, fc, 1.1).bp * 0.8 + f2.run(n, fc * 1.9, 0.9).bp * 0.4;
      const [pl, pr] = panLR(-0.6 + 1.2 * clamp(t / L));
      const v = 0.55 * y * env * edge(t, L, 0.004, 0.06);
      bus.add(s + j, v * pl, v * pr); } },
  // Yumuşak pop: pitch düşüşlü sinüs + üçgen
  pop(bus, t0) { const s = Math.round(t0 * SR), L = 0.14; let ph = 0;
    for (let j = 0; j < L * SR; j++) { const t = j / SR; const f = 520 + 520 * Math.exp(-t / 0.018);
      ph += TAU * f / SR; const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * ph));
      const v = 0.42 * (Math.sin(ph) + 0.15 * tri) * Math.exp(-t / 0.035) * edge(t, L, 0.0015, 0.03);
      bus.add(s + j, v, v); } },
  // Klavye: ~12/sn, rastgele aralık/ton/seviye, kısa filtreli tıklar
  type(bus, t0, c, r) { const dur = c.dur ?? 0.5; let tt = t0; const f = new SVF();
    while (tt < t0 + dur) {
      const s = Math.round(tt * SR), L = 0.028, fc = 2600 + 2200 * r(), amp = 0.22 + 0.14 * r();
      const [pl, pr] = panLR((r() - 0.5) * 0.4); let ph = 0; const fb = 180 + 60 * r();
      for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * fb / SR;
        const n = f.run(r() * 2 - 1, fc, 1.6).bp;
        const v = amp * (n * Math.exp(-t / 0.004) + 0.25 * Math.sin(ph) * Math.exp(-t / 0.008)) * edge(t, L, 0.0005, 0.008);
        bus.add(s + j, v * pl, v * pr); }
      tt += (1 / 12) * (0.75 + 0.5 * r()); } },
  // Sayaç tik'i: dur verilirse saniyede bir (tik/tak), yoksa tek tik
  tick(bus, t0, c) { const n = c.dur ? Math.max(1, Math.floor(c.dur + 1e-6)) : 1;
    for (let k = 0; k < n; k++) { const s = Math.round((t0 + k) * SR), L = 0.04, f = k % 2 ? 1500 : 1900; let ph = 0;
      for (let j = 0; j < L * SR; j++) { const t = j / SR; ph += TAU * f / SR;
        const v = 0.16 * Math.sin(ph) * Math.exp(-t / 0.008) * edge(t, L, 0.0005, 0.01);
        bus.add(s + j, v, v); } } },
  // Başarı: iki notalı çan (C6 → E6, majör üçlü), inharmonik kısmi sesler
  ding(bus, t0) { bell(bus, t0, mtof(84), 0.2, -0.15, 0.9); bell(bus, t0 + 0.09, mtof(88), 0.22, 0.15, 1.1); },
  // Logo: sıcak Cmaj9 kabarması + yumuşak alçak darbe + parıltı; DUR'a kadar söner
  logo(bus, t0, c, r, len) {
    const end = len - 0.02, L = end - t0; if (L <= 0.05) return; const s = Math.round(t0 * SR);
    const notes = [36, 48, 55, 64, 71, 74]; const ph = new Float64Array(notes.length * 12);
    for (let j = 0; j < L * SR; j++) { const t = j / SR;
      const env = (1 - Math.exp(-t / 0.18)) * Math.pow(clamp((L - t) / Math.min(1.3, L * 0.8)), 1.5);
      let l = 0, rr = 0, v = 0;
      notes.forEach((m, ni) => { const f = mtof(m), w0 = ni === 0 ? 0.9 : 0.42;
        for (let h = 1; h <= (ni === 0 ? 2 : 5); h++) { const w = w0 * Math.pow(h, -1.8) * Math.pow(0.55 + 0.25 * clamp(t / 0.6), h - 1);
          const a = v++, b = v++; ph[a] += TAU * f * h * 1.003 / SR; ph[b] += TAU * f * h * 0.997 / SR;
          l += w * Math.sin(ph[a]); rr += w * Math.sin(ph[b]); } });
      const g = 0.09 * env;
      bus.add(s + j, l * g, rr * g); }
    // alçak 'boom'
    SFX.cut(bus, t0);
    bell(bus, t0 + 0.05, mtof(91), 0.08, 0.3, 1.4); bell(bus, t0 + 0.17, mtof(96), 0.06, -0.3, 1.2);
  },
};
function bell(bus, t0, f, amp, pan, decay) { const s = Math.round(t0 * SR), L = decay * 1.6; const [pl, pr] = panLR(pan);
  const parts = [[1, 1, 1], [2.76, 0.35, 0.45], [5.4, 0.12, 0.25], [0.5, 0.15, 1.2]]; const ph = parts.map(() => 0);
  for (let j = 0; j < L * SR; j++) { const t = j / SR; let v = 0;
    parts.forEach(([ratio, w, dk], k) => { ph[k] += TAU * f * ratio / SR; v += w * Math.sin(ph[k]) * Math.exp(-t / (decay * dk * 0.45)); });
    v *= amp * edge(t, L, 0.002, 0.2); bus.add(s + j, v * pl, v * pr); } }

// ---------- I/O ----------
function writeWav(file, bus) { // 32-bit float stereo
  const n = bus.n, data = Buffer.alloc(n * 8), h = Buffer.alloc(44);
  for (let i = 0; i < n; i++) { data.writeFloatLE(bus.L[i], i * 8); data.writeFloatLE(bus.R[i], i * 8 + 4); }
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28);
  h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
function ff(args) { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' ') + '\n' + r.stderr.slice(-2000)); return r.stderr; }
function lufs(file) { const e = ff(['-i', file, '-af', 'ebur128', '-f', 'null', '-']);
  const m = [...e.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].pop(); return m ? parseFloat(m[1]) : -Infinity; }
function videoDur(file) { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout); }
function hpf(bus, fc = 22) { const a = Math.exp(-TAU * fc / SR); // DC/rumble temizliği (1. derece)
  for (const ch of [bus.L, bus.R]) { let x1 = 0, y1 = 0; for (let i = 0; i < ch.length; i++) { const x = ch[i]; y1 = a * (y1 + x - x1); x1 = x; ch[i] = y1; } } }

async function readPage(browser, pageArg) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const [file, query] = pageArg.split('?');
  await page.goto('file://' + path.resolve(file) + (query ? '?' + query : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => window.READY);
  const r = await page.evaluate(() => ({ DUR: window.DUR, CUES: window.CUES || [] }));
  await page.close(); return r;
}

export function synth(DUR, CUES, len = DUR) {
  const n = Math.round(len * SR), mus = new Bus(n), sfx = new Bus(n);
  const logo = CUES.find(c => c.type === 'logo');
  music(mus, len, logo ? logo.t : null);
  const sorted = [...CUES].sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));
  sorted.forEach((c, i) => { const fn = SFX[c.type]; if (!fn) { console.warn('bilinmeyen cue:', c.type); return; }
    fn(sfx, c.t, c, rng(1000 + i * 7919 + Math.round(c.t * 1000)), len); });
  hpf(mus); hpf(sfx); return { mus, sfx };
}

async function processOne(browser, { page, in: inp, out }) {
  const { DUR, CUES } = await readPage(browser, page);
  const vd = videoDur(inp); let len = DUR;
  if (Math.abs(vd - DUR) > 1 / 30 + 1e-3) { console.warn(`UYARI: ${inp} süresi ${vd}s, sayfa DUR ${DUR}s — ses video süresine (${vd}s) uyarlanıyor; videoyu yeniden render etmeyi düşünün.`); len = vd; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reelaudio-'));
  try {
    const { mus, sfx } = synth(DUR, CUES, len);
    const fm = path.join(tmp, 'm.wav'), fs_ = path.join(tmp, 's.wav'), fx = path.join(tmp, 'mix.wav');
    writeWav(fm, mus); writeWav(fs_, sfx);
    const gm = db(MUSIC_LUFS - lufs(fm)), gsx = CUES.length ? db(SFX_LUFS - lufs(fs_)) : 0;
    const mix = new Bus(mus.n);
    for (let i = 0; i < mix.n; i++) { mix.L[i] = mus.L[i] * gm + sfx.L[i] * gsx; mix.R[i] = mus.R[i] * gm + sfx.R[i] * gsx; }
    writeWav(fx, mix);
    // Normalizasyon: doğrusal kazanç + 4x aşırı örneklemeli tepe sınırlayıcı (true-peak
    // yaklaşımı). loudnorm'un dinamik moduna (pompalama) düşmemek için kazanç
    // ölçülerek 3 tura kadar yinelenir.
    const fl = path.join(tmp, 'lim.wav'); let g = TARGET_I - lufs(fx), I = -Infinity;
    let pk = 0; for (let i = 0; i < mix.n; i++) pk = Math.max(pk, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
    for (let it = 0; it < 4; it++) {
      ff(['-y', '-i', fx, '-af', `volume=${g.toFixed(3)}dB,aresample=${SR * 4},alimiter=limit=${db(LIMIT_DB).toFixed(4)}:attack=1.5:release=60:level=0,aresample=${SR}`, '-c:a', 'pcm_f32le', fl]);
      I = lufs(fl); if (Math.abs(I - TARGET_I) < 0.15) break; g += TARGET_I - I;
    }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    ff(['-y', '-i', inp, '-i', fl, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-af', `atrim=0:${len},apad=whole_dur=${len}`, '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), '-ac', '2',
      '-movflags', '+faststart', out]);
    console.log(`✓ ${out}  (DUR ${DUR}s, ${CUES.length} cue, müzik ${(20 * Math.log10(gm)).toFixed(1)} dB, sfx ${(20 * Math.log10(gsx || 1)).toFixed(1)} dB, master +${g.toFixed(1)} dB, limiter ~${Math.max(0, 20 * Math.log10(pk) + g - LIMIT_DB).toFixed(1)} dB GR → ${I.toFixed(1)} LUFS)`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const isMain = import.meta.url === 'file://' + path.resolve(process.argv[1] || '');
if (isMain) {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  try {
    if (args[0] === '--batch') {
      const list = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      for (const job of list) await processOne(browser, job);
    } else if (args[0] === '--wav') {
      const { DUR, CUES } = await readPage(browser, args[1]); const { mus, sfx } = synth(DUR, CUES);
      const m = new Bus(mus.n); for (let i = 0; i < m.n; i++) { m.L[i] = mus.L[i] + sfx.L[i]; m.R[i] = mus.R[i] + sfx.R[i]; }
      writeWav(args[2], m); console.log('✓', args[2]);
    } else if (args.length === 3) {
      await processOne(browser, { page: args[0], in: args[1], out: args[2] });
    } else {
      console.error('Kullanım: node lib/audio.mjs <sayfa[?query]> <in.mp4> <out.mp4>\n         node lib/audio.mjs --batch list.json'); process.exitCode = 2;
    }
  } finally { await browser.close(); }
}

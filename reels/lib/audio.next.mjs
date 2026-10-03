// Reel/story ses tasarımı: sayfadaki window.DUR + window.CUES okunur; video başına
// farklı, neşeli prosedürel müzik (lib/music.mjs, 8 preset, plan/music_map.json) +
// UI efektleri + isteğe bağlı seslendirme (lib/voice.mjs, ElevenLabs) miksedilir,
// -14 LUFS / ≤ -1 dBTP'ye getirilip MP4'e AAC 192k olarak eklenir. Telifsiz, deterministik.
//
//   node lib/audio.mjs "reel.html?id=r07" in.mp4 out.mp4 [seçenekler]
//   node lib/audio.mjs --batch list.json [seçenekler]   # [{page, in, out, id?, music?, vo?}, ...]
//   node lib/audio.mjs --wav "reel.html?id=r07" out.wav [seçenekler]   # yalnızca miks (debug)
//   node lib/audio.mjs --list-voices
// Seçenekler:
//   --vo plan/voiceover.json   seslendirme planı (id sayfa sorgusundan ya da --id'den)
//   --id rNN                   VO/müzik eşlemesi için kimlik (vars. sayfa ?id=)
//   --vo-dry                   ElevenLabs yerine konuşma benzeri yer tutucu (anahtarsız test)
//   --music <preset>           plan/music_map.json yerine preset zorla
//   --debug-dir DIR            stem'leri (müzik/ducked, sfx, vo, duck zarfı) yaz
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, rng, mtof, clamp, db, Bus, panLR, SVF, edge, lufs as lufsJS, renderMusic, presetFor, PRESETS } from './music.mjs';
import { buildVoice, loadVO, listVoices } from './voice.mjs';

const TAU = Math.PI * 2;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOTES_DIR = path.resolve(HERE, '../preview/music_notes');
const TARGET_I = -14, LIMIT_DB = -2.0; // AAC kodlama aşımı için 1 dB pay
// Müzik stem'i -20 LUFS; efektler aynı ölçeğe +SFX_REL_DB; VO tek başına -16 LUFS.
const MUSIC_LUFS = -20, SFX_REL_DB = 3, VO_LUFS = -16;
// VO altında ducking: müzik -9.5 dB, efektler -4 dB; 120 ms atak / 350 ms bırakma, 100 ms ileri bakış
const DUCK = { music: -9.5, sfx: -4, att: 0.12, rel: 0.35, look: 0.10, hold: 0.20, thr: -42 };

let KEY_SHIFT = 0; // efektlerdeki ezgisel seslerin (çan, logo) müziğin tonuna transpozu

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
      const fc = 350 * Math.pow(18, clamp(t / (pre + 0.08)));
      const n = r() * 2 - 1; const y = f1.run(n, fc, 1.1).bp * 0.8 + f2.run(n, fc * 1.9, 0.9).bp * 0.4;
      const [pl, pr] = panLR(-0.6 + 1.2 * clamp(t / L));
      const v = 0.4 * y * env * edge(t, L, 0.004, 0.06);
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
  // Başarı: iki notalı çan (tonik → majör üçlü; müziğin tonunda)
  ding(bus, t0) { bell(bus, t0, mtof(84 + KEY_SHIFT), 0.2, -0.15, 0.9); bell(bus, t0 + 0.09, mtof(88 + KEY_SHIFT), 0.22, 0.15, 1.1); },
  // Logo: sıcak tonik maj9 kabarması + yumuşak alçak darbe + parıltı; DUR'a kadar söner
  logo(bus, t0, c, r, len) {
    const end = len - 0.02, L = end - t0; if (L <= 0.05) return; const s = Math.round(t0 * SR);
    const notes = [36, 48, 55, 64, 71, 74].map(m => m + KEY_SHIFT); const ph = new Float64Array(notes.length * 12);
    for (let j = 0; j < L * SR; j++) { const t = j / SR;
      const env = (1 - Math.exp(-t / 0.18)) * Math.pow(clamp((L - t) / Math.min(1.3, L * 0.8)), 1.5);
      let l = 0, rr = 0, v = 0;
      notes.forEach((m, ni) => { const f = mtof(m), w0 = ni === 0 ? 0.9 : 0.42;
        for (let h = 1; h <= (ni === 0 ? 2 : 5); h++) { const w = w0 * Math.pow(h, -1.8) * Math.pow(0.55 + 0.25 * clamp(t / 0.6), h - 1);
          const a = v++, b = v++; ph[a] += TAU * f * h * 1.003 / SR; ph[b] += TAU * f * h * 0.997 / SR;
          l += w * Math.sin(ph[a]); rr += w * Math.sin(ph[b]); } });
      const g = 0.09 * env;
      bus.add(s + j, l * g, rr * g); }
    SFX.cut(bus, t0);
    bell(bus, t0 + 0.05, mtof(91 + KEY_SHIFT), 0.08, 0.3, 1.4); bell(bus, t0 + 0.17, mtof(96 + KEY_SHIFT), 0.06, -0.3, 1.2);
  },
  cta() {}, // yalnızca işaretleyici (müzik break/drop zamanı)
};
function bell(bus, t0, f, amp, pan, decay) { const s = Math.round(t0 * SR), L = decay * 1.6; const [pl, pr] = panLR(pan);
  const parts = [[1, 1, 1], [2.76, 0.35, 0.45], [5.4, 0.12, 0.25], [0.5, 0.15, 1.2]]; const ph = parts.map(() => 0);
  for (let j = 0; j < L * SR; j++) { const t = j / SR; let v = 0;
    parts.forEach(([ratio, w, dk], k) => { ph[k] += TAU * f * ratio / SR; v += w * Math.sin(ph[k]) * Math.exp(-t / (decay * dk * 0.45)); });
    v *= amp * edge(t, L, 0.002, 0.2); bus.add(s + j, v * pl, v * pr); } }

// ---------- I/O ----------
export function writeWav(file, bus) { // 32-bit float stereo
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
function hpf(bus, fc = 22) { const a = Math.exp(-TAU * fc / SR);
  for (const ch of [bus.L, bus.R]) { let x1 = 0, y1 = 0; for (let i = 0; i < ch.length; i++) { const x = ch[i]; y1 = a * (y1 + x - x1); x1 = x; ch[i] = y1; } } }

async function readPage(browser, pageArg) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const [file, query] = pageArg.split('?');
  await page.goto('file://' + path.resolve(file) + (query ? '?' + query : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => window.READY);
  const r = await page.evaluate(() => ({ DUR: window.DUR, CUES: window.CUES || [] }));
  await page.close();
  if (!(typeof r.DUR === 'number' && r.DUR > 0)) throw new Error(`${pageArg}: window.DUR bulunamadı/geçersiz (${r.DUR})`);
  if (!Array.isArray(r.CUES)) r.CUES = [];
  return r;
}
const idOf = pageArg => (/[?&]id=([^&]+)/.exec(pageArg || '') || [])[1] || null;

// Müzik + efekt stem'leri
export function synth(DUR, CUES, len = DUR, { id = null, music = null } = {}) {
  const preset = presetFor(id, music);
  const M = renderMusic(len, CUES, preset, { musicLufs: MUSIC_LUFS });
  KEY_SHIFT = ((M.key + 6) % 12) - 6;
  const n = Math.round(len * SR), sfx = new Bus(n);
  const sorted = [...CUES].sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));
  sorted.forEach((c, i) => { const fn = SFX[c.type]; if (!fn) { console.warn('bilinmeyen cue:', c.type); return; }
    fn(sfx, c.t, c, rng(1000 + i * 7919 + Math.round(c.t * 1000)), len); });
  hpf(M.bus); hpf(sfx);
  return { mus: M.bus, sfx, M };
}

// VO etkinliğinden ducking zarfı (dB, örnek başına)
export function duckEnv(voice, n) {
  const fr = Math.round(0.01 * SR), nf = Math.ceil(n / fr), act = new Uint8Array(nf), thr = db(DUCK.thr);
  for (let f = 0; f < nf; f++) { let e = 0, c = 0; for (let i = f * fr; i < Math.min(n, (f + 1) * fr); i++) { e += voice[i] * voice[i]; c++; } act[f] = Math.sqrt(e / Math.max(1, c)) > thr ? 1 : 0; }
  const look = Math.round(DUCK.look / 0.01), hold = Math.round(DUCK.hold / 0.01), on = new Uint8Array(nf);
  for (let f = 0; f < nf; f++) if (act[f]) for (let k = Math.max(0, f - look); k <= Math.min(nf - 1, f + hold); k++) on[k] = 1;
  const env = new Float32Array(nf); let cur = 0; const dn = 0.01 * Math.abs(DUCK.music) / DUCK.att, up = 0.01 * Math.abs(DUCK.music) / DUCK.rel;
  for (let f = 0; f < nf; f++) { const tgt = on[f] ? DUCK.music : 0; cur = tgt < cur ? Math.max(tgt, cur - dn) : Math.min(tgt, cur + up); env[f] = cur; }
  // yumuşatma: 2. kademe tek kutuplu (S-eğrisi) + örnek başına doğrusal ara değer
  const sm = new Float32Array(nf); let z = 0; for (let f = 0; f < nf; f++) { z += (env[f] - z) * 0.35; sm[f] = z; }
  const out = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / fr, f0 = Math.min(nf - 1, Math.floor(x)), f1 = Math.min(nf - 1, f0 + 1), a = x - f0; out[i] = sm[f0] * (1 - a) + sm[f1] * a; }
  return out;
}

async function processOne(browser, job, opt) {
  const { page, in: inp, out } = job;
  const id = job.id || opt.id || idOf(page);
  const { DUR, CUES } = await readPage(browser, page);
  let len = DUR;
  if (inp) { const vd = videoDur(inp);
    if (Math.abs(vd - DUR) > 1 / 30 + 1e-3) { console.warn(`UYARI: ${inp} süresi ${vd}s, sayfa DUR ${DUR}s — ses video süresine (${vd}s) uyarlanıyor; videoyu yeniden render etmeyi düşünün.`); len = vd; } }
  return mixAndMaster({ id, DUR, CUES, len, inp, out, music: job.music || opt.music, voFile: job.vo || opt.vo, dry: opt.dry, debugDir: opt.debugDir, wavOnly: opt.wavOnly });
}

export async function mixAndMaster({ id, DUR, CUES, len, inp, out, music, voFile, dry, debugDir, wavOnly, quiet }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reelaudio-'));
  try {
    const { mus, sfx, M } = synth(DUR, CUES, len, { id, music });
    const fm = path.join(tmp, 'm.wav'), fx = path.join(tmp, 'mix.wav');
    writeWav(fm, mus);
    const gm = db(MUSIC_LUFS - lufs(fm)), gsx = gm * db(SFX_REL_DB);
    // --- seslendirme ---
    let voice = null, gv = 0, vo = null, duck = null;
    const entry = voFile && id ? loadVO(voFile, id) : null;
    if (voFile && !entry) console.warn(`  (VO: ${voFile} içinde '${id}' yok — yalnızca müzik)`);
    if (entry) {
      vo = await buildVoice(entry, { id, len, sr: SR, dry });
      voice = vo.track; const Lv = lufsJS(voice, voice); gv = isFinite(Lv) ? db(VO_LUFS - Lv) : 0;
      for (let i = 0; i < voice.length; i++) voice[i] *= gv;
      duck = duckEnv(voice, mus.n);
    }
    const mix = new Bus(mus.n);
    for (let i = 0; i < mix.n; i++) {
      const dm = duck ? db(duck[i]) : 1, ds = duck ? db(duck[i] * (DUCK.sfx / DUCK.music)) : 1, v = voice ? voice[i] : 0;
      mix.L[i] = mus.L[i] * gm * dm + sfx.L[i] * gsx * ds + v; mix.R[i] = mus.R[i] * gm * dm + sfx.R[i] * gsx * ds + v; }
    writeWav(fx, mix);
    if (debugDir) { fs.mkdirSync(debugDir, { recursive: true });
      const mb = new Bus(mus.n), sb = new Bus(mus.n), vb = new Bus(mus.n);
      for (let i = 0; i < mus.n; i++) { const dm = duck ? db(duck[i]) : 1, ds = duck ? db(duck[i] * (DUCK.sfx / DUCK.music)) : 1;
        mb.L[i] = mus.L[i] * gm * dm; mb.R[i] = mus.R[i] * gm * dm; sb.L[i] = sfx.L[i] * gsx * ds; sb.R[i] = sfx.R[i] * gsx * ds; if (voice) { vb.L[i] = vb.R[i] = voice[i]; } }
      writeWav(path.join(debugDir, 'music.wav'), mb); writeWav(path.join(debugDir, 'sfx.wav'), sb); if (voice) writeWav(path.join(debugDir, 'vo.wav'), vb);
      if (duck) fs.writeFileSync(path.join(debugDir, 'duck.json'), JSON.stringify(Array.from({ length: Math.floor(duck.length / 480) }, (_, k) => +duck[k * 480].toFixed(2))));
      fs.writeFileSync(path.join(debugDir, 'report.json'), JSON.stringify({ id, preset: M.preset, events: M.events, vo: vo?.report }, null, 1)); }
    // Normalizasyon: doğrusal kazanç + 4x aşırı örneklemeli tepe sınırlayıcı (true-peak yaklaşımı)
    const fl = path.join(tmp, 'lim.wav'); let g = TARGET_I - lufs(fx), I = -Infinity;
    let pk = 0; for (let i = 0; i < mix.n; i++) pk = Math.max(pk, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
    for (let it = 0; it < 4; it++) {
      ff(['-y', '-i', fx, '-af', `volume=${g.toFixed(3)}dB,aresample=${SR * 4},alimiter=limit=${db(LIMIT_DB).toFixed(4)}:attack=1.5:release=60:level=0,aresample=${SR}`, '-c:a', 'pcm_f32le', fl]);
      I = lufs(fl); if (Math.abs(I - TARGET_I) < 0.15) break; g += TARGET_I - I;
    }
    if (id) { fs.mkdirSync(NOTES_DIR, { recursive: true });
      fs.writeFileSync(path.join(NOTES_DIR, `${id}.json`), JSON.stringify({ id, preset: M.preset, key: M.key, bpm: M.bpm, events: M.events, notes: M.notes })); }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    if (wavOnly) fs.copyFileSync(fl, out);
    else ff(['-y', '-i', inp, '-i', fl, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      '-af', `atrim=0:${len},apad=whole_dur=${len}`, '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), '-ac', '2',
      '-movflags', '+faststart', out]);
    if (!quiet) console.log(`✓ ${out}  (${id || '-'} · müzik ${M.preset} ${M.bpm}bpm, DUR ${DUR}s, ${CUES.length} cue${vo ? `, VO ${vo.report.length} seg${dry ? ' (DRY)' : ''} ${(20 * Math.log10(gv)).toFixed(1)} dB` : ''}, master +${g.toFixed(1)} dB, limiter ~${Math.max(0, 20 * Math.log10(pk) + g - LIMIT_DB).toFixed(1)} dB GR → ${I.toFixed(1)} LUFS)`);
    return { preset: M.preset, I, vo: vo?.report, events: M.events };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const isMain = import.meta.url === 'file://' + path.resolve(process.argv[1] || '');
if (isMain) {
  const raw = process.argv.slice(2), opt = {}, args = [];
  for (let i = 0; i < raw.length; i++) { const a = raw[i];
    if (a === '--vo') opt.vo = raw[++i]; else if (a === '--id') opt.id = raw[++i]; else if (a === '--vo-dry') opt.dry = true;
    else if (a === '--music') opt.music = raw[++i]; else if (a === '--debug-dir') opt.debugDir = raw[++i];
    else args.push(a); }
  if (opt.music && !PRESETS[opt.music]) { console.error(`bilinmeyen preset: ${opt.music} (${Object.keys(PRESETS).join(', ')})`); process.exit(2); }
  if (args[0] === '--list-voices') { await listVoices().catch(e => { console.error(e.message); process.exitCode = 1; }); }
  else {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
    try {
      if (args[0] === '--batch') {
        const list = JSON.parse(fs.readFileSync(args[1], 'utf8'));
        let fail = 0;
        for (const job of list) { try { await processOne(browser, job, opt); } catch (e) { fail++; console.error(`✗ ${job.out}: ${e.message}`); } }
        if (fail) { console.error(`${fail}/${list.length} iş başarısız`); process.exitCode = 1; }
      } else if (args[0] === '--wav') {
        await processOne(browser, { page: args[1], out: args[2] }, { ...opt, wavOnly: true });
      } else if (args.length === 3) {
        await processOne(browser, { page: args[0], in: args[1], out: args[2] }, opt);
      } else {
        console.error('Kullanım: node lib/audio.mjs <sayfa[?query]> <in.mp4> <out.mp4> [--vo plan/voiceover.json] [--vo-dry] [--music preset] [--id rNN]\n         node lib/audio.mjs --batch list.json [...]\n         node lib/audio.mjs --list-voices'); process.exitCode = 2;
      }
    } catch (e) { console.error('✗', e.message); process.exitCode = 1; }
    finally { await browser.close(); }
  }
}

// Anında Teklif — Reels v3 zaman çizelgesi (klasik betik, WebGL'e bağımlı DEĞİL).
// Plan → sahne süreleri (vuruş/saniye), window.DUR, window.CUES, window.MUSIC, window.BPM.
// lib/audio.mjs sayfayı açıp yalnızca bunları okur; engine.js (three.js) hiç
// yüklenemese bile DUR/CUES burada eşzamanlı olarak hazırdır.
(function () {
  'use strict';
  // lib/music.mjs PRESETS ile aynı tempo tablosu (ses ızgarası bununla hizalı)
  const BPM = { sunny_pop: 120, tropical: 110, disco: 116, ukulele: 112, afro_house: 122, future_bass: 128, lofi_happy: 110, stomp_folk: 124 };
  const FPS = 30;
  const q = new URLSearchParams(location.search);
  const id = q.get('id');
  const kind = document.documentElement.dataset.kind || 'reel';
  const book = kind === 'story' ? (window.V3_STORIES || {}) : (window.V3_REELS || {});
  const plan = book[id];
  // READY: engine.js çözer; motor yüklenemezse 15 sn sonra yine de çözülür (audio.mjs asılı kalmasın)
  let readyResolve; window.READY = new Promise(r => { readyResolve = r; setTimeout(r, 15000); });
  window.__v3ready = () => readyResolve();
  if (!plan) { window.DUR = 1; window.CUES = []; window.V3T = { error: `Bilinmeyen ${kind}: ${id}` }; return; }

  const music = q.get('music') || plan.music || 'sunny_pop';
  const bpm = BPM[music] || 120, beat = 60 / bpm;
  const SAFE = kind === 'story' ? { top: 250, bottom: 1600 } : { top: 180, bottom: 1500 };
  const fr = x => Math.round(x * FPS) / FPS;

  // Sahne-içi zaman: sayı (sn), 'b4' (4 vuruş), negatif sayı (sondan), 'end'
  function T(v, dur, def = 0) {
    if (v == null) return def;
    if (typeof v === 'number') return v < 0 ? dur + v : v;
    if (v === 'end') return dur;
    const m = /^b(-?[\d.]+)$/.exec(v); if (m) { const x = +m[1] * beat; return x < 0 ? dur + x : x; }
    return +v || def;
  }

  // CTA / outro koreografi zamanları (engine.js aynı tabloyu kullanır)
  const CTA = {
    comment: { head: 0.0, bubble: 0.55, type: [0.8, 1.25], reply: 1.6, gift: 2.25, note: 2.5 },
    code: { head: 0.0, ticket: 0.35, type: [0.7, 1.35], button: 1.15, note: 1.4, burst: 1.35 },
  };
  const OUTRO = { logo: 0.08 };

  let t = 0;
  const scenes = plan.scenes.map((cfg, i) => {
    const d = cfg.dur != null ? cfg.dur : (cfg.beats != null ? cfg.beats : 8) * beat;
    const s = { cfg, i, t0: fr(t), dur: 0 }; t += d; s.t1 = fr(t); s.dur = s.t1 - s.t0; return s;
  });
  const DUR = scenes[scenes.length - 1].t1;
  // Geçiş: sahnenin cfg.in'i, yoksa önceki sahnenin cfg.out'u
  scenes.forEach((s, i) => { s.trIn = i === 0 ? null : (s.cfg.in || scenes[i - 1].cfg.out || 'cut'); });

  // ---- CUES ----
  const C = [];
  const cue = (t, type, extra) => { if (t >= 0 && t < DUR) C.push(Object.assign({ t: +t.toFixed(3), type }, extra || {})); };
  function textCues(items, base, dur) {
    (items || []).forEach(it => {
      const at = base + T(it.at, dur, 0);
      if (it.sfx === false) return;
      if (it.kind === 'type') cue(at, 'type', { dur: +(it.dur || it.text.replace(/[*\[\]~\n]/g, '').length * 0.06).toFixed(2) });
      if (it.kind === 'timer') { const r = it.run || [0, 1]; const a = base + T(r[0], dur), b = base + T(r[1], dur); cue(a, 'tick', { dur: +(b - a).toFixed(2) }); if (it.ding !== false) cue(b, 'ding'); }
      if (it.kind === 'counter') { const r = it.run || [it.at || 0, (it.at || 0) + 0.9]; if (it.ding !== false) cue(base + T(r[1], dur), 'ding'); }
      if (it.kind === 'snap' || it.kind === 'stamp') cue(at, 'pop');
      if (it.sfx) cue(at, it.sfx);
    });
  }
  scenes.forEach(s => {
    const c = s.cfg, b = s.t0, d = s.dur;
    if (s.i > 0) cue(b, ['whip', 'zoom', 'iris', 'whipUp', 'push'].includes(s.trIn) ? 'whoosh' : 'cut');
    textCues(c.text, b, d);
    (c.pop || []).forEach(p => { cue(b + T(p.at, d), 'pop'); if (p.counter && p.counter.ding !== false) cue(b + T(p.at, d) + (p.counter.delay ?? 0.35) + (p.counter.dur ?? 0.9), 'ding'); });
    (c.chips || []).forEach(p => cue(b + T(p.at, d), 'pop'));
    (c.burst || []).forEach(p => cue(b + T(p.at, d), 'pop'));
    if (c.explode) cue(b + T(c.explode.at ?? 0.3, d), 'whoosh');
    if (c.type === 'cta') {
      const m = c.mode === 'code' ? 'code' : 'comment', k = CTA[m];
      cue(b, 'cta');
      if (m === 'comment') { cue(b + k.bubble, 'pop'); cue(b + k.type[0], 'type', { dur: +(k.type[1] - k.type[0]).toFixed(2) }); cue(b + k.reply, 'pop'); cue(b + k.gift, 'ding'); }
      else { cue(b + k.ticket, 'pop'); cue(b + k.type[0], 'type', { dur: +(k.type[1] - k.type[0]).toFixed(2) }); cue(b + k.burst, 'ding'); }
    }
    if (c.type === 'outro') cue(b + OUTRO.logo, 'logo');
    (c.cues || []).forEach(x => cue(b + T(x.t, d), x.type, x.dur ? { dur: x.dur } : null));
  });
  textCues(plan.overlays, 0, DUR);
  C.sort((a, b) => a.t - b.t);
  const CUES = C.filter((c, i) => !C.slice(0, i).some(o => o.type === c.type && Math.abs(o.t - c.t) < 0.08));

  window.DUR = DUR; window.CUES = CUES; window.MUSIC = music; window.BPM = bpm;
  window.V3T = { id, kind, plan, scenes, DUR, CUES, music, bpm, beat, T, SAFE, CTA, OUTRO, FPS,
    beats: Array.from({ length: Math.floor(DUR / beat) + 1 }, (_, k) => +(k * beat).toFixed(3)) };
})();

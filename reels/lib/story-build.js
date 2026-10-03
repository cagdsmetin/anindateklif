// Anında Teklif — Story motoru (1080×1920, 6–10 sn).
// story.html?id=sNN → plan/stories.js içindeki window.STORIES[id] kurgusunu kurar.
// Reels motoruyla aynı ilke: her şey t (saniye) ile belirlenir, render(t) deterministiktir.
// Güvenli alan: tüm metin #safe içinde (y 250–1600; üstte ilerleme çubuğu/profil, altta cevap çubuğu).
(function () {
  const { E, prog, clamp, mix, $ } = window.R;
  // R.lines/R.rise varsayılan outAt=Infinity ile NaN üretir (Inf-Inf) ve giriş animasyonu
  // yok sayılır; burada sonlu bir değerle sarmalıyoruz.
  const lines = (el, t, a, o = {}) => window.R.lines(el, t, a, Object.assign({}, o, { outAt: Number.isFinite(o.outAt) ? o.outAt : 1e6 }));
  const rise = (el, t, a, o = {}) => window.R.rise(el, t, a, Object.assign({}, o, { outAt: Number.isFinite(o.outAt) ? o.outAt : 1e6 }));
  const ID = new URLSearchParams(location.search).get('id') || 's01';
  const S = (window.STORIES || {})[ID];
  if (!S) { document.getElementById('stage').innerHTML = `<div style="padding:300px 80px;font-size:60px">Bilinmeyen story: ${ID}</div>`; window.DUR = 1; window.render = () => {}; return; }

  // ---------- gerçek uygulama görüntüleri (1170×2532 @3x) ----------
  const SRC_W = 1170, SRC_H = 2532;
  const M = f => ({ still: 'footage/mobile/' + f + '.png' });
  const CLIPS = {
    zip: { dir: 'preview/frames/v01_zip_perde_olcu_fiyat', n: 184 },
    pdf: { dir: 'preview/frames/v03_teklif_pdf_onizleme', n: 144 },
    panel: { dir: 'preview/frames/v04_panel_kaydirma', n: 135, minT: 2.0, maxT: 4.4 },   // ilk 2 sn'de kullanıcı adı var
    ai: { dir: 'preview/frames/v05_ai_asistan', n: 164 },
    m_02: M('m_02_panel_genel_bakis'),
    m_04: M('m_04_teklif_katalogdan_ekle'),
    m_05: M('m_05_teklif_kalemler'),
    m_06: M('m_06_teklif_toplam'),
    // PDF önizlemelerinde demo müşteri bloğu ve imza satırı örtülür
    m_07: { ...M('m_07_pdf_onizleme'), redact: [[262, 680, 250, 172], [688, 1236, 426, 64]] },
    m_07b: { ...M('m_07b_pdf_onizleme_modern'), redact: [[252, 702, 270, 176], [100, 1244, 290, 54]] },
    m_08: M('m_08_zip_perde_olcu'),
    m_09: { ...M('m_09_zip_perde_cizim'), maxY: 1300 },  // altındaki fiyat dökümü gösterilmez
    m_10: M('m_10_zip_perde_fiyat'),
    m_12: { ...M('m_12_kasa'), maxY: 1010 },              // yalnızca üst özet
    m_16: M('m_16_ai_asistan'),
    m_18: M('m_18_katalog'),
  };
  // Video PDF kaydı: pdfShot (lib/shots.js) ile aynı örtüler
  const PDF_REDACT = [{ from: .45, rect: [70, 650, 540, 200] }, { from: .45, rect: [690, 1236, 430, 64] }];

  const srcOf = (clip, ct) => {
    const c = CLIPS[clip]; if (c.still) return c.still;
    const i = clamp(Math.floor(Math.min(c.maxT ?? 1e9, Math.max(ct, c.minT || 0)) * 30 + 1e-6) + 1, 1, c.n);
    return `${c.dir}/${String(i).padStart(4, '0')}.jpg`;
  };
  function camAt(keys, lt) {
    let k0 = keys[0], k1 = keys[keys.length - 1];
    if (lt <= k0.t) k1 = k0; else if (lt >= k1.t) k0 = k1;
    else for (let i = 0; i < keys.length - 1; i++) if (lt >= keys[i].t && lt <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
    const p = k0 === k1 ? 0 : E.inOut(prog(lt, k0.t, k1.t)), m = (a, b) => a + (b - a) * p;
    return { sy: m(k0.sy ?? 0, k1.sy ?? 0), z: m(k0.z ?? 1, k1.z ?? 1), sx: m(k0.sx ?? 585, k1.sx ?? 585) };
  }
  const place = (el, b) => Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
  const shotHTML = (id, style = '', cls = '') =>
    `<div class="shot ${cls}" id="${id}" style="${style}"><img alt=""><div class="redact"></div><div class="redact"></div><div class="ring"></div></div>`;
  const lastSrc = {};
  // segs: [{a,b,clip,from,rate,cam:[{t,sy,z,sx}],ring:{at,rect},redact}] — a/b story zamanı
  async function shot(id, segs, t) {
    const host = $(id); if (!host || !segs || !segs.length) return;
    let s = segs.find(s => t >= s.a && t < s.b);
    if (!s) s = t < segs[0].a ? segs[0] : segs[segs.length - 1];
    const c = CLIPS[s.clip], lt = Math.max(0, t - s.a);
    const ct = Math.min(c.maxT ?? 1e9, Math.max(c.minT || 0, (s.from || 0) + lt * (s.rate ?? 1)));
    const cam = camAt(s.cam || [{ t: 0 }], lt);
    const img = host.querySelector('img'), src = srcOf(s.clip, ct);
    if (lastSrc[id] !== src) { img.src = src; lastSrc[id] = src; await img.decode().catch(() => {}); }
    const W = host.offsetWidth, k = W / SRC_W * cam.z;
    img.style.width = SRC_W * k + 'px';
    img.style.transform = `translate3d(${W / 2 - cam.sx * k}px,${-cam.sy * k}px,0)`;
    img.style.clipPath = c.maxY ? `inset(0 0 ${(1 - c.maxY / SRC_H) * 100}% 0)` : 'none';
    const red = s.redact || (s.clip === 'pdf' ? PDF_REDACT : (c.redact || []).map(rect => ({ from: 0, rect })));
    const toHost = r => ({ x: W / 2 + (r[0] - cam.sx) * k, y: (r[1] - cam.sy) * k, w: r[2] * k, h: r[3] * k });
    host.querySelectorAll('.redact').forEach((el, i) => {
      const r = red[i] && ct >= red[i].from ? red[i].rect : null;
      el.style.display = r ? 'block' : 'none'; if (r) place(el, toHost(r));
    });
    const ring = host.querySelector('.ring');
    if (s.ring && lt >= s.ring.at) {
      const p = E.out(prog(lt, s.ring.at, s.ring.at + .5)), b = toHost(s.ring.rect);
      place(ring, { x: b.x - 14, y: b.y - 10, w: b.w + 28, h: b.h + 20 });
      ring.style.opacity = p; ring.style.transform = `scale(${1.12 - .12 * p})`;
    } else ring.style.opacity = 0;
  }

  // ---------- küçük yardımcılar ----------
  const ln = s => Array.isArray(s) ? `<span class="ln"><span class="${s[1]}">${s[0]}</span></span>` : `<span class="ln"><span>${s}</span></span>`;
  const lns = a => a.map(ln).join('');
  const eb = (id, txt, style = '') => `<div class="eyebrow" id="${id}" style="${style}"><i></i>${txt}</div>`;
  const CUES = [];
  const cue = (t, type, extra) => CUES.push(Object.assign({ t: +(+t).toFixed(3), type }, extra || {}));
  const BOLT = s => `<svg width="${s}" height="${s * 1.17}" viewBox="0 0 24 28"><path d="M14 1 3 16h7l-2 11 11-15h-7l2-11z" fill="#fff"/></svg>`;
  const ICON = {
    down: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M5 13l7 7 7-7"/></svg>`,
    up: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V4M5 11l7-7 7 7"/></svg>`,
    check: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>`,
    gift: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M2 9h20v-3H2zM12 6v15M12 6C10 2 6 3 7 6M12 6c2-4 6-3 5 0"/></svg>`,
    user: `<svg width="46" height="46" viewBox="0 0 24 24" fill="#C9C9D6"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c.8-4.6 4.3-7 8.5-7s7.7 2.4 8.5 7z"/></svg>`,
    chat: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>`,
  };
  const replyHint = txt => `<div class="pill" style="font-size:34px;padding:20px 34px;color:var(--ink);gap:16px">${ICON.chat}${txt}</div>`;
  const fadeIn = (el, t, a, o) => rise(el, t, a, Object.assign({ pre: a <= 0 ? .9 : 0 }, o || {}));
  const head = (el, t, a, o) => lines(el, t, a, Object.assign({ stagger: .08, dur: .7, pre: a <= 0 ? .88 : 0 }, o || {}));
  const pop = (el, t, a, { dy = 40, from = .88, dur = .5 } = {}) => {
    const p = E.back(prog(t, a, a + dur));
    el.style.opacity = a <= 0 ? 1 : clamp(prog(t, a, a + .15));
    el.style.transform = `translate3d(0,${(1 - p) * dy}px,0) scale(${from + (1 - from) * p})`;
    return p;
  };

  // Başlık blokları: [{a, l:[...satırlar]}] sırayla değişir
  const titlesHTML = (ts, top, cls = 'h-s', style = '') => ts.map((x, i) =>
    `<div class="display ${cls}" id="ti${i}" style="top:${top}px;${style}">${lns(x.l)}</div>`).join('');
  function titles(ts, t) {
    let cur = 0;
    ts.forEach((x, i) => {
      const a = x.a, b = i + 1 < ts.length ? ts[i + 1].a : Infinity, el = $('ti' + i);
      const on = t >= a - 1e-6 && t < b; el.style.visibility = on ? 'visible' : 'hidden';
      if (on) { cur = i; head(el, t, a, { stagger: .07, dur: .6, outAt: b - .3 }); }
    });
    return cur;
  }
  const titleCues = ts => ts.forEach(x => x.a > 0 && cue(x.a, 'whoosh'));
  function callouts(list, t) {
    (list || []).forEach((c, i) => { const el = $('co' + i); if (el) pop(el, t, c.at, { dy: 30, from: .7 }); if (c.out) el.style.opacity *= 1 - clamp(prog(t, c.out, c.out + .25)); });
  }
  const calloutsHTML = list => (list || []).map((c, i) =>
    `<div class="callout" id="co${i}" style="top:${c.y}px;${c.side === 'r' ? 'left:auto;right:' + (c.x ?? 0) + 'px' : 'right:auto;left:' + (c.x ?? 0) + 'px'};opacity:0"><i></i>${c.text}</div>`).join('');
  const calloutCues = list => (list || []).forEach(c => cue(c.at, 'pop'));

  // ---------- zeminler ----------
  function bgHTML(kind) {
    switch (kind) {
      case 'indigo': return `<div class="bgk bg-indigo"></div><div class="bg-dots" style="opacity:.28"></div><div class="bg-glow" id="bgGlow" style="opacity:.6;left:200px;top:700px"></div>`;
      case 'beam': return `<div class="bg-beam" id="bgBeam"></div><div class="bg-dots"></div>`;
      case 'band': return `${R.SNIP.bg}<div class="bg-band" id="bgBand"></div>`;
      case 'warm': return `${R.SNIP.bg}<div class="glow2" id="bgWarm" style="left:340px;top:1050px"></div>`;
      case 'low': return `<div class="bg-glow" id="bgGlow" style="left:-120px;top:820px"></div><div class="bg-dots"></div>`;
      case 'none': return '';
      default: return R.SNIP.bg;
    }
  }
  function bgUpdate(t) {
    R.background(t);
    const b = $('bgBeam'); if (b) b.style.transform = `translateX(${Math.sin(t * .5) * 120}px) rotate(${Math.sin(t * .3) * 6}deg)`;
    const d = $('bgBand'); if (d) d.style.transform = `rotate(-12deg) translateX(${Math.sin(t * .4) * 160}px)`;
    const w = $('bgWarm'); if (w) w.style.transform = `translate3d(${Math.cos(t * .4) * 80}px,${Math.sin(t * .3) * 60}px,0)`;
  }

  // =====================================================================
  // DÜZENLER
  // =====================================================================
  const L = {};

  // --- 1. sabah: soru / anket görünümü (etkileşimsiz) ---
  L.poll = S => {
    const n = S.opts.length, top = S.optTop || 600, gap = 196, hs = .75 + n * .18 + .5;
    S.opts.forEach((_, i) => cue(.75 + i * .18, 'pop'));
    for (let x = hs; x < S.dur - .2; x += .6) cue(x, 'tick');
    return {
      html: `${eb('eb', S.eyebrow || 'Hızlı soru', 'top:30px')}
        <div class="display h-q" id="q" style="top:110px">${lns(S.q)}</div>
        ${S.opts.map((o, i) => `<div class="opt" id="o${i}" style="top:${top + i * gap}px;height:170px;font-size:54px;opacity:0"><span class="k">${'ABCD'[i]}</span><span>${o}</span><span class="rd"></span></div>`).join('')}
        <div id="foot" style="top:${top + n * gap + 46}px">${replyHint(S.foot || 'Cevabını mesajla yaz')}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        const hi = t >= hs ? Math.floor((t - hs) / .6) % n : -1;
        S.opts.forEach((_, i) => { const el = $('o' + i); rise(el, t, .75 + i * .18, { dy: 50, blur: 8 }); el.classList.toggle('hl', i === hi); el.style.setProperty('--on', i === hi ? 1 : 0); });
        rise($('foot'), t, hs - .2, { dy: 24, blur: 6 });
      },
    };
  };

  // --- poll ızgara: 2×2 küçük ekran görüntülü seçenek ---
  L.pollGrid = S => {
    const top = 450, W = 450, H = 380, G = 36;
    const hs = .8 + 4 * .16 + .5;
    S.tiles.forEach((_, i) => cue(.8 + i * .16, 'pop'));
    for (let x = hs; x < S.dur - .2; x += .65) cue(x, 'tick');
    return {
      html: `${eb('eb', S.eyebrow || 'Hızlı soru', 'top:30px')}
        <div class="display h-q" id="q" style="top:110px;font-size:84px">${lns(S.q)}</div>
        <div id="foot" style="top:${top + 2 * H + G + 30}px">${replyHint(S.foot || 'Cevabını mesajla yaz')}</div>
        ${S.tiles.map((x, i) => `<div class="glass" id="tl${i}" style="position:absolute;left:${(i % 2) * (W + G)}px;right:auto;top:${top + Math.floor(i / 2) * (H + 28)}px;width:${W}px;height:${H}px;overflow:hidden;opacity:0">
            ${shotHTML('ts' + i, `left:14px;top:14px;width:${W - 28}px;height:${H - 116}px;border-radius:24px;box-shadow:none`)}
            <div style="position:absolute;left:24px;right:20px;bottom:24px;display:flex;align-items:center;gap:16px;font-size:38px;font-weight:800;letter-spacing:-.02em">
              <span class="k" style="flex:none;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:28px;background:rgba(139,135,255,.16);color:var(--brand-hi)">${'ABCD'[i]}</span>${x.label}</div></div>`).join('')}`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        const hi = t >= hs ? Math.floor((t - hs) / .65) % 4 : -1;
        S.tiles.forEach((x, i) => {
          const el = $('tl' + i); rise(el, t, .8 + i * .16, { dy: 60, blur: 8, scale: .06 });
          el.style.borderColor = i === hi ? 'rgba(139,135,255,.85)' : ''; el.style.background = i === hi ? 'rgba(79,70,229,.24)' : '';
        });
        rise($('foot'), t, 1.2, { dy: 24, blur: 6 });
        return Promise.all(S.tiles.map((x, i) => shot('ts' + i, [Object.assign({ a: 0, b: 99 }, x.seg)], t)));
      },
    };
  };

  // --- tanıdık mı? işaret listesi ---
  L.checklist = S => {
    const top = S.top || 480, gap = 162, n = S.items.length, tk = i => 1.5 + i * .55;
    S.items.forEach((_, i) => { cue(.6 + i * .14, 'pop'); cue(tk(i), 'tick'); });
    const endA = tk(n - 1) + .7; cue(endA, 'whoosh');
    return {
      html: `${eb('eb', S.eyebrow, 'top:30px')}
        <div class="display h-q" id="q" style="top:110px;font-size:84px">${lns(S.q)}</div>
        ${S.items.map((x, i) => `<div class="step" id="it${i}" style="top:${top + i * gap}px;padding:24px 34px;opacity:0"><span class="chk" id="ck${i}">${ICON.check}</span><span class="tx" style="font-size:44px">${x}</span></div>`).join('')}
        <div class="display h-s" id="end" style="top:${top + n * gap + 30}px">${lns(S.end)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        S.items.forEach((_, i) => {
          rise($('it' + i), t, .6 + i * .14, { dy: 40, blur: 8 });
          const p = E.back(prog(t, tk(i), tk(i) + .35)), ck = $('ck' + i);
          ck.style.background = p > 0 ? `rgba(79,70,229,${clamp(p)})` : 'transparent';
          ck.style.borderColor = p > 0 ? 'var(--brand)' : '';
          ck.style.transform = `scale(${p > 0 ? .8 + .2 * p : 1})`;
          ck.firstChild.style.opacity = clamp(p * 1.5);
        });
        head($('end'), t, endA);
      },
    };
  };

  // --- bu mu, şu mu? iki panel ---
  L.versus = S => {
    cue(.55, 'pop'); cue(.9, 'whoosh'); if (S.a.strike) cue(1.9, 'whoosh'); cue(2.3, 'whoosh');
    const C = S.cols, PW = 450;
    const panel = (id, x, top, cls) => `<div class="glass" id="${id}" style="position:absolute;${C ? `left:${id === 'pa' ? 0 : 486}px;right:auto;width:${PW}px;top:90px;height:820px;padding:54px 44px` : `left:0;right:0;top:${top}px;height:470px;padding:54px 60px`};overflow:hidden;opacity:0;${cls}">
        <div class="eyebrow" style="font-size:28px;${id === 'pb' ? 'color:#D9D7FF' : ''}">${x.tag}</div>
        <div class="display h-s" style="margin-top:30px;position:relative;display:inline-block;font-size:${C ? 62 : 72}px">${x.big}${x.strike ? `<span id="${id}s" style="position:absolute;left:-2%;top:46%;height:12px;width:0;background:#EF4444;border-radius:6px;transform:rotate(${C ? -10 : -3}deg)"></span>` : ''}</div>
        <div class="sub" style="margin-top:24px;${id === 'pb' ? 'color:#E2E0FF' : ''}">${x.sub}</div></div>`;
    return {
      html: `${eb('eb', S.eyebrow, 'top:20px')}
        ${panel('pa', S.a, 90, '')}
        ${panel('pb', S.b, 620, 'background:linear-gradient(150deg,#5B54F0,#3A33C4);border-color:rgba(255,255,255,.25);box-shadow:0 40px 120px rgba(79,70,229,.45)')}
        <div id="vs" class="it" style="left:50%;right:auto;top:${C ? 430 : 510}px;margin-left:-70px;width:140px;height:140px;border-radius:50%;background:var(--bg);border:2px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:56px;z-index:3;opacity:0">ya da</div>
        <div class="display h-s" id="cap" style="top:${C ? 990 : 1150}px">${lns(S.cap)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 });
        const pa = E.out(prog(t, -.15, .6)), pb = E.out(prog(t, .9, 1.6));
        Object.assign($('pa').style, { opacity: clamp(pa * 1.3), transform: C ? `translate3d(0,${(1 - pa) * -140}px,0)` : `translate3d(${(1 - pa) * -140}px,0,0)` });
        Object.assign($('pb').style, { opacity: clamp(pb * 1.3), transform: C ? `translate3d(0,${(1 - pb) * 140}px,0)` : `translate3d(${(1 - pb) * 140}px,0,0)` });
        pop($('vs'), t, .55, { dy: 0, from: .4 });
        const s = $('pas'); if (s) s.style.width = clamp(E.out(prog(t, 1.9, 2.4))) * 104 + '%';
        if (S.a.strike) $('pa').style.opacity = clamp(pa * 1.3) * (1 - .4 * clamp(prog(t, 2.0, 2.4)));
        head($('cap'), t, 2.3);
      },
    };
  };

  // --- yazılan büyük soru + çetele ---
  L.typeQ = S => {
    const text = S.text, N = text.reduce((a, x) => a + x.length, 0), tA = -.45, tB = S.typeDur || 1.9;
    cue(0, 'type', { dur: tB });
    const strokes = 15, kA = tB + .4; for (let i = 0; i < strokes; i++) cue(kA + i * .11, 'tick');
    const aA = kA + strokes * .11 + .35; cue(aA, 'whoosh');
    return {
      html: `${eb('eb', S.eyebrow, 'top:30px')}
        <div class="display" id="tq" style="top:110px;font-size:124px;letter-spacing:-.045em;line-height:1.02"></div>
        <div id="tally" style="top:${S.tallyTop || 620}px;height:180px">${Array.from({ length: strokes }, (_, i) => {
          const g = Math.floor(i / 5), j = i % 5, x = g * 250 + j * 40;
          return j < 4 ? `<span id="st${i}" style="position:absolute;left:${x}px;top:10px;width:16px;height:160px;border-radius:8px;background:var(--ink);opacity:0"></span>`
            : `<span id="st${i}" style="position:absolute;left:${g * 250 - 20}px;top:80px;width:200px;height:16px;border-radius:8px;background:var(--warm);transform:rotate(-28deg);opacity:0"></span>`;
        }).join('')}<span id="tq3" class="it" style="position:absolute;left:770px;top:20px;font-size:140px;color:var(--brand-hi);opacity:0">…</span></div>
        <div class="display h-s" id="aft" style="top:${(S.tallyTop || 620) + 260}px">${lns(S.after)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 });
        let n = Math.max(2, Math.round(clamp(prog(t, tA, tB)) * N)), html = '';
        const blink = n < N || Math.floor(t * 2.4) % 2 === 0;
        text.forEach((x, li) => {
          const s = x.slice(0, Math.max(0, n)), r = x.slice(Math.max(0, n));
          const caret = n >= 0 && (n < x.length || (li === text.length - 1)) && (n <= x.length) ? `<span class="caret" style="height:110px;width:8px;vertical-align:-10px;opacity:${blink ? 1 : 0}"></span>` : '';
          html += `<div class="${S.cls && S.cls[li] || ''}">${s}${caret}<span style="opacity:0">${r}</span></div>`;
          n -= x.length;
        });
        $('tq').innerHTML = html;
        for (let i = 0; i < strokes; i++) { const el = $('st' + i), p = E.back(prog(t, kA + i * .11, kA + i * .11 + .3)); el.style.opacity = clamp(p * 2); el.style.transform = (i % 5 === 4 ? 'rotate(-28deg) ' : '') + `scaleY(${i % 5 === 4 ? 1 : p}) scaleX(${i % 5 === 4 ? p : 1})`; el.style.transformOrigin = i % 5 === 4 ? '0 50%' : '50% 100%'; }
        rise($('tq3'), t, kA + strokes * .11, { dy: 20, blur: 6 });
        head($('aft'), t, aA);
      },
    };
  };

  // --- müşteri mesajı + soru ---
  L.chat = S => {
    cue(1.2, 'pop'); if (S.msg2) cue(1.9, 'pop'); cue(2.7, 'whoosh');
    for (let x = 3.4; x < S.dur - .2; x += 1) cue(x, 'tick');
    return {
      html: `${eb('eb', S.eyebrow, 'top:20px')}
        <div class="glass" id="ch" style="top:90px;height:600px;background:rgba(18,18,28,.8);overflow:hidden">
          <div style="display:flex;align-items:center;gap:24px;padding:30px 40px;border-bottom:1.5px solid rgba(255,255,255,.1)">
            <div style="width:84px;height:84px;border-radius:50%;background:#2A2A38;display:flex;align-items:center;justify-content:center">${ICON.user}</div>
            <div><div style="font-size:38px;font-weight:800">${S.who || 'Müşteri'}</div><div style="font-size:28px;font-weight:600;color:var(--ok)">çevrimiçi</div></div>
            <div style="margin-left:auto;font-family:var(--mono);font-size:30px;color:var(--muted)">${S.clock || '09:41'}</div></div>
          <div id="dots" style="position:absolute;left:40px;top:180px;padding:30px 36px;border-radius:34px 34px 34px 10px;background:#2A2A38;display:flex;gap:12px">${[0, 1, 2].map(i => `<span id="d${i}" style="width:18px;height:18px;border-radius:50%;background:#C9C9D6;display:block"></span>`).join('')}</div>
          <div id="m1" style="position:absolute;left:40px;right:120px;top:180px;padding:30px 38px;border-radius:34px 34px 34px 10px;background:#2A2A38;font-size:46px;font-weight:700;line-height:1.3;opacity:0">${S.msg}</div>
          ${S.msg2 ? `<div id="m2" style="position:absolute;left:40px;right:220px;top:${S.m2Top || 400}px;padding:30px 38px;border-radius:34px 34px 34px 10px;background:#2A2A38;font-size:46px;font-weight:700;line-height:1.3;opacity:0">${S.msg2}</div>` : ''}
        </div>
        <div class="display h-q" id="q" style="top:780px;font-size:88px">${lns(S.q)}</div>
        <div id="sw" style="top:1110px;display:flex;align-items:center;gap:30px;opacity:0">
          <svg width="150" height="170" viewBox="0 0 100 114"><rect x="40" y="2" width="20" height="10" rx="3" fill="#8B87FF"/><circle cx="50" cy="64" r="44" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="8"/>
            <circle id="swArc" cx="50" cy="64" r="44" fill="none" stroke="#8B87FF" stroke-width="8" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="276.5" transform="rotate(-90 50 64)"/>
            <line id="swHand" x1="50" y1="64" x2="50" y2="30" stroke="#F5F5F2" stroke-width="7" stroke-linecap="round"/></svg>
          <div class="sub" style="color:var(--ink);font-weight:700">${S.after}</div></div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); fadeIn($('ch'), t, 0, { dy: 40, blur: 8 });
        const typing = t < 1.2;
        $('dots').style.opacity = typing ? 1 : 0;
        [0, 1, 2].forEach(i => { $('d' + i).style.transform = `translateY(${Math.sin(t * 9 - i * .9) * -8}px)`; });
        pop($('m1'), t, 1.2, { dy: 30, from: .9 });
        if (S.msg2) pop($('m2'), t, 1.9, { dy: 30, from: .9 });
        head($('q'), t, 2.7);
        rise($('sw'), t, 3.2, { dy: 30, blur: 8 });
        const e = Math.max(0, t - 3.2);
        $('swHand').setAttribute('transform', `rotate(${e * 120} 50 64)`);
        $('swArc').setAttribute('stroke-dashoffset', 276.5 * (1 - (e / 6 % 1)));
      },
    };
  };

  // --- kaydırıcı görünümü ---
  L.slider = S => {
    cue(1.2, 'whoosh'); cue(3.9, 'whoosh');
    const pos = t => mix(.08, .9, E.inOut(prog(t, 1.2, 3.4))) + Math.sin(Math.max(0, t - 3.4) * 4) * .012 * clamp((t - 3.4) * 3);
    let prev = -1; for (let x = 1.2; x < 3.5; x += 1 / 30) { const k = Math.min(S.marks.length - 1, Math.floor(pos(x) * S.marks.length)); if (k !== prev && prev >= 0) cue(x, 'tick'); prev = k; }
    return {
      html: `${eb('eb', S.eyebrow, 'top:30px')}
        <div class="display h-q" id="q" style="top:110px">${lns(S.q)}</div>
        <div class="glass" id="sl" style="top:560px;height:400px">
          <div id="bub" style="position:absolute;top:60px;left:0;transform:translateX(-50%);padding:18px 30px;border-radius:24px;background:var(--ink);color:#0B0B12;font-size:38px;font-weight:800;white-space:nowrap"></div>
          <div style="position:absolute;left:70px;right:70px;top:210px;height:26px;border-radius:13px;background:rgba(255,255,255,.12)">
            <div id="fill" style="position:absolute;left:0;top:0;bottom:0;border-radius:13px;background:linear-gradient(90deg,#8B87FF,#4F46E5 60%,#F5B544)"></div>
            <div id="knob" style="position:absolute;top:-35px;width:96px;height:96px;margin-left:-48px;border-radius:50%;background:#fff;box-shadow:0 0 0 10px rgba(139,135,255,.35),0 16px 40px rgba(0,0,0,.5)"></div></div>
          <div style="position:absolute;left:70px;right:70px;top:300px;display:flex;justify-content:space-between;font-size:32px;font-weight:700;color:var(--muted)"><span>${S.ends[0]}</span><span>${S.ends[1]}</span></div>
        </div>
        <div class="display h-s" id="aft" style="top:1060px">${lns(S.after)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        rise($('sl'), t, .5, { dy: 50, blur: 8 });
        const p = pos(t), k = Math.min(S.marks.length - 1, Math.floor(p * S.marks.length)), W = 936 - 140;
        $('fill').style.width = p * 100 + '%'; $('knob').style.left = p * 100 + '%';
        const bub = $('bub'); bub.textContent = S.marks[k]; bub.style.left = clamp(70 + p * W, 230, 936 - 230) + 'px';
        head($('aft'), t, 3.9);
      },
    };
  };

  // --- büyük soru işareti + bilinmeyen kartlar ---
  L.mark = S => {
    S.cards.forEach((_, i) => cue(1.0 + i * .25, 'pop')); cue(2.6, 'whoosh');
    return {
      html: `<div class="it" id="bigq" style="top:180px;left:auto;right:-30px;font-size:980px;line-height:.8;color:rgba(139,135,255,.11)">?</div>
        ${eb('eb', S.eyebrow, 'top:30px')}
        <div class="display h-q" id="q" style="top:110px">${lns(S.q)}</div>
        ${S.cards.map((c, i) => `<div class="glass" id="mc${i}" style="position:absolute;left:${i * 323}px;right:auto;top:600px;width:290px;height:320px;padding:34px 30px;opacity:0;perspective:800px">
          <div style="display:flex;align-items:center;gap:12px;font-size:30px;font-weight:700;color:var(--muted)"><span style="width:16px;height:16px;border-radius:50%;background:${c.color};display:block"></span>${c.label}</div>
          <div id="mq${i}" style="font-family:var(--mono);font-size:150px;margin-top:40px;color:var(--ink)">?</div></div>`).join('')}
        <div class="display h-s" id="aft" style="top:1030px">${lns(S.after)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        $('bigq').style.transform = `translateY(${Math.sin(t * .8) * 16}px) rotate(${Math.sin(t * .5) * 3}deg)`;
        S.cards.forEach((_, i) => {
          const a = 1.0 + i * .25, p = E.out(prog(t, a, a + .6)), el = $('mc' + i);
          el.style.opacity = clamp(prog(t, a, a + .15)); el.style.transform = `rotateY(${(1 - p) * 80}deg)`;
          $('mq' + i).style.transform = `scale(${1 + Math.max(0, Math.sin((t - 2 - i * .3) * 4)) * .08 * clamp(t - 2)})`;
        });
        head($('aft'), t, 2.6);
      },
    };
  };

  // --- hızlı hesap: seçenekler, geri sayım, doğru cevap ---
  L.quiz = S => {
    const oT = 520, gap = 170, R0 = 1.9, rv = R0 + 3;
    S.opts.forEach((_, i) => cue(.7 + i * .16, 'pop'));
    [0, 1, 2].forEach(i => cue(R0 + i, 'tick')); cue(rv, 'ding'); cue(rv + .55, 'whoosh');
    return {
      html: `${eb('eb', S.eyebrow, 'top:30px')}
        <div class="display h-q" id="q" style="top:110px">${lns(S.q)}</div>
        <div id="cd" style="left:auto;right:0;top:0;width:150px;height:150px;opacity:0">
          <svg width="150" height="150" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="7"/>
          <circle id="cdArc" cx="50" cy="50" r="44" fill="none" stroke="#F5B544" stroke-width="7" stroke-linecap="round" stroke-dasharray="276.5" transform="rotate(-90 50 50)"/></svg>
          <div id="cdN" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:64px;color:var(--warm)">3</div></div>
        ${S.opts.map((o, i) => `<div class="opt" id="o${i}" style="top:${oT + i * gap}px;opacity:0;font-size:56px"><span class="k">${'ABC'[i]}</span><span>${o}</span><span class="rd" id="rd${i}"></span></div>`).join('')}
        <div class="display h-s" id="aft" style="top:${oT + 3 * gap + 40}px">${lns(S.after)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('q'), t, 0);
        S.opts.forEach((_, i) => {
          const el = $('o' + i); rise(el, t, .7 + i * .16, { dy: 50, blur: 8 });
          const r = E.out(prog(t, rv, rv + .4));
          if (i === S.ok) { el.style.background = `rgba(52,211,153,${.2 * r})`; el.style.borderColor = r > 0 ? `rgba(52,211,153,${.3 + .6 * r})` : ''; el.style.transform += ` scale(${1 + .04 * Math.sin(Math.PI * clamp(prog(t, rv, rv + .5)))})`; $('rd' + i).style.setProperty('--on', r); $('rd' + i).style.borderColor = r > 0 ? '#34D399' : ''; }
          else el.style.opacity = +el.style.opacity * (1 - .55 * r);
        });
        const cd = $('cd'); cd.style.opacity = clamp(prog(t, R0 - .3, R0)) * (1 - clamp(prog(t, rv + .3, rv + .6)));
        $('cdN').textContent = Math.max(1, 3 - Math.floor(Math.max(0, t - R0)));
        $('cdArc').setAttribute('stroke-dashoffset', 276.5 * clamp(prog(t, R0, rv)));
        head($('aft'), t, rv + .55);
      },
    };
  };

  // --- 2. öğlen: telefon kahraman çekimi ---
  L.phone = S => {
    titleCues(S.titles); calloutCues(S.callouts);
    S.segs.slice(1).forEach(s => cue(s.a, 'cut'));
    const top = S.phoneTop || 300, H = 1350 - top, W = Math.round(H * .56);
    return {
      html: `${eb('eb', S.eyebrow, 'top:20px')}
        ${titlesHTML(S.titles, 90)}
        <div class="phone3" id="ph" style="left:${(936 - W) / 2}px;right:auto;top:${top}px;width:${W}px;height:${H}px">${shotHTML('sh', '')}</div>
        ${calloutsHTML(S.callouts)}`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); titles(S.titles, t);
        const p = E.out(prog(t, -.2, .8));
        $('ph').style.transform = `translate3d(0,${(1 - p) * 120}px,0) rotate(${(1 - p) * 4 + Math.sin(t * .6) * .6}deg)`;
        $('ph').style.opacity = clamp(p * 1.4);
        callouts(S.callouts, t);
        return shot('sh', S.segs, t);
      },
    };
  };

  // --- solda metin, sağda uzun kart ---
  L.split = S => {
    titleCues(S.titles); S.segs.slice(1).forEach(s => cue(s.a, 'cut'));
    return {
      html: `${eb('eb', S.eyebrow, 'top:20px;right:auto;width:420px;font-size:26px;letter-spacing:.18em')}
        ${titlesHTML(S.titles, 110, 'h-s', 'right:auto;width:440px;font-size:58px')}
        <div id="cnt" class="it" style="top:1010px;right:auto;font-size:300px;line-height:1;color:var(--brand-hi)"></div>
        ${shotHTML('sh', 'left:470px;right:auto;top:20px;width:466px;height:1320px')}
        ${calloutsHTML(S.callouts)}`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 });
        const i = titles(S.titles, t), cn = $('cnt');
        cn.textContent = String(i + 1).padStart(2, '0');
        const a = S.titles[i].a; rise(cn, t, a, { dy: 60, blur: 10, pre: a <= 0 ? .9 : 0 });
        const p = E.out(prog(t, -.2, .8)), sh = $('sh');
        sh.style.transform = `translate3d(${(1 - p) * 120}px,0,0)`; sh.style.opacity = clamp(p * 1.4);
        callouts(S.callouts, t);
        return shot('sh', S.segs, t);
      },
    };
  };

  // --- tam ekran görüntü, üst/alt koyu geçiş ---
  L.full = S => {
    titleCues(S.titles); S.segs.slice(1).forEach(s => cue(s.a, 'cut'));
    (S.chipOn || []).forEach(c => cue(c.at, 'tick'));
    return {
      pre: shotHTML('sh', 'left:0;top:0;width:1080px;height:1920px;border-radius:0;box-shadow:none') +
        `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#07070B 0%,#07070B 27%,rgba(7,7,11,.6) 34%,rgba(7,7,11,0) 42%,rgba(7,7,11,0) 70%,rgba(7,7,11,.85) 80%,#07070B 88%)"></div>`,
      html: `${eb('eb', S.eyebrow, 'top:20px')}
        ${titlesHTML(S.titles, 90, 'h-q', 'font-size:88px')}
        <div id="chips" style="top:1170px;display:flex;flex-wrap:wrap;gap:16px">${S.chips.map((c, i) => `<span class="pill" id="cp${i}" style="opacity:0;background:rgba(14,14,24,.92);font-size:34px;padding:18px 30px">${c}</span>`).join('')}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); titles(S.titles, t);
        const p = E.out(prog(t, -.3, 1.2)), sh = $('sh');
        sh.style.transform = `scale(${1.06 - .06 * p})`; sh.style.transformOrigin = '50% 60%';
        let on = -1; (S.chipOn || []).forEach(c => { if (t >= c.at) on = c.i; });
        S.chips.forEach((_, i) => { const el = $('cp' + i); rise(el, t, (S.chipAt ?? 1.0) + i * .12, { dy: 24, blur: 6 }); el.classList.toggle('on', i === on); el.style.background = i === on ? 'var(--brand)' : 'rgba(14,14,24,.92)'; });
        return shot('sh', S.segs, t);
      },
    };
  };

  // --- başlık + büyük kart (adım hapları / sıra numarası seçenekli) ---
  L.card = S => {
    titleCues(S.titles); calloutCues(S.callouts); S.segs.slice(1).forEach(s => cue(s.a, 'cut'));
    const top = S.cardTop || 360, idx = S.index;
    return {
      html: `${S.pills ? `<div id="pills" style="top:20px;display:flex;gap:14px">${S.pills.map((p, i) => `<span class="pill" id="pl${i}">${p}</span>`).join('')}</div>` : eb('eb', S.eyebrow, 'top:20px')}
        ${idx ? `<div id="cnt" class="it" style="top:70px;left:auto;right:0;font-size:220px;line-height:1;color:var(--brand-hi);text-align:right"></div>` : ''}
        ${titlesHTML(S.titles, S.titleTop || 100, 'h-s', idx ? 'right:240px' : '')}
        ${shotHTML('sh', `top:${top}px;height:${1350 - top}px`)}
        ${calloutsHTML(S.callouts)}`,
      update(t) {
        if (S.pills) {
          let cur = 0; S.segs.forEach((s, i) => { if (t >= s.a) cur = Math.min(i, S.pills.length - 1); });
          if (S.pillAt) { cur = 0; S.pillAt.forEach((a, i) => { if (t >= a) cur = i; }); }
          S.pills.forEach((_, i) => { const el = $('pl' + i); el.classList.toggle('on', i === cur); fadeIn(el, t, i * .1 - .1, { dy: 16, blur: 4 }); });
        } else fadeIn($('eb'), t, 0, { dy: 20, blur: 6 });
        const i = titles(S.titles, t);
        if (idx) { const cn = $('cnt'), a = S.titles[i].a; cn.textContent = S.titles[i].n || ''; rise(cn, t, a, { dy: 50, blur: 10, pre: a <= 0 ? .9 : 0 }); }
        const sh = $('sh'), p = E.out(prog(t, -.2, .8));
        const cut = S.segs.slice(1).reduce((m, s) => Math.max(m, 1 - clamp(Math.abs(t - s.a - .12) / .3)), 0);
        sh.style.transform = `translate3d(0,${(1 - p) * 110}px,0) scale(${1 - .025 * cut})`; sh.style.opacity = clamp(p * 1.4);
        callouts(S.callouts, t);
        return shot('sh', S.segs, t);
      },
    };
  };

  // --- iki eğik kart ---
  L.duo = S => {
    titleCues(S.titles); calloutCues(S.callouts); cue(.9, 'whoosh');
    return {
      html: `${eb('eb', S.eyebrow, 'top:20px')}
        ${titlesHTML(S.titles, 90)}
        ${shotHTML('sa', 'left:0;right:auto;top:330px;width:540px;height:470px')}
        ${shotHTML('sb', 'left:396px;right:auto;top:560px;width:540px;height:760px')}
        ${calloutsHTML(S.callouts)}`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); titles(S.titles, t);
        const a = E.out(prog(t, -.2, .8)), b = E.out(prog(t, .9, 1.7));
        Object.assign($('sa').style, { opacity: clamp(a * 1.4), transform: `translate3d(${(1 - a) * -80}px,${(1 - a) * 60}px,0) rotate(${-4 + Math.sin(t * .7) * .5}deg)` });
        Object.assign($('sb').style, { opacity: clamp(b * 1.4), transform: `translate3d(${(1 - b) * 120}px,${(1 - b) * 80}px,0) rotate(${4 + Math.sin(t * .6 + 1) * .5}deg)` });
        callouts(S.callouts, t);
        return Promise.all([shot('sa', S.segsA, t), shot('sb', S.segsB, t)]);
      },
    };
  };

  // --- 3. akşam: hediye bileti ---
  const head2 = S => S.head || ['1 ay <span class="brand">Pro</span>', ['hediye.', 'it']];
  const typeCode = (el, t, a, b) => { const code = 'TEKLIF30', n = Math.round(clamp(prog(t, a, b)) * code.length); el.innerHTML = code.slice(0, n) + `<span style="opacity:0">${code.slice(n)}</span>`; };
  L.ticket = S => {
    cue(.45, 'pop'); cue(.7, 'type', { dur: .6 }); cue(1.5, 'pop');
    return {
      html: `<div style="display:flex;flex-direction:column;align-items:center;text-align:center;top:${S.top ?? 110}px">
        ${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye')}
        <div class="display h-xl" id="hd" style="margin-top:46px">${lns(head2(S))}</div>
        <div class="ticket" id="tk" style="margin-top:60px;width:800px;opacity:0">
          <div style="font-size:30px;font-weight:700;letter-spacing:.2em;color:var(--muted)">KAMPANYA KODU</div>
          <div id="code" class="timer" style="font-size:118px;margin-top:10px;letter-spacing:.06em">TEKLIF30</div></div>
        <div class="btn" id="bt" style="margin-top:64px;opacity:0">${ICON.up}${S.btn || 'Profildeki linke dokun'}</div>
        <div id="nt" class="sub" style="margin-top:40px">${S.note || 'anindateklif.co/hediye · Kod otomatik tanımlanır'}</div></div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        const p = E.back(prog(t, .45, 1.0)), tk = $('tk');
        tk.style.opacity = clamp(prog(t, .45, .6)); tk.style.transform = `rotate(${(1 - p) * -6}deg) scale(${.82 + .18 * p})`;
        typeCode($('code'), t, .7, 1.3);
        const pb = E.out(prog(t, 1.5, 2.1)), bt = $('bt'), bob = Math.sin((t - 2.1) * 4.5) * 8 * clamp((t - 2.1) * 2);
        bt.style.opacity = pb; bt.style.transform = `translate3d(0,${(1 - pb) * 40 - Math.max(0, bob)}px,0)`;
        rise($('nt'), t, 1.8, { dy: 20, blur: 6 });
      },
    };
  };

  // --- yorum CTA: balonlar ---
  const bubbleMe = `<div class="bubble me" id="bm" style="opacity:0"><div class="av">S</div><div><div class="who">sen</div><div class="txt" id="bw">TEKLİF</div></div></div>`;
  const bubbleReply = (S, style = '') => `<div class="bubble reply" id="br" style="opacity:0;${style}"><div class="av brandav">${BOLT(34)}</div><div><div class="who">anindateklif · otomatik cevap</div><div class="txt" style="display:flex;align-items:center;gap:14px">${ICON.gift}<span>1 ay <b>Pro</b> hediyen hazır!</span></div><div class="muted2">anindateklif.co/hediye · kod: TEKLIF30</div></div></div>`;
  L.comment = S => {
    cue(.5, 'pop'); cue(.8, 'type', { dur: .45 }); cue(1.5, 'pop'); cue(2.0, 'ding');
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div class="display h-xl" id="hd" style="top:150px">${lns(S.head || ["Son Reels'e", '<span class="brand">TEKLİF</span> <span class="it">yaz.</span>'])}</div>
        <div id="bb" style="top:530px">${bubbleMe}${bubbleReply(S)}</div>
        <div id="nt" class="sub" style="top:${S.noteTop || 1080}px;color:var(--ink)">${S.note || 'Otomatik cevaptaki linkten üye ol,<br>1 ay Pro hesabına tanımlansın.'}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        pop($('bm'), t, .5);
        const w = 'TEKLİF', n = Math.round(clamp(prog(t, .8, 1.25)) * w.length);
        $('bw').innerHTML = w.slice(0, n) + `<span class="caret" style="opacity:${n < w.length || Math.floor(t * 3) % 2 ? 1 : 0}"></span>`;
        pop($('br'), t, 1.5);
        rise($('nt'), t, 2.1, { dy: 20, blur: 6 });
      },
    };
  };

  // --- yorum CTA: dev harf karoları ---
  L.word = S => {
    const w = ['T', 'E', 'K', 'L', 'İ', 'F'];
    w.forEach((_, i) => cue(.5 + i * .12, 'pop')); cue(1.6, 'whoosh'); cue(2.2, 'pop'); cue(2.6, 'ding');
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div class="display h-s" id="hd" style="top:100px">${lns(S.head)}</div>
        ${w.map((c, i) => `<div class="tile" id="w${i}" style="left:${i * 159}px;right:auto;top:290px;width:140px;height:190px;font-size:130px;opacity:0;${i < 6 ? 'color:var(--brand-hi)' : ''}">${c}</div>`).join('')}
        <div class="display h-s" id="hd2" style="top:540px">${lns(S.head2)}</div>
        <div id="bb" style="top:720px">${bubbleReply(S, 'margin:0')}</div>
        <div id="nt" class="sub" style="top:1060px;color:var(--ink)">${S.note}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        w.forEach((_, i) => { const el = $('w' + i), p = pop(el, t, .5 + i * .12, { dy: 60, from: .5 }); el.style.transform += ` rotate(${(1 - clamp(p)) * (i % 2 ? 8 : -8)}deg)`; });
        head($('hd2'), t, 1.6);
        pop($('br'), t, 2.2);
        rise($('nt'), t, 2.7, { dy: 20, blur: 6 });
      },
    };
  };

  // --- hediye kutusu açılır ---
  L.gift = S => {
    cue(.9, 'pop'); cue(1.05, 'whoosh'); cue(1.55, 'ding'); cue(2.0, 'whoosh');
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div id="box" style="top:90px;height:600px">
          <div id="gcard" style="position:absolute;left:50%;top:330px;width:440px;height:250px;margin-left:-220px;border-radius:36px;background:linear-gradient(160deg,#fff,#E9E8FF);color:#0B0B12;text-align:center;padding-top:34px;box-shadow:0 30px 80px rgba(79,70,229,.5)">
            <div style="font-size:30px;font-weight:800;letter-spacing:.22em;color:#4F46E5">HEDİYE</div>
            <div style="font-size:110px;font-weight:800;letter-spacing:-.04em;line-height:1.05">1 ay <span style="color:#4F46E5">Pro</span></div></div>
          <div id="gbody" style="position:absolute;left:50%;top:330px;width:460px;height:270px;margin-left:-230px;border-radius:28px;background:${S.warm ? 'linear-gradient(160deg,#FFC867,#E08A1E)' : 'linear-gradient(160deg,#6D66FF,#3F37C9)'};box-shadow:0 40px 120px rgba(79,70,229,.55),inset 0 2px 0 rgba(255,255,255,.25)">
            <div style="position:absolute;left:50%;top:0;bottom:0;width:70px;margin-left:-35px;background:${S.warm ? '#4F46E5' : '#F5B544'}"></div></div>
          <div id="glid" style="position:absolute;left:50%;top:240px;width:510px;height:104px;margin-left:-255px;border-radius:24px;background:${S.warm ? 'linear-gradient(160deg,#FFD58A,#F0A030)' : 'linear-gradient(160deg,#7C76FF,#4F46E5)'};box-shadow:0 20px 50px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.3)">
            <div style="position:absolute;left:50%;top:0;bottom:0;width:76px;margin-left:-38px;background:${S.warm ? '#4F46E5' : '#F5B544'}"></div>
            <div style="position:absolute;left:50%;top:-74px;width:200px;height:84px;margin-left:-100px">
              <span style="position:absolute;left:4px;top:8px;width:96px;height:66px;border:16px solid ${S.warm ? '#6D66FF' : '#F5B544'};border-radius:50% 50% 50% 50%;transform:rotate(-20deg)"></span>
              <span style="position:absolute;right:4px;top:8px;width:96px;height:66px;border:16px solid ${S.warm ? '#6D66FF' : '#F5B544'};border-radius:50%;transform:rotate(20deg)"></span></div></div>
        </div>
        <div class="display h-l" id="hd" style="top:${S.headTop || 740}px;text-align:center">${lns(S.head)}</div>
        <div id="nt" class="sub" style="top:${S.noteTop || 1010}px;text-align:center;color:var(--ink)">${S.note}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 });
        const bp = E.out(prog(t, -.25, .7)), sh = Math.sin(t * 22) * 3 * clamp(prog(t, .45, .6)) * (1 - clamp(prog(t, .85, .9)));
        $('box').style.opacity = clamp(bp * 1.3); $('box').style.transform = `translate3d(${sh}px,${(1 - bp) * 80}px,0)`;
        const lp = E.out(prog(t, .9, 1.5)), lid = $('glid');
        lid.style.transform = `translate3d(${lp * -260}px,${lp * -170}px,0) rotate(${lp * -38}deg)`; lid.style.opacity = 1 - clamp(prog(t, 1.25, 1.55));
        const cp = E.back(prog(t, 1.05, 1.75)), gc = $('gcard');
        gc.style.transform = `translate3d(0,${cp * -300}px,0) rotate(${(1 - clamp(cp)) * 6 + Math.sin(t * 1.2) * 1.2 * clamp(t - 1.75)}deg)`;
        head($('hd'), t, 2.0); rise($('nt'), t, 2.4, { dy: 20, blur: 6 });
      },
    };
  };

  // --- 3 adımda hediye ---
  L.steps = S => {
    S.steps.forEach((_, i) => { cue(.6 + i * .2, 'pop'); cue(1.6 + i * .7, 'tick'); });
    cue(1.6 + S.steps.length * .7 + .2, 'pop');
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div class="display h-l" id="hd" style="top:100px">${lns(S.head)}</div>
        ${S.steps.map((s, i) => `<div class="step" id="sp${i}" style="top:${430 + i * 214}px;opacity:0"><span class="n" id="sn${i}">${i + 1}</span><span class="tx">${s[0]}<small>${s[1]}</small></span></div>`).join('')}
        <div id="ft" style="top:${430 + S.steps.length * 214 + 40}px;display:flex;align-items:center;gap:24px;opacity:0">
          <span class="ticket" style="padding:20px 34px;border-radius:24px"><span class="timer" style="font-size:56px;letter-spacing:.05em">TEKLIF30</span></span>
          <span class="sub" style="color:var(--ink)">${S.foot || 'İlk 1000 üyeye<br>1 ay Pro hediye'}</span></div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        S.steps.forEach((_, i) => {
          const el = $('sp' + i); rise(el, t, .6 + i * .2, { dy: 50, blur: 8 });
          const p = E.back(prog(t, 1.6 + i * .7, 1.95 + i * .7)), n = $('sn' + i);
          if (p > 0) { n.innerHTML = ICON.check.replace('width="40" height="40"', 'width="54" height="54"'); n.style.background = `rgba(79,70,229,${clamp(p)})`; n.style.transform = `scale(${.8 + .2 * p})`; el.style.borderColor = `rgba(139,135,255,${.6 * clamp(p)})`; }
          else { n.textContent = i + 1; n.style.background = ''; n.style.transform = ''; el.style.borderColor = ''; }
        });
        pop($('ft'), t, 1.6 + S.steps.length * .7 + .2, { dy: 30, from: .85 });
      },
    };
  };

  // --- kod karoları (şerit tabela gibi döner) ---
  L.code = S => {
    const code = 'TEKLIF30', AL = 'ABCDEFGHJKLMNOPRSTUVYZ0123456789', st = i => .35 + i * .14 + .5;
    cue(.3, 'type', { dur: st(7) - .3 }); cue(st(7) + .05, 'ding'); cue(1.9, 'whoosh'); cue(2.6, 'pop');
    const W = 104, G = 14.6;
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div class="display h-s" id="hd" style="top:100px">${lns(S.head || ['Bu kodu not al:'])}</div>
        ${[...code].map((c, i) => `<div class="tile" id="c${i}" style="left:${i * (W + G)}px;right:auto;top:250px;width:${W}px;height:160px;font-family:var(--mono);font-size:94px;${i > 5 ? 'color:var(--warm)' : ''}"></div>`).join('')}
        <div class="display h-xl" id="hd2" style="top:500px">${lns(head2(S))}</div>
        <div class="btn" id="bt" style="top:840px;left:0;right:auto;opacity:0">${ICON.up}${S.btn || 'Profildeki linkten üye ol'}</div>
        <div id="nt" class="sub" style="top:1000px">${S.note || 'anindateklif.co/hediye · İlk 1000 üyeye'}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        [...code].forEach((c, i) => {
          const el = $('c' + i), done = t >= st(i);
          el.textContent = done ? c : AL[(Math.floor(t * 24) + i * 7) % AL.length];
          el.style.opacity = done ? 1 : .55;
          const p = E.back(prog(t, st(i), st(i) + .3));
          el.style.transform = done ? `scale(${.9 + .1 * p})` : `translateY(${Math.sin(t * 40 + i) * 3}px)`;
          el.style.borderColor = done ? 'rgba(139,135,255,.6)' : '';
        });
        head($('hd2'), t, 1.9);
        const pb = E.out(prog(t, 2.6, 3.2)); $('bt').style.opacity = pb; $('bt').style.transform = `translate3d(0,${(1 - pb) * 40}px,0)`;
        rise($('nt'), t, 2.9, { dy: 20, blur: 6 });
      },
    };
  };

  // --- iki yol, tek hediye ---
  L.twoWay = S => {
    cue(.6, 'pop'); cue(1.3, 'pop'); cue(2.0, 'pop'); cue(2.6, 'whoosh');
    const card = (id, n, a, b, top) => `<div class="step" id="${id}" style="top:${top}px;opacity:0;padding:40px 44px"><span class="n">${n}</span><span class="tx">${a}<small>${b}</small></span></div>`;
    return {
      html: `${eb('eb', S.eyebrow || 'Hediye · İlk 1000 üyeye', 'top:20px')}
        <div class="display h-l" id="hd" style="top:100px">${lns(S.head)}</div>
        ${card('wa', 1, S.a[0], S.a[1], 400)}
        <div id="or" class="it" style="top:640px;text-align:center;font-size:64px;color:var(--brand-hi);opacity:0">ya da</div>
        ${card('wb', 2, S.b[0], S.b[1], 750)}
        <div class="display h-s" id="hd2" style="top:1060px">${lns(S.end)}</div>`,
      update(t) {
        fadeIn($('eb'), t, 0, { dy: 20, blur: 6 }); head($('hd'), t, 0);
        pop($('wa'), t, .6, { from: .9 }); rise($('or'), t, 1.3, { dy: 20, blur: 6 }); pop($('wb'), t, 2.0, { from: .9 });
        head($('hd2'), t, 2.6);
      },
    };
  };

  // =====================================================================
  const lay = L[S.layout](S);
  const DUR = S.dur || 8;
  document.getElementById('stage').innerHTML = `
    ${bgHTML(S.bg)}
    ${lay.pre || ''}
    <div id="safe">${lay.html}</div>
    ${R.SNIP.fx}`;
  if (S.bg === 'indigo') document.getElementById('stage').classList.add('ind');

  async function render(t) {
    bgUpdate(t);
    await lay.update(t);
  }
  window.CUES = CUES.filter(c => c.t >= 0 && c.t < DUR).sort((a, b) => a.t - b.t);
  window.DUR = DUR; window.render = render; window.STORY = S;
  window.READY = render(0);
})();

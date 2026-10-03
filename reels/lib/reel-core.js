// Anında Teklif — Reels v2 ortak hareket çekirdeği.
// Her şey t (saniye) ile belirlenir: CSS transition / rAF / Date yok, böylece
// render.mjs kare kare çekerken çıktı birebir tekrar üretilebilir.
(function () {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const mix = (a, b, p) => a + (b - a) * p;
  // Hareket dili: hızlı çıkış, uzun yumuşak oturma (expo/quint).
  const E = {
    out: x => (x = clamp(x), x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),        // expo out
    quint: x => (x = clamp(x), 1 - Math.pow(1 - x, 5)),
    inOut: x => (x = clamp(x), x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
    in: x => (x = clamp(x), x * x * x),
    back: x => { x = clamp(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  };
  const $ = id => document.getElementById(id);
  const $$ = (root, sel) => [...root.querySelectorAll(sel)];

  // Sahne görünürlüğü (keskin kesme; geçişler içeriğin kendi hareketiyle)
  function show(el, t, a, b) { const on = t >= a && t < b; el.style.visibility = on ? 'visible' : 'hidden'; return on; }

  // Maskeli satır açılışı. inAt: başlangıç, stagger: satır arası gecikme.
  // pre: t=inAt anındaki ilerleme (0. karede boş ekran olmasın diye >0 verilebilir).
  function lines(root, t, inAt, { stagger = .07, dur = .7, outAt = Infinity, outDur = .28, pre = 0 } = {}) {
    $$(root, '.ln > span').forEach((s, i) => {
      const p = clamp(pre + E.out(prog(t, inAt + i * stagger, inAt + i * stagger + dur)) * (1 - pre));
      const q = E.in(prog(t, outAt + i * .03, outAt + i * .03 + outDur));
      s.style.transform = `translate3d(0,${(1 - p) * 150 - q * 150}%,0)`;
    });
  }
  // Yumuşak giriş: yukarı kayma + bulanıklıktan netliğe
  function rise(el, t, a, { dur = .7, dy = 60, blur = 14, outAt = Infinity, outDur = .3, pre = 0, scale = 0 } = {}) {
    const p = clamp(pre + E.out(prog(t, a, a + dur)) * (1 - pre));
    const q = E.in(prog(t, outAt, outAt + outDur));
    el.style.opacity = p * (1 - q);
    el.style.transform = `translate3d(0,${(1 - p) * dy - q * dy * .6}px,0) scale(${1 - scale * (1 - p)})`;
    el.style.filter = (p < 1 || q > 0) ? `blur(${(1 - p) * blur + q * blur}px)` : 'none';
    return p * (1 - q);
  }
  // Sayı biçimi (tr-TR)
  const tl = n => '₺' + Math.round(n).toLocaleString('tr-TR');

  function background(t) {
    const g = $('bgGlow'); if (!g) return;
    g.style.transform = `translate3d(${Math.sin(t * .35) * 90}px, ${Math.cos(t * .27) * 70}px,0)`;
  }

  // Keyframe kamera: [{t, x, y, s}] — inOut ile ara değer
  function camera(keys, t) {
    let k0 = keys[0], k1 = keys[keys.length - 1];
    if (t <= k0.t) return k0; if (t >= k1.t) return k1;
    for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
    const p = (k1.ease || E.inOut)(prog(t, k0.t, k1.t));
    return { x: mix(k0.x, k1.x, p), y: mix(k0.y, k1.y, p), s: mix(k0.s, k1.s, p) };
  }

  // ---- Paylaşılan sahneler (HTML'leri reel-core.html şablonundan gelir) ----

  // Özellik sahnesi: başlık + ekran görüntüsü kartı, yavaş kamera kaydırma
  function feature(id, t, a, b, { pan = [0, 0, 0, -120], zoom = [1.0, 1.08] } = {}) {
    const sc = $(id); if (!show(sc, t, a, b)) return;
    lines(sc, t, a, { stagger: .06, dur: .6, outAt: b - .28 });
    const w = sc.querySelector('.win'), img = w.querySelector('img');
    const p = E.out(prog(t, a, a + .8));
    const q = E.in(prog(t, b - .3, b));
    w.style.transform = `translate3d(0,${(1 - p) * 220 - q * 140}px,0) rotateX(${(1 - p) * 14}deg) scale(${.92 + .08 * p})`;
    w.style.opacity = Math.min(1, p * 1.6) * (1 - q);
    const k = prog(t, a, b);
    img.style.transform = `translate3d(${-276 + mix(pan[0], pan[2], E.inOut(k))}px,${mix(pan[1], pan[3], E.inOut(k))}px,0) scale(${mix(zoom[0], zoom[1], E.inOut(k))})`;
    img.style.transformOrigin = '0 0';
    const tag = sc.querySelector('.idx'); if (tag) rise(tag, t, a, { dy: 20, blur: 6, outAt: b - .28 });
  }

  function cta(t, a, b) {
    const sc = $('cta'); if (!show(sc, t, a, b)) return;
    rise($('ctaEye'), t, a, { dy: 24, blur: 6 });
    lines($('ctaHead'), t, a + .05, { stagger: .07, dur: .65 });
    const tk = $('ctaTicket');
    const p = E.back(prog(t, a + .35, a + .95));
    tk.style.opacity = clamp(prog(t, a + .35, a + .55));
    tk.style.transform = `rotate(${(1 - p) * -6}deg) scale(${.82 + .18 * p})`;
    // kod harf harf "basılır"
    const code = 'TEKLIF30', n = Math.round(clamp(prog(t, a + .6, a + 1.25)) * code.length);
    $('ctaCode').innerHTML = code.slice(0, n) + `<span style="opacity:0">${code.slice(n)}</span>`;
    const bt = $('ctaBtn');
    const pb = E.out(prog(t, a + 1.0, a + 1.6));
    const pulse = 1 + Math.sin((t - a - 1.6) * 5.5) * .025 * clamp((t - a - 1.6) * 2);
    bt.style.opacity = pb; bt.style.transform = `translate3d(0,${(1 - pb) * 40}px,0) scale(${pulse})`;
    rise($('ctaNote'), t, a + 1.25, { dy: 20, blur: 6 });
  }

  function outro(t, a, b) {
    const sc = $('outro'); if (!show(sc, t, a, b)) return;
    const m = $('outroMark');
    const p = E.back(prog(t, a, a + .7));
    m.style.transform = `scale(${.5 + .5 * p}) rotate(${(1 - p) * -18}deg)`;
    m.style.opacity = clamp(prog(t, a, a + .2));
    lines($('outroName'), t, a + .15, { dur: .7 });
    rise($('outroUrl'), t, a + .45, { dy: 24, blur: 8 });
  }

  // Hazır HTML parçaları
  const SNIP = {
    bg: `<div class="bg-glow" id="bgGlow"></div><div class="bg-grid"></div>`,
    fx: `<div class="vignette"></div><div class="bg-grain"></div><div class="flash" id="flash"></div>`,
    feature: (id, idx, l1, l2, src, h = 860) => `
      <div class="scene" id="${id}">
        <div style="position:absolute;left:84px;right:84px;top:190px">
          <div class="eyebrow idx"><i></i>${idx}</div>
          <div class="display h-m" style="margin-top:34px"><span class="ln"><span>${l1}</span></span><span class="ln"><span class="brand">${l2}</span></span></div>
        </div>
        <div style="position:absolute;left:60px;right:60px;top:600px;perspective:1600px">
          <div class="win" style="position:relative;height:${h}px"><img src="${src}" style="width:1240px"></div>
        </div>
      </div>`,
    cta: `
      <div class="scene" id="cta" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:230px">
        <div class="eyebrow" id="ctaEye"><i></i>Instagram'a özel</div>
        <div class="display h-xl" id="ctaHead" style="margin-top:44px"><span class="ln"><span>1 ay <span class="brand">Pro</span></span></span><span class="ln"><span class="it" style="font-size:150px">ücretsiz.</span></span></div>
        <div class="ticket" id="ctaTicket" style="margin-top:70px;width:760px">
          <div style="font-size:30px;font-weight:700;letter-spacing:.2em;color:var(--muted)">KAMPANYA KODU</div>
          <div id="ctaCode" class="timer" style="font-size:118px;margin-top:10px;letter-spacing:.06em">TEKLIF30</div>
        </div>
        <div class="btn" id="ctaBtn" style="margin-top:64px">anindateklif.co/hediye <span style="font-size:44px">→</span></div>
        <div id="ctaNote" style="margin-top:40px;font-size:34px;font-weight:600;color:var(--muted)">İlk 1000 üyeye · Üye ol, kod otomatik tanımlanır</div>
      </div>`,
    outro: `
      <div class="scene" id="outro" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:470px">
        <div class="logo-mark" id="outroMark"><svg width="104" height="122" viewBox="0 0 24 28"><path d="M14 1 3 16h7l-2 11 11-15h-7l2-11z" fill="#fff"/></svg></div>
        <div class="display h-l" id="outroName" style="margin-top:64px"><span class="ln"><span>Anında Teklif</span></span></div>
        <div id="outroUrl" style="margin-top:34px;font-size:40px;font-weight:600;color:var(--muted)">Perde · Pergola · Cam Balkon<br><span style="color:var(--ink)">anindateklif.co/hediye</span></div>
      </div>`,
  };

  window.R = { clamp, prog, mix, E, $, $$, show, lines, rise, tl, background, camera, feature, cta, outro, SNIP };
})();

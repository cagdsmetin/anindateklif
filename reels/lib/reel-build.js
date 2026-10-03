// Ortak kurgu: [ürün eylemi + hook] → özellikler → CTA → logo.
// Versiyon dosyası window.CFG'yi tanımlar, sonra bu dosyayı yükler.
(function () {
  const { E, prog, clamp, $, show, lines, rise, background, camera, feature, cta, outro, SNIP } = window.R;
  const C = window.CFG;
  const A = C.actionEnd;                 // ürün sahnesinin bitişi
  const F = [A, A + 1.45, A + 2.9, A + 4.3]; // 3 özellik sahnesi
  const CTA = [F[3], F[3] + 3.6];
  const OUT = [CTA[1], CTA[1] + 1.9];
  const DUR = OUT[1];

  document.getElementById('stage').innerHTML = `
    ${SNIP.bg}
    <div class="scene" id="act">
      <div class="phone-wrap" id="phoneWrap"><div class="phone"><div class="island"></div><div class="screen" id="screen"></div></div></div>
      <div id="hook" style="position:absolute;left:0;right:0;top:0">${C.hookHTML}</div>
    </div>
    ${SNIP.feature('f1', '01 · Katalog', 'Ürünü bir kez tanımla,', 'sonra sadece seç.', 'assets/02_katalog.jpg')}
    ${SNIP.feature('f2', '02 · Panel', 'Tüm işin', 'tek ekranda.', 'assets/01_panel.jpg')}
    ${SNIP.feature('f3', '03 · AI Asistan', 'Teklif metnini', 'AI hazırlasın.', 'assets/05_ai_asistan.jpg')}
    ${SNIP.cta}
    ${SNIP.outro}
    ${SNIP.fx}`;

  QuoteDemo.mount($('screen'));
  const CAM = typeof C.cam === 'function' ? C.cam(QuoteDemo) : C.cam;

  // Telefonu ekrana yerleştir: mantıksal (fx,fy) noktası ekranda (cx,cy)'ye gelsin
  function placePhone(cam) {
    const x = cam.cx - cam.fx * cam.s, y = cam.cy - cam.fy * cam.s;
    $('phoneWrap').style.transform = `translate3d(${x}px,${y}px,0) scale(${cam.s})`;
  }
  function cam2(keys, t) {
    // keys: {t, s, fx, fy, cx, cy}
    let k0 = keys[0], k1 = keys[keys.length - 1];
    if (t <= k0.t) return k0; if (t >= k1.t) return k1;
    for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
    const p = E.inOut(prog(t, k0.t, k1.t)), m = (a, b) => a + (b - a) * p;
    return { s: m(k0.s, k1.s), fx: m(k0.fx, k1.fx), fy: m(k0.fy, k1.fy), cx: m(k0.cx, k1.cx), cy: m(k0.cy, k1.cy) };
  }

  function render(t) {
    background(t);
    if (show($('act'), t, -1, A)) {
      QuoteDemo.render(C.demoTime(t));
      placePhone(cam2(CAM, t));
      // sahne çıkışı: telefon aşağı + bulanık
      const q = E.in(prog(t, A - .3, A));
      $('phoneWrap').style.opacity = 1 - q;
      $('phoneWrap').style.filter = q ? `blur(${q * 16}px)` : 'none';
      C.hook(t, q);
    }
    feature('f1', t, F[0], F[1], { pan: [0, 0, -40, -60], zoom: [1.0, 1.06] });
    feature('f2', t, F[1], F[2], { pan: [0, 0, -60, -90], zoom: [1.0, 1.07] });
    feature('f3', t, F[2], F[3], { pan: [0, 0, -30, -40], zoom: [1.0, 1.05] });
    cta(t, CTA[0], CTA[1]);
    outro(t, OUT[0], OUT[1] + 1);
    // sahne kesmelerinde çok kısa ışık patlaması
    const fl = [F[0], F[1], F[2], CTA[0], OUT[0]].reduce((m, c) => Math.max(m, 1 - clamp(Math.abs(t - c) / .09)), 0);
    $('flash').style.opacity = fl * .35;
  }
  window.render = render; window.DUR = DUR;
  render(0);
})();

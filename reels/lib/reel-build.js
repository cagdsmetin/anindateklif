// Ortak kurgu: [hook + gerçek uygulama kaydı] → özellikler → CTA → logo.
// Uygulama görüntüleri reels/footage/ içindeki gerçek kayıtlardan gelir
// (demo veri). Kareler önce `node extract-frames.mjs` ile preview/frames/'e
// açılır; render(t) her karede doğru kareyi yükleyip decode'u bekler.
(function () {
  const { E, prog, clamp, $, show, lines, rise, background, cta, ctaComment, outro, SNIP } = window.R;
  const C = window.CFG;

  // Kaynak: 1170×2532 (@3x) kayıtlar, 30 fps
  const SRC_W = 1170, SRC_H = 2532;
  const CLIPS = {
    zip:   { dir: 'preview/frames/v01_zip_perde_olcu_fiyat', n: 184 },
    pdf:   { dir: 'preview/frames/v03_teklif_pdf_onizleme', n: 144 },
    panel: { dir: 'preview/frames/v04_panel_kaydirma', n: 135 },
    ai:    { dir: 'preview/frames/v05_ai_asistan', n: 164 },
    katalog: { still: 'footage/mobile/m_18_katalog.png' },
    // Kişi adı/telefon içermeyen ekran görüntüleri
    m_panel_genel: { still: 'footage/mobile/m_02_panel_genel_bakis.png' },
    m_katalogdan_ekle: { still: 'footage/mobile/m_04_teklif_katalogdan_ekle.png' },
    m_kalemler: { still: 'footage/mobile/m_05_teklif_kalemler.png' },
    m_toplam: { still: 'footage/mobile/m_06_teklif_toplam.png' },
    m_pdf_klasik: { still: 'footage/mobile/m_07_pdf_onizleme.png' },
    m_pdf_modern: { still: 'footage/mobile/m_07b_pdf_onizleme_modern.png' },
    m_zip_olcu: { still: 'footage/mobile/m_08_zip_perde_olcu.png' },
    m_zip_cizim: { still: 'footage/mobile/m_09_zip_perde_cizim.png' },
    m_zip_fiyat: { still: 'footage/mobile/m_10_zip_perde_fiyat.png' },
    m_kasa: { still: 'footage/mobile/m_12_kasa.png' },
    m_ai: { still: 'footage/mobile/m_16_ai_asistan.png' },
  };
  const srcOf = (clip, lt) => {
    const c = CLIPS[clip]; if (c.still) return c.still;
    const i = clamp(Math.floor(lt * 30 + 1e-6) + 1, 1, c.n);
    return `${c.dir}/${String(i).padStart(4, '0')}.jpg`;
  };

  // Kart: hook/başlık altında, Instagram alt arayüz alanının (alt 420px) üstünde
  const CARD = { x: 60, y: 560, w: 960, h: 940 };
  const K0 = CARD.w / SRC_W;

  const DEF_FEATS = [
    { clip: 'katalog', from: 0, idx: '01 · Katalog', l1: 'Ürünü bir kez tanımla,', l2: 'sonra sadece seç.', cam: [{ t: 0, sy: 205, z: 1.0 }, { t: 1.6, sy: 300, z: 1.05 }] },
    { clip: 'panel', from: 2.1, idx: '02 · Panel', l1: 'Tüm işin', l2: 'tek ekranda.', cam: [{ t: 0, sy: 40, z: 1.0 }, { t: 1.6, sy: 40, z: 1.05 }] },
    { clip: 'ai', from: 3.25, idx: '03 · AI Asistan', l1: 'Teklif metnini', l2: 'AI hazırlasın.', cam: [{ t: 0, sy: 60, z: 1.0 }, { t: 1.6, sy: 140, z: 1.05 }] },
  ];
  const FEATS = C.features || DEF_FEATS;
  const A = C.actionEnd, FD = C.featDur || 1.6;
  const F = FEATS.map((_, i) => A + i * FD); F.push(A + FEATS.length * FD);
  const CTA_LEN = C.cta === 'code' ? 3.6 : 3.9;
  const CTA = [F[F.length - 1], F[F.length - 1] + CTA_LEN];
  const OUT = [CTA[1], CTA[1] + 1.9];
  const DUR = OUT[1];
  const shots = C.shots.concat(FEATS.map((f, i) => ({ a: F[i], b: F[i + 1], clip: f.clip, from: f.from || 0, cam: f.cam || [{ t: 0, sy: 0, z: 1 }, { t: FD, sy: 60, z: 1.05 }], redact: f.redact, ring: f.ring })));

  const feat = (id, idx, l1, l2) => `
    <div class="scene" id="${id}">
      <div style="position:absolute;left:84px;right:84px;top:170px">
        <div class="eyebrow idx"><i></i>${idx}</div>
        <div class="display h-m" style="margin-top:30px"><span class="ln"><span>${l1}</span></span><span class="ln"><span class="brand">${l2}</span></span></div>
      </div>
    </div>`;

  document.getElementById('stage').innerHTML = `
    ${SNIP.bg}
    <div id="card" class="card">
      <img id="shot">
      <div class="redact" id="redact1"></div><div class="redact" id="redact2"></div>
      <div class="ring" id="ring"></div>
    </div>
    <div class="scene" id="act"><div id="hook" style="position:absolute;left:0;right:0;top:0">${C.hookHTML}</div></div>
    ${FEATS.map((f, i) => feat('f' + i, f.idx, f.l1, f.l2)).join('')}
    ${C.cta === 'code' ? SNIP.cta : SNIP.ctaComment}
    ${SNIP.outro}
    ${SNIP.fx}`;

  const card = $('card'), img = $('shot');
  Object.assign(card.style, { left: CARD.x + 'px', top: CARD.y + 'px', width: CARD.w + 'px', height: CARD.h + 'px' });

  function camAt(keys, lt) {
    let k0 = keys[0], k1 = keys[keys.length - 1];
    if (lt <= k0.t) k1 = k0; else if (lt >= k1.t) k0 = k1;
    else for (let i = 0; i < keys.length - 1; i++) if (lt >= keys[i].t && lt <= keys[i + 1].t) { k0 = keys[i]; k1 = keys[i + 1]; break; }
    const p = k0 === k1 ? 0 : E.inOut(prog(lt, k0.t, k1.t)), m = (a, b) => a + (b - a) * p;
    return { sy: m(k0.sy, k1.sy), z: m(k0.z, k1.z), sx: m(k0.sx ?? 585, k1.sx ?? 585) };
  }
  // Kaynak koordinatındaki bir dikdörtgeni kart koordinatına çevir
  const toCard = (r, cam) => {
    const k = K0 * cam.z;
    return { x: CARD.w / 2 + (r[0] - cam.sx) * k, y: (r[1] - cam.sy) * k, w: r[2] * k, h: r[3] * k };
  };
  const place = (el, b) => Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });

  let lastSrc = '';
  async function render(t) {
    background(t);
    // --- kart / uygulama görüntüsü ---
    const s = shots.find(s => t >= s.a && t < s.b);
    if (s) {
      const lt = t - s.a, clipT = s.from + lt * (s.rate || 1);
      const cam = camAt(s.cam, lt);
      const src = srcOf(s.clip, clipT);
      if (src !== lastSrc) { img.src = src; lastSrc = src; await img.decode().catch(() => {}); }
      const k = K0 * cam.z;
      img.style.width = SRC_W * k + 'px';
      img.style.transform = `translate3d(${CARD.w / 2 - cam.sx * k}px,${-cam.sy * k}px,0)`;
      // kart giriş/çıkış ve çekim değişiminde küçük nefes
      const inP = E.out(prog(t, s.a, s.a + .45)), first = s === shots[0];
      const outP = E.in(prog(t, s.b - .22, s.b));
      const nextIsCard = shots.some(n => Math.abs(n.a - s.b) < 1e-6);
      const enter = first ? 1 : inP, leave = nextIsCard ? 0 : outP;
      card.style.visibility = 'visible';
      card.style.opacity = (first ? 1 : Math.min(1, inP * 1.4)) * (1 - leave);
      card.style.transform = `translate3d(0,${(1 - enter) * 120 + leave * 60}px,0) scale(${.94 + .06 * enter - .03 * leave})`;
      card.style.filter = (enter < 1 || leave > 0) ? `blur(${(1 - enter) * 10 + leave * 10}px)` : 'none';
      // kişisel veri örtüsü (PDF'teki demo müşteri bloğu)
      ['redact1', 'redact2'].forEach((id, i) => {
        const r = s.redact && s.redact[i] && clipT >= s.redact[i].from ? s.redact[i].rect : null;
        $(id).style.display = r ? 'block' : 'none'; if (r) place($(id), toCard(r, cam));
      });
      // vurgu halkası
      const ring = $('ring');
      if (s.ring && lt >= s.ring.at) {
        const p = E.out(prog(lt, s.ring.at, s.ring.at + .5));
        const b = toCard(s.ring.rect, cam);
        place(ring, { x: b.x - 14, y: b.y - 10, w: b.w + 28, h: b.h + 20 });
        ring.style.opacity = p; ring.style.transform = `scale(${1.12 - .12 * p})`;
      } else ring.style.opacity = 0;
    } else card.style.visibility = 'hidden';

    // --- metin katmanları ---
    if (show($('act'), t, -1, A)) C.hook(t);
    FEATS.forEach((_, i) => { const id = 'f' + i, a = F[i], b = F[i + 1];
      const sc = $(id); if (!show(sc, t, a, b)) return;
      lines(sc, t, a, { stagger: .06, dur: .6, outAt: b - .26 });
      rise(sc.querySelector('.idx'), t, a, { dy: 20, blur: 6, outAt: b - .26 });
    });
    (C.cta === 'code' ? cta : ctaComment)(t, CTA[0], CTA[1]);
    outro(t, OUT[0], OUT[1] + 1);
    const fl = [A, CTA[0], OUT[0]].reduce((m, c) => Math.max(m, 1 - clamp(Math.abs(t - c) / .09)), 0);
    $('flash').style.opacity = fl * .3;
  }
  // Ses ipuçları (lib/audio.mjs bunları okuyup efekt/müzik miksler)
  window.CUES = [].concat(C.cues || [],
    shots.slice(1).map(s => ({ t: s.a, type: 'cut' })),
    [{ t: A, type: 'whoosh' }, { t: CTA[0], type: 'whoosh' }, { t: CTA[0] + (C.cta === 'code' ? .6 : .75), type: C.cta === 'code' ? 'type' : 'type', dur: .5 },
     { t: CTA[0] + (C.cta === 'code' ? .4 : 1.45), type: 'pop' }, { t: OUT[0], type: 'logo' }]);
  window.render = render; window.DUR = DUR;
  window.READY = render(0);
})();

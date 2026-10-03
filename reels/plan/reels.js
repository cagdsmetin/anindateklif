// Anında Teklif — 10 günlük Reels planı (günde 2 × 10 gün = 20 reel).
// reel.html?id=r07 → window.REELS.r07 (CFG). Motor: lib/reel-build.js.
// Kurallar: 0. karede hook metni + uygulama kaydı; tüm yazılar y<1500
// (alt 420px Instagram arayüzü); logo en sonda (outro). Kişisel veri yok:
// PDF ekranlarında demo müşteri ve imza blokları örtülür; panel kaydı 2.1 sn'den
// başlar (öncesinde kişi adı var); Zip Perde'de "Bayi fiyatı" değil
// "Satış fiyatı" vurgulanır. Sayısal iddia/istatistik/yorum uydurulmaz;
// tek kampanya bilgisi "ilk 1000 üyeye".
(function () {
  const R = window.R;
  const $ = R.$, E = R.E, prog = R.prog, clamp = R.clamp;

  // ---------- küçük yardımcılar ----------
  const ln = (...rows) => rows.map(r => `<span class="ln"><span>${r}</span></span>`).join('');
  const at = (top, id, inner, extra = '') => `<div id="${id}" style="position:absolute;left:84px;right:84px;top:${top}px;${extra}">${inner}</div>`;
  const CSS = `<style>
    .strike{position:absolute;left:-8px;right:-8px;top:50%;height:8px;margin-top:0;border-radius:4px;background:#F05252;transform-origin:0 50%;transform:scaleX(0);box-shadow:0 0 30px rgba(240,82,82,.5)}
    .rel{position:relative}
    .cols{display:flex;gap:28px}
    .col{flex:1;border-radius:28px;padding:18px 24px 14px}
    .col.old{background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.10)}
    .col.new{background:rgba(79,70,229,.16);border:1.5px solid rgba(139,135,255,.45)}
    .col h4{font-size:28px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}
    .rowx{display:flex;align-items:center;gap:16px;height:54px;font-size:35px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
    .rowx .tx{position:relative}
    .mk{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}
    .mk.no{background:rgba(240,82,82,.16)} .mk.ok{background:rgba(52,211,153,.2)}
    .step{display:flex;align-items:center;gap:24px;height:76px;font-size:42px;font-weight:800;letter-spacing:-.02em;white-space:nowrap}
    .step .n{width:62px;height:62px;border-radius:20px;display:flex;align-items:center;justify-content:center;flex:none;font-size:32px;font-weight:800;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.16);color:var(--ink)}
    .pill{display:inline-flex;align-items:center;gap:14px;padding:14px 28px;border-radius:999px;font-size:34px;font-weight:800}
    .tabs{display:flex;gap:18px}
    .tab{padding:16px 34px;border-radius:22px;font-size:38px;font-weight:800;border:2px solid rgba(255,255,255,.16);color:var(--muted)}
    .cbub{display:inline-block;max-width:900px;padding:24px 32px;border-radius:34px 34px 34px 10px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.14)}
    .cbub .who{font-size:26px;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:12px}
    .cbub .txt{font-size:44px;font-weight:800;letter-spacing:-.015em;margin-top:6px;line-height:1.2}
    .dots{display:inline-flex;gap:8px;margin-left:6px}.dots i{width:10px;height:10px;border-radius:50%;background:var(--muted);display:block}
  </style>`;
  const ICON = {
    x: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F58A8A" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    ok: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
    okDark: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#06140D" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
    chat: `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"/><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.6" stroke-linecap="round"/></svg>`,
    moon: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`,
    pin: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    gift: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.2 8.5 8 12 8zm0 0s1.5-4.5 4-3.8S15.5 8 12 8z"/></svg>`,
  };
  // Harf harf yazım (genişlik sabit kalsın diye kalan harfler görünmez)
  const typeIn = (el, word, t, a, b) => { const n = Math.round(clamp(prog(t, a, b)) * word.length); el.innerHTML = word.slice(0, n) + `<span style="opacity:0">${word.slice(n)}</span>`; };
  const strike = (el, t, a, d = .45) => { el.style.transform = `scaleX(${E.out(prog(t, a, a + d))})`; };
  const L = (id, t, a, o) => R.lines($(id), t, a, o);
  const Rs = (id, t, a, o) => R.rise($(id), t, a, o);

  // ---------- çekimler (kaynak px 1170×2532) ----------
  // Zip Perde kaydı, istenirse baştan kırpılarak (from). Fiyat halkası "Satış fiyatı"nda.
  const zipAt = (a, b, from = 0) => {
    const z = window.zipShot(a, b);
    if (!from) return z;
    const keys = z.cam.map(k => ({ ...k, t: k.t - from }));
    const head = keys.filter(k => k.t <= 0).pop() || keys[0];
    z.cam = [{ ...head, t: 0 }].concat(keys.filter(k => k.t > 0));
    z.from = from; z.ring = { ...z.ring, at: z.ring.at - from };
    return z;
  };
  const zipCues = (a, from = 0) => [
    { t: a + .85 - from, type: 'type', dur: .35 },   // EN 350
    { t: a + 1.7 - from, type: 'type', dur: .3 },    // BOY 260
  ].filter(c => c.t >= a);
  const pdfCues = (a, pdfAt) => [{ t: a + pdfAt - .12, type: 'tick' }, { t: a + pdfAt, type: 'ding' }];
  const still = (a, b, clip, cam, o = {}) => Object.assign({ a, b, clip, from: 0, cam }, o);
  // PDF ekran görüntülerinde demo müşteri + imza blokları
  const RED_KLASIK = [{ from: 0, rect: [272, 680, 316, 168] }, { from: 0, rect: [696, 1256, 272, 46] }];
  const RED_MODERN = [{ from: 0, rect: [262, 704, 324, 170] }, { from: 0, rect: [108, 1250, 284, 48] }];
  const PDF_RED = window.pdfShot(0, 1, 0, .5).redact; // video PDF'i için motorun örtüleri

  // ---------- özellik sahneleri (1.6 sn) ----------
  const FT = {
    katalog: { clip: 'katalog', idx: 'Katalog', l1: 'Ürünü bir kez tanımla,', l2: 'sonra sadece seç.', cam: [{ t: 0, sy: 205, z: 1.0 }, { t: 1.6, sy: 300, z: 1.05 }] },
    katalogCam: { clip: 'katalog', idx: 'Ürün yapılandırıcı', l1: 'Cam balkonu bir kez kur,', l2: 'teklifte sadece seç.', cam: [{ t: 0, sy: 1060, z: 1.0 }, { t: 1.6, sy: 1160, z: 1.0 }], ring: { at: .4, rect: [36, 1592, 1100, 262] } },
    panel: { clip: 'panel', from: 2.1, idx: 'Panel', l1: 'Tüm işin', l2: 'tek ekranda.', cam: [{ t: 0, sy: 40, z: 1.0 }, { t: 1.6, sy: 40, z: 1.05 }] },
    panelGenel: { clip: 'm_panel_genel', idx: 'Panel', l1: 'Teklif durumları', l2: 'bir bakışta.', cam: [{ t: 0, sy: 560, z: 1.0 }, { t: 1.6, sy: 640, z: 1.04 }], ring: { at: .45, rect: [52, 1130, 1060, 540] } },
    ai: { clip: 'ai', from: 3.25, idx: 'AI Asistan', l1: 'Teklif metnini', l2: 'AI hazırlasın.', cam: [{ t: 0, sy: 60, z: 1.0 }, { t: 1.6, sy: 140, z: 1.05 }] },
    pdfModern: { clip: 'm_pdf_modern', idx: 'PDF şablonları', l1: 'Klasik mi, Modern mi?', l2: 'Şablonu sen seç.', cam: [{ t: 0, sy: 150, z: 1.0 }, { t: 1.6, sy: 300, z: 1.03 }], redact: RED_MODERN, ring: { at: .35, rect: [313, 178, 250, 106] } },
    whatsapp: { clip: 'm_toplam', idx: 'Gönder', l1: 'PDF ve WhatsApp,', l2: 'tek dokunuş.', cam: [{ t: 0, sy: 1290, z: 1.0 }, { t: 1.6, sy: 1386, z: 1.0 }], ring: { at: .45, rect: [600, 2060, 526, 140] } },
    toplam: { clip: 'm_toplam', idx: 'Toplam', l1: 'KDV dahil toplam', l2: 'kendiliğinden.', cam: [{ t: 0, sy: 1000, z: 1.0 }, { t: 1.6, sy: 1060, z: 1.05 }], ring: { at: .45, rect: [72, 1502, 1028, 140] } },
    zipFiyat: { clip: 'm_zip_fiyat', idx: 'Zip Perde', l1: 'Zip perde fiyatı', l2: 'ölçüyle hesaplanır.', cam: [{ t: 0, sy: 1386, z: 1.0 }, { t: 1.6, sy: 1420, z: 1.04 }], ring: { at: .4, rect: [96, 1795, 980, 80] } },
    cizim: { clip: 'm_zip_cizim', idx: 'Ürün görseli', l1: 'Ölçülü ürün görseli', l2: 'otomatik çizilir.', cam: [{ t: 0, sy: 170, z: 1.05 }, { t: 1.6, sy: 230, z: 1.12 }] },
    kasa: { clip: 'm_kasa', idx: 'Kasa', l1: 'Gelir, gider, kasa:', l2: 'hepsi aynı yerde.', cam: [{ t: 0, sy: 0, z: 1.12 }, { t: 1.6, sy: 50, z: 1.18 }], ring: { at: .45, rect: [88, 444, 994, 176] } },
    kalemler: { clip: 'm_kalemler', idx: 'Kalemler', l1: 'Kalemi ekle, adedi gir,', l2: 'fiyat hesaplansın.', cam: [{ t: 0, sy: 1000, z: 1.0 }, { t: 1.6, sy: 1100, z: 1.04 }], ring: { at: .45, rect: [110, 1690, 960, 90] } },
  };

  // CFG üretici: özellik numaraları + halka/kesme ses ipuçları otomatik
  const META = {};
  const mk = (id, meta, o) => {
    const features = o.feats.map((f, i) => {
      const [k, over] = Array.isArray(f) ? f : [f, {}];
      const d = { ...FT[k], ...over };
      return { ...d, from: d.from || 0, idx: `0${i + 1} · ${d.idx}` };
    });
    const A = o.actionEnd, FD = 1.6;
    const cues = [...(o.cues || [])];
    o.shots.forEach(s => { if (s.ring) cues.push({ t: s.a + s.ring.at, type: 'pop' }); });
    features.forEach((f, i) => { if (f.ring) cues.push({ t: A + i * FD + f.ring.at, type: 'pop' }); });
    cues.forEach(c => { c.t = Math.round(c.t * 100) / 100; });
    const cta = o.cta || 'comment';
    const dur = A + features.length * FD + (cta === 'code' ? 3.6 : 3.9) + 1.9;
    META[id] = { ...meta, dur: Math.round(dur * 10) / 10, cta };
    return { actionEnd: A, shots: o.shots, hookHTML: CSS + o.hookHTML, hook: o.hook, features, featDur: FD, cta, cues: cues.sort((a, b) => a.t - b.t) };
  };

  // Sık kullanılan ikinci evre yazısı
  const CAP_OLCU = ln('Ölçüyü gir.', '<span class="brand">Fiyat anında.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">PDF + WhatsApp tek dokunuş.</span>');

  const REELS = {};

  // ===================== GÜN 1 =====================
  // r01 — Sayaç (reel_v1_sayac uyarlaması)
  {
    const STOP = 6.8;
    REELS.r01 = mk('r01', { day: 1, slot: 'A', theme: 'Hız / canlı sayaç', title: 'Bu teklif 8 saniyede hazırlandı', hook: 'Bu teklif 8 saniyede hazırlandı ⏱' }, {
      actionEnd: 8.8,
      shots: [window.zipShot(0, 6.1), window.pdfShot(6.1, 8.8, 0, .62)],
      feats: ['katalog', 'panel', 'ai'],
      cues: [...zipCues(0), ...[1, 2, 3, 4, 5, 6].map(t => ({ t, type: 'tick' })), ...pdfCues(6.1, .62)],
      hookHTML: `
        <div style="position:absolute;left:84px;right:84px;top:120px">
          <div class="chip" id="tmChip" style="font-size:40px;padding:16px 34px 16px 26px">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>
            <span class="timer" id="tm" style="font-size:44px">00:00.0</span>
            <span id="tmDone" style="font-size:34px;font-weight:800;display:none">PDF hazır</span>
          </div>
          <div class="display h-l" id="hk" style="margin-top:30px">${ln('Bu teklif', '<span class="it brand" style="font-size:122px">8 saniyede</span> hazırlandı')}</div>
        </div>`,
      hook(t) {
        L('hk', t, 0, { pre: .97, stagger: .05, dur: .5, outAt: this.actionEnd - .32 });
        const e = Math.min(t, STOP), done = t >= STOP;
        const s = Math.floor(e), d = Math.floor((e - s) * 10 + 1e-6);
        $('tm').textContent = `00:${String(s).padStart(2, '0')}.${d}`;
        $('tmDone').style.display = done ? 'inline' : 'none';
        const chip = $('tmChip'), pop = E.out(prog(t, STOP, STOP + .4));
        chip.style.color = done ? '#06140D' : 'var(--warm)';
        chip.style.background = done ? 'var(--ok)' : 'rgba(245,181,68,.10)';
        chip.style.borderColor = done ? 'var(--ok)' : 'rgba(245,181,68,.45)';
        chip.style.transform = `scale(${done ? 1 + .1 * Math.sin(pop * Math.PI) : 1})`;
        chip.style.transformOrigin = '0 50%';
        chip.style.opacity = 1 - E.in(prog(t, this.actionEnd - .3, this.actionEnd));
      },
    });
  }

  // r02 — Kampanya: Yorumlara TEKLİF yaz
  REELS.r02 = mk('r02', { day: 1, slot: 'B', theme: 'Kampanya / yorum', title: 'Yorumlara TEKLİF yaz, 1 ay Pro senin', hook: 'Yorumlara TEKLİF yaz, 1 ay Pro senin.' }, {
    actionEnd: 5.4,
    shots: [zipAt(0, 5.4)],
    feats: ['katalog', 'pdfModern', 'ai'],
    cues: [{ t: .1, type: 'pop' }, { t: .95, type: 'pop' }, { t: 3.3, type: 'whoosh' }, ...zipCues(0)],
    hookHTML: `
      ${at(118, 'h2e', `<div class="eyebrow">${ICON.gift}Hediye · İlk 1000 üyeye</div>`, 'color:var(--muted)')}
      ${at(180, 'h2a', `<div class="display h-l">${ln('Yorumlara', '<span class="brand" id="h2w">TEKLİF</span> yaz,')}</div>`)}
      ${at(400, 'h2b', `<div class="display h-m">${ln('1 ay <span class="brand">Pro</span> <span class="it" style="font-size:92px">senin.</span>')}</div>`)}
      ${at(140, 'h2c', `<div class="display h-m">${ln('Hediye bu uygulama:', '<span class="brand">Anında Teklif Pro.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Ölçüyü gir, fiyat hazır.</span>')}</div>`)}`,
    hook(t) {
      const out = 3.2;
      Rs('h2e', t, 0, { pre: .95, dy: 16, blur: 4, outAt: out });
      L('h2a', t, 0, { pre: .97, stagger: .05, dur: .5, outAt: out });
      const w = $('h2w'), pw = E.back(prog(t, .1, .55));
      w.style.display = 'inline-block'; w.style.transformOrigin = '0 70%';
      w.style.transform = `translate3d(0,${-14 * Math.sin(clamp(prog(t, .1, .55)) * Math.PI)}px,0)`;
      w.style.textShadow = `0 0 ${40 * pw}px rgba(139,135,255,${.55 * pw})`;
      L('h2b', t, .85, { dur: .6, outAt: out + .06 });
      L('h2c', t, 3.45, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 2 =====================
  // r03 — Rakipten önce (reel_v2_rakip uyarlaması)
  REELS.r03 = mk('r03', { day: 2, slot: 'A', theme: 'Rekabet / hız', title: 'Müşterin teklifi rakibinden önce alsın', hook: 'Müşterin teklifi rakibinden önce alsın.' }, {
    actionEnd: 7.3,
    shots: [zipAt(0, 4.9), window.pdfShot(4.9, 7.3, .15, .47)],
    feats: ['katalog', 'whatsapp', 'ai'],
    cues: [...zipCues(0), { t: 3.55, type: 'whoosh' }, ...pdfCues(4.9, .47)],
    hookHTML: `
      ${at(140, 'hk', `<div class="display h-l">${ln('Müşterin teklifi', 'rakibinden <span class="it brand" style="font-size:118px">önce</span>', 'alsın.')}</div>`)}
      ${at(150, 'cap', `<div class="display h-m">${CAP_OLCU}</div>`)}`,
    hook(t) {
      L('hk', t, 0, { pre: .97, stagger: .05, dur: .5, outAt: 3.3 });
      L('cap', t, 3.62, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r04 — Excel vs Anında Teklif (önce/sonra bölünmüş)
  REELS.r04 = mk('r04', { day: 2, slot: 'B', theme: 'Excel karşılaştırma', title: "Excel'le teklif yazmayı bırak", hook: "Excel'le teklif yazmayı bırak." }, {
    actionEnd: 7.0,
    shots: [zipAt(0, 4.9), window.pdfShot(4.9, 7.0, .15, .47)],
    feats: ['katalog', 'toplam', 'ai'],
    cues: [...zipCues(0), { t: .9, type: 'cut' }, { t: 5.37, type: 'cut' }, ...pdfCues(4.9, .47)],
    hookHTML: `
      ${at(104, 'h4t', `<div class="display h-m">${ln("Excel'le teklif", 'yazmayı <span class="it brand" style="font-size:96px">bırak.</span>')}</div>`)}
      ${at(292, 'h4s', `<div class="cols">
          <div class="col old"><h4 style="color:var(--muted)">Excel</h4>
            ${['Formül kur', 'Kopyala, yapıştır', "PDF'e çevir"].map((x, i) => `<div class="rowx"><span class="mk no">${ICON.x}</span><span class="tx" style="color:#B9B9C6">${x}<i class="strike" id="h4x${i}"></i></span></div>`).join('')}
          </div>
          <div class="col new"><h4 style="color:var(--brand-hi)">Anında Teklif</h4>
            ${['Ölçüyü gir', 'Fiyat hazır', 'PDF hazır'].map((x, i) => `<div class="rowx" id="h4o${i}"><span class="mk ok">${ICON.ok}</span><span class="tx">${x}</span></div>`).join('')}
          </div></div>`)}`,
    hook(t) {
      const out = this.actionEnd - .32;
      L('h4t', t, 0, { pre: .97, stagger: .05, dur: .5, outAt: out });
      Rs('h4s', t, 0, { pre: .96, dy: 30, blur: 6, outAt: out });
      [.9, 4.4, 5.37].forEach((a, i) => {
        strike($('h4x' + i), t, a - .15);
        const el = $('h4o' + i), p = E.back(prog(t, a, a + .45));
        el.style.opacity = .22 + .78 * clamp(prog(t, a, a + .15)); el.style.transform = `translate3d(${(1 - p) * 30}px,0,0)`;
      });
    },
  });

  // ===================== GÜN 3 =====================
  // r05 — Perdeci misin? (reel_v3_perdeci uyarlaması)
  REELS.r05 = mk('r05', { day: 3, slot: 'A', theme: 'Hedef kitle çağrısı', title: 'Perdeci misin? Bunu izlemeden teklif yazma', hook: 'Perdeci misin? Bunu izlemeden teklif yazma.' }, {
    actionEnd: 7.3,
    shots: [zipAt(0, 4.9), window.pdfShot(4.9, 7.3, .15, .47)],
    feats: ['katalog', 'pdfModern', 'panel'],
    cues: [...zipCues(0), { t: 3.55, type: 'whoosh' }, ...pdfCues(4.9, .47)],
    hookHTML: `
      ${at(130, 'h5', `<div class="display h-xl brand" id="hk1">${ln('Perdeci misin?')}</div>
        <div class="display h-m" id="hk2" style="margin-top:22px">${ln('Bunu izlemeden', '<span class="it" style="font-size:92px">teklif yazma.</span>')}</div>`)}
      ${at(150, 'cap', `<div class="display h-m">${CAP_OLCU}</div>`)}`,
    hook(t) {
      L('hk1', t, 0, { pre: .97, dur: .45, outAt: 3.3 });
      const p = E.out(prog(t, 0, .6));
      $('hk1').style.transform = `scale(${1.06 - .06 * p})`; $('hk1').style.transformOrigin = '0 50%';
      L('hk2', t, .5, { stagger: .08, dur: .6, outAt: 3.36 });
      L('cap', t, 3.62, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r06 — Zip perde fiyatı saniyeler içinde (ölçü çipi kayıtla senkron)
  REELS.r06 = mk('r06', { day: 3, slot: 'B', theme: 'Zip perde fiyat hesabı', title: 'Zip perde fiyatı mı soruldu?', hook: 'Zip perde fiyatı mı soruldu?' }, {
    actionEnd: 6.4,
    shots: [zipAt(0, 6.4)],
    feats: ['cizim', 'whatsapp', ['katalog', { l1: 'Zip perdeyi bir kez kur,', l2: 'her teklifte kullan.', cam: [{ t: 0, sy: 820, z: 1.0 }, { t: 1.6, sy: 900, z: 1.03 }], ring: { at: .4, rect: [40, 1202, 1092, 222] } }]],
    cues: [...zipCues(0), { t: 3.05, type: 'whoosh' }, { t: 4.45, type: 'ding' }],
    hookHTML: `
      ${at(116, 'h6e', `<div class="eyebrow"><i></i>Zip Perde</div>`)}
      ${at(172, 'h6a', `<div class="display h-xl">${ln('Fiyat mı', '<span class="brand">soruldu?</span>')}</div>`)}
      ${at(172, 'h6b', `<div class="display h-m">${ln('Kâr ve montaj dahil', '<span class="brand">satış fiyatı hazır.</span>')}</div>`)}
      ${at(446, 'h6c', `<div class="chip" id="h6chip" style="font-size:34px;padding:14px 30px">
          <span style="color:var(--muted);font-weight:700">EN</span><span class="timer" id="h6en" style="font-size:42px;min-width:84px">350</span>
          <span style="color:var(--muted)">×</span>
          <span style="color:var(--muted);font-weight:700">BOY</span><span class="timer" id="h6boy" style="font-size:42px;min-width:84px">260</span>
          <span id="h6ok" class="pill" style="background:var(--ok);color:#06140D;padding:8px 22px 8px 16px;font-size:30px;margin-left:6px">${ICON.okDark}Satış fiyatı</span>
        </div>`)}`,
    hook(t) {
      const out = this.actionEnd - .32;
      Rs('h6e', t, 0, { pre: .95, dy: 16, blur: 4, outAt: 2.95 });
      L('h6a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.95 });
      L('h6b', t, 3.2, { stagger: .07, dur: .6, outAt: out });
      Rs('h6c', t, .35, { dy: 24, blur: 6, outAt: out });
      typeIn($('h6en'), '350', t, .85, 1.2);
      typeIn($('h6boy'), '260', t, 1.7, 1.98);
      const ok = $('h6ok'), p = E.back(prog(t, 4.4, 4.85));
      ok.style.display = t >= 4.4 ? 'inline-flex' : 'none';
      ok.style.transform = `scale(${.6 + .4 * p})`; ok.style.opacity = clamp(prog(t, 4.4, 4.55));
    },
  });

  // ===================== GÜN 4 =====================
  // r07 — Akşam ofiste teklif yazmaya son
  REELS.r07 = mk('r07', { day: 4, slot: 'A', theme: 'Mesai / zaman kazancı', title: 'Akşam ofiste teklif yazmaya son', hook: 'Akşam ofiste teklif yazmaya son.' }, {
    actionEnd: 5.6,
    shots: [window.pdfShot(0, 3.0, 0, .62), still(3.0, 5.6, 'm_toplam', [{ t: 0, sy: 1100, z: 1.0 }, { t: 1.2, sy: 1386, z: 1.0 }, { t: 2.6, sy: 1386, z: 1.03 }], { ring: { at: 1.2, rect: [600, 2060, 526, 140] } })],
    feats: ['zipFiyat', 'katalog', 'ai'],
    cues: [...pdfCues(0, .62), { t: 3.0, type: 'whoosh' }],
    hookHTML: `
      ${at(100, 'h7e', `<div class="chip" style="font-size:32px;padding:12px 28px 12px 20px;color:var(--warm);border-color:rgba(245,181,68,.4);background:rgba(245,181,68,.08)">${ICON.moon}Mesai bitti, teklif bitmedi mi?</div>`)}
      ${at(184, 'h7a', `<div class="display h-l" style="font-size:96px">${ln('Akşam ofiste', 'teklif yazmaya', '<span class="it brand" style="font-size:116px">son.</span>')}</div>`)}
      ${at(150, 'h7b', `<div class="display h-m">${ln('Teklifi müşterinin', '<span class="brand">yanında bitir.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">PDF + WhatsApp, oradan.</span>')}</div>`)}`,
    hook(t) {
      Rs('h7e', t, 0, { pre: .95, dy: 20, blur: 5, outAt: 2.8 });
      L('h7a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.8 });
      L('h7b', t, 3.1, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r08 — POV: sahada ölçü al, teklifi orada ver
  REELS.r08 = mk('r08', { day: 4, slot: 'B', theme: 'Sahada teklif', title: 'Sahada ölçü al, teklifi orada ver', hook: 'POV: Müşterinin kapısındasın. Ölçüyü al, teklifi orada ver.' }, {
    actionEnd: 7.2,
    shots: [zipAt(0, 5.0, .3), window.pdfShot(5.0, 7.2, .15, .47)],
    feats: ['cizim', 'whatsapp', 'panelGenel'],
    cues: [...zipCues(0, .3), { t: 3.35, type: 'whoosh' }, ...pdfCues(5.0, .47)],
    hookHTML: `
      ${at(116, 'h8e', `<div class="chip" style="font-size:32px;padding:12px 28px 12px 14px"><span class="pill" style="background:var(--ink);color:#0B0B12;padding:6px 18px;font-size:28px;letter-spacing:.08em">POV</span>Müşterinin kapısındasın.</div>`)}
      ${at(222, 'h8a', `<div class="display h-l">${ln('Ölçüyü al,', 'teklifi <span class="it brand" style="font-size:122px">orada</span> ver.')}</div>`)}
      ${at(150, 'h8b', `<div class="display h-m">${ln('EN, BOY gir.', '<span class="brand">Fiyat orada.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Müşteri PDF\'i kapıda alsın.</span>')}</div>`)}`,
    hook(t) {
      Rs('h8e', t, 0, { pre: .95, dy: 20, blur: 5, outAt: 3.2 });
      L('h8a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 3.2 });
      L('h8b', t, 3.45, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 5 =====================
  // r09 — Pergolacılar için
  REELS.r09 = mk('r09', { day: 5, slot: 'A', theme: 'Pergola firmaları', title: 'Pergolacılar, bu sizin için', hook: 'Pergolacılar için: Bioklimatik pergola teklifi, tek ekranda.' }, {
    actionEnd: 6.6,
    shots: [
      still(0, 2.4, 'm_kalemler', [{ t: 0, sy: 560, z: 1.0 }, { t: 2.4, sy: 640, z: 1.05 }], { ring: { at: .5, rect: [60, 742, 1062, 186] } }),
      still(2.4, 4.4, 'm_katalogdan_ekle', [{ t: 0, sy: 780, z: 1.0 }, { t: 2.0, sy: 820, z: 1.05 }], { ring: { at: .4, rect: [36, 1030, 1088, 138] } }),
      still(4.4, 6.6, 'm_pdf_modern', [{ t: 0, sy: 340, z: 1.0 }, { t: 2.2, sy: 520, z: 1.04 }], { redact: RED_MODERN, ring: { at: .9, rect: [100, 988, 972, 60] } }),
    ],
    feats: [['ai', { l1: 'Pergola kalemini', l2: 'AI hazırlasın.' }], 'katalog', 'panel'],
    cues: [{ t: 2.6, type: 'whoosh' }],
    hookHTML: `
      ${at(116, 'h9e', `<div class="eyebrow"><i></i>Pergolacılar için</div>`)}
      ${at(176, 'h9a', `<div class="display h-l" style="font-size:96px">${ln('Bioklimatik', 'pergola teklifi,', '<span class="it brand" style="font-size:112px">tek ekranda.</span>')}</div>`)}
      ${at(150, 'h9b', `<div class="display h-m">${ln('Kalemi seç,', 'fiyat <span class="brand">hazır.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Modern PDF şablonuyla gönder.</span>')}</div>`)}`,
    hook(t) {
      Rs('h9e', t, 0, { pre: .95, dy: 16, blur: 4, outAt: 2.4 });
      L('h9a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.4 });
      L('h9b', t, 2.65, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r10 — Cam balkoncu musun?
  REELS.r10 = mk('r10', { day: 5, slot: 'B', theme: 'Cam balkon firmaları', title: 'Cam balkoncu musun?', hook: 'Cam balkoncu musun?' }, {
    actionEnd: 6.4,
    shots: [
      still(0, 2.4, 'm_katalogdan_ekle', [{ t: 0, sy: 1020, z: 1.05 }, { t: 2.4, sy: 1100, z: 1.1 }], { ring: { at: .5, rect: [36, 1396, 1088, 138] } }),
      still(2.4, 4.6, 'm_kalemler', [{ t: 0, sy: 1000, z: 1.0 }, { t: 2.2, sy: 1140, z: 1.05 }], { ring: { at: .6, rect: [110, 1690, 960, 90] } }),
      still(4.6, 6.4, 'm_toplam', [{ t: 0, sy: 1000, z: 1.0 }, { t: 1.8, sy: 1060, z: 1.04 }], { ring: { at: .4, rect: [72, 1502, 1028, 140] } }),
    ],
    feats: ['katalogCam', 'pdfModern', 'whatsapp'],
    cues: [{ t: 2.5, type: 'whoosh' }],
    hookHTML: `
      ${at(130, 'h10a', `<div class="display h-xl">${ln('Cam balkoncu', '<span class="brand">musun?</span>')}</div>`)}
      ${at(420, 'h10s', `<div style="font-size:40px;font-weight:700;color:var(--muted);letter-spacing:-.01em">Giyotin · Sürme · Isıcamlı</div>`)}
      ${at(150, 'h10b', `<div class="display h-m">${ln('Metrekareyi gir,', '<span class="brand">fiyat hazır.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">KDV dahil toplam kendiliğinden.</span>')}</div>`)}`,
    hook(t) {
      L('h10a', t, 0, { pre: .97, stagger: .08, dur: .55, outAt: 2.3 });
      const p = E.out(prog(t, 0, .7));
      $('h10a').style.transform = `scale(${1.05 - .05 * p})`; $('h10a').style.transformOrigin = '0 0';
      Rs('h10s', t, .45, { dy: 20, blur: 5, outAt: 2.3 });
      L('h10b', t, 2.55, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 6 =====================
  // r11 — PDF şablonları (Klasik / Modern)
  REELS.r11 = mk('r11', { day: 6, slot: 'A', theme: 'PDF teklif şablonları', title: "Teklifin hâlâ Word'den mi çıkıyor?", hook: "Teklifin hâlâ Word'den mi çıkıyor?" }, {
    actionEnd: 6.0,
    shots: [
      still(0, 3.0, 'm_pdf_klasik', [{ t: 0, sy: 140, z: 1.0 }, { t: .9, sy: 140, z: 1.0 }, { t: 3.0, sy: 380, z: 1.03 }], { redact: RED_KLASIK, ring: { at: .35, rect: [36, 178, 252, 106] } }),
      still(3.0, 6.0, 'm_pdf_modern', [{ t: 0, sy: 140, z: 1.0 }, { t: .9, sy: 140, z: 1.0 }, { t: 3.0, sy: 560, z: 1.04 }], { redact: RED_MODERN, ring: { at: .2, rect: [313, 178, 250, 106] } }),
    ],
    feats: ['toplam', 'whatsapp', 'katalog'],
    cues: [{ t: 3.0, type: 'whoosh' }],
    hookHTML: `
      ${at(130, 'h11a', `<div class="display h-l">${ln('Teklifin hâlâ', "Word'den mi", '<span class="it brand" style="font-size:124px">çıkıyor?</span>')}</div>`)}
      ${at(140, 'h11b', `<div class="tabs" id="h11tabs"><div class="tab" id="h11k">Klasik</div><div class="tab" id="h11m">Modern</div><div class="tab">Minimal</div></div>
        <div class="display h-m" style="margin-top:36px">${ln('Şablonu seç,', '<span class="brand">PDF hazır.</span>')}</div>`)}`,
    hook(t) {
      L('h11a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.75 });
      Rs('h11tabs', t, 3.0, { dy: 24, blur: 6, outAt: this.actionEnd - .32 });
      L('h11b', t, 3.15, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
      const m = t >= 3.25;
      [['h11k', !m], ['h11m', m]].forEach(([id, on]) => {
        const el = $(id);
        el.style.background = on ? 'var(--brand)' : 'transparent';
        el.style.borderColor = on ? 'var(--brand)' : 'rgba(255,255,255,.16)';
        el.style.color = on ? '#fff' : 'var(--muted)';
      });
    },
  });

  // r12 — WhatsApp'tan PDF teklif
  REELS.r12 = mk('r12', { day: 6, slot: 'B', theme: "WhatsApp'tan PDF", title: "Teklifi WhatsApp'tan PDF olarak gönder", hook: "Teklifi WhatsApp'tan PDF gönder." }, {
    actionEnd: 6.4,
    shots: [
      { a: 0, b: 4.8, clip: 'pdf', from: 0, redact: PDF_RED,
        cam: [{ t: 0, sy: 1080, z: 1.0 }, { t: .54, sy: 1080, z: 1.0 }, { t: .62, sy: 330, z: 1.0 }, { t: 2.4, sy: 460, z: 1.02 }, { t: 3.2, sy: 2050, z: 2.4, sx: 843 }, { t: 4.8, sy: 2070, z: 2.5, sx: 843 }],
        ring: { at: 3.4, rect: [702, 2378, 284, 132] } },
      still(4.8, 6.4, 'm_toplam', [{ t: 0, sy: 1300, z: 1.0 }, { t: 1.6, sy: 1386, z: 1.02 }], { ring: { at: .35, rect: [600, 2060, 526, 140] } }),
    ],
    feats: ['pdfModern', 'katalog', 'zipFiyat'],
    cues: [...pdfCues(0, .62), { t: 2.45, type: 'whoosh' }],
    hookHTML: `
      ${at(100, 'h12e', `<div class="chip" style="font-size:32px;padding:12px 28px 12px 20px;color:#25D366;border-color:rgba(37,211,102,.45);background:rgba(37,211,102,.10)">${ICON.chat}<span style="color:var(--ink)">WhatsApp ile teklif</span></div>`)}
      ${at(184, 'h12a', `<div class="display h-l" style="font-size:96px">${ln('Teklifi', "WhatsApp'tan", '<span class="it brand" style="font-size:116px">PDF</span> gönder.')}</div>`)}
      ${at(150, 'h12b', `<div class="display h-m">${ln('Önizle, kontrol et,', '<span class="brand">tek dokunuşla gönder.</span>')}</div>`)}`,
    hook(t) {
      Rs('h12e', t, 0, { pre: .95, dy: 20, blur: 5, outAt: 2.2 });
      L('h12a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.2 });
      L('h12b', t, 2.45, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 7 =====================
  // r13 — AI asistan teklif metni
  REELS.r13 = mk('r13', { day: 7, slot: 'A', theme: 'AI asistan', title: 'Teklif metnini sen yazma, AI yazsın', hook: 'Teklif metnini sen yazma. AI yazsın.' }, {
    actionEnd: 6.0,
    shots: [{ a: 0, b: 6.0, clip: 'ai', from: 0,
      cam: [{ t: 0, sy: 1386, z: 1.0 }, { t: 2.9, sy: 1386, z: 1.0 }, { t: 3.4, sy: 380, z: 1.0 }, { t: 6.0, sy: 680, z: 1.0 }],
      ring: { at: 4.6, rect: [86, 1595, 792, 108] } }],
    feats: ['katalog', 'kalemler', 'pdfModern'],
    cues: [{ t: .73, type: 'type', dur: 2.1 }, { t: 3.05, type: 'tick' }, { t: 3.3, type: 'whoosh' }],
    hookHTML: `
      ${at(130, 'h13a', `<div class="display h-l">${ln('Teklif metnini', 'sen yazma.', '<span class="it brand" style="font-size:124px">AI yazsın.</span>')}</div>`)}
      ${at(150, 'h13b', `<div class="display h-m">${ln('Sor; kalemi ve', 'fiyat notunu', '<span class="brand">o hazırlasın.</span>')}</div>`)}`,
    hook(t) {
      L('h13a', t, 0, { pre: .97, stagger: .07, dur: .5, outAt: 3.1 });
      L('h13b', t, 3.4, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r14 — Katalog: aynı ürünü baştan yazma
  REELS.r14 = mk('r14', { day: 7, slot: 'B', theme: 'Ürün kataloğu', title: 'Aynı ürünü her teklifte baştan yazma', hook: 'Aynı ürünü her teklifte baştan yazma.' }, {
    actionEnd: 6.6, cta: 'code',
    shots: [
      still(0, 2.4, 'katalog', [{ t: 0, sy: 120, z: 1.0 }, { t: 2.4, sy: 260, z: 1.04 }], { ring: { at: .5, rect: [36, 398, 538, 178] } }),
      still(2.4, 4.6, 'm_katalogdan_ekle', [{ t: 0, sy: 780, z: 1.0 }, { t: 2.2, sy: 860, z: 1.04 }], { ring: { at: .5, rect: [36, 1212, 1088, 138] } }),
      still(4.6, 6.6, 'm_kalemler', [{ t: 0, sy: 300, z: 1.0 }, { t: 2.0, sy: 420, z: 1.04 }], { ring: { at: .5, rect: [60, 742, 1062, 366] } }),
    ],
    feats: ['zipFiyat', 'ai', 'toplam'],
    cues: [{ t: 2.5, type: 'whoosh' }],
    hookHTML: `
      ${at(130, 'h14a', `<div class="display h-l">${ln('Aynı ürünü', 'her teklifte', '<span class="it brand" style="font-size:124px">baştan yazma.</span>')}</div>`)}
      ${at(150, 'h14b', `<div class="display h-m">${ln('Bir kez tanımla,', '<span class="brand">sonra sadece seç.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Katalogdan ekle, fiyat gelsin.</span>')}</div>`)}`,
    hook(t) {
      L('h14a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.3 });
      // "baştan yazma." satırında küçük vurgu: hafif sağa kayıp oturma
      L('h14b', t, 2.55, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 8 =====================
  // r15 — Panel / teklif durumları
  REELS.r15 = mk('r15', { day: 8, slot: 'A', theme: 'Panel / takip', title: 'Hangi teklif bekliyor, hangisi onaylandı?', hook: 'Hangi teklif bekliyor, hangisi onaylandı?' }, {
    actionEnd: 5.0,
    shots: [
      { a: 0, b: 2.4, clip: 'panel', from: 2.1, cam: [{ t: 0, sy: 0, z: 1.0 }, { t: 2.4, sy: 40, z: 1.03 }] },
      still(2.4, 5.0, 'm_panel_genel', [{ t: 0, sy: 480, z: 1.0 }, { t: 2.6, sy: 620, z: 1.04 }], { ring: { at: .5, rect: [52, 1130, 1060, 540] } }),
    ],
    feats: ['kasa', 'katalog', 'ai'],
    cues: [{ t: 2.65, type: 'whoosh' }],
    hookHTML: `
      ${at(130, 'h15a', `<div class="display h-l" style="font-size:92px">${ln('Hangi teklif', 'bekliyor, hangisi', '<span class="it brand" style="font-size:112px">onaylandı?</span>')}</div>`)}
      ${at(150, 'h15b', `<div class="display h-m">${ln('Teklif, müşteri, kasa:', '<span class="brand">tek panelde.</span>')}</div>`)}`,
    hook(t) {
      L('h15a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 2.45 });
      L('h15b', t, 2.7, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r16 — Kasa: Gelir. Gider. Kasa.
  REELS.r16 = mk('r16', { day: 8, slot: 'B', theme: 'Kasa / gelir-gider', title: 'Gelir. Gider. Kasa. Teklifle aynı uygulamada', hook: 'Gelir. Gider. Kasa.' }, {
    actionEnd: 5.0,
    shots: [
      still(0, 2.6, 'm_kasa', [{ t: 0, sy: 0, z: 1.12 }, { t: 2.6, sy: 70, z: 1.2 }], { ring: { at: .9, rect: [88, 444, 994, 176] } }),
      still(2.6, 5.0, 'm_panel_genel', [{ t: 0, sy: 320, z: 1.0 }, { t: 2.4, sy: 420, z: 1.05 }], { ring: { at: .5, rect: [52, 540, 1068, 510] } }),
    ],
    feats: ['zipFiyat', 'toplam', 'whatsapp'],
    cues: [{ t: 0, type: 'tick' }, { t: .3, type: 'tick' }, { t: .6, type: 'tick' }, { t: 2.75, type: 'whoosh' }],
    hookHTML: `
      ${at(120, 'h16a', `<div class="display h-l">${ln('Gelir.', 'Gider.', '<span class="brand">Kasa.</span>')}</div>`)}
      ${at(446, 'h16s', `<div style="font-size:42px;font-weight:700;color:var(--muted);letter-spacing:-.01em">Teklifle aynı uygulamada.</div>`)}
      ${at(150, 'h16b', `<div class="display h-m">${ln('Nakit durumu', '<span class="brand">bir bakışta.</span>')}</div>`)}`,
    hook(t) {
      L('h16a', t, 0, { pre: .97, stagger: .05, dur: .5, outAt: 2.45 });
      R.$$($('h16a'), '.ln > span').forEach((s, i) => {
        const p = i === 0 ? 1 : E.out(prog(t, i * .3, i * .3 + .35));
        s.style.opacity = .4 + .6 * p;
        s.style.transform += ` translate3d(${(1 - p) * -14}px,0,0)`;
      });
      Rs('h16s', t, .9, { dy: 20, blur: 5, outAt: 2.45 });
      L('h16b', t, 2.8, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 9 =====================
  // r17 — Hediye nasıl alınır? 4 adım
  REELS.r17 = mk('r17', { day: 9, slot: 'A', theme: 'Kampanya nasıl çalışır', title: 'Hediye nasıl alınır? 4 adım', hook: 'Hediye nasıl alınır? (4 adım)' }, {
    actionEnd: 7.0, cta: 'code',
    shots: [zipAt(0, 5.0, .3), window.pdfShot(5.0, 7.0, .15, .47)],
    feats: ['katalog', 'ai'],
    cues: [...zipCues(0, .3), { t: 2.0, type: 'tick' }, { t: 3.2, type: 'tick' }, { t: 4.4, type: 'tick' }, { t: 5.6, type: 'ding' }, ...pdfCues(5.0, .47)],
    hookHTML: `
      ${at(96, 'h17e', `<div class="display h-m" style="font-size:70px">${ln('Hediye nasıl <span class="it brand" style="font-size:84px">alınır?</span>')}</div>`)}
      ${at(206, 'h17s', ['Yorumlara <span class="brand">TEKLİF</span> yaz', 'Otomatik cevap gelsin', 'Linkten üye ol', 'Kod otomatik tanımlansın'].map((x, i) => `<div class="step" id="h17r${i}"><span class="n" id="h17n${i}">${i + 1}</span><span>${x}</span></div>`).join(''))}`,
    hook(t) {
      const out = this.actionEnd - .32;
      L('h17e', t, 0, { pre: .97, dur: .5, outAt: out });
      const done = [2.0, 3.2, 4.4, 5.6];
      [0, .15, .3, .45].forEach((a, i) => {
        const el = $('h17r' + i);
        const p = i === 0 ? clamp(.96 + E.out(prog(t, 0, .4)) * .04) : E.out(prog(t, a, a + .55));
        const q = E.in(prog(t, out + i * .04, out + i * .04 + .28));
        el.style.opacity = p * (1 - q);
        el.style.transform = `translate3d(${(1 - p) * 40}px,${-q * 30}px,0)`;
        el.style.filter = p < 1 ? `blur(${(1 - p) * 8}px)` : 'none';
        const n = $('h17n' + i), d = t >= done[i], pp = E.back(prog(t, done[i], done[i] + .4));
        n.innerHTML = d ? ICON.okDark : String(i + 1);
        n.style.background = d ? 'var(--ok)' : 'rgba(255,255,255,.08)';
        n.style.borderColor = d ? 'var(--ok)' : 'rgba(255,255,255,.16)';
        n.style.transform = `scale(${d ? .75 + .25 * pp : 1})`;
      });
    },
  });

  // r18 — Hesap makinesiyle teklif çıkarma
  REELS.r18 = mk('r18', { day: 9, slot: 'B', theme: 'Hesap hatası / otomatik hesap', title: 'Hesap makinesiyle teklif çıkarma', hook: 'Hesap makinesiyle teklif çıkarma.' }, {
    actionEnd: 6.2,
    shots: [zipAt(0, 6.2)],
    feats: [['zipFiyat', { l1: 'Kâr ve montaj', l2: 'fiyata dahil.' }], 'whatsapp', 'panelGenel'],
    cues: [{ t: .45, type: 'whoosh' }, ...zipCues(0), { t: 3.2, type: 'whoosh' }],
    hookHTML: `
      ${at(140, 'h18a', `<div class="display h-l" style="font-size:94px">${ln('<span class="rel muted">Hesap makinesiyle<i class="strike" id="h18x"></i></span>', 'teklif <span class="it brand" style="font-size:114px">çıkarma.</span>')}</div>`)}
      ${at(150, 'h18b', `<div class="display h-m">${ln('Kâr, montaj, opsiyon:', '<span class="brand">hepsi hesapta.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Sen sadece ölçüyü gir.</span>')}</div>`)}`,
    hook(t) {
      L('h18a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 3.0 });
      strike($('h18x'), t, .45, .5);
      L('h18b', t, 3.25, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // ===================== GÜN 10 =====================
  // r19 — POV: müşteri fiyat sordu
  REELS.r19 = mk('r19', { day: 10, slot: 'A', theme: 'Müşteri sorusu / hızlı cevap', title: 'Müşteri fiyat sordu. Cevabın: PDF teklif', hook: 'Müşteri: "350\'ye 260 zip perde kaça olur?" Cevabın: PDF teklif.' }, {
    actionEnd: 7.2,
    shots: [zipAt(0, 5.0, .3), window.pdfShot(5.0, 7.2, .15, .47)],
    feats: ['katalog', 'whatsapp', 'ai'],
    cues: [{ t: 0, type: 'pop' }, { t: .7, type: 'whoosh' }, ...zipCues(0, .3), { t: 3.35, type: 'whoosh' }, ...pdfCues(5.0, .47)],
    hookHTML: `
      ${at(112, 'h19c', `<div class="cbub"><div class="who"><span class="pill" style="background:var(--ink);color:#0B0B12;padding:4px 14px;font-size:22px;letter-spacing:.08em">POV</span>Müşteri yazdı</div><div class="txt">350'ye 260 zip perde<br>kaça olur?</div></div>`)}
      ${at(384, 'h19a', `<div class="display h-m">${ln('Cevabın: <span class="brand">PDF teklif.</span>')}</div>`)}
      ${at(150, 'h19b', `<div class="display h-m">${ln('Ölçüyü gir,', '<span class="brand">satış fiyatı hazır.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">PDF\'i hemen gönder.</span>')}</div>`)}`,
    hook(t) {
      const c = $('h19c'), p = clamp(.96 + E.back(prog(t, 0, .5)) * .04), q = E.in(prog(t, 3.1, 3.4));
      c.style.opacity = (1 - q); c.style.transform = `translate3d(0,${-q * 40}px,0) scale(${p})`; c.style.transformOrigin = '0 100%';
      c.style.filter = q > 0 ? `blur(${q * 10}px)` : 'none';
      L('h19a', t, .7, { dur: .6, outAt: 3.1 });
      L('h19b', t, 3.45, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  // r20 — Son çağrı: 1 ay Pro hediye
  REELS.r20 = mk('r20', { day: 10, slot: 'B', theme: 'Kampanya / son çağrı', title: '1 ay Pro hediye, yorumlara TEKLİF yaz', hook: "Instagram'a özel: 1 ay Pro hediye." }, {
    actionEnd: 6.8,
    shots: [zipAt(0, 5.0, .3), window.pdfShot(5.0, 6.8, .15, .47)],
    feats: ['katalog', 'panel'],
    cues: [{ t: .5, type: 'pop' }, ...zipCues(0, .3), { t: 3.35, type: 'whoosh' }, ...pdfCues(5.0, .47)],
    hookHTML: `
      ${at(110, 'h20e', `<div class="eyebrow"><i></i>Instagram'a özel</div>`)}
      ${at(168, 'h20a', `<div class="display h-xl">${ln('1 ay <span class="brand">Pro</span>', '<span class="it" style="font-size:150px">hediye.</span>')}</div>`)}
      ${at(448, 'h20n', `<div class="pill" style="background:rgba(245,181,68,.12);border:1.5px solid rgba(245,181,68,.45);color:var(--warm)">${ICON.gift}İlk 1000 üyeye</div>`)}
      ${at(150, 'h20b', `<div class="display h-m">${ln('Ölçü gir, fiyat hazır.', '<span class="brand">Teklif PDF\'te.</span>', '<span class="muted" style="font-size:52px;letter-spacing:-.02em">Yorumlara TEKLİF yaz.</span>')}</div>`)}`,
    hook(t) {
      Rs('h20e', t, 0, { pre: .95, dy: 16, blur: 4, outAt: 3.15 });
      L('h20a', t, 0, { pre: .97, stagger: .06, dur: .5, outAt: 3.15 });
      const p = E.back(prog(t, .45, .95)), n = $('h20n');
      n.style.opacity = clamp(prog(t, .45, .6)) * (1 - E.in(prog(t, 3.15, 3.4)));
      n.style.transform = `rotate(${(1 - p) * -4}deg) scale(${.85 + .15 * p})`; n.style.transformOrigin = '0 50%';
      L('h20b', t, 3.45, { stagger: .07, dur: .6, outAt: this.actionEnd - .32 });
    },
  });

  window.REELS = REELS;
  window.REEL_META = META;
})();

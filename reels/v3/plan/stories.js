// Anında Teklif — Stories v3 planları. v3/story.html?id=p1s → window.V3_STORIES.p1s
// Hikâyelerde yazı güvenli alanı y ∈ [250,1600]. API: v3/README.md
window.V3_STORIES = {
  // P1S — 8 sn: ölçü → fiyat (Satış fiyatı 3B pop-out) → kod bileti → logo
  p1s: {
    music: 'sunny_pop', world: 'paper', finish: 'titanium',
    scenes: [
      { type: 'phone', beats: 8, screen: { clip: 'zip', from: 0.6 },
        cam: [{ t: 0, yaw: -20, pitch: 6, dist: 5.3, y: 340 }, { t: 2.4, yaw: -10, pitch: 3, dist: 5.0, y: 320, e: 'sine' }, { t: 2.8, yaw: -4, pitch: 2, dist: 4.6, y: 290, e: 'out' }, { t: 'end', yaw: 0, pitch: 1, dist: 4.5, y: 290, e: 'sine' }],
        phone: [{ t: 0, ry: 14 }, { t: 'end', ry: 4, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Zip perde · canlı', x: 84, y: 268, at: 0, pre: .5 },
          { kind: 'rise', text: 'Ölçüyü gir,\n*fiyat anında.*', x: 84, y: 330, size: 104, at: 0, pre: .7, stagger: .05 },
        ],
        highlight: [{ at: 2.55, rect: [86, 1856, 1012, 82], style: 'spot' }],
        pop: [{ at: 2.75, rect: [86, 1856, 1012, 82], style: 'price', label: 'Satış fiyatı', value: 746.53, prefix: '€ ', h: 190,
          to: { y: 1330, w: 920, rx: 8, ry: -10 }, counter: { delay: .25, dur: .8 } }],
        out: 'whipUp' },
      { type: 'cta', mode: 'code', beats: 5, world: 'indigo', size: 136, out: 'flash' },
      { type: 'outro', beats: 3, world: 'midnight' },
    ],
  },
};

// ============================================================================ 30 günlük seri
// s01..s30: gün d → s(3d-2) sabah sorusu · s(3d-1) öğle özellik (3B telefon) · s(3d) akşam hediye CTA.
// `sec` → müziğin vuruşuna yuvarlanmış `beats` (mk). Müzik: plan/music_map.json.
(function () {
  const BPM = { sunny_pop: 120, tropical: 110, disco: 116, ukulele: 112, afro_house: 122, future_bass: 128, lofi_happy: 110, stomp_folk: 124 };
  const MOB = '../footage/mobile/';
  // Kişisel veri örtüleri: PDF önizleme müşteri bloğu + imza satırı
  const M07 = { still: MOB + 'm_07_pdf_onizleme.png', redact: [[70, 650, 540, 200], [690, 1236, 430, 64]] };
  const M07B = { still: MOB + 'm_07b_pdf_onizleme_modern.png', redact: [[80, 660, 520, 260], [100, 1245, 380, 80]] };
  const M12 = { still: MOB + 'm_12_kasa.png' };
  const mk = (music, p) => ({ music, ...p, scenes: p.scenes.map(s => {
    if (s.chips) s = { ...s, chips: s.chips.map(c => ({ light: true, ...c })) };   // açık cam: beyaz ekran üstünde okunur
    if (s.sec == null) return s; const { sec, ...r } = s; return { ...r, beats: Math.max(2, Math.round(sec * BPM[music] / 60)) }; }) });
  const OUT = (world, sec = 1.7, x = {}) => ({ type: 'outro', sec, world, ...x });
  const S = window.V3_STORIES;
  const META = window.V3_STORY_META = {};
  const add = (id, day, slot, theme, title, plan) => { S[id] = plan; META[id] = { day, slot, theme, title, music: plan.music }; };

  // ------------------------------------------------------------------ GÜN 1 · Hız
  add('s01', 1, 1, 'Hız', 'Bir teklifi kaç dakikada hazırlıyorsun?', mk('sunny_pop', { world: 'amber', scenes: [
    { type: 'type', sec: 5.6, text: [
      { kind: 'stamp', layer: 'back', style: 'giant outline deco', text: '?', x: 640, y: 700, size: 980, at: 0, pre: .85, from: 1.5, rot: 12 },
      { kind: 'fade', style: 'label', text: 'Sabah sorusu · Hız', x: 84, y: 300, at: 0, pre: .6 },
      { kind: 'rise', text: 'Bir teklifi\nkaç dakikada\n*hazırlıyorsun?*', x: 84, y: 362, size: 112, at: 0, pre: .75, stagger: .05 },
      { kind: 'snap', box: true, text: 'A  ·  5 dakikadan az', x: 84, y: 860, size: 54, at: .55 },
      { kind: 'snap', box: true, text: 'B  ·  Yarım saat ve üstü', x: 84, y: 1010, size: 54, at: .75 },
      { kind: 'snap', box: true, text: 'C  ·  Akşam ~ofiste~ bitiyor', x: 84, y: 1160, size: 54, at: .95, ulAt: 2.3 },
      { kind: 'stamp', text: '[Tanıdık mı?]', x: 600, y: 1330, size: 70, at: 2.6, rot: -6 },
      { kind: 'fade', style: 'body', text: 'Cevabımız öğlen hikâyede.', x: 84, y: 1480, size: 38, at: 3.2 },
    ], burst: [{ at: 2.6, x: 820, y: 1380, n: 70, power: .8, seed: 4 }], out: 'whipUp' },
    OUT('midnight', 1.9),
  ] }));

  add('s02', 1, 2, 'Hız', 'Ölçüyü gir, fiyat hazır', mk('tropical', { world: 'forest', finish: 'silver', scenes: [
    { type: 'phone', sec: 6.2, screen: { clip: 'zip', from: 0.2 },
      cam: [{ t: 0, yaw: 26, pitch: -12, dist: 5.6, y: 300, roll: -4 }, { t: 2.9, yaw: 12, pitch: -6, dist: 5.0, y: 290, roll: -2, e: 'sine' }, { t: 3.3, yaw: 4, pitch: -2, dist: 4.6, y: 270, roll: 0, e: 'out' }, { t: 'end', yaw: 0, pitch: 0, dist: 4.5, y: 270, e: 'sine' }],
      phone: [{ t: 0, ry: -22, rx: 4 }, { t: 'end', ry: -6, rx: 0, e: 'sine' }],
      text: [
        { kind: 'track', style: 'label', text: 'Zip perde · gerçek kayıt', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'EN × BOY gir,\n*fiyat hazır.*', x: 84, y: 340, size: 112, at: 0, pre: .8, stagger: .05 },
      ],
      chips: [{ at: .9, out: 2.9, text: '350 × 260 cm', sub: 'ölçü', icon: 'ruler', color: '#0F9F6E', anchor: [880, 640], off: [.1, .06], dz: .22 }],
      highlight: [{ at: 3.0, rect: [86, 1856, 1012, 82], style: 'spot' }],
      pop: [{ at: 3.2, rect: [86, 1856, 1012, 82], style: 'price', label: 'Satış fiyatı', value: 746.53, prefix: '€ ', h: 190,
        to: { y: 1390, w: 920, rx: 6, ry: 12 }, counter: { delay: .25, dur: .8 } }],
      out: 'iris' },
    OUT('forest', 1.8),
  ] }));

  add('s03', 1, 3, 'Hız', 'Profildeki linkten 1 ay Pro hediye', mk('ukulele', { world: 'dusk', scenes: [
    { type: 'type', sec: 2.2, text: [
      { kind: 'fade', style: 'label', text: 'Bugünün hediyesi', y: 520, align: 'center', at: 0, pre: .6 },
      { kind: 'stamp', text: '*Hızlı* teklife\n[1 ay Pro.]', y: 610, size: 124, align: 'center', at: 0, pre: .7, from: 1.8, rot: 0 },
    ], burst: [{ at: .25, x: 540, y: 820, n: 110, power: 1.1, seed: 7 }], out: 'flash' },
    { type: 'cta', mode: 'code', sec: 3.6, world: 'indigo', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: '1 ay [Pro]\n*hediye.*', url: 'Profildeki link', note: 'Kod: TEKLIF30 · üye olunca otomatik tanımlanır.', out: 'iris' },
    OUT('midnight', 1.8),
  ] }));

  // ------------------------------------------------------------------ GÜN 2 · Hesap derdi
  add('s04', 2, 1, 'Hesap derdi', 'Fiyatı hâlâ hesap makinesiyle mi çıkarıyorsun?', mk('lofi_happy', { world: 'paper', finish: 'graphite', scenes: [
    { type: 'phone', sec: 5.8, screen: { still: 'm_10' },
      cam: [{ t: 0, yaw: 0, pitch: 34, dist: 5.6, y: 330, roll: -7 }, { t: 'end', yaw: -8, pitch: 22, dist: 5.1, y: 320, roll: -2, e: 'sine' }],
      phone: [{ t: 0, rx: -18, ry: 8, rz: 6 }, { t: 'end', rx: -10, ry: 2, rz: 2, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Sabah sorusu · Hesap', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Fiyatı hâlâ\n*hesap makinesiyle*\nmi çıkarıyorsun?', x: 84, y: 340, size: 92, at: 0, pre: .8, stagger: .05 },
        { kind: 'stamp', box: true, text: '[Sen hangisisin?]', x: 160, w: 760, y: 1480, size: 64, align: 'center', at: 2.9, rot: 4, from: 1.25 },
      ],
      chips: [
        { at: .8, text: 'Evet, her seferinde', icon: 'euro', color: '#F5B544', anchor: [300, 1050], off: [-.14, .02], dz: .3, size: 1.25, light: true },
        { at: 1.2, text: 'Artık değil', icon: 'check', color: '#34D399', anchor: [870, 1500], off: [.12, 0], dz: .3, size: 1.25, light: true },
      ],
      out: 'whip' },
    OUT('paper', 1.8),
  ] }));

  add('s05', 2, 2, 'Hesap derdi', 'Motor, kâr, montaj: hepsi hesaplı', mk('afro_house', { world: 'graphite', finish: 'titanium', scenes: [
    { type: 'phone', sec: 6.2, screen: { still: 'm_09' },
      cam: [{ t: 0, yaw: 0, pitch: 4, dist: 5.4, y: 330 }, { t: 1.6, yaw: 2, pitch: 8, dist: 5.0, y: 230, e: 'inOut' }, { t: 'end', yaw: 6, pitch: 9, dist: 4.8, y: 220, e: 'sine' }],
      phone: [{ t: 0, rx: -6, ry: -14, rz: 0 }, { t: 1.5, rx: -38, ry: -6, rz: 20, e: 'inOut' }, { t: 'end', rx: -40, ry: -2, rz: 23, e: 'sine' }],
      float: false,
      explode: { at: .4, dur: 1.3, dim: .6, labelSize: 1.15, slices: [
        { rect: [0, 0, 1170, 190], z: .28 },
        { rect: [40, 370, 1090, 860], z: .16, dx: .05, label: 'Çizim' },
        { rect: [64, 1482, 1050, 372], z: .3, dx: -.05 },
        { rect: [64, 1858, 1050, 92], z: .46, dx: .06, grow: .28, label: 'Satış fiyatı', labelAt: 'top' },
        { rect: [36, 2330, 1098, 172], z: .06 },
      ] },
      text: [
        { kind: 'fade', style: 'label', text: 'Hesap derdi bitti', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Motor, kâr, montaj:\n*hepsi hesaplı.*', x: 84, y: 340, size: 96, at: 0, pre: .8, stagger: .05 },
      ],
      out: 'push' },
    OUT('graphite', 1.7),
  ] }));

  add('s06', 2, 3, 'Hesap derdi', 'Son Reels’e TEKLİF yaz', mk('future_bass', { world: 'graphite', scenes: [
    { type: 'type', sec: 2.0, text: [
      { kind: 'fade', style: 'label', text: 'Bu akşam', y: 560, align: 'center', at: 0, pre: .6 },
      { kind: 'weight', text: 'Hesabı bırak,\n[hediyeyi] al.', y: 640, size: 124, align: 'center', at: 0, pre: .55 },
    ], out: 'whip' },
    { type: 'cta', mode: 'comment', sec: 4.0, world: 'indigo', eyebrow: 'Hediye · İlk 1000 üyeye', head: 'Son Reels’e\n[TEKLİF] *yaz.*', size: 132, out: 'flash' },
    OUT('amber', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 3 · PDF
  add('s07', 3, 1, 'PDF', 'Teklifin müşteriye nasıl gidiyor?', mk('tropical', { world: 'midnight', scenes: [
    { type: 'type', sec: 5.8, text: [
      { kind: 'fade', style: 'label', text: 'Sabah sorusu · PDF', x: 84, y: 290, at: 0, pre: .6 },
      { kind: 'rise', text: 'Teklifin müşteriye\nnasıl *gidiyor?*', x: 84, y: 350, size: 100, at: 0, pre: .8, stagger: .05 },
      { kind: 'cycle', layer: 'back', style: 'giant', words: ['Kâğıtta?', 'Word’de?', 'Excel’de?', 'Fotoğrafla?', 'PDF?'], period: .62, x: 84, y: 640, size: 150, at: 0, pre: 1, cycleColor: '#8B87FF' },
      { kind: 'snap', box: true, text: 'Kâğıt, el yazısı', x: 84, y: 950, w: 440, size: 42, align: 'center', at: .5 },
      { kind: 'snap', box: true, text: 'Word · Excel', x: 556, y: 950, w: 440, size: 42, align: 'center', at: .65 },
      { kind: 'snap', box: true, text: 'Fotoğraf', x: 84, y: 1080, w: 440, size: 42, align: 'center', at: .8 },
      { kind: 'snap', box: true, text: '[PDF şablon]', x: 556, y: 1080, w: 440, size: 42, align: 'center', at: .95 },
      { kind: 'blur', text: 'Öğlen: *4 PDF şablonu.*', y: 1300, size: 70, align: 'center', at: 3.1 },
      { kind: 'fade', style: 'body', text: 'Klasik · Modern · Minimal · Kurumsal', y: 1410, size: 34, align: 'center', at: 3.5 },
    ], out: 'iris' },
    OUT('indigo', 1.8),
  ] }));

  add('s08', 3, 2, 'PDF', 'Önizle, PDF teklif hazır', mk('ukulele', { world: 'paper', finish: 'indigo', scenes: [
    { type: 'phone', sec: 6.2, screens: [{ at: 0, clip: 'pdf', from: 0.1 }, { at: 2.9, ...M07B }],
      cam: [{ t: 0, yaw: -28, pitch: -8, dist: 5.5, y: 330 }, { t: 2.8, yaw: -12, pitch: -3, dist: 5.0, y: 320, e: 'sine' }, { t: 'end', yaw: 10, pitch: 2, dist: 4.8, y: 320, e: 'inOut' }],
      phone: [{ t: 0, ry: 20, rx: 3 }, { t: 2.8, ry: 10, e: 'sine' }, { t: 'end', ry: -8, e: 'inOut' }],
      text: [
        { kind: 'fade', style: 'label', text: 'PDF teklif · gerçek kayıt', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Önizle,\n*PDF hazır.*', x: 84, y: 340, size: 110, at: 0, pre: .8, stagger: .05 },
        { kind: 'cycle', words: ['Klasik', 'Minimal', 'Kurumsal', 'Modern'], period: .42, before: 'Şablon:', x: 600, y: 470, size: 52, at: 3.0, cycleColor: '#4F46E5' },
      ],
      chips: [{ at: 1.0, out: 2.7, text: 'PDF teklif', icon: 'pdf', color: '#4F46E5', anchor: [880, 700], off: [.1, .05], dz: .22 }],
      pop: [{ at: 3.6, rect: [440, 400, 680, 250], style: 'crop', to: { x: 40, y: 1400, w: 760, rx: 6, ry: 12 } }],
      out: 'whip' },
    OUT('midnight', 1.7),
  ] }));

  add('s09', 3, 3, 'PDF', 'Profildeki linkten 1 ay Pro hediye', mk('disco', { world: 'midnight', finish: 'black', scenes: [
    { type: 'phone', sec: 2.3, screen: { ...M07 },
      cam: [{ t: 0, yaw: -14, pitch: 4, dist: 5.2, y: 300 }, { t: 1.3, yaw: -8, pitch: 2, dist: 4.8, y: 280, e: 'sine' }, { t: 'end', yaw: 0, pitch: 0, dist: 1.5, y: 0, e: 'inExpo' }],
      phone: [{ t: 0, ry: 12 }, { t: 'end', ry: 0, e: 'inOut' }],
      text: [{ kind: 'rise', text: 'Teklifin PDF.\n*Hediyen hazır.*', x: 84, y: 300, size: 104, at: 0, pre: .8, stagger: .05, out: 1.5 }],
      chips: [{ at: .4, out: 1.4, text: '1 ay Pro', sub: 'hediye', icon: 'gift', color: '#F0617A', anchor: [585, 1200], off: [0, 0], dz: .3, size: 1.2 }],
      out: 'zoom' },
    { type: 'cta', mode: 'code', sec: 3.6, world: 'forest', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: '1 ay Pro\n[hediye.]', url: 'Profildeki link', out: 'flash' },
    OUT('forest', 1.7),
  ] }));

  // ------------------------------------------------------------------ GÜN 4 · Katalog
  add('s10', 4, 1, 'Katalog', 'Aynı ürünü her teklifte yeniden mi yazıyorsun?', mk('afro_house', { world: 'mint', finish: 'silver', scenes: [
    { type: 'phone', sec: 5.9, screen: { still: 'm_18' },
      cam: [{ t: 0, yaw: -20, pitch: 6, dist: 5.6, x: 230, y: 300, roll: 8 }, { t: 'end', yaw: -10, pitch: 3, dist: 5.2, x: 220, y: 300, roll: 4, e: 'sine' }],
      phone: [{ t: 0, ry: 22, rz: -4 }, { t: 'end', ry: 12, rz: -2, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Sabah sorusu · Katalog', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Aynı ürünü her\nteklifte *yeniden*\nmi yazıyorsun?', x: 84, y: 340, size: 92, at: 0, pre: .8, stagger: .05 },
        { kind: 'snap', box: true, text: 'Evet, her seferinde', x: 60, y: 1010, size: 40, at: .8 },
        { kind: 'snap', box: true, text: 'Kopyala-yapıştır', x: 60, y: 1120, size: 40, at: .95 },
        { kind: 'snap', box: true, text: '[Katalogdan seçerim]', x: 60, y: 1230, size: 40, at: 1.1 },
        { kind: 'fade', style: 'body', text: 'Öğlen: ürünü bir kez tanımla.', x: 60, y: 1380, size: 34, w: 470, wrap: true, at: 2.8 },
      ],
      out: 'whipUp' },
    OUT('mint', 1.8),
  ] }));

  add('s11', 4, 2, 'Katalog', 'Bir kez tanımla, teklifte sadece seç', mk('future_bass', { world: 'indigo', finish: 'graphite', scenes: [
    { type: 'phone', sec: 6.0, screens: [{ at: 0, still: 'm_18' }, { at: 1.6, still: 'm_04' }],
      cam: [{ t: 0, yaw: -36, pitch: 8, dist: 5.4, y: 320 }, { t: 1.6, yaw: -14, pitch: 4, dist: 5.0, y: 310, e: 'inOut' }, { t: 'end', yaw: 18, pitch: 3, dist: 4.9, y: 310, e: 'sine' }],
      phone: [{ t: 0, ry: 24 }, { t: 1.6, ry: 10, e: 'inOut' }, { t: 'end', ry: -12, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Ürün / hizmet kataloğu', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Bir kez tanımla,\n*teklifte sadece seç.*', x: 84, y: 340, size: 92, at: 0, pre: .8, stagger: .05 },
      ],
      chips: [{ at: .5, out: 1.5, text: 'Katalog', icon: 'bolt', color: '#6C64FF', anchor: [585, 420], off: [0, .1], dz: .22 }],
      highlight: [{ at: 2.3, until: 2.75, rect: [40, 1040, 1090, 140], style: 'ring', color: '#6C64FF' }],
      pop: [{ at: 2.6, rect: [40, 1040, 1090, 140], style: 'crop', to: { y: 1360, w: 960, rx: 6, ry: -10 } }],
      burst: [{ at: 3.4, x: 540, y: 1360, n: 60, power: .7, seed: 9 }],
      out: 'iris' },
    OUT('midnight', 1.7),
  ] }));

  add('s12', 4, 3, 'Katalog', 'Son Reels’e TEKLİF yaz', mk('stomp_folk', { world: 'mint', scenes: [
    { type: 'type', sec: 2.1, text: [
      { kind: 'fade', style: 'label', text: 'Katalog hazır', y: 560, align: 'center', at: 0, pre: .6 },
      { kind: 'chars', text: 'Sıra *sende.*', y: 640, size: 170, align: 'center', at: 0, pre: .6, stagger: .03 },
    ], burst: [{ at: .5, x: 540, y: 760, n: 90, power: 1, seed: 11 }], out: 'push' },
    { type: 'cta', mode: 'comment', sec: 4.0, world: 'dusk', eyebrow: 'Bugün · İlk 1000 üyeye', head: 'Son Reels’e\n[TEKLİF] *yaz.*', size: 140, out: 'iris' },
    OUT('dusk', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 5 · WhatsApp
  add('s13', 5, 1, 'WhatsApp', 'Teklifi müşteriye nereden gönderiyorsun?', mk('ukulele', { world: 'forest', scenes: [
    { type: 'type', sec: 5.8, text: [
      { kind: 'fade', style: 'label', text: 'Sabah sorusu · Gönderim', x: 84, y: 290, at: 0, pre: .6 },
      { kind: 'wave', text: 'Teklifi müşteriye\n*nereden* gönderiyorsun?', x: 84, y: 350, size: 84, at: 0, pre: .85, stagger: .015 },
      { kind: 'snap', box: true, text: 'WhatsApp’tan', x: 980, align: 'right', y: 650, size: 70, at: .5, from: 1.3 },
      { kind: 'snap', box: true, text: 'E-postayla', x: 84, y: 830, size: 70, at: .75, from: 1.3 },
      { kind: 'snap', box: true, text: 'Elden, kâğıtla', x: 980, align: 'right', y: 1010, size: 70, at: 1.0, from: 1.3 },
      { kind: 'type', text: 'Cevabın ne?', x: 84, y: 1210, size: 80, at: 1.6, dur: .7 },
      { kind: 'blur', text: 'Öğlen: PDF, *tek dokunuşla.*', x: 84, y: 1440, size: 64, at: 3.0 },
    ], out: 'whip' },
    OUT('forest', 1.8),
  ] }));

  add('s14', 5, 2, 'WhatsApp', 'PDF teklif, WhatsApp’tan tek dokunuş', mk('disco', { world: 'mint', finish: 'black', scenes: [
    { type: 'phone', sec: 6.0, screen: { still: 'm_06' },
      cam: [{ t: 0, yaw: 18, pitch: -16, dist: 5.5, y: 320, roll: 3 }, { t: 2.0, yaw: 10, pitch: -9, dist: 5.0, y: 300, roll: 1, e: 'sine' }, { t: 'end', yaw: 2, pitch: -5, dist: 4.8, y: 300, e: 'sine' }],
      phone: [{ t: 0, ry: -18, rx: 5 }, { t: 'end', ry: -6, rx: 1, e: 'sine' }],
      shake: .7,
      text: [
        { kind: 'fade', style: 'label', text: 'Tek dokunuş', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'PDF teklif,\n*WhatsApp’tan.*', x: 84, y: 340, size: 112, at: 0, pre: .8, stagger: .05 },
      ],
      highlight: [{ at: 1.0, until: 1.55, rect: [612, 2070, 525, 140], style: 'ring', color: '#25D366' }],
      pop: [{ at: 1.4, rect: [612, 2070, 525, 140], style: 'crop', to: { x: 60, y: 1300, w: 700, rx: 4, ry: 14 } }],
      chips: [{ at: 2.6, text: 'Müşteriye gönderildi', icon: 'send', color: '#25D366', anchor: [585, 900], off: [0, .12], dz: .28, size: 1.1, light: true }],
      out: 'whipUp' },
    OUT('mint', 1.7),
  ] }));

  add('s15', 5, 3, 'WhatsApp', 'Profildeki linkten 1 ay Pro hediye', mk('sunny_pop', { world: 'paper', finish: 'silver', scenes: [
    { type: 'phone', sec: 2.4, screen: { still: 'm_06' },
      cam: [{ t: 0, yaw: 0, pitch: 18, dist: 5.6, y: 380 }, { t: 'end', yaw: -6, pitch: 10, dist: 5.2, y: 370, e: 'sine' }],
      phone: [{ t: 0, rx: -8, ry: 6 }, { t: 'end', rx: -4, ry: 2, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Hafta sonundan önce', x: 84, y: 290, at: 0, pre: .6 },
        { kind: 'rise', text: 'Bu hafta\n*hediye senden yana.*', x: 84, y: 350, size: 96, at: 0, pre: .8, stagger: .05 },
      ],
      chips: [{ at: .3, text: '1 ay Pro', sub: 'hediye', icon: 'gift', color: '#F0617A', anchor: [585, 1300], dz: .34, size: 1.5, light: true }],
      burst: [{ at: .7, x: 540, y: 1150, n: 80, power: .9, seed: 13 }],
      out: 'flash' },
    { type: 'cta', mode: 'code', sec: 3.4, world: 'mint', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: 'Kodun\n*hazır.*', url: 'Profildeki link', out: 'push' },
    OUT('paper', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 6 · AI
  add('s16', 6, 1, 'AI', 'Teklif metnini yapay zekâ yazsa?', mk('future_bass', { world: 'dusk', finish: 'titanium', scenes: [
    { type: 'phone', sec: 5.9, screen: { still: 'm_16' },
      cam: [{ t: 0, yaw: 20, pitch: -20, dist: 5.6, y: 330, roll: -5 }, { t: 'end', yaw: 8, pitch: -12, dist: 5.1, y: 320, roll: -2, e: 'sine' }],
      phone: [{ t: 0, ry: -20, rx: 8 }, { t: 'end', ry: -8, rx: 4, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Sabah sorusu · AI', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'blur', text: 'Teklif metnini\n*yapay zekâ* yazsa?', x: 84, y: 340, size: 100, at: 0, pre: .8, stagger: .05 },
        { kind: 'stamp', box: true, text: '[Sen ne dersin?]', x: 160, w: 760, y: 1490, size: 64, align: 'center', at: 2.8, rot: -4, from: 1.25 },
      ],
      chips: [
        { at: .8, text: 'Olur, denerim', icon: 'ai', color: '#F0617A', anchor: [880, 800], off: [.12, .04], dz: .3, size: 1.25 },
        { at: 1.2, text: 'Ben yazarım', icon: 'chat', color: '#4F46E5', anchor: [300, 1350], off: [-.12, 0], dz: .3, size: 1.25 },
      ],
      out: 'iris' },
    OUT('dusk', 1.7),
  ] }));

  add('s17', 6, 2, 'AI', 'Kalem açıklaması AI’dan', mk('stomp_folk', { world: 'midnight', finish: 'indigo', scenes: [
    { type: 'phone', sec: 6.2, screen: { clip: 'ai', from: 2.2 },
      cam: [{ t: 0, yaw: -6, pitch: 30, dist: 5.6, y: 330, roll: 6 }, { t: 2.0, yaw: -2, pitch: 16, dist: 5.0, y: 310, roll: 2, e: 'inOut' }, { t: 'end', yaw: 6, pitch: 8, dist: 4.8, y: 300, roll: 0, e: 'sine' }],
      phone: [{ t: 0, rx: -14, ry: 6 }, { t: 'end', rx: -4, ry: -4, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Yapay zekâ asistanı', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Kalem açıklaması\n*[AI]’dan.*', x: 84, y: 340, size: 100, at: 0, pre: .8, stagger: .05 },
      ],
      chips: [
        { at: 1.4, out: 3.0, text: 'Teklif kalemi', icon: 'ai', color: '#8B87FF', anchor: [300, 700], off: [-.16, .02], dz: .24 },
        { at: 1.8, out: 3.0, text: 'Fiyat notu', icon: 'euro', color: '#F5B544', anchor: [880, 1000], off: [.14, 0], dz: .24 },
      ],
      pop: [{ at: 3.2, rect: [60, 1125, 1070, 615], style: 'crop', to: { y: 1290, w: 900, rx: 5, ry: -8 } }],
      out: 'whip' },
    OUT('midnight', 1.6),
  ] }));

  add('s18', 6, 3, 'AI', 'Son Reels’e TEKLİF yaz', mk('lofi_happy', { world: 'forest', scenes: [
    { type: 'type', sec: 2.3, text: [
      { kind: 'fade', style: 'label', text: 'Hafta sonu kur, pazartesi teklif ver', y: 560, align: 'center', at: 0, pre: .6 },
      { kind: 'type', text: 'TEKLİF', y: 650, size: 230, align: 'center', at: .1, pre: .35, dur: .8 },
      { kind: 'fade', style: 'body', text: 'Tek kelime yeter.', y: 920, size: 40, align: 'center', at: .9 },
    ], out: 'whipUp' },
    { type: 'cta', mode: 'comment', sec: 4.0, world: 'graphite', eyebrow: 'Hediye · İlk 1000 üyeye', head: 'Son Reels’e\n[TEKLİF] *yaz.*', size: 132, out: 'flash' },
    OUT('forest', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 7 · Panel
  add('s19', 7, 1, 'Panel', 'Bu ay kaç teklif verdin, biliyor musun?', mk('disco', { world: 'graphite', scenes: [
    { type: 'type', sec: 5.6, text: [
      { kind: 'track', layer: 'back', style: 'giant outline deco', text: 'PANEL', y: 1200, size: 300, align: 'center', at: 0, pre: .6, ls0: .4 },
      { kind: 'fade', style: 'label', text: 'Sabah sorusu · Panel', x: 84, y: 290, at: 0, pre: .6 },
      { kind: 'weight', text: 'Bu ay kaç\nteklif verdin?', x: 84, y: 350, size: 120, at: 0, pre: .5 },
      { kind: 'snap', text: '*Biliyor musun?*', x: 84, y: 610, size: 96, at: .6, color: '#F5B544' },
      { kind: 'snap', box: true, text: 'Evet, tam olarak', x: 84, y: 800, size: 50, at: 1.0 },
      { kind: 'snap', box: true, text: 'Aşağı yukarı', x: 84, y: 930, size: 50, at: 1.15 },
      { kind: 'snap', box: true, text: 'Hiç bakmadım', x: 84, y: 1060, size: 50, at: 1.3 },
      { kind: 'fade', style: 'body', text: 'Öğlen: işinin özeti tek ekranda.', x: 84, y: 1520, size: 38, at: 2.8 },
    ], out: 'zoom' },
    OUT('graphite', 1.8),
  ] }));

  add('s20', 7, 2, 'Panel', 'İşinin özeti tek ekranda', mk('sunny_pop', { world: 'paper', finish: 'black', scenes: [
    { type: 'phone', sec: 6.4, screens: [{ at: 0, clip: 'panel', from: 0 }, { at: 2.3, still: 'm_02' }],
      cam: [{ t: 0, yaw: 22, pitch: 6, dist: 5.3, y: 330 }, { t: 2.3, yaw: 8, pitch: 6, dist: 5.0, y: 300, e: 'inOut' }, { t: 3.8, yaw: -2, pitch: 9, dist: 5.0, y: 220, e: 'inOut' }, { t: 'end', yaw: -6, pitch: 9, dist: 4.8, y: 210, e: 'sine' }],
      phone: [{ t: 0, ry: -16 }, { t: 2.4, rx: -6, ry: -6, rz: 0, e: 'inOut' }, { t: 3.8, rx: -38, ry: 4, rz: -20, e: 'inOut' }, { t: 'end', rx: -40, ry: 2, rz: -23, e: 'sine' }],
      float: false,
      explode: { at: 2.7, dur: 1.2, dim: .55, labelSize: 1.15, slices: [
        { rect: [45, 540, 1080, 580], z: .34, dx: .03, label: 'Nakit durumu', labelAt: 'top' },
        { rect: [45, 1130, 1080, 545], z: .22, dx: -.04, label: 'Teklif durumları', labelAt: 'top' },
        { rect: [45, 1855, 1080, 290], z: .12, dx: .02, label: 'Hızlı işlemler', labelAt: 'top' },
      ] },
      text: [
        { kind: 'fade', style: 'label', text: 'Panel · demo veri', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'İşinin özeti\n*tek ekranda.*', x: 84, y: 340, size: 110, at: 0, pre: .8, stagger: .05 },
      ],
      out: 'iris' },
    OUT('indigo', 1.6),
  ] }));

  add('s21', 7, 3, 'Panel', 'Profildeki linkten 1 ay Pro hediye', mk('tropical', { world: 'indigo', scenes: [
    { type: 'type', sec: 2.2, text: [
      { kind: 'stamp', layer: 'back', style: 'giant outline deco', text: 'HEDİYE', y: 1020, size: 230, align: 'center', at: 0, pre: .7, from: 1.3, rot: 0 },
      { kind: 'chars', text: 'Yeni haftaya\n*hazır başla.*', y: 600, size: 128, align: 'center', at: 0, pre: .6, stagger: .025 },
    ], out: 'whip' },
    { type: 'cta', mode: 'code', sec: 3.6, world: 'paper', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: '1 ay [Pro]\n*bizden.*', url: 'Profildeki link', out: 'iris' },
    OUT('midnight', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 8 · KDV / toplam
  add('s22', 8, 1, 'KDV/toplam', 'Quiz: KDV’yi her satıra elle eklemek şart mı?', mk('stomp_folk', { world: 'indigo', scenes: [
    { type: 'type', sec: 5.8, text: [
      { kind: 'fade', style: 'label', text: 'Quiz · Doğru mu, yanlış mı?', x: 84, y: 290, at: 0, pre: .6 },
      { kind: 'rise', text: 'KDV’yi her\nsatıra *elle*\neklemek şart.', x: 84, y: 350, size: 116, at: 0, pre: .8, stagger: .05 },
      { kind: 'stamp', layer: 'back', style: 'giant outline deco', text: '%20', y: 1250, size: 340, align: 'center', at: 0, pre: .8, from: 1.4, rot: -6 },
      { kind: 'snap', box: true, text: 'Doğru', x: 84, y: 860, w: 440, size: 64, align: 'center', at: .7 },
      { kind: 'snap', box: true, text: 'Yanlış', x: 556, y: 860, w: 440, size: 64, align: 'center', at: .85 },
      { kind: 'blur', text: 'Cevap öğlen. *Tahminin?*', y: 1060, size: 64, align: 'center', at: 2.6 },
    ], out: 'flash' },
    OUT('indigo', 1.7),
  ] }));

  add('s23', 8, 2, 'KDV/toplam', 'KDV dahil toplam, kendiliğinden', mk('lofi_happy', { world: 'amber', finish: 'graphite', scenes: [
    { type: 'phone', sec: 6.4, screen: { still: 'm_06' },
      cam: [{ t: 0, yaw: -22, pitch: 10, dist: 5.4, y: 330, roll: 4 }, { t: 2.4, yaw: -12, pitch: 5, dist: 5.0, y: 310, roll: 2, e: 'sine' }, { t: 'end', yaw: 4, pitch: 2, dist: 4.8, y: 300, roll: 0, e: 'inOut' }],
      phone: [{ t: 0, ry: 18 }, { t: 'end', ry: -2, e: 'inOut' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Otomatik toplam', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'KDV dahil toplam,\n*kendiliğinden.*', x: 84, y: 340, size: 96, at: 0, pre: .8, stagger: .05 },
      ],
      pop: [
        { at: .8, out: 2.6, rect: [40, 1395, 1090, 100], style: 'price', label: 'KDV (%20)', value: 69030, prefix: '₺ ', h: 160, to: { y: 1150, w: 900, rx: 6, ry: -10 }, counter: { delay: .25, dur: .8 } },
        { at: 2.9, rect: [68, 1503, 1034, 138], style: 'dark', label: 'Genel toplam', value: 414180, prefix: '₺ ', h: 168, to: { y: 1360, w: 960, rx: 6, ry: 10 }, counter: { delay: .3, dur: 1.0 } },
      ],
      out: 'whip' },
    OUT('amber', 1.6),
  ] }));

  add('s24', 8, 3, 'KDV/toplam', 'Son Reels’e TEKLİF yaz', mk('afro_house', { world: 'amber', finish: 'black', scenes: [
    { type: 'phone', sec: 2.3, screen: { still: 'm_06' }, cam: [{ t: 0, yaw: -14, pitch: 4, dist: 5.4, y: 340 }, { t: 1.2, yaw: -8, pitch: 2, dist: 5.0, y: 320, e: 'sine' }, { t: 'end', yaw: 0, pitch: 0, dist: 1.5, y: 0, e: 'inExpo' }],
      phone: [{ t: 0, ry: 10 }, { t: 'end', ry: 0 }],
      text: [{ kind: 'rise', text: 'Bir sonraki\nölçüde *dene.*', x: 84, y: 300, size: 116, at: 0, pre: .8, stagger: .05, out: 1.4 }],
      out: 'zoom' },
    { type: 'cta', mode: 'comment', sec: 4.0, world: 'midnight', eyebrow: 'Hediye · İlk 1000 üyeye', head: 'Son Reels’e\n[TEKLİF] *yaz.*', size: 136, reply: '1 ay Pro hediyen hazır!<br><span style="color:#4F46E5">Kod: TEKLIF30</span>', out: 'flash' },
    OUT('paper', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 9 · Kasa
  add('s25', 9, 1, 'Kasa', 'Kasada şu an ne var, söyleyebilir misin?', mk('sunny_pop', { world: 'amber', finish: 'indigo', scenes: [
    { type: 'phone', sec: 5.8, screen: { ...M12 }, cam: [{ t: 0, yaw: -34, pitch: 8, dist: 5.6, y: 340 }, { t: 'end', yaw: 22, pitch: 4, dist: 5.2, y: 330, e: 'sine' }],
      phone: [{ t: 0, ry: 14 }, { t: 'end', ry: -10, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Sabah sorusu · Kasa', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Kasada şu an\nne var? *Hemen*\nsöyleyebilir misin?', x: 84, y: 340, size: 92, at: 0, pre: .8, stagger: .05 },
        { kind: 'fade', style: 'body', box: true, text: 'Öğlen: gelir, gider, net tek ekranda.', x: 170, w: 740, y: 1490, size: 34, align: 'center', at: 2.8, color: '#17110A' },
      ],
      chips: [
        { at: .8, text: 'Kuruşu kuruşuna', icon: 'check', color: '#0B8F63', anchor: [300, 900], off: [-.12, .02], dz: .3, size: 1.2, light: true },
        { at: 1.2, text: 'Bakmam lazım', icon: 'clock', color: '#4F46E5', anchor: [880, 1500], off: [.12, 0], dz: .3, size: 1.2, light: true },
      ],
      out: 'whip' },
    OUT('amber', 1.8),
  ] }));

  add('s26', 9, 2, 'Kasa', 'Gelir, gider, net: tek ekranda', mk('tropical', { world: 'forest', finish: 'silver', scenes: [
    { type: 'phone', sec: 6.2, screen: { ...M12 },
      cam: [{ t: 0, yaw: 0, pitch: -6, dist: 5.8, y: 320 }, { t: 'end', yaw: -10, pitch: -2, dist: 4.9, y: 310, e: 'sine' }],
      phone: [{ t: 0, ry: 0, rx: 4 }, { t: 'end', ry: 10, rx: 0, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Kasa · demo veri', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'rise', text: 'Gelir, gider, net:\n*tek ekranda.*', x: 84, y: 340, size: 100, at: 0, pre: .8, stagger: .05 },
      ],
      highlight: [{ at: .8, until: 1.2, rect: [50, 235, 1090, 440], style: 'ring', color: '#34D399' }],
      pop: [{ at: 1.0, rect: [50, 235, 1090, 440], style: 'crop', to: { y: 1250, w: 940, rx: 8, ry: -12 }, out: 3.6 }],
      chips: [{ at: 4.0, text: 'Yeni kayıt: Gelir (+)', icon: 'euro', color: '#0F9F6E', anchor: [585, 1220], off: [0, .04], dz: .3, size: 1.15 }],
      out: 'push' },
    OUT('forest', 1.6),
  ] }));

  add('s27', 9, 3, 'Kasa', 'Profildeki linkten 1 ay Pro hediye', mk('ukulele', { world: 'midnight', scenes: [
    { type: 'type', sec: 2.2, text: [
      { kind: 'track', style: 'label', text: 'Bugün hediye günü', y: 600, align: 'center', at: 0, pre: .6, size: 34 },
      { kind: 'snap', text: '[Link] profilde.', y: 680, size: 150, align: 'center', at: 0, pre: .6 },
      { kind: 'fade', style: 'body', text: 'anindateklif.co/hediye', y: 880, size: 44, align: 'center', at: .5 },
    ], burst: [{ at: .4, x: 540, y: 760, n: 100, power: 1, seed: 17 }], out: 'whipUp' },
    { type: 'cta', mode: 'code', sec: 3.6, world: 'amber', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: '1 ay [Pro]\n*ücretsiz.*', out: 'flash' },
    OUT('midnight', 1.6),
  ] }));

  // ------------------------------------------------------------------ GÜN 10 · Özet
  add('s28', 10, 1, 'Özet', 'Hangi özellik senin favorin?', mk('lofi_happy', { world: 'paper', scenes: [
    { type: 'type', sec: 6.0, text: [
      { kind: 'fade', style: 'label', text: 'Serinin son günü', x: 84, y: 290, at: 0, pre: .6 },
      { kind: 'rise', text: 'Hangi özellik\n*senin favorin?*', x: 84, y: 350, size: 112, at: 0, pre: .8, stagger: .05 },
      { kind: 'snap', box: true, text: 'Ölçü → fiyat', x: 84, y: 720, w: 440, size: 52, align: 'center', at: .5 },
      { kind: 'snap', box: true, text: 'PDF teklif', x: 556, y: 720, w: 440, size: 52, align: 'center', at: .62 },
      { kind: 'snap', box: true, text: 'Katalog', x: 84, y: 870, w: 440, size: 52, align: 'center', at: .74 },
      { kind: 'snap', box: true, text: 'WhatsApp', x: 556, y: 870, w: 440, size: 52, align: 'center', at: .86 },
      { kind: 'snap', box: true, text: 'AI asistan', x: 84, y: 1020, w: 440, size: 52, align: 'center', at: .98 },
      { kind: 'snap', box: true, text: 'Panel · Kasa', x: 556, y: 1020, w: 440, size: 52, align: 'center', at: 1.1 },
      { kind: 'blur', text: 'Öğlen: *hepsi bir arada.*', y: 1280, size: 72, align: 'center', at: 2.8 },
    ], burst: [{ at: 1.4, x: 540, y: 1000, n: 90, power: .8, seed: 19 }], out: 'iris' },
    OUT('midnight', 1.6),
  ] }));

  add('s29', 10, 2, 'Özet', 'Hepsi tek uygulamada', mk('afro_house', { world: 'dusk', finish: 'titanium', scenes: [
    { type: 'phone', sec: 6.6,
      screens: [{ at: 0, clip: 'zip', from: 1.2 }, { at: .7, still: 'm_18' }, { at: 1.4, ...M07B }, { at: 2.1, still: 'm_16' }, { at: 2.8, still: 'm_02' }, { at: 3.5, ...M12 }, { at: 4.2, still: 'm_10' }],
      cam: [{ t: 0, yaw: -24, pitch: 6, dist: 5.3, y: 330 }, { t: 4.2, yaw: 18, pitch: 3, dist: 5.0, y: 320, e: 'inOut' }, { t: 'end', yaw: 10, pitch: 2, dist: 4.8, y: 310, e: 'sine' }],
      phone: [{ t: 0, ry: 8 }, { t: 4.2, ry: -12, e: 'inOut' }, { t: 'end', ry: -6, e: 'sine' }],
      text: [
        { kind: 'fade', style: 'label', text: 'Hepsi tek uygulamada', x: 84, y: 280, at: 0, pre: .6 },
        { kind: 'cycle', words: ['Ölçü → fiyat', 'Katalog', 'PDF teklif', 'AI asistan', 'Panel', 'Kasa', 'Anında Teklif.'], period: .7, x: 84, y: 340, size: 112, at: 0, pre: 1, cycleColor: '#FFC86B' },
      ],
      pop: [{ at: 4.6, rect: [86, 1793, 1000, 84], style: 'price', label: 'Satış fiyatı', value: 800.53, prefix: '€ ', h: 180, to: { y: 1380, w: 920, rx: 6, ry: 10 }, counter: { delay: .25, dur: .8 } }],
      out: 'flash' },
    OUT('dusk', 1.6),
  ] }));

  add('s30', 10, 3, 'Özet', 'Teşekkürler! Hediye hâlâ geçerli', mk('future_bass', { world: 'paper', scenes: [
    { type: 'type', sec: 2.2, text: [
      { kind: 'chars', text: 'Teşekkürler!', y: 600, size: 150, align: 'center', at: 0, pre: .6, stagger: .03 },
      { kind: 'rise', text: 'Hediye *hâlâ geçerli.*', y: 800, size: 76, align: 'center', at: .25, pre: .3 },
    ], burst: [{ at: .3, x: 540, y: 720, n: 120, power: 1.1, seed: 21 }], out: 'iris' },
    { type: 'cta', mode: 'code', sec: 3.6, world: 'indigo', eyebrow: 'Profildeki linkten · İlk 1000 üyeye', head: '1 ay [Pro]\n*hediye.*', url: 'Profildeki link', note: 'Ya da son Reels’e TEKLİF yaz.', out: 'flash' },
    OUT('indigo', 1.6),
  ] }));
})();

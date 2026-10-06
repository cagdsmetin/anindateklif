// Anında Teklif — Reels v3 planları. v3/reel.html?id=p1 → window.V3_REELS.p1
// API: v3/README.md. Kurallar: 0. kare dolu (pre), önce ürün aksiyonu, logo sonda,
// tüm yazılar y ∈ [180,1500], uydurma istatistik yok (yalnızca: 1 ay, ilk 1000 üye, TEKLIF30).
window.V3_REELS = {

  // P1 — "Bu teklif 8 saniyede hazırlandı": telefonun arkasında canlı dev sayaç,
  // ölçü → fiyat, Satış fiyatı satırı 3B olarak kameraya uçar, ekrandan PDF'e dalış.
  p1: {
    music: 'future_bass', world: 'midnight', finish: 'graphite',
    overlays: [
      { kind: 'timer', layer: 'back', at: 0, pre: 1, run: [0, 8], from: 0, to: 8, decimals: 2, suffix: 'sn',
        y: 400, size: 272, align: 'center', out: 8.9, style: 'giant', doneColor: '#8B87FF' },
    ],
    scenes: [
      { type: 'phone', beats: 12, screen: { clip: 'zip', from: 0 },
        cam: [
          { t: 0, yaw: -24, pitch: 9, dist: 5.5, y: 330 },
          { t: 3.05, yaw: -12, pitch: 5, dist: 5.15, y: 320, e: 'sine' },
          { t: 3.4, yaw: -6, pitch: 3, dist: 4.7, y: 300, e: 'out' },
          { t: 5.05, yaw: -2, pitch: 1, dist: 4.5, y: 290, e: 'sine' },
          { t: 5.625, yaw: 0, pitch: 0, dist: 1.5, y: 0, e: 'inExpo' },
        ],
        phone: [{ t: 0, ry: 16, rx: -3 }, { t: 3.1, ry: 7, rx: -1, e: 'sine' }, { t: 5.625, ry: 0, rx: 0 }],
        text: [
          { kind: 'rise', text: 'Bu teklif *8 saniyede*\nhazırlandı.', x: 84, y: 196, size: 92, pre: .7, at: 0, stagger: .05, out: 5.0 },
        ],
        chips: [{ at: 1.0, out: 2.9, text: '350 × 260 cm', icon: 'ruler', color: '#6C64FF', anchor: [880, 640], off: [.12, .05], dz: .2 }],
        pop: [{ at: 3.45, rect: [86, 1856, 1012, 82], style: 'price', label: 'Satış fiyatı', value: 746.53, prefix: '€ ', h: 190,
          to: { y: 1236, w: 920, rx: 8, ry: -12 }, counter: { delay: .3, dur: 1.0 } }],
        highlight: [{ at: 3.2, rect: [86, 1856, 1012, 82], style: 'spot' }],
        out: 'zoom' },

      { type: 'phone', beats: 8, screen: { clip: 'pdf', from: 0.15 },
        cam: [{ t: 0, yaw: 0, pitch: 0, dist: 1.5, y: 0 }, { t: 1.3, yaw: 14, pitch: 4, dist: 4.9, y: 300, e: 'quint' }, { t: 'end', yaw: 8, pitch: 2, dist: 4.7, y: 300, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 1.3, ry: -14, e: 'quint' }, { t: 'end', ry: -8, e: 'sine' }],
        text: [{ kind: 'blur', text: 'PDF teklif, *tek dokunuşla.*', x: 84, y: 214, size: 70, at: 1.0, stagger: .05 }],
        chips: [{ at: 1.6, text: 'Teklif hazır', icon: 'check', color: '#34D399', anchor: [300, 520], off: [-.2, .1], dz: .22 }],
        out: 'whip' },

      { type: 'phone', beats: 7, world: 'dusk', finish: 'titanium', screen: { clip: 'ai', from: 2.4 },
        cam: [{ t: 0, yaw: 30, pitch: -6, dist: 5.2, y: 330, roll: -3 }, { t: 'end', yaw: 14, pitch: -2, dist: 4.8, y: 320, roll: -1, e: 'sine' }],
        phone: [{ t: 0, ry: -20 }, { t: 'end', ry: -10, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Yapay zekâ asistanı', x: 84, y: 200, at: .1, pre: .3 },
          { kind: 'rise', text: 'Teklif metnini\n[AI] *yazsın.*', x: 84, y: 262, size: 100, at: .15, stagger: .06 },
        ],
        chips: [{ at: 1.3, text: 'Katalog önerisi', icon: 'ai', color: '#F0617A', anchor: [300, 1180], off: [-.18, 0], dz: .22 }],
        out: 'iris' },

      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'midnight' },
    ],
  },

  // P2 — "Perdeci misin?": cesur amber dünya, dönen meslek kelimesi, alçak açı + dutch kamera,
  // teklif ekranının katmanlara ayrıldığı patlatılmış görünüm, whip geçişler, kod CTA.
  p2: {
    music: 'disco', world: 'amber', finish: 'black',
    scenes: [
      { type: 'phone', beats: 8, screen: { clip: 'zip', from: 0.3 },
        cam: [{ t: 0, yaw: 22, pitch: -16, dist: 5.2, y: 330, roll: 7 }, { t: 1.1, yaw: 14, pitch: -10, dist: 4.9, y: 250, roll: 5, e: 'quint' }, { t: 'end', yaw: 6, pitch: -6, dist: 4.6, y: 230, roll: 3, e: 'sine' }],
        phone: [{ t: 0, py: -.55, ry: -24, rx: 6 }, { t: 1.0, py: 0, ry: -14, rx: 2, e: 'soft' }, { t: 'end', ry: -8, rx: 0, e: 'sine' }],
        shake: .8,
        text: [
          { kind: 'cycle', layer: 'back', words: ['Perdeci', 'Pergolacı', 'Zip perdeci', 'Cam balkoncu'], period: .62, at: 0, pre: 1,
            x: 70, y: 190, size: 138, cycleColor: '#2F27C2' },
          { kind: 'snap', layer: 'back', text: '*misin?*', x: 74, y: 352, size: 190, at: .12, pre: .6 },
        ],
        chips: [{ at: 2.3, text: 'Ölçü gir → fiyat anında', icon: 'bolt', color: '#4F46E5', anchor: [585, 700], off: [0, .16], dz: .22, light: true }],
        out: 'whip' },

      { type: 'phone', beats: 8, world: 'indigo', finish: 'black', screen: { still: 'm_10' },
        cam: [{ t: 0, yaw: 0, pitch: 4, dist: 5.4, y: 330 }, { t: 1.6, yaw: 0, pitch: 8, dist: 5.0, y: 200, e: 'inOut' }, { t: 'end', yaw: -5, pitch: 9, dist: 4.7, y: 180, e: 'sine' }],
        phone: [{ t: 0, rx: -8, ry: 12, rz: 0 }, { t: 1.5, rx: -40, ry: 6, rz: -22, e: 'inOut' }, { t: 'end', rx: -42, ry: 2, rz: -26, e: 'sine' }],
        float: false,
        explode: { at: .35, dur: 1.3, dim: .6, slices: [
          { rect: [0, 0, 1170, 190], z: .3 },
          { rect: [62, 312, 1046, 896], z: .2, dx: -.06, label: 'Çizim' },
          { rect: [86, 1793, 1000, 84], z: .42, dx: .1, grow: .3, label: 'Satış fiyatı', labelAt: 'top' },
          { rect: [110, 1990, 950, 136], z: .18, dx: .04, label: 'Teklife ekle' },
          { rect: [36, 2330, 1098, 172], z: .07 },
        ] },
        text: [
          { kind: 'fade', style: 'label', text: 'Tek ekran', x: 84, y: 196, at: .05, pre: .4 },
          { kind: 'rise', text: 'Ölçü, çizim,\n[fiyat.] *Hepsi bir arada.*', x: 84, y: 258, size: 86, at: .1, stagger: .05 },
        ],
        out: 'whip' },

      { type: 'phone', beats: 8, world: 'paper', finish: 'silver',
        screens: [{ at: 0, still: 'm_06' }, { at: 1.85, clip: 'pdf', from: 0.3 }],
        cam: [{ t: 0, yaw: 18, pitch: 4, dist: 5.0, y: 330 }, { t: 1.7, yaw: 10, pitch: 2, dist: 4.7, y: 320, e: 'sine' }, { t: 'end', yaw: -10, pitch: 4, dist: 4.9, y: 320, e: 'inOut' }],
        phone: [{ t: 0, ry: -16 }, { t: 1.7, ry: -10, e: 'sine' }, { t: 'end', ry: 10, e: 'inOut' }],
        pop: [{ at: .45, out: 1.75, rect: [68, 1503, 1034, 138], style: 'dark', label: 'Genel toplam', value: 414180, decimals: 2, prefix: '₺ ', h: 200,
          to: { y: 1200, w: 940, rx: 6, ry: 10 }, counter: { delay: .3, dur: 1.0 } }],
        text: [{ kind: 'blur', text: 'Toplam hazır.\n*PDF tek dokunuşta.*', x: 84, y: 200, size: 88, at: .1, stagger: .05 }],
        out: 'iris' },

      { type: 'cta', mode: 'code', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'amber' },
    ],
  },

  // _kit — bileşen vitrini (yayın için değil): tüm yazı türleri + type sahnesi + konfeti.
  _kit: {
    music: 'sunny_pop', world: 'graphite',
    scenes: [
      { type: 'type', beats: 8, world: 'graphite', burst: [{ at: 2.2, x: 540, y: 1100, n: 90 }], text: [
        { kind: 'weight', text: 'Ağırlık', x: 84, y: 200, size: 120, at: 0, pre: .4 },
        { kind: 'track', text: 'TAKİP', x: 84, y: 340, size: 90, at: .2 },
        { kind: 'chars', text: 'Harf harf *çıkış*', x: 84, y: 460, size: 80, at: .3 },
        { kind: 'stamp', text: '[Hazır!]', x: 600, y: 470, size: 90, at: 1.0 },
        { kind: 'type', text: 'Ölçü: 350 × 260 cm', x: 84, y: 600, size: 60, at: .5 },
        { kind: 'scramble', text: 'TEKLIF30', x: 84, y: 700, size: 90, at: .6, style: 'num' },
        { kind: 'counter', value: 12450.5, prefix: '₺ ', x: 84, y: 830, size: 100, at: .4, run: [.6, 1.8] },
        { kind: 'wave', text: 'Dalga gibi', x: 84, y: 980, size: 80, at: .8 },
        { kind: 'snap', text: 'Pat pat [pat]', x: 84, y: 1100, size: 80, at: 1.1 },
        { kind: 'blur', text: 'Netleşen ~altı çizili~ yazı', x: 84, y: 1220, size: 60, at: 1.3 },
        { kind: 'cycle', words: ['Perde', 'Pergola', 'Cam balkon'], period: .6, before: 'Hepsi:', x: 84, y: 1330, size: 70, at: 1.2 },
        { kind: 'fade', style: 'body', text: 'Gövde metni, uzun açıklamalar için.', x: 84, y: 1440, size: 34, at: 1.4 },
      ] },
      { type: 'outro', beats: 4, world: 'mint' },
    ],
  },
};

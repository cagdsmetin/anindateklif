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

// ============================================================================
// R01–R20 — yayın serisi (p1/p2 kalite çıtası). Her biri ayrı konsept, kamera dili, renk dünyası.
// Kurallar: 0. kare dolu · önce ürün aksiyonu · logo sonda · yazı y ∈ [180,1500] · Bayi satırı asla
// görünmez (zip kliği/m_10 otomatik örtülü; Satış pop-out'u üstünü kapatır) · m_07/m_07b müşteri+imza örtülü.
(function () {
  const R = window.V3_REELS;
  const MOB = '../footage/mobile/';
  // PDF önizleme görselleri: müşteri bloğu + imza satırı örtülür
  const M07 = { still: MOB + 'm_07_pdf_onizleme.png', redact: [[78, 686, 510, 164], [690, 1234, 404, 66]] };
  const M07B = { still: MOB + 'm_07b_pdf_onizleme_modern.png', redact: [[98, 698, 480, 218], [100, 1246, 560, 78]] };
  // m_12 (Kasa): yalnız üst kart; alt form örtülür
  const M12 = { still: MOB + 'm_12_kasa.png', redact: [[24, 700, 1122, 1600]] };
  // Sık dikdörtgenler (kaynak px)
  const SATIS = [86, 1856, 1012, 82];                 // zip kliği satış satırı (yerel ≥ 3.1 sn)
  const WA_M06 = [608, 2062, 530, 146];               // m_06 / pdf kliği başı: WhatsApp Gönder
  const WA_PDF = [700, 2385, 290, 130];               // PDF önizleme alt çubuğu: WhatsApp
  const TOPLAM_BLOK = [40, 1300, 1095, 350];          // m_06: Ara toplam + KDV + Genel toplam
  const KAT = { pergola: [60, 1040, 1060, 135], zip: [60, 1225, 1060, 135], giyotin: [60, 1410, 1060, 135], roof: [60, 1590, 1060, 135], isicam: [60, 1775, 1060, 135] }; // m_04
  const GREEN = '#25D366';
  const price = (at, to, extra) => Object.assign({ at, rect: SATIS, style: 'price', label: 'Satış fiyatı', value: 746.53, prefix: '€ ', h: 190,
    to, counter: { delay: .3, dur: 1.0 } }, extra || {});

  // R01 — "8 saniye" kronometresi ÖNDE (p1'de arkadaydı), grafit dünya, telefon alttan yükselir, alçak açı.
  R.r01 = {
    music: 'future_bass', world: 'graphite', finish: 'silver',
    overlays: [
      { kind: 'timer', at: 0, pre: 1, run: [0.25, 8.25], from: 0, to: 8, decimals: 2, suffix: 'sn', x: 78, y: 400, size: 230, out: 9.7, style: 'giant', doneColor: '#F5B544' },
    ],
    scenes: [
      { type: 'phone', beats: 12, screen: { clip: 'zip', from: 0 }, shake: .6,
        cam: [{ t: 0, yaw: 20, pitch: -16, dist: 5.7, y: 430, roll: -4 }, { t: 1.2, yaw: 12, pitch: -10, dist: 5.3, y: 420, roll: -2, e: 'quint' },
          { t: 3.1, yaw: 6, pitch: -6, dist: 5.1, y: 410, e: 'sine' }, { t: 3.45, yaw: 0, pitch: -3, dist: 4.7, y: 390, e: 'out' }, { t: 'end', yaw: -4, pitch: -2, dist: 4.6, y: 390, e: 'sine' }],
        phone: [{ t: 0, py: -.42, ry: -20, rx: 10 }, { t: 1.0, py: 0, ry: -12, rx: 4, e: 'soft' }, { t: 'end', ry: -4, rx: 0, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Bir zip perde teklifi.\n*Saati başlattık.*', x: 84, y: 196, size: 80, pre: .7, stagger: .05 }],
        chips: [{ at: 1.5, out: 3.0, text: '350 × 260 cm', icon: 'ruler', color: '#6C64FF', anchor: [880, 700], off: [.1, .04], dz: .2 }],
        highlight: [{ at: 3.2, rect: SATIS, style: 'spot' }],
        pop: [price(3.4, { y: 1300, w: 900, rx: 8, ry: 10 })],
        out: 'whipUp' },
      { type: 'phone', beats: 10, screen: { clip: 'pdf', from: .15 },
        cam: [{ t: 0, yaw: -16, pitch: 6, dist: 5.1, y: 430 }, { t: 'end', yaw: -6, pitch: 2, dist: 4.7, y: 410, e: 'sine' }],
        phone: [{ t: 0, ry: 14 }, { t: 'end', ry: 6, e: 'sine' }],
        text: [
          { kind: 'stamp', text: '[Hazır.]', x: 690, y: 440, size: 108, at: 2.7, rot: -7, from: 1.5 },
          { kind: 'fade', style: 'label', text: 'Ölçü → fiyat → PDF', x: 84, y: 680, at: 2.9 },
        ],
        chips: [{ at: 2.8, text: 'Teklif hazır', icon: 'check', color: '#34D399', anchor: [300, 560], off: [-.2, .06], dz: .22 }],
        out: 'push' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'forest', out: 'flash' },
      { type: 'outro', beats: 4, world: 'graphite' },
    ],
  };

  // R02 — CTA'nın kendisi kanca: "Yorum yaz, 1 ay Pro senin". Gün batımı, 120° yörünge kamerası, arka planda dev TEKLİF.
  R.r02 = {
    music: 'stomp_folk', world: 'dusk', finish: 'indigo',
    scenes: [
      { type: 'phone', beats: 11, screen: { clip: 'zip', from: .8 },
        cam: [{ t: 0, yaw: -42, pitch: 8, dist: 5.5, y: 340 }, { t: 2.2, yaw: -8, pitch: 4, dist: 5.0, y: 330, e: 'sine' }, { t: 2.6, yaw: 0, pitch: 2, dist: 4.6, y: 310, e: 'out' }, { t: 'end', yaw: 20, pitch: 3, dist: 4.7, y: 310, e: 'sine' }],
        phone: [{ t: 0, ry: 28 }, { t: 2.6, ry: 2, e: 'sine' }, { t: 'end', ry: -14, e: 'sine' }],
        text: [
          { kind: 'blur', style: 'giant outline deco', layer: 'back', text: 'TEKLİF', y: 520, size: 300, align: 'center', at: 0, pre: 1, stagger: 0 },
          { kind: 'fade', style: 'label', text: 'Instagram’a özel', x: 84, y: 196, at: 0, pre: .6 },
          { kind: 'rise', text: 'Yorum yaz,\n*1 ay Pro* senin.', x: 84, y: 252, size: 112, pre: .7, stagger: .06 },
        ],
        highlight: [{ at: 2.35, rect: SATIS, style: 'spot' }],
        pop: [price(2.5, { y: 1300, w: 900, rx: 6, ry: -12 })],
        out: 'whip' },
      { type: 'phone', beats: 9, screens: [{ at: 0, still: 'm_06' }, { at: 1.6, clip: 'pdf', from: .3 }],
        cam: [{ t: 0, yaw: 16, pitch: 4, dist: 5.1, y: 340, roll: -6 }, { t: 'end', yaw: 4, pitch: 2, dist: 4.8, y: 330, roll: -2, e: 'sine' }],
        phone: [{ t: 0, ry: -16 }, { t: 'end', ry: -6, e: 'sine' }],
        highlight: [{ at: .3, until: 1.45, rect: WA_M06, style: 'ring', color: GREEN }],
        text: [{ kind: 'rise', text: 'Teklif *PDF* olsun,\nWhatsApp’tan gitsin.', x: 84, y: 200, size: 82, at: .1, stagger: .05 }],
        chips: [
          { at: 2.3, text: 'PDF teklif', icon: 'pdf', color: '#4F46E5', anchor: [300, 520], off: [-.16, .05], dz: .22 },
          { at: 2.8, text: 'WhatsApp', icon: 'chat', color: GREEN, anchor: [880, 760], off: [.15, 0], dz: .22 },
        ],
        out: 'flash' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'midnight' },
    ],
  };

  // R03 — Yarış: "ÖNCE" dev çerçeve yazı, dutch açılar, sert whip'ler, amber tipografi kartı.
  R.r03 = {
    music: 'disco', world: 'indigo', finish: 'titanium',
    scenes: [
      { type: 'phone', beats: 8, screen: { clip: 'zip', from: .5 }, shake: .9,
        cam: [{ t: 0, yaw: -18, pitch: 5, dist: 5.3, y: 370, roll: 8 }, { t: 'end', yaw: -6, pitch: 2, dist: 4.7, y: 350, roll: 3, e: 'sine' }],
        phone: [{ t: 0, ry: 18, rz: -2 }, { t: 'end', ry: 6, rz: 0, e: 'sine' }],
        text: [
          { kind: 'track', style: 'giant outline deco', layer: 'back', text: 'ÖNCE', y: 560, size: 330, align: 'center', at: 0, pre: .8, ls0: .3 },
          { kind: 'rise', text: 'Müşterin teklifi\n*rakibinden önce* alsın.', x: 84, y: 196, size: 84, pre: .7, stagger: .05 },
        ],
        chips: [{ at: .7, out: 2.4, text: '350 × 260 cm', icon: 'ruler', color: '#F5B544', anchor: [880, 700], off: [.12, .04], dz: .2 }],
        highlight: [{ at: 2.6, rect: SATIS, style: 'spot' }],
        pop: [price(2.75, { y: 1310, w: 880, rx: 6, ry: 12 })],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { clip: 'pdf', from: .3 }, shake: .9,
        cam: [{ t: 0, yaw: 18, pitch: 4, dist: 5.2, y: 360, roll: -7 }, { t: 'end', yaw: 6, pitch: 2, dist: 4.8, y: 350, roll: -3, e: 'sine' }],
        phone: [{ t: 0, ry: -18 }, { t: 'end', ry: -6, e: 'sine' }],
        text: [{ kind: 'rise', text: 'PDF’i *hemen*\nWhatsApp’la.', x: 84, y: 200, size: 96, at: .1, stagger: .05 }],
        highlight: [{ at: 2.2, rect: WA_PDF, style: 'ring', color: GREEN }],
        chips: [{ at: 2.6, text: 'Gönderildi', icon: 'send', color: GREEN, anchor: [585, 700], off: [0, .14], dz: .22, light: true }],
        out: 'whip' },
      { type: 'type', beats: 6, world: 'amber',
        text: [
          { kind: 'weight', text: 'İlk teklif', y: 600, size: 150, align: 'center', at: 0, pre: .3 },
          { kind: 'rise', text: '*senden* gitsin.', y: 770, size: 150, align: 'center', at: .35, stagger: .08 },
        ],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'midnight', out: 'flash' },
      { type: 'outro', beats: 4, world: 'amber' },
    ],
  };

  // R04 — Önce/Sonra: grafit "Excel" kartı (formül + #DEĞER! damgası) → nane dünyada uygulama.
  R.r04 = {
    music: 'sunny_pop', world: 'mint', finish: 'silver',
    scenes: [
      { type: 'type', beats: 6, world: 'graphite',
        text: [
          { kind: 'fade', style: 'label', text: 'Önce', x: 84, y: 230, at: 0, pre: .6 },
          { kind: 'rise', text: 'Excel’le teklif\nyazmayı *bırak.*', x: 84, y: 292, size: 112, pre: .7, stagger: .06 },
          { kind: 'type', style: 'mono', text: '=ÇARPIM(B2;C2;1,35)', x: 84, y: 690, size: 64, at: .45, dur: 1.0, color: '#9CA3AF' },
          { kind: 'type', style: 'mono', text: '=DÜŞEYARA(A2;Fiyat!A:C;3)', x: 84, y: 790, size: 56, at: 1.05, dur: .9, color: '#9CA3AF' },
          { kind: 'stamp', text: '#DEĞER!', x: 84, y: 940, size: 200, at: 2.05, rot: -6, from: 2.0, color: '#F0617A' },
        ],
        out: 'whip' },
      { type: 'phone', beats: 10, screen: { clip: 'zip', from: .6 },
        cam: [{ t: 0, yaw: 0, pitch: 0, dist: 6.0, y: 340 }, { t: 2.3, yaw: -4, pitch: 2, dist: 5.1, y: 340, e: 'sine' }, { t: 2.7, yaw: -2, pitch: 1, dist: 4.6, y: 310, e: 'out' }, { t: 'end', yaw: 4, pitch: 1, dist: 4.5, y: 310, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 'end', ry: -8, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Sonra', x: 84, y: 196, at: .05 },
          { kind: 'rise', text: 'Ölçüyü gir.\n*Fiyat hazır.*', x: 84, y: 254, size: 104, at: .1, stagger: .06 },
        ],
        chips: [{ at: .8, out: 2.3, text: 'EN 350 · BOY 260', icon: 'ruler', color: '#0B8F63', anchor: [880, 700], off: [.08, .05], dz: .2, light: true }],
        highlight: [{ at: 2.55, rect: SATIS, style: 'spot' }],
        pop: [price(2.75, { y: 1300, w: 900, rx: 8, ry: -10 })],
        out: 'whip' },
      { type: 'phone', beats: 7, screen: { still: 'm_06' },
        cam: [{ t: 0, yaw: 10, pitch: 22, dist: 5.3, y: 340, roll: -4 }, { t: 'end', yaw: -4, pitch: 12, dist: 4.9, y: 330, roll: -1, e: 'sine' }],
        phone: [{ t: 0, ry: -10, rx: -4 }, { t: 'end', ry: 2, rx: -2, e: 'sine' }],
        text: [{ kind: 'blur', text: 'KDV, toplam, PDF:\n*hepsi hazır.*', x: 84, y: 200, size: 90, at: .1, stagger: .05 }],
        pop: [{ at: .5, rect: TOPLAM_BLOK, style: 'crop', hole: false, to: { y: 1220, w: 900, rx: 6, ry: 10 } }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'mint' },
    ],
  };

  // R05 — Yan yerleşim: yazı solda sütun, telefon sağda; ardından m_06 patlatılmış görünüm (kalemler/toplam/butonlar). Orman dünyası.
  R.r05 = {
    music: 'stomp_folk', world: 'forest', finish: 'graphite',
    scenes: [
      { type: 'phone', beats: 11, screen: { clip: 'zip', from: .4 },
        cam: [{ t: 0, yaw: -26, pitch: 6, dist: 5.0, x: 275, y: 170 }, { t: 'end', yaw: -12, pitch: 2, dist: 4.6, x: 265, y: 170, e: 'sine' }],
        phone: [{ t: 0, ry: 20 }, { t: 'end', ry: 10, e: 'sine' }],
        text: [
          { kind: 'weight', text: 'Perdeci\nmisin?', x: 56, y: 300, size: 124, at: 0, pre: .8 },
          { kind: 'rise', text: 'Bunu\nizlemeden\nteklif\n*yazma.*', x: 58, y: 640, size: 100, at: .9, stagger: .06 },
        ],
        highlight: [{ at: 2.75, rect: SATIS, style: 'spot' }],
        pop: [price(2.95, { x: -110, y: 1330, w: 780, rx: 6, ry: 14 })],
        out: 'whip' },
      { type: 'phone', beats: 9, screen: { still: 'm_06' },
        cam: [{ t: 0, yaw: 0, pitch: 4, dist: 5.4, y: 330 }, { t: 1.6, yaw: 0, pitch: 8, dist: 5.0, x: 150, y: 220, e: 'inOut' }, { t: 'end', yaw: 5, pitch: 9, dist: 4.75, x: 160, y: 200, e: 'sine' }],
        phone: [{ t: 0, rx: -6, ry: -14 }, { t: 1.5, rx: -40, ry: -6, rz: 20, e: 'inOut' }, { t: 'end', rx: -42, ry: -2, rz: 24, e: 'sine' }],
        float: false,
        explode: { at: .35, dur: 1.3, dim: .6, slices: [
          { rect: [0, 0, 1170, 190], z: .3 },
          { rect: [40, 800, 1095, 410], z: .24, dx: .05 },
          { rect: [68, 1503, 1034, 138], z: .44, dx: -.08, grow: .3, label: 'Genel toplam', labelAt: 'top' },
          { rect: [30, 2052, 1110, 165], z: .2, dx: .04, label: 'PDF · WhatsApp', labelAt: 'left' },
          { rect: [36, 2330, 1098, 172], z: .07 },
        ] },
        text: [
          { kind: 'fade', style: 'label', text: 'Tek ekranda', x: 84, y: 196, at: .05, pre: .4 },
          { kind: 'rise', text: 'Kalemler, toplam,\n[PDF.] *Hepsi hazır.*', x: 84, y: 258, size: 82, at: .1, stagger: .05 },
        ],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'forest', out: 'flash' },
      { type: 'outro', beats: 4, world: 'midnight' },
    ],
  };

  // R06 — Dev "?" arka planda, nane dünya, düz önden itme kamerası; EN/BOY çipleri; çizim kartı 3B'de ekrandan çıkar.
  R.r06 = {
    music: 'lofi_happy', world: 'mint', finish: 'titanium',
    scenes: [
      { type: 'phone', beats: 10, screen: { clip: 'zip', from: 0 },
        cam: [{ t: 0, yaw: 0, pitch: 2, dist: 5.8, y: 370 }, { t: 3.2, yaw: 0, pitch: 1, dist: 5.0, y: 360, e: 'sine' }, { t: 3.5, yaw: -2, pitch: 1, dist: 4.55, y: 330, e: 'out' }, { t: 'end', yaw: -6, pitch: 1, dist: 4.45, y: 330, e: 'sine' }],
        phone: [{ t: 0, ry: -6 }, { t: 'end', ry: 6, e: 'sine' }],
        text: [
          { kind: 'blur', style: 'giant deco', layer: 'back', text: '*?*', x: 560, y: 300, size: 900, at: 0, pre: 1, color: 'rgba(11,143,99,.22)' },
          { kind: 'rise', text: 'Zip perde\nfiyatı mı *soruldu?*', x: 84, y: 196, size: 100, pre: .7, stagger: .06 },
        ],
        chips: [
          { at: .9, out: 3.0, text: 'EN 350 cm', icon: 'ruler', color: '#0B8F63', anchor: [300, 760], off: [-.17, .04], dz: .2, light: true },
          { at: 1.6, out: 3.0, text: 'BOY 260 cm', icon: 'ruler', color: '#0B8F63', anchor: [880, 760], off: [.17, .04], dz: .2, light: true },
        ],
        highlight: [{ at: 3.2, rect: SATIS, style: 'spot' }],
        pop: [price(3.4, { y: 1290, w: 900, rx: 8, ry: -10 })],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { still: 'm_10' },
        cam: [{ t: 0, yaw: 16, pitch: 4, dist: 5.0, y: 420 }, { t: 'end', yaw: 4, pitch: 2, dist: 4.8, y: 420, e: 'sine' }],
        phone: [{ t: 0, ry: -16 }, { t: 'end', ry: -6, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Ölçülü çizimiyle\n*teklife ekle.*', x: 84, y: 200, size: 88, at: .1, stagger: .05 }],
        pop: [{ at: .5, rect: [62, 312, 1046, 896], style: 'crop', hole: false, to: { y: 900, w: 780, rx: 4, ry: -14 }, out: 2.6 }],
        highlight: [{ at: 2.7, rect: [110, 1990, 950, 136], style: 'ring', color: '#0B8F63' }],
        chips: [{ at: 3.0, text: 'Teklife ekle', icon: 'check', color: '#0B8F63', anchor: [585, 1200], off: [0, .1], dz: .22, light: true }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'dusk', out: 'flash' },
      { type: 'outro', beats: 4, world: 'mint' },
    ],
  };

  // R07 — Gece → gündüz: gece yarısı mavisinde akan saatler, iris ile gün ışığına (paper), sahada alçak açı.
  R.r07 = {
    music: 'sunny_pop', world: 'paper', finish: 'silver',
    scenes: [
      { type: 'type', beats: 6, world: 'midnight',
        text: [
          { kind: 'cycle', layer: 'back', style: 'giant num', words: ['18:30', '19:45', '21:10', '22:40'], period: .62, y: 470, size: 330, align: 'center', at: 0, pre: 1, cycleColor: '#8B87FF' },
          { kind: 'fade', style: 'label', text: 'Ofis · akşam', y: 380, align: 'center', at: 0, pre: .6 },
          { kind: 'rise', text: 'Akşam ofiste\nteklif yazmaya *son.*', y: 900, size: 108, align: 'center', at: 0, pre: .7, stagger: .06 },
          { kind: 'fade', style: 'body', text: 'Ölçü sahada, teklif de sahada.', y: 1200, size: 42, align: 'center', at: 1.5 },
        ],
        out: 'iris' },
      { type: 'phone', beats: 10, screen: { clip: 'zip', from: .4 },
        cam: [{ t: 0, yaw: 18, pitch: -14, dist: 5.2, y: 370 }, { t: 2.4, yaw: 8, pitch: -8, dist: 4.9, y: 350, e: 'sine' }, { t: 2.8, yaw: 2, pitch: -4, dist: 4.55, y: 330, e: 'out' }, { t: 'end', yaw: -4, pitch: -3, dist: 4.45, y: 330, e: 'sine' }],
        phone: [{ t: 0, ry: -16 }, { t: 'end', ry: -4, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Sahada · müşterinin yanında', x: 84, y: 196, at: .2 },
          { kind: 'rise', text: 'Ölçüyü al,\n*fiyatı orada ver.*', x: 84, y: 254, size: 96, at: .3, stagger: .05 },
        ],
        chips: [{ at: .9, out: 2.4, text: '350 × 260 cm', icon: 'ruler', color: '#4F46E5', anchor: [880, 700], off: [.1, .04], dz: .2, light: true }],
        highlight: [{ at: 2.65, rect: SATIS, style: 'spot' }],
        pop: [price(2.85, { y: 1300, w: 900, rx: 8, ry: 10 })],
        out: 'whip' },
      { type: 'phone', beats: 6, world: 'mint', screen: { clip: 'pdf', from: .2 }, cam: 'drift',
        text: [{ kind: 'blur', text: 'PDF’i *kapıda* gönder.', x: 84, y: 210, size: 84, at: .1, stagger: .05 }],
        chips: [{ at: 1.3, text: 'Teklif hazır', icon: 'check', color: '#0B8F63', anchor: [300, 520], off: [-.18, .06], dz: .22, light: true }],
        out: 'push' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'paper' },
    ],
  };

  // R08 — POV el kamerası: telefon kadrajı doldurur, alttan kesik, güçlü sarsıntı; gün ışığı (paper).
  R.r08 = {
    music: 'tropical', world: 'paper', finish: 'graphite',
    scenes: [
      { type: 'phone', beats: 12, screen: { clip: 'zip', from: 0 }, shake: 1.6,
        cam: [{ t: 0, yaw: -6, pitch: -8, dist: 4.2, y: 430, roll: -5 }, { t: 1.6, yaw: -3, pitch: -6, dist: 4.05, y: 420, roll: -3 }, { t: 3.3, yaw: 0, pitch: -4, dist: 3.95, y: 410, roll: -2 }, { t: 'end', yaw: 3, pitch: -3, dist: 3.85, y: 410, roll: -1, e: 'sine' }],
        phone: [{ t: 0, rx: 6, ry: 4 }, { t: 'end', rx: 3, ry: -2, e: 'sine' }],
        text: [
          { kind: 'stamp', text: 'POV:', x: 84, y: 196, size: 96, at: 0, pre: 1, rot: -4, color: '#F0617A' },
          { kind: 'rise', text: 'Müşterinin\n*kapısındasın.*', x: 84, y: 306, size: 112, pre: .7, stagger: .06 },
        ],
        chips: [{ at: .8, out: 2.7, text: 'Ölçü: 350 × 260', icon: 'ruler', color: '#4F46E5', anchor: [880, 640], off: [.06, .05], dz: .2, light: true }],
        highlight: [{ at: 3.2, rect: SATIS, style: 'spot' }],
        pop: [price(3.4, { y: 1250, w: 880, rx: 6, ry: 8 })],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { clip: 'pdf', from: .2 }, shake: 1.4,
        cam: [{ t: 0, yaw: 8, pitch: -6, dist: 4.4, y: 420, roll: 4 }, { t: 'end', yaw: 2, pitch: -3, dist: 4.2, y: 400, roll: 1, e: 'sine' }],
        phone: [{ t: 0, ry: -10 }, { t: 'end', ry: -4, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Kapıdan çıkmadan\n*teklif müşteride.*', x: 84, y: 200, size: 88, at: .2, stagger: .05 }],
        chips: [{ at: 2.4, text: 'WhatsApp’la gönder', icon: 'send', color: GREEN, anchor: [585, 300], off: [0, .14], dz: .22, light: true }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'graphite', out: 'flash' },
      { type: 'outro', beats: 4, world: 'paper' },
    ],
  };

  // R09 — Pergolacılar: katalog (tepeden kamera) → AI kalemi yazar → kalem fiyatıyla teklifte. Orman dünyası.
  R.r09 = {
    music: 'lofi_happy', world: 'forest', finish: 'titanium',
    scenes: [
      { type: 'phone', beats: 8, screen: { still: 'm_04' },
        cam: [{ t: 0, yaw: -8, pitch: 24, dist: 5.4, y: 390, roll: 4 }, { t: 'end', yaw: 4, pitch: 12, dist: 5.0, y: 370, roll: 1, e: 'sine' }],
        phone: [{ t: 0, rx: -4, ry: 8 }, { t: 'end', rx: -2, ry: -2, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Pergola · bioklimatik · rolling roof', x: 84, y: 196, at: 0, pre: .6 },
          { kind: 'rise', text: 'Pergolacılar,\n*bu sizin için.*', x: 84, y: 254, size: 104, pre: .7, stagger: .06 },
        ],
        highlight: [{ at: .6, rect: KAT.pergola, style: 'ring', color: '#34D399' }, { at: 1.1, rect: KAT.roof, style: 'ring', color: '#34D399' }],
        pop: [{ at: 1.7, rect: [40, 1030, 1100, 150], style: 'crop', hole: false, to: { y: 1250, w: 940, rx: 4, ry: -8 } }],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { clip: 'ai', from: 1.0 },
        cam: [{ t: 0, yaw: 24, pitch: -4, dist: 5.0, y: 350 }, { t: 'end', yaw: 10, pitch: -1, dist: 4.7, y: 340, e: 'sine' }],
        phone: [{ t: 0, ry: -18 }, { t: 'end', ry: -8, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Kalem metnini\n[AI] *hazırlasın.*', x: 84, y: 200, size: 92, at: .1, stagger: .05 }],
        chips: [{ at: 2.6, text: 'Katalog önerisi', icon: 'ai', color: '#0F9F6E', anchor: [300, 1250], off: [-.18, 0], dz: .22, light: true }],
        out: 'whip' },
      { type: 'phone', beats: 7, screen: { still: 'm_05' },
        cam: [{ t: 0, yaw: -16, pitch: -10, dist: 5.0, y: 380, roll: 5 }, { t: 'end', yaw: -6, pitch: -4, dist: 4.8, y: 370, roll: 2, e: 'sine' }],
        phone: [{ t: 0, ry: 14 }, { t: 'end', ry: 6, e: 'sine' }],
        text: [{ kind: 'blur', text: 'Fiyatıyla birlikte\n*teklifte.*', x: 84, y: 200, size: 92, at: .1, stagger: .05 }],
        pop: [{ at: .5, rect: [40, 740, 1100, 210], style: 'crop', hole: false, to: { y: 1240, w: 940, rx: 6, ry: 10 } }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'midnight', out: 'flash' },
      { type: 'outro', beats: 4, world: 'forest' },
    ],
  };

  // R10 — Cam balkon: gece yarısı + gümüş telefon, dev "CAM" çerçeve yazı, yörünge; m² fiyat kartı; ekrana dalış → PDF.
  R.r10 = {
    music: 'afro_house', world: 'midnight', finish: 'silver',
    scenes: [
      { type: 'phone', beats: 8, screen: { still: 'm_04' },
        cam: [{ t: 0, yaw: -34, pitch: 6, dist: 5.3, y: 380 }, { t: 'end', yaw: -8, pitch: 3, dist: 4.9, y: 360, e: 'sine' }],
        phone: [{ t: 0, ry: 22 }, { t: 'end', ry: 8, e: 'sine' }],
        text: [
          { kind: 'track', style: 'giant outline deco', layer: 'back', text: 'CAM', y: 470, size: 420, align: 'center', at: 0, pre: .8, ls0: .25 },
          { kind: 'rise', text: 'Cam balkoncu\n*musun?*', x: 84, y: 196, size: 120, pre: .7, stagger: .06 },
        ],
        highlight: [{ at: .8, rect: KAT.giyotin, style: 'ring', color: '#8B87FF' }, { at: 1.3, rect: KAT.isicam, style: 'ring', color: '#8B87FF' }],
        chips: [{ at: 1.8, text: 'Katalogda hazır', icon: 'check', color: '#34D399', anchor: [585, 900], off: [0, .1], dz: .22, light: true }],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { still: 'm_05' },
        cam: [{ t: 0, yaw: 16, pitch: -10, dist: 5.0, y: 380, roll: -4 }, { t: 3.2, yaw: 4, pitch: -4, dist: 4.7, y: 360, roll: -1, e: 'sine' }, { t: 'end', yaw: 0, pitch: 0, dist: 1.5, y: 0, roll: 0, e: 'inExpo' }],
        phone: [{ t: 0, ry: -14 }, { t: 3.2, ry: -6, e: 'sine' }, { t: 'end', ry: 0, rx: 0 }],
        text: [{ kind: 'rise', text: 'm²’yi gir,\n*fiyat hesaplansın.*', x: 84, y: 200, size: 88, at: .1, stagger: .05, out: 3.1 }],
        pop: [{ at: .6, out: 3.0, rect: [40, 1680, 1090, 340], style: 'dark', label: 'Giyotin cam', value: 160200, decimals: 2, prefix: '₺ ', h: 200,
          to: { y: 1250, w: 940, rx: 6, ry: 10 }, counter: { delay: .3, dur: 1.0 } }],
        out: 'zoom' },
      { type: 'phone', beats: 7, screen: { clip: 'pdf', from: .3 },
        cam: [{ t: 0, yaw: 0, pitch: 0, dist: 1.5, y: 0 }, { t: 1.2, yaw: -14, pitch: 4, dist: 4.9, y: 340, e: 'quint' }, { t: 'end', yaw: -8, pitch: 2, dist: 4.7, y: 340, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 1.2, ry: 14, e: 'quint' }, { t: 'end', ry: 8, e: 'sine' }],
        text: [{ kind: 'blur', text: 'Teklif PDF’i\n*tek dokunuşta.*', x: 84, y: 200, size: 88, at: 1.0, stagger: .05 }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'dusk', out: 'flash' },
      { type: 'outro', beats: 4, world: 'midnight' },
    ],
  };

  // R11 — "Word" şakası: grafit kartta daktiloyla teklif_son_SON2.docx → kağıt dünyada PDF şablonları (Klasik ↔ Modern), kamera şablonla birlikte döner.
  R.r11 = {
    music: 'tropical', world: 'paper', finish: 'titanium',
    scenes: [
      { type: 'type', beats: 6, world: 'graphite',
        text: [
          { kind: 'rise', text: 'Teklifin hâlâ\n*Word’den* mi\nçıkıyor?', x: 84, y: 240, size: 128, pre: .7, stagger: .06 },
          { kind: 'type', style: 'mono', text: 'teklif_son.docx', x: 84, y: 800, size: 60, at: .4, dur: .7, color: '#9CA3AF' },
          { kind: 'type', style: 'mono', text: 'teklif_son_SON2.docx', x: 84, y: 900, size: 60, at: 1.1, dur: .8, color: '#C7CBD3' },
          { kind: 'type', style: 'mono', text: 'teklif_SON3_kesin.docx', x: 84, y: 1000, size: 60, at: 1.9, dur: .8, color: '#F5B544' },
          { kind: 'stamp', text: 'Yeter.', x: 84, y: 1160, size: 190, at: 2.7, rot: -6, from: 2.0, color: '#F0617A' },
        ],
        out: 'whipUp' },
      { type: 'phone', beats: 12, screens: [{ at: 0, ...M07 }, { at: 3.0, ...M07B }],
        cam: [{ t: 0, yaw: -22, pitch: 4, dist: 5.0, y: 350 }, { t: 2.8, yaw: -8, pitch: 2, dist: 4.8, y: 350, e: 'sine' }, { t: 3.25, yaw: 10, pitch: 2, dist: 4.8, y: 350, e: 'out' }, { t: 'end', yaw: 20, pitch: 3, dist: 5.0, y: 350, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 2.8, ry: 6, e: 'sine' }, { t: 3.25, ry: -8, e: 'out' }, { t: 'end', ry: -16, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'PDF şablonları', x: 84, y: 196, at: 0 },
          { kind: 'rise', text: 'Klasik mi, Modern mi?\n*Tek dokunuş.*', x: 84, y: 254, size: 76, at: .1, stagger: .05 },
        ],
        highlight: [{ at: .6, until: 2.9, rect: [35, 190, 255, 95], style: 'ring' }, { at: 3.2, rect: [315, 190, 250, 95], style: 'ring' }],
        chips: [
          { at: .8, out: 2.9, text: 'Klasik', icon: 'pdf', color: '#4F46E5', anchor: [160, 300], off: [-.06, .08], dz: .2, light: true },
          { at: 3.3, text: 'Modern', icon: 'pdf', color: '#0F766E', anchor: [440, 300], off: [.04, .08], dz: .2, light: true },
        ],
        out: 'flash' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'paper' },
    ],
  };

  // R12 — WhatsApp yeşili: buton ekrandan kameraya uçar, sonra butona dalış (zoom-through) → PDF.
  R.r12 = {
    music: 'ukulele', world: 'mint', finish: 'graphite',
    scenes: [
      { type: 'phone', beats: 9, screen: { still: 'm_06' },
        cam: [{ t: 0, yaw: 14, pitch: -6, dist: 5.0, y: 390 }, { t: 3.3, yaw: 4, pitch: -2, dist: 4.6, y: 370, e: 'sine' }, { t: 'end', yaw: 0, pitch: 0, dist: 1.5, y: 0, e: 'inExpo' }],
        phone: [{ t: 0, ry: -14 }, { t: 3.3, ry: -4, e: 'sine' }, { t: 'end', ry: 0 }],
        text: [{ kind: 'rise', text: 'Teklifi WhatsApp’tan\n*PDF olarak* gönder.', x: 84, y: 196, size: 80, pre: .7, stagger: .05, out: 3.6 }],
        highlight: [{ at: .4, rect: WA_M06, style: 'ring', color: GREEN }],
        pop: [{ at: 1.2, out: 3.5, rect: WA_M06, style: 'crop', hole: false, to: { y: 1290, w: 660, rx: 4, ry: -12 } }],
        out: 'zoom' },
      { type: 'phone', beats: 9, screen: { clip: 'pdf', from: .25 },
        cam: [{ t: 0, yaw: 0, pitch: 0, dist: 1.5, y: 0 }, { t: 1.2, yaw: 14, pitch: 4, dist: 4.9, y: 340, e: 'quint' }, { t: 'end', yaw: 6, pitch: 2, dist: 4.7, y: 340, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 1.2, ry: -14, e: 'quint' }, { t: 'end', ry: -6, e: 'sine' }],
        text: [{ kind: 'blur', text: 'PDF hazır,\n*müşterin telefonunda.*', x: 84, y: 200, size: 84, at: 1.0, stagger: .05 }],
        highlight: [{ at: 2.5, rect: WA_PDF, style: 'ring', color: GREEN }],
        chips: [
          { at: 1.6, text: 'PDF teklif', icon: 'pdf', color: '#4F46E5', anchor: [300, 520], off: [-.18, .08], dz: .22, light: true },
          { at: 2.9, text: 'WhatsApp', icon: 'send', color: GREEN, anchor: [880, 800], off: [.15, 0], dz: .22, light: true },
        ],
        out: 'whip' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'forest', out: 'flash' },
      { type: 'outro', beats: 4, world: 'mint' },
    ],
  };

  // R13 — AI: sol sütunda kinetik yazı değişimi ("sen yazma" → "AI yazsın"), sonra AI ekranının katmanlara ayrılması.
  R.r13 = {
    music: 'afro_house', world: 'midnight', finish: 'indigo',
    scenes: [
      { type: 'phone', beats: 10, screen: { clip: 'ai', from: .7 },
        cam: [{ t: 0, yaw: -24, pitch: 4, dist: 4.8, x: 270, y: 170 }, { t: 'end', yaw: -12, pitch: 2, dist: 4.5, x: 260, y: 170, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 'end', ry: 8, e: 'sine' }],
        text: [
          { kind: 'rise', text: 'Teklif\nmetnini\n*sen*\n*yazma.*', x: 58, y: 300, size: 126, pre: .7, stagger: .06, out: 2.1 },
          { kind: 'rise', text: '[AI]\n*yazsın.*', x: 58, y: 330, size: 146, at: 2.55, stagger: .08 },
        ],
        chips: [{ at: 2.8, text: 'Cevap hazır', icon: 'ai', color: '#F0617A', anchor: [585, 1320], off: [-.12, 0], dz: .24, light: true }],
        out: 'iris' },
      { type: 'phone', beats: 10, world: 'indigo', screen: { still: 'm_16' },
        cam: [{ t: 0, yaw: 0, pitch: 4, dist: 5.4, y: 330 }, { t: 1.6, yaw: 0, pitch: 8, dist: 5.0, x: 150, y: 220, e: 'inOut' }, { t: 'end', yaw: 5, pitch: 9, dist: 4.75, x: 160, y: 200, e: 'sine' }],
        phone: [{ t: 0, rx: -8, ry: -12 }, { t: 1.5, rx: -38, ry: -6, rz: 20, e: 'inOut' }, { t: 'end', rx: -40, ry: -2, rz: 24, e: 'sine' }],
        float: false,
        explode: { at: .35, dur: 1.3, dim: .6, slices: [
          { rect: [0, 0, 1170, 190], z: .3 },
          { rect: [236, 222, 924, 196], z: .4, dx: .06, label: 'Sen sor', labelAt: 'top' },
          { rect: [36, 466, 910, 690], z: .24, dx: -.05, label: 'Teklif metni', labelAt: 'left' },
          { rect: [36, 1200, 1100, 710], z: .32, dx: .05, label: 'Katalog önerisi', labelAt: 'left' },
          { rect: [0, 2330, 1170, 200], z: .07 },
        ] },
        text: [
          { kind: 'fade', style: 'label', text: 'Yapay zekâ asistanı', x: 84, y: 196, at: .05, pre: .4 },
          { kind: 'rise', text: 'Sen sor.\n*Metin hazır.*', x: 84, y: 258, size: 92, at: .1, stagger: .05 },
        ],
        out: 'flash' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'dusk', out: 'flash' },
      { type: 'outro', beats: 4, world: 'midnight' },
    ],
  };

  // R14 — Katalog: amber dünya + indigo telefon, tepeden kamera; satırlar sırayla yanar, Zip Perde satırı kameraya uçar; KOD CTA.
  R.r14 = {
    music: 'future_bass', world: 'amber', finish: 'indigo',
    scenes: [
      { type: 'phone', beats: 9, screen: { still: 'm_18' },
        cam: [{ t: 0, yaw: 0, pitch: 30, dist: 5.6, y: 430, roll: -6 }, { t: 'end', yaw: -6, pitch: 18, dist: 5.1, y: 410, roll: -2, e: 'sine' }],
        phone: [{ t: 0, rx: -6, ry: 6 }, { t: 'end', rx: -2, ry: 0, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Aynı ürünü\nher teklifte *baştan*\nyazma.', x: 84, y: 196, size: 92, pre: .7, stagger: .05 }],
        highlight: [{ at: .7, rect: [30, 1925, 1110, 190], style: 'ring', color: '#2F27C2' }, { at: 1.1, rect: [30, 2155, 1110, 170], style: 'ring', color: '#2F27C2' }],
        chips: [{ at: 1.6, text: 'Bir kez tanımla', icon: 'check', color: '#4F46E5', anchor: [585, 1000], off: [0, .1], dz: .22, light: true }],
        out: 'whip' },
      { type: 'phone', beats: 9, screen: { still: 'm_04' },
        cam: [{ t: 0, yaw: 20, pitch: -6, dist: 5.0, y: 420 }, { t: 'end', yaw: 8, pitch: -2, dist: 4.7, y: 400, e: 'sine' }],
        phone: [{ t: 0, ry: -18 }, { t: 'end', ry: -8, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Katalogdan seç,\n*teklife ekle.*', x: 84, y: 200, size: 92, at: .1, stagger: .05 }],
        highlight: [{ at: .4, until: 1.2, rect: KAT.pergola, style: 'ring', color: '#2F27C2' }, { at: 1.1, until: 1.9, rect: KAT.giyotin, style: 'ring', color: '#2F27C2' }],
        pop: [{ at: 2.0, rect: KAT.zip, style: 'crop', hole: false, to: { y: 1280, w: 920, rx: 4, ry: -10 } }],
        out: 'whipUp' },
      { type: 'phone', beats: 7, screen: { still: 'm_05' }, cam: 'dutch',
        text: [{ kind: 'snap', text: 'Kalemler *hazır.*', x: 84, y: 210, size: 104, at: .15 }],
        highlight: [{ at: .4, rect: [40, 730, 1100, 230], style: 'ring', color: '#2F27C2' }, { at: .8, rect: [40, 1000, 1100, 100], style: 'ring', color: '#2F27C2' }],
        chips: [{ at: .9, text: '2 kalem eklendi', icon: 'check', color: '#4F46E5', anchor: [400, 640], off: [-.1, .08], dz: .22, light: true }],
        out: 'flash' },
      { type: 'cta', mode: 'code', beats: 7, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'amber' },
    ],
  };

  // R15 — Panel: kağıt dünyada kayan panel, "Teklif durumları" kartı kameraya uçar; indigo dutch açıda durum çipleri.
  R.r15 = {
    music: 'ukulele', world: 'paper', finish: 'silver',
    scenes: [
      { type: 'phone', beats: 9, screen: { clip: 'panel', from: 0 },
        cam: [{ t: 0, yaw: -16, pitch: 6, dist: 5.2, y: 390 }, { t: 'end', yaw: -4, pitch: 2, dist: 4.8, y: 370, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 'end', ry: 4, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Hangi teklif bekliyor,\nhangisi *onaylandı?*', x: 84, y: 196, size: 76, pre: .7, stagger: .05 }],
        pop: [{ at: 2.6, rect: [30, 960, 1100, 550], style: 'crop', hole: false, to: { y: 1150, w: 840, rx: 4, ry: 10 } }],
        out: 'whip' },
      { type: 'phone', beats: 9, world: 'indigo', screen: { still: 'm_02' },
        cam: [{ t: 0, yaw: 14, pitch: 4, dist: 5.0, y: 280, roll: -6 }, { t: 'end', yaw: 4, pitch: 2, dist: 4.8, y: 270, roll: -2, e: 'sine' }],
        phone: [{ t: 0, ry: -14 }, { t: 'end', ry: -4, e: 'sine' }],
        text: [
          { kind: 'cycle', words: ['Beklemede', 'Görüldü', 'Onaylandı'], period: .8, before: '', x: 84, y: 200, size: 96, at: .1, cycleColor: '#FFD27A' },
          { kind: 'rise', text: 'Hepsi *tek ekranda.*', x: 84, y: 320, size: 80, at: .5, stagger: .05 },
        ],
        highlight: [{ at: .3, rect: [40, 1120, 1090, 560], style: 'ring', color: '#FFD27A' }],
        chips: [
          { at: .7, text: 'Beklemede', icon: 'clock', color: '#94A3B8', anchor: [420, 1250], off: [-.2, .02], dz: .22, light: true },
          { at: 1.5, text: 'Onaylandı', icon: 'check', color: '#34D399', anchor: [760, 1440], off: [.16, .02], dz: .22, light: true },
        ],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 7, world: 'midnight', out: 'flash' },
      { type: 'outro', beats: 4, world: 'paper' },
    ],
  };

  // R16 — Kasa: "Gelir. Gider. Kasa." vuruşta damgalar, m_12 üst kartına yakın plan (alt form örtülü), istatistik kartı uçar.
  R.r16 = {
    music: 'disco', world: 'graphite', finish: 'titanium',
    scenes: [
      { type: 'phone', beats: 10, screen: M12,
        cam: [{ t: 0, ty: .4, yaw: -14, pitch: -8, dist: 3.4, y: 330, roll: 4 }, { t: 'end', ty: .4, yaw: 8, pitch: -2, dist: 3.0, y: 330, roll: -2, e: 'sine' }],
        phone: [{ t: 0, ry: 10 }, { t: 'end', ry: -4, e: 'sine' }],
        highlight: [{ at: 0, rect: [30, 228, 1110, 446], style: 'spot' }],
        text: [
          { kind: 'stamp', text: 'Gelir.', x: 84, y: 196, size: 124, at: 0, pre: 1 },
          { kind: 'stamp', text: 'Gider.', x: 84, y: 330, size: 124, at: 'b1' },
          { kind: 'stamp', text: '[Kasa.]', x: 84, y: 464, size: 124, at: 'b2' },
        ],
        pop: [{ at: 2.3, rect: [40, 440, 1090, 190], style: 'crop', hole: false, to: { y: 1360, w: 940, rx: 6, ry: -10 } }],
        out: 'whip' },
      { type: 'phone', beats: 8, screen: { clip: 'zip', from: 1.6 },
        cam: [{ t: 0, yaw: 20, pitch: 6, dist: 5.2, y: 370 }, { t: 'end', yaw: 6, pitch: 2, dist: 4.7, y: 350, e: 'sine' }],
        phone: [{ t: 0, ry: -18 }, { t: 'end', ry: -6, e: 'sine' }],
        text: [{ kind: 'rise', text: 'Teklif de\n*buradan çıkar.*', x: 84, y: 196, size: 100, at: .1, stagger: .05 }],
        highlight: [{ at: 1.55, rect: SATIS, style: 'spot' }],
        pop: [price(1.75, { y: 1300, w: 900, rx: 8, ry: 10 })],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'dusk', out: 'flash' },
      { type: 'outro', beats: 4, world: 'graphite' },
    ],
  };

  // R17 — "Hediye nasıl alınır?": kısa ürün anı → 4 adımlı tipografi kartı → KOD CTA.
  R.r17 = {
    music: 'future_bass', world: 'dusk', finish: 'silver',
    scenes: [
      { type: 'phone', beats: 11, screen: { clip: 'zip', from: .9 }, cam: [{ t: 0, yaw: -20, pitch: -10, dist: 5.4, y: 380 }, { t: 2.2, yaw: -8, pitch: -4, dist: 4.9, y: 360, e: 'sine' }, { t: 2.5, yaw: -2, pitch: -2, dist: 4.5, y: 330, e: 'out' }, { t: 'end', yaw: 4, pitch: -1, dist: 4.45, y: 330, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 'end', ry: 2, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Instagram’a özel', x: 84, y: 196, at: 0, pre: .6 },
          { kind: 'rise', text: 'Hediye\nnasıl *alınır?*', x: 84, y: 252, size: 124, pre: .7, stagger: .06 },
        ],
        chips: [{ at: .3, out: 1.9, text: '350 × 260 cm', icon: 'ruler', color: '#F0617A', anchor: [880, 700], off: [.1, .04], dz: .2 }],
        highlight: [{ at: 2.25, rect: SATIS, style: 'spot' }],
        pop: [price(2.4, { y: 1300, w: 900, rx: 8, ry: 10 })],
        out: 'whipUp' },
      { type: 'type', beats: 11, world: 'indigo',
        burst: [{ at: 3.2, x: 600, y: 1200, n: 110, seed: 4 }],
        text: [
          { kind: 'fade', style: 'label', text: '4 adımda 1 ay Pro', x: 84, y: 200, at: 0, pre: .5 },
          { kind: 'snap', style: 'num', text: '[01]', x: 84, y: 320, size: 112, at: .2 },
          { kind: 'rise', text: 'anindateklif.co/hediye', x: 268, y: 352, size: 62, at: .25 },
          { kind: 'snap', style: 'num', text: '[02]', x: 84, y: 590, size: 112, at: 1.0 },
          { kind: 'rise', text: 'Üye ol.', x: 268, y: 594, size: 108, at: 1.05 },
          { kind: 'snap', style: 'num', text: '[03]', x: 84, y: 860, size: 112, at: 1.8 },
          { kind: 'scramble', style: 'mono', text: 'TEKLIF30', x: 268, y: 862, size: 100, at: 1.85, stagger: .05 },
          { kind: 'fade', style: 'body', text: 'kodu otomatik tanımlanır', x: 272, y: 982, size: 38, at: 2.2 },
          { kind: 'snap', style: 'num', text: '[04]', x: 84, y: 1150, size: 112, at: 2.7 },
          { kind: 'rise', text: '1 ay Pro *senin.*', x: 268, y: 1160, size: 94, at: 2.75 },
        ],
        out: 'flash' },
      { type: 'cta', mode: 'code', beats: 7, world: 'midnight', out: 'flash' },
      { type: 'outro', beats: 4, world: 'dusk' },
    ],
  };

  // R18 — Hesap makinesi: arka planda dev odometre fiyat (telefonun arkasında), telefon sağda; m_06 toplam bloğu, KDV çipi.
  R.r18 = {
    music: 'stomp_folk', world: 'paper', finish: 'black',
    scenes: [
      { type: 'phone', beats: 12, screen: { clip: 'zip', from: 0 },
        cam: [{ t: 0, yaw: -20, pitch: 4, dist: 5.5, x: 230, y: 320 }, { t: 3.0, yaw: -12, pitch: 2, dist: 5.2, x: 230, y: 320, e: 'sine' }, { t: 3.4, yaw: -6, pitch: 1, dist: 4.8, x: 220, y: 300, e: 'out' }, { t: 'end', yaw: -2, pitch: 1, dist: 4.7, x: 220, y: 300, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 'end', ry: 6, e: 'sine' }],
        text: [
          { kind: 'counter', layer: 'back', value: 746.53, prefix: '€', x: 50, y: 560, size: 190, at: 0, pre: 1, run: [3.1, 4.2], color: 'rgba(79,70,229,.9)' },
          { kind: 'rise', text: 'Hesap makinesiyle\nteklif *çıkarma.*', x: 60, y: 196, size: 86, pre: .7, stagger: .05 },
        ],
        highlight: [{ at: 3.2, rect: SATIS, style: 'spot' }],
        pop: [price(3.4, { x: -90, y: 1290, w: 860, rx: 6, ry: 12 })],
        out: 'push' },
      { type: 'phone', beats: 8, world: 'mint', screens: [{ at: 0, still: 'm_06' }, { at: 2.3, clip: 'pdf', from: .3 }],
        cam: [{ t: 0, yaw: -10, pitch: 20, dist: 5.2, y: 360, roll: 4 }, { t: 'end', yaw: 4, pitch: 10, dist: 4.9, y: 350, roll: 1, e: 'sine' }],
        phone: [{ t: 0, ry: 10, rx: -4 }, { t: 'end', ry: -2, rx: -2, e: 'sine' }],
        text: [{ kind: 'rise', text: 'KDV ve genel toplam\n*kendiliğinden.*', x: 84, y: 200, size: 80, at: .1, stagger: .05 }],
        highlight: [{ at: .4, until: 2.2, rect: TOPLAM_BLOK, style: 'ring', color: '#0B8F63' }],
        chips: [{ at: 1.0, out: 2.2, text: 'KDV %20 dahil', icon: 'euro', color: '#0B8F63', anchor: [880, 760], off: [.12, .04], dz: .22, light: true }],
        out: 'flash' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'forest', out: 'flash' },
      { type: 'outro', beats: 4, world: 'paper' },
    ],
  };

  // R19 — POV sohbet: müşterinin mesajı daktiloyla, whipUp ile ürüne; fiyat → ekrana dalış → "Cevabın: PDF teklif."
  R.r19 = {
    music: 'disco', world: 'midnight', finish: 'graphite',
    scenes: [
      { type: 'type', beats: 5,
        text: [
          { kind: 'stamp', text: 'POV:', x: 84, y: 380, size: 150, at: 0, pre: 1, rot: -4, color: '#F0617A' },
          { kind: 'fade', style: 'label', text: 'Müşteriden mesaj geldi', x: 88, y: 580, at: 0, pre: .6 },
          { kind: 'type', text: '350’ye 260 zip perde\nkaça olur?', x: 84, y: 660, size: 88, at: 0, pre: .35, dur: 1.2, box: true },
          { kind: 'fade', style: 'body', text: 'şimdi · okundu', x: 100, y: 960, size: 32, at: 1.5 },
        ],
        out: 'whipUp' },
      { type: 'phone', beats: 11, screen: { clip: 'zip', from: 0 },
        cam: [{ t: 0, yaw: 30, pitch: -10, dist: 5.4, y: 360 }, { t: 3.1, yaw: 10, pitch: -5, dist: 5.0, y: 350, e: 'sine' }, { t: 3.45, yaw: 2, pitch: -2, dist: 4.6, y: 330, e: 'out' }, { t: 5.0, yaw: -2, pitch: -1, dist: 4.5, y: 330, e: 'sine' }, { t: 'end', yaw: 0, pitch: 0, dist: 1.5, y: 0, e: 'inExpo' }],
        phone: [{ t: 0, ry: -22 }, { t: 3.1, ry: -8, e: 'sine' }, { t: 'end', ry: 0, rx: 0 }],
        text: [{ kind: 'rise', text: 'Ölçüleri gir,\n*fiyat anında.*', x: 84, y: 196, size: 96, at: .05, stagger: .05, out: 5.0 }],
        chips: [{ at: .7, out: 2.6, text: '350’ye 260', icon: 'chat', color: '#4F46E5', anchor: [880, 700], off: [.1, .04], dz: .2, light: true }],
        highlight: [{ at: 3.2, rect: SATIS, style: 'spot' }],
        pop: [price(3.4, { y: 1290, w: 900, rx: 8, ry: -10 }, { out: 4.9 })],
        out: 'zoom' },
      { type: 'phone', beats: 7, screen: { clip: 'pdf', from: .2 },
        cam: [{ t: 0, yaw: 0, pitch: 0, dist: 1.5, y: 0 }, { t: 1.2, yaw: 12, pitch: 4, dist: 5.0, y: 380, e: 'quint' }, { t: 'end', yaw: 6, pitch: 2, dist: 4.8, y: 380, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 1.2, ry: -12, e: 'quint' }, { t: 'end', ry: -6, e: 'sine' }],
        text: [
          { kind: 'rise', text: 'Cevabın:', x: 84, y: 196, size: 84, at: .9 },
          { kind: 'stamp', text: '*PDF teklif.*', x: 84, y: 300, size: 150, at: 1.2, rot: -5, color: '#FFD27A' },
        ],
        chips: [{ at: 2.0, text: 'WhatsApp’la gönder', icon: 'send', color: GREEN, anchor: [585, 640], off: [0, .1], dz: .22, light: true }],
        out: 'flash' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'dusk' },
    ],
  };

  // R20 — "Instagram'a özel": hediye önde, konfeti ilk saniyede; sonra 3 hızlı whip montaj (PDF · AI · Panel), her biri farklı yerleşim.
  R.r20 = {
    music: 'sunny_pop', world: 'indigo', finish: 'graphite',
    scenes: [
      { type: 'phone', beats: 9, screen: { clip: 'zip', from: .6 },
        burst: [{ at: .15, x: 540, y: 520, n: 90, power: .9, seed: 7 }],
        cam: [{ t: 0, yaw: -22, pitch: 6, dist: 5.6, y: 400 }, { t: 2.3, yaw: -10, pitch: 3, dist: 5.1, y: 380, e: 'sine' }, { t: 2.65, yaw: -4, pitch: 2, dist: 4.6, y: 350, e: 'out' }, { t: 'end', yaw: 2, pitch: 1, dist: 4.5, y: 350, e: 'sine' }],
        phone: [{ t: 0, ry: 18 }, { t: 'end', ry: 4, e: 'sine' }],
        text: [
          { kind: 'fade', style: 'label', text: 'Instagram’a özel', x: 84, y: 196, at: 0, pre: .6 },
          { kind: 'rise', text: '[1 ay Pro]\n*hediye.*', x: 84, y: 250, size: 140, pre: .7, stagger: .06 },
        ],
        highlight: [{ at: 2.45, rect: SATIS, style: 'spot' }],
        pop: [price(2.6, { y: 1310, w: 900, rx: 8, ry: -10 })],
        out: 'whip' },
      { type: 'phone', beats: 5, world: 'dusk', screen: { clip: 'pdf', from: .35 },
        cam: [{ t: 0, yaw: 18, pitch: 4, dist: 5.4, x: -230, y: 200, roll: -5 }, { t: 'end', yaw: 8, pitch: 2, dist: 5.1, x: -220, y: 200, roll: -2, e: 'sine' }],
        phone: [{ t: 0, ry: -16 }, { t: 'end', ry: -8, e: 'sine' }],
        text: [{ kind: 'stamp', text: 'PDF.', x: 996, y: 420, size: 210, align: 'right', at: .1, rot: 6 }],
        out: 'whip' },
      { type: 'phone', beats: 5, world: 'midnight', screen: { clip: 'ai', from: 2.6 },
        cam: [{ t: 0, yaw: -18, pitch: 4, dist: 5.4, x: 230, y: 200, roll: 5 }, { t: 'end', yaw: -8, pitch: 2, dist: 5.1, x: 220, y: 200, roll: 2, e: 'sine' }],
        phone: [{ t: 0, ry: 16 }, { t: 'end', ry: 8, e: 'sine' }],
        text: [{ kind: 'stamp', text: '[AI.]', x: 70, y: 420, size: 210, at: .1, rot: -6 }],
        out: 'whip' },
      { type: 'phone', beats: 5, world: 'forest', screen: { clip: 'panel', from: .4 },
        cam: [{ t: 0, yaw: 0, pitch: 10, dist: 5.3, y: 380 }, { t: 'end', yaw: -6, pitch: 5, dist: 5.0, y: 370, e: 'sine' }],
        phone: [{ t: 0, ry: 0 }, { t: 'end', ry: 6, e: 'sine' }],
        text: [{ kind: 'stamp', text: 'Panel.', y: 220, size: 200, align: 'center', at: .1, rot: -4 }],
        out: 'iris' },
      { type: 'cta', mode: 'comment', beats: 8, world: 'indigo', out: 'flash' },
      { type: 'outro', beats: 4, world: 'amber' },
    ],
  };
})();

// Yayın meta verisi: gün = ceil(n/2), slot A/B; müzik = plan/music_map.json
window.V3_REEL_META = {
  r01: { title: 'Kronometre', hook: 'Bir zip perde teklifi. Saati başlattık.', day: 1, slot: 'A', theme: 'Hız · ölçü → fiyat → PDF, önde canlı sayaç', music: 'future_bass' },
  r02: { title: 'Yorum yaz, Pro senin', hook: 'Yorum yaz, 1 ay Pro senin.', day: 1, slot: 'B', theme: 'Kampanya · fiyat + PDF + WhatsApp, yorum CTA', music: 'stomp_folk' },
  r03: { title: 'Rakipten önce', hook: 'Müşterin teklifi rakibinden önce alsın.', day: 2, slot: 'A', theme: 'Hız · fiyat → PDF → WhatsApp gönderimi', music: 'disco' },
  r04: { title: 'Excel’i bırak', hook: 'Excel’le teklif yazmayı bırak.', day: 2, slot: 'B', theme: 'Önce/Sonra · formül hatası → ölçü → fiyat → toplam', music: 'sunny_pop' },
  r05: { title: 'Perdeciye', hook: 'Perdeci misin? Bunu izlemeden teklif yazma.', day: 3, slot: 'A', theme: 'Meslek · fiyat + teklif ekranı patlatılmış görünüm', music: 'stomp_folk' },
  r06: { title: 'Zip perde sorusu', hook: 'Zip perde fiyatı mı soruldu?', day: 3, slot: 'B', theme: 'Zip perde · EN/BOY → fiyat → çizim kartı', music: 'lofi_happy' },
  r07: { title: 'Akşam mesaisine son', hook: 'Akşam ofiste teklif yazmaya son.', day: 4, slot: 'A', theme: 'Zaman · gece → gündüz, sahada fiyat + PDF', music: 'sunny_pop' },
  r08: { title: 'POV: kapıdasın', hook: 'POV: Müşterinin kapısındasın.', day: 4, slot: 'B', theme: 'POV el kamerası · ölçü → fiyat → PDF → WhatsApp', music: 'tropical' },
  r09: { title: 'Pergolacılar için', hook: 'Pergolacılar, bu sizin için.', day: 5, slot: 'A', theme: 'Pergola · katalog → AI kalem metni → kalem fiyatı', music: 'lofi_happy' },
  r10: { title: 'Cam balkoncu', hook: 'Cam balkoncu musun?', day: 5, slot: 'B', theme: 'Cam balkon · katalog → m² fiyat → PDF', music: 'afro_house' },
  r11: { title: 'Word’e veda', hook: 'Teklifin hâlâ Word’den mi çıkıyor?', day: 6, slot: 'A', theme: 'PDF şablonları · Klasik ↔ Modern', music: 'tropical' },
  r12: { title: 'WhatsApp’tan PDF', hook: 'Teklifi WhatsApp’tan PDF olarak gönder.', day: 6, slot: 'B', theme: 'Paylaşım · WhatsApp butonu → PDF', music: 'ukulele' },
  r13: { title: 'Metni AI yazsın', hook: 'Teklif metnini sen yazma. AI yazsın.', day: 7, slot: 'A', theme: 'AI asistan · soru → metin → katalog önerisi', music: 'afro_house' },
  r14: { title: 'Katalog', hook: 'Aynı ürünü her teklifte baştan yazma.', day: 7, slot: 'B', theme: 'Katalog · tanımla → seç → kalemler (kod CTA)', music: 'future_bass' },
  r15: { title: 'Teklif durumları', hook: 'Hangi teklif bekliyor, hangisi onaylandı?', day: 8, slot: 'A', theme: 'Panel · teklif durumları', music: 'ukulele' },
  r16: { title: 'Gelir. Gider. Kasa.', hook: 'Gelir. Gider. Kasa.', day: 8, slot: 'B', theme: 'Kasa (üst kart) → teklif fiyatı', music: 'disco' },
  r17: { title: 'Hediye nasıl alınır', hook: 'Hediye nasıl alınır?', day: 9, slot: 'A', theme: 'Kampanya · 4 adım (kod CTA)', music: 'future_bass' },
  r18: { title: 'Hesap makinesine son', hook: 'Hesap makinesiyle teklif çıkarma.', day: 9, slot: 'B', theme: 'Otomatik hesap · fiyat → KDV/toplam → PDF', music: 'stomp_folk' },
  r19: { title: 'POV: mesaj geldi', hook: '“350’ye 260 zip perde kaça olur?” Cevabın: PDF teklif.', day: 10, slot: 'A', theme: 'POV sohbet · ölçü → fiyat → PDF', music: 'disco' },
  r20: { title: 'Instagram’a özel', hook: 'Instagram’a özel: 1 ay Pro hediye.', day: 10, slot: 'B', theme: 'Kampanya · fiyat, PDF, AI, panel montajı', music: 'sunny_pop' },
};

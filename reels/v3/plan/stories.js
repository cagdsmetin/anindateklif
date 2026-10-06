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

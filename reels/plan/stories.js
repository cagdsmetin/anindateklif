// Anında Teklif — 10 günlük Story planı (günde 3: sabah soru · öğlen özellik · akşam hediye CTA).
// Her story: story.html?id=sNN. Düzenler lib/story-build.js içinde (L.*).
// Not: Story'ler yorum alamaz → CTA "profildeki link" ya da "son Reels'e TEKLİF yaz".
// Yalnızca gerçek bilgi: 1 ay Pro hediye, kod TEKLIF30, anindateklif.co/hediye, ilk 1000 üyeye.
(function () {
  const b = (s) => [s, 'brand'];
  const it = (s) => [s, 'it'];

  window.STORIES = {
    // ---------------- GÜN 1 · Hız ----------------
    s01: { layout: 'poll', dur: 7, bg: 'glow', eyebrow: 'Hızlı soru',
      q: ['Bir teklifi', 'kaç dakikada', b('hazırlıyorsun?')],
      opts: ['5 dakikadan az', '15–30 dakika', '1 saatten fazla'], foot: 'Cevabını mesajla yaz' },
    s02: { layout: 'phone', dur: 8, bg: 'beam', eyebrow: 'Zip Perde · Ölçü → Fiyat',
      titles: [{ a: 0, l: ['Ölçüyü yaz,', b('fiyat anında.')] }],
      segs: [{ a: 0, b: 99, clip: 'zip', from: 0, cam: [{ t: 0, sy: 0, z: 1 }, { t: 3.6, sy: 0, z: 1 }, { t: 4.6, sy: 520, z: 1.08 }, { t: 8, sy: 540, z: 1.1 }], ring: { at: 4.9, rect: [86, 1858, 1012, 78] } }],
      callouts: [{ at: 1.1, text: 'EN 350 · BOY 260', side: 'r', y: 470 }, { at: 3.0, text: 'Motor, kumaş, logo seç', side: 'l', y: 760 }, { at: 5.2, text: 'Satış fiyatı hazır', side: 'r', y: 1090 }] },
    s03: { layout: 'ticket', dur: 7, bg: 'warm' },

    // ---------------- GÜN 2 · Hesap derdi ----------------
    s04: { layout: 'checklist', dur: 7.5, bg: 'low', eyebrow: 'Hangisi tanıdık?',
      q: ['Teklif hazırlarken', b('hangisini yaşıyorsun?')],
      items: ['m² hesabı hesap makinesinde', 'Fiyatı defterden aramak', "Teklifi Word'de baştan yazmak", "Fotoğrafını çekip WhatsApp'tan atmak"],
      end: ['Hepsinin kısa yolu var.', it('Öğlen gösteriyoruz.')] },
    s05: { layout: 'split', dur: 8.5, bg: 'band', eyebrow: 'Zip Perde · Çizim',
      titles: [{ a: 0, l: ['EN ve', "BOY'u gir.", b('Gerisi bizde.')] }, { a: 2.8, l: ['Teknik çizim', b('kendiliğinden.')] }, { a: 5.6, l: ['Ölçü ve m²', b('üstünde yazılı.')] }],
      segs: [
        { a: 0, b: 2.8, clip: 'm_08', cam: [{ t: 0, sy: 0, z: 1 }, { t: 2.8, sy: 120, z: 1.12, sx: 585 }] },
        { a: 2.8, b: 5.6, clip: 'm_09', cam: [{ t: 0, sy: 0, z: 1.95 }, { t: 2.8, sy: 30, z: 2.0 }] },
        { a: 5.6, b: 99, clip: 'm_09', cam: [{ t: 0, sy: 30, z: 2.0 }, { t: .8, sy: 640, z: 2.4, sx: 420 }, { t: 3, sy: 650, z: 2.45, sx: 420 }], ring: { at: .9, rect: [40, 1200, 520, 80] } },
      ] },
    s06: { layout: 'comment', dur: 7, bg: 'glow' },

    // ---------------- GÜN 3 · PDF / güven ----------------
    s07: { layout: 'versus', dur: 7, bg: 'glow', eyebrow: 'Hangisi daha güven verir?',
      a: { tag: 'Eski usul', big: 'Elle yazılmış fiyat', sub: 'Kâğıt, fotoğraf, dağınık mesaj', strike: true },
      b: { tag: 'Anında Teklif', big: 'Logolu PDF teklif', sub: 'Klasik · Modern · Minimal · Kurumsal' },
      cap: ['Müşterin', b('hangisine güvenir?')] },
    s08: { layout: 'full', dur: 8.5, bg: 'none', eyebrow: 'PDF Teklif',
      titles: [{ a: 0, l: ['Tek dokunuşla', b('kurumsal PDF.')] }, { a: 4.6, l: ['Şablonunu seç,', b('logon üstünde.')] }],
      segs: [
        { a: 0, b: 4.6, clip: 'pdf', from: 0, cam: [{ t: 0, sy: 820, z: 1 }, { t: .5, sy: 820, z: 1 }, { t: .75, sy: 40, z: 1 }, { t: 4.6, sy: 160, z: 1.04 }] },
        { a: 4.6, b: 99, clip: 'm_07b', cam: [{ t: 0, sy: 60, z: 1 }, { t: 3.9, sy: 200, z: 1.05 }] },
      ],
      chips: ['Klasik', 'Modern', 'Minimal', 'Kurumsal'], chipAt: 1.0, chipOn: [{ at: 1.6, i: 0 }, { at: 4.6, i: 1 }] },
    s09: { layout: 'gift', dur: 7, bg: 'glow', head: ['Profildeki', b('linke dokun.')],
      note: 'Kod: <b>TEKLIF30</b> · İlk 1000 üyeye<br>Üye olunca otomatik tanımlanır.' },

    // ---------------- GÜN 4 · Katalog ----------------
    s10: { layout: 'typeQ', dur: 7, bg: 'beam', eyebrow: 'Dürüst cevap',
      text: ['Aynı ürünü', 'kaçıncı kez', 'yazıyorsun?'], cls: ['', '', 'brand'], typeDur: 1.9, tallyTop: 560,
      after: ['Öğlen: bir kez tanımla,', it('sonra sadece seç.')] },
    s11: { layout: 'card', dur: 8.5, bg: 'glow', pills: ['1 · Katalog', '2 · Teklif', '3 · Fiyat'],
      titles: [{ a: 0, l: ['Ürünü bir kez', b('tanımla.')] }, { a: 2.8, l: ['Teklifte', b('sadece seç.')] }, { a: 5.6, l: ['Adet ve fiyat,', b('toplam hazır.')] }],
      segs: [
        { a: 0, b: 2.8, clip: 'm_18', cam: [{ t: 0, sy: 120, z: 1 }, { t: 2.8, sy: 260, z: 1.04 }] },
        { a: 2.8, b: 5.6, clip: 'm_04', cam: [{ t: 0, sy: 700, z: 1 }, { t: 2.8, sy: 820, z: 1.04 }] },
        { a: 5.6, b: 99, clip: 'm_05', cam: [{ t: 0, sy: 1000, z: 1 }, { t: 2.9, sy: 1080, z: 1.04 }], ring: { at: .5, rect: [60, 1655, 1050, 125] } },
      ] },
    s12: { layout: 'steps', dur: 7.5, bg: 'band', head: ['3 adımda', b('1 ay Pro.')],
      steps: [['Profildeki linke dokun', 'anindateklif.co/hediye'], ['Üye ol', 'Bir dakikanı alır'], ['Kod otomatik tanımlanır', '1 ay Pro hesabında']] },

    // ---------------- GÜN 5 · Müşteri mesajı / WhatsApp ----------------
    s13: { layout: 'chat', dur: 7.5, bg: 'glow', eyebrow: 'Tanıdık mesaj',
      msg: 'Merhaba, 350×260 zip perde ne kadar tutar?', msg2: 'Bugün dönebilir misiniz?', m2Top: 420,
      q: ['Cevabın kaç', b('dakikada gidiyor?')], after: 'Öğlen story’de: ölçüden<br>WhatsApp’a tek akış.' },
    s14: { layout: 'card', dur: 8.5, bg: 'low', eyebrow: 'WhatsApp ile gönder',
      titles: [{ a: 0, l: ['Teklif hazır.', b('Şimdi gönder.')] }, { a: 4.2, l: ['Müşterine', b('logolu PDF gider.')] }],
      segs: [
        { a: 0, b: 4.2, clip: 'm_06', cam: [{ t: 0, sy: 900, z: 1 }, { t: .6, sy: 900, z: 1 }, { t: 2.0, sy: 1700, z: 1.6, sx: 800 }, { t: 4.2, sy: 1720, z: 1.65, sx: 800 }], ring: { at: 2.1, rect: [590, 2060, 540, 140] } },
        { a: 4.2, b: 99, clip: 'm_07b', cam: [{ t: 0, sy: 220, z: 1 }, { t: 4.3, sy: 420, z: 1.04 }] },
      ],
      callouts: [{ at: 2.5, text: 'Tek dokunuş, WhatsApp’ta', side: 'l', x: 30, y: 1000, out: 4.0 }] },
    s15: { layout: 'code', dur: 7.5, bg: 'glow' },

    // ---------------- GÜN 6 · AI Asistan ----------------
    s16: { layout: 'slider', dur: 7, bg: 'warm', eyebrow: 'Hızlı soru',
      q: ['Teklif açıklaması', 'yazmak ne kadar', b('sıkıcı?')],
      marks: ['Sorun değil', 'Biraz sıkıcı', 'Çok sıkıcı', 'Hiç sevmiyorum'], ends: ['Hiç değil', 'Çok'],
      after: ['Öğlen: bu işi', it('AI Asistan’a bırak.')] },
    s17: { layout: 'phone', dur: 9, bg: 'glow', eyebrow: 'AI Asistan',
      titles: [{ a: 0, l: ['Teklif metnini', b('AI yazsın.')] }],
      segs: [{ a: 0, b: 99, clip: 'ai', from: 0, cam: [{ t: 0, sy: 300, z: 1.15 }, { t: 3.6, sy: 300, z: 1.15 }, { t: 4.6, sy: 120, z: 1.18 }, { t: 9, sy: 160, z: 1.2 }] }],
      callouts: [{ at: 1.0, text: 'Ne istediğini yaz', side: 'r', y: 1140, out: 4.2 }, { at: 4.8, text: 'Kalem metni + fiyat notu', side: 'l', y: 560 }, { at: 6.2, text: 'Kataloğa tek dokunuşla', side: 'r', y: 1180 }] },
    s18: { layout: 'ticket', dur: 7, bg: 'indigo', eyebrow: 'Hediye · İlk 1000 üyeye',
      head: ['Pro’yu 1 ay', it('hediye kullan.')], btn: 'Profildeki linkten üye ol', note: 'Kod otomatik tanımlanır · anindateklif.co/hediye' },

    // ---------------- GÜN 7 · Takip / Panel ----------------
    s19: { layout: 'mark', dur: 7, bg: 'glow', eyebrow: 'Hızlı soru',
      q: ['Kaç teklifin', b('cevap bekliyor?')],
      cards: [{ label: 'Beklemede', color: '#94A3B8' }, { label: 'Görüldü', color: '#F5B544' }, { label: 'Onaylandı', color: '#34D399' }],
      after: ['Bilmiyorsan', it('öğlen story’ye bak.')] },
    s20: { layout: 'full', dur: 8, bg: 'none', eyebrow: 'Panel',
      titles: [{ a: 0, l: ['Hangi teklif', b('ne durumda?')] }, { a: 3.6, l: ['Hepsi panelde,', b('tek bakışta.')] }],
      segs: [
        { a: 0, b: 2.2, clip: 'panel', from: 2.0, cam: [{ t: 0, sy: 260, z: 1.05 }, { t: 2.2, sy: 200, z: 1.05 }] },
        { a: 2.2, b: 99, clip: 'm_02', cam: [{ t: 0, sy: 420, z: 1.05 }, { t: 5.8, sy: 330, z: 1.1 }] },
      ],
      chips: ['Beklemede', 'Görüldü', 'Onaylandı', 'Reddedildi'], chipAt: 1.0, chipOn: [{ at: 1.8, i: 0 }, { at: 2.6, i: 1 }, { at: 3.4, i: 2 }, { at: 4.2, i: 3 }, { at: 5.0, i: -1 }] },
    s21: { layout: 'word', dur: 7.5, bg: 'beam',
      head: ['Son Reels’imizin altına'], head2: [it('yaz, hediyen gelsin.')],
      note: 'Otomatik cevaptaki linkten üye ol,<br>1 ay Pro hesabına tanımlansın.' },

    // ---------------- GÜN 8 · Toplam / KDV ----------------
    s22: { layout: 'quiz', dur: 7.5, bg: 'band', eyebrow: 'Hızlı hesap',
      q: ['345.150 ₺', b('+ %20 KDV = ?')], opts: ['404.180 ₺', '414.180 ₺', '424.180 ₺'], ok: 1,
      after: ['Uygulama bunu', it('sen yazarken yapıyor.')] },
    s23: { layout: 'card', dur: 8.5, bg: 'glow', pills: ['1 · Kalem', '2 · Toplam', '3 · PDF'],
      titles: [{ a: 0, l: ['Kalemi ekle,', b('adet ve fiyatı yaz.')] }, { a: 2.8, l: ['KDV dahil toplam', b('kendiliğinden.')] }, { a: 5.6, l: ['Hepsi tek PDF’te,', b('müşterine hazır.')] }],
      segs: [
        { a: 0, b: 2.8, clip: 'm_05', cam: [{ t: 0, sy: 1000, z: 1 }, { t: 2.8, sy: 1080, z: 1.03 }], ring: { at: .7, rect: [60, 1655, 1050, 125] } },
        { a: 2.8, b: 5.6, clip: 'm_06', cam: [{ t: 0, sy: 1000, z: 1 }, { t: 2.8, sy: 1050, z: 1.03 }], ring: { at: .6, rect: [60, 1495, 1050, 150] } },
        { a: 5.6, b: 99, clip: 'm_07', cam: [{ t: 0, sy: 260, z: 1 }, { t: 2.9, sy: 330, z: 1.04 }], ring: { at: .9, rect: [688, 1158, 424, 84] } },
      ] },
    s24: { layout: 'gift', dur: 7, bg: 'beam', eyebrow: 'Hediye · İlk 1000 üyeye',
      head: ['Hediyen', it('hazır.')], note: 'Profildeki linkten üye ol,<br>kod <b>TEKLIF30</b> otomatik tanımlanır.' },

    // ---------------- GÜN 9 · Kasa / ay sonu ----------------
    s25: { layout: 'versus', dur: 7, bg: 'low', eyebrow: 'Ay sonu',
      a: { tag: 'Tahmin', big: '“Galiba iyi geçti”', sub: 'Defter, not, akılda kalanlar', strike: true },
      b: { tag: 'Net rakam', big: 'Gelir · Gider · Net', sub: 'Kasa ekranında, tek bakışta' },
      cap: ['Ayı', b('hangisiyle kapatıyorsun?')] },
    s26: { layout: 'duo', dur: 8, bg: 'glow', eyebrow: 'Kasa · Panel',
      titles: [{ a: 0, l: ['Gelir, gider, net:', b('tek bakışta.')] }],
      segsA: [{ a: 0, b: 99, clip: 'm_12', cam: [{ t: 0, sy: 0, z: 1.48 }, { t: 8, sy: 20, z: 1.5 }] }],
      segsB: [{ a: 0, b: 99, clip: 'm_02', cam: [{ t: 0, sy: 160, z: 1 }, { t: 8, sy: 520, z: 1.04 }] }],
      callouts: [{ at: 1.6, text: 'Bu ayın kasa özeti', side: 'r', x: 0, y: 290 }, { at: 2.6, text: 'Teklif durumları yanında', side: 'l', x: 0, y: 1100 }] },
    s27: { layout: 'steps', dur: 7.5, bg: 'indigo', head: ['Reels’ten', it('hediye al.')],
      steps: [['Son Reels’imizi aç', 'Profilde en üstte'], ['Yorumlara TEKLİF yaz', 'Otomatik cevap gelir'], ['Linkten üye ol', '1 ay Pro hesabında']],
      foot: 'İlk 1000 üyeye<br>kod otomatik tanımlanır' },

    // ---------------- GÜN 10 · Özet ----------------
    s28: { layout: 'pollGrid', dur: 7.5, bg: 'glow', eyebrow: 'Son soru',
      q: ['Sence hangisi en çok', b('zaman kazandırır?')], foot: 'Cevabını mesajla yaz',
      tiles: [
        { label: 'Zip perde hesabı', seg: { clip: 'm_08', cam: [{ t: 0, sy: 220, z: 1.3 }] } },
        { label: 'PDF teklif', seg: { clip: 'm_07b', cam: [{ t: 0, sy: 300, z: 1.15 }] } },
        { label: 'AI asistan', seg: { clip: 'm_16', cam: [{ t: 0, sy: 160, z: 1.2 }] } },
        { label: 'Ürün kataloğu', seg: { clip: 'm_18', cam: [{ t: 0, sy: 140, z: 1.2 }] } },
      ] },
    s29: { layout: 'card', dur: 8.5, bg: 'band', eyebrow: '10 günün özeti', index: true,
      titles: [{ a: 0, n: '01', l: ['Ölçü gir,', b('fiyat çıksın.')] }, { a: 2.1, n: '02', l: ['Logolu', b('PDF teklif.')] }, { a: 4.2, n: '03', l: ['AI ile', b('teklif metni.')] }, { a: 6.3, n: '04', l: ['Hepsi', b('tek panelde.')] }],
      segs: [
        { a: 0, b: 2.1, clip: 'zip', from: 4.0, cam: [{ t: 0, sy: 1180, z: 1 }, { t: 2.1, sy: 1240, z: 1.03 }], ring: { at: .5, rect: [86, 1858, 1012, 78] } },
        { a: 2.1, b: 4.2, clip: 'pdf', from: .8, cam: [{ t: 0, sy: 300, z: 1 }, { t: 2.1, sy: 380, z: 1.03 }] },
        { a: 4.2, b: 6.3, clip: 'ai', from: 4.3, cam: [{ t: 0, sy: 160, z: 1 }, { t: 2.1, sy: 260, z: 1.03 }] },
        { a: 6.3, b: 99, clip: 'panel', from: 2.2, rate: .5, cam: [{ t: 0, sy: 200, z: 1 }, { t: 2.2, sy: 300, z: 1.03 }] },
      ] },
    s30: { layout: 'twoWay', dur: 8, bg: 'glow', head: ['İki yol,', it('tek hediye.')],
      a: ['Son Reels’e TEKLİF yaz', 'Otomatik cevapta linkin gelir'],
      b: ['Profildeki linkten üye ol', 'Kod TEKLIF30 otomatik tanımlanır'],
      end: ['Sonuç aynı:', b('1 ay Pro, ilk 1000 üyeye.')] },
  };

  const THEMES = ['Hız', 'Hesap derdi', 'PDF teklif', 'Katalog', 'WhatsApp gönderimi', 'AI Asistan', 'Panel / takip', 'Toplam & KDV', 'Kasa / ay sonu', 'Özet'];
  const SLOTS = ['sabah · soru', 'öğle · özellik', 'akşam · hediye CTA'];
  window.STORY_META = {};
  Object.keys(window.STORIES).forEach((id, i) => {
    window.STORY_META[id] = { day: Math.floor(i / 3) + 1, slot: (i % 3) + 1, slotName: SLOTS[i % 3], theme: THEMES[Math.floor(i / 3)], layout: window.STORIES[id].layout, dur: window.STORIES[id].dur };
  });
})();

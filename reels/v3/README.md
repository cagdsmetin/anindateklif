# Reels v3 — premium 3D motor

Instagram Reels/Stories (1080×1920, 30 fps) için veri odaklı, deterministik bir sahne motoru.
Bir video = `scenes` listesi; her sahnenin süresi **vuruş** (`beats`) ya da saniye (`dur`) ile verilir,
kesmeler müziğin vuruşuna oturur. Her kare `render(t)`'nin saf fonksiyonudur (rAF/Date/CSS transition yok).

```
v3/reel.html?id=p1      → plan/reels.js   (window.V3_REELS)    yazı güvenli alanı y ∈ [180,1500]
v3/story.html?id=p1s    → plan/stories.js (window.V3_STORIES)  yazı güvenli alanı y ∈ [250,1600]
  &guides=1  güvenli alan çizgileri   ·   &music=disco  müziği zorla (BPM da değişir)
```

## Komutlar (reels/ içinden)

```bash
node v3/qa.mjs "v3/reel.html?id=p1"                       # güvenli alan taraması + hata + ms/kare (ilk iş bu)
node render.mjs "v3/reel.html?id=p1" preview/v3/p1 stills 0 1.5 3.6 6 9   # tek kareler
node render.mjs "v3/reel.html?id=p1" out/v3/p1.mp4         # video (CRF 14)
node lib/audio.mjs "v3/reel.html?id=p1" out/v3/p1.mp4 out/v3/p1_final.mp4   # müzik+efekt (plan.music kullanılır)
```

Hız (SwiftShader, 4 çekirdek): render ≈ 0.55–0.7 s/kare + ekran görüntüsü ≈ 0.4 s → 18 sn reel ≈ 9–10 dk.
3 video paralel render edilebilir.

## Dosyalar

| dosya | görev |
|---|---|
| `timeline.js` | klasik betik, WebGL'siz: plan → sahne zamanları, `window.DUR/CUES/MUSIC/BPM`, `V3T.beats`. `lib/audio.mjs` yalnızca bunu okur; motor çökse bile ses çalışır. |
| `engine.js` | three.js modülü: 3B telefon, ekran bileşimcisi (kırpma/örtü/vurgu), pop-out, çip, patlatılmış görünüm, konfeti, logo, kinetik tipografi, dünyalar, kamera, geçişler. |
| `engine.css` | katman ve bileşen stilleri. |
| `qa.mjs` | QA taraması (`window.V3.check()`). |

Katmanlar (arkadan öne): `#bg` dünya → `#back2d` (telefonun **arkasındaki** yazı) → `#gl` three.js (şeffaf)
→ `#css3d` (3B DOM: pop-out, çip, balon, bilet; keskin yazı) → `#front2d` → `#fx` (gren, vinyet, flaş, iris).

---

## Plan (video) şeması

```js
window.V3_REELS.r21 = {
  music: 'future_bass',   // sunny_pop 120 · tropical 110 · disco 116 · ukulele 112 · afro_house 122 · future_bass 128 · lofi_happy 110 · stomp_folk 124
  world: 'midnight',      // varsayılan dünya (sahne bazında değişebilir)
  finish: 'graphite',     // telefon: graphite · titanium · silver · indigo · black
  overlays: [ /* tüm videoya yayılan yazılar (mutlak zaman), ör. canlı sayaç */ ],
  scenes: [ /* aşağıda */ ],
};
```

### Sahne ortak alanları

```js
{ type: 'phone' | 'type' | 'cta' | 'outro',
  beats: 8,            // ya da dur: 3.2 (sn). Sahne başları kare ızgarasına yuvarlanır.
  world: 'amber',      // dünya
  in/out: 'cut' | 'flash' | 'whip' | 'whipUp' | 'zoom' | 'iris' | 'push',  // geçiş (bu sahnenin out'u = sonrakinin in'i)
  trDur: .3,           // geçiş süresi (iris vars. .42)
  text: [ ...Txt ],    // kinetik yazılar (aşağıda)
  focus: [{ t: 0, bg: 0, back: 0, gl: 0, front: 0 }, { t: 2, back: 14 }],  // odak kaydırma: katman bulanıklığı (px)
  burst: [{ at: 1.2, x: 540, y: 900, n: 120, power: 1, seed: 2 }],          // konfeti (ekran px)
  cues: [{ t: 1.0, type: 'pop' }],   // ek ses ipucu (cut, whoosh, pop, type(dur), tick(dur), ding, logo, cta)
}
```

**Zaman değerleri** (her `at`, `t`, `out`, `run`): sayı = sahne başından saniye; negatif = sondan
(`-0.4`); `'b4'` = 4 vuruş; `'end'` = sahne sonu.

### Dünyalar (`world`)

`midnight` (koyu lacivert + indigo ışık) · `indigo` (doygun marka moru) · `amber` (sıcak, koyu yazı) ·
`mint` (açık nane, koyu yazı) · `paper` (açık stüdyo, koyu yazı) · `graphite` (nötr siyah) ·
`dusk` (indigo→pembe→amber) · `forest` (koyu yeşil). Yazı rengi (`--ink`, `--muted`, `--accent`) dünyadan gelir.
Koyu dünyalarda telefonun arkasında renkli parıltı, açık dünyalarda yumuşak zemin gölgesi otomatik.

---

## `phone` sahnesi — 3B telefon + gerçek uygulama görüntüsü

```js
{ type: 'phone', beats: 12,
  screen: { clip: 'zip', from: 0, rate: 1, hold: 4.5 },   // ya da { still: 'm_10' }
  screens: [{ at: 0, still: 'm_06' }, { at: 1.85, clip: 'pdf', from: .3 }],  // sahne içinde ekran değişimi
  cam: 'hero' | { preset: 'orbit', y: 200, zoom: 1.1 } | [{ t, yaw, pitch, roll, dist, fov, x, y, tx, ty, tz, e }],
  phone: [{ t, px, py, pz, rx, ry, rz, s, sweep, glare, bright, e }],      // telefonun kendi pozu (derece)
  shake: .5,           // el kamerası mikro sarsıntısı (deterministik gürültü), 0 = kapalı
  float: true,         // hafif süzülme
  highlight: [{ at, until, rect: [x,y,w,h], style: 'spot' | 'ring' | 'both', color }],
  pop: [ ...Pop ], chips: [ ...Chip ], explode: { ... },
}
```

**Klipler** (`clip`, kaynak 1170×2532 @30fps, `from` saniye):
- `zip` — EN/BOY yazılır → fiyat (5.15 sn). Kaydırma (kaynak 3.1–4.05) **otomatik atlanır**; "Bayi fiyatı" satırı
  hem yazarken bir an göründüğü yerde hem oturduktan sonra **otomatik bulanıklaştırılır**. Satış satırı:
  `[86,1856,1012,82]` (yerel ≥ 3.1 sn).
- `pdf` — toplamlar → Önizle (0.35) → yükleme → PDF (0.6). Müşteri/imza blokları otomatik örtülür.
- `panel` — panel kaydırma; kaynağın 2.0 sn öncesi (kişi adı) hiç kullanılmaz (`from: 0` = kaynak 2.0).
- `ai` — AI asistan; cevap ≈ 3.2 sn'de (`from: 2.4` önerilir).

**Hareketsiz görseller** (`still`): `m_02` panel · `m_04` katalogdan ekle · `m_05` kalemler · `m_06` toplam ·
`m_08` zip ölçü · `m_09` zip çizim (Bayi satırı otomatik örtülü) · `m_10` zip fiyat (Bayi satırı otomatik örtülü) · `m_16` AI · `m_18` katalog.
`m_01, m_03, m_11, m_13–15, m_17, v02` YASAK (kişisel veri). Ek örtü: `screen: { ..., redact: [[x,y,w,h]] }`.

**Hazır dikdörtgenler** `V3.RECTS`: `zipSatis [86,1856,1012,82]`, `m10Satis [86,1793,1000,84]`,
`m06Toplam/pdfToplam [68,1503,1034,138]`. m_10 katmanları: başlık `[0,0,1170,190]`, çizim kartı `[62,312,1046,896]`,
Teklife Ekle `[110,1990,950,136]`, sekme çubuğu `[36,2330,1098,172]`.

**Kamera** (`cam`): hedef etrafında yörünge. `yaw/pitch/roll` derece, `dist` (telefon 1.5 birim; 5 ≈ ekranın %60'ı),
`x/y` = **lens kaydırma** (px; perspektifi bozmadan telefonu kadrajda kaydırır: `y: 300` telefonu aşağı alır,
üstte yazıya yer açar), `e` = varış yumuşatması (`out` expo, `quint`, `inOut` (vars.), `expoInOut`, `sine`,
`in`, `inExpo`, `back`, `spring`, `soft`, `lin`).
Ön ayarlar `V3.CAM`: `hero`, `orbit`, `pushIn`, `low`, `top`, `dutch`, `drift`, `into` (ekrana dalış — sonraki
sahne `in: 'zoom'`), `outOf` (ekrandan çıkış).

Ekrandan dalış (zoom-through): sahne A'nın son anahtarı `{ t: 'end', dist: 1.5, y: 0, yaw: 0, pitch: 0, e: 'inExpo' }`,
`out: 'zoom'`; sahne B ilk anahtarı `{ t: 0, dist: 1.5, y: 0 }` ve 1–1.3 sn'de geri çekilir (bkz. p1).

### Pop-out (UI parçası ekrandan kameraya uçar)

```js
pop: [{ at: 3.45, rect: [86,1856,1012,82],          // kaynak px; ekranda yerinde "delik" bırakır (hole:false kapatır)
        style: 'price' | 'dark' | 'crop',            // price: beyaz kart; dark: koyu (GENEL TOPLAM); crop: ekranın birebir kesiti
        label: 'Satış fiyatı', value: 746.53, prefix: '€ ', decimals: 2,   // price/dark: sayaç (odometre) yuvarlanır
        h: 190,                                       // varış yüksekliği (px), satırdan büyür
        to: { x: 0, y: 1236, w: 920, depth: .62, rx: 8, ry: -12 },        // ekran px hedefi, eğim
        counter: { delay: .3, dur: 1.0 }, dur: .9, out: 1.75 }]           // out: uçup kaybolur
```

### Çip (telefona bağlı 3B cam etiket)

```js
chips: [{ at: 1.0, out: 2.9, text: '350 × 260 cm', sub: 'ölçü', icon: 'ruler', color: '#6C64FF',
          anchor: [880, 640], off: [.12, .05], dz: .2, face: .6, size: 1, light: false }]
```
`anchor` kaynak px, `off` telefon düzleminde dünya birimi kaydırma, `dz` ekrandan yükseklik, `face` kameraya dönme
oranı. İkonlar: `check bolt pdf ai gift ruler clock send chat euro`.

### Patlatılmış görünüm (ekran katmanlara ayrılır)

```js
explode: { at: .35, dur: 1.3, dim: .6, labelSize: 1.25, slices: [
  { rect: [62,312,1046,896], z: .2, dx: -.06, label: 'Çizim' },
  { rect: [86,1793,1000,84], z: .42, dx: .1, grow: .3, label: 'Satış fiyatı', labelAt: 'top' },   // right | left | top
] }
```
En iyi sonuç: telefon arkaya yatık ve çapraz (`phone: [{ t: 1.5, rx: -40, ry: 6, rz: -22 }]`, `float: false`), bkz. p2.

---

## `type` sahnesi — yalnız tipografi

```js
{ type: 'type', beats: 6, world: 'amber', text: [...], burst: [...] }
```

## `cta` sahnesi

```js
{ type: 'cta', mode: 'comment', beats: 8, world: 'indigo' }   // Yorumlara TEKLİF yaz → otomatik cevap → hediye kartı + konfeti
{ type: 'cta', mode: 'code', beats: 8, world: 'indigo' }      // 1 ay Pro ücretsiz → TEKLIF30 bileti (karıştırma) → url butonu
```
Değiştirilebilir: `eyebrow`, `head` (işaretlemeli), `size`, `note`, `reply` (HTML), `code`, `url`, `backdrop:false`.
Koreografi `V3T.CTA` (comment ≈ 3.5 sn, code ≈ 2.5 sn gerekir). Hikâyede yerleşim güvenli alana otomatik ölçeklenir.

## `outro` sahnesi

```js
{ type: 'outro', beats: 4, world: 'midnight', name: 'Anında Teklif', tagline: '...', url: 'anindateklif.co/hediye', logoScale: 1 }
```
3B cam karo + şimşek (clearcoat, ışık süpürmesi, lens parlaması), harf harf marka adı. Her videonun sonunda olmalı.

---

## Kinetik yazı (`text` / `overlays` öğesi)

```js
{ kind: 'rise', text: 'Bu teklif *8 saniyede*\nhazırlandı.', x: 84, y: 196, w, size: 92, align: 'left'|'center'|'right',
  layer: 'front' | 'back',      // back = telefonun ARKASINDA (derinlik)
  style: 'label' | 'body' | 'giant' | 'outline' | 'deco',   // deco: QA'dan muaf süs yazısı
  at: 0, out: 5.0, pre: .7,     // pre: 0. karede hazır ilerleme (0. kare boş olmasın!)
  stagger: .05, dur: .8, ease: 'out', color, weight, ls, lh, wrap, box: true, shine: 1.2, ulAt }
```

İşaretleme: `*serif italik*` · `[vurgu rengi]` · `~altı çizili süpürme~` · `\n` satır.

| kind | etki | ek alanlar |
|---|---|---|
| `rise` | kelime kelime maskeli yükselme (İ/ş/ğ kırpılmaz) | `tilt` |
| `chars` | harf harf maskeli yükselme | |
| `blur` | bulanıktan netliğe | |
| `snap` | ölçek-yaylanma (pop sesi) | `from` |
| `weight` | değişken ağırlık 200→800 + harf aralığı | `w0, w1, track` |
| `track` | geniş harf aralığından toplanma | `ls0` |
| `wave` | harf dalgası | |
| `fade` | yumuşak yükselip belirme | |
| `stamp` | büyükten damga gibi iner (pop sesi) | `from, rot` |
| `type` | daktilo + imleç (type sesi) | `dur` |
| `scramble` | rastgele karakterden çözülme — **yalnız Latin** (TEKLIF30, rakam) | |
| `counter` | odometre fiyat (hareket bulanıklığı) | `value, decimals, prefix, suffix, run:[a,b]` |
| `timer` | canlı sayaç `0,00 → 8,00` (saniyede tik, sonda ding) | `from, to, run, decimals, suffix, doneColor` |
| `cycle` | kelime döngüsü | `words, period, before, after, cycleColor` |

## Ses

`window.CUES` otomatik: geçişler (`whoosh`/`cut`), `snap/stamp/pop/chip/burst` → `pop`, `type` → `type(dur)`,
`timer` → `tick(dur)` + `ding`, sayaç sonu → `ding`, CTA → `cta` (müzikte break/drop), outro → `logo`.
`lib/audio.mjs` sayfanın `window.MUSIC`'ini kullanır (plan `music`); `--music` yine zorlar.

## Kurallar / kontrol listesi

1. 0. kare dolu: ilk sahnedeki yazılara `pre: .6–1` ver, telefon kadrajda olsun.
2. Önce ürün aksiyonu (ölçü → fiyat), logo en sonda (`outro`).
3. `node v3/qa.mjs` 0 sorunlu kare vermeli (geçiş kareleri ve `deco` muaf).
4. Uydurma istatistik/yorum/kıtlık sayısı yok — yalnız: 1 ay Pro, ilk 1000 üye, TEKLIF30, anindateklif.co/hediye.
5. Bayi fiyatı asla vurgulanmaz/yakınlaştırılmaz; kişisel veri içeren görseller kullanılmaz.
6. Çeşitlilik: dünya, telefon rengi, kamera dili (`low`/`dutch`/`top`/`orbit`), geçiş tipi ve CTA modunu videodan videoya değiştir.

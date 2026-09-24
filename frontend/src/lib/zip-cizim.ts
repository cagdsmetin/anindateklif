// ============================================================================
// Zip Perde (ART110 dikey zip perde) ürün görseli
// ----------------------------------------------------------------------------
// Tedarikçinin teknik çizimindeki (SKY110_Teknik.pdf) ölçülerle, girilen
// EN × BOY'a göre parametrik SVG üretir:
//   - izometrik ürün görseli (sayfa 1'deki gibi: kasa, dikmeler, perde, etek)
//   - ölçülü önden görünüş (sayfa 2'deki gibi: EN, BOY, kasa yüksekliği)
// EN = kasalar dahil toplam genişlik, BOY = kasa dahil toplam yükseklik
// (tedarikçi çiziminde 1000 × 1113 böyle ölçülmüş).
//
// Saf fonksiyon: aynı SVG hem ekranda (ZipCizim.tsx) hem teklif PDF'inde
// (cizim-html.ts) kullanılıyor, ikisi birbirinden kayamaz.
// ============================================================================

export type ZipCizimModeli = {
  kind: 'zip';
  enMm: number;
  boyMm: number;
  motor?: string;
  kumas?: string;
  logo?: boolean;
  uyarilar: string[];
};

// Profil ölçüleri (mm) -- SKY110 teknik çizimi, sayfa 2.
const KASA = 110; // kasa profili 110 × 110
const DIKME_EN = 50; // dikme profili 50 × 35
const DIKME_DER = 35;
const ETEK_Y = 40; // etek profili 45 × 40
const ETEK_DER = 45;

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mm = (n: number) => Math.round(n).toLocaleString('tr-TR');
const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function zipCizimModeli(enCm: number, boyCm: number, opts: { motor?: string; kumas?: string; logo?: boolean } = {}): ZipCizimModeli {
  return { kind: 'zip', enMm: Math.round(enCm * 10), boyMm: Math.round(boyCm * 10), ...opts, uyarilar: [] };
}

export function zipCizimEsit(a: unknown, b: ZipCizimModeli): boolean {
  const x = a as Partial<ZipCizimModeli> | null;
  return !!x && x.kind === 'zip' && x.enMm === b.enMm && x.boyMm === b.boyMm &&
    x.motor === b.motor && x.kumas === b.kumas && !!x.logo === !!b.logo;
}

// --- izometrik projeksiyon ----------------------------------------------------
// Dünya: x = genişlik (sağa), y = yükseklik (yukarı), z = derinlik (duvardan
// izleyiciye). Kamera sol-ön-üstte: x ekranda sağa-yukarı, z sağa-aşağı gider;
// böylece tedarikçi çizimindeki gibi kasanın üstü, sol kapağı ve önü görünür.
const AX = { x: Math.cos((24 * Math.PI) / 180), y: -Math.sin((24 * Math.PI) / 180) };
const AZ = { x: Math.cos((58 * Math.PI) / 180) * 0.9, y: Math.sin((58 * Math.PI) / 180) * 0.9 };

type P = [number, number];
const proj = (x: number, y: number, z: number): P => [x * AX.x + z * AZ.x, x * AX.y + z * AZ.y - y];

type Kutu = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; renk: { ust: string; on: string; yan: string } };

/** Görünen üç yüz: üst (+y), ön (+z), sol (-x). */
function kutuYuzleri(k: Kutu): { pts: P[]; fill: string }[] {
  const { x0, x1, y0, y1, z0, z1 } = k;
  return [
    { pts: [proj(x0, y1, z0), proj(x1, y1, z0), proj(x1, y1, z1), proj(x0, y1, z1)], fill: k.renk.ust },
    { pts: [proj(x0, y0, z1), proj(x1, y0, z1), proj(x1, y1, z1), proj(x0, y1, z1)], fill: k.renk.on },
    { pts: [proj(x0, y0, z0), proj(x0, y0, z1), proj(x0, y1, z1), proj(x0, y1, z0)], fill: k.renk.yan },
  ];
}

const poly = (pts: P[], fill: string, stroke = '#1e293b', sw = 1) =>
  `<polygon points="${pts.map(([a, b]) => `${f(a)},${f(b)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;

const ALU = { ust: '#9aa3ad', on: '#5b6570', yan: '#434b55' };
const ETEK = { ust: '#b8c0cc', on: '#8d97a6', yan: '#6f7988' };

function izometrik(m: ZipCizimModeli): { body: string; minX: number; minY: number; maxX: number; maxY: number } {
  const W = Math.max(m.enMm, 300);
  const H = Math.max(m.boyMm, 300);
  const perdeZ = DIKME_DER / 2;
  const kumasRenk = m.kumas === 'sergeFerrari' ? '#c9cdd2' : '#d3d6da';

  const kutular: Kutu[] = [
    // uzak dikme (sağ), sonra perde, etek, yakın dikme (sol), en son kasa
    { x0: W - DIKME_EN, x1: W, y0: 0, y1: H - KASA, z0: 0, z1: DIKME_DER, renk: ALU },
  ];
  const parca: string[] = [];
  const ciz = (k: Kutu) => kutuYuzleri(k).forEach((y) => parca.push(poly(y.pts, y.fill)));

  ciz(kutular[0]);
  // perde (kapalı): dikmeler arasında, kasanın altından eteğe kadar
  const px0 = DIKME_EN;
  const px1 = W - DIKME_EN;
  parca.push(poly([proj(px0, ETEK_Y, perdeZ), proj(px1, ETEK_Y, perdeZ), proj(px1, H - KASA, perdeZ), proj(px0, H - KASA, perdeZ)], kumasRenk, '#475569', 0.8));
  // screen dokusu: ince yatay çizgiler
  const satir = 14;
  for (let i = 1; i < satir; i++) {
    const y = ETEK_Y + ((H - KASA - ETEK_Y) * i) / satir;
    const [a, b] = [proj(px0, y, perdeZ), proj(px1, y, perdeZ)];
    parca.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>`);
  }
  if (m.logo) {
    const lw = Math.min((px1 - px0) * 0.28, 900);
    const lh = Math.min((H - KASA - ETEK_Y) * 0.16, 400);
    const cx = (px0 + px1) / 2;
    const cy = ETEK_Y + (H - KASA - ETEK_Y) * 0.55;
    const pts: P[] = [proj(cx - lw / 2, cy - lh / 2, perdeZ), proj(cx + lw / 2, cy - lh / 2, perdeZ), proj(cx + lw / 2, cy + lh / 2, perdeZ), proj(cx - lw / 2, cy + lh / 2, perdeZ)];
    parca.push(poly(pts, '#ffffff', '#0f766e', 1.4));
    const [tx, ty] = proj(cx, cy, perdeZ);
    const aci = (Math.atan2(AX.y, AX.x) * 180) / Math.PI;
    parca.push(`<text x="${f(tx)}" y="${f(ty)}" font-size="${f(Math.max(lh * 0.45, 40))}" font-weight="800" fill="#0f766e" text-anchor="middle" dominant-baseline="middle" transform="rotate(${f(aci)} ${f(tx)} ${f(ty)})" font-family="Helvetica, Arial, sans-serif">LOGO</text>`);
  }
  // etek
  ciz({ x0: px0, x1: px1, y0: 0, y1: ETEK_Y, z0: perdeZ - ETEK_DER / 2, z1: perdeZ + ETEK_DER / 2, renk: ETEK });
  // yakın dikme (sol)
  ciz({ x0: 0, x1: DIKME_EN, y0: 0, y1: H - KASA, z0: 0, z1: DIKME_DER, renk: ALU });
  // kasa
  ciz({ x0: 0, x1: W, y0: H - KASA, y1: H, z0: 0, z1: KASA, renk: { ust: '#8a939d', on: '#4b545e', yan: '#39414a' } });

  // ölçü etiketleri (eksen boyunca döndürülmüş)
  const aciX = (Math.atan2(AX.y, AX.x) * 180) / Math.PI;
  const fs = Math.max(W, H) * 0.045;
  const enA = proj(0, -H * 0.06, KASA + 60);
  const enB = proj(W, -H * 0.06, KASA + 60);
  const enM: P = [(enA[0] + enB[0]) / 2, (enA[1] + enB[1]) / 2];
  const boyA = proj(-W * 0.04 - 60, 0, 0);
  const boyB = proj(-W * 0.04 - 60, H, 0);
  const boyM: P = [(boyA[0] + boyB[0]) / 2, (boyA[1] + boyB[1]) / 2];
  const olcuCizgi = (a: P, b: P) =>
    `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="#0f766e" stroke-width="${f(fs * 0.06)}" marker-start="url(#zo)" marker-end="url(#zo)"/>`;
  parca.push(
    olcuCizgi(enA, enB),
    `<text x="${f(enM[0])}" y="${f(enM[1] + fs * 1.1)}" font-size="${f(fs)}" font-weight="700" fill="#0f766e" text-anchor="middle" transform="rotate(${f(aciX)} ${f(enM[0])} ${f(enM[1])})" font-family="Helvetica, Arial, sans-serif">EN ${mm(m.enMm)}</text>`,
    olcuCizgi(boyA, boyB),
    `<text x="${f(boyM[0] - fs * 0.5)}" y="${f(boyM[1])}" font-size="${f(fs)}" font-weight="700" fill="#0f766e" text-anchor="middle" transform="rotate(-90 ${f(boyM[0] - fs * 0.5)} ${f(boyM[1])})" font-family="Helvetica, Arial, sans-serif">BOY ${mm(m.boyMm)}</text>`
  );

  // sınırlar
  const koseler: P[] = [];
  for (const x of [0, W]) for (const y of [0, H]) for (const z of [0, KASA]) koseler.push(proj(x, y, z));
  koseler.push(enA, enB, [boyA[0] - fs * 1.6, boyA[1]], [boyB[0] - fs * 1.6, boyB[1]], [enM[0], enM[1] + fs * 1.8]);
  const xs = koseler.map((p) => p[0]);
  const ys = koseler.map((p) => p[1]);
  return { body: parca.join(''), minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const MARKER = (id: string, renk: string) =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="${renk}"/></marker></defs>`;

/** Sadece izometrik ürün görseli (ekran için). */
export function zipIzometrikSvg(m: ZipCizimModeli): string {
  const iz = izometrik(m);
  const pad = (iz.maxX - iz.minX) * 0.04;
  const vb = [iz.minX - pad, iz.minY - pad, iz.maxX - iz.minX + pad * 2, iz.maxY - iz.minY + pad * 2];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f).join(' ')}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${MARKER('zo', '#0f766e')}${iz.body}</svg>`;
}

// --- önden görünüş (ölçülü) ---------------------------------------------------

function ondenGorunus(m: ZipCizimModeli): { body: string; w: number; h: number } {
  const W = m.enMm;
  const H = m.boyMm;
  const fs = Math.max(W, H) * 0.03;
  const L = fs * 4.2; // sol ölçü boşluğu
  const T = fs * 1.2;
  const B = fs * 3.6;
  const R = fs * 3.2;
  const x = (v: number) => L + v;
  const y = (v: number) => T + (H - v); // v: alttan yükseklik
  const sw = Math.max(W, H) * 0.0025;
  const c = '#1e293b';
  const p: string[] = [];
  // kasa
  p.push(`<rect x="${f(x(0))}" y="${f(y(H))}" width="${f(W)}" height="${f(KASA)}" fill="#6b7480" stroke="${c}" stroke-width="${f(sw)}"/>`);
  // dikmeler
  p.push(`<rect x="${f(x(0))}" y="${f(y(H - KASA))}" width="${f(DIKME_EN)}" height="${f(H - KASA)}" fill="#8a939d" stroke="${c}" stroke-width="${f(sw)}"/>`);
  p.push(`<rect x="${f(x(W - DIKME_EN))}" y="${f(y(H - KASA))}" width="${f(DIKME_EN)}" height="${f(H - KASA)}" fill="#8a939d" stroke="${c}" stroke-width="${f(sw)}"/>`);
  // perde + etek
  p.push(`<rect x="${f(x(DIKME_EN))}" y="${f(y(H - KASA))}" width="${f(W - 2 * DIKME_EN)}" height="${f(H - KASA - ETEK_Y)}" fill="#dfe3e8" stroke="${c}" stroke-width="${f(sw * 0.6)}"/>`);
  p.push(`<rect x="${f(x(DIKME_EN))}" y="${f(y(ETEK_Y))}" width="${f(W - 2 * DIKME_EN)}" height="${f(ETEK_Y)}" fill="#a3acb8" stroke="${c}" stroke-width="${f(sw)}"/>`);
  if (m.logo) {
    const lw = Math.min((W - 2 * DIKME_EN) * 0.28, 900);
    const lh = Math.min((H - KASA - ETEK_Y) * 0.16, 400);
    const cx = W / 2;
    const cy = ETEK_Y + (H - KASA - ETEK_Y) * 0.55;
    p.push(`<rect x="${f(x(cx - lw / 2))}" y="${f(y(cy + lh / 2))}" width="${f(lw)}" height="${f(lh)}" fill="#fff" stroke="#0f766e" stroke-width="${f(sw * 1.2)}"/>`,
      `<text x="${f(x(cx))}" y="${f(y(cy))}" font-size="${f(Math.max(lh * 0.45, 40))}" font-weight="800" fill="#0f766e" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif">LOGO</text>`);
  }
  // ölçü çizgileri
  const oc = '#0f766e';
  const osw = f(sw * 1.1);
  const yEn = y(0) + fs * 1.6;
  p.push(
    `<line x1="${f(x(0))}" y1="${f(y(0) + fs * 0.3)}" x2="${f(x(0))}" y2="${f(yEn + fs * 0.4)}" stroke="${oc}" stroke-width="${osw}"/>`,
    `<line x1="${f(x(W))}" y1="${f(y(0) + fs * 0.3)}" x2="${f(x(W))}" y2="${f(yEn + fs * 0.4)}" stroke="${oc}" stroke-width="${osw}"/>`,
    `<line x1="${f(x(0))}" y1="${f(yEn)}" x2="${f(x(W))}" y2="${f(yEn)}" stroke="${oc}" stroke-width="${osw}" marker-start="url(#zo2)" marker-end="url(#zo2)"/>`,
    `<text x="${f(x(W / 2))}" y="${f(yEn + fs * 1.4)}" font-size="${f(fs)}" font-weight="700" fill="${oc}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">EN ${mm(W)}</text>`
  );
  const xBoy = x(0) - fs * 1.6;
  p.push(
    `<line x1="${f(x(0) - fs * 0.3)}" y1="${f(y(H))}" x2="${f(xBoy - fs * 0.4)}" y2="${f(y(H))}" stroke="${oc}" stroke-width="${osw}"/>`,
    `<line x1="${f(x(0) - fs * 0.3)}" y1="${f(y(0))}" x2="${f(xBoy - fs * 0.4)}" y2="${f(y(0))}" stroke="${oc}" stroke-width="${osw}"/>`,
    `<line x1="${f(xBoy)}" y1="${f(y(H))}" x2="${f(xBoy)}" y2="${f(y(0))}" stroke="${oc}" stroke-width="${osw}" marker-start="url(#zo2)" marker-end="url(#zo2)"/>`,
    `<text x="${f(xBoy - fs * 0.6)}" y="${f(y(H / 2))}" font-size="${f(fs)}" font-weight="700" fill="${oc}" text-anchor="middle" transform="rotate(-90 ${f(xBoy - fs * 0.6)} ${f(y(H / 2))})" font-family="Helvetica, Arial, sans-serif">BOY ${mm(H)}</text>`
  );
  // kasa yüksekliği (sağda)
  const xK = x(W) + fs * 1.2;
  p.push(
    `<line x1="${f(xK)}" y1="${f(y(H))}" x2="${f(xK)}" y2="${f(y(H - KASA))}" stroke="${oc}" stroke-width="${osw}"/>`,
    `<text x="${f(xK + fs * 0.4)}" y="${f(y(H - KASA / 2) + fs * 0.35)}" font-size="${f(fs * 0.8)}" fill="${oc}" font-family="Helvetica, Arial, sans-serif">${KASA}</text>`
  );
  return { body: p.join(''), w: L + W + R, h: T + H + B };
}

/** PDF sayfası için: solda izometrik görsel, sağda ölçülü önden görünüş. */
export function zipTeknikSvg(m: ZipCizimModeli): string {
  const iz = izometrik(m);
  const on = ondenGorunus(m);
  const izW = iz.maxX - iz.minX;
  const izH = iz.maxY - iz.minY;
  // iki görünüşü aynı yüksekliğe ölçekle, yan yana koy
  const hedefH = 1000;
  const s1 = hedefH / izH;
  const s2 = hedefH / on.h;
  const w1 = izW * s1;
  const w2 = on.w * s2;
  const bosluk = 80;
  const W = w1 + bosluk + w2;
  const etiket = (x: number, t: string) =>
    `<text x="${f(x)}" y="${f(hedefH + 70)}" font-size="34" font-weight="700" fill="#64748b" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(t)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${hedefH + 90}" width="100%">${MARKER('zo', '#0f766e')}${MARKER('zo2', '#0f766e')}
    <g transform="scale(${s1.toFixed(5)}) translate(${f(-iz.minX)} ${f(-iz.minY)})">${iz.body}</g>
    <g transform="translate(${f(w1 + bosluk)} 0) scale(${s2.toFixed(5)})">${on.body}</g>
    ${etiket(w1 / 2, 'Ürün görünüşü')}${etiket(w1 + bosluk + w2 / 2, 'Önden görünüş (mm)')}
  </svg>`;
}

/** PDF'teki döküm tablosu. */
export function zipDokumSatirlari(m: ZipCizimModeli): [string, string][] {
  const perdeEn = m.enMm - 2 * DIKME_EN;
  const perdeBoy = m.boyMm - KASA;
  return [
    ['Sistem', 'ART110 dikey zip perde'],
    ['Toplam ölçü (EN × BOY)', `${mm(m.enMm)} × ${mm(m.boyMm)} mm`],
    ['Perde açıklığı (yaklaşık)', `${mm(perdeEn)} × ${mm(perdeBoy)} mm`],
    ['Kasa profili', `${KASA} × ${KASA} mm, ${mm(m.enMm)} mm`],
    ['Dikme profili', `${DIKME_EN} × ${DIKME_DER} mm, 2 × ${mm(m.boyMm - KASA)} mm`],
    ['Etek profili', `45 × ${ETEK_Y} mm, ${mm(perdeEn)} mm`],
    ...(m.kumas ? [['Kumaş', m.kumas === 'sergeFerrari' ? 'Serge Ferrari' : 'Screen'] as [string, string]] : []),
    ...(m.motor ? [['Motor', m.motor === 'somfy' ? 'Somfy' : 'Mosel'] as [string, string]] : []),
    ...(m.logo ? [['Logo baskı', 'Var'] as [string, string]] : []),
  ];
}

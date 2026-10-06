// Anında Teklif — Reels v3 motoru (ES modülü). Plan verisini (timeline.js → window.V3T)
// sahne grafiğine çevirir; her şey render(t)'nin saf fonksiyonu: rAF / Date / CSS transition yok.
// Katmanlar: #bg → #back2d → #gl (three.js, alfa) → #css3d → #front2d → #fx. Ayrıntı: README.md
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const V3T = window.V3T;
const W = 1080, H = 1920;
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ======================================================================= matematik
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, a, b) => b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a));
const mix = (a, b, p) => a + (b - a) * p;
const E = {
  lin: x => clamp(x),
  out: x => (x = clamp(x), x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),            // expo out
  quint: x => (x = clamp(x), 1 - Math.pow(1 - x, 5)),
  cubic: x => (x = clamp(x), 1 - Math.pow(1 - x, 3)),
  inOut: x => (x = clamp(x), x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2), // quint in-out
  expoInOut: x => (x = clamp(x), x === 0 ? 0 : x === 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  sine: x => (x = clamp(x), -(Math.cos(Math.PI * x) - 1) / 2),
  in: x => (x = clamp(x), x * x * x),
  inExpo: x => (x = clamp(x), x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  back: x => { x = clamp(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  spring: x => { x = clamp(x); return x === 1 ? 1 : 1 - Math.exp(-6.5 * x) * Math.cos(10.5 * x); },
  soft: x => { x = clamp(x); return x === 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(6 * x); },
};
const ease = e => typeof e === 'function' ? e : (E[e] || E.inOut);
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return mix(hash(i + seed * 131), hash(i + 1 + seed * 131), u) * 2 - 1; };
const fbm = (x, seed = 0) => noise(x, seed) * .66 + noise(x * 2.13, seed + 17) * .34;
const D2R = Math.PI / 180;
const T = (v, dur, def) => V3T.T(v, dur, def);

// Anahtar kareler: [{t, ...sayılar, e:'quint'}] — eksik alanlar öncekinden taşınır; segment
// yumuşatması varış anahtarının `e`si (vars. quint in-out).
const KF = new WeakMap();
function kf(keys, t, defs = {}) {
  if (!keys || !keys.length) return { ...defs };
  let ex = KF.get(keys);
  if (!ex) { let prev = { ...defs }; ex = keys.map(k => (prev = { ...prev, ...k })); KF.set(keys, ex); }
  if (t <= ex[0].t) return ex[0];
  const last = ex[ex.length - 1]; if (t >= last.t) return last;
  let i = 0; while (t > ex[i + 1].t) i++;
  const a = ex[i], b = ex[i + 1], p = ease(b.e || 'inOut')(prog(t, a.t, b.t)), o = {};
  for (const k in b) { const va = a[k], vb = b[k]; o[k] = (typeof va === 'number' && typeof vb === 'number') ? mix(va, vb, p) : (p < .5 ? va : vb); }
  return o;
}
const resolveKeys = (keys, dur) => keys && keys.map(k => ({ ...k, t: T(k.t, dur, 0) }));

// ======================================================================= varlıklar
const FR = '../preview/frames/', MOB = '../footage/mobile/';
// Klipler: map = sahne zamanı → kaynak zamanı; redact = kaynak px dikdörtgenleri (kişisel veri / bayi fiyatı)
export const CLIPS = {
  // Zip Perde: EN/BOY yazılır → fiyat. Kaydırma (3.1–4.05 sn) "Bayi fiyatı" satırını
  // geçtiği için atlanır; oturduktan sonra satır her zaman bulanıklaştırılır.
  zip: { dir: FR + 'v01_zip_perde_olcu_fiyat', n: 184, map: t => t < 3.1 ? t : t + 0.95,
    redact: [{ from: 1.45, to: 1.82, rect: [56, 2040, 1066, 100] },   // fiyat kartı yazarken bir an sayfa altında belirir
             { from: 3.5, rect: [64, 1458, 1050, 108] }], len: 5.15 },
  pdf: { dir: FR + 'v03_teklif_pdf_onizleme', n: 144, len: 4.8,
    redact: [{ from: 0.5, rect: [70, 650, 540, 200] }, { from: 0.5, rect: [690, 1236, 430, 64] }] },
  panel: { dir: FR + 'v04_panel_kaydirma', n: 135, map: t => 2.0 + t, len: 2.5 },   // 2.0 sn öncesi kişi adı içerir
  ai: { dir: FR + 'v05_ai_asistan', n: 164, len: 5.4 },
};
export const STILLS = {
  m_02: { src: MOB + 'm_02_panel_genel_bakis.png' },
  m_04: { src: MOB + 'm_04_teklif_katalogdan_ekle.png' },
  m_05: { src: MOB + 'm_05_teklif_kalemler.png' },
  m_06: { src: MOB + 'm_06_teklif_toplam.png' },
  m_08: { src: MOB + 'm_08_zip_perde_olcu.png' },
  m_09: { src: MOB + 'm_09_zip_perde_cizim.png', redact: [{ rect: [64, 1376, 1050, 104] }] },   // Bayi fiyatı satırı
  m_10: { src: MOB + 'm_10_zip_perde_fiyat.png', redact: [{ rect: [64, 1298, 1050, 102] }] },
  m_16: { src: MOB + 'm_16_ai_asistan.png' },
  m_18: { src: MOB + 'm_18_katalog.png' },
};
// Sık kullanılan kaynak dikdörtgenleri (1170×2532 px)
export const RECTS = {
  zipSatis: [86, 1856, 1012, 82], zipOlcu: [40, 520, 1090, 330], zipSecenek: [40, 1250, 1090, 560],
  m10Satis: [86, 1793, 1000, 84], m06Toplam: [68, 1503, 1034, 138], pdfToplam: [68, 1503, 1034, 138],
};
const imgCache = new Map();
function loadImg(url) {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise(res => { const i = new Image(); i.onload = () => i.decode().then(() => res(i), () => res(i)); i.onerror = () => res(null); i.src = url; });
    imgCache.set(url, p);
    if (imgCache.size > 48) imgCache.delete(imgCache.keys().next().value);
  }
  return p;
}
function sourceAt(spec, lt) {
  if (spec.still) { const s = STILLS[spec.still] || { src: spec.still }; return { url: s.src, redact: (s.redact || []).map(r => r.rect).concat(spec.redact || []) }; }
  const c = CLIPS[spec.clip]; if (!c) throw new Error('bilinmeyen klip: ' + spec.clip);
  let st = (spec.from || 0) + lt * (spec.rate ?? 1);
  if (spec.hold != null) st = Math.min(st, spec.hold);
  const src = c.map ? c.map(st) : st;
  const i = clamp(Math.floor(src * 30 + 1e-6) + 1, 1, c.n);
  const red = (c.redact || []).filter(r => src >= r.from && src < (r.to ?? 1e9)).map(r => r.rect).concat(spec.redact || []);
  return { url: `${c.dir}/${String(i).padStart(4, '0')}.jpg`, redact: red, srcT: src };
}

// ======================================================================= dünyalar
export const WORLDS = {
  midnight: { base: '#05060F', blobs: [['#4F46E5', .16, .1, 1000, .62], ['#8B87FF', .96, .6, 720, .24], ['#16195A', .45, 1.02, 1200, .85]], ink: '#F5F5F2', muted: 'rgba(245,245,242,.62)', accent: '#8B87FF', accent2: '#F5B544', dark: 1, glow: '#5B53F0' },
  indigo: { base: '#2A22B5', blobs: [['#6C64FF', .12, .08, 1100, .95], ['#9A96FF', .95, .48, 820, .55], ['#140C70', .55, 1.06, 1250, .95], ['#F5B544', 1.02, -.02, 520, .3]], ink: '#FFFFFF', muted: 'rgba(255,255,255,.74)', accent: '#FFD27A', accent2: '#F5B544', dark: 1, glow: '#B9B5FF' },
  amber: { base: '#F6B23E', blobs: [['#FFD889', .15, .08, 1050, .95], ['#FF7E36', .98, .74, 950, .6], ['#FFF0CC', .55, .32, 700, .45]], ink: '#17110A', muted: 'rgba(23,17,10,.64)', accent: '#2F27C2', accent2: '#4F46E5', dark: 0, shadow: 'rgba(110,50,0,.42)' },
  mint: { base: '#E4FAF0', blobs: [['#34D399', .08, .12, 950, .5], ['#A7F3D0', .92, .5, 820, .75], ['#FFFFFF', .5, .92, 900, .85]], ink: '#04140D', muted: 'rgba(4,20,13,.6)', accent: '#0B8F63', accent2: '#34D399', dark: 0, shadow: 'rgba(6,60,40,.32)' },
  paper: { base: '#F1F0EB', blobs: [['#FFFFFF', .5, .28, 1000, .95], ['#E2E0F8', .08, .9, 900, .7], ['#FBE5C0', .96, .08, 700, .55]], ink: '#0B0B12', muted: 'rgba(11,11,18,.56)', accent: '#4F46E5', accent2: '#F5B544', dark: 0, shadow: 'rgba(20,20,45,.38)' },
  graphite: { base: '#09090C', blobs: [['#3A3A48', .5, -.02, 1150, .85], ['#4F46E5', .5, 1.12, 950, .32]], ink: '#F2F2F2', muted: 'rgba(242,242,242,.56)', accent: '#F5B544', accent2: '#8B87FF', dark: 1, glow: '#7B78A8' },
  dusk: { base: '#130E36', blobs: [['#4F46E5', .08, .18, 950, .85], ['#F0617A', .98, .36, 820, .45], ['#F5B544', .72, 1.02, 1000, .55]], ink: '#FFFFFF', muted: 'rgba(255,255,255,.7)', accent: '#FFC86B', accent2: '#F5B544', dark: 1, glow: '#FF9DB0' },
  forest: { base: '#03130E', blobs: [['#0F9F6E', .18, .12, 1000, .6], ['#34D399', .92, .72, 720, .26], ['#062A1F', .5, 1.05, 1100, .9]], ink: '#EFFFF7', muted: 'rgba(239,255,247,.62)', accent: '#34D399', accent2: '#F5B544', dark: 1, glow: '#1FBF86' },
};

// ======================================================================= GL kurulum
let renderer, scene, camera, css3d, cssScene, pmrem;
function initGL() {
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  scene = new THREE.Scene();
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 4, 5); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x9C97FF, 2.4); rimA.position.set(4, 2, -3); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0xDDE4FF, 1.1); rimB.position.set(-4, -1, -3); scene.add(rimB);
  GL.rimA = rimA; GL.rimB = rimB; GL.key = key;
  camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);
  cssScene = new THREE.Scene();
  css3d = new CSS3DRenderer({ element: $('#css3d') }); css3d.setSize(W, H);
}
const GL = {};

// ======================================================================= kamera rig
const RIG0 = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, roll: 0, dist: 5, fov: 30, x: 0, y: 0 };
const rig = { s: { ...RIG0 }, shake: 0, t: 0,
  reset() { this.s = { ...RIG0 }; this.shake = 0; },
  set(o) { Object.assign(this.s, o); },
  apply() {
    const s = this.s, a = this.shake, tt = this.t;
    const yaw = (s.yaw + fbm(tt * .55, 1) * a * .9) * D2R, pitch = (s.pitch + fbm(tt * .5, 2) * a * .6) * D2R, roll = (s.roll + fbm(tt * .45, 3) * a * .45) * D2R;
    const tg = new THREE.Vector3(s.tx, s.ty, s.tz);
    camera.fov = s.fov; camera.position.set(tg.x + s.dist * Math.sin(yaw) * Math.cos(pitch), tg.y + s.dist * Math.sin(pitch), tg.z + s.dist * Math.cos(yaw) * Math.cos(pitch));
    camera.up.set(0, 1, 0); camera.lookAt(tg); camera.rotateZ(roll);
    if (s.x || s.y) camera.setViewOffset(W, H, -s.x, -s.y, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  },
};
// px (ekran) ↔ dünya
const _v = new THREE.Vector3();
function project(v) { _v.copy(v).project(camera); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, z: _v.z }; }
function wpp(depth) { return 2 * depth * Math.tan(camera.fov * D2R / 2) / H; } // dünya birimi / px, kameradan `depth` uzaklıkta
function rayPoint(x, y, depth) {
  const v = new THREE.Vector3((x / W) * 2 - 1, 1 - (y / H) * 2, 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize(), fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  return camera.position.clone().add(dir.multiplyScalar(depth / dir.dot(fwd)));
}

// ======================================================================= ekran bileşimcisi
// Kaynak 1170×2532 → 2B tuval: üstte yapay durum çubuğu (Dynamic Island için), içerik %94 ölçek,
// kenarlar kaynağın kenar pikselleriyle uzatılır; bulanık örtüler, vurgular, delikler burada çizilir.
const SW = 1170, SH = 2532, SB = 150, S = (SH - SB) / SH, MX = SW * (1 - S) / 2;
const comp = {
  c: null, g: null, tex: null, key: '', img: null,
  init() {
    this.c = el('canvas'); this.c.width = SW; this.c.height = SH; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); this.tex.minFilter = THREE.LinearMipmapLinearFilter;
  },
  map(r) { return [MX + r[0] * S, SB + r[1] * S, r[2] * S, r[3] * S]; },
  draw(img, o) {
    const key = img.src + '|' + JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v);
    if (key === this.key) return false; this.key = key; this.img = img;
    const g = this.g;
    g.save(); g.fillStyle = '#fff'; g.fillRect(0, 0, SW, SH);
    g.drawImage(img, 0, 0, SW, 2, 0, 0, SW, SB + 2);                      // durum çubuğu: üst satır uzatılır
    g.drawImage(img, 0, 0, 2, SH, 0, SB, MX + 1, SH - SB);                // sol kenar
    g.drawImage(img, SW - 2, 0, 2, SH, SW - MX - 1, SB, MX + 1, SH - SB);  // sağ kenar
    g.drawImage(img, MX, SB, SW * S, SH * S);
    for (const r of o.redact || []) this.frost(img, r);
    this.statusBar();
    for (const h of o.hl || []) this.highlight(h);
    if (o.dim) { g.fillStyle = `rgba(8,10,24,${o.dim})`; g.fillRect(0, 0, SW, SH); }
    g.restore(); this.tex.needsUpdate = true; return true;
  },
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.roundRect(x, y, w, h, r); },
  frost(img, r) {
    const g = this.g, [x, y, w, h] = this.map(r), m = 30;
    g.save(); this.rr(x, y, w, h, 18); g.clip();
    g.filter = 'blur(16px)'; g.drawImage(img, r[0] - m, r[1] - m, r[2] + 2 * m, r[3] + 2 * m, x - m * S, y - m * S, w + 2 * m * S, h + 2 * m * S);
    g.filter = 'none'; g.fillStyle = 'rgba(236,239,245,.72)'; g.fillRect(x, y, w, h);
    g.restore();
  },
  statusBar() {
    const g = this.g; g.fillStyle = '#0B0B12'; g.font = '700 50px "Plus Jakarta Sans"'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('9:41', 205, 88);
    const x0 = 875, y0 = 88; // sinyal
    [10, 17, 24, 31].forEach((h, i) => { g.beginPath(); g.roundRect(x0 + i * 15, y0 + 15 - h, 10, h, 3); g.fill(); });
    g.save(); g.translate(958, y0 + 12); g.lineWidth = 7.5; g.lineCap = 'round'; g.strokeStyle = '#0B0B12'; // wifi
    [28, 18].forEach(r => { g.beginPath(); g.arc(0, 0, r, -Math.PI * .78, -Math.PI * .22); g.stroke(); });
    g.beginPath(); g.arc(0, 0, 3.6, 0, 7); g.fill(); g.restore();
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(11,11,18,.45)'; this.rr(1004, y0 - 16, 64, 32, 10); g.stroke(); // pil
    g.fillStyle = '#0B0B12'; this.rr(1010, y0 - 10, 44, 20, 5); g.fill(); this.rr(1071, y0 - 6, 5, 12, 2); g.fill();
  },
  highlight(h) {
    const g = this.g, p = h.p; if (p <= 0) return;
    const [x, y, w, hh] = this.map(h.rect), pad = 10;
    if (h.style === 'spot' || h.style === 'both') {
      g.save(); g.fillStyle = `rgba(6,8,22,${.5 * p})`; g.beginPath(); g.rect(0, 0, SW, SH); g.roundRect(x - pad, y - pad, w + 2 * pad, hh + 2 * pad, 22); g.fill('evenodd'); g.restore();
    }
    if (h.style === 'ring' || h.style === 'both') {
      const s = 1 + (1 - p) * .06, cx = x + w / 2, cy = y + hh / 2;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.strokeStyle = h.color || '#4F46E5'; g.globalAlpha = p; g.lineWidth = 9;
      g.beginPath(); g.roundRect(-w / 2 - pad, -hh / 2 - pad, w + 2 * pad, hh + 2 * pad, 24); g.stroke(); g.restore();
    }
    if (h.style === 'hole') {
      g.save(); g.globalAlpha = p; g.fillStyle = '#E6E9F0'; g.beginPath(); g.roundRect(x - 4, y - 4, w + 8, hh + 8, 20); g.fill();
      g.strokeStyle = 'rgba(15,23,42,.10)'; g.lineWidth = 3; g.setLineDash([14, 10]); g.stroke(); g.restore();
    }
  },
};

// ======================================================================= 3B telefon
const PH = { W: 0.72, Ws: 0.672, D: 0.082, R: 0.118, bs: 0.012, bt: 0.014 };
PH.Hs = PH.Ws * SH / SW; PH.H = PH.Hs + (PH.W - PH.Ws); PH.Rs = PH.R - (PH.W - PH.Ws) / 2 + .004; PH.zs = PH.D / 2 + 0.0009;
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5); return s;
}
function shapeGeo(w, h, r, seg = 24) {
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), seg), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}
export const FINISH = {
  graphite: { frame: 0x2E3036, rough: .26, back: 0x24252B },
  titanium: { frame: 0x9C968D, rough: .34, back: 0xB8B2A8 },
  silver: { frame: 0xDADBE0, rough: .2, back: 0xE9E9EC },
  indigo: { frame: 0x34308A, rough: .28, back: 0x2B2770 },
  black: { frame: 0x16161A, rough: .3, back: 0x111114 },
};
const phone = {
  init() {
    const g = this.g = new THREE.Group(); scene.add(g);
    this.frameMat = new THREE.MeshPhysicalMaterial({ color: 0x2E3036, metalness: 1, roughness: .26, clearcoat: .6, clearcoatRoughness: .18, envMapIntensity: 1.25 });
    this.backMat = new THREE.MeshPhysicalMaterial({ color: 0x24252B, metalness: 0, roughness: .42, clearcoat: 1, clearcoatRoughness: .28 });
    const body = new THREE.ExtrudeGeometry(rrShape(PH.W - 2 * PH.bs, PH.H - 2 * PH.bs, PH.R - PH.bs), { depth: PH.D - 2 * PH.bt, bevelEnabled: true, bevelThickness: PH.bt, bevelSize: PH.bs, bevelSegments: 7, curveSegments: 28 });
    body.translate(0, 0, -(PH.D - 2 * PH.bt) / 2);
    g.add(new THREE.Mesh(body, [this.backMat, this.frameMat]));
    // ön cam (çerçeve içi siyah) + ekran + Dynamic Island + yansıma + parlama süpürmesi
    const bez = new THREE.Mesh(shapeGeo(PH.W - 2 * PH.bs + .004, PH.H - 2 * PH.bs + .004, PH.R - PH.bs + .002), new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: .08, metalness: 0, clearcoat: 1, clearcoatRoughness: .04 }));
    bez.position.z = PH.D / 2 + .0003; g.add(bez);
    this.screenMat = new THREE.MeshBasicMaterial({ map: comp.tex, toneMapped: false });
    this.screen = new THREE.Mesh(shapeGeo(PH.Ws, PH.Hs, PH.Rs, 32), this.screenMat); this.screen.position.z = PH.zs; g.add(this.screen);
    const iw = .32 * PH.Ws, ih = .043 * PH.Hs;
    const isl = new THREE.Mesh(shapeGeo(iw, ih, ih / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    isl.position.set(0, PH.Hs / 2 - .0135 * PH.Hs - ih / 2, PH.zs + .0004); g.add(isl);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(ih * .17, 20), new THREE.MeshBasicMaterial({ color: 0x0B0E1C })); lens.position.set(iw * .3, isl.position.y, PH.zs + .0006); g.add(lens);
    const refl = new THREE.Mesh(shapeGeo(PH.W - 2 * PH.bs + .004, PH.H - 2 * PH.bs + .004, PH.R - PH.bs + .002), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: .04, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.4 }));
    refl.position.z = PH.zs + .0010; g.add(refl);
    this.sweep = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uPos: { value: .5 }, uStr: { value: .1 }, uW: { value: .16 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec2 vUv; uniform float uPos,uStr,uW; void main(){ float d=(vUv.x*.55+vUv.y*.9)-uPos; float b=exp(-d*d/(uW*uW)); float c=exp(-(d+.2)*(d+.2)/(uW*uW*.08))*.6; gl_FragColor=vec4(vec3(1.), (b+c)*uStr); }' });
    const sw = new THREE.Mesh(shapeGeo(PH.Ws, PH.Hs, PH.Rs), this.sweep); sw.position.z = PH.zs + .0012; g.add(sw);
    // yan tuşlar
    const btn = (x, y, len) => { const m = new THREE.Mesh(new RoundedBoxGeometry(.014, len, .026, 2, .006), this.frameMat); m.position.set(x, y, 0); g.add(m); };
    btn(-PH.W / 2 - .002, .40, .055); btn(-PH.W / 2 - .002, .27, .1); btn(-PH.W / 2 - .002, .15, .1); btn(PH.W / 2 + .002, .26, .16);
    // arka kamera adası
    const bump = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(.3, .31, .075), { depth: .01, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 3, curveSegments: 16 }), this.backMat);
    bump.rotation.y = Math.PI; bump.position.set(PH.W / 2 - .19, PH.H / 2 - .195, -PH.D / 2 + .002); g.add(bump);
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x06070C, roughness: .05, metalness: .2, clearcoat: 1 }), ringMat = this.frameMat;
    [[-.065, .07], [-.065, -.07], [.07, 0]].forEach(([dx, dy]) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .016, 32), ringMat); r.rotation.x = Math.PI / 2;
      r.position.set(PH.W / 2 - .19 + dx, PH.H / 2 - .195 + dy, -PH.D / 2 - .014); g.add(r);
      const l = new THREE.Mesh(new THREE.CircleGeometry(.04, 32), lensMat); l.rotation.y = Math.PI; l.position.set(r.position.x, r.position.y, -PH.D / 2 - .0225); g.add(l);
    });
    g.visible = false;
  },
  finish(name) { const f = FINISH[name] || FINISH.graphite; this.frameMat.color.setHex(f.frame); this.frameMat.roughness = f.rough; this.backMat.color.setHex(f.back); },
  pose(p) {
    const g = this.g; g.visible = true;
    g.position.set(p.px || 0, p.py || 0, p.pz || 0); g.rotation.set((p.rx || 0) * D2R, (p.ry || 0) * D2R, (p.rz || 0) * D2R, 'YXZ'); g.scale.setScalar(p.s ?? 1);
    g.updateMatrixWorld(true);
    // parlama süpürmesi telefonun dönüşüne bağlı (+ isteğe bağlı sweep anahtarı)
    this.sweep.uniforms.uPos.value = (p.sweep ?? .55) + (p.ry || 0) * D2R * 1.3 - (p.rx || 0) * D2R * .8;
    this.sweep.uniforms.uStr.value = p.glare ?? .09;
    this.screenMat.color.setScalar(p.bright ?? 1);
  },
  // kaynak px → telefon yerel koordinatı
  local(sx, sy, dz = 0) { return new THREE.Vector3((MX + sx * S) / SW * PH.Ws - PH.Ws / 2, PH.Hs / 2 - (SB + sy * S) / SH * PH.Hs, PH.zs + dz); },
  world(sx, sy, dz = 0) { return this.g.localToWorld(this.local(sx, sy, dz)); },
  srcPxWorld() { return PH.Ws / SW * S * this.g.scale.x; },
};

// ======================================================================= konfeti (instanced)
const confetti = {
  N: 150,
  init() {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), this.N);
    m.frustumCulled = false; m.visible = false; scene.add(m); this.m = m;
    const pal = ['#8B87FF', '#4F46E5', '#F5B544', '#34D399', '#FFFFFF', '#F0617A'];
    for (let i = 0; i < this.N; i++) m.setColorAt(i, new THREE.Color(pal[i % pal.length]));
    m.instanceColor.needsUpdate = true; this.o = new THREE.Object3D();
  },
  // origin: dünya noktası; tau: patlamadan beri geçen süre
  draw(origin, tau, { n = 120, power = 1, seed = 1, spread = 1 } = {}) {
    if (tau < 0 || tau > 2.6) return; const m = this.m, o = this.o; m.visible = true; m.count = Math.min(n, this.N);
    for (let i = 0; i < m.count; i++) {
      const r = k => hash(i * 13.7 + k * 3.1 + seed * 71);
      const th = r(1) * Math.PI * 2, ph = (r(2) * .85 + .1) * Math.PI / 2 * spread, sp = (1.6 + r(3) * 2.6) * power, k = 2.4;
      const v = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.sin(ph) * 1.1 + .2, Math.sin(th) * Math.cos(ph) * .6).multiplyScalar(sp);
      const f = (1 - Math.exp(-k * tau)) / k;
      o.position.set(origin.x + v.x * f + Math.sin(tau * 5 + i) * .03, origin.y + v.y * f - 1.3 * tau * tau * .5 - .25 * tau, origin.z + v.z * f);
      o.rotation.set(tau * (3 + r(4) * 9) + r(5) * 6, tau * (2 + r(6) * 7), tau * (2 + r(7) * 5));
      const life = 1.6 + r(8) * .9, sc = (1 - prog(tau, life - .5, life)) * Math.min(1, tau * 12);
      o.scale.set(.045 * sc, (r(9) > .5 ? .028 : .045) * sc, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  },
};

// ======================================================================= logo (3B şimşek karo)
const logo = {
  init() {
    const g = this.g = new THREE.Group(); scene.add(g); g.visible = false;
    const s = .44, tile = new THREE.ExtrudeGeometry(rrShape(s - .06, s - .06, .1), { depth: .07, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 8, curveSegments: 24 });
    tile.translate(0, 0, -.035);
    this.tileMat = new THREE.MeshPhysicalMaterial({ color: 0x4F46E5, roughness: .32, metalness: .05, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.1, sheen: .6, sheenColor: new THREE.Color(0x9C97FF) });
    g.add(new THREE.Mesh(tile, this.tileMat));
    const pts = [[14, 1], [3, 16], [10, 16], [8, 27], [19, 12], [12, 12]], k = s * .62 / 26;
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 11) * k, -(y - 14) * k)));
    const bolt = new THREE.ExtrudeGeometry(sh, { depth: .02, bevelEnabled: true, bevelThickness: .012, bevelSize: .006, bevelSegments: 3 });
    this.boltMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .18, metalness: 0, clearcoat: 1, emissive: 0xffffff, emissiveIntensity: .22 });
    const b = new THREE.Mesh(bolt, this.boltMat); b.position.z = .07 + .012; g.add(b);
    this.light = new THREE.PointLight(0xffffff, 0, 3, 1.5); scene.add(this.light);
  },
};

// ======================================================================= ikonlar
export const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#06140D" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  bolt: '<svg viewBox="0 0 24 28"><path d="M14 1 3 16h7l-2 11 11-15h-7l2-11z" fill="#fff"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M6 2.5h8l5 5V21a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 21z"/><path d="M14 2.5V8h5M9 13h6M9 17h4" stroke-linecap="round"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M11 2l1.9 5.6L18.5 9.5l-5.6 1.9L11 17l-1.9-5.6L3.5 9.5l5.6-1.9zM18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.2 8.5 8 12 8zm0 0s1.5-4.5 4-3.8S15.5 8 12 8z"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><rect x="2.5" y="7.5" width="19" height="9" rx="1.5"/><path d="M6.5 7.5v4M10.5 7.5v3M14.5 7.5v4M18.5 7.5v3" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M3 11.5 21 3l-6.5 18-3-7.5z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z"/></svg>',
  euro: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M17.5 6.5A7 7 0 1 0 17.5 17.5M4 10.5h9M4 13.5h9"/></svg>',
};

// ======================================================================= kinetik tipografi
// İşaretleme: *serif italik*  [vurgu rengi]  ~altı çizili süpürme~  \n satır
function parse(str) {
  const lines = []; let line = [], word = [], seg = '', st = { it: 0, ac: 0, ul: 0 };
  const cls = () => [st.it && 'it', st.ac && 'ac', st.ul && 'ul'].filter(Boolean).join(' ');
  const pushSeg = () => { if (seg) word.push({ s: seg, c: cls() }); seg = ''; };
  const pushWord = () => { pushSeg(); if (word.length) line.push(word); word = []; };
  for (const ch of str) {
    if (ch === '*') { pushSeg(); st.it ^= 1; } else if (ch === '[' || ch === ']') { pushSeg(); st.ac = ch === '[' ? 1 : 0; }
    else if (ch === '~') { pushSeg(); st.ul ^= 1; } else if (ch === ' ') pushWord();
    else if (ch === '\n') { pushWord(); lines.push(line); line = []; } else seg += ch;
  }
  pushWord(); lines.push(line); return lines;
}
const CHAR_KINDS = new Set(['chars', 'weight', 'type', 'scramble', 'wave']);
const MASK_KINDS = new Set(['rise', 'chars', 'cycle']);
const GLYPH = '0123456789ABCDEFGHJKLMNPRSTUVXYZ';
const trNum = (v, d = 2) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

class Txt {
  constructor(c, parent, dur) {
    this.c = c; this.dur = dur; this.uls = []; this.at = T(c.at, dur, 0); this.out = c.out != null ? T(c.out, dur) : null;
    const k = this.kind = c.kind || 'rise';
    const e = this.el = el('div', 'tx ' + (c.style || '') + (MASK_KINDS.has(k) ? ' mask' : '') + (c.box ? ' boxed' : '') + (c.deco ? ' deco' : ''));
    const st = e.style, center = c.align === 'center', right = c.align === 'right';
    st.textAlign = c.align || 'left';
    if (c.inline) { st.position = 'relative'; st.display = 'inline-block'; st.color = 'inherit'; st.letterSpacing = 'inherit'; }
    else st.top = (c.y ?? 400) + 'px';
    if (c.inline) {} else if (center && c.x == null) { st.left = '0px'; st.width = W + 'px'; } else { st.left = (c.x ?? 84) + 'px'; if (c.w) st.width = c.w + 'px'; }
    if (right && c.w == null) { st.left = 'auto'; st.right = (W - (c.x ?? 996)) + 'px'; }
    if (c.size) st.fontSize = c.size + 'px'; if (c.weight) st.fontWeight = c.weight; if (c.color) st.color = c.color;
    if (c.ls != null) st.letterSpacing = c.ls + 'em'; if (c.lh) st.lineHeight = c.lh; if (c.z) st.zIndex = c.z;
    if (c.wrap) st.whiteSpace = 'normal';
    this.ls0 = c.ls ?? null;
    parent.appendChild(e);
    if (k === 'timer') this.buildTimer();
    else if (k === 'counter') this.buildCounter();
    else if (k === 'cycle') this.buildCycle();
    else this.buildText();
  }
  buildText() {
    const k = this.kind, lines = parse(this.c.text || ''), chars = CHAR_KINDS.has(k);
    this.units = []; this.uls = []; this.chars = [];
    for (const line of lines) {
      const ln = el('div', 'ln');
      line.forEach((word, wi) => {
        if (wi) ln.appendChild(document.createTextNode(' '));
        const w = el('span', 'w'), inner = el('span', 'wi'); w.appendChild(inner); ln.appendChild(w);
        for (const sg of word) {
          const s = el('span', 'seg ' + sg.c); inner.appendChild(s); if (sg.c.includes('ul')) this.uls.push(s);
          if (chars) for (const ch of sg.s) { const cw = el('span', 'chw'), cc = el('span', 'ch', ch === ' ' ? ' ' : ''); if (ch !== ' ') cc.textContent = ch; cw.appendChild(cc); s.appendChild(cw); this.chars.push(cc); }
          else s.textContent = sg.s;
        }
        if (!chars) this.units.push(inner);
      });
      this.el.appendChild(ln);
    }
    if (chars) this.units = this.chars;
    if (k === 'type') { this.caret = el('span', 'caret'); this.el.lastChild.appendChild(this.caret); }
    if (k === 'scramble') this.final = this.chars.map(c => c.textContent);
  }
  buildTimer() {
    const c = this.c; this.el.classList.add('num');
    this.el.innerHTML = `<span class="v"></span>${c.suffix ? `<span class="it" style="font-size:${c.suffixSize || .34}em;letter-spacing:0;margin-left:.08em">${c.suffix}</span>` : ''}`;
    this.v = this.el.querySelector('.v'); this.units = [this.el];
  }
  buildCounter() {
    const c = this.c, d = c.decimals ?? 2, s = trNum(c.value, d);
    this.el.classList.add('num');
    let h = c.prefix ? `<span>${c.prefix}</span>` : '';
    this.cols = [];
    for (const ch of s) {
      if (/\d/.test(ch)) h += `<span class="odo"><span>${'0123456789'.repeat(2).split('').map(x => `<i>${x}</i>`).join('')}${'0123456789'.split('').map(x => `<i>${x}</i>`).join('')}</span></span>`;
      else h += `<span>${ch}</span>`;
    }
    if (c.suffix) h += `<span class="it" style="font-size:.5em;margin-left:.1em">${c.suffix}</span>`;
    this.el.innerHTML = h;
    this.cols = [...this.el.querySelectorAll('.odo > span')].map((e, i, a) => ({ e, d: +s.replace(/\D/g, '')[i], k: a.length - 1 - i }));
    this.units = [this.el];
  }
  buildCycle() {
    const c = this.c; this.words = c.words;
    this.el.innerHTML = (c.before ? c.before + ' ' : '') + `<span class="cyc"><span></span><span></span></span>` + (c.after ? ' ' + c.after : '');
    [this.a, this.b] = this.el.querySelectorAll('.cyc > span'); this.cyc = this.el.querySelector('.cyc'); this.units = [this.el];
  }
  render(lt) {
    const c = this.c, k = this.kind, a = this.at, e = this.el;
    const visible = lt >= a - 1e-6 || (c.pre ?? 0) > 0;
    if (!visible || (this.out != null && lt > this.out + .6)) { e.style.visibility = 'hidden'; return; }
    e.style.visibility = 'visible';
    const n = this.units.length, st = c.stagger ?? (CHAR_KINDS.has(k) ? .028 : .06), dur = c.dur ?? .8, pre = c.pre ?? 0;
    const P = i => clamp(pre + (1 - pre) * prog(lt, a + i * st, a + i * st + dur));
    const Q = i => this.out == null ? 0 : E.in(prog(lt, this.out + i * .025, this.out + .32 + i * .025));
    if (k === 'type') {
      const nn = Math.round(clamp(pre + prog(lt, a, a + (c.dur ?? n * .06))) * n);
      this.chars.forEach((ch, i) => ch.parentNode.style.display = i < nn ? '' : 'none');
      if (this.caret) this.caret.style.opacity = (nn < n || Math.floor((lt - a) * 2.6) % 2 === 0) ? 1 : 0;
      e.style.opacity = 1 - Q(0);
    } else if (k === 'scramble') {
      const fr = Math.floor(lt * 30);
      this.chars.forEach((ch, i) => { const p = P(i); const f = this.final[i];
        ch.textContent = p >= 1 || f === ' ' ? f : (p <= 0 ? '' : GLYPH[Math.floor(hash(fr * 7.3 + i * 13.1) * GLYPH.length)]);
        ch.style.opacity = p > 0 ? (p >= 1 ? 1 : .55) : 0; });
      e.style.opacity = 1 - Q(0);
    } else if (k === 'timer') {
      const r = c.run || [0, 1], r0 = T(r[0], this.dur), r1 = T(r[1], this.dur), p = prog(lt, r0, r1), v = mix(c.from ?? 0, c.to ?? 1, c.ease ? ease(c.ease)(p) : p);
      this.v.textContent = trNum(v, c.decimals ?? 2);
      const done = lt >= r1, pin = E.out(prog(lt, r1, r1 + .5));
      const pi = P(0); e.style.opacity = Math.min(1, pi * 1.5) * (1 - Q(0));
      e.style.transform = `translateY(${(1 - E.out(pi)) * 40}px) scale(${1 + (done ? (1 - pin) * .06 : 0)})`;
      e.style.color = done && c.doneColor ? c.doneColor : (c.color || '');
      e.style.filter = pi < 1 ? `blur(${(1 - pi) * 18}px)` : 'none';
    } else if (k === 'counter') {
      const r = c.run || [a, a + .9], r0 = T(r[0], this.dur), r1 = T(r[1], this.dur);
      const at = x => this.cols.map(col => mix(0, 20 + col.d, E.quint(prog(x, r0, r1 + col.k * .06))));
      const now = at(lt), prev = at(lt - 1 / 30);
      this.cols.forEach((col, i) => { const v = Math.abs(now[i] - prev[i]); col.e.style.transform = `translateY(${-now[i] * 1.08}em)`; col.e.style.filter = v > .15 ? `blur(${Math.min(5, v * 1.2).toFixed(1)}px)` : 'none'; });
      const pi = P(0); e.style.opacity = Math.min(1, pi * 2) * (1 - Q(0)); e.style.transform = `translateY(${(1 - E.out(pi)) * 30}px)`;
    } else if (k === 'cycle') {
      const per = c.period ?? .9, i = clamp(Math.floor((lt - a) / per), 0, this.words.length - 1), f = (lt - a) - i * per;
      const sw = i > 0 ? E.out(prog(f, 0, .45)) : 1, prev = this.words[Math.max(0, i - 1)], cur = this.words[i];
      this.a.textContent = cur; this.b.textContent = i > 0 && sw < 1 ? prev : '';
      this.a.style.transform = `translateY(${(1 - sw) * 110}%)`; this.b.style.transform = `translateY(${-sw * 110}%)`;
      const pi = P(0); e.style.opacity = Math.min(1, pi * 2) * (1 - Q(0)); e.style.transform = `translateY(${(1 - E.out(pi)) * 40}px)`;
      if (c.cycleColor) this.a.style.color = c.cycleColor;
    } else if (k === 'stamp') {
      const p = P(0), s = mix(c.from ?? 2.4, 1, E.out(p)), q = Q(0);
      e.style.opacity = clamp(p * 4) * (1 - q); e.style.transform = `scale(${s}) rotate(${(1 - E.out(p)) * (c.rot ?? -8)}deg)`;
      e.style.filter = p < 1 ? `blur(${(1 - E.out(p)) * 10}px)` : 'none';
    } else {
      this.units.forEach((u, i) => {
        const p = P(i), q = Q(i), ep = (c.ease ? ease(c.ease) : E.out)(p); let tf = '', op = 1, bl = 0;
        if (k === 'rise' || k === 'chars') { tf = `translateY(${(1 - ep) * 115 - q * 115}%) rotate(${(1 - ep) * (c.tilt ?? 3)}deg)`; }
        else if (k === 'blur') { tf = `translateY(${(1 - ep) * .3 - q * .2}em) scale(${.94 + .06 * ep})`; op = clamp(p * 1.6) * (1 - q); bl = (1 - ep) * 22 + q * 14; }
        else if (k === 'snap') { const s = mix(c.from ?? 1.7, 1, E.spring(p)); tf = `scale(${s - q * .3})`; op = clamp(p * 5) * (1 - q); bl = (1 - clamp(p * 3)) * 10; }
        else if (k === 'weight') { u.style.fontVariationSettings = `'wght' ${Math.round(mix(c.w0 ?? 200, c.w1 ?? 800, E.inOut(p)))}`; u.style.fontWeight = Math.round(mix(c.w0 ?? 200, c.w1 ?? 800, E.inOut(p)));
          op = clamp(p * 3) * (1 - q); tf = `translateY(${(1 - ep) * .15 - q * .2}em)`; }
        else if (k === 'wave') { tf = `translateY(${(1 - ep) * 0.6 - q * .3}em) scale(${mix(.3, 1, E.back(p))})`; op = clamp(p * 3) * (1 - q); }
        else if (k === 'fade' || k === 'track') { tf = `translateY(${(1 - ep) * 24 - q * 20}px)`; op = clamp(p * 1.4) * (1 - q); bl = (1 - ep) * 8; }
        u.style.transform = tf; u.style.opacity = op; u.style.filter = bl > .3 ? `blur(${bl}px)` : 'none';
      });
      if (k === 'track') { const p = E.out(P(0)); e.style.letterSpacing = mix(c.ls0 ?? .5, this.ls0 ?? -.045, p) + 'em'; }
      if (k === 'weight' && c.track !== false) { const p = E.out(prog(lt, a, a + dur + n * st)); e.style.letterSpacing = mix(.08, this.ls0 ?? -.045, p) + 'em'; }
    }
    // altı çizili süpürme
    const ua = T(c.ulAt, this.dur, a + dur * .7 + n * st * .5);
    this.uls.forEach((u, i) => u.style.setProperty('--u', E.out(prog(lt, ua + i * .1, ua + i * .1 + .55)) * (1 - Q(0))));
    // ışık süpürmesi (shine)
    if (c.shine != null) { const sp = prog(lt, T(c.shine, this.dur), T(c.shine, this.dur) + .9);
      e.style.backgroundImage = sp > 0 && sp < 1 ? `linear-gradient(100deg, transparent ${sp * 140 - 30}%, rgba(255,255,255,.9) ${sp * 140 - 20}%, transparent ${sp * 140 - 10}%)` : 'none';
      e.style.webkitBackgroundClip = 'text'; }
  }
}

// ======================================================================= dünya katmanı
const world = {
  cur: null,
  init() { this.layer = $('#wA'); this.glow = $('#glow'); this.shadow = $('#pshadow'); this.bokeh = $('#bokeh'); },
  set(name) {
    if (this.cur === name) return; this.cur = name; const w = WORLDS[name] || WORLDS.midnight; this.w = w;
    this.layer.style.background = w.base; this.layer.innerHTML = '';
    this.blobs = w.blobs.map(([c, x, y, r, a]) => { const b = el('div', 'blob'); Object.assign(b.style, { width: 2 * r + 'px', height: 2 * r + 'px', left: (x * 1.2 * W - r + .1 * W) + 'px', top: (y * 1.2 * H - r + .1 * H) + 'px', opacity: a, background: `radial-gradient(closest-side, ${c}, ${c}00)` }); this.layer.appendChild(b); return b; });
    const st = $('#stage').style; st.setProperty('--ink', w.ink); st.setProperty('--muted', w.muted); st.setProperty('--accent', w.accent); st.setProperty('--accent2', w.accent2);
    st.background = w.base; document.body.style.background = w.base;
    this.glow.style.background = w.dark ? `radial-gradient(closest-side, ${w.glow}88, ${w.glow}22 55%, transparent)` : 'none';
    this.shadow.style.background = w.dark ? 'rgba(0,0,0,.55)' : w.shadow;
    $('#vig').style.opacity = w.dark ? 1 : .35;
    $('.ticketNotchFix') && 0;
    $('#stage').dataset.dark = w.dark ? 1 : 0;
    GL.rimA && GL.rimA.color.set(w.dark ? (w.glow || '#9C97FF') : '#ffffff');
  },
  render(t) { (this.blobs || []).forEach((b, i) => b.style.transform = `translate3d(${Math.sin(t * .28 + i * 1.7) * 70}px, ${Math.cos(t * .22 + i * 2.3) * 60}px,0) scale(${1 + Math.sin(t * .31 + i) * .06})`); },
};

// ======================================================================= DOM 3B nesneleri
function css3(elm) { const o = new CSS3DObject(elm); o.visible = false; cssScene.add(o); return o; }
// Ekran px tasarımını sabit CTA kamerasında (dist 5, fov 30) dünyaya yerleştir
const WPP5 = 2 * 5 * Math.tan(15 * D2R) / H;
function placePx(o, x, y, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  o.position.set((x - W / 2) * WPP5, (H / 2 - y) * WPP5, z); o.rotation.set(rx * D2R, ry * D2R, rz * D2R); o.scale.setScalar(WPP5 * s); o.visible = true;
}

// ======================================================================= sahneler
class Scene {
  constructor(s) {
    this.s = s; this.c = s.cfg; this.dur = s.dur; this.t0 = s.t0;
    this.back = el('div', 'layer'); this.front = el('div', 'layer'); $('#back2d').appendChild(this.back); $('#front2d').appendChild(this.front);
    this.texts = (this.c.text || []).map(c => new Txt(c, c.layer === 'back' ? this.back : this.front, this.dur));
    this.objs = []; this.worldName = this.c.world || V3T.plan.world || 'midnight';
  }
  show(on) { this.back.style.display = this.front.style.display = on ? 'block' : 'none'; if (!on) this.objs.forEach(o => o.visible = false); }
  focus(lt) {
    const f = kf(this.fk || (this.fk = resolveKeys(this.c.focus, this.dur)), lt, { bg: 0, back: 0, gl: 0, front: 0 });
    const set = (id, b) => { const e = $(id); e.style.filter = b > .2 ? `blur(${b}px)` : 'none'; };
    set('#bg', f.bg); set('#back2d', f.back); set('#gl', f.gl); set('#css3d', f.front); set('#front2d', f.front);
  }
  async render(lt) { this.focus(lt); this.texts.forEach(x => x.render(lt)); }
}

// --- kamera ön ayarları (sahne süresine göre anahtarlar üretir) ---
export const CAM = {
  hero: d => [{ t: 0, yaw: -24, pitch: 7, dist: 5.6, y: 150 }, { t: d, yaw: -10, pitch: 3, dist: 5.0, y: 170, e: 'sine' }],
  orbit: d => [{ t: 0, yaw: -38, pitch: 8, dist: 5.3, y: 120 }, { t: d, yaw: 30, pitch: 4, dist: 5.0, y: 120, e: 'sine' }],
  pushIn: d => [{ t: 0, yaw: 0, pitch: 0, dist: 5.8, y: 120 }, { t: d, yaw: 0, pitch: 0, dist: 4.2, y: 80, e: 'sine' }],
  low: d => [{ t: 0, yaw: 16, pitch: -15, dist: 5.0, y: 200 }, { t: d, yaw: 6, pitch: -8, dist: 4.7, y: 190, e: 'sine' }],
  top: d => [{ t: 0, yaw: 0, pitch: 38, dist: 5.4, y: 140, roll: -6 }, { t: d, yaw: -6, pitch: 22, dist: 5.0, y: 140, roll: -2, e: 'sine' }],
  dutch: d => [{ t: 0, yaw: -14, pitch: 4, dist: 5.2, roll: 9, y: 140 }, { t: d, yaw: -4, pitch: 2, dist: 4.9, roll: 4, y: 140, e: 'sine' }],
  drift: d => [{ t: 0, yaw: -6, pitch: 3, dist: 5.2, y: 140 }, { t: d, yaw: 6, pitch: 1, dist: 5.0, y: 140, e: 'sine' }],
  into: d => [{ t: 0, yaw: -8, pitch: 2, dist: 5.0, y: 120 }, { t: d, yaw: 0, pitch: 0, dist: 1.55, y: 0, e: 'inExpo' }],
  outOf: d => [{ t: 0, yaw: 0, pitch: 0, dist: 1.55, y: 0 }, { t: Math.min(d, 1.4), yaw: -14, pitch: 4, dist: 5.0, y: 150, e: 'quint' }, { t: d, yaw: -8, pitch: 2, dist: 4.8, y: 150, e: 'sine' }],
};
function camKeys(cam, dur) {
  if (!cam) cam = 'hero';
  if (Array.isArray(cam)) return resolveKeys(cam, dur);
  const o = typeof cam === 'string' ? { preset: cam } : cam, base = (CAM[o.preset] || CAM.hero)(dur);
  return base.map(k => ({ ...k, ...(o.x != null ? { x: o.x } : {}), ...(o.y != null ? { y: o.y } : {}), dist: k.dist * (o.zoom ? 1 / o.zoom : 1) }));
}

class PhoneScene extends Scene {
  constructor(s) {
    super(s); const c = this.c;
    this.ck = camKeys(c.cam, this.dur); this.pk = resolveKeys(c.phone, this.dur);
    this.screens = c.screens ? c.screens.map(x => ({ ...x, at: T(x.at, this.dur, 0) })) : [{ at: 0, ...(c.screen || { clip: 'zip' }) }];
    this.pops = (c.pop || []).map(p => this.buildPop(p));
    this.chips = (c.chips || []).map(p => this.buildChip(p));
    if (c.explode) this.buildExplode(c.explode);
  }
  buildPop(p) {
    const r = p.rect, style = p.style || 'crop'; let e, val;
    if (style === 'crop') { e = el('div', 'pop'); const cv = el('canvas'); cv.width = Math.round(r[2] * S); cv.height = Math.round(r[3] * S); cv.style.width = r[2] + 'px'; cv.style.height = r[3] + 'px'; e.appendChild(cv); p._cv = cv; }
    else { e = el('div', 'pop price' + (style === 'dark' ? ' dark' : ''));
      e.innerHTML = `<span class="lab">${p.label || ''}</span><span class="val"></span>`; val = e.querySelector('.val');
      if (p.value != null) { p._txt = new Txt({ kind: 'counter', value: p.value, decimals: p.decimals ?? 2, prefix: p.prefix || '', at: 0, run: [0, 1], pre: 1, inline: true }, val, this.dur); }
      else val.textContent = p.valueText || ''; }
    const sh = el('div', 'sheen'); e.appendChild(sh); p._sheen = sh;
    e.style.width = r[2] + 'px'; e.style.height = r[3] + 'px'; e.style.borderRadius = (p.radius ?? 22) + 'px';
    p._o = css3(e); p._e = e; this.objs.push(p._o); p.at = T(p.at, this.dur, 0); p.out = p.out != null ? T(p.out, this.dur) : null; return p;
  }
  buildChip(p) {
    const e = el('div', 'glass' + (p.light ? ' light' : ''), `${p.icon ? `<span class="ic" style="--chipc:${p.color || '#34D399'}">${ICONS[p.icon] || ''}</span>` : ''}<span>${p.text}${p.sub ? ` <small>${p.sub}</small>` : ''}</span>`);
    p._o = css3(e); this.objs.push(p._o); p.at = T(p.at, this.dur, 0); p.out = p.out != null ? T(p.out, this.dur) : null; return p;
  }
  buildExplode(x) {
    x.at = T(x.at ?? .3, this.dur); x.slices.forEach((sl, i) => {
      const pad = 36, [cx, cy, cw, ch] = comp.map(sl.rect), cv = el('canvas'); cv.width = Math.round(cw + 2 * pad); cv.height = Math.round(ch + 2 * pad);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const sc = PH.Ws / SW, m = new THREE.Mesh(new THREE.PlaneGeometry(cv.width * sc, cv.height * sc), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
      m.visible = false; phone.g.add(m); Object.assign(sl, { cv, tex, m, pad, cx, cy, cw, ch, key: '' });
      if (sl.label) { const lab = el('div', 'slicelabel', `<b>${String(i + 1).padStart(2, '0')}</b>${sl.label}`); sl._o = css3(lab); this.objs.push(sl._o); }
    });
    this.explode = x;
  }
  show(on) { super.show(on); if (!on && this.explode) this.explode.slices.forEach(s => s.m.visible = false); }
  screenAt(lt) { let cur = this.screens[0]; for (const s of this.screens) if (lt >= s.at) cur = s; return { spec: cur, lt: lt - cur.at }; }
  async render(lt) {
    const c = this.c;
    rig.set(kf(this.ck, lt, RIG0)); rig.shake = c.shake ?? .5; rig.apply();
    phone.finish(c.finish || V3T.plan.finish || 'graphite');
    const pp = kf(this.pk, lt, { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, s: 1 });
    if (c.float !== false) { pp.py = (pp.py || 0) + Math.sin(lt * 1.3) * .012; pp.rz = (pp.rz || 0) + Math.sin(lt * .9) * .4; }
    phone.pose(pp);
    // ekran
    const { spec, lt: slt } = this.screenAt(lt), src = sourceAt(spec, slt), img = await loadImg(src.url);
    const hl = (c.highlight || []).map(h => { const a = T(h.at, this.dur), b = h.until != null ? T(h.until, this.dur) : 1e9;
      return { rect: h.rect, style: h.style || 'ring', color: h.color, p: E.out(prog(lt, a, a + .5)) * (1 - E.in(prog(lt, b, b + .3))) }; }).filter(h => h.p > 0);
    for (const p of this.pops) if (p.hole !== false) { const q = E.out(prog(lt, p.at, p.at + .35)) * (1 - (p.out != null ? E.inOut(prog(lt, p.out, p.out + .45)) : 0)); if (q > 0) hl.push({ rect: p.rect, style: 'hole', p: q }); }
    let dim = 0;
    if (this.explode) { const x = this.explode, ep = E.inOut(prog(lt, x.at, x.at + (x.dur ?? 1.1))); dim = ep * (x.dim ?? .45); for (const sl of x.slices) if (ep > 0) hl.push({ rect: sl.rect, style: 'hole', p: ep }); }
    if (img) comp.draw(img, { redact: src.redact, hl, dim: dim || undefined });
    // pop-out'lar
    const cq = new THREE.Quaternion(); camera.getWorldQuaternion(cq);
    const pq = new THREE.Quaternion(); phone.g.getWorldQuaternion(pq);
    for (const p of this.pops) {
      const o = p._o, qo = p.out != null ? E.in(prog(lt, p.out, p.out + .4)) : 0; if (lt < p.at || qo >= 1) { o.visible = false; continue; }
      const d = p.dur ?? .9, k = E.out(prog(lt, p.at, p.at + d)), ks = E.soft(prog(lt, p.at, p.at + d * 1.2));
      const r = p.rect, from = phone.world(r[0] + r[2] / 2, r[1] + r[3] / 2, .002), s0 = phone.srcPxWorld();
      const to = p.to || {}, depth = rig.s.dist * (to.depth ?? .62), tw = to.w ?? 940;
      const hEnd = p.h ?? (p.style === 'crop' ? r[3] : 150);
      const hh = mix(r[3], hEnd, E.out(prog(lt, p.at + d * .25, p.at + d)));
      const dest = rayPoint(W / 2 + (to.x ?? 0), (to.y ?? 1180), depth);
      const s1 = wpp(depth) * tw / r[2];
      o.position.copy(from).lerp(dest, k); o.position.add(new THREE.Vector3(0, Math.sin(Math.PI * k) * .08, 0));
      const tq = cq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((to.rx ?? 6) * D2R, (to.ry ?? -10) * D2R, (to.rz ?? 0) * D2R)));
      o.quaternion.copy(pq).slerp(tq, k); o.scale.setScalar(mix(s0, s1, ks) * (1 + qo * .25)); o.visible = true; p._e.style.opacity = 1 - qo; p._e.style.filter = qo > 0 ? `blur(${qo * 12}px)` : '';
      p._e.style.height = hh + 'px';
      if (p._txt) { const fz = hh * .44; p._e.querySelector('.lab').style.fontSize = Math.max(hh * .22, 26) + 'px'; p._e.querySelector('.val').style.fontSize = fz + 'px'; p._e.style.paddingLeft = p._e.style.paddingRight = Math.max(30, hh * .26) + 'px';
        const cs = p.counter || {}; const r0 = p.at + (cs.delay ?? .35); p._txt.c.run = [r0, r0 + (cs.dur ?? .9)]; p._txt.render(lt); }
      // crop: kaynaktan kes (birleştirilmiş tuvalde bu bölgeye 'delik' çizildiği için oradan kesilemez); örtüler korunur
      if (p._cv && img) { const g = p._cv.getContext('2d'), kx = p._cv.width / r[2], ky = p._cv.height / r[3];
        g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, p._cv.width, p._cv.height);
        for (const rr of src.redact) if (rr[0] < r[0] + r[2] && rr[0] + rr[2] > r[0] && rr[1] < r[1] + r[3] && rr[1] + rr[3] > r[1]) {
          g.fillStyle = 'rgba(236,239,245,.97)'; g.fillRect((rr[0] - r[0]) * kx, (rr[1] - r[1]) * ky, rr[2] * kx, rr[3] * ky); } }
      const sp = prog(lt, p.at + d * .55, p.at + d * .55 + .8); p._sheen.style.transform = `translateX(${mix(-120, 120, E.inOut(sp))}%)`; p._sheen.style.opacity = sp > 0 && sp < 1 ? 1 : 0;
      p._e.style.boxShadow = '';
    }
    // çipler (telefon yüzeyine bağlı, dışarı doğru yüzer)
    for (const p of this.chips) {
      const o = p._o, k = E.out(prog(lt, p.at, p.at + .7)), q = p.out != null ? E.in(prog(lt, p.out, p.out + .3)) : 0;
      if (k <= 0 || q >= 1) { o.visible = false; continue; }
      const off = p.off || [0, 0], a = p.anchor || [585, 1266];
      const pos = phone.world(a[0], a[1], (p.dz ?? .16) * k);
      pos.add(new THREE.Vector3(off[0], off[1], 0).applyQuaternion(pq));
      o.position.copy(pos); o.quaternion.copy(pq).slerp(cq, p.face ?? .6);
      const dpt = camera.position.distanceTo(pos), sc = wpp(dpt) * (p.size ?? 1) * mix(.6, 1, E.back(prog(lt, p.at, p.at + .6))) * (1 - q * .3);
      o.scale.setScalar(sc); o.visible = true; o.element.style.opacity = clamp(k * 2) * (1 - q);
    }
    // patlatılmış görünüm
    if (this.explode) {
      const x = this.explode, ep = E.inOut(prog(lt, x.at, x.at + (x.dur ?? 1.1))), ld = x.at + (x.dur ?? 1.1) * .8, lp = E.out(prog(lt, ld, ld + .6));
      for (const [i, sl] of x.slices.entries()) {
        if (ep <= 0) { sl.m.visible = false; if (sl._o) sl._o.visible = false; continue; }
        if (sl.key !== comp.key) { sl.key = comp.key; const g = sl.cv.getContext('2d'), pd = sl.pad; g.clearRect(0, 0, sl.cv.width, sl.cv.height);
          g.save(); g.shadowColor = 'rgba(8,10,30,.45)'; g.shadowBlur = 28; g.shadowOffsetY = 14; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(pd, pd, sl.cw, sl.ch, 26); g.fill(); g.restore();
          g.save(); g.beginPath(); g.roundRect(pd, pd, sl.cw, sl.ch, 26); g.clip(); g.drawImage(img, sl.rect[0], sl.rect[1], sl.rect[2], sl.rect[3], pd, pd, sl.cw, sl.ch);
          for (const rr of src.redact) { const m = comp.map(rr); if (m[1] < sl.cy + sl.ch && m[1] + m[3] > sl.cy) { g.fillStyle = 'rgba(236,239,245,.95)'; g.fillRect(pd + m[0] - sl.cx, pd + m[1] - sl.cy, m[2], m[3]); } }
          g.restore(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.roundRect(pd, pd, sl.cw, sl.ch, 26); g.stroke(); sl.tex.needsUpdate = true; }
        const z = (sl.z ?? (i + 1) * (x.gap ?? .14)) * ep, bob = Math.sin(lt * 1.6 + i * 1.3) * .006 * ep;
        const loc = phone.local(sl.rect[0] + sl.rect[2] / 2, sl.rect[1] + sl.rect[3] / 2, z + .003);
        sl.m.position.set(loc.x + (sl.dx ?? 0) * ep, loc.y + bob + (sl.dy ?? 0) * ep, loc.z); sl.m.scale.setScalar(1 + (sl.grow ?? .04) * ep); sl.m.visible = true;
        if (sl._o) { sl.m.updateMatrixWorld(true); const hw = sl.m.geometry.parameters.width / 2 - sl.pad * PH.Ws / SW; const hh2 = sl.m.geometry.parameters.height / 2 - sl.pad * PH.Ws / SW, side = sl.labelAt || 'right';
          const lw = sl.m.localToWorld(side === 'top' ? new THREE.Vector3(-hw * .3, hh2 + .085, .02) : side === 'left' ? new THREE.Vector3(-hw - .03, 0, .02) : new THREE.Vector3(hw + .03, 0, .02)); const lo = sl._o;
          lo.position.copy(lw); lo.quaternion.copy(cq);
          lo.scale.setScalar(wpp(camera.position.distanceTo(lw)) * (sl.labelSize ?? x.labelSize ?? 1.25)); lo.visible = lp > 0; lo.element.style.opacity = clamp(prog(lt, ld + i * .1, ld + .4 + i * .1));
          const sg = side === 'left' ? -1 : side === 'top' ? 0 : 1; lo.position.add(new THREE.Vector3(sg * lo.element.offsetWidth / 2 * lo.scale.x, 0, 0).applyQuaternion(cq)); }
      }
    }
    // konfeti
    for (const b of this.c.burst || []) { const a = T(b.at, this.dur); if (lt >= a) confetti.draw(rayPoint(b.x ?? 540, b.y ?? 900, rig.s.dist * (b.depth ?? .8)), lt - a, b); }
    // parıltı / gölge (dünya)
    const cpx = project(phone.g.position), w = WORLDS[this.worldName];
    const gl = $('#glow'); gl.style.display = 'block'; const gs = 1500 * 5 / rig.s.dist;
    Object.assign(gl.style, { left: cpx.x - gs / 2 + 'px', top: cpx.y - gs / 2 + 'px', width: gs + 'px', height: gs + 'px' });
    const bot = project(phone.world(585, 2700, 0)), sh = $('#pshadow'); sh.style.display = w.dark ? 'none' : 'block';
    Object.assign(sh.style, { left: bot.x - 330 + 'px', top: bot.y - 10 + 'px', width: '660px', height: '90px', opacity: c.shadow ?? .8 });
    await super.render(lt);
  }
}

class TypeScene extends Scene {
  constructor(s) { super(s); this.ck = this.c.phone || this.c.cam ? camKeys(this.c.cam || 'drift', this.dur) : null; }
  async render(lt) { $('#glow').style.display = 'none'; $('#pshadow').style.display = 'none';
    for (const b of this.c.burst || []) { const a = T(b.at, this.dur); if (lt >= a) { rig.apply(); confetti.draw(rayPoint(b.x ?? 540, b.y ?? 900, 4), lt - a, b); } }
    await super.render(lt); }
}

// --- CTA: yorum → otomatik cevap → hediye, ya da kod bileti ---
class CtaScene extends Scene {
  constructor(s) {
    super(s); const c = this.c, m = this.mode = c.mode === 'code' ? 'code' : 'comment', K = this.K = V3T.CTA[m];
    const SA = V3T.SAFE, Y = y => SA.top + (y - 180) * ((SA.bottom - SA.top) / 1320); this.Y = Y;
    const add = cfg => { const x = new Txt(cfg, this.front, this.dur); this.texts.push(x); return x; };
    if (m === 'comment') {
      if (c.backdrop !== false) { const bd = new Txt({ kind: 'blur', style: 'giant outline deco', text: 'TEKLİF', y: Y(640), size: 330, align: 'center', at: .2, dur: 1.2, stagger: 0 }, this.back, this.dur); bd.el.style.opacity = .16; this.texts.push(bd); this.bd = bd; }
      add({ kind: 'fade', style: 'label', text: c.eyebrow || 'Hediye · İlk 1000 üyeye', y: Y(196), align: 'center', at: 0, pre: .35 });
      add({ kind: 'rise', text: c.head || 'Yorumlara\n[TEKLİF] *yaz.*', y: Y(262), size: c.size || 150, align: 'center', at: .05, pre: .25, stagger: .07 });
      this.b1 = css3(el('div', 'bub', `<div class="av">S</div><div><div class="who"><b>sen</b> · şimdi</div><div class="txt"><span class="tw"></span><span class="caret" style="display:inline-block;width:5px;height:50px;background:#4F46E5;margin-left:4px;vertical-align:-6px;border-radius:2px"></span></div></div>`));
      this.b2 = css3(el('div', 'bub', `<div class="av brand"><svg width="34" height="40" viewBox="0 0 24 28"><path d="M14 1 3 16h7l-2 11 11-15h-7l2-11z" fill="#fff"/></svg></div><div><div class="who"><b>anindateklif</b><span class="badge">otomatik cevap</span></div><div class="txt sm">${c.reply || '1 ay Pro hediyen hazır!<br><span style="color:#4F46E5">anindateklif.co/hediye</span>'}</div></div>`));
      this.gift = css3(el('div', 'gift', `<div class="k">HEDİYE</div><div class="v">1 ay Pro <span class="it">ücretsiz</span></div>`));
      this.objs.push(this.b1, this.b2, this.gift);
      add({ kind: 'fade', style: 'body', text: c.note || 'Cevaptaki linkten üye ol, kod otomatik tanımlanır.', y: Y(1446), size: 32, align: 'center', at: K.note });
    } else {
      add({ kind: 'fade', style: 'label', text: c.eyebrow || 'Instagram’a özel · İlk 1000 üyeye', y: Y(196), align: 'center', at: 0, pre: .35 });
      add({ kind: 'rise', text: c.head || '1 ay [Pro]\n*ücretsiz.*', y: Y(262), size: c.size || 150, align: 'center', at: .05, pre: .25, stagger: .07 });
      this.tk = css3(el('div', 'tkwrap', `<div class="ticket"><div class="k">KAMPANYA KODU</div><div class="code"></div><div class="perf"></div><div class="ft"><span>1 ay Pro · ücretsiz</span><span>İlk 1000 üye</span></div></div>`));
      this.btn = css3(el('div', 'btn', `${c.url || 'anindateklif.co/hediye'} <span style="font-size:46px">→</span>`));
      this.objs.push(this.tk, this.btn);
      this.codeTxt = new Txt({ kind: 'scramble', text: c.code || 'TEKLIF30', at: K.type[0], dur: .3, stagger: (K.type[1] - K.type[0]) / 8, pre: 0, inline: true }, this.tk.element.querySelector('.code'), this.dur);
      add({ kind: 'fade', style: 'body', text: c.note || 'Üye ol, kod otomatik tanımlanır.', y: Y(1420), size: 32, align: 'center', at: K.note });
    }
  }
  async render(lt) {
    const K = this.K, Y = this.Y; $('#glow').style.display = 'none'; $('#pshadow').style.display = 'none';
    rig.set({ yaw: Math.sin(lt * .5) * 2.5, pitch: Math.cos(lt * .4) * 1.5, dist: 5 }); rig.shake = .25; rig.apply();
    if (this.bd) this.bd.el.style.transform = `translateX(${Math.sin(lt * .35) * 24}px) scale(${1 + lt * .012})`;
    if (this.mode === 'comment') {
      const p1 = E.soft(prog(lt, K.bubble, K.bubble + .7)), p2 = E.soft(prog(lt, K.reply, K.reply + .7)), p3 = E.spring(prog(lt, K.gift, K.gift + .8));
      const fl = Math.sin(lt * 1.4) * 6;
      placePx(this.b1, 500 - (1 - p1) * 80, Y(770) + (1 - p1) * 120 + fl, .15, 4 * (1 - p1), 12 - 4 * p1, -2, mix(.7, 1, p1)); this.b1.element.style.opacity = clamp(p1 * 3);
      const n = Math.round(clamp(prog(lt, K.type[0], K.type[1])) * 6); this.b1.element.querySelector('.tw').textContent = 'TEKLİF'.slice(0, n);
      this.b1.element.querySelector('.caret').style.opacity = lt < K.reply && (n < 6 || Math.floor(lt * 2.6) % 2 === 0) ? 1 : 0;
      if (lt >= K.reply) { placePx(this.b2, 580 + (1 - p2) * 80, Y(1010) + (1 - p2) * 120 - fl * .6, .05, 4 * (1 - p2), -10 + 3 * p2, 1.5, mix(.7, 1, p2)); this.b2.element.style.opacity = clamp(p2 * 3); } else this.b2.visible = false;
      if (lt >= K.gift) { placePx(this.gift, 540, Y(1272) + fl * .4, .1, -6 + 6 * p3, 8 - 8 * p3, -3 * (1 - p3), mix(.3, .92, p3)); this.gift.element.style.opacity = clamp(prog(lt, K.gift, K.gift + .12));
        rig.apply(); confetti.draw(rayPoint(540, Y(1272), 4.8), lt - K.gift, { n: 130, power: 1.1, seed: 3 }); } else this.gift.visible = false;
    } else {
      const p = E.soft(prog(lt, K.ticket, K.ticket + 1.0)), pb = E.out(prog(lt, K.button, K.button + .6));
      placePx(this.tk, 540, Y(890) + Math.sin(lt * 1.3) * 6, .2, mix(-75, 6, p) + Math.sin(lt * .9) * 2, mix(18, -6, p), mix(-10, -2, p), mix(.75, 1, p)); this.tk.element.style.opacity = clamp(prog(lt, K.ticket, K.ticket + .15));
      this.codeTxt.render(lt);
      if (lt >= K.button) { const pulse = 1 + Math.sin((lt - K.button - .6) * 5) * .02 * clamp((lt - K.button - .6) * 2); placePx(this.btn, 540, Y(1236) + (1 - pb) * 60, .1, 0, 0, 0, pulse); this.btn.element.style.opacity = pb; } else this.btn.visible = false;
      if (lt >= K.burst) confetti.draw(rayPoint(540, Y(890), 4.7), lt - K.burst, { n: 110, power: 1, seed: 5 });
    }
    await super.render(lt);
  }
}

// --- Outro: 3B logo karosu + yazı + url ---
class OutroScene extends Scene {
  constructor(s) {
    super(s); const c = this.c, SA = V3T.SAFE, Y = y => SA.top + (y - 180) * ((SA.bottom - SA.top) / 1320); this.Y = Y;
    const add = cfg => { const x = new Txt(cfg, this.front, this.dur); this.texts.push(x); return x; };
    add({ kind: 'chars', text: c.name || 'Anında Teklif', y: Y(1010), size: 108, align: 'center', at: .3, stagger: .03, dur: .7 });
    add({ kind: 'fade', style: 'body', text: c.tagline || 'Perde · Pergola · Zip Perde · Cam Balkon', y: Y(1152), size: 34, align: 'center', at: .55 });
    const u = add({ kind: 'blur', text: c.url || 'anindateklif.co/hediye', y: Y(1236), size: 44, align: 'center', at: .7, stagger: .02 });
    u.el.style.fontWeight = 700; u.el.style.letterSpacing = '-.01em';
  }
  async render(lt) {
    $('#glow').style.display = 'block'; $('#pshadow').style.display = 'none';
    rig.set({ yaw: 0, pitch: 0, dist: 5 }); rig.shake = .15; rig.apply();
    const Y = this.Y(760), p = E.spring(prog(lt, .02, 1.0)), ps = E.out(prog(lt, 0, .7));
    const g = logo.g; g.visible = true; const pos = rayPoint(540, Y, 5);
    g.position.copy(pos); g.position.z += mix(-1.2, 0, ps);
    g.rotation.set(mix(.5, 0, p) + Math.sin(lt * .8) * .04, mix(-2.2, 0, p) + Math.sin(lt * .6) * .1, mix(.3, 0, p));
    g.scale.setScalar(mix(.4, 1, ps) * (this.c.logoScale ?? 1));
    logo.light.position.set(g.position.x + mix(-1.2, 1.2, E.inOut(prog(lt, .25, 1.25))), g.position.y + .5, g.position.z + .7); logo.light.intensity = 6 * Math.sin(Math.PI * prog(lt, .25, 1.25));
    const gl = $('#glow'); const gs = 1100; Object.assign(gl.style, { left: 540 - gs / 2 + 'px', top: Y - gs / 2 + 'px', width: gs + 'px', height: gs + 'px', opacity: ps });
    const fl = $('#flare'), fp = Math.sin(Math.PI * prog(lt, .35, 1.0)); fl.style.opacity = fp; fl.style.left = (540 + 120 - 450) + 'px'; fl.style.top = (Y - 140 - 450) + 'px';
    await super.render(lt);
  }
  show(on) { super.show(on); if (!on) { logo.g.visible = false; logo.light.intensity = 0; $('#flare').style.opacity = 0; $('#glow').style.opacity = 1; } }
}

// ======================================================================= geçişler
function transitions(t) {
  const fx = { x: 0, y: 0, s: 1, bx: 0, by: 0, blur: 0, flash: 0, iris: null };
  for (const s of V3T.scenes) {
    if (!s.trIn) continue; const Tb = s.t0, type = s.trIn, d = s.cfg.trDur ?? (type === 'iris' ? .42 : .3);
    if (Math.abs(t - Tb) > d + .4) continue;
    if (type === 'whip' || type === 'whipUp') {
      const before = t < Tb, q = before ? E.in(prog(t, Tb - d / 2, Tb)) : 1 - E.out(prog(t, Tb, Tb + d / 2)), sgn = before ? -1 : 1;
      if (type === 'whip') { fx.x += sgn * q * W * .45; fx.bx = Math.max(fx.bx, q * 70); } else { fx.y += sgn * q * H * .35; fx.by = Math.max(fx.by, q * 80); }
    } else if (type === 'zoom') {
      if (t < Tb) { const q = E.inExpo(prog(t, Tb - d, Tb)); fx.s *= 1 + q * 2.2; fx.blur = Math.max(fx.blur, q * 18); }
      else { const q = 1 - E.out(prog(t, Tb, Tb + d * 1.2)); fx.s *= 1 - q * .22; fx.blur = Math.max(fx.blur, q * 14); }
      fx.flash = Math.max(fx.flash, .55 * (1 - clamp(Math.abs(t - Tb) / .1)));
    } else if (type === 'iris') {
      if (t < Tb && t >= Tb - d) { const q = E.expoInOut(prog(t, Tb - d, Tb)); const w = WORLDS[s.cfg.world || V3T.plan.world || 'midnight']; fx.iris = { r: q * 1180, c: w.base, x: s.cfg.irisX ?? 540, y: s.cfg.irisY ?? 960 }; }
      if (t >= Tb) { const q = 1 - E.out(prog(t, Tb, Tb + .4)); fx.s *= 1 + q * .06; }
    } else if (type === 'flash') { fx.flash = Math.max(fx.flash, .8 * (1 - clamp(Math.abs(t - Tb) / .14))); if (t >= Tb) fx.s *= 1 + (1 - E.out(prog(t, Tb, Tb + .35))) * .05; }
    else if (type === 'push') { if (t >= Tb) { const q = 1 - E.out(prog(t, Tb, Tb + .5)); fx.s *= 1 + q * .12; fx.blur = Math.max(fx.blur, q * 10); } }
  }
  return fx;
}

// ======================================================================= ana döngü
let scenesObj = [], cur = null, overlays = null;
async function render(t) {
  t = clamp(t, 0, V3T.DUR - 1e-4); rig.t = t; rig.reset();
  const si = V3T.scenes.findIndex(s => t >= s.t0 && t < s.t1), sc = scenesObj[si < 0 ? scenesObj.length - 1 : si];
  if (cur !== sc) { if (cur) cur.show(false); sc.show(true); cur = sc; }
  phone.g.visible = false; confetti.m.visible = false; world.set(sc.worldName);
  await sc.render(t - sc.t0);
  if (overlays) overlays.forEach(x => x.render(t));
  world.render(t);
  const fx = transitions(t), wd = $('#world').style;
  wd.transform = (fx.x || fx.y || fx.s !== 1) ? `translate3d(${fx.x}px,${fx.y}px,0) scale(${fx.s})` : '';
  if (fx.bx || fx.by) { $('#mbg').setAttribute('stdDeviation', `${fx.bx.toFixed(1)} ${fx.by.toFixed(1)}`); wd.filter = 'url(#mb)'; }
  else wd.filter = fx.blur > .3 ? `blur(${fx.blur}px)` : '';
  $('#flash').style.opacity = fx.flash;
  const ir = $('#iris'); if (fx.iris) Object.assign(ir.style, { display: 'block', background: fx.iris.c, left: fx.iris.x - fx.iris.r + 'px', top: fx.iris.y - fx.iris.r + 'px', width: 2 * fx.iris.r + 'px', height: 2 * fx.iris.r + 'px' }); else ir.style.display = 'none';
  $('#grain').style.transform = `translate(${Math.floor(hash(t * 30) * 60) - 30}px,${Math.floor(hash(t * 30 + 9) * 60) - 30}px)`;
  rig.apply(); renderer.render(scene, camera); css3d.render(cssScene, camera);
}

async function init() {
  document.title = 'v3 · ' + V3T.id;
  const st = $('#stage');
  st.innerHTML = `
    <div id="world">
      <div id="bg"><div class="wl" id="wA"></div><div class="glow" id="glow"></div><div class="shadow" id="pshadow"></div><div id="bokeh"></div></div>
      <div id="back2d"></div><canvas id="gl" width="${W}" height="${H}"></canvas><div id="css3d"></div><div id="front2d"></div>
    </div>
    <div id="fx"><div class="vig" id="vig"></div><div class="grain" id="grain"></div>
      <div class="glow" id="flare" style="width:900px;height:900px;opacity:0;mix-blend-mode:screen;background:radial-gradient(closest-side, rgba(255,255,255,.55), rgba(185,181,255,.18) 30%, transparent 62%), linear-gradient(90deg, transparent 10%, rgba(255,255,255,.35) 50%, transparent 90%) center/100% 3px no-repeat"></div>
      <div class="iris" id="iris"></div><div class="flash" id="flash"></div>
      <div class="guides" id="guides"><i style="top:${V3T.SAFE.top}px"></i><i style="top:${V3T.SAFE.bottom}px"></i></div></div>
    <svg width="0" height="0" style="position:absolute"><filter id="mb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="mbg" stdDeviation="0 0"/></filter></svg>`;
  if (new URLSearchParams(location.search).get('guides')) $('#guides').style.display = 'block';
  await Promise.all(['800 100px "Plus Jakarta Sans"', '700 50px "Plus Jakarta Sans"', '400 100px "Instrument Serif"', 'italic 400 100px "Instrument Serif"', '700 100px "JetBrains Mono"'].map(f => document.fonts.load(f, 'AaİıŞşĞğ0123456789').catch(() => {})));
  await document.fonts.ready;
  world.init();
  initGL(); comp.init(); phone.init(); confetti.init(); logo.init();
  scenesObj = V3T.scenes.map(s => { const ty = s.cfg.type || 'phone';
    return new ({ phone: PhoneScene, type: TypeScene, cta: CtaScene, outro: OutroScene }[ty] || TypeScene)(s); });
  scenesObj.forEach(s => s.show(false));
  if (V3T.plan.overlays) { const lay = el('div', 'layer'); lay.style.display = 'block'; $(V3T.plan.overlayLayer === 'back' ? '#back2d' : '#front2d').appendChild(lay);
    const back = el('div', 'layer'); back.style.display = 'block'; $('#back2d').appendChild(back);
    overlays = V3T.plan.overlays.map(c => new Txt(c, c.layer === 'back' ? back : lay, V3T.DUR)); }
  // önceden yükle: hareketsiz görseller + kliplerin ilk kareleri
  await Promise.all(V3T.scenes.flatMap(s => (s.cfg.screens || [s.cfg.screen]).filter(Boolean).map(sp => loadImg(sourceAt(sp, 0).url))));
  window.render = render;
  await render(0);
}

window.V3 = { E, kf, CLIPS, STILLS, RECTS, WORLDS, CAM, FINISH, ICONS, render: t => render(t), check: safeCheck };
// QA: sahnedeki görünür metinlerin güvenli alan dışına taşmasını raporla
function safeCheck() {
  const out = [], SA = V3T.SAFE, ws = $('#world').style;
  if (ws.transform || ws.filter) return out; // geçiş karesi (dünya ölçekli/bulanık) — bilinçli taşma
  document.querySelectorAll('#front2d .layer, #back2d .layer').forEach(l => { if (l.style.display === 'none') return;
    l.querySelectorAll('.tx:not(.deco)').forEach(x => { if (x.style.visibility === 'hidden' || +getComputedStyle(x).opacity === 0) return; const rg = document.createRange(); rg.selectNodeContents(x); const rh = rg.getBoundingClientRect(), rv = x.getBoundingClientRect(); const r = { width: rh.width, left: rh.left, right: rh.right, top: rv.top, bottom: rv.bottom };
      if (r.width && (r.top < SA.top - 2 || r.bottom > SA.bottom + 2 || r.left < 0 || r.right > W)) out.push({ text: x.textContent.slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }); }); });
  document.querySelectorAll('#css3d .glass, #css3d .bub, #css3d .ticket, #css3d .btn, #css3d .gift, #css3d .pop, #css3d .slicelabel').forEach(x => {
    if (x.style.display === 'none' || x.closest('[style*="display: none"]')) return; const r = x.getBoundingClientRect();
    if (r.width && (r.top < SA.top - 2 || r.bottom > SA.bottom + 2 || r.left < -2 || r.right > W + 2)) out.push({ obj: x.className, text: x.textContent.slice(0, 30), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }); });
  return out;
}

init().catch(e => { console.error('v3 init hatası:', e); document.title = 'v3 HATA: ' + e.message; }).finally(() => window.__v3ready && window.__v3ready());

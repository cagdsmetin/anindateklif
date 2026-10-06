// Reels v3 QA: zaman çizelgesini tarar; güvenli alan dışına taşan yazı/3B DOM nesnesi,
// sayfa hataları ve kare başı render süresini raporlar.
//   node v3/qa.mjs "v3/reel.html?id=p1" [adım=0.2]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
const [,, page, step = '0.2'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
const [f, q] = page.split('?');
await p.goto('file://' + path.resolve(f) + (q ? '?' + q : ''), { waitUntil: 'networkidle' });
await p.evaluate(() => window.READY);
const info = await p.evaluate(() => ({ DUR: window.DUR, MUSIC: window.MUSIC, BPM: window.BPM, CUES: window.CUES, title: document.title, scenes: window.V3T?.scenes?.map(s => [s.cfg.type || 'phone', +s.t0.toFixed(2), +s.t1.toFixed(2), s.trIn]) }));
console.log(`${page}  DUR ${info.DUR.toFixed(2)}s  müzik ${info.MUSIC} ${info.BPM}bpm  ${info.title}`);
console.log('sahneler:', JSON.stringify(info.scenes));
console.log('cues:', info.CUES.map(c => `${c.t.toFixed(2)} ${c.type}${c.dur ? '(' + c.dur + ')' : ''}`).join(' · '));
let worst = 0, total = 0, n = 0, bad = 0;
for (let t = 0; t < info.DUR; t += +step) {
  const t0 = Date.now(); await p.evaluate(async t => { await render(t); }, t); const ms = Date.now() - t0; worst = Math.max(worst, ms); total += ms; n++;
  const r = await p.evaluate(() => window.V3.check());
  if (r.length) { bad++; console.log(`  t=${t.toFixed(2)} güvenli alan dışı:`, JSON.stringify(r)); }
}
console.log(`render: ort ${Math.round(total / n)} ms, en kötü ${worst} ms (ekran görüntüsü hariç) · ${bad} sorunlu kare · hatalar: ${errs.length ? errs.join(' | ') : 'yok'}`);
await b.close();

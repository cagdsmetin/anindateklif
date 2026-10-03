import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
const [,, html, out, mode='video', ...times] = process.argv;
const FPS = 30;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(()=>chromium.launch());
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.resolve(html), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
const dur = await page.evaluate(() => window.DUR);
if (mode === 'stills') {
  for (const t of times) { await page.evaluate(async t => { await render(+t); }, t); await page.screenshot({ path: `${out}_${t}.png` }); }
} else {
  const ff = spawn('ffmpeg', ['-y','-f','image2pipe','-framerate',String(FPS),'-c:v','png','-i','-',
    '-c:v','libx264','-preset','slow','-crf','14','-pix_fmt','yuv420p','-profile:v','high','-level','4.2',
    '-movflags','+faststart','-r',String(FPS), out], { stdio: ['pipe','inherit','inherit'] });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(async t => { await render(t); }, i / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close();

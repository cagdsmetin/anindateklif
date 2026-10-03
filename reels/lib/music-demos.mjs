// Her müzik preset'i için 10 sn'lik demo: preview/music_demos/<preset>.mp4 (+ .wav)
// Yapı gerçek bir reel gibi: t=0 darbe + hook, 2.8 ve 5.0 sn whoosh (riser), 5.9–6.8
// break, 6.8 CTA drop, 8.4 logo çözülmesi. -14 LUFS, ≤ -1 dBTP (audio.mjs zinciri).
//   node lib/music-demos.mjs [preset ...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './music.mjs';
import { mixAndMaster } from './audio.next.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../preview/music_demos');
const LEN = 10;
const CUES = [{ t: 0.9, type: 'pop' }, { t: 2.8, type: 'whoosh' }, { t: 3.6, type: 'pop' }, { t: 5.0, type: 'whoosh' }, { t: 5.0, type: 'cut' },
  { t: 6.8, type: 'whoosh' }, { t: 6.8, type: 'cta' }, { t: 7.4, type: 'pop' }, { t: 8.4, type: 'logo' }];
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

fs.mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PRESETS);
for (const p of names) {
  const wav = path.join(OUT, `${p}.wav`), mp4 = path.join(OUT, `${p}.mp4`), P = PRESETS[p];
  await mixAndMaster({ id: `demo_${p}`, DUR: LEN, CUES, len: LEN, out: wav, music: p, wavOnly: true });
  const keyName = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][P.key];
  const txt = s => s.replace(/:/g, '\\:').replace(/'/g, '');
  const vf = `color=c=0x0B0B14:s=1080x1920:r=30:d=${LEN}[bg];` +
    `[0:a]showcqt=s=1080x1000:r=30:bar_g=2:sono_g=4:axis=0:count=2,format=yuv420p[cq];` +
    `[bg][cq]overlay=0:620,` +
    `drawtext=fontfile=${FONT}:text='${txt(P.label)}':fontsize=76:fontcolor=white:x=(w-tw)/2:y=260,` +
    `drawtext=fontfile=${FONT}:text='${txt(`${p} · ${P.bpm} BPM · ${keyName} major`)}':fontsize=40:fontcolor=0xA5B4FC:x=(w-tw)/2:y=370,` +
    `drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontsize=36:fontcolor=0x9CA3AF:x=(w-tw)/2:y=1700[v]`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-filter_complex', vf, '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(LEN), mp4], { encoding: 'utf8' });
  if (r.status) { console.error(r.stderr); process.exitCode = 1; } else console.log('✓', mp4);
}

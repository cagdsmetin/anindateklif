// footage/video/*.mp4 kayıtlarını render için preview/frames/<ad>/NNNN.jpg karelerine açar.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
for (const f of fs.readdirSync('footage/video').filter(f => f.endsWith('.mp4'))) {
  const dir = `preview/frames/${f.replace('.mp4', '')}`;
  if (fs.existsSync(dir)) continue;
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-i', `footage/video/${f}`, '-q:v', '2', `${dir}/%04d.jpg`]);
  console.log(dir);
}

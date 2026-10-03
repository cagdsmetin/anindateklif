#!/bin/bash
# Kullanım: ./render-all.sh r01 r02 ...   (boşsa r01..r20)
# Sessiz MP4 render eder, ardından lib/audio.mjs ile ses ekler → out/reels/rNN.mp4
cd "$(dirname "$0")"
ids=${@:-$(seq -f "r%02g" 1 20)}
mkdir -p out/silent out/reels
printf '%s\n' $ids | xargs -P 3 -I{} sh -c '
  node render.mjs "reel.html?id={}" out/silent/{}.mp4 > out/silent/{}.log 2>&1 &&
  node lib/audio.mjs "reel.html?id={}" out/silent/{}.mp4 out/reels/{}.mp4 >> out/silent/{}.log 2>&1 &&
  echo "OK {}" || echo "FAIL {}"'

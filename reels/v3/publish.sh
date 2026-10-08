#!/bin/bash
# out/v3/final/<id>.mp4 → reels-yayin-v3 dalına (CRF 18 sıkıştırılmış) commit + push
# Kullanım: ./v3/publish.sh r10 r11 ...
WT=${WT:-/tmp/claude-0/-home-user-anindateklif/95e6fa30-91bf-5510-8265-fd9e9d319ab6/scratchpad/yayin3}
SRC="$(cd "$(dirname "$0")/.." && pwd)/out/v3/final"
cd "$WT" || exit 1
for id in "$@"; do
  case $id in r*) d=reels;; *) d=hikayeler;; esac
  ffmpeg -loglevel error -y -i "$SRC/$id.mp4" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "$d/$id.mp4" || { echo "FAIL $id"; continue; }
  git add "$d/$id.mp4"
done
git commit -qm "Yayın v3: $*" && for i in 1 2 3 4; do git push -q -u origin reels-yayin-v3 && break; sleep $((2**i)); done && echo "PUSHED $*"

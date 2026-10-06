#!/bin/bash
# v3 toplu render: sessiz render + müzik/efekt → out/v3/final/<id>.mp4
#   ./v3/render-all.sh s01 s02 ...   |  ./v3/render-all.sh reels  |  ./v3/render-all.sh stories
cd "$(dirname "$0")/.." || exit 1
case "$1" in
  reels) ids=$(seq -f "r%02g" 1 20);;
  stories) ids=$(seq -f "s%02g" 1 30);;
  *) ids="$*";;
esac
mkdir -p out/v3/silent out/v3/final
printf '%s\n' $ids | xargs -P ${P:-3} -I{} sh -c '
  case {} in r*) page="v3/reel.html?id={}";; *) page="v3/story.html?id={}";; esac
  node render.mjs "$page" out/v3/silent/{}.mp4 > out/v3/silent/{}.log 2>&1 &&
  node lib/audio.mjs "$page" out/v3/silent/{}.mp4 out/v3/final/{}.mp4 >> out/v3/silent/{}.log 2>&1 &&
  echo "OK {}" || echo "FAIL {}"'

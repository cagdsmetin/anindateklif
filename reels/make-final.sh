#!/bin/bash
# Final videolar: sessiz render + video başına müzik (plan/music_map.json) + efektler
# + seslendirme (plan/voiceover.json, ElevenLabs) → out/final/<id>.mp4   (3 paralel)
#
#   ./make-final.sh                 # r01..r20, s01..s30
#   ./make-final.sh r03 s05         # yalnızca verilenler
#   VO_DRY=1 ./make-final.sh r03    # anahtarsız test: VO yerine konuşma benzeri yer tutucu
#   MUSIC=disco ./make-final.sh r03 # preset zorla (vars. plan/music_map.json)
#   QA=0 ./make-final.sh            # sondaki müzik QA'sını atla
#
# VO yalnızca ELEVENLABS_API_KEY tanımlıysa (ya da VO_DRY=1) eklenir; aksi halde yalnızca
# müzik+efekt. TTS çıktıları preview/vo_cache/ altında önbelleklenir (yeniden faturalanmaz).
cd "$(dirname "$0")" || exit 1
ids=${*:-$(seq -f "r%02g" 1 20; seq -f "s%02g" 1 30)}
mkdir -p out/final

VOARGS=""
if [ -n "$VO_DRY" ]; then
  VOARGS="--vo plan/voiceover.json --vo-dry"
  echo "NOT: VO_DRY=1 — seslendirme yerine yer tutucu kullanılıyor (yayın için değil)."
elif [ -n "$ELEVENLABS_API_KEY" ]; then
  if [ -f plan/voiceover.json ]; then VOARGS="--vo plan/voiceover.json"
  else echo "NOT: plan/voiceover.json yok — yalnızca müzik."; fi
else
  echo "NOT: ELEVENLABS_API_KEY tanımlı değil — finaller SESLENDİRMESİZ (yalnızca müzik + efekt) üretilecek."
  echo "     Seslendirme için: export ELEVENLABS_API_KEY=...  (isteğe bağlı ELEVENLABS_VOICE_ID; sesler: node lib/voice.mjs --list-voices)"
fi
[ -n "$MUSIC" ] && VOARGS="$VOARGS --music $MUSIC"
export VOARGS

printf '%s\n' $ids | xargs -P 3 -I{} bash -c '
  id={}
  case $id in
    r*) page="reel.html?id=$id"; src="out/silent/$id.mp4" ;;
    s*) page="story.html?id=$id"; src="out/stories/$id.mp4" ;;
    *) echo "ATLA $id (bilinmeyen id)"; exit 0 ;;
  esac
  if [ ! -s "$src" ]; then echo "ATLA $id ($src yok — önce render edin)"; exit 0; fi
  if node lib/audio.mjs "$page" "$src" "out/final/$id.mp4" --id "$id" $VOARGS > "out/final/$id.log" 2>&1; then
    echo "OK   $id  $(grep -o "müzik [a-z_]*" "out/final/$id.log" | head -1)"; grep -h "UYARI" "out/final/$id.log" | sed "s/^/     /"
  else echo "FAIL $id  (out/final/$id.log)"; tail -3 "out/final/$id.log" | sed "s/^/     /"; fi'

if [ "${QA:-1}" != 0 ]; then
  node lib/music-qa.mjs | tail -n 3   # demolar + tüm out/final → preview/music_qa.md / .json
fi

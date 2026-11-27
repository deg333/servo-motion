#!/usr/bin/env bash
# Frame-doubles the 12-exposures-per-second render to 24 fps (so every
# exposure is held for two frames, like real stop motion) and muxes the score.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -v error -i out/video12.mp4 -i out/score.wav \
  -vf "fps=24" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 256k -shortest out/sean-birthday.mp4
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration -of default=nw=1 out/sean-birthday.mp4

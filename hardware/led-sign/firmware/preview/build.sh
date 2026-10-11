#!/usr/bin/env bash
# Renders the sign's screens on your computer with the real firmware drawing
# code (renderer.cpp, power.cpp), so you can preview a layout before flashing.
#   ./build.sh                  → out/*.png and out/contact-sheet.png (grid from config.h)
#   COLS=3 ROWS=3 ./build.sh    → the same for a 3 x 3 sign, in out-3x3/
# Needs: git, g++ (C++17), python3 with Pillow (pip install pillow).
set -euo pipefail
cd "$(dirname "$0")"
GFX=.cache/Adafruit-GFX-Library
[ -d "$GFX" ] || git clone -q --depth 1 -b 1.12.1 https://github.com/adafruit/Adafruit-GFX-Library "$GFX"
OUT=out; GRID=()
if [ -n "${COLS:-}" ] || [ -n "${ROWS:-}" ]; then
  OUT="out-${COLS:-2}x${ROWS:-2}"; GRID=(-DGRID_COLS="${COLS:-2}" -DGRID_ROWS="${ROWS:-2}")
fi
mkdir -p build "$OUT"
g++ -std=gnu++17 -O1 -DARDUINO=100 "${GRID[@]}" -I stub -I "$GFX" -I ../src \
  preview.cpp ../src/renderer.cpp ../src/power.cpp "$GFX/Adafruit_GFX.cpp" -o build/preview
./build/preview "$OUT"
python3 render.py "$OUT"

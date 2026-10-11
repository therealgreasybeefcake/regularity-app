#!/usr/bin/env bash
# Renders the sign's screens on your computer with the real firmware drawing
# code (renderer.cpp, power.cpp), so you can preview a layout before flashing.
#   ./build.sh            → out/*.png and out/contact-sheet.png
# Needs: git, g++ (C++17), python3 with Pillow (pip install pillow).
set -euo pipefail
cd "$(dirname "$0")"
GFX=.cache/Adafruit-GFX-Library
[ -d "$GFX" ] || git clone -q --depth 1 -b 1.12.1 https://github.com/adafruit/Adafruit-GFX-Library "$GFX"
mkdir -p build out
g++ -std=gnu++17 -O1 -DARDUINO=100 -I stub -I "$GFX" -I ../src \
  preview.cpp ../src/renderer.cpp ../src/power.cpp "$GFX/Adafruit_GFX.cpp" -o build/preview
./build/preview out
python3 render.py out

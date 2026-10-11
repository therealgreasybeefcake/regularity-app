#pragma once
#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>

// Extra pixel mappings for panels the HUB75 library's built-in scan types
// don't cover. Each gets the chain-wide x and per-panel y (after chaining)
// and returns the DMA buffer position; pick one in config.h.

// Outdoor P10 32x16 1/4-scan modules wired in 8-pixel groups, reversed in
// every other group, so FOUR_SCAN_16PX_HIGH leaves them scrambled. From
// board707's working mapping in mrcodetastic/ESP32-HUB75-MatrixPanel-DMA
// discussion #622.
struct P10QuarterScanAlt {
  static VirtualCoords apply(VirtualCoords c, int /*panel_pixel_base*/) {
    if ((c.y & 4) == 0) c.x = (c.x / 8) * 16 + 8 + 7 - (c.x & 7);
    else c.x += (c.x / 8) * 8;
    c.y = (c.y >> 3) * 4 + (c.y & 3);
    return c;
  }
};

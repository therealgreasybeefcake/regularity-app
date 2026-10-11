#pragma once
// ============================================================================
//  Regularity LED sign — hardware configuration.
//  Everything you might need to change for a different board or panel lives in
//  this file. The renderer auto-sizes to whatever resolution results, and the
//  app doesn't care about the hardware at all.
//  See hardware/led-sign/README.md → "Using different hardware".
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Controller board. Pick ONE.
//    BOARD_MATRIXPORTAL_S3 — Adafruit MatrixPortal S3 (recommended, plugs onto the panel)
//    BOARD_LIBRARY_DEFAULT — any ESP32 / ESP32-S3 wired to the HUB75 library's
//                            default pins (ESP32 Trinity, generic HUB75 shields,
//                            DIY wiring). Override pins in section 1b if yours differ.
//    BOARD_CUSTOM          — set every pin yourself in section 1b.
//    ESP32-S2 (no Bluetooth) and ESP32-C3/C6 (not supported by the panel
//    library) will not work.
// ---------------------------------------------------------------------------
#define BOARD_MATRIXPORTAL_S3 1
#define BOARD_LIBRARY_DEFAULT 2
#define BOARD_CUSTOM          3

#ifndef SIGN_BOARD
#define SIGN_BOARD BOARD_MATRIXPORTAL_S3
#endif

// 1b. HUB75 pins (used by BOARD_MATRIXPORTAL_S3 and BOARD_CUSTOM).
#if SIGN_BOARD == BOARD_MATRIXPORTAL_S3
  // Adafruit MatrixPortal S3 HUB75 connector (from Adafruit's pinout).
  #define PIN_R1 42
  #define PIN_G1 41
  #define PIN_B1 40
  #define PIN_R2 38
  #define PIN_G2 39
  #define PIN_B2 37
  #define PIN_A  45
  #define PIN_B  36
  #define PIN_C  48
  #define PIN_D  35
  #define PIN_E  21
  #define PIN_LAT 47
  #define PIN_OE  14
  #define PIN_CLK 2
#elif SIGN_BOARD == BOARD_CUSTOM
  #define PIN_R1 25
  #define PIN_G1 26
  #define PIN_B1 27
  #define PIN_R2 14
  #define PIN_G2 12
  #define PIN_B2 13
  #define PIN_A  23
  #define PIN_B  19
  #define PIN_C  5
  #define PIN_D  17
  #define PIN_E  -1   // only 64-px-high 1/32-scan panels use E
  #define PIN_LAT 4
  #define PIN_OE  15
  #define PIN_CLK 16
#endif

// ---------------------------------------------------------------------------
// 2. Panel module type. Pick ONE (check the seller's listing / the label on
//    the back for size and "scan").
//    PANEL_P10_OUTDOOR_32x16_4S — outdoor P10 RGB, 32x16, 1/4 scan (recommended, 320x160 mm)
//    PANEL_P10_32x16_8S         — P10 RGB 32x16, 1/8 scan (common indoor/semi-outdoor)
//    PANEL_64x32_16S            — standard 64x32, 1/16 scan (P3/P4/P5/P6 indoor)
//    PANEL_OUTDOOR_64x32_8S     — outdoor 64x32, 1/8 scan (P5/P6/P8 outdoor)
//    PANEL_64x64_32S            — 64x64, 1/32 scan (needs PIN_E)
//    PANEL_CUSTOM               — set PANEL_RES_X/Y and PANEL_SCAN below
// ---------------------------------------------------------------------------
#define PANEL_P10_OUTDOOR_32x16_4S 1
#define PANEL_P10_32x16_8S         2
#define PANEL_64x32_16S            3
#define PANEL_OUTDOOR_64x32_8S     4
#define PANEL_64x64_32S            5
#define PANEL_CUSTOM               6

#ifndef SIGN_PANEL
#define SIGN_PANEL PANEL_P10_OUTDOOR_32x16_4S
#endif

// PANEL_SCAN is a ScanTypeMapping from the HUB75 library: STANDARD_TWO_SCAN
// for "normal" panels, FOUR_SCAN_* for the folded outdoor ones.
#if SIGN_PANEL == PANEL_P10_OUTDOOR_32x16_4S
  #define PANEL_RES_X 32
  #define PANEL_RES_Y 16
  #define PANEL_SCAN  FOUR_SCAN_16PX_HIGH
#elif SIGN_PANEL == PANEL_P10_32x16_8S
  #define PANEL_RES_X 32
  #define PANEL_RES_Y 16
  #define PANEL_SCAN  STANDARD_TWO_SCAN
#elif SIGN_PANEL == PANEL_64x32_16S
  #define PANEL_RES_X 64
  #define PANEL_RES_Y 32
  #define PANEL_SCAN  STANDARD_TWO_SCAN
#elif SIGN_PANEL == PANEL_OUTDOOR_64x32_8S
  #define PANEL_RES_X 64
  #define PANEL_RES_Y 32
  #define PANEL_SCAN  FOUR_SCAN_32PX_HIGH
#elif SIGN_PANEL == PANEL_64x64_32S
  #define PANEL_RES_X 64
  #define PANEL_RES_Y 64
  #define PANEL_SCAN  STANDARD_TWO_SCAN
#else
  #define PANEL_RES_X 32
  #define PANEL_RES_Y 16
  #define PANEL_SCAN  FOUR_SCAN_16PX_HIGH
#endif

// Driver chip on the panel (printed on the ICs). Most are plain shift
// registers; FM6126A / ICN2038S panels stay black without the right setting.
// One of: SHIFTREG, FM6124, FM6126A, ICN2038S, MBI5124, DP3246
#define PANEL_DRIVER HUB75_I2S_CFG::SHIFTREG

// Flip to false if pixels look smeared or shifted by one column.
#define PANEL_CLK_PHASE true

// ---------------------------------------------------------------------------
// 3. Panel grid. 3 x 3 of 320x160 mm P10 modules = 960 x 480 mm, 96 x 48 px.
// ---------------------------------------------------------------------------
#define GRID_COLS 3
#define GRID_ROWS 3

// How the ribbon cable snakes through the grid, seen from the FRONT (LED side):
// CHAIN_TOP_RIGHT_DOWN = data enters the top-right panel, runs right-to-left,
// then each row below reverses (serpentine; alternate rows mounted upside
// down). _ZZ variants = every row runs the same way, all panels upright.
// If the test pattern comes out scrambled, this is the setting to change.
#define GRID_CHAIN CHAIN_TOP_RIGHT_DOWN

// ---------------------------------------------------------------------------
// 4. Power. Hard cap on brightness (0–255) whatever the app asks for — lower
//    it if your 5 V supply browns out (flicker / resets) on bright frames.
// ---------------------------------------------------------------------------
#define MAX_BRIGHTNESS 255

// ---------------------------------------------------------------------------
// 5. Misc
// ---------------------------------------------------------------------------
#define FW_VERSION "1.0.0"
#define SIGN_NAME_PREFIX "RegSign"   // advertised as RegSign-XXXX (last MAC bytes)
#define DELTA_HOLD_MS 8000           // countdown mode: show the delta this long after a lap
#define FRAME_MS 40                  // redraw interval (25 fps)

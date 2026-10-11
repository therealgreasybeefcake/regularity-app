// Renders a set of example screens with the firmware's own renderer and power
// estimate, as 96x48 PPM frames plus out/scenes.tsv for render.py.
// Add a Scene below to preview your own layout.

#include <Adafruit_GFX.h>

#include <functional>
#include <string>
#include <vector>

#include "../src/config.h"
#include "../src/power.h"
#include "../src/renderer.h"

static const int W = PANEL_RES_X * GRID_COLS, H = PANEL_RES_Y * GRID_ROWS;
static const uint32_t NOW = 100000;  // millis() at render time

struct Scene {
  std::string id, title;
  std::function<void(SignState&)> setup;
};

static void lap(SignState& s, uint8_t type, int32_t deltaMs, uint32_t timeMs, uint32_t agoMs = 20000) {
  s.lap.valid = true;
  s.lap.type = type;
  s.lap.number = 12;
  s.lap.deltaMs = deltaMs;
  s.lap.timeMs = timeMs;
  s.lap.targetMs = timeMs - deltaMs;
  strcpy(s.lap.initials, "DA ");
  s.lap.receivedAt = NOW - agoMs;
}

static void timer(SignState& s, uint32_t elapsedMs, uint32_t targetMs) {
  s.timer = {true, true, elapsedMs, targetMs, NOW};
}

static FieldStyle byLap(uint8_t f) { return {f, true, {255, 255, 255}}; }
static FieldStyle fixed(uint8_t f, Rgb c) { return {f, false, c}; }

int main(int argc, char** argv) {
  const char* outDir = argc > 1 ? argv[1] : "out";
  const std::vector<Scene> scenes = {
      {"delta-bonus", "Delta · bonus lap", [](SignState& s) { lap(s, LAP_BONUS, 420, 108740); }},
      {"delta-base", "Delta · base lap", [](SignState& s) { lap(s, LAP_BASE, 1730, 110050); }},
      {"delta-broken", "Delta · broken lap (orange)", [](SignState& s) { lap(s, LAP_BROKEN, -380, 107940); }},
      {"laptime", "Lap time (1:48.7 → 48.7)", [](SignState& s) {
         s.layout.main = byLap(F_LAP_TIME);
         lap(s, LAP_BONUS, 420, 108740);
       }},
      {"delta-over-time", "Delta + time", [](SignState& s) {
         s.layout.secondary = fixed(F_LAP_TIME, {255, 255, 255});
         s.layout.secondarySize = SEC_HALF;
         lap(s, LAP_BONUS, 420, 108740);
       }},
      {"time-over-delta", "Time + delta", [](SignState& s) {
         s.layout.main = fixed(F_LAP_TIME, {255, 255, 255});
         s.layout.secondary = byLap(F_DELTA);
         s.layout.secondarySize = SEC_HALF;
         lap(s, LAP_BASE, 1730, 110050);
       }},
      {"delta-driver", "Delta + driver strip", [](SignState& s) {
         s.layout.secondary = fixed(F_DRIVER_LAP, {160, 160, 160});
         s.layout.secondarySize = SEC_STRIP;
         lap(s, LAP_BONUS, 420, 108740);
       }},
      {"countdown", "Countdown · mid-lap", [](SignState& s) {
         s.layout.main = byLap(F_COUNTDOWN);
         s.layout.holdSec = 8;
         lap(s, LAP_BONUS, 420, 108740);
         timer(s, 63300, 108320);
       }},
      {"countdown-window", "Countdown · in the bonus window", [](SignState& s) {
         s.layout.main = byLap(F_COUNTDOWN);
         s.layout.holdSec = 8;
         lap(s, LAP_BONUS, 420, 108740);
         timer(s, 108650, 108320);
       }},
      {"custom", "Custom · 1:48.7 + lap no. (third)", [](SignState& s) {
         s.layout.main = fixed(F_LAP_TIME_FULL, {0, 255, 255});
         s.layout.secondary = byLap(F_LAP_NUMBER);
         s.layout.secondarySize = SEC_THIRD;
         lap(s, LAP_BASE, 1730, 110050);
       }},
      {"two-decimals", "Delta · 2 decimals", [](SignState& s) {
         s.config.decimals = 2;
         lap(s, LAP_BONUS, 420, 108740);
       }},
      {"solid-broken", "Solid board on broken laps", [](SignState& s) {
         s.config.flags |= FLAG_FILL_ON_BROKEN;
         lap(s, LAP_BROKEN, -380, 107940);
       }},
      {"eco-dark", "Eco · dark after the first 15 s of the lap", [](SignState& s) {
         s.power.ecoAfterSec = 15;
         lap(s, LAP_BONUS, 420, 108740, 40000);
         timer(s, 40000, 108320);
       }},
      {"pairing", "Waiting to pair", [](SignState& s) { s.connected = false; }},
  };

  char path[256];
  snprintf(path, sizeof path, "%s/scenes.tsv", outDir);
  FILE* tsv = fopen(path, "w");
  if (!tsv) return perror(path), 1;
  fprintf(tsv, "id\ttitle\twatts_full\tbrightness_bank\twatts_bank\n");

  for (const Scene& sc : scenes) {
    SignState s;
    s.connected = true;
    strcpy(s.name, "RegSign-AB12");
    s.power = {0, 0, 0};
    sc.setup(s);

    GFXcanvas16 canvas(W, H);
    Renderer::draw(canvas, s, NOW);

    // Power at the default brightness (75%), and what the 30 W PD power bank budget (22 W) allows.
    const float lit = Power::litChannels(canvas.getBuffer(), W * H);
    const uint8_t req = s.config.brightness;
    const uint8_t limited = Power::limitBrightness(lit, req, 22);
    fprintf(tsv, "%s\t%s\t%.1f\t%u\t%.1f\n", sc.id.c_str(), sc.title.c_str(), Power::estimateWatts(lit, req), limited,
            Power::estimateWatts(lit, limited));

    snprintf(path, sizeof path, "%s/%s.ppm", outDir, sc.id.c_str());
    FILE* f = fopen(path, "wb");
    fprintf(f, "P6\n%d %d\n255\n", W, H);
    for (int i = 0; i < W * H; i++) {
      const uint16_t c = canvas.getBuffer()[i];
      const uint8_t rgb[3] = {(uint8_t)((c >> 11) * 255 / 31), (uint8_t)(((c >> 5) & 0x3F) * 255 / 63),
                              (uint8_t)((c & 0x1F) * 255 / 31)};
      fwrite(rgb, 1, 3, f);
    }
    fclose(f);
  }
  fclose(tsv);
  printf("rendered %zu scenes to %s/\n", scenes.size(), outDir);
}

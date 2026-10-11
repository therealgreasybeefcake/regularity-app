#include "power.h"

#include <math.h>

#include "config.h"

namespace {

// The HUB75 library applies CIE1931 lightness correction, so a channel value
// of 50% lights the LED for roughly 20% of the time. A 2.2 power curve is
// close enough for an estimate.
float duty5[32];
float duty6[64];
bool tablesReady = false;

void buildTables() {
  for (int i = 0; i < 32; i++) duty5[i] = powf(i / 31.0f, 2.2f);
  for (int i = 0; i < 64; i++) duty6[i] = powf(i / 63.0f, 2.2f);
  tablesReady = true;
}

}  // namespace

namespace Power {

float litChannels(const uint16_t* frame, size_t pixels) {
  if (!tablesReady) buildTables();
  float sum = 0;
  for (size_t i = 0; i < pixels; i++) {
    const uint16_t c = frame[i];
    if (!c) continue;
    sum += duty5[c >> 11] + duty6[(c >> 5) & 0x3F] + duty5[c & 0x1F];
  }
  return sum;
}

float idleWatts() { return GRID_ROWS * GRID_COLS * IDLE_WATTS_PER_PANEL + CONTROLLER_WATTS; }

float estimateWatts(float lit, uint8_t brightness) {
  return idleWatts() + lit * WATTS_PER_LED_CHANNEL * (brightness / 255.0f);
}

uint8_t limitBrightness(float lit, uint8_t requested, uint16_t budgetW) {
  if (!budgetW || lit <= 0) return requested;
  const float ledBudget = budgetW - idleWatts();
  if (ledBudget <= 0) return MIN_BRIGHTNESS;
  const float maxB = ledBudget / (lit * WATTS_PER_LED_CHANNEL) * 255.0f;
  if (maxB >= requested) return requested;
  return (uint8_t)max<float>(MIN_BRIGHTNESS, maxB);
}

}  // namespace Power

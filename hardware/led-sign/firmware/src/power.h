#pragma once
#include <Arduino.h>

// Power estimate for a rendered frame, and the brightness that keeps it under
// a budget — so a power bank never sees more than it can supply. Calibrate
// the constants in config.h against a meter on your own panels.

namespace Power {
/** Sum of lit LED channel duty over an RGB565 frame (0..3 per pixel). */
float litChannels(const uint16_t* frame, size_t pixels);
/** Panels + controller with every LED off. */
float idleWatts();
/** Estimated total draw for a frame at a brightness (0–255). */
float estimateWatts(float litChannels, uint8_t brightness);
/** Highest brightness <= requested that keeps the frame within budgetW (0 = no limit). */
uint8_t limitBrightness(float litChannels, uint8_t requested, uint16_t budgetW);
}  // namespace Power

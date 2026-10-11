#pragma once
#include <Adafruit_GFX.h>

#include "protocol.h"

struct SignState {
  SignConfig config;
  SignLayout layout;
  PowerConfig power;
  LapInfo lap;
  TimerInfo timer;
  bool connected = false;
  uint32_t testStartedAt = 0;  // 0 = no test running
  char name[24] = {0};
};

// Draws the sign onto any Adafruit_GFX surface, auto-fitting to its width()
// and height() — so a different panel grid (or even a WS2812 NeoMatrix) only
// changes main.cpp's display setup, never this.
namespace Renderer {
void draw(Adafruit_GFX& gfx, const SignState& state, uint32_t now);
/** Eco mode: false while the car is nowhere near the board (sign goes dark). */
bool isLit(const SignState& state, uint32_t now);
}

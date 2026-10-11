#pragma once
// Wire protocol — mirror of packages/core/src/ledSign.ts. Keep in lockstep.
// One GATT write = one command, <= 20 bytes, little-endian.

#include <Arduino.h>

#define LED_SIGN_PROTOCOL_VERSION 1
#define SERVICE_UUID "a9fa0001-8e2e-4c12-9682-7dd27dea5a5b"
#define COMMAND_UUID "a9fa0002-8e2e-4c12-9682-7dd27dea5a5b"
#define INFO_UUID    "a9fa0003-8e2e-4c12-9682-7dd27dea5a5b"

enum Op : uint8_t { OP_LAP = 0x01, OP_TIMER = 0x02, OP_CONFIG = 0x03, OP_CLEAR = 0x04, OP_TEST = 0x05 };

// Same order as LED_SIGN_LAP_TYPES in the app.
enum LapType : uint8_t { LAP_BONUS = 0, LAP_BASE, LAP_BROKEN, LAP_CHANGEOVER, LAP_SAFETY, LAP_TYPE_COUNT };
enum Mode : uint8_t { MODE_DELTA = 0, MODE_DELTA_LAP = 1, MODE_COUNTDOWN = 2 };

#define FLAG_FILL_ON_BROKEN (1 << 0)
#define FLAG_FLIP           (1 << 1)
#define FLAG_FLASH_SAFETY   (1 << 2)

struct Rgb { uint8_t r, g, b; };

struct SignConfig {
  uint8_t brightness = 192;
  uint8_t mode = MODE_DELTA;
  uint8_t decimals = 1;
  uint8_t flags = FLAG_FLASH_SAFETY;
  Rgb colors[LAP_TYPE_COUNT] = {{0, 255, 0}, {255, 160, 0}, {255, 0, 0}, {0, 120, 255}, {255, 220, 0}};
};

struct LapInfo {
  bool valid = false;
  uint8_t type = LAP_BASE;
  uint16_t number = 0;
  int32_t deltaMs = 0;
  uint32_t targetMs = 0;
  char initials[4] = {0};
  uint32_t receivedAt = 0;  // millis()
};

struct TimerInfo {
  bool known = false;
  bool running = false;
  uint32_t elapsedMs = 0;   // at receivedAt
  uint32_t targetMs = 0;
  uint32_t receivedAt = 0;  // millis()

  uint32_t elapsedNow(uint32_t now) const { return running ? elapsedMs + (now - receivedAt) : elapsedMs; }
};

inline uint16_t rdU16(const uint8_t* p) { return p[0] | (p[1] << 8); }
inline uint32_t rdU32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

inline bool parseLap(const uint8_t* d, size_t len, LapInfo& out) {
  if (len < 15 || d[0] != OP_LAP) return false;
  out.type = d[1] < LAP_TYPE_COUNT ? d[1] : (uint8_t)LAP_BASE;
  out.number = rdU16(d + 2);
  out.deltaMs = (int32_t)rdU32(d + 4);
  out.targetMs = rdU32(d + 8);
  for (int i = 0; i < 3; i++) out.initials[i] = (d[12 + i] >= 32 && d[12 + i] < 127) ? (char)d[12 + i] : ' ';
  out.initials[3] = 0;
  out.valid = true;
  return true;
}

inline bool parseTimer(const uint8_t* d, size_t len, TimerInfo& out) {
  if (len < 10 || d[0] != OP_TIMER) return false;
  out.running = d[1] != 0;
  out.elapsedMs = rdU32(d + 2);
  out.targetMs = rdU32(d + 6);
  out.known = true;
  return true;
}

inline bool parseConfig(const uint8_t* d, size_t len, SignConfig& out) {
  if (len < 20 || d[0] != OP_CONFIG) return false;
  out.brightness = d[1] ? d[1] : 1;
  out.mode = d[2] <= MODE_COUNTDOWN ? d[2] : (uint8_t)MODE_DELTA;
  out.decimals = d[3] == 2 ? 2 : 1;
  out.flags = d[4];
  for (int i = 0; i < LAP_TYPE_COUNT; i++) out.colors[i] = {d[5 + i * 3], d[6 + i * 3], d[7 + i * 3]};
  return true;
}

// "+0.4" / "-12.34": explicit sign, truncated (not rounded) — same as formatSignDelta().
inline void formatDelta(int32_t ms, uint8_t decimals, char* out, size_t outLen) {
  bool neg = ms < 0;
  uint32_t abs = neg ? (uint32_t)(-(int64_t)ms) : (uint32_t)ms;
  uint32_t unit = decimals == 1 ? 100 : 10;
  uint32_t whole = abs / 1000;
  uint32_t frac = (abs % 1000) / unit;
  if (decimals == 1) snprintf(out, outLen, "%c%lu.%lu", neg ? '-' : '+', (unsigned long)whole, (unsigned long)frac);
  else snprintf(out, outLen, "%c%lu.%02lu", neg ? '-' : '+', (unsigned long)whole, (unsigned long)frac);
}

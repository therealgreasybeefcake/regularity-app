#pragma once
// Wire protocol — mirror of packages/core/src/ledSign.ts. Keep in lockstep.
// One GATT write = one command, <= 20 bytes, little-endian.

#include <Arduino.h>

#define LED_SIGN_PROTOCOL_VERSION 1
#define SERVICE_UUID "a9fa0001-8e2e-4c12-9682-7dd27dea5a5b"
#define COMMAND_UUID "a9fa0002-8e2e-4c12-9682-7dd27dea5a5b"
#define INFO_UUID    "a9fa0003-8e2e-4c12-9682-7dd27dea5a5b"

enum Op : uint8_t {
  OP_LAP = 0x01,
  OP_TIMER = 0x02,
  OP_CONFIG = 0x03,
  OP_CLEAR = 0x04,
  OP_TEST = 0x05,
  OP_LAYOUT = 0x06,
  OP_POWER = 0x07,
};

// Same order as LED_SIGN_LAP_TYPES in the app.
enum LapType : uint8_t { LAP_BONUS = 0, LAP_BASE, LAP_BROKEN, LAP_CHANGEOVER, LAP_SAFETY, LAP_TYPE_COUNT };

// Same order as LED_SIGN_FIELDS in the app.
enum Field : uint8_t {
  F_NONE = 0,
  F_DELTA,         // +0.4
  F_LAP_TIME,      // 48.7 (minutes implied)
  F_LAP_TIME_FULL, // 1:48.7
  F_COUNTDOWN,     // live
  F_ELAPSED,       // live, minutes implied
  F_LAP_NUMBER,    // L12
  F_DRIVER,        // DA
  F_DRIVER_LAP,    // DA L12
  F_TARGET,        // 48.3 (minutes implied)
  F_COUNT
};

enum SecondarySize : uint8_t { SEC_STRIP = 0, SEC_THIRD, SEC_HALF };

#define FLAG_FILL_ON_BROKEN (1 << 0)
#define FLAG_FLIP           (1 << 1)
#define FLAG_FLASH_SAFETY   (1 << 2)

struct Rgb { uint8_t r, g, b; };

struct SignConfig {
  uint8_t brightness = 192;
  uint8_t reserved = 0;
  uint8_t decimals = 1;
  uint8_t flags = FLAG_FLASH_SAFETY;
  Rgb colors[LAP_TYPE_COUNT] = {{0, 255, 0}, {255, 160, 0}, {255, 0, 0}, {0, 120, 255}, {255, 220, 0}};
};

struct FieldStyle {
  uint8_t field;
  bool byLapType;  // false = fixed rgb
  Rgb rgb;
};

struct SignLayout {
  FieldStyle main = {F_DELTA, true, {255, 255, 255}};
  FieldStyle secondary = {F_NONE, false, {255, 255, 255}};
  uint8_t secondarySize = SEC_STRIP;
  uint8_t holdField = F_DELTA;
  uint8_t holdSec = 0;
};

struct PowerConfig {
  uint16_t budgetW;  // 0 = no limit
  uint8_t ecoLeadSec;  // 0 = always lit; else light only from this long before the car is due
};

struct LapInfo {
  bool valid = false;
  uint8_t type = LAP_BASE;
  uint16_t number = 0;
  int32_t deltaMs = 0;
  uint32_t targetMs = 0;
  uint32_t timeMs = 0;
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
  // Lap time arrived in 1.1; derive it from target + delta for older senders.
  out.timeMs = len >= 19 ? rdU32(d + 15) : (uint32_t)max<int64_t>(0, (int64_t)out.targetMs + out.deltaMs);
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
  out.decimals = d[3] == 2 ? 2 : 1;
  out.flags = d[4];
  for (int i = 0; i < LAP_TYPE_COUNT; i++) out.colors[i] = {d[5 + i * 3], d[6 + i * 3], d[7 + i * 3]};
  return true;
}

inline FieldStyle parseFieldStyle(const uint8_t* d) {
  return {d[0] < F_COUNT ? d[0] : (uint8_t)F_NONE, d[1] == 0, {d[2], d[3], d[4]}};
}

inline bool parseLayout(const uint8_t* d, size_t len, SignLayout& out) {
  if (len < 14 || d[0] != OP_LAYOUT) return false;
  out.main = parseFieldStyle(d + 1);
  out.secondary = parseFieldStyle(d + 6);
  out.secondarySize = d[11] <= SEC_HALF ? d[11] : (uint8_t)SEC_STRIP;
  out.holdField = d[12] < F_COUNT ? d[12] : (uint8_t)F_DELTA;
  out.holdSec = d[13];
  return true;
}

inline bool parsePower(const uint8_t* d, size_t len, PowerConfig& out) {
  if (len < 3 || d[0] != OP_POWER) return false;
  out.budgetW = rdU16(d + 1);
  out.ecoLeadSec = len >= 4 ? d[3] : 0;
  return true;
}

// ---- Field text: same strings as signFieldText() in the app ----

// "+0.4" / "-12.34": explicit sign, truncated (not rounded).
inline void formatDelta(int32_t ms, uint8_t decimals, char* out, size_t outLen) {
  bool neg = ms < 0;
  uint32_t abs = neg ? (uint32_t)(-(int64_t)ms) : (uint32_t)ms;
  uint32_t frac = (abs % 1000) / (decimals == 1 ? 100 : 10);
  if (decimals == 1) snprintf(out, outLen, "%c%lu.%lu", neg ? '-' : '+', (unsigned long)(abs / 1000), (unsigned long)frac);
  else snprintf(out, outLen, "%c%lu.%02lu", neg ? '-' : '+', (unsigned long)(abs / 1000), (unsigned long)frac);
}

// Minutes implied: 108740 -> "48.7" (seconds always 2 digits). Full: "1:48.7", or "48.7" under a minute.
inline void formatTime(uint32_t ms, uint8_t decimals, bool impliedMinutes, char* out, size_t outLen) {
  unsigned long frac = (ms % 1000) / (decimals == 1 ? 100 : 10);
  unsigned long secs = (ms / 1000) % 60, mins = ms / 60000;
  const char* fracFmt = decimals == 1 ? "%lu" : "%02lu";
  char fracStr[4];
  snprintf(fracStr, sizeof fracStr, fracFmt, frac);
  if (impliedMinutes) snprintf(out, outLen, "%02lu.%s", secs, fracStr);
  else if (mins > 0) snprintf(out, outLen, "%lu:%02lu.%s", mins, secs, fracStr);
  else snprintf(out, outLen, "%lu.%s", secs, fracStr);
}

// "1:05", "45", "9.4" counting down; "+0.3" once past target.
inline void formatCountdown(int64_t remainingMs, char* out, size_t outLen) {
  if (remainingMs <= 0) return formatDelta((int32_t)(-remainingMs), 1, out, outLen);
  unsigned long r = (unsigned long)remainingMs;
  if (r >= 60000) snprintf(out, outLen, "%lu:%02lu", r / 60000, (r / 1000) % 60);
  else if (r >= 10000) snprintf(out, outLen, "%lu", r / 1000);
  else snprintf(out, outLen, "%lu.%lu", r / 1000, (r % 1000) / 100);
}

#pragma once
#include <Arduino.h>

// NimBLE GATT server: one write characteristic for commands, one read
// characteristic with firmware/display info. Writes arrive on the BLE task and
// are queued; the main loop drains them with poll().

struct Packet {
  uint8_t len;
  uint8_t data[20];
};

namespace BleLink {
void begin(const char* deviceName, const char* infoString);
bool poll(Packet& out);
bool connected();
}  // namespace BleLink

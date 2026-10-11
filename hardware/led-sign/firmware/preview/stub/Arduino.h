// Just enough of Arduino for Adafruit GFX + the sign renderer to build on a PC.
#pragma once
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <string>
using std::max;
using std::min;

#define PROGMEM
#define pgm_read_byte(a) (*(const uint8_t*)(a))
#define pgm_read_word(a) (*(const uint16_t*)(a))
#define pgm_read_dword(a) (*(const uint32_t*)(a))
typedef uint8_t byte;
typedef bool boolean;

class __FlashStringHelper;
struct String {
  std::string s;
  String(const char* c = "") : s(c) {}
  unsigned length() const { return s.size(); }
  const char* c_str() const { return s.c_str(); }
};

class Print {
 public:
  virtual size_t write(uint8_t) = 0;
  virtual size_t write(const uint8_t* b, size_t n) {
    size_t r = 0;
    while (n--) r += write(*b++);
    return r;
  }
  size_t print(const char* s) { return write((const uint8_t*)s, strlen(s)); }
  virtual ~Print() {}
};

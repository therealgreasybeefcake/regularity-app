#include "renderer.h"

#include "config.h"

namespace {

// Bold 7-segment glyphs drawn from rectangles: scale to any height, thick
// strokes that survive LED bloom at distance, and no font files.
struct Metrics {
  int h, w, t, gap, signW;
};

Metrics metricsFor(int h) {
  Metrics m;
  m.h = h;
  m.w = max(3, h / 2);
  m.t = max(1, (h + 3) / 7);  // ~14% stroke: 6 px (60 mm) on a 44 px digit
  m.gap = max(1, m.t / 2);
  m.signW = max(3, (m.w * 4) / 5);
  return m;
}

// Segment bits a b c d e f g; 0 = not a segment glyph.
uint8_t segBits(char c) {
  static const uint8_t DIGITS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
  if (c >= '0' && c <= '9') return DIGITS[c - '0'];
  if (c == 'L') return 0x38;
  return 0;
}

/** True if every char can be drawn in the segment font (else use the text font). */
bool isSegmentText(const char* s) {
  for (; *s; s++)
    if (!segBits(*s) && !strchr("+-.: ", *s)) return false;
  return true;
}

int glyphWidth(char c, const Metrics& m) {
  if (segBits(c)) return m.w;
  if (c == '+' || c == '-') return m.signW;
  if (c == '.' || c == ':') return m.t;
  if (c == ' ') return m.w / 2;
  return 0;
}

int textWidth(const char* s, const Metrics& m) {
  int w = 0, n = 0;
  for (; *s; s++) {
    int g = glyphWidth(*s, m);
    if (!g) continue;
    w += g;
    n++;
  }
  return n ? w + (n - 1) * m.gap : 0;
}

void drawSegments(Adafruit_GFX& gfx, int x, int y, const Metrics& m, uint8_t s, uint16_t color) {
  const int t = m.t, w = m.w, h = m.h;
  const int mid = y + (h - t) / 2;
  if (s & 0x01) gfx.fillRect(x, y, w, t, color);                     // a
  if (s & 0x02) gfx.fillRect(x + w - t, y, t, mid - y + t, color);   // b
  if (s & 0x04) gfx.fillRect(x + w - t, mid, t, y + h - mid, color); // c
  if (s & 0x08) gfx.fillRect(x, y + h - t, w, t, color);             // d
  if (s & 0x10) gfx.fillRect(x, mid, t, y + h - mid, color);         // e
  if (s & 0x20) gfx.fillRect(x, y, t, mid - y + t, color);           // f
  if (s & 0x40) gfx.fillRect(x, mid, w, t, color);                   // g
}

void drawGlyph(Adafruit_GFX& gfx, int x, int y, const Metrics& m, char c, uint16_t color) {
  const int mid = y + (m.h - m.t) / 2;
  if (uint8_t s = segBits(c)) {
    drawSegments(gfx, x, y, m, s, color);
  } else if (c == '-') {
    gfx.fillRect(x, mid, m.signW, m.t, color);
  } else if (c == '+') {
    gfx.fillRect(x, mid, m.signW, m.t, color);
    gfx.fillRect(x + (m.signW - m.t) / 2, mid + m.t / 2 - m.signW / 2, m.t, m.signW, color);
  } else if (c == '.') {
    gfx.fillRect(x, y + m.h - m.t, m.t, m.t, color);
  } else if (c == ':') {
    gfx.fillRect(x, y + m.h / 3 - m.t / 2, m.t, m.t, color);
    gfx.fillRect(x, y + (2 * m.h) / 3 - m.t / 2, m.t, m.t, color);
  }
}

// Built-in 6x8 GFX font, scaled. Used for letters (driver initials) and the strip.
void drawFontText(Adafruit_GFX& gfx, const char* s, int bx, int by, int bw, int bh, uint16_t color, bool center) {
  int len = strlen(s);
  if (!len) return;
  int size = max(1, min(bh / 8, (bw + 1) / (len * 6)));
  int tw = len * 6 * size - size;
  gfx.setTextWrap(false);
  gfx.setTextSize(size);
  gfx.setTextColor(color);
  gfx.setCursor(center ? bx + max(0, (bw - tw) / 2) : bx, by + (bh - 8 * size) / 2 + (size > 1 ? size / 2 : 0));
  gfx.print(s);
}

// Largest glyph height whose text fits the box, centred in it.
void drawTextFit(Adafruit_GFX& gfx, const char* s, int bx, int by, int bw, int bh, uint16_t color) {
  if (!isSegmentText(s)) return drawFontText(gfx, s, bx, by, bw, bh, color, true);
  for (int h = bh; h >= 5; h--) {
    Metrics m = metricsFor(h);
    int tw = textWidth(s, m);
    if (tw > bw) continue;
    int x = bx + (bw - tw) / 2;
    int y = by + (bh - h) / 2;
    for (const char* p = s; *p; p++) {
      int g = glyphWidth(*p, m);
      if (!g) continue;
      drawGlyph(gfx, x, y, m, *p, color);
      x += g + m.gap;
    }
    return;
  }
}

void drawSmallCentered(Adafruit_GFX& gfx, const char* s, int y, uint16_t color) {
  drawFontText(gfx, s, 0, y, gfx.width(), 8, color, true);
}

uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
uint16_t rgb565(const Rgb& c) { return rgb565(c.r, c.g, c.b); }

const uint16_t WHITE = 0xFFFF;
const uint16_t DIM = rgb565(90, 90, 90);
const uint16_t LINK_BLUE = rgb565(0, 80, 255);

bool isLive(uint8_t f) { return f == F_COUNTDOWN || f == F_ELAPSED; }

uint32_t targetMs(const SignState& st) { return st.timer.targetMs ? st.timer.targetMs : st.lap.targetMs; }

/** Live fields give way to the hold field for a few seconds after each lap. */
uint8_t effectiveField(const SignState& st, uint8_t field, uint32_t now) {
  if (isLive(field) && st.lap.valid && st.layout.holdSec && now - st.lap.receivedAt < st.layout.holdSec * 1000UL)
    return st.layout.holdField;
  return field;
}

void trimmed(const char* in, char* out, size_t n) {
  snprintf(out, n, "%s", in);
  for (int i = strlen(out) - 1; i >= 0 && out[i] == ' '; i--) out[i] = 0;
}

/** Same strings as signFieldText() in the app. False = nothing to show yet. */
bool fieldText(const SignState& st, uint8_t field, uint32_t now, char* out, size_t n) {
  const LapInfo& lap = st.lap;
  const uint8_t dec = st.config.decimals;
  char initials[4];
  trimmed(lap.initials, initials, sizeof initials);
  switch (field) {
    case F_DELTA:
      if (!lap.valid) return false;
      formatDelta(lap.deltaMs, dec, out, n);
      return true;
    case F_LAP_TIME:
    case F_LAP_TIME_FULL:
      if (!lap.valid) return false;
      formatTime(lap.timeMs, dec, field == F_LAP_TIME, out, n);
      return true;
    case F_COUNTDOWN:
      if (!st.timer.known) return false;
      formatCountdown((int64_t)targetMs(st) - (int64_t)st.timer.elapsedNow(now), out, n);
      return true;
    case F_ELAPSED:
      if (!st.timer.known) return false;
      formatTime(st.timer.elapsedNow(now), 1, true, out, n);
      return true;
    case F_LAP_NUMBER:
      if (!lap.valid) return false;
      snprintf(out, n, "L%u", lap.number);
      return true;
    case F_DRIVER:
      if (!lap.valid || !initials[0]) return false;
      snprintf(out, n, "%s", initials);
      return true;
    case F_DRIVER_LAP:
      if (!lap.valid) return false;
      snprintf(out, n, initials[0] ? "%s L%u" : "%sL%u", initials, lap.number);
      return true;
    case F_TARGET:
      if (!targetMs(st)) return false;
      formatTime(targetMs(st), dec, true, out, n);
      return true;
    default:
      return false;
  }
}

uint16_t fieldColor(const SignState& st, uint8_t field, const FieldStyle& style, uint32_t now) {
  if (!style.byLapType) return rgb565(style.rgb);
  if (isLive(field)) {
    // Colour of the lap if it ended now: not yet due = white, bonus window, then base.
    int64_t over = (int64_t)st.timer.elapsedNow(now) - (int64_t)targetMs(st);
    if (over < 0) return WHITE;
    return rgb565(st.config.colors[over < 1000 ? LAP_BONUS : LAP_BASE]);
  }
  return st.lap.valid ? rgb565(st.config.colors[st.lap.type]) : DIM;
}

void drawField(Adafruit_GFX& gfx, const SignState& st, const FieldStyle& style, int x, int y, int w, int h, bool strip,
               bool blackText, uint32_t now) {
  const uint8_t field = effectiveField(st, style.field, now);
  char text[24];
  if (!fieldText(st, field, now, text, sizeof text)) {
    if (!strip) drawTextFit(gfx, st.config.decimals == 2 ? "-.--" : "-.-", x, y, w, h, DIM);
    return;
  }
  uint16_t color = blackText ? 0 : fieldColor(st, field, style, now);
  if (strip) drawFontText(gfx, text, x, y, w, h, color, false);
  else drawTextFit(gfx, text, x, y, w, h, color);
}

void drawLinkHint(Adafruit_GFX& gfx, const SignState& st, uint32_t now) {
  if (!st.connected && (now / 500) % 2 == 0) gfx.fillRect(0, 0, 2, 2, LINK_BLUE);
}

void drawTest(Adafruit_GFX& gfx, const SignState& st, uint32_t elapsed) {
  // 5 x 0.6 s solid fills (one per lap colour; checks every pixel and the
  // supply under load), then 2 s of "88.8" outline for chain/orientation.
  uint32_t step = elapsed / 600;
  if (step < LAP_TYPE_COUNT) {
    gfx.fillScreen(rgb565(st.config.colors[step]));
    return;
  }
  gfx.drawRect(0, 0, gfx.width(), gfx.height(), WHITE);
  drawTextFit(gfx, "88.8", 2, 2, gfx.width() - 4, gfx.height() - 4, WHITE);
}

}  // namespace

namespace Renderer {

bool isLit(const SignState& st, uint32_t now) {
  const PowerConfig& p = st.power;
  if ((!p.ecoLeadSec && !p.ecoAfterSec) || !st.timer.known || !st.timer.running) return true;
  // After a lap: the lap's digits, for ecoAfterSec (measured from lap start, i.e. when the lap arrived).
  if (p.ecoAfterSec && st.lap.valid && now - st.lap.receivedAt < p.ecoAfterSec * 1000UL) return true;
  // Before the car is due: e.g. for a countdown.
  return p.ecoLeadSec && targetMs(st) && st.timer.elapsedNow(now) + p.ecoLeadSec * 1000UL >= targetMs(st);
}

void draw(Adafruit_GFX& gfx, const SignState& st, uint32_t now) {
  const int W = gfx.width(), H = gfx.height();
  gfx.fillScreen(0);

  if (st.testStartedAt) {
    drawTest(gfx, st, now - st.testStartedAt);
    return;
  }

  if (!st.lap.valid && !st.connected) {
    // Name on screen so you know which sign to pick in the app (shortened to
    // its unique suffix if the sign is too narrow for "RegSign-AB12").
    const char* name = st.name;
    const char* dash = strchr(name, '-');
    if ((int)strlen(name) * 6 - 1 > W && dash) name = dash + 1;
    drawSmallCentered(gfx, name, H / 2 - 9, DIM);
    drawSmallCentered(gfx, 11 * 6 - 1 > W ? "PAIR" : "PAIR IN APP", H / 2 + 2, DIM);
    drawLinkHint(gfx, st, now);
    return;
  }

  if (!isLit(st, now)) {
    gfx.drawPixel(W / 2, H - 1, DIM);  // eco: dark between passes, one "alive" pixel
    drawLinkHint(gfx, st, now);
    return;
  }

  const SignConfig& cfg = st.config;
  const bool filled = st.lap.valid && st.lap.type == LAP_BROKEN && (cfg.flags & FLAG_FILL_ON_BROKEN);
  if (filled) gfx.fillScreen(rgb565(cfg.colors[LAP_BROKEN]));
  const bool flashOff = st.lap.valid && st.lap.type == LAP_SAFETY && (cfg.flags & FLAG_FLASH_SAFETY) && (now / 250) % 2;

  if (!flashOff) {
    const SignLayout& lay = st.layout;
    if (lay.secondary.field == F_NONE) {
      drawField(gfx, st, lay.main, 1, 1, W - 2, H - 2, false, filled, now);
    } else if (lay.secondarySize == SEC_STRIP && H >= 24) {
      drawField(gfx, st, lay.main, 1, 1, W - 2, H - 12, false, filled, now);
      drawField(gfx, st, lay.secondary, 1, H - 9, W - 2, 8, true, filled, now);
    } else {
      const int secH = lay.secondarySize == SEC_HALF ? (H - 3) / 2 : H / 3;
      const int mainH = H - secH - 3;
      drawField(gfx, st, lay.main, 1, 1, W - 2, mainH, false, filled, now);
      drawField(gfx, st, lay.secondary, 1, mainH + 2, W - 2, secH, false, filled, now);
    }
  }
  drawLinkHint(gfx, st, now);
}

}  // namespace Renderer

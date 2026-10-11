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

//                      0     1     2     3     4     5     6     7     8     9
const uint8_t SEG[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};  // bits: a b c d e f g

int glyphWidth(char c, const Metrics& m) {
  if (c >= '0' && c <= '9') return m.w;
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

void drawDigit(Adafruit_GFX& gfx, int x, int y, const Metrics& m, int d, uint16_t color) {
  const uint8_t s = SEG[d];
  const int t = m.t, w = m.w, h = m.h;
  const int mid = y + (h - t) / 2;
  if (s & 0x01) gfx.fillRect(x, y, w, t, color);                    // a
  if (s & 0x02) gfx.fillRect(x + w - t, y, t, mid - y + t, color);  // b
  if (s & 0x04) gfx.fillRect(x + w - t, mid, t, y + h - mid, color);// c
  if (s & 0x08) gfx.fillRect(x, y + h - t, w, t, color);            // d
  if (s & 0x10) gfx.fillRect(x, mid, t, y + h - mid, color);        // e
  if (s & 0x20) gfx.fillRect(x, y, t, mid - y + t, color);          // f
  if (s & 0x40) gfx.fillRect(x, mid, w, t, color);                  // g
}

void drawGlyph(Adafruit_GFX& gfx, int x, int y, const Metrics& m, char c, uint16_t color) {
  const int mid = y + (m.h - m.t) / 2;
  if (c >= '0' && c <= '9') {
    drawDigit(gfx, x, y, m, c - '0', color);
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

// Largest glyph height whose text fits the box, centred in it.
void drawTextFit(Adafruit_GFX& gfx, const char* s, int bx, int by, int bw, int bh, uint16_t color) {
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

// Built-in 6x8 GFX font, for the small info lines.
void drawSmall(Adafruit_GFX& gfx, const char* s, int x, int y, uint16_t color) {
  gfx.setTextWrap(false);
  gfx.setTextSize(1);
  gfx.setTextColor(color);
  gfx.setCursor(x, y);
  gfx.print(s);
}

void drawSmallCentered(Adafruit_GFX& gfx, const char* s, int y, uint16_t color) {
  int w = strlen(s) * 6 - 1;
  drawSmall(gfx, s, max(0, (gfx.width() - w) / 2), y, color);
}

uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
uint16_t rgb565(const Rgb& c) { return rgb565(c.r, c.g, c.b); }

const uint16_t WHITE = 0xFFFF;
const uint16_t DIM = rgb565(90, 90, 90);
const uint16_t LINK_BLUE = rgb565(0, 80, 255);

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

void drawCountdown(Adafruit_GFX& gfx, const SignState& st, uint32_t now) {
  uint32_t target = st.timer.targetMs ? st.timer.targetMs : st.lap.targetMs;
  int64_t remaining = (int64_t)target - (int64_t)st.timer.elapsedNow(now);
  char text[12];
  uint16_t color = WHITE;
  if (remaining > 0) {
    uint32_t r = (uint32_t)remaining;
    if (r >= 60000) snprintf(text, sizeof text, "%lu:%02lu", (unsigned long)(r / 60000), (unsigned long)((r / 1000) % 60));
    else if (r >= 10000) snprintf(text, sizeof text, "%lu", (unsigned long)(r / 1000));
    else snprintf(text, sizeof text, "%lu.%lu", (unsigned long)(r / 1000), (unsigned long)((r % 1000) / 100));
  } else {
    // Past target: count up, in the colour the lap would score if crossed now.
    int32_t over = (int32_t)(-remaining);
    formatDelta(over, 1, text, sizeof text);
    color = rgb565(st.config.colors[over < 1000 ? LAP_BONUS : LAP_BASE]);
  }
  drawTextFit(gfx, text, 1, 1, gfx.width() - 2, gfx.height() - 2, color);
}

}  // namespace

namespace Renderer {

void draw(Adafruit_GFX& gfx, const SignState& st, uint32_t now) {
  const int W = gfx.width(), H = gfx.height();
  gfx.fillScreen(0);

  if (st.testStartedAt) {
    drawTest(gfx, st, now - st.testStartedAt);
    return;
  }

  const SignConfig& cfg = st.config;
  const bool holdingDelta = st.lap.valid && now - st.lap.receivedAt < DELTA_HOLD_MS;
  if (cfg.mode == MODE_COUNTDOWN && st.timer.known && st.timer.running && !holdingDelta) {
    drawCountdown(gfx, st, now);
    drawLinkHint(gfx, st, now);
    return;
  }

  if (!st.lap.valid) {
    if (!st.connected) {
      // Name on screen so you know which sign to pick in the app.
      drawSmallCentered(gfx, st.name, H / 2 - 9, DIM);
      drawSmallCentered(gfx, "PAIR IN APP", H / 2 + 2, DIM);
    } else {
      drawTextFit(gfx, cfg.decimals == 2 ? "-.--" : "-.-", 1, 1, W - 2, H - 2, DIM);
    }
    drawLinkHint(gfx, st, now);
    return;
  }

  uint16_t color = rgb565(cfg.colors[st.lap.type]);
  if (st.lap.type == LAP_BROKEN && (cfg.flags & FLAG_FILL_ON_BROKEN)) {
    gfx.fillScreen(color);
    color = 0;  // black digits on a solid board
  }
  const bool flashOff = st.lap.type == LAP_SAFETY && (cfg.flags & FLAG_FLASH_SAFETY) && (now / 250) % 2;

  char text[16];
  formatDelta(st.lap.deltaMs, cfg.decimals, text, sizeof text);

  if (cfg.mode == MODE_DELTA_LAP && H >= 24) {
    const int strip = 10;  // 8 px font + 2 px gap
    if (!flashOff) drawTextFit(gfx, text, 1, 1, W - 2, H - strip - 2, color);
    char lapText[8];
    snprintf(lapText, sizeof lapText, "L%u", st.lap.number);
    uint16_t stripColor = color ? DIM : 0;
    drawSmall(gfx, st.lap.initials, 1, H - 8, stripColor);
    drawSmall(gfx, lapText, W - (int)strlen(lapText) * 6, H - 8, stripColor);
  } else if (!flashOff) {
    drawTextFit(gfx, text, 1, 1, W - 2, H - 2, color);
  }
  drawLinkHint(gfx, st, now);
}

}  // namespace Renderer

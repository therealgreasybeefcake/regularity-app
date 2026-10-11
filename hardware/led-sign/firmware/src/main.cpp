// Regularity LED sign firmware — receives laps from the Regularity app over
// Bluetooth LE and shows them on a HUB75 RGB LED panel grid.
// Hardware setup: src/config.h. Docs: hardware/led-sign/README.md.

#include <Arduino.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>
#include <Preferences.h>

#include "ble_link.h"
#include "config.h"
#include "panel_mappings.h"
#include "power.h"
#include "protocol.h"
#include "renderer.h"

#if !defined(CONFIG_IDF_TARGET_ESP32) && !defined(CONFIG_IDF_TARGET_ESP32S3)
#error "Needs an ESP32 or ESP32-S3: the S2 has no Bluetooth, and the C3/C6 aren't supported by the HUB75 library."
#endif

using SignPanel = VirtualMatrixPanel_T<GRID_CHAIN, PANEL_MAPPING>;

// Folded outdoor panels are wired electrically as twice as wide and half as
// tall as they look; PANEL_MAPPING folds pixels back.
constexpr bool kFourScan = PANEL_FOUR_SCAN;
constexpr int kDmaResX = kFourScan ? PANEL_RES_X * 2 : PANEL_RES_X;
constexpr int kDmaResY = kFourScan ? PANEL_RES_Y / 2 : PANEL_RES_Y;

static MatrixPanel_I2S_DMA* dma = nullptr;
static SignPanel* panel = nullptr;
static GFXcanvas16* frame = nullptr;  // render off-screen, measure power, then blit
static SignState state;
static Preferences prefs;
static uint32_t lastFrame = 0;
static uint32_t lastPowerLog = 0;
static uint8_t appliedBrightness = 0;

static void applyRotation() { panel->setRotation((state.config.flags & FLAG_FLIP) ? 2 : 0); }

// Settings survive a reboot (or a power-bank swap) so the sign comes back
// looking the same before the app reconnects.
static void loadSettings() {
  state.power = {POWER_BUDGET_DEFAULT_W, ECO_LEAD_DEFAULT_SEC, ECO_AFTER_DEFAULT_SEC};
  prefs.begin("sign", false);
  if (prefs.getBytesLength("cfg") == sizeof(SignConfig)) prefs.getBytes("cfg", &state.config, sizeof(SignConfig));
  if (prefs.getBytesLength("layout") == sizeof(SignLayout)) prefs.getBytes("layout", &state.layout, sizeof(SignLayout));
  if (prefs.getBytesLength("power") == sizeof(PowerConfig)) prefs.getBytes("power", &state.power, sizeof(PowerConfig));
}

static void applyPacket(const Packet& p) {
  const uint32_t now = millis();
  switch (p.data[0]) {
    case OP_LAP:
      if (parseLap(p.data, p.len, state.lap)) state.lap.receivedAt = now;
      break;
    case OP_TIMER:
      if (parseTimer(p.data, p.len, state.timer)) state.timer.receivedAt = now;
      break;
    case OP_CONFIG:
      if (parseConfig(p.data, p.len, state.config)) {
        applyRotation();
        prefs.putBytes("cfg", &state.config, sizeof(SignConfig));
      }
      break;
    case OP_LAYOUT:
      if (parseLayout(p.data, p.len, state.layout)) prefs.putBytes("layout", &state.layout, sizeof(SignLayout));
      break;
    case OP_POWER:
      if (parsePower(p.data, p.len, state.power)) prefs.putBytes("power", &state.power, sizeof(PowerConfig));
      break;
    case OP_CLEAR:
      state.lap.valid = false;
      break;
    case OP_TEST:
      state.testStartedAt = now | 1;  // never 0 (0 = no test)
      break;
    default:
      log_w("unknown opcode 0x%02x", p.data[0]);
  }
}

void setup() {
  Serial.begin(115200);
  loadSettings();

#if SIGN_BOARD == BOARD_LIBRARY_DEFAULT
  HUB75_I2S_CFG mxconfig(kDmaResX, kDmaResY, GRID_ROWS * GRID_COLS);
#else
  HUB75_I2S_CFG::i2s_pins pins = {PIN_R1, PIN_G1, PIN_B1, PIN_R2, PIN_G2, PIN_B2, PIN_A,
                                  PIN_B,  PIN_C,  PIN_D,  PIN_E,  PIN_LAT, PIN_OE, PIN_CLK};
  HUB75_I2S_CFG mxconfig(kDmaResX, kDmaResY, GRID_ROWS * GRID_COLS, pins);
#endif
  mxconfig.driver = PANEL_DRIVER;
  mxconfig.clkphase = PANEL_CLK_PHASE;
  mxconfig.double_buff = true;  // draw off-screen, flip: no tearing while digits change

  dma = new MatrixPanel_I2S_DMA(mxconfig);
  if (!dma->begin()) log_e("HUB75 DMA init failed — check config.h");
  panel = new SignPanel(GRID_ROWS, GRID_COLS, PANEL_RES_X, PANEL_RES_Y);
  panel->setDisplay(*dma);
  applyRotation();
  frame = new GFXcanvas16(panel->width(), panel->height());

  uint64_t mac = ESP.getEfuseMac();
  snprintf(state.name, sizeof state.name, "%s-%02X%02X", SIGN_NAME_PREFIX, (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  char info[64];
  snprintf(info, sizeof info, "proto=%d;fw=%s;w=%d;h=%d", LED_SIGN_PROTOCOL_VERSION, FW_VERSION, panel->width(), panel->height());
  BleLink::begin(state.name, info);
  log_i("%s ready, %dx%d px", state.name, panel->width(), panel->height());
}

void loop() {
  Packet p;
  while (BleLink::poll(p)) applyPacket(p);
  state.connected = BleLink::connected();

  const uint32_t now = millis();
  if (state.testStartedAt && now - state.testStartedAt > 5000) state.testStartedAt = 0;
  if (now - lastFrame < FRAME_MS) {
    delay(1);
    return;
  }
  lastFrame = now;

  Renderer::draw(*frame, state, now);

  // Dim just enough to keep this frame inside the power budget.
  const float lit = Power::litChannels(frame->getBuffer(), (size_t)frame->width() * frame->height());
  const uint8_t requested = min<uint8_t>(state.config.brightness, MAX_BRIGHTNESS);
  const uint8_t brightness = Power::limitBrightness(lit, requested, state.power.budgetW);
  if (abs((int)brightness - (int)appliedBrightness) > 1) {
    dma->setBrightness8(brightness);
    appliedBrightness = brightness;
  }
  if (now - lastPowerLog > 10000) {
    lastPowerLog = now;
    log_i("est. %.1f W (budget %u W), brightness %u/%u", Power::estimateWatts(lit, appliedBrightness),
          state.power.budgetW, appliedBrightness, requested);
  }

  panel->drawRGBBitmap(0, 0, frame->getBuffer(), frame->width(), frame->height());
  panel->flipDMABuffer();
}

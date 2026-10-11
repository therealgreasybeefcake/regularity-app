# Regularity LED Sign

A large Bluetooth pit-board sign. The Regularity app sends it each lap's delta, and drivers can read it from about 50 m at speed.

- **Size:** 960 × 480 mm, from a 3 × 3 grid of outdoor P10 RGB panels (96 × 48 pixels).
- **Digits:** about 460 mm tall with one decimal (`+0.4`) and about 420 mm with two (`+0.42`). That's well above the roughly 250 mm needed at 50 m.
- **Readability:** about 5,000–7,000 nit outdoor panels behind a matte black louvre, so it reads in direct sun.
- **Colour:** each lap type gets its own colour, chosen in the app.
- **Power:** runs from a 12 V LiFePO4 battery through a 5 V step-down converter.

```
 Regularity app ──BLE (≤20-byte writes)──▶ ESP32-S3 (MatrixPortal S3) ──HUB75──▶ 9 × P10 panels
 (phone on pit wall)                         firmware/ in this folder           ▲
                                                                               5 V / 40 A
                                                         12 V LiFePO4 ──fuse──▶ DC-DC converter
```

Contents: [Parts list](#parts-list) · [Buying the panels](#buying-the-panels) · [Building it](#building-it) · [Power](#power) · [Firmware](#firmware) · [Using different hardware](#using-different-hardware) · [App](#app) · [Protocol](#protocol) · [Troubleshooting](#troubleshooting)

---

## Parts list

Prices are rough AUD estimates from late 2026 (AliExpress, Core Electronics, Jaycar and similar). Check current prices before ordering.

| # | Part | Qty | Spec / notes | Approx. A$ |
|---|------|-----|--------------|-----------|
| 1 | **Outdoor P10 RGB LED module** | 9 (+1 spare) | 320 × 160 mm, 32 × 16 px, **1/4 scan**, HUB75, 5 V, SMD, front IP65, ≥ 5,000 nit. Most come with a ribbon cable and a power lead. | 25–45 each |
| 2 | **Adafruit MatrixPortal S3** (product 5778) | 1 | ESP32-S3 controller with Bluetooth. Plugs straight into the first panel's HUB75 input socket. | 40–55 |
| 3 | DC-DC step-down converter, **12 V → 5 V, 40 A (200 W)** | 1 | Potted/waterproof type. 30 A is the bare minimum. | 40–70 |
| 4 | **12 V LiFePO4 battery, 30 Ah** | 1 | Built-in BMS, ≥ 50 A continuous. About 6–10 h of typical racing use (see [Power](#power)). A 20 Ah battery gives about 4–6 h. | 250–400 |
| 5 | Inline blade fuse holder + **30 A fuse** | 1 | On the battery positive lead. | 10 |
| 6 | 5 V distribution | 1 set | 2 × bus bars (or Wago 221 blocks). Use **1.5 mm²** wire to each panel and **4 mm²** from the converter to the bus. One 15 A fuse per panel row is recommended. | 30 |
| 7 | Battery-to-sign cable | 1 | 2-core 2.5 mm², 2–3 m, with an Anderson SB50 or XT60 plug, so the battery sits at your feet. | 30 |
| 8 | USB-C pigtail (5 V screw terminal → USB-C) | 1 | Powers the MatrixPortal from the 5 V bus. | 10 |
| 9 | HUB75 ribbon cables | 8 | Usually included with the panels. Buy 30–50 cm ones if you'll use the zig-zag layout. | incl. |
| 10 | Frame | 1 | 20 × 20 mm aluminium angle or extrusion, 1000 × 520 mm outside size. Panels screw on through their magnet/screw holes. | 50–100 |
| 11 | Front louvre / hood | 1 | Matte black. Use a louvre grille, or a 50 mm hood over the top edge plus matte black paint on the frame. Optional smoked polycarbonate face (2–3 mm). | 30–80 |
| 12 | Mounting | 1 | A pit-wall clamp or tripod bracket. The finished sign weighs about 6–8 kg, so it isn't really hand-held. | 30–60 |
| | **Total** | | | **≈ 700–1,100** |

**Tools:** PlatformIO (VS Code) to flash the firmware, a multimeter, and a clamp meter (useful for measuring real current draw).

## Buying the panels

Panel listings are vague, so check these points before buying all nine. **Buy one panel first, flash the firmware and confirm it works**, then order the rest.

1. **Scan rate.** Outdoor P10 RGB panels are usually **1/4 scan**. That's the default here (`PANEL_P10_OUTDOOR_32x16_4S`). 1/8-scan and 1/16-scan panels also work with a one-line change; see [Using different hardware](#using-different-hardware). Avoid 1/2-scan and static (1/1) panels, which this firmware doesn't support.
2. **Interface.** It must be **HUB75 or HUB75E** (a 16-pin IDC socket). Panels marked HUB12, HUB08 or "single colour" won't work.
3. **Driver chip.** Read the markings on the chips on the back. Plain shift registers (ICN2037, MBI5024, SM16208…) work as they are. **FM6126A** and **ICN2038S** panels need `PANEL_DRIVER` changed in `config.h`, otherwise they stay black.
4. **Full colour (RGB)**, not single or dual colour.
5. **Outdoor / high brightness**, ideally ≥ 5,000 cd/m², with a waterproof front.

## Building it

### Layout and data chain

Seen from the **front**, with the default `GRID_CHAIN CHAIN_TOP_RIGHT_DOWN` (serpentine):

```
 data in ─▶ ┌──3──┬──2──┬──1──┐ ◀─ MatrixPortal plugs into panel 1's input
            └─────┴─────┴──┬──┘
            ┌──4──┬──5──┬──6──┐   row 2 runs the other way: these panels are
            └──┬──┴─────┴─────┘   mounted upside down (rotated 180°)
            ┌──9──┬──8──┬──7──┐
            └─────┴─────┴─────┘
```

- Each panel's HUB75 **output** connects by ribbon to the next panel's **input**. The arrows printed on the back of each panel show the data direction.
- The serpentine layout keeps ribbons short, but every second row is mounted upside down.
- To keep **every panel upright**, use a `_ZZ` (zig-zag) chain type and longer ribbons back to the start of each row.
- If the test pattern comes out scrambled or mirrored, change `GRID_CHAIN`. The HUB75 library's [VirtualMatrixPanel docs](https://github.com/mrcodetastic/ESP32-HUB75-MatrixPanel-DMA/tree/master/examples/VirtualMatrixPanel) have diagrams of every option.

### Power wiring

```
 12 V LiFePO4 ─[30 A fuse]─ SB50 ── 2.5 mm² ──▶ DC-DC 12→5 V 40 A ──4 mm²──▶ +5 V bus ─┬─[15 A]─ row 1: 3 × panel leads (1.5 mm²)
                                                                         GND bus ─┤          ├─[15 A]─ row 2
                                                                                  │          ├─[15 A]─ row 3
                                                                                  │          └─ USB-C pigtail ─▶ MatrixPortal S3
```

- **Give every panel its own power lead from the bus.** Never daisy-chain power through panels.
- **All grounds must be common**: the panels, the converter and the MatrixPortal.
- Don't power the panels through the MatrixPortal's terminals. They're meant for one small panel.
- Mount the converter on the frame with some airflow; it gets warm at 30 A or more.

## Power

Outdoor P10 RGB spec sheets quote roughly **300–400 W for nine panels at full white**. The sign never needs full white. Rough real-world loads:

| What's showing | Approx. draw (9 panels, brightness 75%) |
|---|---|
| Delta digits in one colour (green / red / blue) | 20–40 W |
| Delta digits, two-channel colour (amber / yellow) | 30–60 W |
| "Solid board on broken laps" (full red fill) | 100–150 W |
| Test pattern (full fills in each lap colour) | 100–200 W, for a few seconds |

These are estimates. **Measure your own sign** with a clamp meter on the 5 V bus. Then set `MAX_BRIGHTNESS` in `config.h` so the worst case stays under about 80% of your converter's rating.

### Power bank option

A USB-C PD power bank works for **digits only, with a brightness cap**. Two things to know:

- **"30 W" isn't 30 W at 5 V.** A 30 W bank only gives 30 W at 9–15 V. At 5 V nearly every bank stops at **3 A, which is 15 W**. Panels plugged straight into a 5 V USB port get 15 W at most, which is only enough for single-colour digits at roughly 25–50% brightness.
- **Better:** a **100 W PD bank** (20 V × 5 A) and a **USB-C PD trigger cable set to 20 V**, feeding a **20 V→5 V, 20 A buck converter**. That gives about 90 W at 5 V, enough for digits at 75–100% brightness.

For either setup:
- Set `MAX_BRIGHTNESS` to about 160.
- Leave **Solid board on broken laps** off.
- Run the test pattern only briefly.

A 25,000 mAh (about 90 Wh) bank lasts about **2–3 hours**. For a whole race day, use the LiFePO4 battery.

### Battery runtime

**Runtime:** a 30 Ah 12 V LiFePO4 holds about 380 Wh. At a typical average of 30–50 W, after about 90% converter efficiency, that's **6–10 hours**. If you use the solid-red board a lot, expect less.

---

## Firmware

The firmware is in `firmware/`, a PlatformIO project. It has been compile-tested against Arduino-ESP32 2.0.17, ESP32-HUB75-MatrixPanel-DMA 3.0.14, NimBLE-Arduino 2.3.0 and Adafruit GFX 1.12.1, for the MatrixPortal S3, a generic ESP32-S3 and a classic ESP32. **It hasn't been tested on real panels yet.** Expect to adjust `config.h` on first power-up.

1. Install [VS Code](https://code.visualstudio.com/) and the **PlatformIO** extension.
2. Open the `hardware/led-sign/firmware` folder.
3. Edit `src/config.h` if your hardware differs from the defaults.
4. Plug in the MatrixPortal S3 by USB-C and run **PlatformIO: Upload** for the `matrixportal_s3` env. From a terminal: `pio run -e matrixportal_s3 -t upload`.
5. Power the sign. It shows its name (`RegSign-XXXX`) and `PAIR IN APP`, and a blue dot blinks in the corner until a phone connects.
6. In the app, go to **Settings → LED Sign → Find sign**, pair, then tap **Test sign**. You should see 5 solid colour fills, then `88.8` in a white frame. If the image is scrambled, see [Troubleshooting](#troubleshooting).

The sign saves the last brightness and colours in flash, so it boots looking the same. The app also re-sends everything each time it connects.

### What the sign shows

| Mode (app setting) | Display |
|---|---|
| **Delta** | The last lap delta at full height, e.g. `+0.4`, in its lap-type colour. |
| **Delta + lap** | The delta in the top 38 px, with driver initials and the lap number (`DA … L12`) in a strip underneath. |
| **Countdown** | The delta for 8 s after each lap, then a live countdown to the target time: white while counting down, the bonus colour inside the 1-second bonus window, then the base colour counting up. |

- **Delta format:** always shows a + or − sign and is **truncated, not rounded**. So a 0.96 s bonus lap shows `+0.9`, never a misleading `+1.0`.
- **Safety car laps:** flash at 2 Hz (can be turned off).
- **Broken laps:** can optionally fill the whole board with the broken colour and show the digits in black.

## Using different hardware

Every hardware choice is in `firmware/src/config.h`. The renderer sizes the digits to whatever resolution you end up with, and the app works with any sign that speaks the [protocol](#protocol).

### Controller boards

| Board | Works? | How |
|---|---|---|
| Adafruit MatrixPortal S3 | ✅ Recommended | Default (`BOARD_MATRIXPORTAL_S3`) |
| Any ESP32-S3 dev board + HUB75 wiring/shield | ✅ | `env:esp32s3_generic` (library default S3 pins), or `BOARD_CUSTOM` with your pins |
| Classic ESP32 (ESP32 Trinity, DevKit + HUB75 shield, Huidu-style ESP32 "HUB75 controller" boards) | ✅ | `env:esp32_generic` (library default pins: R1 25, G1 26, B1 27, R2 14, G2 12, B2 13, A 23, B 19, C 5, D 17, LAT 4, OE 15, CLK 16), or `BOARD_CUSTOM` |
| Adafruit MatrixPortal M4, ESP32-S2 boards | ❌ | No Bluetooth |
| ESP32-C3 / C6 / H2 | ❌ | Not supported by the HUB75 library |
| Raspberry Pi, Arduino Uno/Mega, Teensy | ❌ | Not supported by this firmware |

### Panels

| Panel | `SIGN_PANEL` | Notes |
|---|---|---|
| Outdoor P10 RGB 32×16, 1/4 scan | `PANEL_P10_OUTDOOR_32x16_4S` | Default |
| P10 RGB 32×16, 1/8 scan | `PANEL_P10_32x16_8S` | Common "semi-outdoor" P10 |
| 64×32, 1/16 scan (P3–P6 indoor) | `PANEL_64x32_16S` | Standard panels. Fine indoors, too dim in direct sun. |
| Outdoor 64×32, 1/8 scan (P5/P6/P8) | `PANEL_OUTDOOR_64x32_8S` | 2 × 3 of P5 64×32 is about 640 × 480 mm |
| 64×64, 1/32 scan | `PANEL_64x64_32S` | Needs the E pin (the MatrixPortal has it) |
| Anything else | `PANEL_CUSTOM` | Set `PANEL_RES_X/Y` and a `PANEL_SCAN` mapping from the library |

- **Grid size:** change `GRID_COLS` and `GRID_ROWS`.
- **Odd panels:** some outdoor panels use unusual internal wiring that no preset covers. The library's *Pixel_Mapping_Test* example helps you work out a custom mapping.
- **WS2812 / NeoPixel LED matrices** aren't HUB75. They'd need a different display driver in `main.cpp` (e.g. Adafruit_NeoMatrix), but `renderer.cpp` draws to any Adafruit_GFX surface, so nothing else changes.

### Ready-made / commercial LED signs

Signs with their own controller (Huidu, Novastar, Linsn, "LED badge"/"CoolLED"-style Bluetooth signs) use closed protocols and **won't work directly**. Often you can still use their panels: remove the controller and plug a MatrixPortal S3 into the first panel's HUB75 input.

---

## App

The app side is in `apps/mobile`:

| File | Role |
|---|---|
| `services/LedSignService.ts` | BLE scanning and pairing, auto-reconnect with backoff, a write queue, and re-sending the current state on every connect |
| `components/LedSignBridge.tsx` | Watches the active driver's latest lap (new laps, edits, deletes, changeover/safety toggles, driver switches) and sends it to the sign |
| `components/LedSignSettings.tsx` | **Settings → LED Sign**: pair/forget, test, mode, decimals, brightness, colour for each lap type with a live preview, solid-board, flash and flip toggles |
| `context/AppContext.tsx` → `reportTimerState` | Relays the stopwatch so Countdown mode can count on the sign itself |
| `packages/core/src/ledSign.ts` | The protocol encoder (unit-tested), shared with the docs below |

Bluetooth uses `react-native-ble-plx`. Its Expo config plugin in `app.json` adds the iOS Bluetooth permission text, the `bluetooth-central` background mode, and the Android `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` permissions.

- **It's a native module, so it needs a new EAS build** (`pnpm build:ios` / `pnpm build:android`). An `eas update` alone can't add it.
- **Give the new binaries a new `runtimeVersion`**, so OTA updates for them stay separate from older builds.
- **Older binaries are safe:** if they receive this JavaScript anyway, the LED Sign section just shows "Not available in this build".
- **iOS App Review:** mention the background mode in the review notes, e.g. "Bluetooth is used to send lap times to the team's LED pit-board sign while the timer runs."

The phone talks to the sign at short range (about 10–30 m line of sight), so keep the timing phone on the pit wall near the sign. The 50 m figure is the **driver's** reading distance.

## Protocol

GATT service `a9fa0001-8e2e-4c12-9682-7dd27dea5a5b`:

| Characteristic | UUID | Properties |
|---|---|---|
| Command | `a9fa0002-8e2e-4c12-9682-7dd27dea5a5b` | write / write-without-response. One packet per write, ≤ 20 bytes. |
| Info | `a9fa0003-8e2e-4c12-9682-7dd27dea5a5b` | read: `proto=1;fw=1.0.0;w=96;h=48` |

Byte 0 is the opcode. Integers are little-endian. Lap type codes: 0 bonus, 1 base, 2 broken, 3 changeover, 4 safety.

| Op | Name | Layout | Bytes |
|---|---|---|---|
| `0x01` | Lap | op, lapType u8, lapNumber u16, deltaMs i32, targetMs u32, initials 3 × ASCII | 15 |
| `0x02` | Timer | op, running u8, elapsedMs u32 (at send time), targetMs u32 | 10 |
| `0x03` | Config | op, brightness u8 (1–255), mode u8 (0 delta, 1 delta+lap, 2 countdown), decimals u8 (1/2), flags u8 (bit0 fill on broken, bit1 flip 180°, bit2 flash safety), RGB × 5 in lap-type order | 20 |
| `0x04` | Clear | op (blank the delta) | 1 |
| `0x05` | Test | op (5 s test pattern) | 1 |

The timer sends **elapsed** time rather than a timestamp, so the sign needs no clock sync; it counts on from when the packet arrives. If you change the protocol, change `packages/core/src/ledSign.ts`, its tests, and `firmware/src/protocol.h` together.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Panels stay black, but the serial log says ready | Set `PANEL_DRIVER` to match the chips (FM6126A / ICN2038S). Check the 5 V supply and that the ribbon is in the panel's **input**. |
| Image looks like scrambled stripes or blocks inside each panel | Wrong `SIGN_PANEL` / scan type. Try the 1/8 or 1/16 preset. |
| Each panel looks right, but they're in the wrong order or upside down | Wrong `GRID_CHAIN`. Try the other `CHAIN_*` options, or `_ZZ` if every panel is upright. |
| Pixels smeared or shifted by one column | Set `PANEL_CLK_PHASE false`. |
| Ghosting or flicker on generic ESP32 boards | Some panels need 5 V logic. Use a HUB75 shield with a 74HCT245 level shifter, or the MatrixPortal S3. |
| Sign resets or flickers on bright frames | The supply is browning out. Lower `MAX_BRIGHTNESS`, use a bigger converter or thicker wire, and check every panel has its own feed. |
| App can't find the sign | Bluetooth on? Location/Bluetooth permission granted (Android)? Is the sign showing `PAIR IN APP`? Only one phone can be mid-pairing at a time. |
| Delta doesn't update | Check **Settings → LED Sign** shows *Connected*. The sign shows the **active driver's** latest lap, so check the right driver is selected on the Timer. |

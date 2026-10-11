# Regularity LED Sign

A large Bluetooth pit-board sign. The Regularity app sends it each lap's delta or lap time, and drivers can read it from about 50 m at speed.

- **Size:** 960 × 480 mm, from a 3 × 3 grid of outdoor P10 RGB panels (96 × 48 pixels).
- **Digits:** about 460 mm tall with one decimal (`+0.4`) and about 420 mm with two (`+0.42`). That's well above the roughly 250 mm needed at 50 m.
- **Readability:** about 5,000–7,000 nit outdoor panels behind a matte black louvre, so it reads in direct sun.
- **Display:** choose a preset (delta, lap time, both, countdown…) or your own layout and colours in the app.
- **Power:** a 30 W USB-C power bank lasts a 6-hour day in Eco mode. For all-day full brightness, use a 12 V LiFePO4 battery.

```
 Regularity app ──BLE (≤20-byte writes)──▶ ESP32-S3 (MatrixPortal S3) ──HUB75──▶ 9 × P10 panels
 (phone on pit wall)                         firmware/ in this folder           ▲
                                                                               5 V / 40 A
                                         30 W PD power bank or 12 V LiFePO4 ──▶ DC-DC converter
```

![Example screens, rendered by the firmware's own drawing code](docs/screens.png)

*These are rendered by the firmware's real drawing code (see [Previewing layouts](#previewing-layouts)). Under each screen: estimated draw at 75% brightness, and the brightness the sign drops to on a 30 W power bank.*

## How it works

1. **The sign** is 9 LED panels on a frame, driven by an ESP32 board running the firmware in `firmware/`. It advertises itself over Bluetooth LE as `RegSign-XXXX`.
2. **Pair once** in the app (**Settings → LED Sign → Find sign**). The app remembers the sign and reconnects by itself, including after the sign is power-cycled or a power bank is swapped.
3. **Time as normal.** Each time a lap is recorded for the active driver, the app sends one small Bluetooth message (lap type, delta, lap time, lap number, driver initials). The sign shows it within about a second. Lap edits, deletes, changeovers and driver switches re-send it.
4. **The stopwatch is mirrored.** The app tells the sign when the lap started and what the target is. The sign then runs live fields (countdown, lap clock) itself, so nothing is sent every second.
5. **The sign does the drawing.** The app sends data and settings, not pixels. The firmware picks the largest digits that fit, colours them, and dims itself to stay within the power budget.
6. **Settings persist on the sign**, so after a reboot it looks the same before the app reconnects. The app also re-sends everything on every connect.

Contents: [How it works](#how-it-works) · [Parts list](#parts-list) · [Buying the panels](#buying-the-panels) · [Building it](#building-it) · [Power](#power) · [Firmware](#firmware) · [What the sign shows](#what-the-sign-shows) · [Using different hardware](#using-different-hardware) · [App](#app) · [Protocol](#protocol) · [Troubleshooting](#troubleshooting)

---

## Parts list

Prices are rough AUD estimates from late 2026 (AliExpress, Core Electronics, Jaycar and similar). Check current prices before ordering.

| # | Part | Qty | Spec / notes | Approx. A$ |
|---|------|-----|--------------|-----------|
| 1 | **Outdoor P10 RGB LED module** | 9 (+1 spare) | 320 × 160 mm, 32 × 16 px, **1/4 scan**, HUB75, 5 V, SMD, front IP65, ≥ 5,000 nit. Most come with a ribbon cable and a power lead. | 25–45 each |
| 2 | **Adafruit MatrixPortal S3** (product 5778) | 1 | ESP32-S3 controller with Bluetooth. Plugs straight into the first panel's HUB75 input socket. | 40–55 |
| 3 | DC-DC step-down converter, **12 V → 5 V, 40 A (200 W)** | 1 | Potted/waterproof type. 30 A is the bare minimum. | 40–70 |
| 4 | **12 V LiFePO4 battery, 30 Ah** | 1 | Built-in BMS, ≥ 50 A continuous. About 8–12 h at full brightness (see [Power](#power)); a 20 Ah battery gives about 6–9 h. Optional if you use a power bank. | 250–400 |
| 5 | Inline blade fuse holder + **30 A fuse** | 1 | On the battery positive lead. | 10 |
| 6 | 5 V distribution | 1 set | 2 × bus bars (or Wago 221 blocks). Use **1.5 mm²** wire to each panel and **4 mm²** from the converter to the bus. One 15 A fuse per panel row is recommended. | 30 |
| 7 | Battery-to-sign cable | 1 | 2-core 2.5 mm², 2–3 m, with an Anderson SB50 or XT60 plug, so the battery sits at your feet. | 30 |
| 8 | USB-C pigtail (5 V screw terminal → USB-C) | 1 | Powers the MatrixPortal from the 5 V bus. | 10 |
| 9 | HUB75 ribbon cables | 8 | Usually included with the panels. Buy 30–50 cm ones if you'll use the zig-zag layout. | incl. |
| 10 | Frame | 1 | 20 × 20 mm aluminium angle or extrusion, 1000 × 520 mm outside size. Panels screw on through their magnet/screw holes. | 50–100 |
| 11 | Front louvre / hood | 1 | Matte black. Use a louvre grille, or a 50 mm hood over the top edge plus matte black paint on the frame. Optional smoked polycarbonate face (2–3 mm). | 30–80 |
| 12 | Mounting | 1 | A pit-wall clamp or tripod bracket. The finished sign weighs about 6–8 kg, so it isn't really hand-held. | 30–60 |
| | **Total** | | | **≈ 700–1,100** |

**Power bank kit (instead of rows 3–8):** about A$40–60 on top of the bank. See [Running from a power bank](#running-from-a-power-bank).

| Part | Qty | Spec / notes | Approx. A$ |
|------|-----|--------------|-----------|
| USB-C PD trigger cable/board, set to **9 V** | 1 | Requests 9 V from the bank, with bare-wire or screw-terminal output. 9 V at 3 A is supported by almost every 30 W bank. | 10–15 |
| DC-DC step-down converter, **6–24 V in → 5 V, 8–10 A out** | 1 | Needs at least 5 A at 5 V. | 15–30 |
| 5 V distribution | 1 set | As row 6, but a 7.5 A fuse per row is enough. | 20 |
| USB-C pigtail for the MatrixPortal | 1 | As row 8. | 10 |

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

Outdoor P10 RGB spec sheets quote roughly **300–400 W for nine panels at full white**. The sign never shows full white, and it only lights the pixels in the digits. The firmware estimates each frame's draw and **dims itself to stay under the budget** set in the app (**Settings → LED Sign → Power source**). The budget includes about 3 W for the panels' and controller's idle draw.

Estimated draw for each preset, from the preview tool, at 75% brightness:

| What's showing | Draw | On a 30 W bank (22 W budget) |
|---|---|---|
| Delta, e.g. `+0.4` in green or red | ≈ 33 W | dims to ≈ 50% |
| Lap time `48.7` | ≈ 39 W | ≈ 45% |
| Delta + driver strip | ≈ 22 W | full 75% |
| Countdown in white (mid-lap) | ≈ 72 W | ≈ 22% (white lights all 3 colours) |
| Solid red board | ≈ 60 W | ≈ 27% |
| Eco, dark between passes | ≈ 3 W | — |

These estimates come from typical panel figures. **Measure your own sign** on the 5 V bus with a clamp meter, and adjust `WATTS_PER_LED_CHANNEL` and `IDLE_WATTS_PER_PANEL` in `config.h` until the serial log's `est. … W` line matches your meter. Half brightness on a 5,000+ nit outdoor panel is still roughly 2,500 nit, more than a phone screen in sunlight.

### Running from a power bank

**Your Cygnett 30 W 20,000 mAh works.** Two things matter:

1. **Get the power at 9 V, not 5 V.** "30 W" is only available at 9 V (3 A) or higher. At 5 V, banks stop at 3 A, which is **15 W**. Use a **USB-C PD trigger set to 9 V** feeding a **9 V → 5 V step-down converter**. In the app, set **Power source → 30 W PD** (22 W budget, which leaves room for converter losses).
   - *Simplest option:* a plain USB-C-to-5 V cable straight into the 5 V bus, with **Power source → USB 5 V** (13 W budget). It works, but the digits are about half as bright.
2. **Turn on Eco** (**Settings → LED Sign → Eco**). While the stopwatch runs, the sign stays dark until 15 s before the car is due, then stays lit for 10 s after the lap is recorded. On a 1:45 lap it's lit about a quarter of the time. The driver only sees the board as they pass, so they never see it dark.

**Will it last 6 hours?** The bank holds about 74 Wh. After the bank's and converter's losses, about **57 Wh** reaches the sign.

| Setup | Average draw | Runtime |
|---|---|---|
| 30 W PD (22 W budget), **Eco 15 s**, 1:45 laps | ≈ 8 W | **≈ 7 h** ✅ |
| 30 W PD, Eco 15 s, 1:00 laps | ≈ 11 W | ≈ 5 h. Use Eco 10 s to get ≈ 6 h |
| 30 W PD, Eco **off** | ≈ 22 W | ≈ 2.5 h ❌ |
| USB 5 V (13 W budget), Eco 15 s | ≈ 6 W | ≈ 9–10 h, dimmer |

The biggest unknown is the panels' idle draw (about 3 W assumed here). If yours measures higher, add margin:
- Use **Eco 10 s**.
- Use green, red or blue digits rather than amber or white (they light one LED colour instead of two or three).
- Use one decimal.
- Leave the solid board off.
- Or carry a second bank. The sign reboots in about 2 s on a swap and the app reconnects.

### Running from a battery (all day, full brightness)

A 30 Ah 12 V LiFePO4 holds about 380 Wh. At a typical 25–40 W, after about 90% converter efficiency, that's **8–12 hours** with no power limit (**Power source → Battery**).

---

## Firmware

**This is ESP32 firmware.** "Arduino" here only means the *Arduino-ESP32 framework*, Espressif's library layer on top of ESP-IDF. No Arduino board or Arduino IDE is involved. You build and flash it with PlatformIO, the same way as any ESP32 project. The libraries this firmware uses (HUB75 DMA, NimBLE) also support plain ESP-IDF if you'd rather port it to `idf.py`.

The firmware is in `firmware/`, a PlatformIO project. It has been compile-tested against Arduino-ESP32 2.0.17, ESP32-HUB75-MatrixPanel-DMA 3.0.14, NimBLE-Arduino 2.3.0 and Adafruit GFX 1.12.1, for the MatrixPortal S3, a generic ESP32-S3 and a classic ESP32. **It hasn't been tested on real panels yet.** Expect to adjust `config.h` on first power-up.

1. Install [VS Code](https://code.visualstudio.com/) and the **PlatformIO** extension.
2. Open the `hardware/led-sign/firmware` folder.
3. Edit `src/config.h` if your hardware differs from the defaults.
4. Plug the board in by USB and upload with the env for your board:
   - `pio run -e matrixportal_s3 -t upload` for the Adafruit MatrixPortal S3
   - `pio run -e esp32s3_generic -t upload` for any ESP32-S3 DevKit
   - `pio run -e esp32_generic -t upload` for a classic ESP32 DevKit / WROOM-32
5. Power the sign. It shows its name (`RegSign-XXXX`) and `PAIR IN APP`, and a blue dot blinks in the corner until a phone connects.
6. In the app, go to **Settings → LED Sign → Find sign**, pair, then tap **Test sign**. You should see 5 solid colour fills, then `88.8` in a white frame. If the image is scrambled, see [Troubleshooting](#troubleshooting).

The sign saves its settings (colours, layout, power) in flash, so it boots looking the same. The app also re-sends everything each time it connects.

### Previewing layouts

`firmware/preview/build.sh` compiles the firmware's real `renderer.cpp` and `power.cpp` for your computer. It writes PNGs of each example screen, plus the contact sheet at the top of this page, to `firmware/preview/out/`. To preview your own layout, add a `Scene` to `preview.cpp`. It needs `g++`, `git` and Python with Pillow.

## What the sign shows

Choose in **Settings → LED Sign → Display**. The app's preview matches the sign.

| Preset | Main line | Second line |
|---|---|---|
| **Delta** | `+0.4` full height | — |
| **Lap time** | `48.7` full height (1:48.7, minutes implied) | — |
| **Delta + time** | `+0.4` | `48.7` (half height) |
| **Time + delta** | `48.7` | `+0.4` (half height) |
| **Delta + driver** | `+0.4` | `DA L12` strip |
| **Countdown** | Live countdown to the target, with the delta for 8 s after each lap | — |
| **Custom** | Any field, any colour | Any field, at small strip, third or half height |

**Fields:**

| Field | Example | Notes |
|---|---|---|
| Delta | `+0.4` | |
| Lap time | `48.7` | 1:48.7 with the minute implied; the seconds always have 2 digits, so 1:01.3 shows `01.3` |
| Lap time (full) | `1:48.7` | |
| Countdown | `45` → `9.4` → `+0.3` | Live |
| Lap clock | `40.0` | Live, minutes implied |
| Lap no. | `L12` | |
| Driver | `DA` | |
| Driver + lap | `DA L12` | |
| Target | `48.3` | |

**Colours:** each line is either **Lap type** or a **fixed colour**.
- *Lap type* uses the colour of the last lap (bonus, base, broken, changeover, safety; each set in the app).
- For live fields, *Lap type* means the colour the lap would get if it ended now: white before the target, bonus colour in the 1-second bonus window, then base colour.

**For live fields** (countdown, lap clock), *After each lap, show* swaps in the delta or lap time for 5, 8 or 15 s after each lap.

**Formatting:**
- Deltas always show a sign.
- Deltas and times are **truncated, not rounded**, so a 0.96 s bonus lap shows `+0.9`, never a misleading `+1.0`.
- One or two decimals (set in the app).
- Digits are a bold 7-segment style sized to fill the space: about 460 mm tall full height with one decimal, about 220 mm on a half line. Letters (driver initials) use a scaled pixel font.

**Extras:**
- Flash safety car laps.
- Solid board on broken laps (heavy on power).
- Flip 180°.

## Using different hardware

Every hardware choice is in `firmware/src/config.h`. The renderer sizes the digits to whatever resolution you end up with, and the app works with any sign that speaks the [protocol](#protocol).

### Controller boards

If you already use ESP32 dev boards, you don't need the MatrixPortal. Wire the board to the first panel's HUB75 input with jumper wires (or a cheap HUB75 breakout), share ground with the 5 V supply, and use the matching env.

| HUB75 pin | Classic ESP32 DevKit (`esp32_generic`) | ESP32-S3 DevKitC (`esp32s3_generic`) |
|---|---|---|
| R1 / G1 / B1 | 25 / 26 / 27 | 4 / 5 / 6 |
| R2 / G2 / B2 | 14 / 12 / 13 | 7 / 15 / 16 |
| A / B / C / D | 23 / 19 / 5 / 17 | 18 / 8 / 3 / 42 |
| E (64-px-high panels only) | — | — |
| LAT / OE / CLK | 4 / 15 / 16 | 40 / 2 / 41 |
| GND | GND (connect all three HUB75 GND pins) | GND |

Outdoor P10 1/4-scan panels only use A and B, so C, D and E can stay unconnected. For different pins, set `SIGN_BOARD BOARD_CUSTOM` and list them in `config.h`.

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
| `components/LedSignSettings.tsx` | **Settings → LED Sign**: a How it works explainer, pair/forget, test, display presets and a custom layout editor with live preview, decimals, brightness, power source and Eco, lap-type colours, solid-board, flash and flip toggles |
| `context/AppContext.tsx` → `reportTimerState` | Relays the stopwatch so live fields (countdown, lap clock) and Eco run on the sign itself |
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
| Info | `a9fa0003-8e2e-4c12-9682-7dd27dea5a5b` | read: `proto=1;fw=1.1.0;w=96;h=48` |

Byte 0 is the opcode. Integers are little-endian.
- **Lap type codes:** 0 bonus, 1 base, 2 broken, 3 changeover, 4 safety.
- **Field codes:** 0 none, 1 delta, 2 lap time, 3 lap time full, 4 countdown, 5 lap clock, 6 lap no., 7 driver, 8 driver + lap, 9 target.
- **Colour mode:** 0 = by lap type, 1 = fixed RGB.

| Op | Name | Layout | Bytes |
|---|---|---|---|
| `0x01` | Lap | op, lapType u8, lapNumber u16, deltaMs i32, targetMs u32, initials 3 × ASCII, timeMs u32 | 19 |
| `0x02` | Timer | op, running u8, elapsedMs u32 (at send time), targetMs u32 | 10 |
| `0x03` | Config | op, brightness u8 (1–255), reserved u8, decimals u8 (1/2), flags u8 (bit0 fill on broken, bit1 flip 180°, bit2 flash safety), RGB × 5 in lap-type order | 20 |
| `0x04` | Clear | op (blank the delta) | 1 |
| `0x05` | Test | op (5 s test pattern) | 1 |
| `0x06` | Layout | op, main field u8, main colour mode u8, main RGB, second field u8, second colour mode u8, second RGB, second size u8 (0 strip, 1 third, 2 half), hold field u8, hold seconds u8 | 14 |
| `0x07` | Power | op, budget W u16 (0 = no limit), eco lead seconds u8 (0 = off) | 4 |

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
| Power bank cuts out | The bank is being asked for more than it gives. Check the PD trigger really negotiated 9 V (measure it). Pick a lower **Power source**, or calibrate `WATTS_PER_LED_CHANNEL` upwards. |
| Classic ESP32 boot-loops only while the panel is connected | GPIO 12 (G2) is a boot strapping pin. Move G2 to another free pin (e.g. 32) with `BOARD_CUSTOM`. |
| App can't find the sign | Bluetooth on? Location/Bluetooth permission granted (Android)? Is the sign showing `PAIR IN APP`? Only one phone can be mid-pairing at a time. |
| Delta doesn't update | Check **Settings → LED Sign** shows *Connected*. The sign shows the **active driver's** latest lap, so check the right driver is selected on the Timer. |

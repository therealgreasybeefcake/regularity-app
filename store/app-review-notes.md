# App Review Notes — Submission dc918086 follow-up (v2.0)

Context for resubmitting after the June 6 2026 rejection (iPad Air 11" / M3).

## Guideline 2.5.4 — Background audio (RESOLVED, needs demo video)

**Why the app uses the `audio` background mode:** Regularity racing requires the
driver/timer to hit a fixed target lap time. The app plays **audible lap-reminder
beeps** — one a configurable number of seconds *before* the target time, and a
double-beep a configurable number of seconds *after* lap start — so the user gets
the cue even when their phone is in their pocket or they've switched to another app
during a stint. This is genuine audible content delivered while backgrounded.

**What we fixed:** the previous build declared the background mode but the beeps did
not actually sound in the background (the JS timer was suspended and the audio
session used the `ambient` category). We now:
- configure the session with `playback` category via
  `setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true })`, and
- keep a silent track looping while a timing session is active so the beeps fire
  reliably while the app is backgrounded.

**Reviewer demo video (record on a physical device):**
1. Open the app → Timer tab. Make sure beeps are enabled (Settings → Audio).
2. Set up a session and press **Start** (timer running).
3. Press the **Home** button to send the app to the background (show the Home Screen).
4. Wait for the "before target" / "after lap start" beep to sound **with the app
   backgrounded and the screen on the Home Screen** — audible in the recording.

Attach this recording in **App Store Connect → App Review Information → Notes** for
future submissions.

## Guideline 3.1.1 — Donations / IAP (RESOLVED)

We removed the "Buy Me a Coffee" donation links entirely (onboarding + Settings) and
all references to external donations in the app and store description. The app is
100% free with no in-app payment mechanism of any kind.

> Reminder: also update the **live App Store description** and the privacy-policy page
> to remove any "buy me a coffee" wording, to match the binary.

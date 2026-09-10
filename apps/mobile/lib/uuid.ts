// UUID helpers. `crypto.getRandomValues` is polyfilled by
// react-native-get-random-values (imported in app/_layout.tsx); native RN does
// not provide `crypto.randomUUID`, so we build v4 ourselves.

function bytesToUuid(b: Uint8Array): string {
  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/** Random v4 UUID for session / sessionDriver / public tokens. */
export function randomUuid(): string {
  const b = new Uint8Array(16);
  // eslint-disable-next-line no-undef
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return bytesToUuid(b);
}

// cyrb128 — fast 128-bit string hash (public domain) for deterministic ids.
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/**
 * Deterministic UUID from a seed. Used for a lap's clientLapId so that
 * re-streaming the same lap (after an app restart mid-session) hits the server's
 * (session_driver_id, client_lap_id) dedupe instead of creating a duplicate.
 */
export function deterministicUuid(seed: string): string {
  const [a, b, c, d] = cyrb128(seed);
  const bytes = new Uint8Array(16);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, a);
  dv.setUint32(4, b);
  dv.setUint32(8, c);
  dv.setUint32(12, d);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

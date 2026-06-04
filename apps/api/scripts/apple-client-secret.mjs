// Generate an Apple "Sign in with Apple" client secret — a short-lived ES256 JWT
// that becomes APPLE_CLIENT_SECRET. Apple caps the lifetime at 6 months, so
// re-run this and update the Railway env var when it's about to expire.
//
// Usage (from apps/api/):
//   APPLE_TEAM_ID=ABCDE12345 \
//   APPLE_KEY_ID=KEY1234567 \
//   APPLE_SERVICES_ID=com.regularity.signin \
//   APPLE_P8_PATH=./AuthKey_KEY1234567.p8 \
//   node scripts/apple-client-secret.mjs
//
//   APPLE_TEAM_ID     — your 10-char Apple Developer Team ID
//   APPLE_KEY_ID      — the Key ID of the "Sign in with Apple" key you created
//   APPLE_SERVICES_ID — the Services ID (this is also your APPLE_CLIENT_ID)
//   APPLE_P8_PATH     — path to the downloaded AuthKey_*.p8 file
import { readFileSync } from 'node:fs';
import { sign, createPrivateKey } from 'node:crypto';

const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID, APPLE_P8_PATH } = process.env;
if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_SERVICES_ID || !APPLE_P8_PATH) {
  console.error('Missing env. Set APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID, APPLE_P8_PATH.');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const sixMonths = 60 * 60 * 24 * 180; // Apple max
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const header = b64url({ alg: 'ES256', kid: APPLE_KEY_ID });
const payload = b64url({
  iss: APPLE_TEAM_ID,
  iat: now,
  exp: now + sixMonths,
  aud: 'https://appleid.apple.com',
  sub: APPLE_SERVICES_ID,
});
const signingInput = `${header}.${payload}`;

const key = createPrivateKey(readFileSync(APPLE_P8_PATH, 'utf8'));
// ES256 = ECDSA P-256 + SHA-256; JWT needs the raw R||S signature (ieee-p1363).
const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });

const jwt = `${signingInput}.${signature.toString('base64url')}`;
console.log('\nAPPLE_CLIENT_SECRET (valid until ' + new Date((now + sixMonths) * 1000).toISOString() + '):\n');
console.log(jwt + '\n');

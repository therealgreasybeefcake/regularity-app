import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/** A value is "real" if present and not one of our placeholder sentinels. */
export function isRealSecret(v: string | undefined): v is string {
  return !!v && v.trim() !== '' && !v.startsWith('__');
}

const TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:8081,regularity://')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  PORT: Number(process.env.PORT ?? 8787),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://localhost:8787',
  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  DATABASE_URL: required('DATABASE_URL'),
  TRUSTED_ORIGINS,
  // Google web OAuth client (browser flow) + native iOS/Android client IDs so
  // that id_tokens minted by the native Google SDK (whose `aud` is the iOS/Android
  // client id, not the web one) also verify. The web client id stays primary.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID,
  // Apple Services ID (web flow) + native app bundle id. Native Sign in with
  // Apple id_tokens carry the bundle id as `aud`; both must be accepted.
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  APPLE_CLIENT_SECRET: process.env.APPLE_CLIENT_SECRET,
  APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID ?? 'com.regularity.racetimer',
};

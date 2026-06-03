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
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  APPLE_CLIENT_SECRET: process.env.APPLE_CLIENT_SECRET,
};

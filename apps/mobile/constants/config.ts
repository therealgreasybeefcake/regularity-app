// Runtime config for the app. EXPO_PUBLIC_* vars are inlined by Expo at build
// time; override them in apps/mobile/.env (e.g. your machine's LAN IP when
// testing on a physical device).

const stripTrailingSlash = (s: string) => s.replace(/\/$/, '');

/** Base URL of the Hono API. Defaults to localhost for simulators/web. */
export const API_URL = stripTrailingSlash(
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
);

/** Base URL of the web app (used for shareable live-view links). */
export const WEB_URL = stripTrailingSlash(
  process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:8081',
);

/** Deep-link scheme (matches app.json "scheme"); used for the OAuth redirect. */
export const AUTH_SCHEME = 'regularity';

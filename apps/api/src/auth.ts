import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';
import { db } from './db';
import { schema } from '@regularity/db';
import { env, isRealSecret } from './env';

// Only register a social provider when real credentials are present, so the
// server boots cleanly with placeholder OAuth creds (email/password still works).
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (isRealSecret(env.GOOGLE_CLIENT_ID) && isRealSecret(env.GOOGLE_CLIENT_SECRET)) {
  socialProviders.google = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}
if (isRealSecret(env.APPLE_CLIENT_ID) && isRealSecret(env.APPLE_CLIENT_SECRET)) {
  socialProviders.apple = {
    clientId: env.APPLE_CLIENT_ID,
    clientSecret: env.APPLE_CLIENT_SECRET,
  };
}

// In production the web app and API live on different origins, so session
// cookies must be SameSite=None; Secure to be sent cross-site. Locally
// (http://localhost) that would prevent cookies entirely, so keep the default.
const isProd = process.env.NODE_ENV === 'production';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true },
  socialProviders,
  trustedOrigins: env.TRUSTED_ORIGINS,
  ...(isProd
    ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } }
    : {}),
  // Enables the native deep-link (regularity://) OAuth flow used by the Expo app.
  plugins: [expo()],
});

export type Auth = typeof auth;

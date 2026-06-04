import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';
import { db } from './db';
import { schema } from '@regularity/db';
import { env, isRealSecret } from './env';

// Only register a social provider when real credentials are present, so the
// server boots cleanly with placeholder OAuth creds (email/password still works).
type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']>;
const socialProviders: SocialProviders = {};

if (isRealSecret(env.GOOGLE_CLIENT_ID) && isRealSecret(env.GOOGLE_CLIENT_SECRET)) {
  // Accept the web client id (browser flow) plus any native iOS/Android client
  // ids — a native Google id_token's `aud` is the platform client id, so all
  // valid client ids must be listed. The web client id is kept first (BetterAuth
  // uses clientId[0] as the primary for the redirect/secret flow).
  const googleClientIds = [
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_IOS_CLIENT_ID,
    env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(isRealSecret);
  socialProviders.google = {
    clientId: googleClientIds.length > 1 ? googleClientIds : env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

if (isRealSecret(env.APPLE_CLIENT_ID) && isRealSecret(env.APPLE_CLIENT_SECRET)) {
  // `audience` (checked first by BetterAuth's verifier) lists BOTH the web
  // Services ID and the native app bundle id, so the browser flow (aud = Services
  // ID) and native Sign in with Apple (aud = bundle id) both verify. clientId
  // stays the Services ID for the web redirect/secret flow.
  socialProviders.apple = {
    clientId: env.APPLE_CLIENT_ID,
    clientSecret: env.APPLE_CLIENT_SECRET,
    appBundleIdentifier: env.APPLE_BUNDLE_ID,
    audience: [env.APPLE_CLIENT_ID, env.APPLE_BUNDLE_ID],
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

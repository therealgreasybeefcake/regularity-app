import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_SCHEME } from '../constants/config';

/**
 * BetterAuth client. The expo plugin stores the session token in SecureStore
 * and drives the native OAuth flow (opens a web browser, returns via the
 * regularity:// deep link). On web it falls back to cookies.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: AUTH_SCHEME,
      storagePrefix: AUTH_SCHEME,
      storage: SecureStore,
    }),
  ],
});

// Native (id-token) social sign-in for the mobile apps, replacing the browser
// redirect flow on device:
//   - Apple: expo-apple-authentication (iOS only) -> identityToken
//   - Google: @react-native-google-signin/google-signin (iOS + Android) -> idToken
// Each id_token is handed to BetterAuth's id-token sign-in
// (`authClient.signIn.social({ provider, idToken: { token, nonce? } })`), which
// verifies it server-side and starts a session.
//
// The native modules are loaded with dynamic `import()` so the web bundle never
// evaluates them; web (and Android Apple) fall back to the browser flow via the
// `fallback` flag returned here.
import { Platform } from 'react-native';
import { authClient } from './auth-client';
import { randomUuid } from './uuid';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../constants/config';

export interface NativeAuthResult {
  success: boolean;
  error?: string;
  /** User dismissed the native sheet — caller should stay silent, not error. */
  cancelled?: boolean;
  /** Platform/config can't do native here — caller should use the browser flow. */
  fallback?: boolean;
}


/** Native Sign in with Apple (iOS 13+). Falls back to the browser flow elsewhere. */
export async function signInWithAppleNative(): Promise<NativeAuthResult> {
  if (Platform.OS !== 'ios') return { success: false, fallback: true };

  const Apple = await import('expo-apple-authentication');
  if (!(await Apple.isAvailableAsync())) return { success: false, fallback: true };

  // Raw, un-hashed nonce: expo-apple-authentication forwards it as-is, so the
  // id_token's `nonce` claim equals this value and BetterAuth's verifier matches
  // it directly (it also accepts the SHA-256 form, so this is robust either way).
  const nonce = randomUuid();

  let credential: Awaited<ReturnType<typeof Apple.signInAsync>>;
  try {
    credential = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return { success: false, cancelled: true };
    return { success: false, error: e?.message ?? 'Apple sign-in failed' };
  }

  const token = credential.identityToken;
  if (!token) return { success: false, error: 'Apple did not return an identity token' };

  // Apple returns the name only on the FIRST authorization for this app, so
  // forward it to create the account with a display name.
  const fn = credential.fullName;
  const user =
    fn?.givenName || fn?.familyName
      ? { name: { firstName: fn?.givenName ?? undefined, lastName: fn?.familyName ?? undefined } }
      : undefined;

  const res = await authClient.signIn.social({
    provider: 'apple',
    idToken: { token, nonce, ...(user ? { user } : {}) },
  });
  return { success: !res?.error, error: res?.error?.message };
}

let googleConfigured = false;

/** Native Google Sign-In (iOS + Android). Falls back to the browser flow on web
 * or when no web client id is configured. */
export async function signInWithGoogleNative(): Promise<NativeAuthResult> {
  if (Platform.OS === 'web') return { success: false, fallback: true };
  if (!GOOGLE_WEB_CLIENT_ID) return { success: false, fallback: true };

  const { GoogleSignin, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  );

  if (!googleConfigured) {
    // webClientId is the audience the server verifies the id_token against.
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    });
    googleConfigured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { success: false, cancelled: true };

    const token = response.data.idToken;
    if (!token) return { success: false, error: 'Google did not return an ID token' };

    const res = await authClient.signIn.social({ provider: 'google', idToken: { token } });
    return { success: !res?.error, error: res?.error?.message };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Google sign-in failed' };
  }
}

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { AWS_CONFIG } from '../constants/aws-config';

// In-memory storage with AsyncStorage persistence for amazon-cognito-identity-js
// The library expects synchronous getItem — AsyncStorage is async, so we mirror to memory
const STORAGE_PREFIX = 'COGNITO_STORE_';
const memoryStore: Record<string, string> = {};

const cognitoStorage = {
  getItem(key: string): string | null {
    return memoryStore[key] ?? null;
  },
  setItem(key: string, value: string) {
    memoryStore[key] = value;
    AsyncStorage.setItem(STORAGE_PREFIX + key, value);
  },
  removeItem(key: string) {
    delete memoryStore[key];
    AsyncStorage.removeItem(STORAGE_PREFIX + key);
  },
  clear() {
    const keys = Object.keys(memoryStore);
    keys.forEach(key => {
      AsyncStorage.removeItem(STORAGE_PREFIX + key);
      delete memoryStore[key];
    });
  },
};

// Hydrate in-memory store from AsyncStorage on app start
export async function hydrateCognitoStorage() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cognitoKeys = allKeys.filter(k => k.startsWith(STORAGE_PREFIX));
    if (cognitoKeys.length === 0) return;
    const pairs = await AsyncStorage.multiGet(cognitoKeys);
    for (const [prefixedKey, value] of pairs) {
      if (value != null) {
        const key = prefixedKey.substring(STORAGE_PREFIX.length);
        memoryStore[key] = value;
      }
    }
    console.log(`[AuthService] Hydrated ${cognitoKeys.length} cognito keys`);
  } catch (e) {
    console.error('[AuthService] Failed to hydrate cognito storage:', e);
  }
}

const userPool = new CognitoUserPool({
  UserPoolId: AWS_CONFIG.userPoolId,
  ClientId: AWS_CONFIG.appClientId,
  Storage: cognitoStorage,
});

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
}

let currentUser: CognitoUser | null = null;
let pendingNewPasswordUser: CognitoUser | null = null;
let pendingNewPasswordCallback: any = null;

export const AuthService = {
  async signIn(email: string, password: string): Promise<{ success: boolean; challenge?: string; error?: string }> {
    return new Promise((resolve) => {
      const user = new CognitoUser({
        Username: email,
        Pool: userPool,
        Storage: cognitoStorage,
      });

      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      user.authenticateUser(authDetails, {
        onSuccess: async (session: CognitoUserSession) => {
          currentUser = user;
          await storeUsername(session);
          resolve({ success: true });
        },
        onFailure: (err: Error) => {
          resolve({ success: false, error: err.message });
        },
        newPasswordRequired: (userAttributes: any) => {
          pendingNewPasswordUser = user;
          pendingNewPasswordCallback = { userAttributes };
          resolve({ success: false, challenge: 'NEW_PASSWORD_REQUIRED' });
        },
      });
    });
  },

  async completeNewPasswordChallenge(newPassword: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!pendingNewPasswordUser) {
        resolve({ success: false, error: 'No pending password challenge' });
        return;
      }

      const { email, email_verified, ...writableAttributes } = pendingNewPasswordCallback.userAttributes;

      pendingNewPasswordUser.completeNewPasswordChallenge(newPassword, writableAttributes, {
        onSuccess: async (session: CognitoUserSession) => {
          currentUser = pendingNewPasswordUser;
          pendingNewPasswordUser = null;
          pendingNewPasswordCallback = null;
          await storeUsername(session);
          resolve({ success: true });
        },
        onFailure: (err: Error) => {
          resolve({ success: false, error: err.message });
        },
      });
    });
  },

  async signOut(): Promise<void> {
    if (currentUser) {
      currentUser.signOut();
      currentUser = null;
    }
    cognitoStorage.clear();
    await AsyncStorage.removeItem('cognitoUsername');
  },

  async getSession(): Promise<{ email: string; session: CognitoUserSession } | null> {
    try {
      const username = await AsyncStorage.getItem('cognitoUsername');
      if (!username) {
        console.log('[AuthService] No stored username');
        return null;
      }

      const user = new CognitoUser({
        Username: username,
        Pool: userPool,
        Storage: cognitoStorage,
      });

      return new Promise((resolve) => {
        user.getSession((err: Error | null, session: CognitoUserSession | null) => {
          if (err) {
            console.log('[AuthService] getSession error:', err.message);
            resolve(null);
            return;
          }
          if (!session || !session.isValid()) {
            console.log('[AuthService] Session invalid or null');
            resolve(null);
            return;
          }
          currentUser = user;
          resolve({ email: username, session });
        });
      });
    } catch (e: any) {
      console.error('[AuthService] getSession exception:', e);
      return null;
    }
  },

  async getAWSCredentials(): Promise<AWSCredentials | null> {
    try {
      // If we have a currentUser in memory, use it directly
      if (currentUser) {
        const session = await new Promise<CognitoUserSession | null>((resolve) => {
          currentUser!.getSession((err: Error | null, session: CognitoUserSession | null) => {
            if (err || !session?.isValid()) {
              resolve(null);
            } else {
              resolve(session);
            }
          });
        });

        if (session) {
          return this._exchangeTokenForCredentials(session);
        }
      }

      // Fallback: try restoring from storage
      const sessionResult = await this.getSession();
      if (!sessionResult) {
        console.warn('[AuthService] No valid session for credentials');
        return null;
      }

      return this._exchangeTokenForCredentials(sessionResult.session);
    } catch (error: any) {
      console.error('[AuthService] getAWSCredentials error:', error);
      Alert.alert('Credential Error', error?.message || String(error));
      return null;
    }
  },

  async _exchangeTokenForCredentials(session: CognitoUserSession): Promise<AWSCredentials | null> {
    const idToken = session.getIdToken().getJwtToken();

    const identityClient = new CognitoIdentityClient({ region: AWS_CONFIG.region });

    const logins = {
      [`cognito-idp.${AWS_CONFIG.region}.amazonaws.com/${AWS_CONFIG.userPoolId}`]: idToken,
    };

    const idResponse = await identityClient.send(
      new GetIdCommand({
        IdentityPoolId: AWS_CONFIG.identityPoolId,
        Logins: logins,
      })
    );

    const credResponse = await identityClient.send(
      new GetCredentialsForIdentityCommand({
        IdentityId: idResponse.IdentityId!,
        Logins: logins,
      })
    );

    const creds = credResponse.Credentials;
    if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
      Alert.alert('Credential Error', 'AWS returned incomplete credentials');
      return null;
    }

    return {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    };
  },
};

// Only store the username separately — the cognito library handles tokens via cognitoStorage
async function storeUsername(session: CognitoUserSession): Promise<void> {
  const idToken = session.getIdToken();
  const username = idToken.payload.email || idToken.payload['cognito:username'];
  await AsyncStorage.setItem('cognitoUsername', username);
}

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
import { AWS_CONFIG } from '../constants/aws-config';

// In-memory storage with AsyncStorage persistence for amazon-cognito-identity-js
// The library expects synchronous getItem, so we can't use AsyncStorage directly
const memoryStore: Record<string, string> = {};

const cognitoStorage = {
  getItem(key: string): string | null {
    return memoryStore[key] ?? null;
  },
  setItem(key: string, value: string) {
    memoryStore[key] = value;
    AsyncStorage.setItem(`cognito_${key}`, value);
  },
  removeItem(key: string) {
    delete memoryStore[key];
    AsyncStorage.removeItem(`cognito_${key}`);
  },
  clear() {
    Object.keys(memoryStore).forEach(key => {
      AsyncStorage.removeItem(`cognito_${key}`);
      delete memoryStore[key];
    });
  },
};

// Hydrate in-memory store from AsyncStorage on import
export async function hydrateCognitoStorage() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cognitoKeys = keys.filter(k => k.startsWith('cognito_'));
    const pairs = await AsyncStorage.multiGet(cognitoKeys);
    for (const [key, value] of pairs) {
      if (value != null) {
        memoryStore[key.replace('cognito_', '')] = value;
      }
    }
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
          await storeTokens(session);
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

      // Remove non-writable attributes
      const { email, email_verified, ...writableAttributes } = pendingNewPasswordCallback.userAttributes;

      pendingNewPasswordUser.completeNewPasswordChallenge(newPassword, writableAttributes, {
        onSuccess: async (session: CognitoUserSession) => {
          currentUser = pendingNewPasswordUser;
          pendingNewPasswordUser = null;
          pendingNewPasswordCallback = null;
          await storeTokens(session);
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
    await AsyncStorage.multiRemove([
      'cognitoIdToken',
      'cognitoAccessToken',
      'cognitoRefreshToken',
      'cognitoUsername',
    ]);
  },

  async getSession(): Promise<{ email: string; session: CognitoUserSession } | null> {
    try {
      const username = await AsyncStorage.getItem('cognitoUsername');
      if (!username) return null;

      const user = new CognitoUser({
        Username: username,
        Pool: userPool,
        Storage: cognitoStorage,
      });

      return new Promise((resolve) => {
        user.getSession((err: Error | null, session: CognitoUserSession | null) => {
          if (err || !session || !session.isValid()) {
            resolve(null);
            return;
          }
          currentUser = user;
          resolve({ email: username, session });
        });
      });
    } catch {
      return null;
    }
  },

  async getAWSCredentials(): Promise<AWSCredentials | null> {
    try {
      const sessionResult = await this.getSession();
      if (!sessionResult) {
        console.warn('[AuthService] No valid session for credentials');
        return null;
      }

      const { session } = sessionResult;
      const idToken = session.getIdToken().getJwtToken();
      console.log('[AuthService] Got ID token, exchanging for AWS credentials...');

      const identityClient = new CognitoIdentityClient({ region: AWS_CONFIG.region });

      const logins = {
        [`cognito-idp.${AWS_CONFIG.region}.amazonaws.com/${AWS_CONFIG.userPoolId}`]: idToken,
      };

      console.log('[AuthService] Getting Identity ID...');
      const idResponse = await identityClient.send(
        new GetIdCommand({
          IdentityPoolId: AWS_CONFIG.identityPoolId,
          Logins: logins,
        })
      );
      console.log('[AuthService] Identity ID:', idResponse.IdentityId);

      const credResponse = await identityClient.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: idResponse.IdentityId!,
          Logins: logins,
        })
      );

      const creds = credResponse.Credentials;
      if (!creds?.AccessKeyId || !creds?.SecretKey || !creds?.SessionToken) {
        return null;
      }

      return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration,
      };
    } catch (error) {
      console.error('Error getting AWS credentials:', error);
      return null;
    }
  },
};

async function storeTokens(session: CognitoUserSession): Promise<void> {
  const idToken = session.getIdToken();
  await AsyncStorage.multiSet([
    ['cognitoIdToken', idToken.getJwtToken()],
    ['cognitoAccessToken', session.getAccessToken().getJwtToken()],
    ['cognitoRefreshToken', session.getRefreshToken().getToken()],
    ['cognitoUsername', idToken.payload.email || idToken.payload['cognito:username']],
  ]);
}

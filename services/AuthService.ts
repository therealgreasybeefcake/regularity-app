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

const userPool = new CognitoUserPool({
  UserPoolId: AWS_CONFIG.userPoolId,
  ClientId: AWS_CONFIG.appClientId,
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
      if (!sessionResult) return null;

      const { session } = sessionResult;
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

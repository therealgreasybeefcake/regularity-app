import React, { createContext, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authClient } from '../lib/auth-client';
import { api } from '../lib/api';

export type OAuthProvider = 'google' | 'apple';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  /** The signed-in user's email (kept as a string for existing consumers). */
  user: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signInWithProvider: (provider: OAuthProvider) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Permanently delete the account, then sign out + wipe local data. */
  deleteAccount: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // BetterAuth's reactive session hook drives auth state across the app.
  const { data: session, isPending } = authClient.useSession();

  const user = session?.user?.email ?? null;
  const userName = session?.user?.name ?? null;
  const isAuthenticated = !!session?.user;

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const res = await authClient.signIn.email({ email, password });
    return { success: !res.error, error: res.error?.message };
  };

  const signUp = async (name: string, email: string, password: string): Promise<AuthResult> => {
    const res = await authClient.signUp.email({ name, email, password });
    return { success: !res.error, error: res.error?.message };
  };

  const signInWithProvider = async (provider: OAuthProvider): Promise<AuthResult> => {
    try {
      const res = await authClient.signIn.social({ provider, callbackURL: '/' });
      return { success: !res?.error, error: res?.error?.message };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Sign-in failed' };
    }
  };

  const signOut = async () => {
    await authClient.signOut();
  };

  const deleteAccount = async (): Promise<AuthResult> => {
    try {
      await api.del('/api/me');
      await authClient.signOut();
      await AsyncStorage.clear(); // wipe local teams/prefs for the deleted account
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Failed to delete account' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userName,
        isAuthenticated,
        isAuthLoading: isPending,
        signIn,
        signUp,
        signInWithProvider,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

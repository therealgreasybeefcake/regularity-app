import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AuthService, AWSCredentials, hydrateCognitoStorage } from '../services/AuthService';

interface AuthContextType {
  user: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; challenge?: string; error?: string }>;
  completeNewPasswordChallenge: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  getCredentials: () => Promise<AWSCredentials | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const cachedCredentials = useRef<AWSCredentials | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await hydrateCognitoStorage();
        const session = await AuthService.getSession();
        if (session) {
          setUser(session.email);
        }
      } catch {
        // No valid session
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await AuthService.signIn(email, password);
    if (result.success) {
      setUser(email);
    }
    return result;
  };

  const completeNewPasswordChallenge = async (newPassword: string) => {
    const result = await AuthService.completeNewPasswordChallenge(newPassword);
    if (result.success) {
      const session = await AuthService.getSession();
      if (session) setUser(session.email);
    }
    return result;
  };

  const signOut = async () => {
    await AuthService.signOut();
    setUser(null);
    cachedCredentials.current = null;
  };

  const getCredentials = async (): Promise<AWSCredentials | null> => {
    // Return cached if not expired (with 5 min buffer)
    if (cachedCredentials.current?.expiration) {
      const buffer = 5 * 60 * 1000;
      if (cachedCredentials.current.expiration.getTime() - buffer > Date.now()) {
        return cachedCredentials.current;
      }
    }
    const creds = await AuthService.getAWSCredentials();
    cachedCredentials.current = creds;
    return creds;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAuthLoading,
        signIn,
        completeNewPasswordChallenge,
        signOut,
        getCredentials,
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

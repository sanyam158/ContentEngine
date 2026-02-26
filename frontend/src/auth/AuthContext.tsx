import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import apiService, { AuthUser } from '../services/api';
import {
  AUTH_EXPIRED_EVENT_NAME,
  clearStoredAuthToken,
  getStoredAuthToken,
  setStoredAuthToken,
} from './tokenStorage';

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearSession = useCallback(() => {
    clearStoredAuthToken();
    setUser(null);
  }, []);

  const bootstrapSession = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) {
      setIsInitializing(false);
      return;
    }

    try {
      const response = await apiService.getCurrentUser();
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    } finally {
      setIsInitializing(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearSession();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT_NAME, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT_NAME, handleAuthExpired);
    };
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await apiService.login(username, password);
      if (!response.success || !response.token || !response.user) {
        return {
          success: false,
          error: response.error || 'Invalid username or password',
        };
      }

      setStoredAuthToken(response.token);
      setUser(response.user);
      return { success: true };
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const apiError = typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : null;

        return {
          success: false,
          error: apiError || 'Login failed. Please verify your credentials.',
        };
      }

      return {
        success: false,
        error: 'Login failed. Please try again.',
      };
    }
  }, []);

  const logout = useCallback(() => {
    void apiService.logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      logout,
    }),
    [isInitializing, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

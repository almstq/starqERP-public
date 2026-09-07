import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSession, fetchCurrentUser, logout as apiLogout, switchSeat as apiSwitchSeat } from '../services/auth';
import { setCsrfToken } from '../services/apiGateway';

interface AuthContextType {
  session: UserSession | null;
  isLoading: boolean;
  error: string | null;
  login: (session: UserSession) => void;
  logout: () => Promise<void>;
  switchSeat: (seat: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const defaultAuth: AuthContextType = {
  session: null,
  isLoading: false,
  error: null,
  login: () => {},
  logout: async () => {},
  switchSeat: async () => {},
  refreshSession: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuth);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      setSession(user);
      if (user?.csrf) {
        setCsrfToken(user.csrf);
      }
      setError(null);
    } catch {
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback((userSession: UserSession) => {
    setSession(userSession);
    if (userSession.csrf) {
      setCsrfToken(userSession.csrf);
    }
    setError(null);
  }, []);

  const logoutFn = useCallback(async () => {
    await apiLogout(session?.csrf ?? '');
    setSession(null);
    setCsrfToken(null);
  }, [session?.csrf]);

  const switchSeatFn = useCallback(async (seat: string) => {
    const updated = await apiSwitchSeat(seat, session?.csrf ?? '');
    setSession(updated);
    if (updated.csrf) {
      setCsrfToken(updated.csrf);
    }
  }, [session?.csrf]);

  return (
    <AuthContext.Provider value={{
      session,
      isLoading,
      error,
      login,
      logout: logoutFn,
      switchSeat: switchSeatFn,
      refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

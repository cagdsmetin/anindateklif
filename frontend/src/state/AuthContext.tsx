import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getSessionToken, setSessionToken, UserT } from '@/src/lib/api';

type LoginArgs = { email: string; password: string };
type RegisterArgs = { email: string; password: string; name: string; phone?: string };

type AuthState = {
  loading: boolean;
  user: UserT | null;
  login: (args: LoginArgs) => Promise<void>;
  register: (args: RegisterArgs) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  updateUser: (patch: Partial<UserT>) => Promise<UserT>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserT | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (token) {
        try {
          const me: UserT = await api.me();
          setUser(me);
        } catch {
          await setSessionToken(null);
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async ({ email, password }: LoginArgs) => {
    const res: { access_token: string; user: UserT } = await api.login({ email, password });
    await setSessionToken(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(async ({ email, password, name, phone }: RegisterArgs) => {
    const res: { access_token: string; user: UserT } = await api.register({ email, password, name, phone });
    await setSessionToken(res.access_token);
    setUser(res.user);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api.forgotPassword(email);
  }, []);

  const updateUser = useCallback(async (patch: Partial<UserT>) => {
    const updated: UserT = await api.updateMe(patch as any);
    setUser(updated);
    return updated;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me: UserT = await api.me();
      setUser(me);
    } catch {
      // ignore
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await setSessionToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, login, register, forgotPassword, updateUser, refreshUser, signOut }),
    [loading, user, login, register, forgotPassword, updateUser, refreshUser, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

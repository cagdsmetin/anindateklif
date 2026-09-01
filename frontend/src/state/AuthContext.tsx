import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getSessionToken, setSessionToken, getAdminReturnToken, setAdminReturnToken, UserT } from '@/src/lib/api';

type LoginArgs = { email: string; password: string };
type RegisterArgs = { email: string; password: string; name: string; phone: string };

type AuthState = {
  loading: boolean;
  user: UserT | null;
  login: (args: LoginArgs) => Promise<void>;
  register: (args: RegisterArgs) => Promise<void>;
  acceptInvite: (token: string, name: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  updateUser: (patch: Partial<UserT>) => Promise<UserT>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  enterAsCustomer: (userId: string) => Promise<string>;
  returnToOwnAccount: () => Promise<void>;
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
    // eslint-disable-next-line no-console
    console.log('[auth] login attempt', { email });
    const res: { access_token: string; user: UserT } = await api.login({ email, password });
    try {
      await setSessionToken(res.access_token);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] token storage failed, using in-memory session', e);
    }
    setUser(res.user);
  }, []);

  const register = useCallback(async ({ email, password, name, phone }: RegisterArgs) => {
    // Debug hook: `adb logcat *:S ReactNativeJS:V` shows this on Android APK.
    // eslint-disable-next-line no-console
    console.log('[auth] register attempt', { email });
    const res: { access_token: string; user: UserT } = await api.register({ email, password, name, phone });
    try {
      await setSessionToken(res.access_token);
    } catch (e) {
      // Token storage failure MUST NOT block sign-in — keep the token in memory
      // (getSessionToken() will still find it via the module-level `tokenCache`)
      // and let the user continue. On next app launch they'll have to log in again.
      // eslint-disable-next-line no-console
      console.warn('[auth] token storage failed, using in-memory session', e);
    }
    setUser(res.user);
  }, []);

  const acceptInvite = useCallback(async (token: string, name: string, password: string) => {
    const res: { access_token: string; user: UserT } = await api.acceptInvite(token, { name, password });
    try {
      await setSessionToken(res.access_token);
    } catch (e) {
      console.warn('[auth] token storage failed, using in-memory session', e);
    }
    setUser(res.user);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    await api.resetPassword(token, newPassword);
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

  // Admin "Müşteri olarak gir": kendi (admin) oturum token'ını bir kenara
  // kaldırıp, backend'in ürettiği kısa süreli/audit'li müşteri token'ına
  // geçer. Şifre görülmez/sorulmaz.
  const enterAsCustomer = useCallback(async (userId: string) => {
    const currentToken = await getSessionToken();
    const res: { access_token: string; user: UserT; company_name: string } = await api.impersonateCustomer(userId);
    if (currentToken) {
      await setAdminReturnToken(currentToken);
    }
    await setSessionToken(res.access_token);
    setUser(res.user);
    return res.company_name;
  }, []);

  // Destek modundan çıkıp admin kendi hesabına geri döner.
  const returnToOwnAccount = useCallback(async () => {
    const returnToken = await getAdminReturnToken();
    try { await api.endImpersonation(); } catch {}
    await setAdminReturnToken(null);
    if (returnToken) {
      await setSessionToken(returnToken);
      try {
        const me: UserT = await api.me();
        setUser(me);
        return;
      } catch {
        // Admin'in kendi token'ı da geçersizse (ör. süresi dolmuş) düz çıkış yap.
      }
    }
    await setSessionToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      loading, user, login, register, acceptInvite, forgotPassword, resetPassword, updateUser, refreshUser, signOut,
      enterAsCustomer, returnToOwnAccount,
    }),
    [loading, user, login, register, acceptInvite, forgotPassword, resetPassword, updateUser, refreshUser, signOut, enterAsCustomer, returnToOwnAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

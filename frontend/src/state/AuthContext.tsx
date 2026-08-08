import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, getSessionToken, setSessionToken, UserT } from '@/src/lib/api';

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  loading: boolean;
  user: UserT | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const processedSessionIds = new Set<string>();

function extractSessionIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserT | null>(null);

  const exchange = useCallback(async (session_id: string) => {
    if (processedSessionIds.has(session_id)) return;
    processedSessionIds.add(session_id);
    try {
      const res: { session_token: string; user: UserT } = await api.exchangeSession(session_id);
      await setSessionToken(res.session_token);
      setUser(res.user);
    } catch (e) {
      console.warn('Session exchange failed', e);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      // Web: check for session_id in URL fragment/query
      if (Platform.OS === 'web') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const sid = extractSessionIdFromUrl(hash) || extractSessionIdFromUrl(search);
        if (sid) {
          await exchange(sid);
          // clean URL
          try {
            const url = new URL(window.location.href);
            url.hash = '';
            url.searchParams.delete('session_id');
            window.history.replaceState(window.history.state, '', url.pathname + url.search);
          } catch {}
        }
      } else {
        // Mobile cold start
        const initialUrl = await Linking.getInitialURL();
        const sid = extractSessionIdFromUrl(initialUrl);
        if (sid) await exchange(sid);
      }

      // Try existing token
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
  }, [exchange]);

  useEffect(() => {
    bootstrap();

    // Mobile: listen for hot deep-links
    if (Platform.OS !== 'web') {
      const sub = Linking.addEventListener('url', ({ url }) => {
        const sid = extractSessionIdFromUrl(url);
        if (sid) exchange(sid).then(async () => {
          try {
            const me: UserT = await api.me();
            setUser(me);
          } catch {}
        });
      });
      return () => sub.remove();
    }
  }, [bootstrap, exchange]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === 'web') {
      const redirect = window.location.origin + '/';
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      window.location.href = authUrl;
    } else {
      const redirect = Linking.createURL('');
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      let sid: string | null = null;
      if (result.type === 'success' && (result as any).url) {
        sid = extractSessionIdFromUrl((result as any).url);
      }
      if (!sid) {
        // fallback to getInitialURL
        const initial = await Linking.getInitialURL();
        sid = extractSessionIdFromUrl(initial);
      }
      if (sid) {
        await exchange(sid);
        try {
          const me: UserT = await api.me();
          setUser(me);
        } catch {}
      }
    }
  }, [exchange]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await setSessionToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, signInWithGoogle, signOut }),
    [loading, user, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

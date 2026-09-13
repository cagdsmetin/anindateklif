import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '@/src/utils/storage';
import { useAuth } from '@/src/state/AuthContext';
import { applyThemeMode, ThemeMode } from '@/src/lib/theme';

// ============================================================================
// Açık/Koyu tema tercihi -- dil (i18n.tsx / LanguageProvider) ile BİREBİR
// AYNI DESEN: giriş yapmış kullanıcı için backend'de (User.theme) saklanır,
// hangi cihazdan girerse girsin aynı temada açılır. Giriş öncesi ekranlarda
// (splash/login/register) cihazda (storage) tutulan son seçim kullanılır.
//
// Tema DEĞİŞTİĞİNDE, `applyThemeMode()` `theme.colors` objesini yerinde
// (mutasyonla) günceller; ardından bu Provider'ın `key` değeri artırılarak
// TÜM ALT AĞAÇ yeniden mount edilir -- böylece her ekran (theme.colors.X
// değerlerini modül-seviye import ile okuyan 44 dosya dahil) güncel renkleri
// baştan okumuş olur. Bu, mevcut hiçbir ekranı tek tek değiştirmeden
// (Context/useTheme() geçişi yapmadan) çalışan en düşük riskli yöntemdir.
// ============================================================================

const STORAGE_KEY = 'app_theme';

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeCtx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUser } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [remountKey, setRemountKey] = useState(0);

  const activate = useCallback((next: ThemeMode) => {
    setModeState((prev) => {
      if (prev === next) return prev; // zaten uygulanmış, gereksiz remount yapma
      applyThemeMode(next);
      setRemountKey((k) => k + 1);
      return next;
    });
  }, []);

  useEffect(() => {
    if (user?.theme === 'dark' || user?.theme === 'light') {
      activate(user.theme);
      return;
    }
    // Giriş yapılmamış (splash/login/register) -- cihazda önceden seçim var mı?
    storage.getItem<string>(STORAGE_KEY, '').then((v) => {
      if (v === 'dark' || v === 'light') activate(v);
    });
  }, [user?.theme, activate]);

  const setMode = useCallback(async (next: ThemeMode) => {
    applyThemeMode(next);
    setModeState(next);
    setRemountKey((k) => k + 1); // tüm ağacı yeniden mount et, yeni renkler okunsun
    await storage.setItem(STORAGE_KEY, next);
    if (user) {
      try {
        await updateUser({ theme: next } as any);
      } catch {
        // Sunucuya yazılamasa bile ekran anında güncellendi.
      }
    }
  }, [user, updateUser]);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeCtx.Provider value={value}>
      <React.Fragment key={remountKey}>{children}</React.Fragment>
    </ThemeCtx.Provider>
  );
}

export function useAppTheme(): ThemeState {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider');
  return ctx;
}

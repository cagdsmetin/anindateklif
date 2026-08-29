import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kullanıcının menü öğelerini (sol bar / çekmece menüsü / baloncuk sekmeleri
// gibi kısa listeler) kendi tercih ettiği sıraya göre düzenleyebilmesini
// sağlayan basit, cihaza özel bir kalıcı sıralama deposu. Web'de
// localStorage, mobilde AsyncStorage kullanılır -- ikisi de senkron bir API
// gibi davranması için burada async/await ile sarmalanmış.
async function readRaw(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, value);
    } catch {
      // yoksay -- sıralama kalıcı olmasa da uygulama çalışmaya devam etsin
    }
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // yoksay
  }
}

// `defaultNames` -- şu anki (kod tarafından belirlenen) doğal sıra. Kayıtlı
// bir sıra varsa önce onun içindeki isimler (hâlâ mevcut olanlar) sırayla
// gelir, sonra kayıtta olmayan YENİ isimler (örn. sonradan eklenen bir menü
// öğesi) listenin sonuna, kendi aralarındaki doğal sırayla eklenir --
// böylece yeni bir özellik eklendiğinde kullanıcının eski sıralaması
// bozulmaz ve yeni öğe de kaybolmaz.
function reconcile(defaultNames: string[], saved: string[] | null): string[] {
  if (!saved || saved.length === 0) return defaultNames;
  const defaultSet = new Set(defaultNames);
  const savedValid = saved.filter((n) => defaultSet.has(n));
  const savedSet = new Set(savedValid);
  const missing = defaultNames.filter((n) => !savedSet.has(n));
  return [...savedValid, ...missing];
}

export function useOrderedNames(storageKey: string, defaultNames: string[]) {
  const [order, setOrder] = useState<string[]>(defaultNames);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await readRaw(storageKey);
      if (cancelled) return;
      let saved: string[] | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) saved = parsed;
        } catch {
          saved = null;
        }
      }
      setOrder(reconcile(defaultNames, saved));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // defaultNames bir dizi -- referansı her render'da değişebileceğinden
    // içeriğini stringleyip karşılaştırıyoruz ki gereksiz yeniden okumaya
    // sebep olmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, JSON.stringify(defaultNames)]);

  const persist = useCallback(
    (next: string[]) => {
      setOrder(next);
      writeRaw(storageKey, JSON.stringify(next));
    },
    [storageKey]
  );

  const moveBy = useCallback(
    (name: string, delta: number) => {
      setOrder((prev) => {
        const idx = prev.indexOf(name);
        if (idx === -1) return prev;
        const next = prev.slice();
        const swapWith = idx + delta;
        if (swapWith < 0 || swapWith >= next.length) return prev;
        [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const moveUp = useCallback((name: string) => moveBy(name, -1), [moveBy]);
  const moveDown = useCallback((name: string) => moveBy(name, 1), [moveBy]);
  const moveLeft = moveUp;
  const moveRight = moveDown;

  const reset = useCallback(() => {
    persist(defaultNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, JSON.stringify(defaultNames)]);

  // Sıralamayı gerçek öğe listesine uygulayan yardımcı -- öğe adı `name`
  // alanında tutuluyorsa (NavItem gibi) direkt kullanılabilir.
  function applyOrder<T extends { name: string }>(items: T[]): T[] {
    const byName = new Map(items.map((it) => [it.name, it] as const));
    const ordered: T[] = [];
    for (const n of order) {
      const it = byName.get(n);
      if (it) ordered.push(it);
    }
    // order'da henüz yer almayan (örn. henüz reconcile edilmemiş ilk render)
    // öğeleri de kaybetmeyelim.
    for (const it of items) {
      if (!order.includes(it.name)) ordered.push(it);
    }
    return ordered;
  }

  return { order, loaded, moveUp, moveDown, moveLeft, moveRight, reset, applyOrder };
}

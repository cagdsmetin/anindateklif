import { useEffect, useState } from 'react';
import { api } from './api';

// İsteğe bağlı modüller: firma bazında açılır/kapanır (bkz. server.py
// "MODÜL YÖNETİMİ"). Menü (masaüstü kenar çubuğu + mobil çekmece) aynı
// listeyi bu küçük paylaşımlı depodan okur; Modüller ekranı değiştirince
// ikisi de anında güncellenir.
export const OPTIONAL_MODULES = ['cek-senet', 'kira', 'aidat', 'seans'] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];
export const DEFAULT_MODULES: string[] = ['cek-senet'];

let current: string[] = DEFAULT_MODULES;
let loadedFor = '';
const listeners = new Set<(m: string[]) => void>();

function publish(m: string[]) {
  current = m;
  listeners.forEach((l) => l(m));
}

export async function loadModules(companyId: string, force = false) {
  if (!companyId || (!force && loadedFor === companyId)) return;
  loadedFor = companyId;
  try { publish((await api.getModules(companyId)).acik); } catch { publish(DEFAULT_MODULES); }
}

export async function saveModules(companyId: string, acik: string[]) {
  publish(acik); // iyimser: menü hemen değişsin
  const r = await api.putModules(companyId, acik);
  publish(r.acik);
}

export function useModules(companyId?: string): string[] {
  const [mods, setMods] = useState(current);
  useEffect(() => {
    listeners.add(setMods);
    setMods(current);
    return () => { listeners.delete(setMods); };
  }, []);
  useEffect(() => { if (companyId) loadModules(companyId); }, [companyId]);
  return mods;
}

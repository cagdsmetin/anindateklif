import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { OPTIONAL_MODULES, OptionalModule, saveModules, useModules } from '@/src/lib/modules';
import { useLanguage } from '@/src/lib/i18n';
import { IconBadge, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';

// Modül yönetimi: işine yaramayan modülleri kapat, menün sadeleşsin.
// Kapatmak veriyi silmez; yalnız menüde gizler.

const META: Record<OptionalModule, { icon: keyof typeof Ionicons.glyphMap; color: string; route: string }> = {
  'cek-senet': { icon: 'documents', color: '#4D7C0F', route: '/cek-senet' },
  kira: { icon: 'key', color: '#0F766E', route: '/kira' },
  aidat: { icon: 'business', color: '#7C3AED', route: '/aidat' },
  seans: { icon: 'fitness', color: '#DB2777', route: '/seans' },
};

const key = (name: string) => (name === 'cek-senet' ? 'cekSenet' : name);

export default function ModullerScreen() {
  const { t } = useLanguage();
  const tm = (k: string) => t('mods.' + k);
  const { activeCompany, showToast } = useApp();
  const { user: me } = useAuth();
  const manager = !me?.is_staff || me?.staff_role === 'admin';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mods = useModules(activeCompany?.id);
  const [busy, setBusy] = useState(false);

  const toggle = async (name: OptionalModule, on: boolean) => {
    if (!activeCompany || busy) return;
    setBusy(true);
    try { await saveModules(activeCompany.id, on ? [...mods, name] : mods.filter((x) => x !== name)); }
    catch (e: any) { showToast(e?.message || ''); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tm('title')} />
      <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        <ScreenHero icon="apps" title={tm('title')} subtitle={activeCompany?.sirketAdi} color={theme.colors.modules.firma} />
        <Text style={s.intro}>{tm('intro')}</Text>
        {OPTIONAL_MODULES.map((name) => {
          const on = mods.includes(name);
          const meta = META[name];
          return (
            <View key={name} style={s.row} testID={`mod-${name}`}>
              <IconBadge icon={meta.icon} color={meta.color} size={40} />
              <TouchableOpacity style={{ flex: 1 }} disabled={!on} onPress={() => router.push(meta.route as any)}>
                <Text style={s.name}>{tm(key(name) + '_t')}{on ? '  ›' : ''}</Text>
                <Text style={s.desc}>{tm(key(name) + '_d')}</Text>
              </TouchableOpacity>
              <Switch value={on} disabled={!manager || busy} onValueChange={(v) => toggle(name, v)} testID={`mod-switch-${name}`} />
            </View>
          );
        })}
        <Text style={s.foot}>{manager ? tm('foot') : tm('managerOnly')}</Text>
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  intro: { fontSize: 12, color: theme.colors.textMuted, marginTop: 12, marginBottom: 6, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 13, marginTop: 8, ...theme.shadow.sm },
  name: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  desc: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  foot: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center', marginTop: 16 },
}));

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { api, NotifPrefsT, UserNotificationT } from '@/src/lib/api';
import { MotionScrollView, themedStyles } from '@/src/components/motion';
import { useLanguage } from '@/src/lib/i18n';
import { currentPushState, enablePush, PushState } from '@/src/lib/push';
import { setUnread } from '@/src/lib/notifStore';

// Bildirim kutusu: olaylar (teklif onayı, ekip), akıllı hatırlatmalar
// (bekleyen teklif, bugünkü işler, stok), günlük ipuçları ve duyurular.

const ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  olay: { icon: 'checkmark', color: '#16A34A' },
  akilli: { icon: 'alarm', color: '#D97706' },
  ipucu: { icon: 'information', color: '#2563EB' },
  duyuru: { icon: 'megaphone', color: '#9333EA' },
};

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

export default function NotificationsScreen() {
  const { t, lang } = useLanguage();
  const tn = (k: string) => t('notif.' + k);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useApp();
  const [items, setItems] = useState<UserNotificationT[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [asking, setAsking] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefsT | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.listNotifications(lang);
      setItems(r.items);
      setHasMore(r.items.length >= 50);
      setUnread(r.unread);
    } catch { setItems((x) => x || []); }
  }, [lang]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    currentPushState().then(setPush).catch(() => setPush('unsupported'));
    api.getNotifPrefs().then(setPrefs).catch(() => {});
  }, []);

  const loadMore = async () => {
    if (!items?.length) return;
    const r = await api.listNotifications(lang, items[items.length - 1].createdAt);
    setItems([...items, ...r.items]);
    setHasMore(r.items.length >= 50);
  };

  const open = (n: UserNotificationT) => {
    if (!n.readAt) {
      api.readNotification(n.id).catch(() => {});
      setItems((xs) => (xs || []).map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread(Math.max(0, (items || []).filter((x) => !x.readAt).length - 1));
    }
    if (n.link) router.push(n.link as any);
  };

  const readAll = async () => {
    await api.readAllNotifications().catch(() => {});
    setItems((xs) => (xs || []).map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
    showToast(tn('allRead'));
  };

  const ask = async () => {
    setAsking(true);
    try {
      const st = await enablePush();
      setPush(st);
      if (st === 'granted') showToast(tn('enabled'));
    } finally { setAsking(false); }
  };

  const savePref = async (patch: Partial<NotifPrefsT>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try { await api.putNotifPrefs(next); showToast(tn('saved')); } catch { /* geri al */ setPrefs(prefs); }
  };

  const unreadCount = (items || []).filter((x) => !x.readAt).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tn('title')} />
      <MotionScrollView
        contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 60 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.toolbar}>
          <Text style={s.h1}>{tn('title')}{unreadCount ? ` (${unreadCount})` : ''}</Text>
          <TouchableOpacity onPress={() => setShowPrefs((v) => !v)} style={s.iconBtn} testID="notif-settings" accessibilityLabel={tn('settings')}>
            <Ionicons name="settings-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={readAll} style={s.iconBtn} disabled={!unreadCount} testID="notif-read-all" accessibilityLabel={tn('readAll')}>
            <Ionicons name="checkmark-done-circle-outline" size={24} color={unreadCount ? theme.colors.modules.bildirim : theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {push && push !== 'granted' && (
          <View style={s.enableCard} testID="notif-enable-card">
            <View style={[s.circle, { backgroundColor: theme.colors.modules.bildirim }]}>
              <Ionicons name="notifications" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.enableTitle}>{tn('enableTitle')}</Text>
              <Text style={s.msg}>
                {push === 'ios-install' ? tn('iosInstall') : push === 'denied' ? tn('denied') : push === 'unsupported' ? tn('unsupported') : tn('enableSub')}
              </Text>
              {push === 'default' && (
                <TouchableOpacity style={s.enableBtn} onPress={ask} disabled={asking} testID="notif-enable-btn">
                  <Text style={s.enableBtnT}>{asking ? '…' : tn('enableBtn')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {showPrefs && prefs && (
          <View style={s.prefs} testID="notif-prefs">
            {([['ipucu', 'prefTips'], ['akilli', 'prefSmart'], ['push', 'prefPush']] as const).map(([k, label]) => (
              <View key={k} style={s.prefRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.prefT}>{tn(label)}</Text>
                  <Text style={s.date}>{tn(label + 'Sub')}</Text>
                </View>
                <Switch value={!!prefs[k]} onValueChange={(v) => savePref({ [k]: v })} testID={`notif-pref-${k}`} />
              </View>
            ))}
          </View>
        )}

        {items == null ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={theme.colors.modules.bildirim} />
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.title}>{tn('empty')}</Text>
            <Text style={[s.msg, { textAlign: 'center' }]}>{tn('emptySub')}</Text>
          </View>
        ) : (
          items.map((n) => {
            const ic = ICONS[n.tip] || ICONS.ipucu;
            return (
              <TouchableOpacity key={n.id} style={[s.card, !n.readAt && s.cardUnread]} onPress={() => open(n)} activeOpacity={0.8} testID={`notif-${n.id}`}>
                <View style={[s.circle, { backgroundColor: ic.color }]}>
                  <Ionicons name={ic.icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{n.baslik}</Text>
                  <Text style={s.msg}>{n.mesaj}</Text>
                  <Text style={s.date}>{fmt(n.createdAt)}</Text>
                </View>
                {!n.readAt && <View style={s.dot} />}
              </TouchableOpacity>
            );
          })
        )}
        {hasMore && (
          <TouchableOpacity onPress={loadMore} style={s.more}>
            <Text style={s.moreT}>{tn('more')}</Text>
          </TouchableOpacity>
        )}
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  page: { padding: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  h1: { flex: 1, fontSize: 20, fontWeight: '900', color: theme.colors.text },
  iconBtn: { padding: 6 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.line, padding: 16, marginTop: 10 },
  cardUnread: { borderColor: theme.colors.modules.bildirim + '88', borderWidth: 1.5 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: theme.colors.text, lineHeight: 20 },
  msg: { fontSize: 13, color: theme.colors.textMuted, marginTop: 3, lineHeight: 18 },
  date: { fontSize: 11.5, color: theme.colors.textSoft, marginTop: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.modules.bildirim },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 50, paddingHorizontal: 20 },
  enableCard: { flexDirection: 'row', gap: 14, backgroundColor: theme.colors.modules.bildirim + '14', borderRadius: 16, borderWidth: 1.5, borderColor: theme.colors.modules.bildirim + '66', padding: 16, marginTop: 6 },
  enableTitle: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  enableBtn: { alignSelf: 'flex-start', backgroundColor: theme.colors.modules.bildirim, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, marginTop: 10 },
  enableBtnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  prefs: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 14, marginTop: 10 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  prefT: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  more: { alignItems: 'center', padding: 14 },
  moreT: { color: theme.colors.modules.bildirim, fontWeight: '800' },
}));

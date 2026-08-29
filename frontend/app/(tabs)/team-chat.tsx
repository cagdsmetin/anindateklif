import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';
import type { TeamConversationT, TeamDirectoryMemberT, TeamMessageT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Firma Sahibi',
  admin: 'Yönetici',
  staff: 'Personel',
};

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

type Pane = { kind: 'list' } | { kind: 'admin-list' } | { kind: 'thread'; withId: string; withName: string } | { kind: 'admin-thread'; a: string; b: string; aName: string; bName: string };

export default function TeamChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { activeCompany } = useApp();
  const { user } = useAuth();
  const selfId = user?.user_id || '';
  const isOwner = !user?.is_staff;

  const [pane, setPane] = useState<Pane>({ kind: 'list' });
  const [directory, setDirectory] = useState<TeamDirectoryMemberT[]>([]);
  const [conversations, setConversations] = useState<TeamConversationT[]>([]);
  const [allConversations, setAllConversations] = useState<TeamConversationT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [thread, setThread] = useState<TeamMessageT[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [kbInset, setKbInset] = useState(0);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const [dir, conv] = await Promise.all([
        api.teamDirectory(activeCompany.id),
        api.teamConversations(activeCompany.id, 'mine'),
      ]);
      setDirectory(dir || []);
      setConversations(conv || []);
      if (isOwner) {
        const all = await api.teamConversations(activeCompany.id, 'all');
        setAllConversations(all || []);
      }
    } catch {
      // sessizce yut — liste boş kalır, aşağıda tekrar denenir
    }
  }, [activeCompany, isOwner]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Konuşma listesi açıkken hafif bir polling ile taze tutuyoruz (websocket
  // altyapısı yok) — yeni mesaj/okundu durumu birkaç saniye içinde yansır.
  useEffect(() => {
    if (pane.kind !== 'list' && pane.kind !== 'admin-list') return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [pane.kind, load]);

  const loadThread = useCallback(async (withId: string) => {
    if (!activeCompany) return;
    try {
      const msgs = await api.teamThread(activeCompany.id, withId);
      setThread(msgs || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  }, [activeCompany]);

  const loadAdminThread = useCallback(async (a: string, b: string) => {
    if (!activeCompany) return;
    try {
      const msgs = await api.teamThreadAdmin(activeCompany.id, a, b);
      setThread(msgs || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  }, [activeCompany]);

  useEffect(() => {
    if (pane.kind === 'thread') {
      loadThread(pane.withId);
      const t = setInterval(() => loadThread(pane.withId), 4000);
      return () => clearInterval(t);
    }
    if (pane.kind === 'admin-thread') {
      loadAdminThread(pane.a, pane.b);
      const t = setInterval(() => loadAdminThread(pane.a, pane.b), 5000);
      return () => clearInterval(t);
    }
  }, [pane, loadThread, loadAdminThread]);

  // Web'de mobil klavye açıldığında alt gönderim çubuğu klavyenin arkasında
  // kalmasın diye visualViewport'u izliyoruz (bkz. assistant.tsx'teki aynı çözüm).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const vv: any = (typeof window !== 'undefined' && (window as any).visualViewport) || null;
    if (!vv) return;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(offset);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || pane.kind !== 'thread' || !activeCompany) return;
    setSending(true);
    setInput('');
    try {
      const msg = await api.sendTeamMessage(activeCompany.id, pane.withId, text);
      setThread((prev) => [...prev, msg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const otherMembers = directory.filter((m) => m.userId !== selfId);
  const convByOther: Record<string, TeamConversationT> = {};
  conversations.forEach((c) => { if (c.otherUserId) convByOther[c.otherUserId] = c; });

  const title = pane.kind === 'list' ? 'Ekip Sohbeti'
    : pane.kind === 'admin-list' ? 'Tüm Konuşmalar'
    : pane.kind === 'thread' ? pane.withName
    : `${pane.aName} · ${pane.bName}`;

  const onBack = () => {
    if (pane.kind === 'thread' || pane.kind === 'admin-list') { setPane({ kind: 'list' }); return; }
    if (pane.kind === 'admin-thread') { setPane({ kind: 'admin-list' }); return; }
    router.back();
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="team-chat-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {pane.kind === 'list' && isOwner ? (
          <TouchableOpacity onPress={() => setPane({ kind: 'admin-list' })} style={s.headerBtn} testID="team-chat-admin-toggle">
            <Ionicons name="eye-outline" size={20} color={theme.colors.modules.mesaj} />
          </TouchableOpacity>
        ) : (
          <View style={s.headerBtn} />
        )}
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={s.centerFill}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : pane.kind === 'list' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          {otherMembers.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="people-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Ekibinizde henüz başka biri yok. Personel ekleyince burada listelenir.</Text>
            </View>
          ) : (
            otherMembers.map((m) => {
              const conv = convByOther[m.userId];
              return (
                <TouchableOpacity
                  key={m.userId}
                  style={s.row}
                  onPress={() => setPane({ kind: 'thread', withId: m.userId, withName: m.name })}
                  testID={`team-chat-row-${m.userId}`}
                >
                  <View style={s.avatar}><Text style={s.avatarText}>{(m.name || '?').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.rowTop}>
                      <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                      {conv ? <Text style={s.rowTime}>{fmtTime(conv.lastAt)}</Text> : null}
                    </View>
                    <View style={s.rowTop}>
                      <Text style={s.rowSub} numberOfLines={1}>
                        {conv ? conv.lastText : `${ROLE_LABEL[m.role] || m.role} · henüz mesaj yok`}
                      </Text>
                      {conv && conv.unreadCount > 0 ? (
                        <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{conv.unreadCount}</Text></View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : pane.kind === 'admin-list' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          <Text style={s.adminNote}>
            Firma sahibi olarak ekibinizdeki herkesin birbiriyle olan yazışmalarını buradan görebilirsiniz.
          </Text>
          {allConversations.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Ekipte henüz hiç mesajlaşma yok.</Text>
            </View>
          ) : (
            allConversations.map((c, i) => (
              <TouchableOpacity
                key={`${c.participantAId}-${c.participantBId}-${i}`}
                style={s.row}
                onPress={() => setPane({
                  kind: 'admin-thread',
                  a: c.participantAId || '', b: c.participantBId || '',
                  aName: c.participantAName || '?', bName: c.participantBName || '?',
                })}
                testID={`team-chat-admin-row-${i}`}
              >
                <View style={[s.avatar, { backgroundColor: theme.colors.modules.mesaj }]}>
                  <Ionicons name="people" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.rowTop}>
                    <Text style={s.rowName} numberOfLines={1}>{c.participantAName} ↔ {c.participantBName}</Text>
                    <Text style={s.rowTime}>{fmtTime(c.lastAt)}</Text>
                  </View>
                  <Text style={s.rowSub} numberOfLines={1}>{c.lastText}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={8}>
          {pane.kind === 'admin-thread' ? (
            <View style={s.adminBanner}>
              <Ionicons name="eye-outline" size={14} color={theme.colors.modules.mesaj} />
              <Text style={s.adminBannerText}>Salt okunur yönetici görünümü</Text>
            </View>
          ) : null}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {thread.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={26} color={theme.colors.textMuted} />
                <Text style={s.emptyText}>Henüz mesaj yok. İlk mesajı gönderin.</Text>
              </View>
            ) : (
              thread.map((m) => {
                const mine = pane.kind === 'thread' ? m.senderId === selfId : false;
                const fromA = pane.kind === 'admin-thread' ? m.senderId === pane.a : false;
                const alignRight = pane.kind === 'thread' ? mine : fromA;
                return (
                  <View key={m.id} style={[s.bubbleRow, alignRight ? s.bubbleRowUser : s.bubbleRowAssistant]}>
                    <View style={[s.bubble, alignRight ? s.bubbleUser : s.bubbleAssistant]}>
                      {pane.kind === 'admin-thread' ? (
                        <Text style={[s.bubbleSender, alignRight && s.bubbleSenderUser]} numberOfLines={1}>{m.senderName}</Text>
                      ) : null}
                      <Text style={[s.bubbleText, alignRight && s.bubbleTextUser]}>{m.text}</Text>
                      <Text style={[s.bubbleTimeText, alignRight && s.bubbleTimeTextUser]}>{fmtTime(m.createdAt)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {pane.kind === 'thread' ? (
            <View style={[s.inputBar, { paddingBottom: (insets.bottom || 12) + 10, marginBottom: kbInset }]}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
                placeholder="Mesaj yazın..."
                placeholderTextColor="#94a3b8"
                style={s.input}
                multiline
                testID="team-chat-input"
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
                onPress={send}
                disabled={!input.trim() || sending}
                testID="team-chat-send"
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 20, gap: 10 },
  emptyText: { fontSize: 13.5, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 19 },
  adminNote: { fontSize: 12.5, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.colors.modules.mesaj,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { fontSize: 14, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  rowSub: { fontSize: 12.5, color: theme.colors.textMuted, flexShrink: 1, marginTop: 2 },
  rowTime: { fontSize: 11, color: theme.colors.textMuted },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: theme.colors.modules.mesaj, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  adminBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.colors.primarySoft,
  },
  adminBannerText: { fontSize: 12, fontWeight: '700', color: theme.colors.modules.mesaj },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, width: '100%' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', flexShrink: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line, borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: '800', color: theme.colors.modules.mesaj, marginBottom: 2 },
  bubbleSenderUser: { color: 'rgba(255,255,255,0.85)' },
  bubbleText: { fontSize: 14.5, color: theme.colors.text, lineHeight: 20, flexShrink: 1 },
  bubbleTextUser: { color: '#fff' },
  bubbleTimeText: { fontSize: 10, color: theme.colors.textMuted, marginTop: 4, textAlign: 'right' },
  bubbleTimeTextUser: { color: 'rgba(255,255,255,0.7)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#F5F7FA',
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14.5,
    color: theme.colors.text,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

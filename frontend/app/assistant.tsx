import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

type ChatMsg = { id: string; role: 'user' | 'assistant'; text: string };

const SUGGESTIONS = [
  'Bu uygulamayı nasıl kullanırım?',
  'Cam balkon için teklif kalemi metni öner',
  'Teklif notları için profesyonel bir taslak yaz',
  'Fiyatlandırma notu nasıl yazılır?',
];

function newId() {
  return 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    const userMsg: ChatMsg = { id: newId(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await api.assistantChat({ message: text });
      const reply = (res && res.reply) || 'Üzgünüm, şu anda bir yanıt oluşturamadım.';
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: reply }]);
    } catch (e: any) {
      let msg = 'Asistan şu anda yanıt veremiyor, lütfen tekrar deneyin.';
      if (e?.status === 503) msg = 'Yapay zeka asistanı henüz yapılandırılmadı.';
      else if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: msg }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="assistant-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>AI Asistan</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="sparkles" size={30} color={theme.colors.primary} />
              </View>
              <Text style={s.emptyTitle}>Size nasıl yardımcı olabilirim?</Text>
              <Text style={s.emptyText}>
                Uygulamayı kullanma konusunda soru sorabilir, ya da bir teklif hazırlarken ürün açıklaması, fiyatlandırma notu veya teklif notu taslağı isteyebilirsiniz.
              </Text>
              <View style={s.suggestWrap}>
                {SUGGESTIONS.map((sug) => (
                  <TouchableOpacity key={sug} style={s.suggestChip} onPress={() => send(sug)} testID="assistant-suggestion">
                    <Text style={s.suggestChipText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) => (
              <View key={m.id} style={[s.bubbleRow, m.role === 'user' ? s.bubbleRowUser : s.bubbleRowAssistant]}>
                <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
                  <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.text}</Text>
                </View>
              </View>
            ))
          )}
          {sending ? (
            <View style={[s.bubbleRow, s.bubbleRowAssistant]}>
              <View style={[s.bubble, s.bubbleAssistant, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={s.bubbleText}>Yazıyor...</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[s.inputBar, { paddingBottom: (insets.bottom || 12) + 10 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey sorun..."
            placeholderTextColor="#94a3b8"
            style={s.input}
            multiline
            testID="assistant-input"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!input.trim() || sending}
            testID="assistant-send"
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 8 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  suggestWrap: { width: '100%', gap: 10 },
  suggestChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suggestChipText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13.5 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14.5, color: theme.colors.text, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
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

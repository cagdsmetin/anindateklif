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
import type { AssistantActionT, SystemTypeDefT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: AssistantActionT | null;
  actionApplied?: boolean;
  actionDismissed?: boolean;
};

const SUGGESTIONS = [
  'Bu uygulamayı nasıl kullanırım?',
  'Cam balkon için teklif kalemi metni öner',
  'Teklif notları için profesyonel bir taslak yaz',
  'Fiyatlandırma notu nasıl yazılır?',
];

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: 'Metin',
  number: 'Sayı',
  select: 'Liste',
  checkbox: 'Onay',
};

function newId() {
  return 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
const uid = () => 'x-' + Date.now() + Math.random().toString(36).slice(2, 8);

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { activeCompany, updateCompany, showToast } = useApp();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

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
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', text: reply, action: res?.action || null }]);
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

  const applyAction = async (msgId: string, action: AssistantActionT) => {
    if (!activeCompany) { showToast('Önce firma seçiniz'); return; }
    setApplyingId(msgId);
    try {
      const sys: SystemTypeDefT = {
        id: uid(),
        name: action.name,
        fields: action.fields.map((f) => ({ id: uid(), label: f.label, type: f.type, options: f.options || [] })),
      };
      const next = [...(activeCompany.sistemTipleri || []), sys];
      await updateCompany(activeCompany.id, { sistemTipleri: next });
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, actionApplied: true } : m)));
      showToast(`'${action.name}' Katalog'a eklendi`);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setApplyingId(null);
    }
  };

  const dismissAction = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, actionDismissed: true } : m)));
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, width: '100%' }}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="sparkles" size={30} color={theme.colors.primary} />
              </View>
              <Text style={s.emptyTitle}>Size nasıl yardımcı olabilirim?</Text>
              <Text style={s.emptyText}>
                Uygulamayı kullanma konusunda soru sorabilir, ya da bir teklif hazırlarken ürün açıklaması, fiyatlandırma notu veya teklif notu taslağı isteyebilirsiniz. Sattığınız ürün/hizmeti ve hangi alanları (ölçü, marka, renk vb.) girdiğinizi anlatırsanız, Katalog yapılandırıcısını sizin için otomatik hazırlayabilirim.
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
              <View key={m.id}>
                <View style={[s.bubbleRow, m.role === 'user' ? s.bubbleRowUser : s.bubbleRowAssistant]}>
                  <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
                    <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.text}</Text>
                  </View>
                </View>
                {m.action && !m.actionDismissed ? (
                  <View style={s.actionCard} testID={`assistant-action-${m.id}`}>
                    {m.actionApplied ? (
                      <View style={s.actionAppliedRow}>
                        <Ionicons name="checkmark-circle" size={18} color={theme.colors.green} />
                        <Text style={s.actionAppliedText} numberOfLines={2}>
                          '{m.action.name}' Katalog'a eklendi
                        </Text>
                        <TouchableOpacity onPress={() => router.push('/(tabs)/catalog')} testID={`assistant-goto-catalog-${m.id}`}>
                          <Text style={s.actionGotoLink}>Katalog'u Aç</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <View style={s.actionHeaderRow}>
                          <Ionicons name="cube-outline" size={16} color={theme.colors.modules.katalog} />
                          <Text style={s.actionTitle} numberOfLines={2}>Katalog Önerisi: {m.action.name}</Text>
                        </View>
                        <View style={s.actionFieldList}>
                          {m.action.fields.map((f, i) => (
                            <View key={`${m.id}-f-${i}`} style={s.actionFieldRow}>
                              <Text style={s.actionFieldLabel} numberOfLines={1}>{f.label}</Text>
                              <View style={s.actionFieldTypeBadge}>
                                <Text style={s.actionFieldTypeText}>{FIELD_TYPE_LABEL[f.type] || f.type}</Text>
                              </View>
                              {f.type === 'select' && f.options.length > 0 ? (
                                <Text style={s.actionFieldOptions} numberOfLines={1}>{f.options.join(', ')}</Text>
                              ) : null}
                            </View>
                          ))}
                        </View>
                        <View style={s.actionBtnRow}>
                          <TouchableOpacity
                            style={s.actionApplyBtn}
                            onPress={() => applyAction(m.id, m.action!)}
                            disabled={applyingId === m.id}
                            testID={`assistant-apply-action-${m.id}`}
                          >
                            {applyingId === m.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="add-circle" size={16} color="#fff" />
                                <Text style={s.actionApplyBtnText}>Katalog'a Ekle</Text>
                              </>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity style={s.actionDismissBtn} onPress={() => dismissAction(m.id)} testID={`assistant-dismiss-action-${m.id}`}>
                            <Text style={s.actionDismissBtnText}>Hayır</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ) : null}
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
  bubbleRow: { flexDirection: 'row', marginBottom: 12, width: '100%' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', flexShrink: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14.5, color: theme.colors.text, lineHeight: 20, flexShrink: 1 },
  bubbleTextUser: { color: '#fff' },
  actionCard: {
    width: '100%',
    marginTop: -4,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: 14,
    padding: 12,
  },
  actionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  actionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  actionFieldList: { gap: 6, marginBottom: 10 },
  actionFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  actionFieldLabel: { fontSize: 12.5, fontWeight: '700', color: theme.colors.text, flexShrink: 1 },
  actionFieldTypeBadge: { backgroundColor: theme.colors.surfaceSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  actionFieldTypeText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  actionFieldOptions: { fontSize: 11, color: theme.colors.textMuted, flexShrink: 1 },
  actionBtnRow: { flexDirection: 'row', gap: 8 },
  actionApplyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.modules.katalog,
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionApplyBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  actionDismissBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark },
  actionDismissBtnText: { color: theme.colors.textMuted, fontWeight: '700', fontSize: 12.5 },
  actionAppliedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionAppliedText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  actionGotoLink: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
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

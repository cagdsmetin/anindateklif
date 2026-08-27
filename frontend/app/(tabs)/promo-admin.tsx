import React, { useCallback, useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, PromoCodeT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function PromoAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [codes, setCodes] = useState<PromoCodeT[]>([]);
  const [loading, setLoading] = useState(true);
  const [durationDays, setDurationDays] = useState('90');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastCreated, setLastCreated] = useState<PromoCodeT[]>([]);
  const [copiedCode, setCopiedCode] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listPromoCodes();
      setCodes(res || []);
    } catch {
      setError('Kod listesi alınamadı');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onGenerate = async () => {
    if (busy) return;
    const n = Math.max(1, Math.min(100, parseInt(count, 10) || 1));
    const d = Math.max(1, parseInt(durationDays, 10) || 90);
    setError('');
    setBusy(true);
    setLastCreated([]);
    try {
      const res = await api.createPromoCodes({ count: n, duration_days: d, note: note.trim() || undefined });
      setLastCreated(res || []);
      setNote('');
      await load();
    } catch (e: any) {
      let msg = 'Kod oluşturulamadı';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async (code: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(''), 2000);
      } catch {}
    }
  };

  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Hediye Kodu</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu sayfayı görüntüleme yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="promo-admin-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Hediye Kodu</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={s.sectionLabel}>Yeni Kod Üret</Text>
            <View style={s.card}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Süre (gün)</Text>
                  <TextInput
                    style={s.input}
                    value={durationDays}
                    onChangeText={setDurationDays}
                    keyboardType="number-pad"
                    testID="promo-duration-input"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Adet</Text>
                  <TextInput
                    style={s.input}
                    value={count}
                    onChangeText={setCount}
                    keyboardType="number-pad"
                    testID="promo-count-input"
                  />
                </View>
              </View>
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Not (opsiyonel)</Text>
              <TextInput
                style={s.input}
                placeholder="ör. Ahmet Bey'e hediye"
                placeholderTextColor="#94a3b8"
                value={note}
                onChangeText={setNote}
                testID="promo-note-input"
              />

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onGenerate} disabled={busy} testID="promo-generate-submit">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Kod Üret</Text>}
              </TouchableOpacity>

              {lastCreated.length > 0 ? (
                <View style={s.linkBox}>
                  <Text style={s.linkHint}>Oluşturulan {lastCreated.length} kod — müşterine paylaş:</Text>
                  {lastCreated.map((c) => (
                    <View key={c.code} style={s.newCodeRow}>
                      <Text style={s.newCodeText}>{c.code}</Text>
                      <TouchableOpacity style={s.copyBtn} onPress={() => onCopy(c.code)} testID={`promo-copy-${c.code}`}>
                        <Ionicons name={copiedCode === c.code ? 'checkmark' : 'copy-outline'} size={14} color={theme.colors.primary} />
                        <Text style={s.copyBtnText}>{copiedCode === c.code ? 'Kopyalandı' : 'Kopyala'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>Tüm Kodlar ({codes.length})</Text>
            {codes.length === 0 ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Henüz kod oluşturulmadı.</Text>
            ) : (
              codes.map((c) => (
                <View key={c.code} style={s.codeRow} testID={`promo-row-${c.code}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.codeText} numberOfLines={1}>{c.code}</Text>
                    <Text style={s.codeMeta} numberOfLines={1}>
                      {c.duration_days} gün{c.note ? ` · ${c.note}` : ''} · {fmtDate(c.created_at)}
                    </Text>
                    {c.used ? (
                      <Text style={s.codeUsedBy} numberOfLines={1}>Kullanıldı: {c.used_by_email} · {fmtDate(c.used_at)}</Text>
                    ) : null}
                  </View>
                  <View style={[s.badge, c.used ? s.badgeUsed : s.badgeFree]}>
                    <Text style={[s.badgeText, c.used ? s.badgeTextUsed : s.badgeTextFree]}>{c.used ? 'Kullanıldı' : 'Aktif'}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: theme.colors.text,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  ctaText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  linkBox: { marginTop: 14, backgroundColor: theme.colors.primarySoft, borderRadius: 12, padding: 12 },
  linkHint: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 8 },
  newCodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6 },
  newCodeText: { fontSize: 15, fontWeight: '900', color: theme.colors.text, letterSpacing: 1.5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 12, fontWeight: '800', color: theme.colors.primary },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 12,
    marginBottom: 8,
  },
  codeText: { fontSize: 14, fontWeight: '900', color: theme.colors.text, letterSpacing: 1 },
  codeMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  codeUsedBy: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 10 },
  badgeFree: { backgroundColor: theme.colors.greenSoft },
  badgeUsed: { backgroundColor: '#F1F5F9' },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  badgeTextFree: { color: '#166534' },
  badgeTextUsed: { color: theme.colors.textMuted },
});

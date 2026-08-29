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
import { api, LeadSearchRequestT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso || '';
  }
}

// Her satır: Firma Adı | Bölge | Kategori | Telefon
function parseBulkText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      return {
        firma: parts[0] || '',
        bolge: parts[1] || '',
        kategori: parts[2] || '',
        telefon: parts[3] || '',
      };
    })
    .filter((it) => !!it.firma);
}

export default function LeadAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [requests, setRequests] = useState<LeadSearchRequestT[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeadSearchRequestT | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastAddedCount, setLastAddedCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.adminListLeadSearchRequests();
      setRequests(res || []);
    } catch {
      setError('Talep listesi alınamadı');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const previewItems = parseBulkText(bulkText);

  const onSubmitBulk = async () => {
    if (!selected || busy) return;
    if (previewItems.length === 0) {
      setError('En az bir firma satırı gir (Firma | Bölge | Kategori | Telefon)');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await api.adminBulkAddLeads(selected.companyId, previewItems);
      setLastAddedCount(res?.length || 0);
      setBulkText('');
      await api.adminUpdateLeadSearchRequest(selected.id, 'Tamamlandı');
      await load();
      setSelected(null);
    } catch (e: any) {
      let msg = 'Eklenemedi';
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

  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Firma Arama Talepleri</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu sayfayı görüntüleme yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pending = requests.filter((r) => r.durum !== 'Tamamlandı');
  const done = requests.filter((r) => r.durum === 'Tamamlandı');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => (selected ? setSelected(null) : router.back())} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="lead-admin-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Firma Arama Talepleri</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : selected ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <View style={s.card}>
              <Text style={s.fieldLabel}>FİRMA</Text>
              <Text style={s.reqTitle}>{selected.companyName}</Text>
              <Text style={s.fieldLabel}>SEKTÖR / BÖLGE</Text>
              <Text style={s.reqTitle}>{selected.sektor}{selected.bolge ? ` · ${selected.bolge}` : ''}</Text>
              {!!selected.aciklama && (
                <>
                  <Text style={s.fieldLabel}>AÇIKLAMA</Text>
                  <Text style={s.reqDesc}>{selected.aciklama}</Text>
                </>
              )}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>Bulunan Firmaları Yapıştır</Text>
            <Text style={s.hint}>Her satıra bir firma: Firma Adı | Bölge | Kategori | Telefon</Text>
            <TextInput
              style={s.textarea}
              multiline
              value={bulkText}
              onChangeText={setBulkText}
              placeholder={'QaraQalem İç Mimarlık | Ataşehir | Mimar | +905343003040\nA Proje Yapı | Şişli | Mimar | +905321680015'}
              placeholderTextColor="#94a3b8"
              testID="lead-admin-bulk-input"
            />
            <Text style={s.hint}>{previewItems.length} firma algılandı</Text>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onSubmitBulk} disabled={busy} testID="lead-admin-submit">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Listeye Ekle ve Talebi Kapat</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {lastAddedCount > 0 && (
            <View style={s.successBox}>
              <Text style={s.successText}>{lastAddedCount} firma eklendi ✓</Text>
            </View>
          )}

          <Text style={s.sectionLabel}>Bekleyen Talepler ({pending.length})</Text>
          {pending.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 }}>Bekleyen talep yok.</Text>
          ) : (
            pending.map((r) => (
              <TouchableOpacity key={r.id} style={s.reqRow} onPress={() => setSelected(r)} testID={`lead-admin-req-${r.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reqRowTitle} numberOfLines={1}>{r.companyName} — {r.sektor}{r.bolge ? ` · ${r.bolge}` : ''}</Text>
                  <Text style={s.reqRowMeta} numberOfLines={1}>{fmtDate(r.createdAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )}

          <Text style={[s.sectionLabel, { marginTop: 22 }]}>Tamamlanmış ({done.length})</Text>
          {done.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Henüz tamamlanan talep yok.</Text>
          ) : (
            done.map((r) => (
              <View key={r.id} style={[s.reqRow, { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reqRowTitle} numberOfLines={1}>{r.companyName} — {r.sektor}{r.bolge ? ` · ${r.bolge}` : ''}</Text>
                  <Text style={s.reqRowMeta} numberOfLines={1}>{fmtDate(r.createdAt)}</Text>
                </View>
                <View style={s.badgeDone}><Text style={s.badgeDoneText}>Tamamlandı</Text></View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, marginTop: 10, marginBottom: 4, letterSpacing: 0.3 },
  reqTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  reqDesc: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  hint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, marginBottom: 4 },
  textarea: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: theme.colors.text, minHeight: 160, textAlignVertical: 'top', marginTop: 10,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  cta: { backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  ctaText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  successBox: { backgroundColor: theme.colors.greenSoft, borderRadius: 10, padding: 12, marginBottom: 16 },
  successText: { color: '#166534', fontWeight: '800', fontSize: 13 },
  reqRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 8 },
  reqRowTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  reqRowMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 3 },
  badgeDone: { backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeDoneText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted },
});

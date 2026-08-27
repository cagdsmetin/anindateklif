import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { QuoteT } from '@/src/lib/api';

const RETENTION_DAYS = 30;

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym} ${s}`;
}

function daysLeft(deletedAt?: string | null): number {
  if (!deletedAt) return RETENTION_DAYS;
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(deleted)) return RETENTION_DAYS;
  const elapsedDays = (Date.now() - deleted) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsedDays));
}

export default function TrashScreen() {
  const router = useRouter();
  const { activeCompany, reloadQuotes, showToast } = useApp();

  const [items, setItems] = useState<QuoteT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await api.listTrashedQuotes(activeCompany.id);
      setItems((res as QuoteT[]) || []);
      setError('');
    } catch (e: any) {
      setError('Silinenler listesi alınamadı');
    }
  }, [activeCompany]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onRestore = async (id: string) => {
    if (restoringId) return;
    setRestoringId(id);
    try {
      await api.restoreQuote(id);
      setItems((prev) => prev.filter((q) => q.id !== id));
      await reloadQuotes();
      showToast('Teklif geri alındı');
    } catch (e: any) {
      showToast('Geri alınamadı, tekrar deneyin');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="trash-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Çöp Kutusu</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={s.infoNote}>
            Silinen teklifler {RETENTION_DAYS} gün boyunca burada saklanır, süre dolunca kalıcı olarak silinir.
          </Text>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {items.length === 0 && !error ? (
            <View style={s.emptyWrap}>
              <Ionicons name="trash-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyText}>Çöp kutusu boş</Text>
            </View>
          ) : (
            items.map((q) => {
              const left = daysLeft(q.deletedAt);
              return (
                <View key={q.id} style={s.card} testID={`trash-item-${q.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{q.musFirma || q.musYetkili || 'Müşteri'}</Text>
                    <Text style={s.cardSub} numberOfLines={1}>
                      Teklif No: {q.teklifNo} · {fmt(q.genelToplam, q.paraBirimi)}
                    </Text>
                    <Text style={s.cardMeta}>
                      {left > 0 ? `${left} gün sonra kalıcı olarak silinecek` : 'Bugün kalıcı olarak silinecek'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.restoreBtn, restoringId === q.id && { opacity: 0.6 }]}
                    onPress={() => onRestore(q.id)}
                    disabled={restoringId === q.id}
                    testID={`restore-quote-${q.id}`}
                  >
                    {restoringId === q.id ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="refresh-outline" size={15} color={theme.colors.primary} />
                        <Text style={s.restoreText}>Geri Al</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
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
  infoNote: { fontSize: 12.5, color: theme.colors.textMuted, marginBottom: 16, lineHeight: 17 },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13.5, color: theme.colors.textMuted, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 14,
    marginBottom: 10,
    ...theme.shadow.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 3 },
  cardSub: { fontSize: 12, color: theme.colors.textSoft, marginBottom: 3 },
  cardMeta: { fontSize: 11, color: theme.colors.textMuted },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 10,
  },
  restoreText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
});

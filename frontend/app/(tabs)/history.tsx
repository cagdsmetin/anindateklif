import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { theme, statusColor } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { QuoteT } from '@/src/lib/api';
import { buildQuotePdfHtml } from '@/src/lib/pdf';

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${s} ${sym}`;
}

const STATUSES = ['Beklemede', 'Görüldü', 'Onaylandı', 'Reddedildi'];

export default function HistoryScreen() {
  const { quotes, deleteQuote, updateQuoteStatus, activeCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('Tümü');
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = quotes;
    if (filter !== 'Tümü') list = list.filter((qq) => qq.durum === filter);
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter(
        (x) =>
          x.musFirma.toLowerCase().includes(qq) ||
          x.teklifNo.toLowerCase().includes(qq) ||
          x.projeAdi.toLowerCase().includes(qq)
      );
    }
    return list;
  }, [quotes, filter, q]);

  const totalValue = quotes.reduce((a, q) => a + (q.durum === 'Onaylandı' ? q.genelToplam : 0), 0);

  const openEdit = (id: string) => {
    router.push({ pathname: '/(tabs)/', params: { quoteId: id } });
  };

  const doSharePdf = async (quote: QuoteT) => {
    if (!activeCompany) return;
    try {
      const html = buildQuotePdfHtml(activeCompany, quote);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const avail = await Sharing.isAvailableAsync();
      if (avail) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Teklifiniz ekte yer almaktadır' });
      } else {
        showToast('Paylaşım desteklenmiyor');
      }
    } catch (e: any) {
      showToast('PDF hatası: ' + (e?.message || ''));
    }
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Geçmiş" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Geçmiş Teklifler" />

      <View style={{ padding: 14, paddingBottom: 6 }}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Toplam Teklif</Text>
            <Text style={s.statValue}>{quotes.length}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' }]}>
            <Text style={[s.statLabel, { color: '#166534' }]}>Onaylanan Toplam</Text>
            <Text style={[s.statValue, { color: '#166534', fontSize: 14 }]} numberOfLines={1}>
              {fmt(totalValue, 'USD')}
            </Text>
          </View>
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="history-search"
            style={s.searchInput}
            placeholder="Firma, teklif no, proje ara..."
            placeholderTextColor="#94a3b8"
            value={q}
            onChangeText={setQ}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {['Tümü', ...STATUSES].map((st) => (
          <TouchableOpacity
            key={st}
            testID={`filter-${st}`}
            style={[s.filterChip, filter === st && s.filterChipActive]}
            onPress={() => setFilter(st)}
          >
            <Text style={[s.filterText, filter === st && s.filterTextActive]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Kayıtlı teklif yok. İlk teklifinizi Teklif sekmesinden oluşturun.</Text>
          </View>
        ) : (
          filtered.map((quote) => {
            const c = statusColor(quote.durum);
            return (
              <View key={quote.id} style={s.card} testID={`history-card-${quote.id}`}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.hNo}>{quote.teklifNo}</Text>
                    <Text style={s.hFirma} numberOfLines={1}>{quote.musFirma}</Text>
                    {quote.projeAdi ? <Text style={s.hProje} numberOfLines={1}>{quote.projeAdi}</Text> : null}
                    <Text style={s.hDate}>{quote.tarih} • {quote.items.length} kalem</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.hAmount} numberOfLines={1}>{fmt(quote.genelToplam, quote.paraBirimi)}</Text>
                    <TouchableOpacity
                      testID={`status-${quote.id}`}
                      onPress={() => setStatusMenuFor(quote.id)}
                      style={[s.statusBadge, { backgroundColor: c.bg, borderColor: c.border }]}
                    >
                      <Text style={[s.statusText, { color: c.text }]}>{quote.durum}</Text>
                      <Ionicons name="chevron-down" size={11} color={c.text} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.actionBar}>
                  <TouchableOpacity style={s.actBtn} onPress={() => openEdit(quote.id)} testID={`edit-quote-${quote.id}`}>
                    <Ionicons name="pencil-outline" size={14} color={theme.colors.accent} />
                    <Text style={s.actText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={() => doSharePdf(quote)} testID={`pdf-${quote.id}`}>
                    <Ionicons name="document-text-outline" size={14} color={theme.colors.accent} />
                    <Text style={s.actText}>PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actBtn, { backgroundColor: '#dcfce7' }]}
                    onPress={() => doSharePdf(quote)}
                    testID={`whatsapp-${quote.id}`}
                  >
                    <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                    <Text style={[s.actText, { color: '#16a34a' }]}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actBtn, { backgroundColor: theme.colors.redSoft }]}
                    onPress={() => deleteQuote(quote.id)}
                    testID={`delete-quote-${quote.id}`}
                  >
                    <Ionicons name="trash-outline" size={14} color={theme.colors.red} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={s.menu}>
            <Text style={s.menuTitle}>Durum Seç</Text>
            {STATUSES.map((st) => {
              const cc = statusColor(st);
              return (
                <TouchableOpacity
                  key={st}
                  testID={`set-status-${st}`}
                  style={[s.menuItem, { backgroundColor: cc.bg, borderColor: cc.border }]}
                  onPress={async () => {
                    if (statusMenuFor) {
                      await updateQuoteStatus(statusMenuFor, st);
                      showToast('Durum güncellendi');
                    }
                    setStatusMenuFor(null);
                  }}
                >
                  <Text style={[s.menuItemText, { color: cc.text }]}>{st}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  filterChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  filterChipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  filterText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  filterTextActive: { color: '#fff' },
  emptyBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.lineDark,
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', gap: 10 },
  hNo: { fontSize: 10.5, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.3 },
  hFirma: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  hProje: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  hDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  hAmount: { fontSize: 14, fontWeight: '800', color: theme.colors.accent },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
  },
  statusText: { fontSize: 10.5, fontWeight: '700' },
  actionBar: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  actBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  actText: { fontSize: 11, fontWeight: '700', color: theme.colors.accent },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  menu: { backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 8 },
  menuTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
  menuItem: { padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  menuItemText: { fontSize: 13, fontWeight: '700' },
});

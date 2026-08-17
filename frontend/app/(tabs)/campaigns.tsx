import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { CampaignT } from '@/src/lib/api';

function trDateTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '-';
  }
}

export default function CampaignsScreen() {
  const { campaigns, customers, activeCompany, deleteCampaign } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const audienceCount = useMemo(
    () => customers.filter((c) => (c.telefon || '').trim().length > 0).length,
    [customers]
  );

  const openAdd = () => router.push('/campaign-add' as any);
  const openDetail = (id: string) => router.push({ pathname: '/campaign-detail', params: { id } } as any);

  const sentCount = (camp: CampaignT) =>
    Object.values(camp.sends || {}).filter((v) => v.sent).length;

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Kampanya" />
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Kampanya" />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 90 }} showsVerticalScrollIndicator={false}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Toplam Kampanya</Text>
            <Text style={s.statValue}>{campaigns.length}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>Telefonlu Müşteri</Text>
            <Text style={s.statValue}>{audienceCount}</Text>
          </View>
        </View>

        {campaigns.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="megaphone-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Henüz kampanya oluşturmadınız.</Text>
          </View>
        ) : campaigns.map((camp) => {
          const sent = sentCount(camp);
          const total = audienceCount;
          const pct = total > 0 ? Math.min(1, sent / total) : 0;
          return (
            <TouchableOpacity
              key={camp.id}
              style={s.card}
              activeOpacity={0.75}
              onPress={() => openDetail(camp.id)}
              testID={`campaign-card-${camp.id}`}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.hTitle} numberOfLines={1}>{camp.baslik || 'İsimsiz Kampanya'}</Text>
                  <Text style={s.hDate}>{trDateTime(camp.createdAt)}</Text>
                </View>
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => deleteCampaign(camp.id)}
                  testID={`campaign-delete-${camp.id}`}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
                </TouchableOpacity>
              </View>

              {camp.mesaj ? (
                <Text style={s.preview} numberOfLines={2}>{camp.mesaj}</Text>
              ) : null}

              <View style={s.progressRow}>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
                </View>
                <Text style={s.progressText}>{sent}/{total} müşteri</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 18 }]} onPress={openAdd} testID="campaign-add-fab">
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  statLabel: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 20, fontWeight: '900', color: theme.colors.navy, marginTop: 2 },
  emptyBox: { marginTop: 24, backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 30, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 10, ...theme.shadow.sm },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  hTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.navy },
  hDate: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 4 },
  deleteBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  preview: { fontSize: 12, color: theme.colors.textSoft, marginTop: 8, lineHeight: 17 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  progressText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted },
  fab: { position: 'absolute', right: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadow.lg },
});

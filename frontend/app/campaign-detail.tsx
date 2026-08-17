import React, { useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { normalizePhoneForWhatsApp } from '@/src/lib/whatsapp';
import { CustomerT } from '@/src/lib/api';

const AUDIENCE_FILTERS = ['Tümü'];

function renderCampaignMessage(mesaj: string, musteri: string, firma: string): string {
  return mesaj
    .split('{musteri}').join(musteri || 'Değerli Müşterimiz')
    .split('{firma}').join(firma || '');
}

export default function CampaignDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { campaigns, customers, activeCompany, markCampaignSent, showToast, toast } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const campaignId = typeof params.id === 'string' ? params.id : undefined;

  const campaign = useMemo(
    () => (campaignId ? campaigns.find((c) => c.id === campaignId) : undefined),
    [campaignId, campaigns]
  );

  const audienceCustomers = useMemo(
    () => customers.filter((c) => (c.telefon || '').trim().length > 0),
    [customers]
  );

  const [audienceFilter, setAudienceFilter] = useState('Tümü');
  const [previewCustomerId, setPreviewCustomerId] = useState<string | null>(
    audienceCustomers[0]?.id || null
  );

  const previewCustomer: CustomerT | undefined = useMemo(
    () => audienceCustomers.find((c) => c.id === previewCustomerId) || audienceCustomers[0],
    [audienceCustomers, previewCustomerId]
  );

  const firmaAdi = activeCompany?.sirketAdi || '';

  const sends = campaign?.sends || {};
  const sentCount = Object.values(sends).filter((v) => v.sent).length;
  const total = audienceCustomers.length;
  const pct = total > 0 ? Math.min(1, sentCount / total) : 0;

  const openWhatsApp = (customer: CustomerT) => {
    const musteri = customer.yetkili || customer.firma || 'Değerli Müşterimiz';
    const text = renderCampaignMessage(campaign?.mesaj || '', musteri, firmaAdi);
    const cleaned = normalizePhoneForWhatsApp(customer.telefon || '');
    if (!cleaned) {
      showToast('Geçerli bir telefon numarası yok');
      return;
    }
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => showToast('WhatsApp açılamadı'));
  };

  const markSent = async (customer: CustomerT) => {
    if (!campaign) return;
    await markCampaignSent(campaign.id, customer.id);
    showToast('Gönderildi olarak işaretlendi');
  };

  if (!campaign) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Kampanya</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.empty}><Text style={s.emptyText}>Kampanya bulunamadı</Text></View>
      </SafeAreaView>
    );
  }

  const previewText = previewCustomer
    ? renderCampaignMessage(campaign.mesaj, previewCustomer.yetkili || previewCustomer.firma, firmaAdi)
    : renderCampaignMessage(campaign.mesaj, 'Değerli Müşterimiz', firmaAdi);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {toast ? (
        <View style={s.toast} testID="toast-msg" pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{campaign.baslik}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.progressCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.progressLabel}>Gönderim Durumu</Text>
            <Text style={s.progressCount}>{sentCount}/{total} müşteri</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
          </View>
        </View>

        <Text style={s.sectionTitle}>Mesaj Önizleme</Text>
        <View style={s.bubbleWrap}>
          <View style={s.bubble}>
            <Text style={s.bubbleText}>{previewText}</Text>
          </View>
          {previewCustomer ? (
            <Text style={s.bubbleCaption}>
              {previewCustomer.yetkili || previewCustomer.firma} için önizleme
            </Text>
          ) : (
            <Text style={s.bubbleCaption}>Telefonlu müşteri bulunamadı</Text>
          )}
        </View>

        <Text style={s.sectionTitle}>Hedef Kitle</Text>
        <View style={s.filterRow}>
          {AUDIENCE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, audienceFilter === f && s.filterChipActive]}
              onPress={() => setAudienceFilter(f)}
              testID={`campdetail-filter-${f}`}
            >
              <Text style={[s.filterText, audienceFilter === f && s.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionTitle}>Müşteriler ({audienceCustomers.length})</Text>
        {audienceCustomers.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="people-outline" size={26} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Telefon numarası kayıtlı müşteri yok.</Text>
          </View>
        ) : audienceCustomers.map((c) => {
          const send = sends[c.id];
          const isSent = !!send?.sent;
          return (
            <TouchableOpacity
              key={c.id}
              style={[s.custRow, previewCustomerId === c.id && s.custRowActive]}
              onPress={() => setPreviewCustomerId(c.id)}
              activeOpacity={0.8}
              testID={`campdetail-customer-${c.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.custName} numberOfLines={1}>{c.yetkili || c.firma}</Text>
                <Text style={s.custSub} numberOfLines={1}>{c.firma} · {c.telefon}</Text>
              </View>
              <View style={s.custActions}>
                <TouchableOpacity
                  style={s.waBtn}
                  onPress={() => openWhatsApp(c)}
                  testID={`campdetail-wa-${c.id}`}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
                  <Text style={s.waBtnText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.sentBtn, isSent && s.sentBtnDone]}
                  onPress={() => markSent(c)}
                  disabled={isSent}
                  testID={`campdetail-sent-${c.id}`}
                >
                  <Ionicons name={isSent ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={isSent ? '#fff' : theme.colors.primary} />
                  <Text style={[s.sentBtnText, isSent && s.sentBtnTextDone]}>{isSent ? 'Gönderildi' : 'Gönderdim'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  progressCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 20, ...theme.shadow.sm },
  progressLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.navy },
  progressCount: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10, marginTop: 4 },
  bubbleWrap: { marginBottom: 20 },
  bubble: {
    backgroundColor: '#DCF8C6',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    padding: 14,
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  bubbleText: { fontSize: 13.5, color: '#111b21', lineHeight: 19 },
  bubbleCaption: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 6, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  filterChip: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  filterTextActive: { color: '#fff' },
  emptyBox: { backgroundColor: '#fff', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 14, padding: 26, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  custRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line, marginBottom: 8, gap: 10 },
  custRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  custName: { fontSize: 13, fontWeight: '800', color: theme.colors.navy },
  custSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  custActions: { flexDirection: 'row', gap: 6 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: '#dcfce7', borderRadius: 8 },
  waBtnText: { fontSize: 10.5, fontWeight: '800', color: '#16a34a' },
  sentBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: theme.colors.primarySoft, borderRadius: 8 },
  sentBtnDone: { backgroundColor: theme.colors.primary },
  sentBtnText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.primary },
  sentBtnTextDone: { color: '#fff' },
  toast: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: theme.colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    zIndex: 9999,
    gap: 6,
    elevation: 12,
    ...theme.shadow.md,
  },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});

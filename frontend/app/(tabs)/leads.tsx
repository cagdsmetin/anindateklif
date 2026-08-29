import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
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
import { useApp } from '@/src/state/AppContext';
import { api, LeadCompanyT, LeadSearchRequestT } from '@/src/lib/api';
import { normalizePhoneForWhatsApp } from '@/src/lib/whatsapp';

const DURUM_OPTIONS = ['Aranmadı', 'Arandı', 'Cevap Yok', 'Olumlu Dönüş', 'Olumsuz Dönüş', 'Kapandı'];
const DURUM_COLORS: Record<string, string> = {
  'Aranmadı': '#94a3b8',
  'Arandı': '#3b82f6',
  'Cevap Yok': '#f59e0b',
  'Olumlu Dönüş': '#16a34a',
  'Olumsuz Dönüş': '#ef4444',
  'Kapandı': '#0f172a',
};

type Tab = 'bugun' | 'tumu' | 'talep';

export default function LeadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast } = useApp();

  const [tab, setTab] = useState<Tab>('bugun');
  const [loading, setLoading] = useState(false);
  const [todayLeads, setTodayLeads] = useState<LeadCompanyT[]>([]);
  const [allLeads, setAllLeads] = useState<LeadCompanyT[]>([]);
  const [requests, setRequests] = useState<LeadSearchRequestT[]>([]);
  const [dailyCount, setDailyCount] = useState('10');
  const [savingDaily, setSavingDaily] = useState(false);

  const [reqSektor, setReqSektor] = useState('');
  const [reqBolge, setReqBolge] = useState('');
  const [reqAciklama, setReqAciklama] = useState('');
  const [sendingReq, setSendingReq] = useState(false);

  const [notesFor, setNotesFor] = useState<LeadCompanyT | null>(null);
  const [noteText, setNoteText] = useState('');

  const companyId = activeCompany?.id;

  const [autoTabDone, setAutoTabDone] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [today, all, reqs] = await Promise.all([
        api.listLeadsToday(companyId),
        api.listLeads(companyId),
        api.listLeadSearchRequests(companyId),
      ]);
      setTodayLeads(today);
      setAllLeads(all);
      setRequests(reqs);
      setDailyCount(String(activeCompany?.leadDailyCount || 10));
      // İlk kez giren ve hiç firması/talebi olmayan kullanıcıyı doğrudan
      // "Yeni Talep" sekmesine yönlendir — boş bir liste görüp ne yapacağını
      // anlayamamasın diye.
      if (!autoTabDone) {
        setAutoTabDone(true);
        if (all.length === 0 && reqs.length === 0) setTab('talep');
      }
    } catch (e: any) {
      showToast('Yüklenemedi: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const stats = useMemo(() => {
    const total = allLeads.length;
    const aranan = allLeads.filter((l) => l.durum !== 'Aranmadı').length;
    const olumlu = allLeads.filter((l) => l.durum === 'Olumlu Dönüş' || l.durum === 'Kapandı').length;
    const kapanan = allLeads.filter((l) => l.durum === 'Kapandı').length;
    return { total, aranan, olumlu, kapanan };
  }, [allLeads]);

  const updateStatus = async (lead: LeadCompanyT, durum: string) => {
    try {
      await api.updateLead(lead.id, { durum });
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const removeLead = async (lead: LeadCompanyT) => {
    try {
      await api.deleteLead(lead.id);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const openWhatsApp = (lead: LeadCompanyT) => {
    const cleaned = normalizePhoneForWhatsApp(lead.telefon || '');
    if (!cleaned) {
      showToast('Geçerli bir telefon numarası yok');
      return;
    }
    const text = `Merhaba, ${activeCompany?.sirketAdi || 'firmamız'} olarak sizinle iş birliği yapmak istiyoruz.`;
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => showToast('WhatsApp açılamadı'));
  };

  const saveDailyCount = async () => {
    if (!companyId) return;
    const n = parseInt(dailyCount, 10);
    if (!n || n < 1) {
      showToast('Geçerli bir sayı gir');
      return;
    }
    setSavingDaily(true);
    try {
      await api.setLeadDailyCount(companyId, n);
      showToast('Kaydedildi');
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSavingDaily(false);
    }
  };

  const submitRequest = async () => {
    if (!companyId) return;
    if (!reqSektor.trim()) {
      showToast('Hangi sektörde firma aradığını yaz');
      return;
    }
    setSendingReq(true);
    try {
      await api.createLeadSearchRequest(companyId, reqSektor.trim(), reqBolge.trim(), reqAciklama.trim());
      setReqSektor('');
      setReqBolge('');
      setReqAciklama('');
      showToast('Talebin alındı, araştırılıp listen doldurulacak');
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSendingReq(false);
    }
  };

  const openNotes = (lead: LeadCompanyT) => {
    setNotesFor(lead);
    setNoteText(lead.notlar || '');
  };

  const saveNote = async () => {
    if (!notesFor) return;
    try {
      await api.updateLead(notesFor.id, { notlar: noteText });
      setNotesFor(null);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Firma Arama Takibi</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  const renderLeadRow = (lead: LeadCompanyT) => (
    <View key={lead.id} style={s.leadCard} testID={`lead-${lead.id}`}>
      <View style={{ flex: 1 }}>
        <Text style={s.leadName} numberOfLines={1}>{lead.firma}</Text>
        <Text style={s.leadSub} numberOfLines={1}>
          {lead.bolge || '-'} · {lead.kategori || '-'} · {lead.telefon || 'telefon yok'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {DURUM_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[s.durumChip, { borderColor: DURUM_COLORS[d] }, lead.durum === d && { backgroundColor: DURUM_COLORS[d] }]}
              onPress={() => updateStatus(lead, d)}
            >
              <Text style={[s.durumChipText, { color: lead.durum === d ? '#fff' : DURUM_COLORS[d] }]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {!!lead.notlar && <Text style={s.leadNote} numberOfLines={2}>📝 {lead.notlar}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <TouchableOpacity style={s.iconBtn} onPress={() => openNotes(lead)}>
          <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.waBtn} onPress={() => openWhatsApp(lead)}>
          <Ionicons name="logo-whatsapp" size={14} color="#16a34a" />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => removeLead(lead)}>
          <Ionicons name="trash-outline" size={16} color={theme.colors.red} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Firma Arama Takibi</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.statGrid}>
          <View style={s.statCard}><Text style={s.statValue}>{stats.total}</Text><Text style={s.statLabel}>TOPLAM FİRMA</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.aranan}</Text><Text style={s.statLabel}>ARANAN</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.olumlu}</Text><Text style={s.statLabel}>OLUMLU DÖNÜŞ</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.kapanan}</Text><Text style={s.statLabel}>KAPANAN İŞ</Text></View>
        </View>

        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tabBtn, tab === 'bugun' && s.tabBtnActive]} onPress={() => setTab('bugun')}>
            <Text style={[s.tabText, tab === 'bugun' && s.tabTextActive]}>Bugün Aranacaklar ({todayLeads.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'tumu' && s.tabBtnActive]} onPress={() => setTab('tumu')}>
            <Text style={[s.tabText, tab === 'tumu' && s.tabTextActive]}>Tüm Firmalar ({allLeads.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, tab === 'talep' && s.tabBtnActive]} onPress={() => setTab('talep')}>
            <Text style={[s.tabText, tab === 'talep' && s.tabTextActive]}>Yeni Talep</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator style={{ marginVertical: 20 }} color={theme.colors.primary} />}

        {!loading && tab === 'bugun' && (
          <>
            <View style={s.dailyBox}>
              <Text style={s.dailyLabel}>Günlük kaç firma eklensin?</Text>
              <TextInput
                style={s.dailyInput}
                value={dailyCount}
                onChangeText={setDailyCount}
                keyboardType="number-pad"
                testID="lead-daily-count-input"
              />
              <TouchableOpacity style={s.dailySaveBtn} onPress={saveDailyCount} disabled={savingDaily}>
                <Text style={s.dailySaveBtnText}>{savingDaily ? '...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.helperTinyMuted}>
              Aramadığın veya "Cevap Yok" işaretlediğin firmalar bir sonraki listede yine karşına çıkar, kaybolmaz.
            </Text>
            {todayLeads.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="checkmark-done-circle-outline" size={26} color={theme.colors.textMuted} />
                <Text style={s.emptyTextBox}>Bugün aranacak firma yok.</Text>
                <TouchableOpacity style={s.ctaTalepBtn} onPress={() => setTab('talep')} testID="lead-empty-cta-talep">
                  <Ionicons name="add-circle" size={16} color="#fff" />
                  <Text style={s.ctaTalepBtnText}>Aranacak Firmaları Bul</Text>
                </TouchableOpacity>
              </View>
            ) : (
              todayLeads.map(renderLeadRow)
            )}
          </>
        )}

        {!loading && tab === 'tumu' && (
          allLeads.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="business-outline" size={26} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>Henüz firma eklenmedi.</Text>
              <TouchableOpacity style={s.ctaTalepBtn} onPress={() => setTab('talep')} testID="lead-empty-cta-talep-2">
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={s.ctaTalepBtnText}>Aranacak Firmaları Bul</Text>
              </TouchableOpacity>
            </View>
          ) : (
            allLeads.map(renderLeadRow)
          )
        )}

        {!loading && tab === 'talep' && (
          <View>
            <Text style={s.sectionTitle}>Aranacak Firmaları Bul</Text>
            <Text style={s.helperTinyMuted}>
              Hangi sektörde ve hangi bölgede firma aramamızı istiyorsan yaz — araştırıp bulduğumuz firmaları listene ekleyeceğiz.
            </Text>
            <TextInput
              style={s.input}
              placeholder="Sektör (örn: Pergola, Cam Balkon, Peyzaj Mimarlığı)"
              placeholderTextColor="#94a3b8"
              value={reqSektor}
              onChangeText={setReqSektor}
              testID="lead-req-sektor"
            />
            <TextInput
              style={s.input}
              placeholder="Bölge (örn: İstanbul Anadolu Yakası)"
              placeholderTextColor="#94a3b8"
              value={reqBolge}
              onChangeText={setReqBolge}
              testID="lead-req-bolge"
            />
            <TextInput
              style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]}
              placeholder="Ek açıklama (isteğe bağlı)"
              placeholderTextColor="#94a3b8"
              multiline
              value={reqAciklama}
              onChangeText={setReqAciklama}
              testID="lead-req-aciklama"
            />
            <TouchableOpacity style={s.submitBtn} onPress={submitRequest} disabled={sendingReq} testID="lead-req-submit">
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={s.submitBtnText}>{sendingReq ? 'Gönderiliyor...' : 'Talebi Gönder'}</Text>
            </TouchableOpacity>

            {requests.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: 24 }]}>Geçmiş Taleplerin</Text>
                {requests.map((r) => (
                  <View key={r.id} style={s.reqCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reqSektor}>{r.sektor}{r.bolge ? ` · ${r.bolge}` : ''}</Text>
                      {!!r.aciklama && <Text style={s.reqAciklama} numberOfLines={2}>{r.aciklama}</Text>}
                    </View>
                    <View style={[s.reqDurum, r.durum === 'Tamamlandı' ? s.reqDurumDone : s.reqDurumPending]}>
                      <Text style={[s.reqDurumText, r.durum === 'Tamamlandı' ? { color: '#16a34a' } : { color: '#b45309' }]}>{r.durum}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!notesFor} transparent animationType="fade" onRequestClose={() => setNotesFor(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{notesFor?.firma} — Not</Text>
            <TextInput
              style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Görüşme notu..."
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#F1F5F9' }]} onPress={() => setNotesFor(null)}>
                <Text style={[s.modalBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.primary }]} onPress={saveNote}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  statValue: { fontSize: 22, fontWeight: '900', color: theme.colors.navy },
  statLabel: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted, marginTop: 4, letterSpacing: 0.3 },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9' },
  tabBtnActive: { backgroundColor: theme.colors.primary },
  tabText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  tabTextActive: { color: '#fff' },
  dailyBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.line },
  dailyLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.text },
  dailyInput: { width: 56, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.line, textAlign: 'center', backgroundColor: '#fff', fontSize: 13 },
  dailySaveBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 12, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dailySaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 15 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyTextBox: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 20 },
  ctaTalepBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primary, borderRadius: 10, paddingHorizontal: 16, height: 40, marginTop: 12 },
  ctaTalepBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  leadCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 10, gap: 8 },
  leadName: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  leadSub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  leadNote: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  durumChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  durumChipText: { fontSize: 10, fontWeight: '800' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  waBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.colors.text, backgroundColor: '#fff', marginBottom: 10 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, borderRadius: 12, height: 46, marginTop: 4 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  reqCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, padding: 10, marginBottom: 8, gap: 8 },
  reqSektor: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  reqAciklama: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  reqDurum: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  reqDurumPending: { backgroundColor: '#FEF3C7' },
  reqDurumDone: { backgroundColor: '#DCFCE7' },
  reqDurumText: { fontSize: 10.5, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  modalBtn: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 13, fontWeight: '800' },
});

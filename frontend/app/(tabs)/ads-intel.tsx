import React, { useEffect, useMemo, useState } from 'react';
import { upper } from '@/src/lib/i18n';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
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
import { api, AdRecordT, AdWatchItemT } from '@/src/lib/api';
import { MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';

// ============================================================================
// Reklam İstihbaratı -- MyDijital OS'teki "Reklam İstihbaratı" modülünün
// karşılığı (bkz. rakip analizi). Rakip reklamlarını (reklamveren, başlık,
// ilk/son görülme tarihi) kaydediyoruz; "kazanma sinyali" -- bir reklam ne
// kadar uzun süre yayında kaldıysa reklamverenin onu o kadar başarılı
// bulduğu varsayımına dayanan standart ad-spy sezgisi -- backend'de otomatik
// hesaplanıyor (bkz. server.py _ad_kazanma_sinyali). Canlı Meta arama resmi
// bir Facebook Geliştirici erişim jetonu gerektirdiği için ilk sürüm, bayinin
// kendi bulduklarını elle veya JSON ile toplu ekleyebildiği bir arşiv olarak
// çalışıyor.
// ============================================================================

const DURUM_FILTERS = ['Tümü', 'Aktif', 'Pasif'];
const SKOR_FILTERS = ['Tümü', 'Çok Güçlü', 'Güçlü', 'Test Edilebilir', 'Zayıf'];
const SKOR_COLORS: Record<string, string> = {
  'Çok Güçlü': '#16a34a',
  'Güçlü': '#0ea5e9',
  'Test Edilebilir': '#f59e0b',
  'Zayıf': '#94a3b8',
};

export default function AdsIntelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast } = useApp();
  const companyId = activeCompany?.id;

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AdRecordT[]>([]);
  const [watchlist, setWatchlist] = useState<AdWatchItemT[]>([]);
  const [durumFilter, setDurumFilter] = useState('Tümü');
  const [skorFilter, setSkorFilter] = useState('Tümü');

  const [watchTerm, setWatchTerm] = useState('');
  const [watchSaving, setWatchSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addReklamveren, setAddReklamveren] = useState('');
  const [addBaslik, setAddBaslik] = useState('');
  const [addMecra, setAddMecra] = useState('Meta');
  const [addGorselUrl, setAddGorselUrl] = useState('');
  const [addIlkGorulme, setAddIlkGorulme] = useState('');
  const [addNotlar, setAddNotlar] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  const [editFor, setEditFor] = useState<AdRecordT | null>(null);
  const [editDurum, setEditDurum] = useState<'Aktif' | 'Pasif'>('Aktif');
  const [editSonGorulme, setEditSonGorulme] = useState('');
  const [editNotlar, setEditNotlar] = useState('');

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [recs, wl] = await Promise.all([
        api.listAdRecords(companyId),
        api.listAdWatchlist(companyId),
      ]);
      setRecords(recs);
      setWatchlist(wl);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const stats = useMemo(() => {
    const reklamverenSet = new Set(records.map((r) => r.reklamveren.trim().toLowerCase()));
    const aktifSayisi = records.filter((r) => r.durum === 'Aktif').length;
    const favoriSayisi = records.filter((r) => r.favori).length;
    const ortalamaSkor = records.length ? Math.round(records.reduce((sum, r) => sum + r.kazanmaSkoru, 0) / records.length) : 0;
    const dagilim: Record<string, number> = { 'Çok Güçlü': 0, 'Güçlü': 0, 'Test Edilebilir': 0, 'Zayıf': 0 };
    records.forEach((r) => { dagilim[r.kazanmaSinyali] = (dagilim[r.kazanmaSinyali] || 0) + 1; });
    return { reklamverenSayisi: reklamverenSet.size, aktifSayisi, favoriSayisi, ortalamaSkor, dagilim, toplam: records.length };
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (durumFilter !== 'Tümü' && r.durum !== durumFilter) return false;
      if (skorFilter !== 'Tümü' && r.kazanmaSinyali !== skorFilter) return false;
      return true;
    });
  }, [records, durumFilter, skorFilter]);

  const addWatchTerm = async () => {
    if (!companyId || !watchTerm.trim()) return;
    setWatchSaving(true);
    try {
      await api.createAdWatchlistItem(companyId, watchTerm.trim());
      setWatchTerm('');
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setWatchSaving(false);
    }
  };

  const removeWatchTerm = async (id: string) => {
    try {
      await api.deleteAdWatchlistItem(id);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const addRecord = async () => {
    if (!companyId) return;
    if (!addReklamveren.trim()) {
      showToast('Reklamveren adı zorunlu');
      return;
    }
    setAddSaving(true);
    try {
      await api.createAdRecord({
        companyId,
        reklamveren: addReklamveren.trim(),
        baslik: addBaslik.trim(),
        mecra: addMecra.trim() || 'Meta',
        gorselUrl: addGorselUrl.trim(),
        ilkGorulmeTarihi: addIlkGorulme.trim(),
        notlar: addNotlar.trim(),
        durum: 'Aktif',
      });
      setAddReklamveren(''); setAddBaslik(''); setAddMecra('Meta'); setAddGorselUrl(''); setAddIlkGorulme(''); setAddNotlar('');
      setAddOpen(false);
      showToast('Reklam kaydı eklendi');
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setAddSaving(false);
    }
  };

  const doImport = async () => {
    if (!companyId) return;
    let items: any[] = [];
    try {
      const parsed = JSON.parse(importText);
      items = Array.isArray(parsed) ? parsed : [parsed];
      items = items.map((it) => ({
        reklamveren: String(it.reklamveren || it.advertiser || it.name || '').trim(),
        baslik: String(it.baslik || it.title || it.text || ''),
        mecra: String(it.mecra || it.platform || 'Meta'),
        gorselUrl: String(it.gorselUrl || it.image || it.imageUrl || ''),
        ilkGorulmeTarihi: String(it.ilkGorulmeTarihi || it.startDate || it.firstSeen || '').slice(0, 10),
        sonGorulmeTarihi: String(it.sonGorulmeTarihi || it.endDate || it.lastSeen || '').slice(0, 10),
        durum: (it.durum === 'Pasif' || it.status === 'inactive') ? 'Pasif' : 'Aktif',
        notlar: String(it.notlar || it.notes || ''),
      })).filter((it) => it.reklamveren);
    } catch {
      showToast('Geçersiz JSON — bir dizi ([...]) yapıştırmalısınız');
      return;
    }
    if (items.length === 0) {
      showToast('İçe aktarılacak geçerli kayıt bulunamadı');
      return;
    }
    setImportBusy(true);
    try {
      const res = await api.importAdRecords(companyId, items);
      showToast(`${res.created} kayıt içe aktarıldı`);
      setImportText('');
      setImportOpen(false);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setImportBusy(false);
    }
  };

  const openEdit = (r: AdRecordT) => {
    setEditFor(r);
    setEditDurum(r.durum);
    setEditSonGorulme(r.sonGorulmeTarihi || '');
    setEditNotlar(r.notlar || '');
  };

  const saveEdit = async () => {
    if (!editFor) return;
    try {
      await api.updateAdRecord(editFor.id, { durum: editDurum, sonGorulmeTarihi: editSonGorulme, notlar: editNotlar });
      setEditFor(null);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const refreshToday = async (r: AdRecordT) => {
    // MyDijital'deki "Elle şimdi tazele" -- reklam hâlâ yayında görülüyorsa
    // son görülme tarihini bugüne çeker, süresi (ve puanı) böylece artar.
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.updateAdRecord(r.id, { sonGorulmeTarihi: today, durum: 'Aktif' });
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const toggleFavori = async (r: AdRecordT) => {
    try {
      await api.updateAdRecord(r.id, { favori: !r.favori });
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const removeRecord = async (r: AdRecordT) => {
    try {
      await api.deleteAdRecord(r.id);
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
          <Text style={s.headerTitle}>Reklam İstihbaratı</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.empty}><Text style={s.emptyText}>Önce bir firma seçin.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reklam İstihbaratı</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      <MotionScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <ScreenHero
          icon="megaphone"
          title={'Reklam İstihbaratı'}
          color={theme.colors.modules.reklam}
        />
        <Text style={s.helperTinyMuted}>
          Rakiplerinizin reklamlarını (Meta/Instagram vb.) kaydedin. Bir reklam ne kadar uzun süre yayında kalırsa "kazanma sinyali" o kadar güçlü sayılır — reklamverenin dönüşüm getirdiği için bütçesini kesmediği varsayılır.
        </Text>

        <View style={s.statGrid}>
          <View style={s.statCard}><Text style={s.statValue}>{stats.reklamverenSayisi}</Text><Text style={s.statLabel}>REKLAMVERENLER</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.aktifSayisi}</Text><Text style={s.statLabel}>AKTİF REKLAMLAR</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.ortalamaSkor}</Text><Text style={s.statLabel}>ORT. KAZANMA SKORU</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{stats.favoriSayisi}</Text><Text style={s.statLabel}>FAVORİLER</Text></View>
        </View>

        <Text style={s.sectionTitle}>{upper('Kazanma Sinyali Dağılımı')}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SKOR_FILTERS.slice(1).map((k) => (
            <View key={k} style={[s.distChip, { borderColor: SKOR_COLORS[k] }]}>
              <View style={[s.distDot, { backgroundColor: SKOR_COLORS[k] }]} />
              <Text style={s.distChipText}>{k}: {stats.dagilim[k] || 0}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>{upper('İzleme Listesi — günlük takip edilecek terimler')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Rakip adı veya anahtar kelime"
            placeholderTextColor="#94a3b8"
            value={watchTerm}
            onChangeText={setWatchTerm}
            testID="ads-watch-input"
          />
          <TouchableOpacity style={s.watchAddBtn} onPress={addWatchTerm} disabled={watchSaving} testID="ads-watch-add">
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        {watchlist.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {watchlist.map((w) => (
              <View key={w.id} style={s.watchChip}>
                <Text style={s.watchChipText}>{w.terim}</Text>
                <TouchableOpacity onPress={() => removeWatchTerm(w.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="close" size={13} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <TouchableOpacity style={[s.addManualBtn, { flex: 1 }]} onPress={() => setAddOpen(true)} testID="ads-add-open">
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addManualBtnText}>Reklam Ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.addManualBtn, { flex: 1 }]} onPress={() => setImportOpen(true)} testID="ads-import-open">
            <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.primary} />
            <Text style={s.addManualBtnText}>JSON İçe Aktar</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {DURUM_FILTERS.map((d) => (
            <TouchableOpacity key={d} style={[s.filterChip, durumFilter === d && s.filterChipActive]} onPress={() => setDurumFilter(d)}>
              <Text style={[s.filterChipText, durumFilter === d && s.filterChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {SKOR_FILTERS.map((k) => (
            <TouchableOpacity key={k} style={[s.filterChip, skorFilter === k && s.filterChipActive]} onPress={() => setSkorFilter(k)}>
              <Text style={[s.filterChipText, skorFilter === k && s.filterChipTextActive]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator style={{ marginVertical: 20 }} color={theme.colors.primary} />}

        {!loading && filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="megaphone-outline" size={26} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Henüz reklam verisi yok. Elle ekleyin veya JSON içe aktarın.</Text>
          </View>
        ) : (
          filtered.map((r) => (
            <View key={r.id} style={s.card} testID={`ad-record-${r.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.cardTitle} numberOfLines={1}>{r.reklamveren}</Text>
                <TouchableOpacity onPress={() => toggleFavori(r)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name={r.favori ? 'star' : 'star-outline'} size={18} color={r.favori ? theme.colors.gold : theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
              {!!r.baslik && <Text style={s.cardSub} numberOfLines={2}>{r.baslik}</Text>}
              {!!r.gorselUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(r.gorselUrl).catch(() => {})}>
                  <Text style={s.linkText} numberOfLines={1}>{r.gorselUrl}</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                <View style={[s.badge, { backgroundColor: r.durum === 'Aktif' ? '#DCFCE7' : '#F1F5F9' }]}>
                  <Text style={[s.badgeText, { color: r.durum === 'Aktif' ? '#166534' : theme.colors.textMuted }]}>{r.durum}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: (SKOR_COLORS[r.kazanmaSinyali] || '#94a3b8') + '22' }]}>
                  <Text style={[s.badgeText, { color: SKOR_COLORS[r.kazanmaSinyali] || theme.colors.textMuted }]}>{r.kazanmaSinyali} · {r.kazanmaSkoru}</Text>
                </View>
                <Text style={s.metaText}>{r.yayinGunSayisi} gün yayında</Text>
              </View>
              {!!r.notlar && <Text style={s.cardNote} numberOfLines={2}>📝 {r.notlar}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {r.durum === 'Aktif' && (
                  <TouchableOpacity style={s.smallBtn} onPress={() => refreshToday(r)} testID={`ad-refresh-${r.id}`}>
                    <Ionicons name="refresh" size={13} color={theme.colors.primary} />
                    <Text style={s.smallBtnText}>Şimdi Tazele</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.smallBtn} onPress={() => openEdit(r)} testID={`ad-edit-${r.id}`}>
                  <Ionicons name="create-outline" size={13} color={theme.colors.primary} />
                  <Text style={s.smallBtnText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.smallBtn, { marginLeft: 'auto' }]} onPress={() => removeRecord(r)}>
                  <Ionicons name="trash-outline" size={13} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </MotionScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Reklam Ekle</Text>
            <TextInput style={s.input} placeholder="Reklamveren (zorunlu)" placeholderTextColor="#94a3b8" value={addReklamveren} onChangeText={setAddReklamveren} autoFocus testID="ads-add-reklamveren" />
            <TextInput style={s.input} placeholder="Başlık / metin (opsiyonel)" placeholderTextColor="#94a3b8" value={addBaslik} onChangeText={setAddBaslik} testID="ads-add-baslik" />
            <TextInput style={s.input} placeholder="Mecra (varsayılan: Meta)" placeholderTextColor="#94a3b8" value={addMecra} onChangeText={setAddMecra} testID="ads-add-mecra" />
            <TextInput style={s.input} placeholder="Görsel / ekran görüntüsü URL (opsiyonel)" placeholderTextColor="#94a3b8" value={addGorselUrl} onChangeText={setAddGorselUrl} testID="ads-add-gorsel" />
            <TextInput style={s.input} placeholder="İlk görülme tarihi YYYY-MM-DD (boşsa bugün)" placeholderTextColor="#94a3b8" value={addIlkGorulme} onChangeText={setAddIlkGorulme} testID="ads-add-ilkgorulme" />
            <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline placeholder="Not (opsiyonel)" placeholderTextColor="#94a3b8" value={addNotlar} onChangeText={setAddNotlar} testID="ads-add-notlar" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.surfaceSoft }]} onPress={() => setAddOpen(false)}>
                <Text style={[s.modalBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.primary }]} onPress={addRecord} disabled={addSaving} testID="ads-add-save">
                <Text style={[s.modalBtnText, { color: '#fff' }]}>{addSaving ? '...' : 'Ekle'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={() => setImportOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>JSON İçe Aktar</Text>
            <Text style={s.helperTinyMuted}>
              Bir dizi ([...]) yapıştırın. Her öğede en az "reklamveren" (veya "advertiser"/"name") alanı olmalı. Diğer alanlar: baslik, mecra, gorselUrl, ilkGorulmeTarihi, sonGorulmeTarihi, durum, notlar.
            </Text>
            <TextInput
              style={[s.input, { minHeight: 160, textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11.5 }]}
              multiline
              placeholder={'[\n  {"reklamveren": "Örnek Firma", "baslik": "...", "ilkGorulmeTarihi": "2026-08-01"}\n]'}
              placeholderTextColor="#94a3b8"
              value={importText}
              onChangeText={setImportText}
              testID="ads-import-text"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.surfaceSoft }]} onPress={() => setImportOpen(false)}>
                <Text style={[s.modalBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.primary }]} onPress={doImport} disabled={importBusy} testID="ads-import-save">
                <Text style={[s.modalBtnText, { color: '#fff' }]}>{importBusy ? '...' : 'İçe Aktar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editFor} transparent animationType="fade" onRequestClose={() => setEditFor(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{editFor?.reklamveren}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TouchableOpacity style={[s.durumPill, editDurum === 'Aktif' && s.durumPillActive]} onPress={() => setEditDurum('Aktif')}>
                <Text style={[s.durumPillText, editDurum === 'Aktif' && s.durumPillTextActive]}>Aktif</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.durumPill, editDurum === 'Pasif' && s.durumPillActive]} onPress={() => setEditDurum('Pasif')}>
                <Text style={[s.durumPillText, editDurum === 'Pasif' && s.durumPillTextActive]}>Pasif</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubLabel}>Son görülme tarihi (YYYY-MM-DD) — Pasif ise yayın süresi burada durur</Text>
            <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" value={editSonGorulme} onChangeText={setEditSonGorulme} testID="ads-edit-songorulme" />
            <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline placeholder="Not" placeholderTextColor="#94a3b8" value={editNotlar} onChangeText={setEditNotlar} testID="ads-edit-notlar" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.surfaceSoft }]} onPress={() => setEditFor(null)}>
                <Text style={[s.modalBtnText, { color: theme.colors.text }]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.colors.primary }]} onPress={saveEdit} testID="ads-edit-save">
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.bg },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 15 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  statValue: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  statLabel: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textMuted, marginTop: 4, letterSpacing: 0.3 },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.4, marginBottom: 10 },
  distChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: theme.colors.surface },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distChipText: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10 },
  watchAddBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  watchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceSoft, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  watchChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.text },
  addManualBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 10, height: 40, backgroundColor: theme.colors.surface },
  addManualBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12.5 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft, borderWidth: 1, borderColor: theme.colors.line },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyTextBox: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 20 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 10 },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  cardSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  cardNote: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  linkText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.primary, textDecorationLine: 'underline', marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  metaText: { fontSize: 10.5, color: theme.colors.textMuted, fontWeight: '700' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.surfaceSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  smallBtnText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,11,20,0.58)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { width: '100%', maxWidth: 460, backgroundColor: theme.colors.surface, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.line, padding: 20, boxShadow: '0 24px 60px rgba(2,6,23,0.4)' },
  modalTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  modalSubLabel: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted, marginTop: 2, marginBottom: 6 },
  modalBtn: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 13, fontWeight: '800' },
  durumPill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  durumPillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  durumPillText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  durumPillTextActive: { color: '#fff' },
}));

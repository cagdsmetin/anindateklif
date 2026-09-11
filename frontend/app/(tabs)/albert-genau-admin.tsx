import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { theme } from '@/src/lib/theme';
import { api, fetchAlbertGenauPriceCsv, AlbertGenauPriceListStatusT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { downloadFileWeb } from '@/src/lib/web-download';

// Albert Genau'nun resmi fiyat listesi tek bir yerden (bu ekrandan) güncellenir
// -- fiyatlar Mongo'daki `albert_genau_config` kaydına yazılır, hesaplama
// formülleri (backend/albert_genau_calc.py) hiç değişmez. Bu yüzden ekran
// sadece platform admini (ncagdasm@gmail.com) tarafından görülebilir --
// Albert Genau tek bir üreticinin resmi fiyat kitabı, firma bazlı bir veri
// değil.

function fmtDate(iso?: string) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('tr-TR'); } catch { return iso; }
}

export default function AlbertGenauAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  const [status, setStatus] = useState<AlbertGenauPriceListStatusT | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    try { setStatus(await api.albertGenauPriceListStatus()); } catch { /* sessiz */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [isAdmin, load]);

  const onPickAndUpload = async () => {
    if (uploading) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      setUploading(true);
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`;
      const result = await api.uploadAlbertGenauPriceList(dataUri);
      setSuccessMsg(`Fiyat listesi güncellendi: ${result.skuCount} kalem`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Yükleme başarısız');
    } finally {
      setUploading(false);
    }
  };

  const onExportJson = async () => {
    if (exportingJson) return;
    setExportingJson(true);
    setError('');
    try {
      const pkg = await api.albertGenauExportPackage();
      const json = JSON.stringify(pkg, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `albert-genau-bayi-paketi-${dateStr}.json`;
      if (Platform.OS === 'web') {
        const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        await downloadFileWeb(blobUrl, fileName);
      } else {
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Bayi Paketini Paylaş' });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Paket indirilemedi');
    } finally {
      setExportingJson(false);
    }
  };

  const onExportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    setError('');
    try {
      const csv = await fetchAlbertGenauPriceCsv();
      const fileName = 'albert-genau-fiyat-listesi.csv';
      if (Platform.OS === 'web') {
        const blobUrl = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        await downloadFileWeb(blobUrl, fileName);
      } else {
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Fiyat Listesini Paylaş' });
        }
      }
    } catch (e: any) {
      setError(e?.message || 'CSV indirilemedi');
    } finally {
      setExportingCsv(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Albert Genau Fiyat Listesi</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu ekrana erişim yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Albert Genau Fiyat Listesi</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={s.card}>
            <Text style={s.sectionLabel}>Şu Anki Fiyat Listesi</Text>
            <View style={s.statRow}>
              <Text style={s.statLabel}>Kaynak</Text>
              <Text style={s.statValue}>{status?.source || '-'}</Text>
            </View>
            <View style={s.statRow}>
              <Text style={s.statLabel}>Kalem Sayısı</Text>
              <Text style={s.statValue}>{status?.skuCount ?? '-'}</Text>
            </View>
            {status?.updatedAt ? (
              <View style={s.statRow}>
                <Text style={s.statLabel}>Son Güncelleme</Text>
                <Text style={s.statValue}>{fmtDate(status.updatedAt)}</Text>
              </View>
            ) : null}
            {status?.updatedBy ? (
              <View style={s.statRow}>
                <Text style={s.statLabel}>Güncelleyen</Text>
                <Text style={s.statValue}>{status.updatedBy}</Text>
              </View>
            ) : null}
          </View>

          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.sectionLabel}>Yeni Fiyat Listesi Yükle</Text>
            <Text style={s.hint}>
              Albert Genau'dan yeni bir fiyat Excel'i geldiğinde buradan tekrar yükleyin. Sadece "SİPARİŞ FORMU"
              sayfasındaki SKU/fiyat listesi güncellenir — hesaplama formülleri (modül/panel sayısı, LED, köpük vb.)
              hiç değişmez, tüm dealer'lar otomatik olarak yeni fiyatlarla hesaplama yapmaya başlar.
            </Text>
            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
            {!!successMsg && (
              <View style={s.successBox}>
                <Ionicons name="checkmark-circle" size={16} color="#166534" />
                <Text style={s.successText}>{successMsg}</Text>
              </View>
            )}
            <TouchableOpacity style={[s.cta, uploading && { opacity: 0.6 }]} onPress={onPickAndUpload} disabled={uploading} testID="ag-admin-upload">
              {uploading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={s.ctaText}>Excel Dosyası Seç ve Yükle</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.sectionLabel}>Bayi Paketi (Dealer Export)</Text>
            <Text style={s.hint}>
              Bu uygulamayı satın alan yeni bir Albert Genau bayisine kendi kurulumuna yükleyebileceği bir paket
              verin. JSON paketi tüm fiyat + tablo verisini (formüller hariç, onlar zaten kodda) taşır; CSV ise
              sadece fiyat listesinin okunabilir halidir.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.ctaSecondary, { flex: 1 }, exportingJson && { opacity: 0.6 }]} onPress={onExportJson} disabled={exportingJson} testID="ag-admin-export-json">
                {exportingJson ? <ActivityIndicator color={theme.colors.primary} /> : (
                  <>
                    <Ionicons name="cube-outline" size={16} color={theme.colors.primary} />
                    <Text style={s.ctaSecondaryText}>JSON Paketi</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[s.ctaSecondary, { flex: 1 }, exportingCsv && { opacity: 0.6 }]} onPress={onExportCsv} disabled={exportingCsv} testID="ag-admin-export-csv">
                {exportingCsv ? <ActivityIndicator color={theme.colors.primary} /> : (
                  <>
                    <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
                    <Text style={s.ctaSecondaryText}>Fiyat Listesi CSV</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F5F7FA' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.line },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  statLabel: { fontSize: 12.5, color: theme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 12.5, color: theme.colors.text, fontWeight: '800' },
  hint: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginBottom: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { color: theme.colors.red, fontSize: 12.5, fontWeight: '700', flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 12 },
  successText: { color: '#166534', fontSize: 12.5, fontWeight: '700', flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 13 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  ctaSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primarySoft, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: theme.colors.primaryBorder },
  ctaSecondaryText: { color: theme.colors.primary, fontSize: 12.5, fontWeight: '800' },
});

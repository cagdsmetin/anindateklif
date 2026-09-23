import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import { upper } from '@/src/lib/i18n';
import { api, ZipPerdeAdminStatusT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';
import ZipPriceGrid, { ZIP_COLOR } from '@/src/components/zip/ZipPriceGrid';

// Zip Perde fiyat tablosu -- tek merkezi kayıt (zip_perde_config). Tedarikçiden
// yeni fiyat listesi geldiğinde aynı düzendeki Excel ("BOY↓ / EN→" başlıklı
// tablo, isteğe bağlı "Zam Oranı (%)" hücresi) buradan yüklenir; tüm Zip
// Perde bayileri anında yeni fiyatları kullanır. Sadece platform admini.

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('tr-TR'); } catch { return iso; }
}

export default function ZipPerdeAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = (user?.email || '').toLowerCase() === 'ncagdasm@gmail.com';

  const [status, setStatus] = useState<ZipPerdeAdminStatusT | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    try { setStatus(await api.zipPerdeAdminStatus()); } catch (e: any) { setError(e?.message || 'Tablo okunamadı'); }
  }, []);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
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
      const r = await api.uploadZipPerdeTable(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`);
      setSuccessMsg(`Tablo güncellendi: ${r.widthCount} EN × ${r.heightCount} BOY${r.zamPct ? ` (zam %${r.zamPct} uygulandı)` : ''}`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Yükleme başarısız');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Zip Perde Fiyat Tablosu</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {!isAdmin ? (
        <View style={s.center}><Text style={s.muted}>Bu ekrana erişim yetkiniz yok.</Text></View>
      ) : loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={ZIP_COLOR} /></View>
      ) : (
        <MotionScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <ScreenHero icon="grid" title="Zip Perde Fiyat Tablosu" color={ZIP_COLOR} />

          <View style={s.card}>
            <Text style={s.sectionLabel}>{upper('Şu Anki Tablo')}</Text>
            <Stat label="Kaynak" value={status?.source || '-'} />
            <Stat label="Ölçü aralığı" value={status ? `EN ${status.widths[0]}–${status.widths[status.widths.length - 1]} × BOY ${status.heights[0]}–${status.heights[status.heights.length - 1]} cm` : '-'} />
            <Stat label="Para birimi" value={status?.currency || '-'} />
            {status?.updatedAt ? <Stat label="Son Güncelleme" value={fmtDate(status.updatedAt)} /> : null}
            {status?.updatedBy ? <Stat label="Güncelleyen" value={status.updatedBy} /> : null}
          </View>

          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.sectionLabel}>{upper('Yeni Tablo Yükle')}</Text>
            <Text style={s.hint}>
              Tedarikçiden gelen tabloyu aynı düzende yükleyin: “BOY↓ / EN→” başlık satırında EN değerleri, altında
              her BOY için fiyatlar (EUR, adet). “—” ya da boş hücre o ölçünün üretilmediği anlamına gelir. Dosyadaki
              “Zam Oranı (%)” hücresi doluysa fiyatlara uygulanır. Yükleme anında tüm Zip Perde bayilerine yansır.
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
            <TouchableOpacity style={[s.cta, uploading && { opacity: 0.6 }]} onPress={onPickAndUpload} disabled={uploading} testID="zip-admin-upload">
              {uploading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={s.ctaText}>Excel Dosyası Seç ve Yükle</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {status && (
            <View style={[s.card, { marginTop: 16 }]}>
              <Text style={s.sectionLabel}>{upper('Tablo (EUR, adet)')}</Text>
              <ZipPriceGrid table={status} />
            </View>
          )}
        </MotionScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.surfaceSoft },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.line, ...theme.shadow.sm },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 12, letterSpacing: 0.3 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  statLabel: { fontSize: 12.5, color: theme.colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 12.5, color: theme.colors.text, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  hint: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginBottom: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.redSoft, borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { color: theme.colors.red, fontSize: 12.5, fontWeight: '700', flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 12 },
  successText: { color: theme.colors.greenText, fontSize: 12.5, fontWeight: '700', flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ZIP_COLOR, borderRadius: 14, paddingVertical: 13 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '800' },
}));

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, AuditEntryT } from '@/src/lib/api';
import { useLanguage } from '@/src/lib/i18n';
import { MotionScrollView, ScreenHero, SoftIcon, themedStyles } from '@/src/components/motion';

// İşlem geçmişi: hesapta kim, ne zaman, neyi değiştirdi (backend _audit_mw).
// Silinen kayıtların silinmeden önceki içeriği "Detay" ile görülebilir.

const ENTITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  quotes: 'document-text', customers: 'people', services: 'construct', campaigns: 'megaphone', manual_reminders: 'notifications',
  kasa: 'wallet', kasa_recurring: 'repeat', kasa_settings: 'settings', tahsilat: 'cash', cek_senet: 'documents',
  catalog: 'library', contracts: 'document-lock', coupons: 'pricetags', companies: 'business', invoices: 'receipt',
  auth: 'log-in', account: 'download',
};

function toneFor(action: string): string {
  if (/silindi|çıkarıldı|çöp/i.test(action)) return theme.colors.red;
  if (/eklendi|oluşturuldu|kesildi|aktarıldı|davet|geri yüklendi/i.test(action)) return theme.colors.green;
  if (/Giriş/i.test(action)) return theme.colors.primary;
  return '#D97706';
}

const LABELS: Record<string, string> = {
  firma: 'Ad', musFirma: 'Müşteri', musteriAdi: 'Müşteri', kesideci: 'Keşideci', urunAdi: 'Ürün', baslik: 'Başlık', telefon: 'Telefon',
  email: 'E-posta', adres: 'Adres', tutar: 'Tutar', paraBirimi: 'Para birimi', genelToplam: 'Genel toplam', teklifNo: 'Teklif no',
  tarih: 'Tarih', vadeTarihi: 'Vade', durum: 'Durum', notlar: 'Not', kategori: 'Kategori', yontem: 'Yöntem', kod: 'Kod', sirketAdi: 'Firma',
};

function fmtTime(iso: string, lang: string) {
  const d = new Date(iso);
  return d.toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'it' ? 'it-IT' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IslemGecmisiScreen() {
  const { t, lang } = useLanguage();
  const ta = (k: string) => t('audit.' + k);
  const { activeCompany, showToast } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<AuditEntryT[] | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'delete' | 'auth'>('all');

  const load = useCallback(async () => {
    if (!activeCompany || restricted) return;
    try {
      const r = await api.listAuditLog(activeCompany.id);
      setList(r); setMore(r.length >= 50);
    } catch (e: any) { showToast(e?.message || ''); setList([]); }
  }, [activeCompany, restricted, showToast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    if (!activeCompany || !list?.length || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.listAuditLog(activeCompany.id, list[list.length - 1].createdAt);
      setList([...list, ...r]); setMore(r.length >= 50);
    } catch (e: any) { showToast(e?.message || ''); } finally { setLoadingMore(false); }
  };

  const shown = useMemo(() => (list || []).filter((e) =>
    filter === 'all' ? true : filter === 'delete' ? !!e.before : e.entity === 'auth'), [list, filter]);

  if (!activeCompany || restricted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={ta('title')} />
        <View style={s.center}><Text style={s.muted}>{ta('noAccess')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={ta('title')} />
      <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        <ScreenHero icon="time" title={ta('title')} subtitle={activeCompany.sirketAdi} color={theme.colors.modules.firma} />
        <Text style={s.intro}>{ta('intro')}</Text>
        <View style={s.chips}>
          {(['all', 'delete', 'auth'] as const).map((f) => (
            <TouchableOpacity key={f} style={[s.chip, filter === f && s.chipOn]} onPress={() => setFilter(f)} testID={`audit-filter-${f}`}>
              <Text style={[s.chipText, filter === f && { color: '#fff' }]}>{ta('f_' + f)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {list == null ? <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} /> : shown.length === 0 ? (
          <View style={s.empty}><Ionicons name="time-outline" size={28} color={theme.colors.textMuted} /><Text style={s.muted}>{ta('empty')}</Text></View>
        ) : shown.map((e) => {
          const tone = toneFor(e.action);
          const isOpen = open === e.id;
          return (
            <View key={e.id} style={s.row} testID={`audit-${e.id}`}>
              <SoftIcon icon={ENTITY_ICON[e.entity] || 'create'} color={tone} size={34} iconSize={16} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.action}>{e.action}{e.detail ? <Text style={s.detail}>{'  ·  '}{e.detail}</Text> : null}</Text>
                <Text style={s.meta}>
                  {e.actorName || e.actorEmail}{e.impersonated ? ` (${ta('support')})` : ''} · {fmtTime(e.createdAt, lang)}{e.ip ? ` · ${e.ip}` : ''}
                </Text>
                {e.before && (
                  <TouchableOpacity onPress={() => setOpen(isOpen ? '' : e.id)} style={s.detailBtn} testID={`audit-detail-${e.id}`}>
                    <Text style={s.detailBtnText}>{isOpen ? ta('hide') : ta('showDeleted')}</Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} color={theme.colors.primary} />
                  </TouchableOpacity>
                )}
                {isOpen && e.before && (
                  <View style={s.beforeBox}>
                    {Object.entries(e.before)
                      .filter(([, v]) => v !== '' && v != null && typeof v !== 'object')
                      .sort(([a], [b]) => (LABELS[b] ? 1 : 0) - (LABELS[a] ? 1 : 0))
                      .slice(0, 24)
                      .map(([k, v]) => (
                        <View key={k} style={s.kv}>
                          <Text style={s.k}>{LABELS[k] || k}</Text>
                          <Text style={s.v} selectable>{String(v)}</Text>
                        </View>
                      ))}
                    {Array.isArray(e.before.items) && e.before.items.length > 0 && (
                      <Text style={s.meta}>{e.before.items.length} {ta('lines')}: {e.before.items.slice(0, 5).map((it: any) => it?.urunAdi).filter(Boolean).join(', ')}</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {list && list.length > 0 && more && (
          <TouchableOpacity style={s.moreBtn} onPress={loadMore} disabled={loadingMore} testID="audit-more">
            {loadingMore ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text style={s.moreText}>{ta('more')}</Text>}
          </TouchableOpacity>
        )}
        <Text style={s.foot}>{ta('retention')}</Text>
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  intro: { fontSize: 12, color: theme.colors.textMuted, marginTop: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipOn: { backgroundColor: theme.colors.modules.firma, borderColor: theme.colors.modules.firma },
  chipText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.textMuted },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, backgroundColor: theme.colors.surface },
  row: { flexDirection: 'row', gap: 11, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 11, marginBottom: 8 },
  action: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  detail: { fontWeight: '600', color: theme.colors.textSoft },
  meta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 3 },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, alignSelf: 'flex-start' },
  detailBtnText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.primary },
  beforeBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft, gap: 4 },
  kv: { flexDirection: 'row', gap: 8 },
  k: { width: 96, fontSize: 11, fontWeight: '800', color: theme.colors.textSoft },
  v: { flex: 1, fontSize: 11.5, color: theme.colors.text },
  moreBtn: { alignItems: 'center', padding: 12, marginTop: 4, borderRadius: 10, backgroundColor: theme.colors.primarySoft },
  moreText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
  foot: { fontSize: 10.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 14 },
}));

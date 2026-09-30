import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, GbpLocationT, GbpReviewT, GoogleConnectionT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import { fill, useLanguage } from '@/src/lib/i18n';
import { appReturnUrl, googleErrorMessage, runGoogleFlow, useGoogleConfig } from '@/src/lib/google';
import { themedStyles } from '@/src/components/motion';

// Google İşletme Profili yorumları: bağlanan işletmenin yorumları listelenir,
// birine dokununca Yorum Yanıtla formu o yorumla dolar; yanıt ekrandan
// doğrudan Google'a gönderilir (bkz. yorumlar.tsx).
export default function GoogleReviewsPanel({
  onPick,
  refreshKey,
}: {
  onPick: (r: GbpReviewT) => void;
  refreshKey: number;
}) {
  const { t } = useLanguage();
  const tg = (k: string) => t('gbp.' + k);
  const cfg = useGoogleConfig();
  const { user } = useAuth();
  const { activeCompany, showToast } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ google_connected?: string; google_error?: string }>();
  const [conn, setConn] = useState<GoogleConnectionT | null>(null);
  const [locations, setLocations] = useState<GbpLocationT[] | null>(null);
  const [reviews, setReviews] = useState<GbpReviewT[]>([]);
  const [meta, setMeta] = useState<{ avg: number | null; total: number; next: string }>({ avg: null, total: 0, next: '' });
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [busy, setBusy] = useState('');
  const cid = activeCompany?.id || '';
  const isManager = !user?.is_staff || user?.staff_role === 'admin';
  const enabled = !!cfg?.business && isManager && !!cid;

  const loadConn = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await api.googleConnections(cid);
      setConn(list.find((c) => c.purpose === 'business') || null);
    } catch {}
  }, [enabled, cid]);

  const loadReviews = useCallback(async (append = false, token = '') => {
    setBusy(append ? 'more' : 'reviews');
    try {
      const r = await api.gbpReviews(cid, token);
      setReviews((prev) => (append ? [...prev, ...r.reviews] : r.reviews));
      setMeta({ avg: r.averageRating, total: r.totalReviewCount, next: r.nextPageToken });
    } catch (e: any) { showToast(e?.message || tg('err')); } finally { setBusy(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => { loadConn(); }, [loadConn]);
  useEffect(() => {
    if (conn?.connected && conn.locationName) loadReviews();
  }, [conn?.connected, conn?.locationName, refreshKey, loadReviews]);

  useEffect(() => {
    if (params.google_connected === 'business') {
      showToast(tg('connected'));
      loadConn();
      router.setParams({ google_connected: undefined } as any);
    } else if (params.google_error) {
      showToast(googleErrorMessage(String(params.google_error)));
      router.setParams({ google_error: undefined } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.google_connected, params.google_error]);

  if (!enabled) return null;

  const connect = async () => {
    setBusy('connect');
    try {
      const returnUrl = appReturnUrl('yorumlar');
      const { url } = await api.googleConnectStart({ purpose: 'business', companyId: cid, redirect: returnUrl });
      const res = await runGoogleFlow(url, returnUrl);
      if (res?.google_connected) { showToast(tg('connected')); await loadConn(); }
      else if (res?.google_error) showToast(googleErrorMessage(res.google_error));
    } catch (e: any) { showToast(e?.message || tg('err')); } finally { setBusy(''); }
  };

  const pickLocations = async () => {
    setBusy('locations');
    try { setLocations(await api.gbpLocations(cid)); } catch (e: any) { showToast(e?.message || tg('err')); } finally { setBusy(''); }
  };

  const selectLocation = async (loc: GbpLocationT) => {
    setBusy('locations');
    try {
      setConn(await api.gbpSelectLocation(cid, loc.name, loc.title));
      setLocations(null);
    } catch (e: any) { showToast(e?.message || tg('err')); } finally { setBusy(''); }
  };

  const disconnect = () => {
    const run = async () => {
      try { await api.googleDisconnect('business', cid); setConn(null); setReviews([]); } catch (e: any) { showToast(e?.message || tg('err')); }
    };
    if (Platform.OS === 'web') { if (window.confirm(tg('disconnectConfirm'))) run(); return; }
    Alert.alert(tg('disconnect'), tg('disconnectConfirm'), [{ text: t('common.cancel'), style: 'cancel' }, { text: tg('disconnect'), style: 'destructive', onPress: run }]);
  };

  const header = (
    <View style={s.hdr}>
      <Ionicons name="logo-google" size={16} color="#EA4335" />
      <Text style={s.title}>{tg('title')}</Text>
    </View>
  );

  if (!conn?.connected) {
    return (
      <View style={s.card}>
        {header}
        <Text style={s.p}>{conn?.status === 'revoked' ? tg('revoked') : tg('p')}</Text>
        <TouchableOpacity style={s.primary} onPress={connect} disabled={!!busy} testID="gbp-connect">
          {busy === 'connect' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="logo-google" size={15} color="#fff" />}
          <Text style={s.primaryT}>{tg('connect')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!conn.locationName || locations) {
    return (
      <View style={s.card}>
        {header}
        <Text style={s.p}>{fill(tg('pickP'), { e: conn.email })}</Text>
        {locations ? (
          locations.length ? locations.map((l) => (
            <TouchableOpacity key={l.name} style={s.row} onPress={() => selectLocation(l)} testID="gbp-location">
              <Ionicons name="storefront-outline" size={16} color={theme.colors.modules.yorum} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowT}>{l.title}</Text>
                {!!l.address && <Text style={s.small}>{l.address}</Text>}
              </View>
            </TouchableOpacity>
          )) : <Text style={s.small}>{tg('noLocations')}</Text>
        ) : (
          <TouchableOpacity style={s.primary} onPress={pickLocations} disabled={!!busy} testID="gbp-pick">
            {busy === 'locations' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="storefront-outline" size={15} color="#fff" />}
            <Text style={s.primaryT}>{tg('pick')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={disconnect} style={{ marginTop: 10 }}><Text style={s.link}>{tg('disconnect')}</Text></TouchableOpacity>
      </View>
    );
  }

  const shown = onlyUnanswered ? reviews.filter((r) => !r.reply) : reviews;
  return (
    <View style={s.card}>
      {header}
      <Text style={s.p}>
        {conn.locationTitle}
        {meta.avg != null ? `  ·  ★ ${meta.avg.toFixed(1)}  ·  ${fill(tg('count'), { n: meta.total })}` : ''}
      </Text>
      <View style={s.chips}>
        {[true, false].map((v) => (
          <TouchableOpacity key={String(v)} style={[s.chip, onlyUnanswered === v && s.chipA]} onPress={() => setOnlyUnanswered(v)}>
            <Text style={[s.chipT, onlyUnanswered === v && { color: '#fff' }]}>{v ? tg('unanswered') : tg('all')}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.chip} onPress={() => loadReviews()} disabled={!!busy}>
          <Ionicons name="refresh" size={13} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      {busy === 'reviews' ? <ActivityIndicator color={theme.colors.modules.yorum} style={{ marginVertical: 12 }} /> : (
        shown.length ? shown.map((r) => (
          <TouchableOpacity key={r.name} style={s.row} onPress={() => onPick(r)} testID="gbp-review">
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.rowT}>{r.reviewer || tg('anon')}</Text>
                <Text style={s.stars}>{'★'.repeat(r.stars)}{'☆'.repeat(Math.max(0, 5 - r.stars))}</Text>
                {!!r.reply && <Text style={s.badge}>{tg('replied')}</Text>}
              </View>
              {!!r.comment && <Text style={s.small} numberOfLines={3}>{r.comment}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )) : <Text style={s.small}>{onlyUnanswered ? tg('noneUnanswered') : tg('none')}</Text>
      )}
      {!!meta.next && (
        <TouchableOpacity onPress={() => loadReviews(true, meta.next)} disabled={!!busy} style={{ marginTop: 8 }}>
          <Text style={s.linkBlue}>{busy === 'more' ? '…' : tg('more')}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
        <TouchableOpacity onPress={pickLocations}><Text style={s.linkBlue}>{tg('change')}</Text></TouchableOpacity>
        <TouchableOpacity onPress={disconnect}><Text style={s.link}>{tg('disconnect')}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginTop: 10, ...theme.shadow.sm },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  p: { fontSize: 12.5, color: theme.colors.textSoft, lineHeight: 18, marginBottom: 10 },
  small: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginTop: 2 },
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 12, backgroundColor: theme.colors.modules.yorum },
  primaryT: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  rowT: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  stars: { fontSize: 12, color: '#F59E0B' },
  badge: { fontSize: 10, fontWeight: '800', color: theme.colors.greenText, backgroundColor: theme.colors.greenSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', justifyContent: 'center' },
  chipA: { backgroundColor: theme.colors.modules.yorum, borderColor: theme.colors.modules.yorum },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  link: { fontSize: 12, fontWeight: '800', color: theme.colors.redText },
  linkBlue: { fontSize: 12, fontWeight: '800', color: theme.colors.primary },
}));

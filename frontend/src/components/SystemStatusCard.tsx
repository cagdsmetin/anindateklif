import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { api, CapacitySnapT } from '@/src/lib/api';
import { themedStyles } from '@/src/components/motion';

// Admin: sunucu kapasitesi özeti + uyarı e-postası testi. Uyarılar backend'de
// günlük kontrol edilir (disk %70, e-posta 80/gün veya 2400/ay, yedek hatası).
export default function SystemStatusCard() {
  const [snap, setSnap] = useState<CapacitySnapT | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.adminCapacity().then((r) => { setSnap(r.now); setIssues(r.issues); }).catch(() => {});
  }, []);

  const test = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.adminCapacityTestAlert();
      setMsg(`Test e-postası gönderildi: ${r.to.join(', ')}`);
    } catch (e: any) {
      setMsg(e?.message || 'Gönderilemedi');
    } finally { setBusy(false); }
  };

  const pct = snap?.diskPct ?? 0;
  const barColor = pct >= 70 ? theme.colors.redText : pct >= 50 ? '#d97706' : '#16a34a';
  return (
    <View style={s.card} testID="system-status">
      <View style={s.row}>
        <Ionicons name="server-outline" size={16} color={theme.colors.text} />
        <Text style={s.title}>Sistem Durumu</Text>
        {issues.length > 0 && <View style={s.badge}><Text style={s.badgeT}>{issues.length} uyarı</Text></View>}
      </View>
      {!snap ? <ActivityIndicator style={{ marginTop: 10 }} /> : (
        <>
          <Text style={s.label}>Veritabanı diski · {snap.diskUsedMB ?? '?'} / {snap.diskTotalMB ?? '?'} MB</Text>
          <View style={s.bar}><View style={[s.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} /></View>
          <Text style={s.muted}>%{pct} dolu · Firma {snap.companies} · Kullanıcı {snap.users} · Bugün e-posta {snap.emailToday} · Bu ay {snap.emailMonth}</Text>
          {issues.map((m) => <Text key={m} style={s.issue}>⚠️ {m}</Text>)}
        </>
      )}
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} onPress={test} disabled={busy} testID="capacity-test-alert">
        <Ionicons name="mail-unread-outline" size={15} color="#fff" />
        <Text style={s.btnT}>{busy ? 'Gönderiliyor…' : 'Test uyarısı gönder'}</Text>
      </TouchableOpacity>
      {!!msg && <Text style={[s.muted, { marginTop: 6 }]}>{msg}</Text>}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: theme.colors.text },
  badge: { backgroundColor: '#dc2626', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginTop: 10 },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.colors.line, marginTop: 6, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  muted: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 6, lineHeight: 16 },
  issue: { fontSize: 12, color: theme.colors.redText, marginTop: 6, lineHeight: 17 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
}));

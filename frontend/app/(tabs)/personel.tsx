import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, StaffMemberT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';

const ROLES: { id: string; label: string; desc: string }[] = [
  { id: 'staff', label: 'Personel', desc: 'Teklif/müşteri/servis girer, Kasa ve Tahsilat\'ı göremez' },
  { id: 'admin', label: 'Yönetici', desc: 'Sizinle aynı yetkilere sahip, Kasa ve Tahsilat dahil her şeyi görür' },
];

export default function PersonelScreen() {
  const router = useRouter();
  const { activeCompany } = useApp();
  const { user } = useAuth();

  const [members, setMembers] = useState<StaffMemberT[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    try {
      const res = await api.listStaff(activeCompany.id);
      setMembers(res || []);
    } catch (e: any) {
      setError('Personel listesi alınamadı');
    }
  }, [activeCompany]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onInvite = async () => {
    if (busy || !activeCompany) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Geçerli bir e-posta girin');
      return;
    }
    setError('');
    setBusy(true);
    setLastInviteLink('');
    try {
      const res = await api.inviteStaff(activeCompany.id, { email: trimmed, role });
      setLastInviteLink(res.invite_link);
      setEmail('');
      await load();
    } catch (e: any) {
      let msg = 'Davet gönderilemedi';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onCopyLink = async () => {
    if (!lastInviteLink) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(lastInviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {}
    }
    // Native fallback: the link is shown in a selectable text field below —
    // long-press it to copy, no extra native module needed.
    setCopied(false);
  };

  const onRemove = async (m: StaffMemberT) => {
    if (!activeCompany) return;
    try {
      if (m.type === 'pending') await api.revokeInvite(activeCompany.id, m.id);
      else await api.removeStaff(activeCompany.id, m.id);
      await load();
    } catch {
      setError('İşlem başarısız, tekrar deneyin');
    }
  };

  if (user?.is_staff) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Personel</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>Bu sayfayı sadece firma sahibi görüntüleyebilir.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="personel-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Personel</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={s.sectionLabel}>Yeni Personel Davet Et</Text>
            <View style={s.card}>
              <TextInput
                style={s.input}
                placeholder="personel@ornek.com"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="staff-invite-email"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.roleChip, role === r.id && s.roleChipActive]}
                    onPress={() => setRole(r.id)}
                    testID={`staff-role-${r.id}`}
                  >
                    <Text style={[s.roleChipText, role === r.id && s.roleChipTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.roleDesc}>{ROLES.find((r) => r.id === role)?.desc}</Text>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onInvite} disabled={busy} testID="staff-invite-submit">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Davet Linki Oluştur</Text>}
              </TouchableOpacity>

              {lastInviteLink ? (
                <View style={s.linkBox}>
                  <TextInput
                    style={s.linkInput}
                    value={lastInviteLink}
                    editable={false}
                    selectTextOnFocus
                    multiline
                    testID="staff-invite-link-text"
                  />
                  <TouchableOpacity style={s.copyBtn} onPress={onCopyLink} testID="staff-invite-copy">
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={theme.colors.primary} />
                    <Text style={s.copyBtnText}>{copied ? 'Kopyalandı' : Platform.OS === 'web' ? 'Kopyala' : 'Seçip kopyala'}</Text>
                  </TouchableOpacity>
                  <Text style={s.linkHint}>Bu linki WhatsApp, e-posta — nasıl istersen personelinle paylaş.</Text>
                </View>
              ) : null}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>Ekip ({members.length})</Text>
            {members.length === 0 ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Henüz personel eklemediniz.</Text>
            ) : (
              members.map((m) => (
                <View key={`${m.type}-${m.id}`} style={s.memberRow} testID={`staff-row-${m.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberEmail} numberOfLines={1}>{m.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={[s.badge, m.type === 'pending' && s.badgePending]}>
                        <Text style={[s.badgeText, m.type === 'pending' && s.badgeTextPending]}>
                          {m.type === 'pending' ? 'Davet bekliyor' : m.role === 'admin' ? 'Yönetici' : 'Personel'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity style={s.removeBtn} onPress={() => onRemove(m)} testID={`staff-remove-${m.id}`}>
                    <Ionicons name="close" size={16} color={theme.colors.red} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  input: {
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: theme.colors.text,
  },
  roleChip: { flex: 1, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  roleChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  roleChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSoft },
  roleChipTextActive: { color: theme.colors.primary },
  roleDesc: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 8, lineHeight: 16 },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  ctaText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  linkBox: { marginTop: 14, backgroundColor: theme.colors.primarySoft, borderRadius: 12, padding: 12 },
  linkInput: { fontSize: 12, color: theme.colors.text, marginBottom: 8, backgroundColor: '#fff', borderRadius: 8, padding: 8 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
  linkHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 12,
    marginBottom: 8,
  },
  memberEmail: { fontSize: 13.5, fontWeight: '700', color: theme.colors.text },
  badge: { backgroundColor: theme.colors.greenSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  badgePending: { backgroundColor: theme.colors.goldSoft },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: '#166534' },
  badgeTextPending: { color: theme.colors.goldDark },
  removeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.redSoft, marginLeft: 10 },
});

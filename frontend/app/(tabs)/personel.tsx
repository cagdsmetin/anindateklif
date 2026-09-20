import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
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
import { useLanguage, upper } from '@/src/lib/i18n';
import { IconBadge, MotionInput, MotionScrollView, Reveal, ScreenHero, themedStyles } from '@/src/components/motion';

const ROLE_IDS = ['staff', 'admin'] as const;

export default function PersonelScreen() {
  const { t } = useLanguage();
  const ROLES: { id: string; label: string; desc: string }[] = [
    { id: 'staff', label: t('personel.s001'), desc: t('personel.s003') },
    { id: 'admin', label: t('personel.s002'), desc: t('personel.s004') },
  ];
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
      setError(t('personel.s005'));
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
      setError(t('personel.s006'));
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
      let msg = t('personel.s007');
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
      setError(t('personel.s008'));
    }
  };

  if (user?.is_staff) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('personel.s001')}</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>{t('personel.s009')}</Text>
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
        <Text style={s.headerTitle}>{t('personel.s001')}</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MotionScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <ScreenHero
              icon="person-add"
              title={t('personel.s001')}
              subtitle={activeCompany?.sirketAdi}
              color={theme.colors.gold}
              stats={[
                { label: 'EKİPTE', value: members.filter((m) => m.type !== 'pending').length },
                { label: 'DAVET BEKLİYOR', value: members.filter((m) => m.type === 'pending').length, tone: '#FCD34D' },
                { label: 'YÖNETİCİ', value: members.filter((m) => m.role === 'admin').length },
              ]}
            />
            <Text style={s.sectionLabel}>{upper(t('personel.s010'))}</Text>
            <View style={s.card}>
              <MotionInput
                style={s.input}
                placeholder={t('personel.s011')}
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="staff-invite-email"
              />
              <View style={{ gap: 9, marginTop: 14 }}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.roleRow, role === r.id && s.roleRowActive]}
                    onPress={() => setRole(r.id)}
                    testID={`staff-role-${r.id}`}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={role === r.id ? 'radio-button-on' : 'radio-button-off'}
                      size={19}
                      color={role === r.id ? theme.colors.primary : theme.colors.lineDark}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.roleRowLabel, role === r.id && s.roleRowLabelActive]}>{r.label}</Text>
                      <Text style={s.roleRowDesc}>{r.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} onPress={onInvite} disabled={busy} testID="staff-invite-submit">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('personel.s012')}</Text>}
              </TouchableOpacity>

              {lastInviteLink ? (
                <View style={s.linkBox}>
                  <MotionInput
                    style={s.linkInput}
                    value={lastInviteLink}
                    editable={false}
                    selectTextOnFocus
                    multiline
                    testID="staff-invite-link-text"
                  />
                  <TouchableOpacity style={s.copyBtn} onPress={onCopyLink} testID="staff-invite-copy">
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={theme.colors.primary} />
                    <Text style={s.copyBtnText}>{copied ? t('personel.s013') : Platform.OS === 'web' ? t('personel.s019') : t('personel.s014')}</Text>
                  </TouchableOpacity>
                  <Text style={s.linkHint}>{t('personel.s015')}</Text>
                </View>
              ) : null}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 22 }]}>{upper(t('personel.s016'))}{members.length})</Text>
            {members.length === 0 ? (
              <View style={s.emptyBox}>
                <IconBadge icon="people-outline" color={theme.colors.gold} size={40} motion="float" />
                <Text style={s.emptyTitle}>{t('personel.s018')}</Text>
                <Text style={s.emptyText}>
                  Yukarıya bir e-posta yazıp davet linki oluşturun; ekip arkadaşınız linke tıkladığında
                  kendi hesabıyla firmanıza katılır.
                </Text>
              </View>
            ) : (
              members.map((m, idx) => (
                <Reveal key={`${m.type}-${m.id}`} variant={idx % 2 === 0 ? 'left' : 'right'} distance={18}>
                <View style={s.memberRow} testID={`staff-row-${m.id}`}>
                  <IconBadge
                    icon={m.type === 'pending' ? 'mail-unread' : m.role === 'admin' ? 'shield-checkmark' : 'person'}
                    color={m.type === 'pending' ? theme.colors.gold : theme.colors.primary}
                    size={34}
                    motion="pop"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.memberEmail} numberOfLines={1}>{m.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={[s.badge, m.type === 'pending' && s.badgePending]}>
                        <Text style={[s.badgeText, m.type === 'pending' && s.badgeTextPending]}>
                          {m.type === 'pending' ? t('personel.s020') : m.role === 'admin' ? t('personel.s002') : t('personel.s001')}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity style={s.removeBtn} onPress={() => onRemove(m)} testID={`staff-remove-${m.id}`}>
                    <Ionicons name="close" size={16} color={theme.colors.red} />
                  </TouchableOpacity>
                </View>
                </Reveal>
              ))
            )}
          </MotionScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSoft,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  input: {
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: theme.colors.text,
  },
  roleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    borderWidth: 1, borderColor: theme.colors.line, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 13, backgroundColor: theme.colors.surfaceSoft,
  },
  roleRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  roleRowLabel: { fontSize: 13.5, fontWeight: '800', color: theme.colors.textSoft },
  roleRowLabelActive: { color: theme.colors.primary },
  roleRowDesc: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 3, lineHeight: 16 },
  emptyBox: {
    alignItems: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 18,
    borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 18,
    backgroundColor: theme.colors.surfaceSoft,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  emptyText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },
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
  linkInput: { fontSize: 12, color: theme.colors.text, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 8 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: theme.colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyBtnText: { fontSize: 12.5, fontWeight: '800', color: theme.colors.primary },
  linkHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 12,
    marginBottom: 8,
  },
  memberEmail: { fontSize: 13.5, fontWeight: '700', color: theme.colors.text },
  badge: { backgroundColor: theme.colors.greenSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  badgePending: { backgroundColor: theme.colors.goldSoft },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: theme.colors.greenText },
  badgeTextPending: { color: theme.colors.goldDark },
  removeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.redSoft, marginLeft: 10 },
}));

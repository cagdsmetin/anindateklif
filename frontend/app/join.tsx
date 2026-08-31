import React, { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, StaffInviteInfoT } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { evaluatePassword, isPasswordValid, PASSWORD_RULE_LABELS, PasswordRuleKey } from '@/src/utils/password-validation';
import { useLanguage } from '@/src/lib/i18n';

export default function JoinScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token || '';
  const { acceptInvite } = useAuth();

  const [info, setInfo] = useState<StaffInviteInfoT | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api.getInviteInfo(token)
      .then((res) => setInfo(res))
      .catch(() => setInfo({ valid: false, reason: t('join.s001') }))
      .finally(() => setLoading(false));
  }, [token]);

  const pwStatus = evaluatePassword(password);
  const pwValid = isPasswordValid(password);

  const onSubmit = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t('join.s002')); return; }
    if (!pwValid) { setError(t('join.s003')); return; }
    setError('');
    setBusy(true);
    try {
      await acceptInvite(token, name.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      let msg = t('join.s004');
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

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.logoWrap}>
            <View style={s.logoBadge}>
              <Ionicons name="flash" size={22} color="#fff" />
            </View>
            <Text style={s.appName}>{t('join.s005')}</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : !info?.valid ? (
            <View style={s.card}>
              <Ionicons name="alert-circle-outline" size={30} color={theme.colors.red} />
              <Text style={s.errorTitle}>{t('join.s006')}</Text>
              <Text style={s.errorBody}>{info?.reason || t('join.s007')}</Text>
            </View>
          ) : (
            <View style={s.card}>
              <Text style={s.title}>{info.company_name}</Text>
              <Text style={s.subtitle}>{t('join.s008')}</Text>
              <Text style={s.emailLine}>{info.email} · {info.role === 'admin' ? t('join.s010') : 'Personel'}</Text>

              <View style={{ marginTop: 20, gap: 12 }}>
                <TextInput
                  style={s.input}
                  placeholder={t('join.s011')}
                  placeholderTextColor="#94a3b8"
                  value={name}
                  onChangeText={setName}
                  testID="join-name"
                />
                <TextInput
                  style={s.input}
                  placeholder={t('join.s012')}
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  testID="join-password"
                />
              </View>

              <PasswordChecklist status={pwStatus} />

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.cta, (busy || !pwValid || !name.trim()) && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={busy || !pwValid || !name.trim()}
                testID="join-submit"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{t('join.s013')}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordChecklist({ status }: { status: Record<PasswordRuleKey, boolean> }) {
  const { t } = useLanguage();
  const RULES: PasswordRuleKey[] = ['lower', 'upper', 'digit', 'symbol', 'length'];
  return (
    <View style={s.pwBlock}>
      <Text style={s.pwTitle}>{t('join.s014')}</Text>
      <View style={s.pwList}>
        {RULES.map((k) => (
          <View key={k} style={s.pwRow}>
            <Ionicons
              name={status[k] ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={status[k] ? theme.colors.green : theme.colors.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={[s.pwText, status[k] && { color: theme.colors.textSoft }]}>
              {PASSWORD_RULE_LABELS[k]}
            </Text>
          </View>
        ))}
      </View>
      <Text style={s.pwHint}>{t('join.s015')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoBadge: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  appName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, marginBottom: 10 },
  emailLine: { fontSize: 12.5, color: theme.colors.textSoft, fontWeight: '700' },
  input: {
    width: '100%',
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: theme.colors.text,
  },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  errorTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 10 },
  errorBody: { fontSize: 12.5, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    width: '100%',
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pwBlock: { width: '100%', marginTop: 14, padding: 12, backgroundColor: theme.colors.surfaceSoft, borderRadius: 12 },
  pwTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 8 },
  pwList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pwRow: { flexDirection: 'row', alignItems: 'center', width: '47%' },
  pwText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  pwHint: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 8, lineHeight: 14 },
});

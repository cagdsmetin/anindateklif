import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, CommissionRuleT, QuoteT, RatesT, TeamDirectoryMemberT } from '@/src/lib/api';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';
import { PeriodChips } from '@/src/components/kasa/shared';
import { PeriodKey, buildPeriod, inRange, tl } from '@/src/lib/finance';
import { convertToTRY } from '@/src/lib/tahsilat-utils';
import { fill, useLanguage } from '@/src/lib/i18n';

// Personel primi: her ekip üyesi için oran (%) ve baz (ciro veya kâr).
// Dönemde (onay tarihine göre) o kişinin oluşturduğu onaylı tekliflerden
// hesaplanır. Ciro = KDV hariç, iskonto sonrası tutar (TL'ye çevrilir);
// kâr bazında maliyeti girilmemiş teklifler hesaba katılmaz.

type Person = { id: string; name: string; email: string; owner?: boolean };

const approvedDate = (q: QuoteT) => (q.approvedAt || q.tarih || '').slice(0, 10);

export default function CommissionScreen() {
  const { t, lang } = useLanguage();
  const tp = (k: string) => t('prim.' + k);
  const insets = useSafeAreaInsets();
  const { activeCompany, quotes, showToast } = useApp();
  const { user: me } = useAuth();
  const [staff, setStaff] = useState<TeamDirectoryMemberT[] | null>(null);
  const [rules, setRules] = useState<Record<string, CommissionRuleT>>({});
  const [rates, setRates] = useState<RatesT | null>(null);
  const [pk, setPk] = useState<PeriodKey>('thisMonth');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Yönetici = firma sahibi ya da admin rollü personel (backend'de de aynı kural).
  const isManager = !me?.is_staff || me?.staff_role === 'admin';

  useEffect(() => {
    if (!activeCompany || !isManager) return;
    // Ekip rehberi hem sahip hem admin personel için açık (üye listesi sadece sahibe).
    api.teamDirectory(activeCompany.id).then(setStaff).catch(() => setStaff([]));
    api.getCommissionSettings(activeCompany.id).then((r) => setRules(Object.fromEntries(r.rules.map((x) => [x.memberId, x])))).catch(() => {});
    api.rates().then(setRates).catch(() => {});
  }, [activeCompany, isManager]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const period = useMemo(() => buildPeriod(pk), [pk, lang]);

  const people: Person[] = useMemo(
    () => (staff || []).map((m) => ({ id: m.userId, name: m.name || m.email, email: m.email, owner: m.role === 'owner' })),
    [staff],
  );

  const rows = useMemo(() => people.map((p) => {
    const rule = rules[p.id] || { memberId: p.id, oran: 0, baz: 'ciro' as const };
    const qs = quotes.filter((q) => q.durum === 'Onaylandı' && !q.deletedAt && inRange(approvedDate(q), period.start, period.end)
      && (q.createdByUserId ? q.createdByUserId === p.id : !!p.owner));
    let ciro = 0, kar = 0, karSayi = 0;
    const detail = qs.map((q) => {
      const c = convertToTRY(q.araToplam || 0, q.paraBirimi || 'USD', rates) || 0;
      const m = q.maliyet != null ? convertToTRY(q.maliyet, q.paraBirimi || 'USD', rates) || 0 : null;
      ciro += c;
      if (m != null) { kar += c - m; karSayi += 1; }
      return { q, c, k: m != null ? c - m : null };
    });
    const baz = rule.baz === 'kar' ? kar : ciro;
    return { p, rule, count: qs.length, ciro, kar, karSayi, prim: Math.max(0, baz * (rule.oran || 0) / 100), detail };
  }), [people, rules, quotes, period, rates]);

  const total = rows.reduce((a, r) => a + r.prim, 0);

  if (!activeCompany || !isManager) {
    return <SafeAreaView style={s.container} edges={['top']}><TopHeader title={tp('title')} /><Text style={[s.muted, { padding: 20 }]}>{tp('ownerOnly')}</Text></SafeAreaView>;
  }

  const setRule = (id: string, patch: Partial<CommissionRuleT>) => {
    setRules((r) => ({ ...r, [id]: { ...(r[id] || { memberId: id, oran: 0, baz: 'ciro' }), ...patch } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.putCommissionSettings(activeCompany.id, Object.values(rules));
      setDirty(false);
      showToast(tp('saved'));
    } catch (e: any) { showToast(e?.message || tp('saveErr')); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tp('title')} />
      <MotionScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
        <ScreenHero
          icon="trophy"
          title={tp('title')}
          subtitle={`${period.start} – ${period.end}`}
          color={theme.colors.modules.prim}
          stats={[{ label: tp('statTotal') + ' (₺)', value: Math.round(total) }, { label: tp('statPeople'), value: people.length }]}
        />
        <PeriodChips value={pk} onChange={setPk} />

        {staff == null ? <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.modules.prim} /> : rows.map((r) => (
          <View key={r.p.id} style={s.card} testID={`prim-${r.p.id}`}>
            <TouchableOpacity style={s.head} onPress={() => setOpen(open === r.p.id ? null : r.p.id)} activeOpacity={0.85}>
              <View style={s.avatar}><Text style={s.avatarT}>{(r.p.name || '?').slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{r.p.name}{r.p.id === me?.user_id ? ` (${tp('you')})` : ''}</Text>
                <Text style={s.muted}>{fill(tp('summary'), { n: r.count, ciro: tl(r.ciro) })}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.prim}>{tl(r.prim)}</Text>
                <Text style={s.muted}>%{r.rule.oran || 0} · {r.rule.baz === 'kar' ? tp('bazKar') : tp('bazCiro')}</Text>
              </View>
            </TouchableOpacity>
            <View style={s.ruleRow}>
              <Text style={s.label}>{tp('rate')}</Text>
              <MotionInput
                style={s.rateInput}
                keyboardType="decimal-pad"
                value={r.rule.oran ? String(r.rule.oran) : ''}
                placeholder="0"
                placeholderTextColor="#94a3b8"
                onChangeText={(v) => setRule(r.p.id, { oran: Math.min(100, Number(v.replace(',', '.')) || 0) })}
                testID={`prim-rate-${r.p.id}`}
              />
              {(['ciro', 'kar'] as const).map((b) => (
                <TouchableOpacity key={b} style={[s.chip, r.rule.baz === b && s.chipA]} onPress={() => setRule(r.p.id, { baz: b })}>
                  <Text style={[s.chipT, r.rule.baz === b && { color: '#fff' }]}>{b === 'kar' ? tp('bazKar') : tp('bazCiro')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {r.rule.baz === 'kar' && r.karSayi < r.count && (
              <Text style={s.warn}>{fill(tp('missingCost'), { m: r.count - r.karSayi })}</Text>
            )}
            {open === r.p.id && (
              <View style={{ marginTop: 8 }}>
                {r.detail.length === 0 ? <Text style={s.muted}>{tp('noQuotes')}</Text> : r.detail.map(({ q, c, k }) => (
                  <View key={q.id} style={s.qRow}>
                    <Text style={s.qT} numberOfLines={1}>{q.teklifNo} · {q.musFirma}</Text>
                    <Text style={s.qV}>{tl(c)}{k != null ? `  (${tp('bazKar')} ${tl(k)})` : ''}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {dirty && (
          <View style={{ marginTop: 14 }}>
            <BubbleButton icon="checkmark" label={saving ? '…' : tp('save')} color={theme.colors.modules.prim} size="lg" loading={saving} onPress={save} testID="prim-save" />
          </View>
        )}
        <Text style={[s.muted, { marginTop: 12 }]}>{tp('note')}</Text>
        {!rates && <Text style={[s.muted, { marginTop: 4 }]}><Ionicons name="alert-circle-outline" size={12} /> {tp('noRates')}</Text>}
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  page: { padding: 14, width: '100%', maxWidth: 880, alignSelf: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginTop: 10, ...theme.shadow.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.modules.prim + '22', alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontSize: 15, fontWeight: '900', color: theme.colors.modules.prim },
  name: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  prim: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  muted: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  warn: { fontSize: 11.5, color: theme.colors.redText, marginTop: 6 },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, letterSpacing: 0.4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  rateInput: { width: 64, textAlign: 'center', fontSize: 14, fontWeight: '800', color: theme.colors.text, backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, borderWidth: 1.5, borderColor: theme.colors.lineDark, paddingVertical: Platform.OS === 'ios' ? 8 : 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.prim, borderColor: theme.colors.modules.prim },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.colors.line },
  qT: { flex: 1, fontSize: 12, color: theme.colors.text, fontWeight: '600' },
  qV: { fontSize: 12, color: theme.colors.text, fontWeight: '800' },
}));

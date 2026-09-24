import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import { api, CouponT } from '@/src/lib/api';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';
import { fill, useLanguage } from '@/src/lib/i18n';

// Müşteriye verilen kampanya / indirim kodları. Teklif ekranındaki "Kupon"
// alanına yazılan kod doğrulanıp iskontoya çevrilir, kullanım sayısı artar.

type Form = { id?: string; kod: string; aciklama: string; tip: 'yuzde' | 'tutar'; deger: string; paraBirimi: string; baslangic: string; bitis: string; maxKullanim: string; aktif: boolean };
const EMPTY: Form = { kod: '', aciklama: '', tip: 'yuzde', deger: '', paraBirimi: 'TRY', baslangic: '', bitis: '', maxKullanim: '', aktif: true };

function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

export default function CouponsScreen() {
  const { t } = useLanguage();
  const tk = (k: string) => t('coupons.' + k);
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast } = useApp();
  const { user: me } = useAuth();
  const isOwner = !me?.is_staff;
  const [list, setList] = useState<CouponT[] | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    try { setList(await api.listCoupons(activeCompany.id)); } catch (e: any) { setList([]); showToast(e?.message || tk('loadErr')); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany]);
  useEffect(() => { load(); }, [load]);

  if (!activeCompany) {
    return <SafeAreaView style={s.container} edges={['top']}><TopHeader title={tk('title')} /></SafeAreaView>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (c: CouponT): { label: string; color: string } => {
    if (!c.aktif) return { label: tk('stPassive'), color: theme.colors.textMuted };
    if (c.bitis && today > c.bitis) return { label: tk('stExpired'), color: theme.colors.red };
    if (c.baslangic && today < c.baslangic) return { label: tk('stScheduled'), color: theme.colors.gold };
    if (c.maxKullanim && c.kullanim >= c.maxKullanim) return { label: tk('stUsedUp'), color: theme.colors.red };
    return { label: tk('stActive'), color: theme.colors.green };
  };
  const valueText = (c: CouponT) => (c.tip === 'yuzde' ? `%${c.deger}` : `${new Intl.NumberFormat('tr-TR').format(c.deger)} ${c.paraBirimi}`);

  const save = async () => {
    if (!f) return;
    const deger = Number(f.deger.replace(',', '.'));
    if (!f.kod.trim() || !deger) { showToast(tk('fillRequired')); return; }
    const dateOk = (d: string) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!dateOk(f.baslangic) || !dateOk(f.bitis)) { showToast(tk('dateFormat')); return; }
    setSaving(true);
    try {
      const body = {
        companyId: activeCompany.id, kod: f.kod, aciklama: f.aciklama, tip: f.tip, deger, paraBirimi: f.paraBirimi,
        baslangic: f.baslangic, bitis: f.bitis, maxKullanim: parseInt(f.maxKullanim, 10) || 0, aktif: f.aktif,
      };
      if (f.id) await api.updateCoupon(f.id, body); else await api.createCoupon(body);
      showToast(tk('saved'));
      setF(null);
      load();
    } catch (e: any) { showToast(e?.message || tk('saveErr')); } finally { setSaving(false); }
  };

  const remove = async (c: CouponT) => {
    if (Platform.OS === 'web' && !window.confirm(fill(tk('deleteConfirm'), { kod: c.kod }))) return;
    try { await api.deleteCoupon(c.id); setList((l) => (l || []).filter((x) => x.id !== c.id)); } catch (e: any) { showToast(e?.message || ''); }
  };

  const share = (c: CouponT) => {
    const msg = fill(tk('shareMsg'), {
      company: activeCompany.sirketAdi || '', kod: c.kod, value: valueText(c),
      until: c.bitis ? fill(tk('shareUntil'), { d: c.bitis.split('-').reverse().join('.') }) : '',
    });
    Share.share({ message: msg }).catch(() => {});
  };

  const edit = (c: CouponT) => setF({
    id: c.id, kod: c.kod, aciklama: c.aciklama, tip: c.tip, deger: String(c.deger), paraBirimi: c.paraBirimi,
    baslangic: c.baslangic, bitis: c.bitis, maxKullanim: c.maxKullanim ? String(c.maxKullanim) : '', aktif: c.aktif,
  });

  const activeCount = (list || []).filter((c) => statusOf(c).color === theme.colors.green).length;
  const totalUse = (list || []).reduce((a, c) => a + (c.kullanim || 0), 0);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tk('title')} />
      <MotionScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
        <ScreenHero
          icon="pricetags"
          title={tk('title')}
          subtitle={tk('subtitle')}
          color={theme.colors.modules.kupon}
          stats={[{ label: tk('statActive'), value: activeCount }, { label: tk('statUsed'), value: totalUse }]}
        />

        {isOwner && !f && (
          <BubbleButton icon="add" label={tk('new')} color={theme.colors.modules.kupon} size="lg" onPress={() => setF({ ...EMPTY, kod: randomCode() })} testID="coupon-new" />
        )}

        {f && (
          <View style={s.card}>
            <Text style={s.label}>{tk('code')}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <MotionInput style={[s.input, { flex: 1, fontWeight: '900', letterSpacing: 1 }]} autoCapitalize="characters" value={f.kod} onChangeText={(v) => setF({ ...f, kod: v.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} testID="coupon-kod" />
              <TouchableOpacity style={s.iconBtn} onPress={() => setF({ ...f, kod: randomCode() })}><Ionicons name="shuffle" size={18} color={theme.colors.text} /></TouchableOpacity>
            </View>
            <Text style={s.label}>{tk('desc')}</Text>
            <MotionInput style={s.input} value={f.aciklama} onChangeText={(v) => setF({ ...f, aciklama: v })} placeholder={tk('descPh')} placeholderTextColor="#94a3b8" />
            <Text style={s.label}>{tk('type')}</Text>
            <View style={s.chips}>
              {(['yuzde', 'tutar'] as const).map((x) => (
                <TouchableOpacity key={x} style={[s.chip, f.tip === x && s.chipA]} onPress={() => setF({ ...f, tip: x })}>
                  <Text style={[s.chipT, f.tip === x && { color: '#fff' }]}>{x === 'yuzde' ? tk('percent') : tk('fixed')}</Text>
                </TouchableOpacity>
              ))}
              {f.tip === 'tutar' && ['TRY', 'USD', 'EUR'].map((c) => (
                <TouchableOpacity key={c} style={[s.chip, f.paraBirimi === c && s.chipA]} onPress={() => setF({ ...f, paraBirimi: c })}>
                  <Text style={[s.chipT, f.paraBirimi === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{f.tip === 'yuzde' ? tk('valuePct') : tk('valueAmt')}</Text>
                <MotionInput style={s.input} keyboardType="decimal-pad" value={f.deger} onChangeText={(v) => setF({ ...f, deger: v })} testID="coupon-deger" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{tk('maxUse')}</Text>
                <MotionInput style={s.input} keyboardType="number-pad" value={f.maxKullanim} onChangeText={(v) => setF({ ...f, maxKullanim: v.replace(/\D/g, '') })} placeholder={tk('unlimited')} placeholderTextColor="#94a3b8" />
              </View>
            </View>
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{tk('start')}</Text>
                <MotionInput style={s.input} value={f.baslangic} onChangeText={(v) => setF({ ...f, baslangic: v })} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{tk('end')}</Text>
                <MotionInput style={s.input} value={f.bitis} onChangeText={(v) => setF({ ...f, bitis: v })} placeholder="YYYY-AA-GG" placeholderTextColor="#94a3b8" testID="coupon-bitis" />
              </View>
            </View>
            <View style={[s.row2, { alignItems: 'center', marginTop: 12 }]}>
              <Switch value={f.aktif} onValueChange={(v) => setF({ ...f, aktif: v })} />
              <Text style={s.rowT}>{tk('activeLbl')}</Text>
            </View>
            <View style={[s.row2, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}><BubbleButton icon="close" label={tk('cancel')} color={theme.colors.textMuted} onPress={() => setF(null)} /></View>
              <View style={{ flex: 1.4 }}><BubbleButton icon="checkmark" label={saving ? '…' : tk('save')} color={theme.colors.modules.kupon} loading={saving} onPress={save} testID="coupon-save" /></View>
            </View>
          </View>
        )}

        <Text style={s.sectionH}>{tk('listTitle')}</Text>
        {list == null ? <ActivityIndicator color={theme.colors.modules.kupon} /> : list.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', gap: 6 }]}>
            <Ionicons name="pricetag-outline" size={26} color={theme.colors.textMuted} />
            <Text style={s.muted}>{tk('empty')}</Text>
          </View>
        ) : list.map((c) => {
          const st = statusOf(c);
          return (
            <View key={c.id} style={[s.card, s.item]} testID={`coupon-${c.kod}`}>
              <View style={s.ticket}><Text style={s.ticketV}>{valueText(c)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.kod}>{c.kod}</Text>
                {c.aciklama ? <Text style={s.muted} numberOfLines={1}>{c.aciklama}</Text> : null}
                <Text style={s.muted}>
                  <Text style={{ color: st.color, fontWeight: '800' }}>{st.label}</Text>
                  {` · ${fill(tk('used'), { n: c.kullanim, max: c.maxKullanim || '∞' })}`}
                  {c.bitis ? ` · ${tk('until')} ${c.bitis.split('-').reverse().join('.')}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={s.iconBtn} onPress={() => share(c)}><Ionicons name="share-social-outline" size={17} color={theme.colors.text} /></TouchableOpacity>
              {isOwner && <TouchableOpacity style={s.iconBtn} onPress={() => edit(c)}><Ionicons name="pencil" size={16} color={theme.colors.primary} /></TouchableOpacity>}
              {isOwner && <TouchableOpacity style={s.iconBtn} onPress={() => remove(c)}><Ionicons name="trash-outline" size={16} color={theme.colors.red} /></TouchableOpacity>}
            </View>
          );
        })}
        <Text style={[s.muted, { marginTop: 10 }]}>{tk('howTo')}</Text>
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  page: { padding: 14, width: '100%', maxWidth: 880, alignSelf: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginTop: 10, ...theme.shadow.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticket: { minWidth: 70, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.colors.modules.kupon + '18', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.modules.kupon, alignItems: 'center' },
  ticketV: { fontSize: 14, fontWeight: '900', color: theme.colors.modules.kupon },
  kod: { fontSize: 15, fontWeight: '900', color: theme.colors.text, letterSpacing: 1 },
  muted: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.text, marginTop: 20, letterSpacing: 0.5 },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginTop: 12, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 9, fontSize: 14, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8 },
  rowT: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.kupon, borderColor: theme.colors.modules.kupon },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceSoft },
}));

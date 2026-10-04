import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import TopHeader from '@/src/components/TopHeader';
import QrView from '@/src/components/QrView';
import { api, BusinessCardT } from '@/src/lib/api';
import { fill, upper, useLanguage } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';

// Dijital kartvizit ayarları: adres (slug), yayın anahtarı, slogan, sosyal
// medya, renk. Ad/logo/telefon/adres/IBAN Firma bilgilerinden gelir.

const BASE = 'https://www.anindateklif.co';
const COLORS = ['#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#EA580C', '#DB2777', '#7C3AED', '#0F172A'];
const SOCIALS: { key: keyof BusinessCardT; icon: keyof typeof Ionicons.glyphMap; ph: string }[] = [
  { key: 'instagram', icon: 'logo-instagram', ph: '@kullaniciadi' },
  { key: 'facebook', icon: 'logo-facebook', ph: 'sayfaadi' },
  { key: 'linkedin', icon: 'logo-linkedin', ph: 'sirket-adi' },
  { key: 'youtube', icon: 'logo-youtube', ph: '@kanal' },
  { key: 'tiktok', icon: 'logo-tiktok', ph: '@kullaniciadi' },
  { key: 'x', icon: 'logo-twitter', ph: '@kullaniciadi' },
];

export default function KartvizitScreen() {
  const { t } = useLanguage();
  const tk = (k: string) => t('kart.' + k);
  const { activeCompany, showToast } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [card, setCard] = useState<BusinessCardT | null>(null);
  const [savedSlug, setSavedSlug] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!activeCompany || restricted) return;
    api.getBusinessCard(activeCompany.id).then((c) => { setCard(c); setSavedSlug(c.aktif ? c.slug : ''); }).catch((e) => showToast(e?.message || ''));
  }, [activeCompany, restricted, showToast]));

  if (!activeCompany || restricted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tk('title')} />
        <View style={s.center}><Text style={s.muted}>{tk('noAccess')}</Text></View>
      </SafeAreaView>
    );
  }
  if (!card) return <SafeAreaView style={[s.container, s.center]}><ActivityIndicator color={theme.colors.primary} /></SafeAreaView>;

  const set = <K extends keyof BusinessCardT>(k: K, v: BusinessCardT[K]) => setCard({ ...card, [k]: v });
  const url = `${BASE}/k/${savedSlug}`;
  const color = card.renk || theme.colors.primary;

  const save = async () => {
    setSaving(true);
    try {
      const c = await api.putBusinessCard(card);
      setCard(c); setSavedSlug(c.aktif ? c.slug : '');
      showToast(tk('saved'));
    } catch (e: any) { showToast(e?.message || ''); } finally { setSaving(false); }
  };

  const shareLink = () => {
    if (Platform.OS === 'web' && (navigator as any).share) (navigator as any).share({ title: activeCompany.sirketAdi, url }).catch(() => {});
    else if (Platform.OS === 'web') (navigator as any).clipboard?.writeText(url).then(() => showToast(tk('copied'))).catch(() => {});
    else Share.share({ message: url }).catch(() => {});
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tk('title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero icon="card" title={tk('title')} subtitle={activeCompany.sirketAdi} color={color}
            stats={savedSlug ? [{ label: tk('views'), value: card.goruntulenme || 0 }] : undefined} />
          <Text style={s.intro}>{tk('intro')}</Text>

          {savedSlug ? (
            <View style={s.card}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={s.qrBox}><QrView value={url} size={150} /></View>
                <View style={{ flex: 1, minWidth: 180, gap: 8 }}>
                  <Text style={s.label}>{upper(tk('link'))}</Text>
                  <Text style={s.link} selectable>{url.replace('https://', '')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity style={s.smallBtn} onPress={shareLink} testID="kart-share"><Ionicons name="share-social-outline" size={15} color={theme.colors.text} /><Text style={s.smallBtnText}>{tk('share')}</Text></TouchableOpacity>
                    <TouchableOpacity style={s.smallBtn} onPress={() => (Platform.OS === 'web' ? Linking.openURL(url) : router.push(`/k/${savedSlug}` as any))} testID="kart-open"><Ionicons name="eye-outline" size={15} color={theme.colors.text} /><Text style={s.smallBtnText}>{tk('preview')}</Text></TouchableOpacity>
                  </View>
                  <Text style={s.hint}>{tk('qrHint')}</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={s.card}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchTitle}>{tk('active')}</Text>
                <Text style={s.hint}>{tk('activeHint')}</Text>
              </View>
              <Switch value={card.aktif} onValueChange={(v) => set('aktif', v)} testID="kart-aktif" />
            </View>

            <Text style={[s.label, { marginTop: 14 }]}>{upper(tk('slug'))}</Text>
            <View style={s.slugRow}>
              <Text style={s.slugPrefix}>anindateklif.co/k/</Text>
              <MotionInput style={[s.input, { flex: 1 }]} value={card.slug} autoCapitalize="none" onChangeText={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} testID="kart-slug" />
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{upper(tk('slogan'))}</Text>
            <MotionInput style={s.input} value={card.slogan} onChangeText={(v) => set('slogan', v)} placeholder={tk('sloganPh')} placeholderTextColor="#94a3b8" testID="kart-slogan" />
            <Text style={[s.label, { marginTop: 12 }]}>{upper(tk('about'))}</Text>
            <MotionInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={card.hakkinda} onChangeText={(v) => set('hakkinda', v)} placeholder={tk('aboutPh')} placeholderTextColor="#94a3b8" testID="kart-about" />

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{upper(tk('whatsapp'))}</Text>
                <MotionInput style={s.input} value={card.whatsapp} keyboardType="phone-pad" onChangeText={(v) => set('whatsapp', v)} placeholder={activeCompany.telefon || '05xx'} placeholderTextColor="#94a3b8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{upper(tk('maps'))}</Text>
                <MotionInput style={s.input} value={card.konumUrl} autoCapitalize="none" onChangeText={(v) => set('konumUrl', v)} placeholder="https://maps.app.goo.gl/..." placeholderTextColor="#94a3b8" />
              </View>
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{upper(tk('social'))}</Text>
            {SOCIALS.map((x) => (
              <View key={x.key} style={s.socialRow}>
                <Ionicons name={x.icon} size={20} color={theme.colors.textSoft} />
                <MotionInput style={[s.input, { flex: 1 }]} value={String(card[x.key] || '')} autoCapitalize="none" onChangeText={(v) => set(x.key, v as any)} placeholder={x.ph} placeholderTextColor="#94a3b8" testID={`kart-${x.key}`} />
              </View>
            ))}

            <Text style={[s.label, { marginTop: 12 }]}>{upper(tk('color'))}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => set('renk', c)} style={[s.swatch, { backgroundColor: c }, card.renk === c && s.swatchOn]}>
                  {card.renk === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={[s.switchRow, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchTitle}>{tk('iban')}</Text>
                <Text style={s.hint}>{fill(tk('ibanHint'), { n: (activeCompany.banklar || []).length })}</Text>
              </View>
              <Switch value={card.ibanGoster} onValueChange={(v) => set('ibanGoster', v)} />
            </View>

            <Text style={[s.hint, { marginTop: 12 }]}>{tk('fromCompany')}</Text>
            <BubbleButton icon="checkmark-done" label={saving ? tk('saving') : tk('save')} color={color} size="lg" loading={saving} onPress={save} testID="kart-save" />
          </View>
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  intro: { fontSize: 12, color: theme.colors.textMuted, marginTop: 12, lineHeight: 17 },
  card: { marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  qrBox: { padding: 6, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.line },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  link: { fontSize: 14, fontWeight: '800', color: theme.colors.primary },
  hint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  smallBtnText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  slugRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slugPrefix: { fontSize: 12.5, fontWeight: '700', color: theme.colors.textMuted },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 8, marginTop: 12 },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: theme.colors.surface, boxShadow: '0 0 0 2px #94a3b8' } as any,
}));

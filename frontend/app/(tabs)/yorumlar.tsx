import React, { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { api } from '@/src/lib/api';
import { BubbleButton, MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';
import { useLanguage } from '@/src/lib/i18n';

// Google Haritalar / TripAdvisor yorumuna yapay zekayla yanıt: yorum
// yapıştırılır, puan ve ton seçilir, yanıt kopyalanıp platformda paylaşılır.
// (Google İşletme Profili'ne doğrudan gönderim Google'ın onaylı API
// erişimi ister; bu yüzden kopyala-yapıştır akışı.)

const TONES = ['profesyonel', 'samimi', 'resmi', 'ozur'] as const;

export default function ReviewReplyScreen() {
  const { t } = useLanguage();
  const ty = (k: string) => t('reviews.' + k);
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast } = useApp();
  const [yorum, setYorum] = useState('');
  const [puan, setPuan] = useState(5);
  const [ad, setAd] = useState('');
  const [ton, setTon] = useState<(typeof TONES)[number]>('profesyonel');
  const [talimat, setTalimat] = useState('');
  const [dil, setDil] = useState<'auto' | 'tr' | 'en' | 'it'>('auto');
  const [yanit, setYanit] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!activeCompany) return <SafeAreaView style={s.container} edges={['top']}><TopHeader title={ty('title')} /></SafeAreaView>;

  const gen = async () => {
    if (!yorum.trim()) { showToast(ty('enterReview')); return; }
    setBusy(true);
    try {
      const r = await api.aiReviewReply({ companyId: activeCompany.id, yorum, puan, musteriAdi: ad, ton, talimat, dil: dil === 'auto' ? 'auto' : dil });
      setYanit(r.yanit);
    } catch (e: any) { showToast(e?.message || ty('err')); } finally { setBusy(false); }
  };

  const copy = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(yanit); setCopied(true); setTimeout(() => setCopied(false), 2000); return; } catch {}
    }
    Share.share({ message: yanit }).catch(() => {});
  };

  const openGoogle = () => Linking.openURL('https://business.google.com/reviews');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={ty('title')} />
      <MotionScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
        <ScreenHero icon="star" title={ty('title')} subtitle={ty('subtitle')} color={theme.colors.modules.yorum} />

        <View style={s.card}>
          <Text style={s.label}>{ty('rating')}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setPuan(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} testID={`review-star-${n}`}>
                <Ionicons name={n <= puan ? 'star' : 'star-outline'} size={28} color="#F59E0B" />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>{ty('review')}</Text>
          <MotionInput style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]} multiline value={yorum} onChangeText={setYorum} placeholder={ty('reviewPh')} placeholderTextColor="#94a3b8" testID="review-text" />
          <Text style={s.label}>{ty('name')}</Text>
          <MotionInput style={s.input} value={ad} onChangeText={setAd} placeholder={ty('namePh')} placeholderTextColor="#94a3b8" />
          <Text style={s.label}>{ty('tone')}</Text>
          <View style={s.chips}>
            {TONES.map((x) => (
              <TouchableOpacity key={x} style={[s.chip, ton === x && s.chipA]} onPress={() => setTon(x)}>
                <Text style={[s.chipT, ton === x && { color: '#fff' }]}>{ty('tone_' + x)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>{ty('lang')}</Text>
          <View style={s.chips}>
            {(['auto', 'tr', 'en', 'it'] as const).map((x) => (
              <TouchableOpacity key={x} style={[s.chip, dil === x && s.chipA]} onPress={() => setDil(x)}>
                <Text style={[s.chipT, dil === x && { color: '#fff' }]}>{x === 'auto' ? ty('langAuto') : x.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>{ty('extra')}</Text>
          <MotionInput style={s.input} value={talimat} onChangeText={setTalimat} placeholder={ty('extraPh')} placeholderTextColor="#94a3b8" />
          <View style={{ marginTop: 14 }}>
            <BubbleButton icon="sparkles" label={busy ? ty('writing') : yanit ? ty('regen') : ty('generate')} color={theme.colors.modules.yorum} size="lg" loading={busy} onPress={gen} testID="review-generate" />
          </View>
        </View>

        {!!yanit && (
          <View style={[s.card, { borderColor: theme.colors.modules.yorum }]}>
            <Text style={s.label}>{ty('reply')}</Text>
            <MotionInput style={[s.input, { minHeight: 130, textAlignVertical: 'top' }]} multiline value={yanit} onChangeText={setYanit} testID="review-reply" />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><BubbleButton icon={copied ? 'checkmark' : 'copy-outline'} label={copied ? ty('copied') : ty('copy')} color={theme.colors.navy} onPress={copy} /></View>
              <View style={{ flex: 1 }}><BubbleButton icon="logo-google" label={ty('openGoogle')} color={theme.colors.modules.yorum} onPress={openGoogle} /></View>
            </View>
          </View>
        )}
        <Text style={[s.muted, { marginTop: 10 }]}>{ty('note')}</Text>
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  page: { padding: 14, width: '100%', maxWidth: 880, alignSelf: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginTop: 10, ...theme.shadow.sm },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginTop: 12, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 9, fontSize: 14, color: theme.colors.text },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.yorum, borderColor: theme.colors.modules.yorum },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  muted: { fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16 },
}));

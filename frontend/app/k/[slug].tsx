import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { api, PublicCardT } from '@/src/lib/api';
import { buildVCard } from '@/src/lib/vcard';
import { saveTextFile } from '@/src/lib/save-text';
import { normalizePhoneForWhatsApp } from '@/src/lib/whatsapp';

// Herkese açık dijital kartvizit: anindateklif.co/k/{slug}. Giriş gerektirmez
// (app/_layout.tsx isPublic). Tema her zaman açık; renk firmanın seçtiği vurgu.

const BASE = 'https://www.anindateklif.co';

const SOCIAL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  instagram: 'logo-instagram', facebook: 'logo-facebook', linkedin: 'logo-linkedin', youtube: 'logo-youtube', tiktok: 'logo-tiktok', x: 'logo-twitter',
};

export default function PublicCardScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [card, setCard] = useState<PublicCardT | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!slug) return;
    api.publicBusinessCard(String(slug)).then(setCard).catch((e) => setErr(e?.message || 'Kartvizit bulunamadı'));
  }, [slug]);

  useEffect(() => {
    if (Platform.OS === 'web' && card) document.title = `${card.sirketAdi} · Dijital Kartvizit`;
  }, [card]);

  if (err) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <Ionicons name="card-outline" size={40} color="#94A3B8" />
        <Text style={s.errText}>{err}</Text>
      </SafeAreaView>
    );
  }
  if (!card) return <SafeAreaView style={[s.page, s.center]}><ActivityIndicator color="#4F46E5" /></SafeAreaView>;

  const url = `${BASE}/k/${card.slug}`;
  const accent = card.renk || '#4F46E5';
  const open = (u: string) => Linking.openURL(u).catch(() => {});
  const wa = normalizePhoneForWhatsApp(card.whatsapp);
  const mapsUrl = card.konumUrl || (card.adres ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.adres)}` : '');
  const web = card.website ? (card.website.startsWith('http') ? card.website : `https://${card.website}`) : '';

  const actions = [
    card.telefon && { key: 'call', icon: 'call' as const, label: 'Ara', onPress: () => open(`tel:${card.telefon.replace(/\s+/g, '')}`) },
    wa && { key: 'wa', icon: 'logo-whatsapp' as const, label: 'WhatsApp', onPress: () => open(`https://wa.me/${wa}`) },
    card.email && { key: 'mail', icon: 'mail' as const, label: 'E-posta', onPress: () => open(`mailto:${card.email}`) },
    mapsUrl && { key: 'map', icon: 'navigate' as const, label: 'Yol tarifi', onPress: () => open(mapsUrl) },
  ].filter(Boolean) as { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[];

  // Pano: web'de navigator.clipboard; telefonda (ek native modül olmadan) paylaşım menüsü.
  const copy = async (text: string, key: string) => {
    if (Platform.OS === 'web' && (navigator as any).clipboard) await (navigator as any).clipboard.writeText(text).catch(() => {});
    else { await Share.share({ message: text }).catch(() => {}); return; }
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const saveContact = () => saveTextFile(buildVCard(card, url), `${card.slug}.vcf`, 'text/vcard').catch(() => {});
  const share = async () => {
    if (Platform.OS === 'web' && (navigator as any).share) {
      (navigator as any).share({ title: card.sirketAdi, url }).catch(() => {});
    } else if (Platform.OS === 'web') {
      copy(url, 'link');
    } else {
      Share.share({ message: `${card.sirketAdi}\n${url}` }).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card} testID="public-card">
          <View style={[s.banner, { backgroundColor: accent }]} />
          <View style={s.logoWrap}>
            {card.logoBase64 ? (
              <Image source={{ uri: card.logoBase64 }} style={s.logo} resizeMode="contain" />
            ) : (
              <Text style={[s.logoLetter, { color: accent }]}>{(card.sirketAdi || '?').charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={s.name}>{card.sirketAdi}</Text>
          {card.slogan ? <Text style={s.slogan}>{card.slogan}</Text> : null}

          {actions.length > 0 && (
            <View style={s.actions}>
              {actions.map((a) => (
                <TouchableOpacity key={a.key} style={s.action} onPress={a.onPress} testID={`card-${a.key}`}>
                  <View style={[s.actionIcon, { backgroundColor: accent + '1A' }]}><Ionicons name={a.icon} size={20} color={accent} /></View>
                  <Text style={s.actionLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={[s.primary, { backgroundColor: accent }]} onPress={saveContact} testID="card-save-contact">
            <Ionicons name="person-add" size={17} color="#fff" />
            <Text style={s.primaryText}>Rehbere Ekle</Text>
          </TouchableOpacity>

          {card.hakkinda ? <Text style={s.about}>{card.hakkinda}</Text> : null}

          <View style={s.list}>
            {card.telefon ? <Row icon="call-outline" text={card.telefon} onPress={() => open(`tel:${card.telefon.replace(/\s+/g, '')}`)} /> : null}
            {card.telefon2 ? <Row icon="phone-portrait-outline" text={card.telefon2} onPress={() => open(`tel:${card.telefon2.replace(/\s+/g, '')}`)} /> : null}
            {card.email ? <Row icon="mail-outline" text={card.email} onPress={() => open(`mailto:${card.email}`)} /> : null}
            {web ? <Row icon="globe-outline" text={card.website} onPress={() => open(web)} /> : null}
            {card.adres ? <Row icon="location-outline" text={card.adres} onPress={mapsUrl ? () => open(mapsUrl) : undefined} /> : null}
          </View>

          {Object.keys(card.sosyal || {}).length > 0 && (
            <View style={s.socials}>
              {Object.entries(card.sosyal).map(([k, u]) => (
                <TouchableOpacity key={k} style={s.social} onPress={() => open(u)} testID={`card-social-${k}`}>
                  <Ionicons name={SOCIAL_ICON[k] || 'link'} size={20} color="#0F172A" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {card.banklar.length > 0 && (
            <View style={s.banks}>
              <Text style={s.sectionH}>Banka Hesapları</Text>
              {card.banklar.map((b, i) => (
                <View key={i} style={s.bank}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bankName}>{b.banka}{b.hesapSahibi ? ` · ${b.hesapSahibi}` : ''}</Text>
                    <Text style={s.iban} selectable>{b.iban}</Text>
                  </View>
                  <TouchableOpacity onPress={() => copy(b.iban.replace(/\s+/g, ''), `iban${i}`)} style={s.copyBtn} testID={`card-copy-iban-${i}`}>
                    <Ionicons name={copied === `iban${i}` ? 'checkmark' : 'copy-outline'} size={16} color={accent} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.shareBtn} onPress={share} testID="card-share">
            <Ionicons name={copied === 'link' ? 'checkmark' : 'share-social-outline'} size={16} color="#334155" />
            <Text style={s.shareText}>{copied === 'link' ? 'Bağlantı kopyalandı' : 'Kartviziti paylaş'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => open(BASE)}>
          <Text style={s.credit}>Anında Teklif ile oluşturuldu</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, text, onPress }: { icon: keyof typeof Ionicons.glyphMap; text: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={17} color="#64748B" />
      <Text style={s.rowText}>{text}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  errText: { color: '#64748B', fontSize: 14 },
  scroll: { padding: 16, alignItems: 'center' },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden', paddingBottom: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.10)' } as any,
  banner: { height: 96 },
  logoWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#fff', alignSelf: 'center', marginTop: -48, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff', overflow: 'hidden', boxShadow: '0 4px 14px rgba(15,23,42,0.12)' } as any,
  logo: { width: 80, height: 80 },
  logoLetter: { fontSize: 38, fontWeight: '900' },
  name: { fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  slogan: { fontSize: 13.5, color: '#64748B', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 18, paddingHorizontal: 12 },
  action: { alignItems: 'center', gap: 5, width: 70 },
  actionIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18, marginTop: 18, paddingVertical: 13, borderRadius: 14 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14.5 },
  about: { fontSize: 13, color: '#334155', lineHeight: 19, marginHorizontal: 18, marginTop: 16 },
  list: { marginTop: 14, marginHorizontal: 18, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowText: { flex: 1, fontSize: 13.5, color: '#0F172A' },
  socials: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16 },
  social: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  banks: { marginHorizontal: 18, marginTop: 18 },
  sectionH: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 0.5, marginBottom: 6 },
  bank: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, backgroundColor: '#F8FAFC', marginBottom: 6 },
  bankName: { fontSize: 12, fontWeight: '800', color: '#334155' },
  iban: { fontSize: 13, color: '#0F172A', marginTop: 2, letterSpacing: 0.3 },
  copyBtn: { padding: 8 },
  shareBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 16, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  shareText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  credit: { fontSize: 11.5, color: '#94A3B8', marginTop: 14, marginBottom: 10 },
});

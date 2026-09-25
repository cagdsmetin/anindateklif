import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';
import { themedStyles } from '@/src/components/motion';

// Admin: tüm kullanıcılara duyuru (kampanya, yenilik) bildirimi gönder.
const LINKS = [
  ['', 'Bağlantı yok'], ['/teklif', 'Teklif'], ['/subscription', 'Abonelik'], ['/catalog', 'Katalog'],
  ['/tahsilat', 'Tahsilat'], ['/reminders', 'Hatırlatmalar'], ['/efatura', 'e-Fatura'], ['/leads', 'Potansiyel müşteri'],
] as const;

export default function BroadcastCard() {
  const [baslik, setBaslik] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [link, setLink] = useState('');
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const send = async () => {
    const doSend = async () => {
      setBusy(true); setMsg('');
      try {
        const r = await api.adminBroadcast({ baslik: baslik.trim(), mesaj: mesaj.trim(), link, push });
        setMsg(`Gönderiliyor: ${r.recipients} kullanıcı`);
        setBaslik(''); setMesaj('');
      } catch (e: any) { setMsg(e?.message || 'Gönderilemedi'); } finally { setBusy(false); }
    };
    const q = `"${baslik.trim()}" duyurusu TÜM kullanıcılara${push ? ' (telefon/tarayıcı bildirimiyle)' : ''} gönderilsin mi?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(q)) doSend();
    } else {
      Alert.alert('Duyuru gönder', q, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Gönder', onPress: doSend }]);
    }
  };

  return (
    <View style={s.card} testID="broadcast-card">
      <View style={s.row}>
        <Ionicons name="megaphone-outline" size={16} color={theme.colors.text} />
        <Text style={s.title}>Duyuru Bildirimi</Text>
      </View>
      <TextInput style={s.input} placeholder="Başlık (ör. 🎉 Yeni: Stok takibi)" placeholderTextColor="#94a3b8" value={baslik} onChangeText={setBaslik} maxLength={120} testID="broadcast-title" />
      <TextInput style={[s.input, { minHeight: 70 }]} placeholder="Mesaj" placeholderTextColor="#94a3b8" value={mesaj} onChangeText={setMesaj} maxLength={400} multiline testID="broadcast-msg" />
      <View style={s.chips}>
        {LINKS.map(([v, l]) => (
          <TouchableOpacity key={v} style={[s.chip, link === v && s.chipA]} onPress={() => setLink(v)}>
            <Text style={[s.chipT, link === v && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[s.row, { marginTop: 8 }]}>
        <Text style={[s.muted, { flex: 1 }]}>Telefon / tarayıcı bildirimi de gönder</Text>
        <Switch value={push} onValueChange={setPush} />
      </View>
      <TouchableOpacity style={[s.btn, (busy || !baslik.trim() || !mesaj.trim()) && { opacity: 0.5 }]} disabled={busy || !baslik.trim() || !mesaj.trim()} onPress={send} testID="broadcast-send">
        <Ionicons name="send" size={14} color="#fff" />
        <Text style={s.btnT}>{busy ? 'Gönderiliyor…' : 'Tüm kullanıcılara gönder'}</Text>
      </TouchableOpacity>
      {!!msg && <Text style={[s.muted, { marginTop: 6 }]}>{msg}</Text>}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.lineDark, borderRadius: 10, padding: 10, marginTop: 10, color: theme.colors.text, backgroundColor: theme.colors.surfaceSoft, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.bildirim, borderColor: theme.colors.modules.bildirim },
  chipT: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.modules.bildirim, borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
}));

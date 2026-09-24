import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { api, KasaRecurringT } from '@/src/lib/api';
import { BubbleButton, MotionInput } from '@/src/components/motion';
import { tl } from '@/src/lib/finance';
import { ks } from './shared';

// Kasa > Tekrarlayan: kira, maas, abonelik gibi her ay tekrar eden kayitlar.
// Kural kaydedildiginde backend vadesi gelen aylarin kayitlarini hemen olusturur;
// sonraki aylar Kasa her acildiginda otomatik eklenir.

type Props = {
  companyId: string;
  gelirKategorileri: string[];
  giderKategorileri: string[];
  hesaplar: string[];
  onChanged: () => void;
  showToast: (m: string) => void;
};

const CURRENCIES = ['TRY', 'USD', 'EUR'];

export default function KasaRecurring({ companyId, gelirKategorileri, giderKategorileri, hesaplar, onChanged, showToast }: Props) {
  const [rules, setRules] = useState<KasaRecurringT[]>([]);
  const [loading, setLoading] = useState(true);
  const [tur, setTur] = useState<'gelir' | 'gider'>('gider');
  const kategoriler = tur === 'gelir' ? gelirKategorileri : giderKategorileri;
  const [kategori, setKategori] = useState(giderKategorileri[0] || 'Kira');
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [gun, setGun] = useState('1');
  const [hesap, setHesap] = useState(hesaplar[0] || 'Ana Kasa');
  const [notlar, setNotlar] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setRules(await api.listKasaRecurring(companyId)); } catch {} finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const switchTur = (t: 'gelir' | 'gider') => {
    setTur(t);
    setKategori((t === 'gelir' ? gelirKategorileri : giderKategorileri)[0] || '');
  };

  const add = async () => {
    const n = Number(tutar.replace(',', '.'));
    if (!n || n <= 0) { showToast('Tutar girin'); return; }
    const g = Math.max(1, Math.min(28, parseInt(gun, 10) || 1));
    setSaving(true);
    try {
      await api.createKasaRecurring({ companyId, tur, kategori, tutar: n, paraBirimi, gun: g, hesap, notlar });
      setTutar(''); setNotlar('');
      showToast('Tekrarlayan kayıt eklendi');
      await load();
      onChanged();
    } catch (e: any) {
      showToast('Eklenemedi: ' + (e?.message || ''));
    } finally { setSaving(false); }
  };

  const toggle = async (r: KasaRecurringT) => {
    try {
      const u = await api.patchKasaRecurring(r.id, { aktif: !r.aktif });
      setRules((l) => l.map((x) => (x.id === u.id ? u : x)));
      if (u.aktif) onChanged();
    } catch (e: any) { showToast('Güncellenemedi: ' + (e?.message || '')); }
  };

  const remove = (r: KasaRecurringT) => {
    const run = async () => {
      try {
        await api.deleteKasaRecurring(r.id);
        setRules((l) => l.filter((x) => x.id !== r.id));
        showToast('Kural silindi (geçmiş kayıtlar yerinde kaldı)');
      } catch (e: any) { showToast('Silinemedi: ' + (e?.message || '')); }
    };
    if (Platform.OS === 'web') { if (window.confirm(`"${r.kategori}" tekrarı silinsin mi? Oluşmuş kayıtlar silinmez.`)) run(); return; }
    run();
  };

  return (
    <View>
      <View style={ks.card}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {(['gider', 'gelir'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[ks.chip, { flex: 1, alignItems: 'center', paddingVertical: 11 }, tur === t && { backgroundColor: t === 'gelir' ? theme.colors.greenSoft : theme.colors.redSoft, borderColor: t === 'gelir' ? theme.colors.green : theme.colors.red }]}
              onPress={() => switchTur(t)}
              testID={`rec-tur-${t}`}
            >
              <Text style={[ks.chipText, tur === t && { color: t === 'gelir' ? theme.colors.greenText : theme.colors.redText }]}>{t === 'gelir' ? 'Tekrarlayan Gelir' : 'Tekrarlayan Gider'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={ks.label}>KATEGORİ</Text>
        <View style={ks.chipRow}>
          {kategoriler.map((k) => (
            <TouchableOpacity key={k} style={[ks.chip, kategori === k && ks.chipActive]} onPress={() => setKategori(k)}>
              <Text style={[ks.chipText, kategori === k && ks.chipTextActive]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1.3 }}>
            <Text style={ks.label}>AYLIK TUTAR</Text>
            <MotionInput style={ks.input} keyboardType="numeric" value={tutar} onChangeText={setTutar} placeholder="0" placeholderTextColor="#94a3b8" testID="rec-tutar" />
          </View>
          <View style={{ width: 90 }}>
            <Text style={ks.label}>AYIN GÜNÜ</Text>
            <MotionInput style={ks.input} keyboardType="numeric" value={gun} onChangeText={setGun} placeholder="1-28" placeholderTextColor="#94a3b8" testID="rec-gun" />
          </View>
        </View>
        <View style={[ks.chipRow, { marginTop: 10 }]}>
          {CURRENCIES.map((c) => (
            <TouchableOpacity key={c} style={[ks.chip, paraBirimi === c && ks.chipActive]} onPress={() => setParaBirimi(c)}>
              <Text style={[ks.chipText, paraBirimi === c && ks.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {hesaplar.length > 1 && (
          <>
            <Text style={[ks.label, { marginTop: 12 }]}>HESAP</Text>
            <View style={ks.chipRow}>
              {hesaplar.map((h) => (
                <TouchableOpacity key={h} style={[ks.chip, hesap === h && ks.chipActive]} onPress={() => setHesap(h)}>
                  <Text style={[ks.chipText, hesap === h && ks.chipTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        <Text style={[ks.label, { marginTop: 12 }]}>NOT (OPSİYONEL)</Text>
        <MotionInput style={ks.input} value={notlar} onChangeText={setNotlar} placeholder="ör. Dükkan kirası" placeholderTextColor="#94a3b8" />
        <View style={{ marginTop: 14 }}>
          <BubbleButton icon="repeat" label={saving ? 'Ekleniyor…' : 'Tekrarlayan Kayıt Ekle'} color={theme.colors.modules.kasa} size="lg" loading={saving} onPress={add} testID="rec-add" />
        </View>
        <Text style={[ks.muted, { marginTop: 8 }]}>Her ay seçtiğiniz günde Kasa’ya otomatik işlenir. Bu ayın günü geçtiyse bu ayki kayıt da hemen oluşturulur.</Text>
      </View>

      <Text style={ks.sectionH}>TEKRARLAYAN KAYITLAR</Text>
      {loading ? <ActivityIndicator color={theme.colors.modules.kasa} /> : rules.length === 0 ? (
        <View style={[ks.card, { alignItems: 'center', gap: 6 }]}>
          <Ionicons name="repeat" size={26} color={theme.colors.textMuted} />
          <Text style={ks.muted}>Henüz tekrarlayan kayıt yok.</Text>
        </View>
      ) : rules.map((r) => (
        <View key={r.id} style={[ks.card, { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, opacity: r.aktif ? 1 : 0.55 }]} testID={`rec-row-${r.id}`}>
          <Ionicons name={r.tur === 'gelir' ? 'arrow-down-circle' : 'arrow-up-circle'} size={26} color={r.tur === 'gelir' ? theme.colors.green : theme.colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={ks.rowLabel}>{r.kategori}{r.notlar ? ` · ${r.notlar}` : ''}</Text>
            <Text style={ks.muted}>Her ayın {r.gun}. günü · {r.hesap}{r.aktif ? '' : ' · durduruldu'}</Text>
          </View>
          <Text style={[ks.rowValue, { color: r.tur === 'gelir' ? theme.colors.greenText : theme.colors.redText }]}>
            {r.paraBirimi === 'TRY' ? tl(r.tutar) : `${r.tutar} ${r.paraBirimi}`}
          </Text>
          <Switch value={r.aktif} onValueChange={() => toggle(r)} trackColor={{ true: theme.colors.modules.kasa, false: theme.colors.lineDark }} />
          <TouchableOpacity onPress={() => remove(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`rec-del-${r.id}`}>
            <Ionicons name="trash-outline" size={18} color={theme.colors.red} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

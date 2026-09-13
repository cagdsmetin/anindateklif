import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { api, EFaturaConfigT } from '@/src/lib/api';

// ============================================================================
// e-Fatura -- MyDijital OS'teki "E-Fatura" modülünün karşılığı. Sağlayıcı
// olarak Nilvera (gerçek bir e-fatura/e-arşiv API'si, developer.nilvera.com)
// kullanılıyor. v1 kapsamı bilerek sınırlı: kimlik bilgisi saklama + GERÇEK
// bir bağlantı testi (Nilvera'nın doğruladığımız GlobalCompany ucu). Fatura
// KESME bu sürümde yok -- sahte/çalışmayan bir "fatura kes" özelliği eklemek
// yerine önce gerçekten çalışan bir bağlantı testiyle başlanıyor.
// ============================================================================

export default function EFaturaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast } = useApp();
  const companyId = activeCompany?.id;

  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<EFaturaConfigT | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [firmaVergiNo, setFirmaVergiNo] = useState('');
  const [firmaUnvani, setFirmaUnvani] = useState('');
  const [firmaAdres, setFirmaAdres] = useState('');
  const [faturaSerisi, setFaturaSerisi] = useState('');
  const [sablonId, setSablonId] = useState('');
  const [ortam, setOrtam] = useState<'test' | 'canli'>('test');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const c = await api.getEFaturaConfig(companyId);
      setCfg(c);
      setFirmaVergiNo(c.firmaVergiNo || '');
      setFirmaUnvani(c.firmaUnvani || '');
      setFirmaAdres(c.firmaAdres || '');
      setFaturaSerisi(c.faturaSerisi || '');
      setSablonId(c.sablonId || '');
      setOrtam(c.ortam || 'test');
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const save = async (opts?: { switchToCanli?: boolean }) => {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload: any = {
        companyId,
        firmaVergiNo,
        firmaUnvani,
        firmaAdres,
        faturaSerisi,
        sablonId,
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (opts?.switchToCanli) payload.ortam = 'canli';
      else if (!cfg?.lastTestOk) payload.ortam = 'test';
      const updated = await api.updateEFaturaConfig(payload);
      setCfg(updated);
      setOrtam(updated.ortam);
      setApiKey('');
      showToast('Kaydedildi');
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!companyId) return;
    if (apiKey.trim() || !cfg?.hasApiKey) {
      // Test etmeden önce yeni yazılan anahtarı kaydet.
      await save();
    }
    setTesting(true);
    try {
      const res = await api.testEFaturaConnection(companyId);
      showToast(res.message);
      await load();
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    } finally {
      setTesting(false);
    }
  };

  const switchToCanli = async () => {
    if (!cfg?.lastTestOk) {
      showToast('Önce test ortamında bağlantıyı başarıyla test edin');
      return;
    }
    await save({ switchToCanli: true });
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>e-Fatura</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.empty}><Text style={s.emptyText}>Önce bir firma seçin.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>e-Fatura</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={theme.colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <Text style={s.helperTinyMuted}>
            Nilvera hesabınızın API anahtarıyla bağlantı kurun. Bu sürümde bağlantı testi ve kimlik bilgisi kaydı desteklenir; fatura kesme özelliği yakında eklenecek — Nilvera hesabınızdan mevcut yöntemle fatura kesmeye devam edebilirsiniz.
          </Text>

          <View style={[s.statusCard, cfg?.lastTestOk ? s.statusCardOk : s.statusCardOff]}>
            <Ionicons
              name={cfg?.lastTestOk ? 'checkmark-circle' : 'alert-circle-outline'}
              size={22}
              color={cfg?.lastTestOk ? '#16a34a' : theme.colors.textMuted}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.statusTitle}>
                {cfg?.lastTestOk ? 'Bağlantı doğrulandı' : 'Bağlantı henüz test edilmedi'}
              </Text>
              {!!cfg?.lastTestMessage && <Text style={s.statusSub}>{cfg.lastTestMessage}</Text>}
              <Text style={s.statusMeta}>
                Ortam: {ortam === 'canli' ? 'Canlı' : 'Test'}{cfg?.lastTestAt ? ` · Son test: ${new Date(cfg.lastTestAt).toLocaleString('tr-TR')}` : ''}
              </Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>Kimlik Bilgileri</Text>
          <TextInput
            style={s.input}
            placeholder={cfg?.hasApiKey ? `Kayıtlı anahtar: ${cfg.apiKeyMasked} (değiştirmek için yeni yazın)` : 'Nilvera API Anahtarı'}
            placeholderTextColor="#94a3b8"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            testID="efatura-apikey"
          />

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity style={[s.ortamPill, ortam === 'test' && s.ortamPillActive]} onPress={() => setOrtam('test')} testID="efatura-ortam-test">
              <Text style={[s.ortamPillText, ortam === 'test' && s.ortamPillTextActive]}>Test Ortamı</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.ortamPill, ortam === 'canli' && s.ortamPillActive, !cfg?.lastTestOk && { opacity: 0.5 }]}
              onPress={switchToCanli}
              disabled={!cfg?.lastTestOk}
              testID="efatura-ortam-canli"
            >
              <Text style={[s.ortamPillText, ortam === 'canli' && s.ortamPillTextActive]}>Canlı Ortam{!cfg?.lastTestOk ? ' 🔒' : ''}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.testBtn} onPress={runTest} disabled={testing || saving} testID="efatura-test-btn">
            {testing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="flash-outline" size={16} color="#fff" />}
            <Text style={s.testBtnText}>{testing ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}</Text>
          </TouchableOpacity>

          <Text style={s.sectionTitle}>Firma Künyesi</Text>
          <TextInput style={s.input} placeholder="Vergi Kimlik No / TCKN" placeholderTextColor="#94a3b8" value={firmaVergiNo} onChangeText={setFirmaVergiNo} testID="efatura-vergino" />
          <TextInput style={s.input} placeholder="Firma Unvanı" placeholderTextColor="#94a3b8" value={firmaUnvani} onChangeText={setFirmaUnvani} testID="efatura-unvan" />
          <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline placeholder="Adres" placeholderTextColor="#94a3b8" value={firmaAdres} onChangeText={setFirmaAdres} testID="efatura-adres" />
          <TextInput style={s.input} placeholder="Fatura Serisi (opsiyonel)" placeholderTextColor="#94a3b8" value={faturaSerisi} onChangeText={setFaturaSerisi} testID="efatura-seri" />
          <TextInput style={s.input} placeholder="Şablon ID (opsiyonel)" placeholderTextColor="#94a3b8" value={sablonId} onChangeText={setSablonId} testID="efatura-sablon" />

          <TouchableOpacity style={s.saveBtn} onPress={() => save()} disabled={saving} testID="efatura-save-btn">
            <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.bg },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  helperTinyMuted: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 15 },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 18 },
  statusCardOk: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusCardOff: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
  statusTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  statusSub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 3 },
  statusMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 6, fontWeight: '700' },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10 },
  ortamPill: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  ortamPillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  ortamPillText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  ortamPillTextActive: { color: '#fff' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.navy, borderRadius: 10, height: 44, marginBottom: 22 },
  testBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: 10, height: 46, marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

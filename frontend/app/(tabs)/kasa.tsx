import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { api, KasaSettingsT, RatesT } from '@/src/lib/api';
import KasaAnaliz from '@/src/components/kasa/KasaAnaliz';
import KasaRecurring from '@/src/components/kasa/KasaRecurring';
import KasaRaporlar from '@/src/components/kasa/KasaRaporlar';
import { buildPeriod, inRange, pctChange, sumTRY } from '@/src/lib/finance';
import { convertToTRY, currentRateFor } from '@/src/lib/tahsilat-utils';
import { useLanguage, statusLabel, translate, upper } from '@/src/lib/i18n';
import { BubbleButton, MotionInput, MotionScrollView, Reveal, ScreenHero, SoftIcon, alpha, compactNumber, themedStyles } from '@/src/components/motion';

const GELIR_KATEGORILER = ['Satış', 'Hizmet', 'Servis Geliri', 'Diğer Gelir'];
const GIDER_KATEGORILER = ['Kira', 'Maaş', 'Malzeme', 'Fatura', 'Vergi', 'Ulaşım', 'Diğer Gider'];
const YONTEMLER = ['Nakit', 'Kart', 'Havale/EFT', 'Diğer'];
const CURRENCIES = ['TRY', 'USD', 'EUR'];
const KDV_ORANLARI = [0, 1, 10, 20];
type KasaTab = 'islemler' | 'tekrarlayan' | 'analiz' | 'raporlar';
const TABS: { key: KasaTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'islemler', label: 'kasaX.tabIslemler', icon: 'swap-vertical' },
  { key: 'tekrarlayan', label: 'kasaX.tabTekrar', icon: 'repeat' },
  { key: 'analiz', label: 'kasaX.tabAnaliz', icon: 'stats-chart' },
  { key: 'raporlar', label: 'kasaX.tabRapor', icon: 'document-text' },
];

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${sym}${s}`;
}
function todayIso() { return new Date().toISOString().split('T')[0]; }
function monthKey(d: string) { return (d || '').slice(0, 7); }

export default function KasaScreen() {
  const { t, lang } = useLanguage();
  const { kasa, addKasaEntry, deleteKasaEntry, activeCompany, showToast, quotes, reloadKasa } = useApp();
  const [tab, setTab] = useState<KasaTab>('islemler');
  const [settings, setSettings] = useState<KasaSettingsT | null>(null);
  const [hesap, setHesap] = useState('Ana Kasa');
  const [hesapFilter, setHesapFilter] = useState<string | null>(null);
  const [kdvOrani, setKdvOrani] = useState(0);
  const [adding, setAdding] = useState<null | 'kategori' | 'hesap'>(null);
  const [newName, setNewName] = useState('');
  const insets = useSafeAreaInsets();

  // Panel > Genel Bakis'taki "Gider" dilimine dokunularak gelindiginde
  // form dogrudan gider kaydinda acilir.
  const kasaParams = useLocalSearchParams<{ tur?: string }>();
  const [tur, setTur] = useState<'gelir' | 'gider'>(kasaParams.tur === 'gider' ? 'gider' : 'gelir');
  const [kategori, setKategori] = useState(GELIR_KATEGORILER[0]);
  const [tutar, setTutar] = useState('');
  const [paraBirimi, setParaBirimi] = useState('TRY');
  const [yontem, setYontem] = useState('Nakit');
  const [notlar, setNotlar] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState<RatesT | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!activeCompany) return;
    let alive = true;
    api.getKasaSettings(activeCompany.id).then((st) => { if (alive) setSettings(st); }).catch(() => {});
    return () => { alive = false; };
  }, [activeCompany]);

  // Varsayilan kategoriler + firmanin kendi ekledikleri ("Diger ..." hep en sonda).
  const gelirKategorileri = useMemo(() => {
    const base = GELIR_KATEGORILER.filter((k) => !k.startsWith('Diğer'));
    return [...base, ...(settings?.gelirKategorileri || []).filter((k) => !base.includes(k)), 'Diğer Gelir'];
  }, [settings]);
  const giderKategorileri = useMemo(() => {
    const base = GIDER_KATEGORILER.filter((k) => !k.startsWith('Diğer'));
    return [...base, ...(settings?.giderKategorileri || []).filter((k) => !base.includes(k)), 'Diğer Gider'];
  }, [settings]);
  const hesaplar = settings?.hesaplar?.length ? settings.hesaplar : ['Ana Kasa'];

  const saveSettings = async (next: KasaSettingsT) => {
    try {
      setSettings(await api.putKasaSettings(next));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || ''));
    }
  };

  const addName = async () => {
    const name = newName.trim();
    if (!name || !activeCompany) { setAdding(null); return; }
    const cur: KasaSettingsT = settings || { companyId: activeCompany.id, gelirKategorileri: [], giderKategorileri: [], hesaplar: ['Ana Kasa'] };
    if (adding === 'hesap') {
      await saveSettings({ ...cur, hesaplar: [...hesaplar.filter((h) => h !== name), name] });
      setHesap(name);
    } else if (tur === 'gelir') {
      await saveSettings({ ...cur, gelirKategorileri: [...cur.gelirKategorileri.filter((k) => k !== name), name] });
      setKategori(name);
    } else {
      await saveSettings({ ...cur, giderKategorileri: [...cur.giderKategorileri.filter((k) => k !== name), name] });
      setKategori(name);
    }
    setNewName('');
    setAdding(null);
  };

  const setTurAndKategori = (t: 'gelir' | 'gider') => {
    setTur(t);
    setKategori(t === 'gelir' ? GELIR_KATEGORILER[0] : GIDER_KATEGORILER[0]);
    if (t === 'gelir') setKdvOrani(0);
  };

  // Gecen ayin ayni gunune kadarki toplamlarla karsilastirma (hero altindaki satir).
  const monthCompare = useMemo(() => {
    const p = buildPeriod('thisMonth');
    const cur = sumTRY(kasa.filter((k) => inRange(k.tarih, p.start, p.end)), rates);
    const prev = sumTRY(kasa.filter((k) => inRange(k.tarih, p.prevStart, p.prevEnd)), rates);
    return { gelir: pctChange(cur.gelir, prev.gelir), gider: pctChange(cur.gider, prev.gider), net: pctChange(cur.net, prev.net) };
  }, [kasa, rates]);

  const thisMonth = monthKey(todayIso());
  const monthEntries = useMemo(() => kasa.filter((k) => monthKey(k.tarih) === thisMonth), [kasa, thisMonth]);

  // Üstteki kartlar artık dövizli kayıtları da atlamıyor: her kayıt canlı
  // kurla TL'ye çevrilip TEK bir TL toplamına ekleniyor (Panel'deki hacim
  // kartıyla aynı mantık). Altında ayrıca o ayki $/€ dökümü gösteriliyor.
  // Kur bilinmiyorsa (servise erişilemedi) o kayıt TL toplamına katılmaz ama
  // döviz dökümünde görünmeye devam eder — sessizce kaybolmaz.
  function toplamByCurrency(list: typeof monthEntries) {
    const sums: Record<string, number> = {};
    list.forEach((k) => { sums[k.paraBirimi || 'TRY'] = (sums[k.paraBirimi || 'TRY'] || 0) + k.tutar; });
    return Object.entries(sums).map(([paraBirimi, tutar]) => ({ paraBirimi, tutar })).sort((a, b) => b.tutar - a.tutar);
  }
  function toplamTRY(list: typeof monthEntries) {
    let total = 0;
    list.forEach((k) => {
      const v = convertToTRY(k.tutar, k.paraBirimi || 'TRY', rates);
      if (v != null) total += v;
    });
    return total;
  }

  const gelirEntries = useMemo(() => monthEntries.filter((k) => k.tur === 'gelir'), [monthEntries]);
  const giderEntries = useMemo(() => monthEntries.filter((k) => k.tur === 'gider'), [monthEntries]);
  const gelirToplam = useMemo(() => toplamTRY(gelirEntries), [gelirEntries, rates]);
  const giderToplam = useMemo(() => toplamTRY(giderEntries), [giderEntries, rates]);
  const gelirByCurrency = useMemo(() => toplamByCurrency(gelirEntries), [gelirEntries]);
  const giderByCurrency = useMemo(() => toplamByCurrency(giderEntries), [giderEntries]);
  const net = gelirToplam - giderToplam;
  const dovizliVar = gelirByCurrency.some((x) => x.paraBirimi !== 'TRY') || giderByCurrency.some((x) => x.paraBirimi !== 'TRY');

  // BU AY NET kartının altında sadece 'canlı kurla' yazıp rakam göstermemek
  // yetersizdi -- gelir ile giderin döviz kısımları birbirine netleştirilip
  // (ör. $6.000 gelir - $0 gider = $6.000 net) GELİR/GİDER kartlarındaki gibi
  // $/€ dökümü burada da gösteriliyor.
  const netByCurrency = useMemo(() => {
    const sums: Record<string, number> = {};
    gelirByCurrency.forEach((x) => { if (x.paraBirimi !== 'TRY') sums[x.paraBirimi] = (sums[x.paraBirimi] || 0) + x.tutar; });
    giderByCurrency.forEach((x) => { if (x.paraBirimi !== 'TRY') sums[x.paraBirimi] = (sums[x.paraBirimi] || 0) - x.tutar; });
    return Object.entries(sums)
      .map(([paraBirimi, tutar]) => ({ paraBirimi, tutar }))
      .filter((x) => Math.abs(x.tutar) > 0.009)
      .sort((a, b) => Math.abs(b.tutar) - Math.abs(a.tutar));
  }, [gelirByCurrency, giderByCurrency]);

  const kategoriDagilimi = useMemo(() => {
    const map: Record<string, { tur: 'gelir' | 'gider'; toplam: number }> = {};
    monthEntries.forEach((k) => {
      if ((k.paraBirimi || 'TRY') !== 'TRY') return;
      if (!map[k.kategori]) map[k.kategori] = { tur: k.tur, toplam: 0 };
      map[k.kategori].toplam += k.tutar;
    });
    const arr = Object.entries(map).map(([kat, v]) => ({ kategori: kat, ...v }));
    arr.sort((a, b) => b.toplam - a.toplam);
    const max = Math.max(1, ...arr.map((a) => a.toplam));
    return arr.map((a) => ({ ...a, pct: Math.min(100, (a.toplam / max) * 100) }));
  }, [monthEntries]);

  const filtered = useMemo(() => {
    const list = [...kasa]
      .filter((k) => !hesapFilter || (k.hesap || 'Ana Kasa') === hesapFilter)
      .sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '') || (b.id || '').localeCompare(a.id || ''));
    if (!q.trim()) return list;
    const qq = q.trim().toLowerCase();
    return list.filter((k) => k.kategori.toLowerCase().includes(qq) || (k.notlar || '').toLowerCase().includes(qq));
  }, [kasa, q, hesapFilter]);

  const isDiger = kategori.startsWith('Diğer') || yontem === 'Diğer';

  const save = async () => {
    if (!Number(tutar) || Number(tutar) <= 0) { showToast(t('common.enterAmount')); return; }
    if (isDiger && !notlar.trim()) { showToast(t('kasa.s007')); return; }
    setSaving(true);
    try {
      await addKasaEntry({ tur, kategori, tutar: Number(tutar), paraBirimi, yontem, notlar, tarih: todayIso(), kurTRY: currentRateFor(paraBirimi, rates), hesap, kdvOrani: tur === 'gider' ? kdvOrani : 0 });
      showToast(tur === 'gelir' ? t('kasa.s033') : t('kasa.s034'));
      setTutar('');
      setNotlar('');
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteKasaEntry(id);
      showToast(t('kasa.s008'));
    } catch (e: any) {
      showToast(t('common.errorPrefix') + (e?.message || ''));
    }
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('kasa.s009')} />
        <View style={s.empty}><Text style={s.emptyText}>{t('kasa.s010')}</Text></View>
      </SafeAreaView>
    );
  }

  const kategoriler = tur === 'gelir' ? gelirKategorileri : giderKategorileri;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('kasa.s011')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <MotionScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 100, width: '100%', maxWidth: 880, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ScreenHero
            icon="wallet"
            title={t('kasa.s011')}
            subtitle={activeCompany?.sirketAdi}
            color={theme.colors.modules.kasa}
            stats={[
              {
                label: t('kasa.s012'),
                value: gelirToplam,
                format: (n) => `₺${compactNumber(n, [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')])}`,
                tone: '#6EE7B7',
                sub: gelirByCurrency.filter((x) => x.paraBirimi !== 'TRY').map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ') || null,
              },
              {
                label: t('kasa.s013'),
                value: giderToplam,
                format: (n) => `₺${compactNumber(n, [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')])}`,
                tone: '#FCA5A5',
                sub: giderByCurrency.filter((x) => x.paraBirimi !== 'TRY').map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ') || null,
              },
              {
                label: t('kasa.s014'),
                value: net,
                format: (n) => `₺${compactNumber(n, [t('panel.unitK'), t('panel.unitM'), t('panel.unitB')])}`,
                tone: net >= 0 ? '#A5B4FC' : '#FCA5A5',
                sub: netByCurrency.length > 0 ? netByCurrency.map((x) => fmt(x.tutar, x.paraBirimi)).join(' · ') : dovizliVar ? t('kasa.s015') : null,
              },
            ]}
          />

          <View style={s.compareRow} testID="kasa-compare">
            <Ionicons name="trending-up" size={14} color={theme.colors.textMuted} />
            <Text style={s.compareText}>
              {t('kasaX.vsLastMonth')}{'  '}
              <CompareVal label={t('kasaX.income')} pct={monthCompare.gelir} />{'  ·  '}
              <CompareVal label={t('kasaX.expense')} pct={monthCompare.gider} invert />{'  ·  '}
              <CompareVal label={t('kasaX.net')} pct={monthCompare.net} />
            </Text>
          </View>

          <View style={s.tabBar}>
            {TABS.map((tb) => (
              <TouchableOpacity key={tb.key} style={[s.tabBtn, tab === tb.key && s.tabBtnActive]} onPress={() => setTab(tb.key)} testID={`kasa-tab-${tb.key}`}>
                <Ionicons name={tb.icon} size={15} color={tab === tb.key ? '#fff' : theme.colors.textMuted} />
                <Text style={[s.tabText, tab === tb.key && s.tabTextActive]} numberOfLines={1}>{t(tb.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'tekrarlayan' && (
            <KasaRecurring
              companyId={activeCompany.id}
              gelirKategorileri={gelirKategorileri}
              giderKategorileri={giderKategorileri}
              hesaplar={hesaplar}
              onChanged={() => { reloadKasa().catch(() => {}); }}
              showToast={showToast}
            />
          )}
          {tab === 'analiz' && <KasaAnaliz kasa={kasa} quotes={quotes} rates={rates} />}
          {tab === 'raporlar' && (
            <KasaRaporlar firma={activeCompany.sirketAdi} kasa={kasa} quotes={quotes} rates={rates} hesaplar={hesaplar} showToast={showToast} />
          )}

          {tab === 'islemler' && (<>
          <Text style={s.sectionH}>{t('kasa.s016')}</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[s.turBtn, tur === 'gelir' && s.turBtnGelirActive]} onPress={() => setTurAndKategori('gelir')} testID="kasa-tur-gelir">
                <Text style={[s.turBtnText, tur === 'gelir' && { color: theme.colors.greenText }]}>{t('kasa.s017')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.turBtn, tur === 'gider' && s.turBtnGiderActive]} onPress={() => setTurAndKategori('gider')} testID="kasa-tur-gider">
                <Text style={[s.turBtnText, tur === 'gider' && { color: theme.colors.redText }]}>{t('kasa.s018')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>{upper(t('kasa.s019'))}</Text>
            <View style={s.chipRow}>
              {kategoriler.map((k) => (
                <TouchableOpacity key={k} style={[s.chip, kategori === k && s.chipActive]} onPress={() => setKategori(k)} testID={`kasa-kategori-${k}`}>
                  <Text style={[s.chipText, kategori === k && s.chipTextActive]}>{statusLabel(lang, k)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[s.chip, s.chipAdd]} onPress={() => { setAdding('kategori'); setNewName(''); }} testID="kasa-kategori-ekle">
                <Text style={s.chipAddText}>{t('kasaX.addCategory')}</Text>
              </TouchableOpacity>
            </View>
            {adding === 'kategori' && <AddNameRow value={newName} onChange={setNewName} onSubmit={addName} onCancel={() => setAdding(null)} placeholder={tur === 'gelir' ? t('kasaX.newIncomeCat') : t('kasaX.newExpenseCat')} />}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1.4 }}>
                <Text style={s.label}>{upper(t('kasa.s020'))}</Text>
                <MotionInput style={s.input} keyboardType="numeric" value={tutar} onChangeText={(v) => setTutar(v.replace(',', '.'))} placeholder="0" placeholderTextColor="#94a3b8" testID="kasa-tutar-input" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{upper(t('kasa.s021'))}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity key={c} style={[s.curChip, paraBirimi === c && s.curChipActive]} onPress={() => setParaBirimi(c)}>
                      <Text style={[s.curChipText, paraBirimi === c && s.curChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{upper(t('kasa.s022'))}</Text>
            <View style={s.chipRow}>
              {YONTEMLER.map((y) => (
                <TouchableOpacity key={y} style={[s.chip, yontem === y && s.chipActive]} onPress={() => setYontem(y)}>
                  <Text style={[s.chipText, yontem === y && s.chipTextActive]}>{statusLabel(lang, y)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>{t('kasaX.account')}</Text>
            <View style={s.chipRow}>
              {hesaplar.map((h) => (
                <TouchableOpacity key={h} style={[s.chip, hesap === h && s.chipActive]} onPress={() => setHesap(h)} testID={`kasa-hesap-${h}`}>
                  <Text style={[s.chipText, hesap === h && s.chipTextActive]}>{statusLabel(lang, h)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[s.chip, s.chipAdd]} onPress={() => { setAdding('hesap'); setNewName(''); }} testID="kasa-hesap-ekle">
                <Text style={s.chipAddText}>{t('kasaX.addAccount')}</Text>
              </TouchableOpacity>
            </View>
            {adding === 'hesap' && <AddNameRow value={newName} onChange={setNewName} onSubmit={addName} onCancel={() => setAdding(null)} placeholder={t('kasaX.phAccount')} />}

            {tur === 'gider' && (
              <>
                <Text style={[s.label, { marginTop: 12 }]}>{t('kasaX.vatIncl')}</Text>
                <View style={s.chipRow}>
                  {KDV_ORANLARI.map((r) => (
                    <TouchableOpacity key={r} style={[s.chip, kdvOrani === r && s.chipActive]} onPress={() => setKdvOrani(r)} testID={`kasa-kdv-${r}`}>
                      <Text style={[s.chipText, kdvOrani === r && s.chipTextActive]}>{r === 0 ? t('kasaX.noVat') : `%${r}`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={[s.label, { marginTop: 12 }]}>{upper(isDiger ? t('kasa.s023') : t('common.notOptional'))}</Text>
            <MotionInput
              style={[s.input, isDiger && !notlar.trim() && s.inputRequired]}
              value={notlar}
              onChangeText={setNotlar}
              placeholder={isDiger ? t('kasa.s024') : t('kasa.s025')}
              placeholderTextColor="#94a3b8"
              testID="kasa-not-input"
            />

            <BubbleButton
              icon="checkmark-done"
              label={saving ? t('common.saving') : t('common.save')}
              color={theme.colors.modules.kasa}
              size="lg"
              loading={saving}
              onPress={save}
              testID="kasa-save-btn"
            />
          </View>

          {kategoriDagilimi.length > 0 && (
            <>
              <Text style={s.sectionH}>{t('kasa.s026')}</Text>
              <View style={s.card}>
                {kategoriDagilimi.map((k) => (
                  <View key={k.kategori} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                      <Text style={s.katLabel}>{statusLabel(lang, k.kategori)} <Text style={s.katSub}>{upper(k.tur)}</Text></Text>
                      <Text style={[s.katAmount, { color: k.tur === 'gelir' ? theme.colors.greenText : theme.colors.redText }]}>{k.tur === 'gelir' ? '+' : '-'}{fmt(k.toplam, 'TRY')}</Text>
                    </View>
                    <View style={s.barBg}><View style={[s.barFill, { width: `${k.pct}%`, backgroundColor: k.tur === 'gelir' ? theme.colors.green : theme.colors.red }]} /></View>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={s.sectionH}>{t('kasa.s027')}</Text>
          {hesaplar.length > 1 && (
            <View style={[s.chipRow, { marginBottom: 8 }]}>
              {[null, ...hesaplar].map((h) => (
                <TouchableOpacity key={h || 'all'} style={[s.chip, hesapFilter === h && s.chipActive]} onPress={() => setHesapFilter(h)} testID={`kasa-filter-${h || 'tumu'}`}>
                  <Text style={[s.chipText, hesapFilter === h && s.chipTextActive]}>{h ? statusLabel(lang, h) : t('kasaX.all')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={s.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <MotionInput style={s.searchInput} placeholder={t('kasa.s028')} placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} testID="kasa-search-input" />
          </View>
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="wallet-outline" size={30} color={theme.colors.textMuted} />
              <Text style={s.emptyTextBox}>{t('kasa.s029')}</Text>
            </View>
          ) : (
            filtered.map((k) => (
              <Reveal key={k.id} variant={parseInt(k.id.replace(/\D/g, '') || '0', 10) % 2 === 0 ? 'left' : 'right'} distance={16}>
              <View style={s.txRow} testID={`kasa-tx-${k.id}`}>
                <SoftIcon
                  icon={k.tur === 'gelir' ? 'arrow-down' : 'arrow-up'}
                  color={k.tur === 'gelir' ? theme.colors.green : theme.colors.red}
                  size={34}
                  iconSize={16}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.txKat} numberOfLines={1}>{statusLabel(lang, k.kategori)}{k.notlar ? ` · ${k.notlar}` : ''}</Text>
                  <Text style={s.txMeta}>
                    {k.recurringId ? '↻ ' : ''}{statusLabel(lang, k.yontem)} · {k.tarih}
                    {hesaplar.length > 1 || (k.hesap && k.hesap !== 'Ana Kasa') ? ` · ${statusLabel(lang, k.hesap || 'Ana Kasa')}` : ''}
                    {k.kdvOrani ? ` · ${t('kasaX.vat')} %${k.kdvOrani}` : ''}
                  </Text>
                </View>
                <Text style={[s.txAmount, { color: k.tur === 'gelir' ? theme.colors.green : theme.colors.red }]} numberOfLines={1}>{k.tur === 'gelir' ? '+' : '-'}{fmt(k.tutar, k.paraBirimi)}</Text>
                <TouchableOpacity onPress={() => remove(k.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`kasa-delete-${k.id}`}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
              </Reveal>
            ))
          )}
          </>)}
        </MotionScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CompareVal({ label, pct, invert }: { label: string; pct: number | null; invert?: boolean }) {
  if (pct == null) return <Text style={s.compareText}>{label} —</Text>;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <Text style={[s.compareText, { color: good ? theme.colors.greenText : theme.colors.redText, fontWeight: '800' }]}>
      {label} {pct >= 0 ? '▲' : '▼'}%{Math.abs(pct).toFixed(0)}
    </Text>
  );
}

function AddNameRow({ value, onChange, onSubmit, onCancel, placeholder }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel: () => void; placeholder: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <MotionInput style={[s.input, { flex: 1 }]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94a3b8" autoFocus onSubmitEditing={onSubmit} testID="kasa-new-name" />
      <TouchableOpacity style={[s.chip, s.chipActive]} onPress={onSubmit} testID="kasa-new-name-save"><Text style={[s.chipText, s.chipTextActive]}>{translate('kasaX.add')}</Text></TouchableOpacity>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={18} color={theme.colors.textMuted} /></TouchableOpacity>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  compareText: { fontSize: 11.5, color: theme.colors.textMuted, fontWeight: '600' },
  tabBar: { flexDirection: 'row', gap: 6, marginTop: 14, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, padding: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: theme.colors.modules.kasa },
  tabText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  tabTextActive: { color: '#fff' },
  chipAdd: { borderStyle: 'dashed', borderColor: theme.colors.modules.kasa },
  chipAddText: { fontSize: 12, fontWeight: '800', color: theme.colors.modules.kasa },
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  statCard: { flex: 1, borderRadius: 12, padding: 12 },
  statLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  statValue: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  statSubValue: { fontSize: 9.5, fontWeight: '700', marginTop: 2, opacity: 0.75 },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.text, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.modules.kasa, letterSpacing: 0.5 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  turBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark, alignItems: 'center', backgroundColor: theme.colors.surface },
  turBtnGelirActive: { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' },
  turBtnGiderActive: { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.red },
  turBtnText: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.modules.kasa, borderColor: theme.colors.modules.kasa },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  chipTextActive: { color: '#fff' },
  curChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface, alignItems: 'center' },
  curChipActive: { backgroundColor: theme.colors.modules.kasa, borderColor: theme.colors.modules.kasa },
  curChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  curChipTextActive: { color: '#fff' },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  inputRequired: { borderColor: theme.colors.red, borderWidth: 1.5 },
  saveBtn: { marginTop: 16, backgroundColor: theme.colors.modules.kasa, paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5, letterSpacing: 0.2 },
  katLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  katSub: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted, },
  katAmount: { fontSize: 12.5, fontWeight: '900' },
  barBg: { height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  emptyBox: { marginTop: 12, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 10,
    ...theme.shadow.sm,
  },
  txIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txKat: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  txMeta: { fontSize: 10.5, color: theme.colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: '900', marginRight: 4 },
}));

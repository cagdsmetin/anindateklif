import React, { useEffect, useState } from 'react';
import { upper } from '@/src/lib/i18n';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { api, EFaturaConfigT, IncomingInvoiceT, InvoiceT, QuoteT } from '@/src/lib/api';
import InvoiceModal from '@/src/components/InvoiceModal';
import { saveBase64Pdf } from '@/src/lib/pdf-b64';
import { MotionInput, MotionScrollView, ScreenHero, themedStyles } from '@/src/components/motion';

// ============================================================================
// e-Fatura -- sağlayıcı Nilvera (GİB lisanslı özel entegratör; faturalar
// Nilvera üzerinden GİB'e iletilir). Sekmeler: kesilen faturalar (onaylı
// tekliften e-Fatura/e-Arşiv, bkz. InvoiceModal), gelen alış faturaları ve
// bağlantı ayarları. e-Fatura Türkiye'ye özgü -- ekran bilerek Türkçe.
// ============================================================================

export default function EFaturaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast, quotes, reloadKasa } = useApp();
  const companyId = activeCompany?.id;

  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<EFaturaConfigT | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [firmaVergiNo, setFirmaVergiNo] = useState('');
  const [firmaUnvani, setFirmaUnvani] = useState('');
  const [firmaAdres, setFirmaAdres] = useState('');
  const [firmaVergiDairesi, setFirmaVergiDairesi] = useState('');
  const [firmaIl, setFirmaIl] = useState('');
  const [firmaIlce, setFirmaIlce] = useState('');
  const [tab, setTab] = useState<'faturalar' | 'gelen' | 'ayarlar'>('faturalar');
  const [invoices, setInvoices] = useState<InvoiceT[]>([]);
  const [incoming, setIncoming] = useState<IncomingInvoiceT[] | null>(null);
  const [incomingErr, setIncomingErr] = useState('');
  const [invoiceQuote, setInvoiceQuote] = useState<QuoteT | null>(null);
  const [rowBusy, setRowBusy] = useState('');
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
      setFirmaVergiDairesi(c.firmaVergiDairesi || '');
      setFirmaIl(c.firmaIl || '');
      setFirmaIlce(c.firmaIlce || '');
      if (!c.lastTestOk) setTab('ayarlar');
      else api.listInvoices(companyId).then(setInvoices).catch(() => {});
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
        firmaVergiDairesi,
        firmaIl,
        firmaIlce,
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

  const loadIncoming = async () => {
    if (!companyId) return;
    setIncoming(null); setIncomingErr('');
    try { setIncoming(await api.listIncomingInvoices(companyId)); }
    catch (e: any) { setIncoming([]); setIncomingErr(e?.message || 'Gelen faturalar alınamadı'); }
  };
  useEffect(() => {
    if (tab === 'gelen' && incoming == null) loadIncoming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const invoicedQuoteIds = new Set(invoices.filter((i) => i.durum !== 'Hata' && i.durum !== 'İptal').map((i) => i.quoteId));
  const toInvoice = quotes.filter((q) => q.durum === 'Onaylandı' && !q.deletedAt && !invoicedQuoteIds.has(q.id)).slice(0, 30);

  const rowRun = async (key: string, fn: () => Promise<void>) => {
    if (rowBusy) return;
    setRowBusy(key);
    try { await fn(); } catch (e: any) { showToast('Hata: ' + (e?.message || '')); } finally { setRowBusy(''); }
  };
  const invPdf = (inv: InvoiceT) => rowRun('pdf' + inv.id, async () => {
    const r = await api.invoicePdf(inv.id); await saveBase64Pdf(r.pdfBase64, r.fileName);
  });
  const invRefresh = (inv: InvoiceT) => rowRun('st' + inv.id, async () => {
    const u = await api.refreshInvoice(inv.id);
    setInvoices((l) => l.map((x) => (x.id === u.id ? u : x)));
    showToast(`Durum: ${u.durum}${u.durumDetay ? ` – ${u.durumDetay}` : ''}`);
  });
  const incPdf = (x: IncomingInvoiceT) => rowRun('ipdf' + x.uuid, async () => {
    const r = await api.incomingInvoicePdf(companyId!, x.uuid); await saveBase64Pdf(r.pdfBase64, r.fileName);
  });
  const incToKasa = (x: IncomingInvoiceT) => rowRun('ik' + x.uuid, async () => {
    const kdvOrani = x.matrah > 0 ? Math.round((x.kdv / x.matrah) * 100) : 0;
    await api.createKasaEntry({
      companyId, tur: 'gider', kategori: 'Fatura', tutar: x.toplam, paraBirimi: x.paraBirimi || 'TRY',
      yontem: 'Havale/EFT', tarih: x.tarih || new Date().toISOString().slice(0, 10), kdvOrani,
      notlar: `${x.gonderen} – fatura ${x.faturaNo}`,
    });
    await reloadKasa().catch(() => {});
    showToast('Kasa\'ya gider olarak eklendi');
  });
  const money = (n: number, cur: string) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${cur === 'TRY' ? '₺' : cur}`;
  const durumColor = (d: string) => (d === 'Başarılı' ? theme.colors.green : d === 'Hata' || d === 'İptal' ? theme.colors.red : theme.colors.gold);

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
        <MotionScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <ScreenHero
            icon="receipt"
            title={'e-Fatura'}
            color={theme.colors.modules.efatura}
          />
          <Text style={s.helperTinyMuted}>
            Onaylanan tekliflerinizden tek tuşla e-Fatura / e-Arşiv fatura kesin. Faturalar, GİB lisanslı özel entegratör Nilvera üzerinden Gelir İdaresi’ne iletilir; alıcı e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv otomatik seçilir.
          </Text>

          <View style={s.tabs}>
            {([['faturalar', 'Faturalar'], ['gelen', 'Gelen'], ['ayarlar', 'Ayarlar']] as const).map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabA]} onPress={() => setTab(k)} testID={`efatura-tab-${k}`}>
                <Text style={[s.tabT, tab === k && s.tabTA]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'faturalar' && (
            <View>
              {!cfg?.lastTestOk && (
                <TouchableOpacity style={s.notice} onPress={() => setTab('ayarlar')}>
                  <Ionicons name="alert-circle-outline" size={18} color={theme.colors.gold} />
                  <Text style={s.noticeT}>Fatura kesmek için önce Ayarlar sekmesinden Nilvera bağlantısını test edin.</Text>
                </TouchableOpacity>
              )}
              {cfg?.ortam === 'test' && cfg?.lastTestOk && (
                <View style={s.notice}>
                  <Ionicons name="flask-outline" size={18} color={theme.colors.gold} />
                  <Text style={s.noticeT}>Test ortamındasınız: kesilen faturalar resmi değildir. Gerçek fatura için Ayarlar’dan Canlı Ortam’a geçin.</Text>
                </View>
              )}
              <Text style={s.sectionTitle}>{upper('Faturalanacak onaylı teklifler')}</Text>
              {toInvoice.length === 0 ? <Text style={s.helperTinyMuted}>Faturası kesilmemiş onaylı teklif yok.</Text> : toInvoice.map((q) => (
                <View key={q.id} style={s.row} testID={`to-invoice-${q.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowT} numberOfLines={1}>{q.musFirma || q.musYetkili}</Text>
                    <Text style={s.rowS}>{q.teklifNo} · {money(q.genelToplam, q.paraBirimi)}</Text>
                  </View>
                  <TouchableOpacity style={s.smallBtn} onPress={() => setInvoiceQuote(q)} testID={`invoice-quote-${q.id}`}>
                    <Ionicons name="receipt-outline" size={14} color="#fff" />
                    <Text style={s.smallBtnT}>Fatura Kes</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={[s.sectionTitle, { marginTop: 18 }]}>{upper(`Kesilen faturalar (${invoices.length})`)}</Text>
              {invoices.length === 0 ? <Text style={s.helperTinyMuted}>Henüz fatura kesilmedi.</Text> : invoices.map((inv) => (
                <View key={inv.id} style={s.row} testID={`invoice-${inv.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowT} numberOfLines={1}>{inv.aliciUnvan}</Text>
                    <Text style={s.rowS}>
                      {inv.faturaNo || inv.uuid.slice(0, 8)} · {inv.tur === 'efatura' ? 'e-Fatura' : 'e-Arşiv'} · {money(inv.genelToplam, inv.paraBirimi)}
                      {inv.ortam === 'test' ? ' · TEST' : ''}
                    </Text>
                    <Text style={[s.rowS, { color: durumColor(inv.durum), fontWeight: '800' }]}>{inv.durum}{inv.durumDetay ? ` – ${inv.durumDetay}` : ''} · {new Date(inv.createdAt).toLocaleDateString('tr-TR')}</Text>
                  </View>
                  <TouchableOpacity style={s.iconBtn} onPress={() => invRefresh(inv)} disabled={!!rowBusy}>
                    {rowBusy === 'st' + inv.id ? <ActivityIndicator size="small" /> : <Ionicons name="refresh" size={18} color={theme.colors.textSoft} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => invPdf(inv)} disabled={!!rowBusy} testID={`invoice-pdf-${inv.id}`}>
                    {rowBusy === 'pdf' + inv.id ? <ActivityIndicator size="small" /> : <Ionicons name="document-text-outline" size={18} color={theme.colors.modules.efatura} />}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {tab === 'gelen' && (
            <View>
              <Text style={s.helperTinyMuted}>Tedarikçilerinizin size kestiği e-Faturalar. “Kasaya ekle” ile gider olarak işleyebilirsiniz (KDV oranı faturadan hesaplanır).</Text>
              {incoming == null ? <ActivityIndicator color={theme.colors.primary} /> : incomingErr ? (
                <Text style={[s.helperTinyMuted, { color: theme.colors.redText }]}>{incomingErr}</Text>
              ) : incoming.length === 0 ? <Text style={s.helperTinyMuted}>Gelen fatura yok.</Text> : incoming.map((x) => (
                <View key={x.uuid} style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowT} numberOfLines={1}>{x.gonderen}</Text>
                    <Text style={s.rowS}>{x.faturaNo} · {x.tarih.split('-').reverse().join('.')} · {money(x.toplam, x.paraBirimi)}</Text>
                    {x.durum ? <Text style={s.rowS}>{x.durum}</Text> : null}
                  </View>
                  <TouchableOpacity style={s.iconBtn} onPress={() => incToKasa(x)} disabled={!!rowBusy}>
                    {rowBusy === 'ik' + x.uuid ? <ActivityIndicator size="small" /> : <Ionicons name="wallet-outline" size={18} color={theme.colors.modules.kasa} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => incPdf(x)} disabled={!!rowBusy}>
                    {rowBusy === 'ipdf' + x.uuid ? <ActivityIndicator size="small" /> : <Ionicons name="document-text-outline" size={18} color={theme.colors.modules.efatura} />}
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[s.testBtn, { marginTop: 12 }]} onPress={loadIncoming}>
                <Ionicons name="refresh" size={16} color="#fff" /><Text style={s.testBtnText}>Yenile</Text>
              </TouchableOpacity>
            </View>
          )}

          {tab === 'ayarlar' && (<>

          <View style={[s.statusCard, cfg?.lastTestOk ? s.statusCardOk : s.statusCardOff]}>
            <Ionicons
              name={cfg?.lastTestOk ? 'checkmark-circle' : 'alert-circle-outline'}
              size={22}
              color={cfg?.lastTestOk ? theme.colors.green : theme.colors.textMuted}
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

          <Text style={s.sectionTitle}>{upper('Kimlik Bilgileri')}</Text>
          <MotionInput
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
              {!cfg?.lastTestOk ? (
                <Ionicons name="lock-closed" size={13} color={ortam === 'canli' ? '#fff' : theme.colors.textMuted} />
              ) : null}
              <Text style={[s.ortamPillText, ortam === 'canli' && s.ortamPillTextActive]}>Canlı Ortam</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.testBtn} onPress={runTest} disabled={testing || saving} testID="efatura-test-btn">
            {testing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="flash-outline" size={16} color="#fff" />}
            <Text style={s.testBtnText}>{testing ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}</Text>
          </TouchableOpacity>

          <Text style={s.sectionTitle}>{upper('Firma Künyesi')}</Text>
          <MotionInput style={s.input} placeholder="Vergi Kimlik No / TCKN" placeholderTextColor="#94a3b8" value={firmaVergiNo} onChangeText={setFirmaVergiNo} testID="efatura-vergino" />
          <MotionInput style={s.input} placeholder="Firma Unvanı" placeholderTextColor="#94a3b8" value={firmaUnvani} onChangeText={setFirmaUnvani} testID="efatura-unvan" />
          <MotionInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline placeholder="Adres" placeholderTextColor="#94a3b8" value={firmaAdres} onChangeText={setFirmaAdres} testID="efatura-adres" />
          <MotionInput style={s.input} placeholder="Vergi Dairesi" placeholderTextColor="#94a3b8" value={firmaVergiDairesi} onChangeText={setFirmaVergiDairesi} testID="efatura-vd" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <MotionInput style={[s.input, { flex: 1 }]} placeholder="İlçe" placeholderTextColor="#94a3b8" value={firmaIlce} onChangeText={setFirmaIlce} testID="efatura-ilce" />
            <MotionInput style={[s.input, { flex: 1 }]} placeholder="İl" placeholderTextColor="#94a3b8" value={firmaIl} onChangeText={setFirmaIl} testID="efatura-il" />
          </View>
          <MotionInput style={s.input} placeholder="Fatura Serisi (opsiyonel)" placeholderTextColor="#94a3b8" value={faturaSerisi} onChangeText={setFaturaSerisi} testID="efatura-seri" />
          <MotionInput style={s.input} placeholder="Şablon ID (opsiyonel)" placeholderTextColor="#94a3b8" value={sablonId} onChangeText={setSablonId} testID="efatura-sablon" />

          <TouchableOpacity style={s.saveBtn} onPress={() => save()} disabled={saving} testID="efatura-save-btn">
            <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
          </>)}
        </MotionScrollView>
      )}
      <InvoiceModal
        quote={invoiceQuote}
        onClose={() => setInvoiceQuote(null)}
        onIssued={(inv) => setInvoices((l) => [inv, ...l])}
      />
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
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
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.text, letterSpacing: 0.4, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.colors.text, backgroundColor: theme.colors.surface, marginBottom: 10 },
  ortamPill: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft },
  ortamPillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  ortamPillText: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  ortamPillTextActive: { color: '#fff' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.navy, borderRadius: 10, height: 44, marginBottom: 22 },
  testBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: 10, height: 46, marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabA: { backgroundColor: theme.colors.surface, ...theme.shadow.sm },
  tabT: { fontSize: 12.5, fontWeight: '800', color: theme.colors.textMuted },
  tabTA: { color: theme.colors.modules.efatura },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: theme.colors.goldSoft || theme.colors.surfaceSoft, marginBottom: 14 },
  noticeT: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, marginBottom: 8 },
  rowT: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  rowS: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  smallBtn: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: theme.colors.modules.efatura, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10 },
  smallBtnT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceSoft },
}));

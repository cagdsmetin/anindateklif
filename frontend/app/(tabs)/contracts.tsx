import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { api, ContractStatusT, ContractT, CustomerT, QuoteT } from '@/src/lib/api';
import { buildContractPdfHtml, buildContractTemplate, fmtMoney } from '@/src/lib/contract';
import { htmlToPdfObjectUrlWeb } from '@/src/lib/pdf-web';
import { downloadFileWeb } from '@/src/lib/web-download';
import { BubbleButton, MotionInput, MotionScrollView, Reveal, ScreenHero, themedStyles } from '@/src/components/motion';
import { statusLabel, useLanguage } from '@/src/lib/i18n';

// Sozlesmeler: onaylanan tekliften tek dokunusla ya da sifirdan sozlesme.
// Metin yapay zekayla yazilir/duzenlenir (backend /contracts/ai-draft) ya da
// AI'siz hazir sablonla doldurulur; kaydedilir, PDF olarak paylasilir.

const STATUSES: ContractStatusT[] = ['Taslak', 'Gönderildi', 'İmzalandı', 'İptal'];
const TYPES = ['typeSales', 'typeService', 'typeMaint', 'typeSupply', 'typeSub'];

type Draft = {
  id?: string;
  quoteId: string;
  teklifNo: string;
  baslik: string;
  musFirma: string;
  musYetkili: string;
  musTelefon: string;
  musEmail: string;
  musAdres: string;
  tutar: number;
  paraBirimi: string;
  icerik: string;
  durum: ContractStatusT;
};

function emptyDraft(): Draft {
  return {
    quoteId: '', teklifNo: '', baslik: '', musFirma: '', musYetkili: '', musTelefon: '', musEmail: '', musAdres: '',
    tutar: 0, paraBirimi: 'TRY', icerik: '', durum: 'Taslak',
  };
}

function draftFromQuote(q: QuoteT): Draft {
  return {
    ...emptyDraft(),
    quoteId: q.id, teklifNo: q.teklifNo, musFirma: q.musFirma, musYetkili: q.musYetkili, musTelefon: q.musTelefon,
    musEmail: q.musEmail, musAdres: q.musAdres, tutar: q.genelToplam, paraBirimi: q.paraBirimi || 'TRY',
  };
}

const norm = (x: string) => (x || '').trim().toLocaleLowerCase('tr-TR');
const digits = (x: string) => (x || '').replace(/\D/g, '');

/** Teklifteki musteri icin kayitli musteri kaydini bulur (firma adi ya da telefon). */
function findCustomer(customers: CustomerT[], firma: string, telefon: string): CustomerT | undefined {
  const f = norm(firma);
  const tel = digits(telefon);
  return customers.find((c) => (f && norm(c.firma) === f) || (tel.length >= 7 && digits(c.telefon) === tel));
}

/** Teklifte bos kalan musteri alanlarini kayitli musteri kaydindan tamamlar. */
function enrichQuote(q: QuoteT, c?: CustomerT): QuoteT {
  if (!c) return q;
  return {
    ...q,
    musYetkili: q.musYetkili || c.yetkili,
    musTelefon: q.musTelefon || c.telefon,
    musEmail: q.musEmail || c.email,
    musAdres: q.musAdres || c.adres,
  };
}

function statusColor(d: ContractStatusT) {
  if (d === 'İmzalandı') return { bg: theme.colors.greenSoft, fg: theme.colors.greenText };
  if (d === 'Gönderildi') return { bg: theme.colors.primarySoft, fg: theme.colors.primaryDark };
  if (d === 'İptal') return { bg: theme.colors.redSoft, fg: theme.colors.redText };
  return { bg: theme.colors.goldSoft, fg: theme.colors.goldText };
}

function errMsg(e: any, fallback: string) {
  try {
    const parsed = JSON.parse(e?.body || '');
    if (parsed?.detail) return String(parsed.detail);
  } catch {}
  return e?.message || fallback;
}

export default function ContractsScreen() {
  const { activeCompany, quotes, customers, showToast } = useApp();
  const { t, lang } = useLanguage();
  const tc = (k: string) => t(`contracts.${k}`);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ quoteId?: string }>();
  const color = theme.colors.modules.sozlesme;

  const [list, setList] = useState<ContractT[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [tur, setTur] = useState(TYPES[0]);
  const [talimat, setTalimat] = useState('');
  const [quotePicker, setQuotePicker] = useState(false);
  const [custOpen, setCustOpen] = useState(false);

  const approvedQuotes = useMemo(() => quotes.filter((q) => q.durum === 'Onaylandı'), [quotes]);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      setList(await api.listContracts(activeCompany.id));
    } catch (e: any) {
      showToast(errMsg(e, tc('loadErr')));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany, showToast]);

  useEffect(() => { load(); }, [load]);

  // Gecmis ekranindaki "Sözleşme" butonundan gelindiyse: o teklife ait sozlesme
  // varsa onu ac, yoksa tekliften doldurulmus yeni bir taslak baslat.
  useEffect(() => {
    const qid = params.quoteId;
    if (!qid || loading || !activeCompany) return;
    const existing = list.find((c) => c.quoteId === qid);
    if (existing) setDraft({ ...existing });
    else {
      const q = quotes.find((x) => x.id === qid);
      if (q) startFromQuote(q);
    }
    router.setParams({ quoteId: '' } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.quoteId, loading]);

  const startFromQuote = (raw: QuoteT) => {
    setQuotePicker(false);
    const q = enrichQuote(raw, findCustomer(customers, raw.musFirma, raw.musTelefon));
    const d = draftFromQuote(q);
    if (activeCompany) {
      const tpl = buildContractTemplate(activeCompany, q, lang);
      d.baslik = tpl.baslik;
      d.icerik = tpl.icerik;
    }
    setDraft(d);
  };

  const stats = useMemo(() => ({
    total: list.length,
    signed: list.filter((c) => c.durum === 'İmzalandı').length,
    open: list.filter((c) => c.durum === 'Taslak' || c.durum === 'Gönderildi').length,
  }), [list]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  // Musteri alani: yazdikca kayitli musterilerden oneri; secince tum bilgiler dolar.
  const custSuggestions = useMemo(() => {
    if (!custOpen || !draft) return [];
    const q = norm(draft.musFirma);
    const list = q
      ? customers.filter((c) => norm(c.firma).includes(q) || norm(c.yetkili).includes(q) || (digits(q).length >= 3 && digits(c.telefon).includes(digits(q))))
      : customers;
    return list.slice(0, 8);
  }, [custOpen, draft, customers]);

  const pickCustomer = (c: CustomerT) => {
    patch({ musFirma: c.firma, musYetkili: c.yetkili || '', musTelefon: c.telefon || '', musEmail: c.email || '', musAdres: c.adres || '' });
    setCustOpen(false);
    showToast(tc('customerFilled'));
  };

  const runAi = async () => {
    if (!draft || !activeCompany || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await api.contractAiDraft({
        companyId: activeCompany.id,
        quoteId: draft.quoteId || undefined,
        sozlesmeTuru: `${tc(tur)} ${tc('contractWord')}`,
        dil: lang,
        talimat,
        mevcutMetin: draft.icerik,
        musFirma: draft.musFirma,
        musYetkili: draft.musYetkili,
        musAdres: draft.musAdres,
        musTelefon: draft.musTelefon,
        musEmail: draft.musEmail,
        tutar: draft.tutar,
        paraBirimi: draft.paraBirimi,
      });
      patch({ baslik: res.baslik, icerik: res.icerik });
      setTalimat('');
      showToast(tc('aiDone'));
    } catch (e: any) {
      showToast(errMsg(e, tc('aiErr')));
    } finally {
      setAiBusy(false);
    }
  };

  const applyTemplate = () => {
    if (!draft || !activeCompany) return;
    const base = draft.quoteId ? quotes.find((x) => x.id === draft.quoteId) || null : null;
    // Sablon, ekrandaki (musteri kaydindan doldurulmus olabilecek) guncel musteri bilgileriyle uretilir.
    const q = base
      ? { ...base, musFirma: draft.musFirma, musYetkili: draft.musYetkili, musTelefon: draft.musTelefon, musEmail: draft.musEmail, musAdres: draft.musAdres }
      : null;
    const tpl = buildContractTemplate(activeCompany, q, lang);
    patch({ baslik: draft.baslik || tpl.baslik, icerik: tpl.icerik });
  };

  const save = async (): Promise<Draft | null> => {
    if (!draft || !activeCompany) return null;
    if (!draft.baslik.trim()) { showToast(tc('enterTitle')); return null; }
    setSaving(true);
    try {
      const body = { ...draft, baslik: draft.baslik.trim() };
      const saved = draft.id
        ? await api.updateContract(draft.id, body)
        : await api.createContract({ ...body, companyId: activeCompany.id });
      setDraft({ ...saved });
      setList((l) => [saved, ...l.filter((c) => c.id !== saved.id)]);
      showToast(tc('saved'));
      return { ...saved };
    } catch (e: any) {
      showToast(errMsg(e, tc('saveErr')));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const doDelete = (c: Draft) => {
    const run = async () => {
      if (!c.id) { setDraft(null); return; }
      try {
        await api.deleteContract(c.id);
        setList((l) => l.filter((x) => x.id !== c.id));
        setDraft(null);
        showToast(tc('deleted'));
      } catch (e: any) { showToast(errMsg(e, tc('deleteErr'))); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(tc('deleteConfirm'))) run();
      return;
    }
    Alert.alert(tc('deleteTitle'), tc('deleteConfirm'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: tc('delete'), style: 'destructive', onPress: run },
    ]);
  };

  const sharePdf = async () => {
    if (!draft || !activeCompany || pdfBusy) return;
    if (!draft.icerik.trim()) { showToast(tc('needBody')); return; }
    setPdfBusy(true);
    try {
      const html = buildContractPdfHtml(activeCompany, draft, lang);
      const safe = (draft.musFirma || 'Sozlesme').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
      const fileName = `Sozlesme_${safe}.pdf`;
      if (Platform.OS === 'web') {
        const url = await htmlToPdfObjectUrlWeb(html);
        await downloadFileWeb(url, fileName);
        showToast(tc('pdfDone'));
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        let finalUri = uri;
        try {
          finalUri = uri.substring(0, uri.lastIndexOf('/') + 1) + fileName;
          await FileSystem.moveAsync({ from: uri, to: finalUri });
        } catch { finalUri = uri; }
        await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: draft.baslik, UTI: 'com.adobe.pdf' });
      }
      if (draft.id && draft.durum === 'Taslak') {
        const upd = await api.updateContract(draft.id, { durum: 'Gönderildi' });
        setDraft({ ...upd });
        setList((l) => l.map((c) => (c.id === upd.id ? upd : c)));
      }
    } catch (e: any) {
      showToast(errMsg(e, tc('pdfErr')));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tc('title')} />
        <View style={s.empty}><Text style={s.emptyText}>{tc('selectCompany')}</Text></View>
      </SafeAreaView>
    );
  }

  // ---------------- EDITOR ----------------
  if (draft) {
    const sc = statusColor(draft.durum);
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={tc('single')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <MotionScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.backRow} onPress={() => setDraft(null)} testID="contract-back">
              <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
              <Text style={s.backText}>{tc('title')}</Text>
              {draft.teklifNo ? <Text style={s.fromQuote}>{tc('quoteRef')} {draft.teklifNo}</Text> : null}
            </TouchableOpacity>

            <View style={s.card}>
              <Text style={s.label}>{tc('lblTitle')}</Text>
              <MotionInput style={s.input} value={draft.baslik} onChangeText={(v) => patch({ baslik: v })} placeholder={tc('phTitle')} placeholderTextColor="#94a3b8" testID="contract-title" />
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{tc('lblCustomer')}</Text>
                  <MotionInput
                    style={s.input}
                    value={draft.musFirma}
                    onChangeText={(v) => { patch({ musFirma: v }); setCustOpen(true); }}
                    onFocus={() => setCustOpen(true)}
                    placeholder={tc('phCustomer')}
                    placeholderTextColor="#94a3b8"
                    testID="contract-customer"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{tc('lblContact')}</Text>
                  <MotionInput style={s.input} value={draft.musYetkili} onChangeText={(v) => patch({ musYetkili: v })} placeholder={tc('phContact')} placeholderTextColor="#94a3b8" />
                </View>
              </View>
              {customers.length > 0 && (
                <TouchableOpacity style={s.pickCust} onPress={() => setCustOpen((v) => !v)} testID="contract-pick-customer">
                  <Ionicons name="people-outline" size={14} color={color} />
                  <Text style={[s.pickCustText, { color }]}>{tc('pickCustomer')}</Text>
                  <Ionicons name={custOpen ? 'chevron-up' : 'chevron-down'} size={14} color={color} />
                </TouchableOpacity>
              )}
              {custOpen && customers.length > 0 && (
                <View style={s.suggestBox} testID="contract-customer-suggestions">
                  {custSuggestions.length === 0 ? (
                    <Text style={[s.emptyText, { padding: 10 }]}>{tc('noCustomers')}</Text>
                  ) : custSuggestions.map((c) => (
                    <TouchableOpacity key={c.id} style={s.suggestRow} onPress={() => pickCustomer(c)} testID={`contract-cust-${c.id}`}>
                      <Ionicons name="person-circle-outline" size={20} color={color} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>{c.firma}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>{[c.yetkili, c.telefon, c.adres].filter(Boolean).join(' · ') || '—'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{tc('lblPhone')}</Text>
                  <MotionInput style={s.input} value={draft.musTelefon} onChangeText={(v) => patch({ musTelefon: v })} keyboardType="phone-pad" placeholder="—" placeholderTextColor="#94a3b8" testID="contract-phone" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{tc('lblEmail')}</Text>
                  <MotionInput style={s.input} value={draft.musEmail} onChangeText={(v) => patch({ musEmail: v })} keyboardType="email-address" autoCapitalize="none" placeholder="—" placeholderTextColor="#94a3b8" testID="contract-email" />
                </View>
              </View>
              <View style={s.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{tc('lblAddress')}</Text>
                  <MotionInput style={s.input} value={draft.musAdres} onChangeText={(v) => patch({ musAdres: v })} placeholder={tc('phAddress')} placeholderTextColor="#94a3b8" />
                </View>
                <View style={{ width: 150 }}>
                  <Text style={s.label}>{tc('lblAmount')} ({draft.paraBirimi})</Text>
                  <MotionInput
                    style={s.input}
                    keyboardType="numeric"
                    value={draft.tutar ? String(draft.tutar) : ''}
                    onChangeText={(v) => patch({ tutar: parseFloat(v.replace(',', '.')) || 0 })}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <Text style={s.label}>{tc('lblStatus')}</Text>
              <View style={s.chipRow}>
                {STATUSES.map((st) => {
                  const on = draft.durum === st;
                  const c = statusColor(st);
                  return (
                    <TouchableOpacity key={st} style={[s.chip, on && { backgroundColor: c.bg, borderColor: c.fg }]} onPress={() => patch({ durum: st })} testID={`contract-status-${st}`}>
                      <Text style={[s.chipText, on && { color: c.fg }]}>{statusLabel(lang, st)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Yapay zeka paneli */}
            <View style={[s.card, s.aiCard]}>
              <View style={s.aiHead}>
                <View style={s.aiIcon}><Ionicons name="sparkles" size={16} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.aiTitle}>{draft.icerik.trim() ? tc('aiEditTitle') : tc('aiWriteTitle')}</Text>
                  <Text style={s.aiSub}>
                    {draft.quoteId ? tc('aiSubQuote') : tc('aiSubFree')}
                  </Text>
                </View>
              </View>
              <View style={s.chipRow}>
                {TYPES.map((x) => (
                  <TouchableOpacity key={x} style={[s.chip, tur === x && { backgroundColor: color, borderColor: color }]} onPress={() => setTur(x)}>
                    <Text style={[s.chipText, tur === x && { color: '#fff' }]}>{tc(x)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <MotionInput
                style={[s.input, { marginTop: 10, minHeight: 60, textAlignVertical: 'top' }]}
                multiline
                value={talimat}
                onChangeText={setTalimat}
                placeholder={draft.icerik.trim() ? tc('phAiEdit') : tc('phAiNew')}
                placeholderTextColor="#94a3b8"
                testID="contract-ai-instructions"
              />
              <View style={[s.row2, { marginTop: 10 }]}>
                <TouchableOpacity style={[s.aiBtn, { backgroundColor: color }, aiBusy && { opacity: 0.6 }]} onPress={runAi} disabled={aiBusy} testID="contract-ai-btn">
                  {aiBusy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={15} color="#fff" />}
                  <Text style={s.aiBtnText}>{aiBusy ? tc('aiBusy') : draft.icerik.trim() ? tc('aiEditBtn') : tc('aiWriteBtn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.ghostBtn} onPress={applyTemplate} testID="contract-template-btn">
                  <Ionicons name="document-text-outline" size={15} color={color} />
                  <Text style={[s.ghostBtnText, { color }]}>{tc('template')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.label}>{tc('lblBody')}</Text>
              <TextInput
                style={s.editor}
                multiline
                value={draft.icerik}
                onChangeText={(v) => patch({ icerik: v })}
                placeholder={tc('phBody')}
                placeholderTextColor="#94a3b8"
                textAlignVertical="top"
                testID="contract-body"
              />
            </View>

            <View style={s.actions}>
              <View style={{ flex: 1 }}>
                <BubbleButton icon="checkmark-done" label={saving ? tc('saving') : tc('save')} color={color} size="lg" loading={saving} onPress={save} testID="contract-save" />
              </View>
              <TouchableOpacity style={s.iconAct} onPress={sharePdf} disabled={pdfBusy} testID="contract-pdf">
                {pdfBusy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="share-outline" size={20} color={color} />}
                <Text style={[s.iconActText, { color }]}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.iconAct} onPress={() => doDelete(draft)} testID="contract-delete">
                <Ionicons name="trash-outline" size={20} color={theme.colors.red} />
                <Text style={[s.iconActText, { color: theme.colors.red }]}>{tc('delete')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.hint, { color: sc.fg }]}>
              {tc('disclaimer')}
            </Text>
          </MotionScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---------------- LIST ----------------
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={tc('title')} />
      <MotionScrollView contentContainerStyle={[s.page, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <ScreenHero
          icon="document-lock"
          title={tc('title')}
          subtitle={activeCompany.sirketAdi}
          color={color}
          stats={[
            { label: tc('statTotal'), value: stats.total },
            { label: tc('statOpen'), value: stats.open, tone: '#FCD34D' },
            { label: tc('statSigned'), value: stats.signed, tone: '#6EE7B7' },
          ]}
        />

        <View style={s.row2}>
          <TouchableOpacity style={[s.bigBtn, { backgroundColor: color }]} onPress={() => setQuotePicker((v) => !v)} testID="contract-from-quote">
            <Ionicons name="swap-horizontal" size={18} color="#fff" />
            <Text style={s.bigBtnText}>{tc('fromQuote')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bigBtn, s.bigBtnGhost]} onPress={() => setDraft(emptyDraft())} testID="contract-new">
            <Ionicons name="add" size={18} color={color} />
            <Text style={[s.bigBtnText, { color }]}>{tc('blank')}</Text>
          </TouchableOpacity>
        </View>

        {quotePicker && (
          <View style={[s.card, { marginTop: 10 }]}>
            <Text style={s.label}>{tc('approvedQuotes')}</Text>
            {approvedQuotes.length === 0 ? (
              <Text style={s.emptyText}>{tc('noApproved')}</Text>
            ) : (
              approvedQuotes.slice(0, 30).map((q) => {
                const has = list.some((c) => c.quoteId === q.id);
                return (
                  <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => startFromQuote(q)} testID={`contract-quote-${q.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{q.musFirma || '—'}</Text>
                      <Text style={s.rowSub}>{q.teklifNo} · {q.tarih}{has ? ` · ${tc('hasContract')}` : ''}</Text>
                    </View>
                    <Text style={s.rowAmount}>{fmtMoney(q.genelToplam, q.paraBirimi)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        <Text style={s.sectionH}>{tc('mine')}</Text>
        {loading ? (
          <ActivityIndicator color={color} style={{ marginTop: 20 }} />
        ) : list.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyText}>{tc('empty')}</Text>
          </View>
        ) : (
          list.map((c, i) => {
            const sc = statusColor(c.durum);
            return (
              <Reveal key={c.id} variant={i % 2 === 0 ? 'left' : 'right'} distance={14}>
                <TouchableOpacity style={s.listRow} onPress={() => setDraft({ ...c })} testID={`contract-row-${c.id}`}>
                  <View style={[s.listIcon, { backgroundColor: color + '1A' }]}>
                    <Ionicons name="document-text" size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{c.musFirma || c.baslik}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>
                      {c.baslik}{c.teklifNo ? ` · ${c.teklifNo}` : ''} · {new Date(c.updatedAt).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'it' ? 'it-IT' : 'en-GB')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {c.tutar ? <Text style={s.rowAmount}>{fmtMoney(c.tutar, c.paraBirimi)}</Text> : null}
                    <View style={[s.badge, { backgroundColor: sc.bg }]}><Text style={[s.badgeText, { color: sc.fg }]}>{statusLabel(lang, c.durum)}</Text></View>
                  </View>
                </TouchableOpacity>
              </Reveal>
            );
          })
        )}
      </MotionScrollView>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  page: { padding: 14, width: '100%', maxWidth: 880, alignSelf: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  emptyBox: { marginTop: 4, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.lineDark, borderRadius: 12, padding: 26, alignItems: 'center', gap: 8 },
  sectionH: { fontSize: 11, fontWeight: '900', color: theme.colors.text, marginTop: 20, marginBottom: 8, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: theme.colors.modules.sozlesme, letterSpacing: 0.5 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginTop: 12, ...theme.shadow.sm },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, marginTop: 8, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 14, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 13.5, color: theme.colors.text },
  row2: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  aiCard: { borderColor: theme.colors.primaryBorder, backgroundColor: theme.colors.primarySoft },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  aiIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
  aiSub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 1 },
  aiBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  aiBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  ghostBtnText: { fontWeight: '800', fontSize: 13 },
  editor: {
    minHeight: 420, backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12,
    padding: 12, fontSize: 13, lineHeight: 20, color: theme.colors.text,
    ...(Platform.OS === 'web' ? ({ fontFamily: 'ui-monospace, Menlo, monospace' } as any) : {}),
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  iconAct: { alignItems: 'center', justifyContent: 'center', width: 58, height: 52, borderRadius: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.line },
  iconActText: { fontSize: 10.5, fontWeight: '800', marginTop: 2 },
  hint: { fontSize: 11, marginTop: 10, textAlign: 'center', opacity: 0.8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  backText: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  fromQuote: { marginLeft: 'auto', fontSize: 11, fontWeight: '800', color: theme.colors.textMuted },
  bigBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 14 },
  bigBtnGhost: { backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.lineDark },
  bigBtnText: { color: '#fff', fontWeight: '900', fontSize: 13.5 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.line, padding: 14, marginBottom: 10, ...theme.shadow.sm,
  },
  listIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  rowSub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: '900', color: theme.colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pickCust: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 4 },
  pickCustText: { fontSize: 12, fontWeight: '800' },
  suggestBox: { marginTop: 6, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 12, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
}));

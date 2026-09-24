import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, InvoicePartyT, InvoiceT, QuoteT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { BubbleButton, MotionInput, themedStyles } from '@/src/components/motion';
import { saveBase64Pdf } from '@/src/lib/pdf-b64';

// Onaylanan tekliften e-Fatura / e-Arşiv fatura (Nilvera). e-Fatura/e-Arşiv
// Türkiye'ye özgü olduğu için bu ekran bilerek sadece Türkçe.
// Alıcı VKN'si Nilvera'da e-Fatura mükellefi çıkarsa e-Fatura, değilse
// e-Arşiv kesilir -- bu kararı backend verir, burada önceden gösteriyoruz.

const fmt = (n: number, cur: string) =>
  `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${cur === 'TRY' ? '₺' : cur}`;

export default function InvoiceModal({ quote, onClose, onIssued }: {
  quote: QuoteT | null;
  onClose: () => void;
  onIssued?: (inv: InvoiceT) => void;
}) {
  const router = useRouter();
  const { activeCompany, customers, showToast } = useApp();
  const [a, setA] = useState<InvoicePartyT>({ vergiNo: '', unvan: '', vergiDairesi: '', adres: '', il: '', ilce: '', email: '', telefon: '' });
  const [notlar, setNotlar] = useState('');
  const [profil, setProfil] = useState<'TEMELFATURA' | 'TICARIFATURA'>('TEMELFATURA');
  const [check, setCheck] = useState<{ mukellef: boolean; unvan: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<'' | 'preview' | 'issue'>('');
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!quote) return;
    const key = (quote.musFirma || '').trim().toLocaleLowerCase('tr');
    const cust = customers.find((c) => (c.firma || '').trim().toLocaleLowerCase('tr') === key)
      || (quote.musTelefon ? customers.find((c) => c.telefon && c.telefon === quote.musTelefon) : undefined);
    setA({
      vergiNo: cust?.vergiNo || '',
      unvan: quote.musFirma || cust?.firma || '',
      vergiDairesi: cust?.vergiDairesi || '',
      adres: quote.musAdres || cust?.adres || '',
      il: cust?.il || '',
      ilce: cust?.ilce || '',
      email: quote.musEmail || cust?.email || '',
      telefon: quote.musTelefon || cust?.telefon || '',
    });
    setNotlar(''); setCheck(null); setErr(''); setConfirm(false); setProfil('TEMELFATURA');
  }, [quote, customers]);

  const vknOk = /^\d{10}$|^\d{11}$/.test(a.vergiNo.trim());
  useEffect(() => { setCheck(null); }, [a.vergiNo]);

  const totals = useMemo(() => {
    if (!quote) return null;
    const gross = (quote.items || []).reduce((s, it) => s + (Number(it.adet) || 0) * (Number(it.birimFiyat) || 0), 0);
    const disc = gross * (quote.iskonto || 0) / 100;
    const kdv = (gross - disc) * (quote.kdvOrani || 0) / 100;
    return { net: gross - disc, kdv, total: gross - disc + kdv };
  }, [quote]);

  if (!quote || !activeCompany) return null;
  const set = (k: keyof InvoicePartyT) => (v: string) => setA((p) => ({ ...p, [k]: v }));

  const doCheck = async () => {
    if (!vknOk) { setErr('VKN 10, TCKN 11 haneli olmalı'); return; }
    setChecking(true); setErr('');
    try {
      const r = await api.checkTaxpayer(activeCompany.id, a.vergiNo.trim());
      setCheck(r);
      if (r.mukellef && r.unvan && !a.unvan.trim()) setA((p) => ({ ...p, unvan: r.unvan }));
    } catch (e: any) { setErr(e?.message || 'Sorgulanamadı'); } finally { setChecking(false); }
  };

  const validate = () => {
    if (!vknOk) return 'Alıcı VKN (10 hane) veya TCKN (11 hane) girin';
    if (!a.unvan.trim()) return 'Alıcı unvanı / adı soyadı gerekli';
    if (!a.adres.trim() || !a.il.trim()) return 'Alıcı adresi ve ili gerekli';
    if (a.vergiNo.trim().length === 10 && !a.vergiDairesi.trim()) return 'Şirket alıcılarda vergi dairesi gerekli';
    return '';
  };
  const body = () => ({ companyId: activeCompany.id, quoteId: quote.id, alici: { ...a, ulke: 'Türkiye' }, notlar, efaturaProfil: profil });

  const preview = async () => {
    const v = validate(); if (v) { setErr(v); return; }
    setBusy('preview'); setErr('');
    try {
      const r = await api.previewInvoice(body());
      await saveBase64Pdf(r.pdfBase64, r.fileName);
    } catch (e: any) { setErr(e?.message || 'Önizleme alınamadı'); } finally { setBusy(''); }
  };

  const issue = async () => {
    const v = validate(); if (v) { setErr(v); return; }
    if (!confirm) { setConfirm(true); return; }
    setBusy('issue'); setErr('');
    try {
      const inv = await api.issueInvoice(body());
      showToast(`Fatura kesildi${inv.faturaNo ? `: ${inv.faturaNo}` : ''}`);
      onIssued?.(inv);
      onClose();
    } catch (e: any) { setErr(e?.message || 'Fatura kesilemedi'); setConfirm(false); } finally { setBusy(''); }
  };

  const needsSetup = /API anahtar|bağlantı testini|VKN\/TCKN bilgisini/.test(err);
  const cur = quote.paraBirimi || 'TRY';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.hdr}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Fatura Kes</Text>
              <Text style={s.muted}>Teklif {quote.teklifNo} · {quote.musFirma}</Text>
            </View>
            <TouchableOpacity onPress={onClose} testID="invoice-close"><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {totals && (
              <View style={s.sum}>
                <View style={{ flex: 1 }}><Text style={s.sumL}>Matrah</Text><Text style={s.sumV}>{fmt(totals.net, cur)}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.sumL}>KDV %{quote.kdvOrani}</Text><Text style={s.sumV}>{fmt(totals.kdv, cur)}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.sumL}>Toplam</Text><Text style={[s.sumV, { color: theme.colors.modules.efatura }]}>{fmt(totals.total, cur)}</Text></View>
              </View>
            )}
            {cur !== 'TRY' && <Text style={s.hint}>Teklif {cur} cinsinden; fatura güncel TCMB kuru ile {cur} olarak kesilir.</Text>}

            <Text style={s.label}>ALICI VKN / TCKN</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MotionInput style={[s.input, { flex: 1 }]} keyboardType="number-pad" value={a.vergiNo} onChangeText={(v) => set('vergiNo')(v.replace(/\D/g, '').slice(0, 11))} placeholder="10 veya 11 hane" placeholderTextColor="#94a3b8" testID="inv-vkn" />
              <TouchableOpacity style={[s.checkBtn, !vknOk && { opacity: 0.5 }]} onPress={doCheck} disabled={!vknOk || checking} testID="inv-check">
                {checking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.checkBtnT}>Sorgula</Text>}
              </TouchableOpacity>
            </View>
            {check && (
              <View style={[s.checkRes, check.mukellef ? s.checkResE : null]} testID="inv-check-result">
                <Ionicons name={check.mukellef ? 'business' : 'person'} size={16} color={check.mukellef ? theme.colors.primaryDark : theme.colors.textSoft} />
                <Text style={s.checkResT}>
                  {check.mukellef ? `e-Fatura mükellefi${check.unvan ? ` (${check.unvan})` : ''} → e-Fatura kesilecek` : 'e-Fatura mükellefi değil → e-Arşiv fatura kesilecek'}
                </Text>
              </View>
            )}
            {check?.mukellef && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {(['TEMELFATURA', 'TICARIFATURA'] as const).map((p) => (
                  <TouchableOpacity key={p} style={[s.chip, profil === p && s.chipA]} onPress={() => setProfil(p)}>
                    <Text style={[s.chipT, profil === p && { color: '#fff' }]}>{p === 'TEMELFATURA' ? 'Temel Fatura' : 'Ticari Fatura'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={s.label}>UNVAN / AD SOYAD</Text>
            <MotionInput style={s.input} value={a.unvan} onChangeText={set('unvan')} testID="inv-unvan" />
            <Text style={s.label}>VERGİ DAİRESİ{a.vergiNo.length === 11 ? ' (şahıslarda opsiyonel)' : ''}</Text>
            <MotionInput style={s.input} value={a.vergiDairesi} onChangeText={set('vergiDairesi')} testID="inv-vd" />
            <Text style={s.label}>ADRES</Text>
            <MotionInput style={[s.input, { minHeight: 54, textAlignVertical: 'top' }]} multiline value={a.adres} onChangeText={set('adres')} testID="inv-adres" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={s.label}>İLÇE</Text><MotionInput style={s.input} value={a.ilce} onChangeText={set('ilce')} testID="inv-ilce" /></View>
              <View style={{ flex: 1 }}><Text style={s.label}>İL</Text><MotionInput style={s.input} value={a.il} onChangeText={set('il')} testID="inv-il" /></View>
            </View>
            <Text style={s.label}>E-POSTA (e-Arşiv fatura bu adrese gider)</Text>
            <MotionInput style={s.input} keyboardType="email-address" autoCapitalize="none" value={a.email} onChangeText={set('email')} testID="inv-email" />
            <Text style={s.label}>FATURA NOTU (opsiyonel)</Text>
            <MotionInput style={s.input} value={notlar} onChangeText={setNotlar} placeholder="ör. Sipariş no, teslim bilgisi" placeholderTextColor="#94a3b8" />

            {err ? (
              <View style={s.errBox}>
                <Text style={s.err}>{err}</Text>
                {needsSetup && (
                  <TouchableOpacity onPress={() => { onClose(); router.push('/(tabs)/efatura' as any); }}>
                    <Text style={s.errLink}>e-Fatura ayarlarına git →</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            {confirm && !err && (
              <Text style={s.warn} testID="inv-confirm-warn">Fatura resmi olarak düzenlenecek ve GİB’e iletilecek. Emin misiniz? Onaylamak için tekrar basın.</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <BubbleButton icon="eye-outline" label={busy === 'preview' ? 'Hazırlanıyor…' : 'Önizle'} color={theme.colors.navy} size="lg" loading={busy === 'preview'} onPress={preview} testID="inv-preview" />
              </View>
              <View style={{ flex: 1.3 }}>
                <BubbleButton icon="send" label={busy === 'issue' ? 'Kesiliyor…' : confirm ? 'Evet, Faturayı Kes' : 'Faturayı Kes'} color={confirm ? theme.colors.red : theme.colors.modules.efatura} size="lg" loading={busy === 'issue'} onPress={issue} testID="inv-issue" />
              </View>
            </View>
            <Text style={[s.hint, { marginTop: 10 }]}>Alıcının vergi bilgileri müşteri kartına kaydedilir; sonraki faturada hazır gelir.</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '94%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  muted: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  sum: { flexDirection: 'row', gap: 8, backgroundColor: theme.colors.surfaceSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.line },
  sumL: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft },
  sumV: { fontSize: 14, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 8, lineHeight: 16 },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginTop: 12, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 9, fontSize: 14, color: theme.colors.text },
  checkBtn: { backgroundColor: theme.colors.navy, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', minWidth: 90, alignItems: 'center' },
  checkBtnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  checkRes: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceSoft },
  checkResE: { backgroundColor: theme.colors.primarySoft },
  checkResT: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.efatura, borderColor: theme.colors.modules.efatura },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  errBox: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: theme.colors.redSoft },
  err: { color: theme.colors.redText, fontSize: 12.5, fontWeight: '700' },
  errLink: { color: theme.colors.primaryDark, fontWeight: '800', marginTop: 6, fontSize: 12.5 },
  warn: { marginTop: 12, color: theme.colors.redText, fontSize: 12.5, fontWeight: '800' },
}));

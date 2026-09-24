import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { api, CatalogItemT, StockMoveT } from '@/src/lib/api';
import { BubbleButton, MotionInput, themedStyles } from '@/src/components/motion';
import { fill, useLanguage } from '@/src/lib/i18n';

// Katalog > Stok hareketi: giriş / çıkış / sayım düzeltmesi + son hareketler.
// Onaylanan tekliflerdeki düşüşler ("satis") ve geri eklemeler ("iade")
// backend tarafından otomatik yazılır, burada sadece listelenir.

type Tip = 'giris' | 'cikis' | 'duzeltme';

export function stockLow(it: CatalogItemT): boolean {
  return !!it.stokTakip && (it.stok ?? 0) <= (it.minStok ?? 0);
}

export function fmtQty(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n || 0);
}

export default function StockModal({ item, companyId, onClose, onChanged }: {
  item: CatalogItemT | null;
  companyId: string;
  onClose: () => void;
  onChanged: (it: CatalogItemT) => void;
}) {
  const { t } = useLanguage();
  const ts = (k: string) => t('stock.' + k);
  const [tip, setTip] = useState<Tip>('giris');
  const [miktar, setMiktar] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [moves, setMoves] = useState<StockMoveT[] | null>(null);
  const [cur, setCur] = useState<CatalogItemT | null>(item);

  useEffect(() => {
    setCur(item);
    setTip('giris'); setMiktar(''); setAciklama(''); setErr(''); setMoves(null);
    if (item) api.listStockMoves(companyId, item.id).then(setMoves).catch(() => setMoves([]));
  }, [item, companyId]);

  if (!item || !cur) return null;

  const save = async () => {
    const n = Number(miktar.replace(',', '.'));
    if (!miktar.trim() || isNaN(n) || (tip !== 'duzeltme' && n <= 0) || n < 0) { setErr(ts('enterQty')); return; }
    setSaving(true); setErr('');
    try {
      const updated = await api.moveStock(item.id, { companyId, tip, miktar: n, aciklama });
      setCur(updated);
      onChanged(updated);
      setMiktar(''); setAciklama('');
      setMoves(await api.listStockMoves(companyId, item.id).catch(() => moves || []));
    } catch (e: any) {
      setErr(e?.message || ts('err'));
    } finally { setSaving(false); }
  };

  const low = stockLow(cur);
  const tipLabel: Record<string, string> = {
    giris: ts('in'), cikis: ts('out'), duzeltme: ts('count'), satis: ts('sale'), iade: ts('return'),
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.hdr}>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{cur.urunAdi}</Text>
              {cur.stokKodu ? <Text style={s.muted}>{ts('code')}: {cur.stokKodu}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} testID="stock-close"><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[s.now, low && { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.red }]}>
              <Text style={s.nowLabel}>{ts('current')}</Text>
              <Text style={[s.nowVal, low && { color: theme.colors.redText }]} testID="stock-current">{fmtQty(cur.stok ?? 0)} {cur.birim}</Text>
              {cur.stokTakip ? <Text style={s.muted}>{fill(ts('minHint'), { n: fmtQty(cur.minStok ?? 0) })}{low ? ` · ${ts('lowWarn')}` : ''}</Text> : <Text style={s.muted}>{ts('notTracked')}</Text>}
            </View>

            <View style={s.row}>
              {(['giris', 'cikis', 'duzeltme'] as Tip[]).map((x) => (
                <TouchableOpacity key={x} style={[s.chip, tip === x && s.chipA]} onPress={() => setTip(x)} testID={`stock-tip-${x}`}>
                  <Ionicons name={x === 'giris' ? 'arrow-down' : x === 'cikis' ? 'arrow-up' : 'clipboard-outline'} size={14} color={tip === x ? '#fff' : theme.colors.textMuted} />
                  <Text style={[s.chipT, tip === x && { color: '#fff' }]}>{tipLabel[x]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>{tip === 'duzeltme' ? ts('countedQty') : ts('qty')} ({cur.birim})</Text>
            <MotionInput style={s.input} keyboardType="numeric" value={miktar} onChangeText={setMiktar} placeholder="0" placeholderTextColor="#94a3b8" testID="stock-qty" />
            <Text style={[s.label, { marginTop: 10 }]}>{ts('note')}</Text>
            <MotionInput style={s.input} value={aciklama} onChangeText={setAciklama} placeholder={ts('notePh')} placeholderTextColor="#94a3b8" />
            {err ? <Text style={s.err}>{err}</Text> : null}
            <View style={{ marginTop: 12 }}>
              <BubbleButton icon="checkmark" label={saving ? ts('saving') : ts('save')} color={theme.colors.modules.katalog} size="lg" loading={saving} onPress={save} testID="stock-save" />
            </View>

            <Text style={s.section}>{ts('history')}</Text>
            {moves == null ? <ActivityIndicator color={theme.colors.modules.katalog} /> : moves.length === 0 ? (
              <Text style={s.muted}>{ts('noMoves')}</Text>
            ) : moves.map((m) => (
              <View key={m.id} style={s.move}>
                <View style={{ flex: 1 }}>
                  <Text style={s.moveT}>{tipLabel[m.tip] || m.tip}{m.aciklama ? ` · ${m.aciklama}` : ''}</Text>
                  <Text style={s.muted}>{new Date(m.createdAt).toLocaleString()}{m.createdByEmail ? ` · ${m.createdByEmail}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.moveQ, { color: m.miktar >= 0 ? theme.colors.greenText : theme.colors.redText }]}>{m.miktar >= 0 ? '+' : ''}{fmtQty(m.miktar)}</Text>
                  <Text style={s.muted}>→ {fmtQty(m.sonraki)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '900', color: theme.colors.text },
  muted: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  now: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceSoft, padding: 14, marginBottom: 12 },
  nowLabel: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, letterSpacing: 0.4 },
  nowVal: { fontSize: 24, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
  row: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.katalog, borderColor: theme.colors.modules.katalog },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 14, color: theme.colors.text },
  err: { color: theme.colors.redText, fontSize: 12, fontWeight: '700', marginTop: 8 },
  section: { fontSize: 11, fontWeight: '900', color: theme.colors.text, marginTop: 20, marginBottom: 8, letterSpacing: 0.5 },
  move: { flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  moveT: { fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  moveQ: { fontSize: 13, fontWeight: '900' },
}));

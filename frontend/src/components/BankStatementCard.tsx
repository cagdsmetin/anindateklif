import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { pickSheetRows } from '@/src/lib/customer-import';
import { StatementRow, matchCustomers, parseStatement } from '@/src/lib/bank-statement';
import { fill, useLanguage } from '@/src/lib/i18n';
import { MotionInput, themedStyles } from '@/src/components/motion';

// Tahsilat > Banka ekstresi: hesap hareketlerini yükle, para girişlerini
// müşterilerle eşleştir, onaylananları "Havale/EFT" tahsilatı olarak yaz.
// Onaylamadan hiçbir kayıt yazılmaz; aynı satır ikinci kez aktarılmaz (ekstreRef).

const tl = (n: number) => '₺' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function BankStatementCard() {
  const { t } = useLanguage();
  const tb = (k: string) => t('ekstre.' + k);
  const { customers, tahsilat, addTahsilatEntry, showToast } = useApp();
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const pick = async () => {
    try {
      const picked = await pickSheetRows();
      if (!picked) return;
      const parsed = parseStatement(picked.rows);
      if (!parsed) { showToast(tb('badHeader')); return; }
      const done = new Set(tahsilat.map((x) => x.ekstreRef).filter(Boolean));
      const fresh = parsed.items.filter((x) => !done.has(x.ref));
      const matched = matchCustomers(fresh, customers, tahsilat);
      setRows(matched);
      setChecked(Object.fromEntries(matched.map((r) => [r.ref, r.reason === 'name' || r.reason === 'both'])));
      setInfo(fill(tb('found'), { n: parsed.items.length, dup: parsed.items.length - fresh.length, m: matched.filter((r) => r.score > 0).length }));
    } catch (e: any) { showToast(e?.message || ''); }
  };

  const suggestions = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    return customers.filter((c) => c.firma.toLowerCase().includes(qq)).slice(0, 5);
  }, [q, customers]);

  const setCustomer = (ref: string, c: { id: string; firma: string; telefon?: string }) => {
    setRows((rs) => (rs || []).map((r) => (r.ref === ref ? { ...r, customerId: c.id, musteriAdi: c.firma, musteriTelefon: c.telefon || '', reason: r.reason || 'name', score: r.score || 1 } : r)));
    setChecked((ch) => ({ ...ch, [ref]: true }));
    setEditing(''); setQ('');
  };

  const selected = (rows || []).filter((r) => checked[r.ref] && r.musteriAdi);
  const total = selected.reduce((s, r) => s + r.tutar, 0);

  const confirm = async () => {
    if (!selected.length) return;
    setBusy(true);
    let ok = 0;
    for (const r of selected) {
      try {
        await addTahsilatEntry({
          customerId: r.customerId, musteriAdi: r.musteriAdi, musteriTelefon: r.musteriTelefon, tur: 'tahsilat',
          tutar: r.tutar, paraBirimi: 'TRY', yontem: 'Havale/EFT', vadeTarihi: '', tarih: r.tarih,
          notlar: `${tb('notePrefix')}: ${r.aciklama}`.slice(0, 200), kurTRY: 0, ekstreRef: r.ref,
        } as any);
        ok++;
      } catch { /* 409: zaten aktarılmış */ }
    }
    setBusy(false);
    showToast(fill(tb('saved'), { n: ok }));
    setRows(null); setChecked({}); setInfo('');
  };

  return (
    <View style={s.card} testID="bank-statement">
      <Text style={s.desc}>{tb('desc')}</Text>
      {!rows ? (
        <TouchableOpacity style={s.btn} onPress={pick} testID="bank-statement-upload">
          <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
          <Text style={s.btnText}>{tb('upload')}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={s.info}>{info}</Text>
          {rows.length === 0 ? <Text style={s.desc}>{tb('nothing')}</Text> : rows.map((r) => (
            <View key={r.ref} style={s.row}>
              <TouchableOpacity onPress={() => r.musteriAdi && setChecked((c) => ({ ...c, [r.ref]: !c[r.ref] }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID={`ekstre-check-${r.ref}`}>
                <Ionicons name={checked[r.ref] && r.musteriAdi ? 'checkbox' : 'square-outline'} size={20} color={r.musteriAdi ? theme.colors.modules.tahsilat : theme.colors.line} />
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={s.date}>{r.tarih.split('-').reverse().join('.')}</Text>
                  <Text style={s.amount}>+{tl(r.tutar)}</Text>
                </View>
                <Text style={s.acik} numberOfLines={2}>{r.aciklama || '—'}</Text>
                {editing === r.ref ? (
                  <View style={{ zIndex: 10 }}>
                    <MotionInput style={s.input} value={q} onChangeText={setQ} autoFocus placeholder={tb('searchPh')} placeholderTextColor="#94a3b8" />
                    {suggestions.map((c) => (
                      <TouchableOpacity key={c.id} style={s.sug} onPress={() => setCustomer(r.ref, c)}>
                        <Ionicons name="person-outline" size={13} color={theme.colors.primary} />
                        <Text style={s.sugText} numberOfLines={1}>{c.firma}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TouchableOpacity style={s.matchRow} onPress={() => { setEditing(r.ref); setQ(''); }} testID={`ekstre-match-${r.ref}`}>
                    <Ionicons name={r.musteriAdi ? 'person' : 'help-circle-outline'} size={13} color={r.musteriAdi ? theme.colors.green : theme.colors.textMuted} />
                    <Text style={[s.match, !r.musteriAdi && { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {r.musteriAdi || tb('noMatch')}{r.reason ? ` · ${tb('r_' + r.reason)}` : ''}
                    </Text>
                    <Text style={s.change}>{tb('change')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <View style={s.foot}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { setRows(null); setInfo(''); }}>
              <Text style={[s.btnText, { color: theme.colors.text }]}>{tb('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { flex: 1 }, !selected.length && { opacity: 0.5 }]} disabled={!selected.length || busy} onPress={confirm} testID="bank-statement-confirm">
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-done" size={16} color="#fff" />}
              <Text style={s.btnText}>{fill(tb('confirm'), { n: selected.length, sum: tl(total) })}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 14, ...theme.shadow.sm },
  desc: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  info: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.colors.modules.tahsilat },
  btnGhost: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.lineDark },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.line },
  date: { fontSize: 11, fontWeight: '800', color: theme.colors.textSoft },
  amount: { fontSize: 13, fontWeight: '900', color: theme.colors.green },
  acik: { fontSize: 11.5, color: theme.colors.text, marginTop: 2 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  match: { flex: 1, fontSize: 12, fontWeight: '800', color: theme.colors.text },
  change: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  input: { marginTop: 6, backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5, color: theme.colors.text },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 4 },
  sugText: { fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  foot: { flexDirection: 'row', gap: 8 },
}));

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { api, NotifyLogT, NotifySettingsT } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import { MotionInput, themedStyles } from '@/src/components/motion';
import { fill, useLanguage } from '@/src/lib/i18n';

// Hatırlatmalar > Otomatik e-postalar: vadesi yaklaşan/geçen borçlar, yaklaşan
// bakımlar ve cevapsız teklifler için müşteriye; firma sahibine de günlük
// özet. Gönderimi backend her sabah yapar (bkz. server.py _notify_loop).
// WhatsApp için otomatik gönderim Meta onaylı şablon ister; burada müşteri
// e-postası olmayan kayıtlar için tek dokunuşla WhatsApp kısayolu var.

export default function AutoReminders() {
  const { t, lang } = useLanguage();
  const ta = (k: string) => t('autoRem.' + k);
  const { activeCompany, showToast, tahsilat, customers } = useApp();
  const { user: me } = useAuth();
  const restricted = !!me?.is_staff && me?.staff_role !== 'admin';
  const [st, setSt] = useState<NotifySettingsT | null>(null);
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<NotifyLogT[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!activeCompany || restricted) return;
    api.getNotifySettings(activeCompany.id).then(setSt).catch(() => {});
  }, [activeCompany, restricted]);

  useEffect(() => {
    if (open && activeCompany && log == null) api.listNotifyLog(activeCompany.id).then(setLog).catch(() => setLog([]));
  }, [open, activeCompany, log]);

  if (!activeCompany || restricted || !st) return null;

  const persist = async (patch: Partial<NotifySettingsT>) => {
    const next = { ...st, ...patch };
    if (patch.aktif === true && !st.dil) next.dil = lang;
    setSt(next);
    setSaving(true);
    try { setSt(await api.putNotifySettings(next)); } catch (e: any) { showToast(e?.message || ta('err')); } finally { setSaving(false); }
  };

  const testMail = async () => {
    const to = st.ozetEmail || activeCompany.email || me?.email || '';
    if (!to) { showToast(ta('noEmail')); return; }
    setTesting(true);
    try { await api.testNotifyEmail(activeCompany.id, to); showToast(fill(ta('testSent'), { to })); } catch (e: any) { showToast(e?.message || ta('err')); } finally { setTesting(false); }
  };

  // Vadesi yaklaşan ama müşterisinin e-postası olmayan borçlar: WhatsApp kısayolu.
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const emailOf = (cid: string, name: string) => customers.find((c) => c.id === cid || (c.firma || '').trim().toLowerCase() === (name || '').trim().toLowerCase())?.email;
  const waDue = (tahsilat || []).filter((x) => x.tur === 'borc' && x.vadeTarihi && x.vadeTarihi <= soon && x.vadeTarihi >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    && x.musteriTelefon && !emailOf(x.customerId, x.musteriAdi)).slice(0, 5);
  const openWa = (x: any) => {
    const phone = String(x.musteriTelefon).replace(/\D/g, '').replace(/^0/, '90');
    const amount = `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(x.tutar)} ${x.paraBirimi === 'TRY' ? '₺' : x.paraBirimi}`;
    const msg = fill(x.vadeTarihi < today ? ta('waOverdue') : ta('waDue'), {
      name: x.musteriAdi, amount, date: x.vadeTarihi.split('-').reverse().join('.'), company: activeCompany.sirketAdi || '',
    });
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
  };

  // Bilerek bileşen değil düz fonksiyon: içindeki input her tuşta yeniden
  // bağlanıp odağı kaybetmesin.
  const row = ({ k, label, dayKey, dayLabel }: { k: keyof NotifySettingsT; label: string; dayKey?: keyof NotifySettingsT; dayLabel?: string }) => (
    <View style={s.row} key={String(k)}>
      <Switch value={!!st[k]} onValueChange={(v) => persist({ [k]: v } as any)} testID={`auto-${String(k)}`} />
      <Text style={s.rowT}>{label}</Text>
      {dayKey ? (
        <View style={s.dayBox}>
          <MotionInput
            style={s.dayInput}
            keyboardType="number-pad"
            value={String(st[dayKey] ?? '')}
            onChangeText={(v) => setSt({ ...st, [dayKey]: Number(v.replace(/\D/g, '').slice(0, 2)) || 0 } as any)}
            onBlur={() => persist({})}
          />
          <Text style={s.dayT}>{dayLabel}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[s.card, st.aktif && { borderColor: theme.colors.green }]}>
      <View style={s.head}>
        <TouchableOpacity style={[s.head, { flex: 1 }]} onPress={() => setOpen((o) => !o)} activeOpacity={0.85} testID="auto-rem-toggle-open">
          <View style={[s.icon, st.aktif && { backgroundColor: theme.colors.greenSoft }]}>
            <Ionicons name="mail-unread-outline" size={18} color={st.aktif ? theme.colors.greenText : theme.colors.modules.hatirlatma} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{ta('title')}</Text>
            <Text style={s.sub}>{st.aktif ? ta('onSub') : ta('offSub')}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
        {saving ? <ActivityIndicator size="small" /> : null}
        <Switch value={st.aktif} onValueChange={(v) => { persist({ aktif: v }); if (v) setOpen(true); }} testID="auto-rem-aktif" />
      </View>

      {open && (
        <View style={{ marginTop: 10 }}>
          {row({ k: "vadeHatirlat", label: ta('due'), dayKey: "vadeGunOnce", dayLabel: ta('daysBefore') })}
          {row({ k: "vadeGecikme", label: ta('overdue') })}
          {row({ k: "bakimHatirlat", label: ta('maint'), dayKey: "bakimGunOnce", dayLabel: ta('daysBefore') })}
          {row({ k: "teklifTakip", label: ta('quote'), dayKey: "teklifTakipGun", dayLabel: ta('daysAfter') })}
          {row({ k: "gunlukOzet", label: ta('digest') })}
          <Text style={s.label}>{ta('digestTo')}</Text>
          <MotionInput
            style={s.input}
            keyboardType="email-address"
            autoCapitalize="none"
            value={st.ozetEmail}
            placeholder={activeCompany.email || me?.email || 'ornek@firma.com'}
            placeholderTextColor="#94a3b8"
            onChangeText={(v) => setSt({ ...st, ozetEmail: v })}
            onBlur={() => persist({})}
          />
          <Text style={s.label}>{ta('lang')}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['tr', 'en', 'it'] as const).map((l) => (
              <TouchableOpacity key={l} style={[s.chip, st.dil === l && s.chipA]} onPress={() => persist({ dil: l })}>
                <Text style={[s.chipT, st.dil === l && { color: '#fff' }]}>{l.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.hint}>{ta('hint')}</Text>
          <TouchableOpacity style={s.testBtn} onPress={testMail} disabled={testing} testID="auto-rem-test">
            {testing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="paper-plane-outline" size={15} color="#fff" />}
            <Text style={s.testBtnT}>{ta('test')}</Text>
          </TouchableOpacity>

          {waDue.length > 0 && (
            <>
              <Text style={s.label}>{ta('waTitle')}</Text>
              {waDue.map((x) => (
                <TouchableOpacity key={x.id} style={s.waRow} onPress={() => openWa(x)}>
                  <Ionicons name="logo-whatsapp" size={17} color="#16a34a" />
                  <Text style={s.waT} numberOfLines={1}>{x.musteriAdi} · {x.vadeTarihi.split('-').reverse().join('.')}</Text>
                  <Ionicons name="open-outline" size={15} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </>
          )}

          <Text style={s.label}>{ta('log')}</Text>
          {log == null ? <ActivityIndicator /> : log.length === 0 ? <Text style={s.hint}>{ta('logEmpty')}</Text> : log.slice(0, 15).map((l) => (
            <View key={l.key} style={s.logRow}>
              <Ionicons name={l.durum === 'gönderildi' ? 'checkmark-circle' : 'alert-circle'} size={15} color={l.durum === 'gönderildi' ? theme.colors.green : theme.colors.red} />
              <View style={{ flex: 1 }}>
                <Text style={s.logT} numberOfLines={1}>{l.konu}</Text>
                <Text style={s.hint}>{l.alici} · {new Date(l.createdAt).toLocaleString()}{l.durum !== 'gönderildi' ? ` · ${l.durum}` : ''}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.modules.hatirlatma + '1A' },
  title: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  sub: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  rowT: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  dayBox: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayInput: { width: 44, textAlign: 'center', fontSize: 13, fontWeight: '800', color: theme.colors.text, backgroundColor: theme.colors.surfaceSoft, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.lineDark, paddingVertical: Platform.OS === 'ios' ? 6 : 4 },
  dayT: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '700' },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginTop: 14, marginBottom: 6, letterSpacing: 0.4 },
  input: { backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 13.5, color: theme.colors.text },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.lineDark },
  chipA: { backgroundColor: theme.colors.modules.hatirlatma, borderColor: theme.colors.modules.hatirlatma },
  chipT: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 6, lineHeight: 16 },
  testBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 10, backgroundColor: theme.colors.navy, marginTop: 10 },
  testBtnT: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  waRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  waT: { flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
  logRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  logT: { fontSize: 12.5, fontWeight: '700', color: theme.colors.text },
}));

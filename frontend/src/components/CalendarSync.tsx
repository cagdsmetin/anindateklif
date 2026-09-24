import React, { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';
import { useApp } from '@/src/state/AppContext';
import { themedStyles } from '@/src/components/motion';
import { fill, useLanguage } from '@/src/lib/i18n';

// Takvim senkronu: firmaya özel abonelik adresi (Google/Apple/Outlook
// takvimine bir kez eklenir, hatırlatma/servis/bakım/vade günleri orada
// kendiliğinden görünür) + başka takvimden .ics içe aktarma.

export default function CalendarSync() {
  const { t } = useLanguage();
  const tc = (k: string) => t('calSync.' + k);
  const { activeCompany, reloadReminders, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<{ url: string; webcalUrl: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  if (!activeCompany) return null;
  const cid = activeCompany.id;

  const openModal = async () => {
    setOpen(true);
    if (!feed) {
      try { setFeed(await api.getCalendarFeedUrl(cid)); } catch (e: any) { showToast(e?.message || tc('err')); }
    }
  };

  const copy = async () => {
    if (!feed) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(feed.url); setCopied(true); setTimeout(() => setCopied(false), 2000); return; } catch {}
    }
    try { await Share.share({ message: feed.url }); } catch {}
  };

  const google = () => feed && Linking.openURL(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.webcalUrl)}`);
  const apple = () => feed && Linking.openURL(feed.webcalUrl);
  const outlook = () => feed && Linking.openURL(`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed.url)}&name=${encodeURIComponent(activeCompany.sirketAdi || 'Anında Teklif')}`);

  const rotate = async () => {
    if (Platform.OS === 'web' && !window.confirm(tc('rotateConfirm'))) return;
    setBusy('rotate');
    try { setFeed(await api.rotateCalendarFeedUrl(cid)); showToast(tc('rotated')); } catch (e: any) { showToast(e?.message || tc('err')); } finally { setBusy(''); }
  };

  const importIcs = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/calendar', 'text/plain', 'application/octet-stream', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const webFile: any = (asset as any).file;
      setBusy('import');
      const text = Platform.OS === 'web' && webFile ? await webFile.text() : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const r = await api.importCalendar(cid, text);
      await reloadReminders().catch(() => {});
      showToast(fill(tc('imported'), { n: r.created, s: r.skipped }));
    } catch (e: any) {
      showToast(e?.message || tc('err'));
    } finally { setBusy(''); }
  };

  return (
    <>
      <TouchableOpacity style={s.card} onPress={openModal} activeOpacity={0.85} testID="calendar-sync-open">
        <View style={s.icon}><Ionicons name="sync" size={18} color={theme.colors.modules.hatirlatma} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardT}>{tc('title')}</Text>
          <Text style={s.cardS}>{tc('sub')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.hdr}>
              <Text style={s.title}>{tc('title')}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} testID="calendar-sync-close"><Ionicons name="close" size={22} color={theme.colors.text} /></TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={s.h}>{tc('exportH')}</Text>
              <Text style={s.p}>{tc('exportP')}</Text>
              {!feed ? <ActivityIndicator color={theme.colors.modules.hatirlatma} /> : (
                <>
                  <View style={s.urlBox}>
                    <TextInput style={s.url} value={feed.url} editable={false} selectTextOnFocus testID="calendar-feed-url" />
                    <TouchableOpacity style={s.copyBtn} onPress={copy}>
                      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <View style={s.btnRow}>
                    <TouchableOpacity style={s.btn} onPress={google} testID="calendar-google"><Ionicons name="logo-google" size={15} color={theme.colors.text} /><Text style={s.btnT}>Google</Text></TouchableOpacity>
                    <TouchableOpacity style={s.btn} onPress={apple}><Ionicons name="logo-apple" size={15} color={theme.colors.text} /><Text style={s.btnT}>Apple</Text></TouchableOpacity>
                    <TouchableOpacity style={s.btn} onPress={outlook}><Ionicons name="mail-outline" size={15} color={theme.colors.text} /><Text style={s.btnT}>Outlook</Text></TouchableOpacity>
                  </View>
                  <Text style={s.small}>{tc('howGoogle')}</Text>
                  <Text style={s.small}>{tc('privacy')}</Text>
                  <TouchableOpacity onPress={rotate} disabled={!!busy} style={{ marginTop: 6 }}>
                    <Text style={s.link}>{busy === 'rotate' ? '…' : tc('rotate')}</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={[s.h, { marginTop: 22 }]}>{tc('importH')}</Text>
              <Text style={s.p}>{tc('importP')}</Text>
              <TouchableOpacity style={[s.importBtn, busy === 'import' && { opacity: 0.6 }]} onPress={importIcs} disabled={!!busy} testID="calendar-import">
                {busy === 'import' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="cloud-upload-outline" size={17} color="#fff" />}
                <Text style={s.importBtnT}>{tc('importBtn')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.surface, marginBottom: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.modules.hatirlatma + '1A' },
  cardT: { fontSize: 13.5, fontWeight: '800', color: theme.colors.text },
  cardS: { fontSize: 11.5, color: theme.colors.textMuted, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  h: { fontSize: 13, fontWeight: '900', color: theme.colors.text, marginBottom: 4 },
  p: { fontSize: 12.5, color: theme.colors.textSoft, lineHeight: 18, marginBottom: 10 },
  small: { fontSize: 11.5, color: theme.colors.textMuted, lineHeight: 16, marginTop: 6 },
  urlBox: { flexDirection: 'row', gap: 6 },
  url: { flex: 1, fontSize: 12, color: theme.colors.text, backgroundColor: theme.colors.surfaceSoft, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 10, paddingVertical: 9 },
  copyBtn: { width: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.modules.hatirlatma },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.lineDark },
  btnT: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text },
  link: { fontSize: 12, fontWeight: '800', color: theme.colors.redText },
  importBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12, backgroundColor: theme.colors.navy },
  importBtnT: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
}));

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useLanguage } from '@/src/lib/i18n';
import { MotionInput, hashColor, themedStyles, alpha } from '@/src/components/motion';

// Müşteri etiketleri: hazır öneriler + firmada kullanılmış etiketler + serbest
// yazım. Backend en fazla 10 etiket, 24 karakter tutar.
export const TAG_PRESETS = ['VIP', 'Sadık', 'Toptancı', 'Yeni', 'Bayi', 'Kurumsal'];

export function tagColor(tag: string): string {
  return hashColor(tag.toLocaleLowerCase('tr-TR'));
}

export function TagChip({ tag, small }: { tag: string; small?: boolean }) {
  const c = tagColor(tag);
  return (
    <View style={[s.tag, small && s.tagSmall, { backgroundColor: alpha(c, 0.14), borderColor: alpha(c, 0.45) }]}>
      <Text style={[s.tagText, small && { fontSize: 9.5 }, { color: theme.colors.text }]} numberOfLines={1}>{tag}</Text>
    </View>
  );
}

export default function TagPicker({ value, onChange, known }: { value: string[]; onChange: (v: string[]) => void; known: string[] }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const options = useMemo(() => {
    const all = [...value, ...TAG_PRESETS, ...known];
    const seen = new Set<string>();
    return all.filter((x) => { const k = x.toLocaleLowerCase('tr-TR'); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [value, known]);
  const has = (x: string) => value.some((v) => v.toLocaleLowerCase('tr-TR') === x.toLocaleLowerCase('tr-TR'));
  const toggle = (x: string) => onChange(has(x) ? value.filter((v) => v.toLocaleLowerCase('tr-TR') !== x.toLocaleLowerCase('tr-TR')) : [...value, x].slice(0, 10));
  const add = () => {
    const x = draft.trim().slice(0, 24);
    if (x && !has(x)) onChange([...value, x].slice(0, 10));
    setDraft('');
  };
  return (
    <View style={s.wrap} testID="tag-picker">
      <Text style={s.label}>{t('tags.label')}</Text>
      <View style={s.row}>
        {options.map((x) => {
          const on = has(x);
          const c = tagColor(x);
          return (
            <TouchableOpacity key={x} onPress={() => toggle(x)} style={[s.tag, on ? { backgroundColor: alpha(c, 0.18), borderColor: c } : null]} testID={`tag-${x}`}>
              {on && <Ionicons name="checkmark" size={12} color={theme.colors.text} />}
              <Text style={[s.tagText, !on && { color: theme.colors.textMuted }]}>{x}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[s.row, { marginTop: 8, flexWrap: 'nowrap' }]}>
        <MotionInput style={s.input} value={draft} onChangeText={setDraft} onSubmitEditing={add} placeholder={t('tags.newPh')} placeholderTextColor="#94a3b8" testID="tag-new-input" />
        <TouchableOpacity style={s.addBtn} onPress={add} testID="tag-add">
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingVertical: 12 },
  label: { fontSize: 10.5, fontWeight: '800', color: theme.colors.textSoft, marginBottom: 8, letterSpacing: 0.4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.lineDark, backgroundColor: theme.colors.surface },
  tagSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 11.5, fontWeight: '800', color: theme.colors.text },
  input: { flex: 1, backgroundColor: theme.colors.surfaceSoft, borderWidth: 1.5, borderColor: theme.colors.lineDark, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: theme.colors.text },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.modules.musteri, alignItems: 'center', justifyContent: 'center' },
}));

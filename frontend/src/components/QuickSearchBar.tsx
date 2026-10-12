import React from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { themedStyles } from '@/src/components/motion';

/**
 * Ekranın en üstünde sabit duran hızlı arama çubuğu: yazdıkça liste süzülür.
 * `count` verilirse arama sırasında kaç kayıt eşleştiği gösterilir.
 */
export default function QuickSearchBar({
  value,
  onChangeText,
  placeholder,
  count,
  countLabel,
  right,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  count?: number;
  countLabel?: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const active = value.trim().length > 0;
  return (
    <View style={s.bar}>
      <View style={s.inner}>
        <View style={[s.wrap, active && s.wrapActive]}>
          <Ionicons name="search" size={17} color={active ? theme.colors.primary : theme.colors.textMuted} />
          <TextInput
            testID={testID}
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor="#94a3b8"
            value={value}
            onChangeText={onChangeText}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {active && count !== undefined ? (
            <Text style={s.count} testID={testID ? `${testID}-count` : undefined}>{count}{countLabel ? ` ${countLabel}` : ''}</Text>
          ) : null}
          {active ? (
            <TouchableOpacity
              onPress={() => onChangeText('')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID={testID ? `${testID}-clear` : undefined}
              accessibilityRole="button"
              accessibilityLabel="Temizle"
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  bar: { backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.line, zIndex: 20 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', maxWidth: 760, alignSelf: 'center' },
  wrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, paddingHorizontal: 12, ...theme.shadow.sm },
  wrapActive: { borderColor: theme.colors.primary },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: theme.colors.text,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  count: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
}));

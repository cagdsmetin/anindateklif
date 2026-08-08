import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useRouter } from 'expo-router';

export default function TopHeader({ title }: { title?: string }) {
  const { activeCompany, companies, setActiveCompanyId, toast } = useApp();
  const [pickerVisible, setPickerVisible] = useState(false);
  const router = useRouter();

  return (
    <>
      {toast && (
        <View style={s.toast} testID="toast-msg">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
      <View style={s.header}>
        <View style={s.brand}>
          <View style={s.brandIcon}>
            <Ionicons name="flash" size={18} color={theme.colors.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.appName} numberOfLines={1}>Anında Teklif</Text>
            {title ? (
              <Text style={s.appSubtitle} numberOfLines={1}>{title}</Text>
            ) : (
              <Text style={s.appSubtitle} numberOfLines={1}>{activeCompany?.sirketAdi || 'Firma seçiniz'}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          testID="company-picker-btn"
          style={s.pickerBtn}
          onPress={() => setPickerVisible(true)}
        >
          <Ionicons name="business-outline" size={14} color={theme.colors.gold} />
          <Text style={s.pickerText} numberOfLines={1}>Firma</Text>
          <Ionicons name="chevron-down" size={12} color={theme.colors.gold} />
        </TouchableOpacity>
      </View>

      <Modal visible={pickerVisible} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={s.pickerCard}>
            <Text style={s.pickerTitle}>Aktif Firma Seç</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {companies.map((c) => {
                const active = c.id === activeCompany?.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID={`company-select-${c.id}`}
                    style={[s.pickerItem, active && s.pickerItemActive]}
                    onPress={async () => {
                      await setActiveCompanyId(c.id);
                      setPickerVisible(false);
                    }}
                  >
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={16}
                      color={active ? theme.colors.accent : theme.colors.textMuted}
                    />
                    <Text style={[s.pickerItemText, active && s.pickerItemTextActive]} numberOfLines={1}>
                      {c.sirketAdi}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              testID="add-new-company-btn"
              style={s.addNewBtn}
              onPress={() => {
                setPickerVisible(false);
                router.push('/(tabs)/company');
              }}
            >
              <Ionicons name="add-circle" size={16} color={theme.colors.accent} />
              <Text style={s.addNewText}>Firma Yönetimi</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    zIndex: 9999,
    gap: 6,
    elevation: 12,
  },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  header: {
    minHeight: 62,
    backgroundColor: theme.colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: theme.colors.gold,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.goldBorder,
  },
  appName: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.4 },
  appSubtitle: { fontSize: 11, color: theme.colors.goldSoft, marginTop: 1 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(201,162,39,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.gold,
    gap: 4,
    maxWidth: 110,
  },
  pickerText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.gold },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  pickerTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pickerItemActive: { backgroundColor: theme.colors.accentSoft },
  pickerItemText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  pickerItemTextActive: { color: theme.colors.accent, fontWeight: '700' },
  addNewBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: theme.colors.accentSoft,
  },
  addNewText: { color: theme.colors.accent, fontWeight: '700', fontSize: 12.5 },
});

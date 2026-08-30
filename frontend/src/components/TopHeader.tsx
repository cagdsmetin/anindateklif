import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal, ScrollView, Image, Platform, useWindowDimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import { useRouter } from 'expo-router';
import NavDrawer from '@/src/components/NavDrawer';

export default function TopHeader({ title }: { title?: string }) {
  const { activeCompany, companies, setActiveCompanyId, toast } = useApp();
  const { user, signOut } = useAuth();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const router = useRouter();
  const { width } = useWindowDimensions();
  // The desktop sidebar (app/(tabs)/_layout.tsx) already gives full navigation
  // on wide web windows, so the hamburger/drawer is only needed everywhere else
  // (native mobile app + narrow mobile web).
  const showHamburger = !(Platform.OS === 'web' && width >= 900);

  return (
    <>
      {toast && (
        <View style={s.toast} testID="toast-msg">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
      <View style={s.header}>
        {showHamburger ? (
          <TouchableOpacity
            style={s.hamburgerBtn}
            onPress={() => setDrawerVisible(true)}
            testID="hamburger-btn"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="menu" size={22} color={theme.colors.navy} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={s.brand}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)')}
          testID="brand-home-btn"
        >
          <View style={s.brandIcon}>
            <Ionicons name="flash" size={17} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.appName} numberOfLines={1}>Anında Teklif</Text>
            <Text style={s.appSubtitle} numberOfLines={1}>
              {title || activeCompany?.sirketAdi || 'Firma seçiniz'}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={s.rightActions}>
          {!user?.is_staff && (
            <TouchableOpacity
              testID="company-picker-btn"
              style={s.pickerBtn}
              onPress={() => setPickerVisible(true)}
            >
              <Ionicons name="business-outline" size={13} color={theme.colors.primary} />
              <Ionicons name="chevron-down" size={11} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="user-menu-btn"
            style={s.avatarBtn}
            onPress={() => setMenuVisible(true)}
          >
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={s.avatar} />
            ) : (
              <Text style={s.avatarLetter}>{(user?.name || user?.email || 'U').substring(0, 1).toUpperCase()}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Company picker */}
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
                      color={active ? theme.colors.primary : theme.colors.textMuted}
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
              <Ionicons name="add-circle" size={16} color={theme.colors.primary} />
              <Text style={s.addNewText}>Firma Yönetimi</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* User menu */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={s.menuCard}>
            <View style={s.userHeader}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={s.avatarLarge} />
              ) : (
                <View style={[s.avatarLarge, { backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>
                    {(user?.name || user?.email || 'U').substring(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={s.userName} numberOfLines={1}>{user?.name || 'Kullanıcı'}</Text>
              <Text style={s.userEmail} numberOfLines={1}>{user?.email}</Text>
            </View>
            <TouchableOpacity
              testID="signout-btn"
              style={s.signoutBtn}
              onPress={() => {
                setMenuVisible(false);
                // Confirm before signing out -- same pattern as the desktop
                // sidebar's "Çıkış Yap" so a stray tap can't log the person
                // out by accident.
                if (Platform.OS === 'web') {
                  // eslint-disable-next-line no-alert
                  if (window.confirm('Çıkış yapmak istediğinize emin misiniz?')) signOut();
                  return;
                }
                Alert.alert('Çıkış Yap', 'Çıkış yapmak istediğinize emin misiniz?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Çıkış Yap', style: 'destructive', onPress: () => signOut() },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={16} color={theme.colors.red} />
              <Text style={s.signoutText}>Çıkış Yap</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <NavDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: theme.colors.navy,
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
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  hamburgerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    marginRight: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.sm,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
  },
  appName: { fontSize: 15, fontWeight: '900', color: theme.colors.navy, letterSpacing: 0.2 },
  appSubtitle: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    gap: 3,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarLetter: { color: '#fff', fontSize: 14, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  pickerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, ...theme.shadow.lg },
  pickerTitle: { fontSize: 14, fontWeight: '900', color: theme.colors.navy, marginBottom: 10 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10 },
  pickerItemActive: { backgroundColor: theme.colors.primarySoft },
  pickerItemText: { fontSize: 13, color: theme.colors.text, flex: 1 },
  pickerItemTextActive: { color: theme.colors.primary, fontWeight: '800' },
  addNewBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
  },
  addNewText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12.5 },
  menuCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, ...theme.shadow.lg },
  userHeader: { alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.line, marginBottom: 12 },
  avatarLarge: { width: 60, height: 60, borderRadius: 30, marginBottom: 10 },
  userName: { fontSize: 15, fontWeight: '800', color: theme.colors.navy },
  userEmail: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  signoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.red,
    backgroundColor: theme.colors.redSoft,
  },
  signoutText: { color: theme.colors.red, fontWeight: '800', fontSize: 13 },
});

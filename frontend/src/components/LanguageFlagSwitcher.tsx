import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LANGUAGES, useLanguage } from '@/src/lib/i18n';

// Giriş yapmadan önceki ekranlarda (splash/login/register) gösterilen küçük
// bayraklı dil seçici. Seçim anında ekrana yansır ve cihazda hatırlanır
// (bkz. i18n.tsx LanguageProvider.setLang) -- bir sonraki ziyarette de aynı
// dil açılır, giriş yapılınca kullanıcı profiline taşınır.
export function LanguageFlagSwitcher() {
  const { lang, setLang } = useLanguage();
  return (
    <View style={s.row}>
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <TouchableOpacity
            key={l.code}
            onPress={() => setLang(l.code)}
            style={[s.pill, active && s.pillActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            testID={`lang-flag-${l.code}`}
          >
            <Text style={s.flag}>{l.flag}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  pill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillActive: {
    backgroundColor: 'rgba(59,130,246,0.18)',
    borderColor: '#3B82F6',
  },
  flag: { fontSize: 16 },
});

import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { evaluatePassword, PasswordRuleKey } from '@/src/utils/password-validation';
import { Lang, useLanguage } from '@/src/lib/i18n';

// 21st.dev "password-strength" bileşeninin RN / Reanimated uyarlaması.
// Kurallar backend ile birebir aynı kalsın diye password-validation.ts'ten
// geliyor (küçük/büyük harf, rakam, sembol, en az 8 karakter).

const CELL = { stiffness: 520, damping: 34, mass: 0.45 };
const FADE = { stiffness: 260, damping: 34, mass: 0.8 };

const COMMON = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456|sifre|parola)/i;
const RUN = /(.)\1{3,}/;
const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;

const RULE_ORDER: PasswordRuleKey[] = ['length', 'lower', 'upper', 'digit', 'symbol'];

const TEXT: Record<Lang, {
  levels: string[];
  guessable: string;
  rules: Record<PasswordRuleKey, string>;
  still: string;
  allMet: string;
  meter: string;
}> = {
  tr: {
    levels: ['Boş', 'Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'],
    guessable: 'Kolay tahmin edilir',
    rules: { length: 'En az 8 karakter', lower: 'Küçük harf', upper: 'Büyük harf', digit: 'Rakam', symbol: 'Sembol (!, @, # …)' },
    still: 'Eksik:',
    allMet: 'Tüm gereksinimler karşılandı.',
    meter: 'Şifre gücü',
  },
  en: {
    levels: ['Empty', 'Very weak', 'Weak', 'Fair', 'Good', 'Strong'],
    guessable: 'Commonly guessed',
    rules: { length: '8 characters or more', lower: 'Lower case letter', upper: 'Upper case letter', digit: 'A number', symbol: 'A symbol (!, @, # …)' },
    still: 'Still needed:',
    allMet: 'All requirements met.',
    meter: 'Password strength',
  },
  it: {
    levels: ['Vuota', 'Molto debole', 'Debole', 'Discreta', 'Buona', 'Forte'],
    guessable: 'Facile da indovinare',
    rules: { length: 'Almeno 8 caratteri', lower: 'Lettera minuscola', upper: 'Lettera maiuscola', digit: 'Un numero', symbol: 'Un simbolo (!, @, # …)' },
    still: 'Mancano:',
    allMet: 'Tutti i requisiti soddisfatti.',
    meter: 'Sicurezza password',
  },
};

const TONE = {
  none: { bar: 'rgba(255,255,255,0.22)', text: 'rgba(255,255,255,0.45)' },
  danger: { bar: '#EF4444', text: '#F87171' },
  caution: { bar: '#F59E0B', text: '#FBBF24' },
  safe: { bar: '#10B981', text: '#34D399' },
};

function toneFor(score: number, max: number) {
  if (score === 0) return TONE.none;
  const r = score / max;
  if (r <= 0.4) return TONE.danger;
  if (r <= 0.8) return TONE.caution;
  return TONE.safe;
}

function Cell({ on, index, color, reduced }: { on: boolean; index: number; color: string; reduced: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    const target = on ? 1 : 0;
    v.value = reduced ? target : on ? withDelay(index * 30, withSpring(target, CELL)) : withSpring(target, CELL);
  }, [on, index, reduced, v]);
  const aStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, v.value)) * 100}%` }));
  return (
    <View style={s.cell}>
      <Animated.View style={[s.cellFill, { backgroundColor: color }, aStyle]} />
    </View>
  );
}

function Fade({ visible, reduced, style, children }: { visible: boolean; reduced: boolean; style?: any; children: React.ReactNode }) {
  const o = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    o.value = reduced ? (visible ? 1 : 0) : withSpring(visible ? 1 : 0, FADE);
  }, [visible, reduced, o]);
  const aStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[style, aStyle]} pointerEvents="none">{children}</Animated.View>;
}

function RuleRow({ met, label, reduced }: { met: boolean; label: string; reduced: boolean }) {
  const v = useSharedValue(met ? 1 : 0);
  useEffect(() => {
    v.value = reduced ? (met ? 1 : 0) : withTiming(met ? 1 : 0, { duration: 180 });
  }, [met, reduced, v]);
  const fill = useAnimatedStyle(() => ({ opacity: v.value }));
  const check = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + 0.4 * v.value }] }));
  return (
    <View style={s.ruleRow} accessible accessibilityLabel={label} accessibilityState={{ checked: met }}>
      <View style={s.box}>
        <Animated.View style={[StyleSheet.absoluteFill, s.boxFill, fill]} />
        <Animated.View style={check}>
          <Ionicons name="checkmark" size={11} color="#0B1220" />
        </Animated.View>
      </View>
      <Text style={[s.ruleText, met && s.ruleTextMet]}>{label}</Text>
    </View>
  );
}

export default function PasswordStrength({ value }: { value: string }) {
  const { lang } = useLanguage();
  const tx = TEXT[lang] || TEXT.tr;
  const reduced = useReducedMotion();

  const state = useMemo(() => {
    const status = evaluatePassword(value);
    const rules = RULE_ORDER.map((k) => ({ key: k, met: status[k] }));
    const passed = rules.filter((r) => r.met).length;
    const guessable = value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));
    const score = value.length === 0 ? 0 : guessable ? 1 : Math.max(1, passed);
    return { rules, guessable, score, max: RULE_ORDER.length };
  }, [value]);

  const tone = toneFor(state.score, state.max);
  const level = tx.levels[Math.min(state.score, tx.levels.length - 1)];

  // Ekran okuyucuya her tuşta değil, yazma durulunca bir kez duyur.
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    if (!value) return;
    const unmet = state.rules.filter((r) => !r.met).map((r) => tx.rules[r.key].toLowerCase());
    const msg = [level + '.', state.guessable ? tx.guessable + '.' : '', unmet.length ? `${tx.still} ${unmet.join(', ')}.` : tx.allMet]
      .filter(Boolean)
      .join(' ');
    const id = setTimeout(() => {
      if (msg !== announced) {
        setAnnounced(msg);
        AccessibilityInfo.announceForAccessibility?.(msg);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [value, state, level, tx, announced]);

  return (
    <View style={s.wrap}>
      <View
        style={s.meter}
        accessibilityRole="progressbar"
        accessibilityLabel={tx.meter}
        accessibilityValue={{ min: 0, max: state.max, now: state.score, text: level }}
      >
        {Array.from({ length: state.max }, (_, i) => (
          <Cell key={i} index={i} on={i < state.score} color={tone.bar} reduced={reduced} />
        ))}
      </View>

      <View style={s.labelRow}>
        <View style={s.levelStack}>
          {tx.levels.map((txt, i) => (
            <Fade key={txt} visible={i === Math.min(state.score, tx.levels.length - 1)} reduced={reduced} style={i === 0 ? undefined : s.stacked}>
              <Text style={[s.level, { color: tone.text }]} numberOfLines={1}>{txt}</Text>
            </Fade>
          ))}
        </View>
        <Fade visible={state.guessable} reduced={reduced}>
          <Text style={s.guess} numberOfLines={1}>{tx.guessable}</Text>
        </Fade>
      </View>

      <View style={s.rules}>
        {state.rules.map((r) => (
          <RuleRow key={r.key} met={r.met} label={tx.rules[r.key]} reduced={reduced} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 2, marginBottom: 16, paddingHorizontal: 2 },
  meter: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, height: 6, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  cellFill: { height: '100%', borderRadius: 2 },
  labelRow: { marginTop: 8, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  levelStack: { position: 'relative', minWidth: 90, height: 20, justifyContent: 'center' },
  stacked: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  level: { fontSize: 12.5, fontWeight: '600', lineHeight: 20 },
  guess: { fontSize: 11.5, lineHeight: 20, color: '#FBBF24' },
  rules: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', rowGap: 7 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '50%' },
  box: {
    width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  boxFill: { backgroundColor: '#10B981', borderRadius: 3 },
  ruleText: { fontSize: 12.5, lineHeight: 20, color: 'rgba(255,255,255,0.5)', flexShrink: 1 },
  ruleTextMet: { color: 'rgba(255,255,255,0.88)' },
});

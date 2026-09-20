import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useRevealVisible } from './Reveal';

// "Number Ticker" (21st.dev / Magic UI) -- sayı, bulunduğu kart ekrana
// girdiğinde 0'dan hedef değere yumuşakça sayar; değer sonradan değişirse
// (ör. kur yenilenince) eski değerden yenisine kısa bir geçişle akar.
// JS tarafında requestAnimationFrame ile çalışır -- native ve web'de aynı.
export default function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  duration = 1100,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}) {
  const visible = useRevealVisible();
  const reduced = useReducedMotion();
  const shownRef = useRef(reduced ? value : 0);
  const [shown, setShown] = useState(shownRef.current);

  useEffect(() => {
    if (!visible) return;
    const from = shownRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (reduced || from === to) {
      shownRef.current = to;
      setShown(to);
      return;
    }
    const dur = from === 0 ? duration : Math.min(650, duration);
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, visible, reduced, duration]);

  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit}>
      {format(shown)}
    </Text>
  );
}

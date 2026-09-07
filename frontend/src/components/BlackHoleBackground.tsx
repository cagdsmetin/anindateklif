import React from 'react';
import { View } from 'react-native';

// Native (iOS/Android) tarafı: canvas API'si yok, ve bu tamamen dekoratif bir
// arka plan efekti olduğu için mobil uygulamada performans/pil maliyetine
// değmez -- burada hiçbir şey render etmiyoruz. Gerçek animasyonlu versiyon
// sadece web'de (BlackHoleBackground.web.tsx) render edilir; Metro/Expo
// bundler dosya adındaki `.web.tsx` uzantısını platforma göre otomatik seçer.
export default function BlackHoleBackground() {
  return <View pointerEvents="none" />;
}

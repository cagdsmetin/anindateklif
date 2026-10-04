import React, { useMemo } from 'react';
import { View } from 'react-native';
import QRCode from 'qrcode';

// SVG kütüphanesi olmadan QR: modül matrisini satır satır, ardışık koyu
// hücreleri tek View'a birleştirerek çizer (web + native aynı).
export default function QrView({ value, size = 180, color = '#0F172A', bg = '#FFFFFF' }: { value: string; size?: number; color?: string; bg?: string }) {
  const rows = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const data = qr.modules.data;
    const out: { y: number; runs: [number, number][] }[] = [];
    for (let y = 0; y < n; y++) {
      const runs: [number, number][] = [];
      let x = 0;
      while (x < n) {
        if (data[y * n + x]) {
          const start = x;
          while (x < n && data[y * n + x]) x++;
          runs.push([start, x - start]);
        } else x++;
      }
      out.push({ y, runs });
    }
    return { n, out };
  }, [value]);
  const quiet = 2;
  const cell = size / (rows.n + quiet * 2);
  return (
    <View style={{ width: size, height: size, backgroundColor: bg }}>
      {rows.out.map(({ y, runs }) => runs.map(([x, w]) => (
        <View key={`${y}-${x}`} style={{ position: 'absolute', left: (x + quiet) * cell, top: (y + quiet) * cell, width: w * cell + 0.5, height: cell + 0.5, backgroundColor: color }} />
      )))}
    </View>
  );
}

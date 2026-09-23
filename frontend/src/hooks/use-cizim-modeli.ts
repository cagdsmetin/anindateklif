import { useEffect, useRef, useState } from 'react';
import { api, type AlbertGenauGeometryInputT, type CizimModeli } from '@/src/lib/api';

// ============================================================================
// Canlı çizim modeli
// ----------------------------------------------------------------------------
// Bayi ölçü yazarken çizimi tazeler. Geometri backend'de (ag_geometry.py)
// üretilir çünkü modül bölünmesi fiyat listesindeki derinlik tablosuna bağlı --
// istemciye kopyalanırsa iki yer zamanla birbirinden kayar. Ağ gecikmesini
// gizlemek için:
//   * girişler debounce edilir (varsayılan 350ms),
//   * yeni istek gelince eskisi iptal edilir,
//   * yeni model gelene kadar ÖNCEKİ model ekranda kalır (boş kareye düşmez).
//
// Fiyat hesabı (albertGenauCalculate) bundan bağımsızdır; bu uç fiyat
// hesaplamaz, sadece "ne çizilecek" sorusunu yanıtlar.
// ============================================================================

type Durum = {
  model: CizimModeli | null;
  yukleniyor: boolean;
  hata: string | null;
};

const BOS: Durum = { model: null, yukleniyor: false, hata: null };

export function useCizimModeli(
  girdi: AlbertGenauGeometryInputT | null,
  gecikmeMs = 350
): Durum {
  const [durum, setDurum] = useState<Durum>(BOS);
  // Girdiyi stringe çevirip karşılaştırıyoruz: çağıran her render'da yeni bir
  // nesne üretse bile gereksiz istek atılmasın.
  const imza = girdi ? JSON.stringify(girdi) : '';
  const istekSayaci = useRef(0);

  useEffect(() => {
    if (!imza) {
      setDurum(BOS);
      return;
    }
    const benimSiram = ++istekSayaci.current;
    setDurum((o) => ({ ...o, yukleniyor: true }));

    const t = setTimeout(async () => {
      try {
        const model = await api.albertGenauGeometry(JSON.parse(imza));
        if (istekSayaci.current !== benimSiram) return; // daha yenisi başladı
        setDurum({ model, yukleniyor: false, hata: null });
      } catch (e: any) {
        if (istekSayaci.current !== benimSiram) return;
        // Eksik/geçersiz ölçü normal bir ara durum -- önceki çizimi koruyup
        // sessizce bekliyoruz, kullanıcıya kırmızı hata göstermiyoruz.
        setDurum((o) => ({ model: o.model, yukleniyor: false, hata: e?.message || null }));
      }
    }, gecikmeMs);

    return () => clearTimeout(t);
  }, [imza, gecikmeMs]);

  return durum;
}

/** Ölçü alanındaki metni sayıya çevirir; geçersizse 0. */
export function mm(v: string | number | undefined | null): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

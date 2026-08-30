// Türkiye resmi tatilleri ve dini günler/bayramlar.
// Resmi tatiller her yıl aynı ay/gündedir (Kanun ile sabittir).
// Dini günler Hicri takvime göre kaydığından yıl bazında (Diyanet İşleri
// Başkanlığı'nın resmi dini günler takvimine göre) elle listelenir.
// Kaynak: https://vakithesaplama.diyanet.gov.tr (2026 ve 2027 yılı dini günler listesi)

export type HolidayKind = 'resmi' | 'dini';

export type Holiday = {
  date: string; // YYYY-MM-DD
  title: string;
  kind: HolidayKind;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const RESMI_TATILLER: { ay: number; gun: number; title: string }[] = [
  { ay: 1, gun: 1, title: 'Yılbaşı' },
  { ay: 4, gun: 23, title: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { ay: 5, gun: 1, title: 'Emek ve Dayanışma Günü' },
  { ay: 5, gun: 19, title: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { ay: 7, gun: 15, title: 'Demokrasi ve Milli Birlik Günü' },
  { ay: 8, gun: 30, title: 'Zafer Bayramı' },
  { ay: 10, gun: 29, title: 'Cumhuriyet Bayramı' },
];

// Resmi tatil (izin günü) olmayan ama resmi/ulusal nitelikli anma günleri.
// 10 Kasım Atatürk'ü Anma Günü çalışma günüdür, tatil değildir; saat 09:05'te
// ülke genelinde saygı duruşu yapılır. Yine de "resmi" renk/ikon ile
// takvimde gösterilir, sadece başlığında tatil olmadığı belirtilir.
const RESMI_ANMA_GUNLERI: { ay: number; gun: number; title: string }[] = [
  { ay: 11, gun: 10, title: "Atatürk'ü Anma Günü (09:05 Saygı Duruşu, tatil değil)" },
];

// Diyanet resmi dini günler takvimine göre; "resmi: true" işaretli olanlar
// aynı zamanda resmi tatil (dini bayram) günleridir, diğerleri sadece
// kandil/manevi gün niteliğindedir (resmi tatil değildir).
const DINI_GUNLER: Record<number, { ay: number; gun: number; title: string; resmi?: boolean }[]> = {
  2026: [
    { ay: 1, gun: 15, title: 'Miraç Kandili' },
    { ay: 2, gun: 2, title: 'Berat Kandili' },
    { ay: 2, gun: 19, title: 'Ramazan Başlangıcı' },
    { ay: 3, gun: 16, title: 'Kadir Gecesi' },
    { ay: 3, gun: 19, title: 'Ramazan Bayramı Arefesi', resmi: true },
    { ay: 3, gun: 20, title: 'Ramazan Bayramı (1. Gün)', resmi: true },
    { ay: 3, gun: 21, title: 'Ramazan Bayramı (2. Gün)', resmi: true },
    { ay: 3, gun: 22, title: 'Ramazan Bayramı (3. Gün)', resmi: true },
    { ay: 5, gun: 26, title: 'Kurban Bayramı Arefesi', resmi: true },
    { ay: 5, gun: 27, title: 'Kurban Bayramı (1. Gün)', resmi: true },
    { ay: 5, gun: 28, title: 'Kurban Bayramı (2. Gün)', resmi: true },
    { ay: 5, gun: 29, title: 'Kurban Bayramı (3. Gün)', resmi: true },
    { ay: 5, gun: 30, title: 'Kurban Bayramı (4. Gün)', resmi: true },
    { ay: 6, gun: 16, title: 'Hicri Yılbaşı' },
    { ay: 6, gun: 25, title: 'Aşure Günü' },
    { ay: 8, gun: 24, title: 'Mevlid Kandili' },
    { ay: 12, gun: 10, title: 'Regaib Kandili' },
  ],
  2027: [
    { ay: 1, gun: 4, title: 'Miraç Kandili' },
    { ay: 1, gun: 22, title: 'Berat Kandili' },
    { ay: 2, gun: 8, title: 'Ramazan Başlangıcı' },
    { ay: 3, gun: 5, title: 'Kadir Gecesi' },
    { ay: 3, gun: 8, title: 'Ramazan Bayramı Arefesi', resmi: true },
    { ay: 3, gun: 9, title: 'Ramazan Bayramı (1. Gün)', resmi: true },
    { ay: 3, gun: 10, title: 'Ramazan Bayramı (2. Gün)', resmi: true },
    { ay: 3, gun: 11, title: 'Ramazan Bayramı (3. Gün)', resmi: true },
    { ay: 5, gun: 15, title: 'Kurban Bayramı Arefesi', resmi: true },
    { ay: 5, gun: 16, title: 'Kurban Bayramı (1. Gün)', resmi: true },
    { ay: 5, gun: 17, title: 'Kurban Bayramı (2. Gün)', resmi: true },
    { ay: 5, gun: 18, title: 'Kurban Bayramı (3. Gün)', resmi: true },
    { ay: 5, gun: 19, title: 'Kurban Bayramı (4. Gün)', resmi: true },
    { ay: 6, gun: 6, title: 'Hicri Yılbaşı' },
    { ay: 6, gun: 15, title: 'Aşure Günü' },
    { ay: 8, gun: 13, title: 'Mevlid Kandili' },
    { ay: 12, gun: 2, title: 'Regaib Kandili' },
    { ay: 12, gun: 24, title: 'Miraç Kandili' },
  ],
};

/**
 * Verilen yıl için tüm resmi tatilleri + dini günleri/bayramları döndürür.
 * Dini günler yalnızca yukarıda listelenen (Diyanet kaynaklı) yıllar için
 * doğru tarihlerle döner; listelenmeyen bir yıl istenirse dini gün
 * eklenmez (uydurma/varsayımsal tarih üretilmez), resmi tatiller yine de
 * döner çünkü bunlar sabittir.
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const resmi: Holiday[] = [...RESMI_TATILLER, ...RESMI_ANMA_GUNLERI].map((r) => ({
    date: `${year}-${pad2(r.ay)}-${pad2(r.gun)}`,
    title: r.title,
    kind: 'resmi' as const,
  }));
  const dini: Holiday[] = (DINI_GUNLER[year] || []).map((d) => ({
    date: `${year}-${pad2(d.ay)}-${pad2(d.gun)}`,
    title: d.resmi ? d.title : `${d.title} (Kandil)`,
    kind: 'dini' as const,
  }));
  return [...resmi, ...dini];
}

export function getHolidaysForYears(years: number[]): Holiday[] {
  const out: Holiday[] = [];
  years.forEach((y) => out.push(...getHolidaysForYear(y)));
  return out;
}

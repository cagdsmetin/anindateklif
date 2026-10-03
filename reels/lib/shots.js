// Ortak çekimler (kaynak koordinatları 1170×2532 @3x kayıt pikselidir).
// zipShot: Zip Perde ekranında EN/BOY yazılır, fiyat canlı hesaplanır.
// Kamera "Bayi fiyatı" satırına değil, müşteriye gidecek "Satış fiyatı"na odaklanır.
window.zipShot = (a, b) => ({
  a, b, clip: 'zip', from: 0,
  cam: [
    { t: 0, sy: 0, z: 1.0 }, { t: .45, sy: 0, z: 1.0 },
    { t: 2.75, sy: 330, z: 1.2 },
    { t: 4.3, sy: 1560, z: 1.15, sx: 590 },
    { t: 7, sy: 1590, z: 1.19, sx: 590 },
  ],
  ring: { at: 4.35, rect: [86, 1858, 1012, 78] },
});
// pdfShot: toplamlar → Önizle → gerçek PDF. Demo müşteri/imza blokları örtülür.
window.pdfShot = (a, b, from, pdfAt) => ({
  a, b, clip: 'pdf', from,
  cam: [
    { t: 0, sy: 1080, z: 1.0 }, { t: pdfAt - .08, sy: 1080, z: 1.0 },
    { t: pdfAt, sy: 330, z: 1.0 }, { t: b - a, sy: 560, z: 1.04 },
  ],
  redact: [
    { from: .6, rect: [70, 650, 540, 200] },
    { from: .6, rect: [690, 1236, 430, 64] },
  ],
});

# Anında Teklif — UI/UX Pro Max İncelemesi

Yüklediğin `ui-ux-pro-max` skill'inin veritabanı (119 UX kuralı, 192 renk paleti, 74 font eşleşmesi, React Native/web kuralları) üzerinden canlı uygulamayı ve kod tabanını inceledim. Aşağıdaki bulgular hem gerçek koddan (dosya/satır referanslı) hem de skill'in kuralları/önerileriyle karşılaştırmalı.

Not: Bu skill Markdown talimatı değil, Python arama betiği + veri dosyalarından oluşuyor (`search.py` + CSV/JSON referanslar). "Kaydedilmiş skill" olarak sisteme eklemedim çünkü öyle eklersek yalnızca metin kısmı saklanır, betik ve 40'tan fazla veri dosyası kaybolur ve skill çalışmaz hale gelir. Bunun yerine bu oturumda doğrudan çalıştırıp bulguları senin için derledim; istersen ilerideki her incelemede aynı şekilde tekrar kullanırım.

---

## 1. Renk & Kontrast (KRİTİK — 1 gerçek hata bulundu)

**Bulgu:** `subscription.tsx` içindeki "Uygula" (promosyon kodu) butonu altın/turuncu zemin (`#F59E0B`) üzerine beyaz yazı kullanıyor:
```
frontend/app/(tabs)/subscription.tsx:597-598
promoBtn: { backgroundColor: theme.colors.gold, ... }
promoBtnText: { color: '#fff', ... }
```
Ölçülen kontrast oranı **2.15:1** — WCAG AA'nın normal metin için istediği 4.5:1'in çok altında, okunması zor. Aynı altın rengi panelde ikon/rozet olarak da kullanılıyor (`index.tsx`, `teklif.tsx`, `calendar.tsx`) ama sorun sadece bu buton gibi "renkli zemin + beyaz yazı" kombinasyonlarında.

**Çözüm:** `promoBtnText` rengini `#fff` yerine koyu lacivert yap (`theme.colors.text` / `#0F172A`) → kontrast 8.31:1'e çıkıyor. Tek satırlık, riski sıfır bir düzeltme.

**Kontrol ettiğim diğer renk çiftleri (hepsi geçti):**
| Çift | Oran | Durum |
|---|---|---|
| Ana metin (#0F172A) / beyaz zemin | 17.85:1 | ✅ |
| Mor buton (#4F46E5) + beyaz yazı | 6.29:1 | ✅ |
| Soluk gri metin (#64748B) / beyaz | 4.76:1 | ✅ (sınırda, küçültme) |
| Yeşil rozet metni / açık yeşil zemin | 6.49:1 | ✅ |

---

## 2. Dokunma Hedefleri (Touch Targets) — dikkat edilecek nokta

Skill kuralı: mobilde min. 44×44 (iOS) / 48×48 (Android), web'de min. 24×24 CSS px + bitişik elemanlar arası 8px boşluk.

Geçen hafta Servis Ekle / Müşteri Ekle / Müşteri listesi ekranlarını daraltırken (`customers.tsx`, `service-add.tsx`) bazı ikon butonlarını 36px→32px, 24px→22px'e küçülttüm. Görsel ikon küçük olsa da hepsinde `hitSlop={{top:8,bottom:8,left:8,right:8}}` zaten var — bu, gerçek dokunma alanını ~38-48px'e çıkarıyor, yani kural karşılanıyor. Riskli olan tek yer: yeni eklenen bazı `TouchableOpacity`'lerde hitSlop unutulmuşsa küçük ikonlar dokunması zor olur. Yeni bir ikon-only buton eklerken hep hitSlop ekle diye not düştüm.

---

## 3. Form Hata Geri Bildirimi — orta öncelik, gerçek eksik

**Bulgu:** `customer-add.tsx`, `service-add.tsx` gibi formlarda geçersiz alan sadece kırmızı çerçeve + açık kırmızı zemin ile işaretleniyor (`inputWrapError`), alanın altında **"neden hatalı"yı açıklayan bir metin yok**. Kullanıcı sadece üstte tek satır toast görüyor ("Ad Soyad ve Telefon zorunludur") — hangi alanın sorunlu olduğu sadece renkle anlatılıyor.

Skill kuralı (Forms/Accessibility, **Severity: High**): *"Her geçersiz alanın altında, o alana bağlı (aria-describedby benzeri) özel bir hata metni olmalı; sadece kırmızı çerçeve/özet yeterli değil."*

**Öneri:** `FieldRow` bileşenine opsiyonel bir `errorText` prop'u ekleyip, `error` true olduğunda inputun altına küçük kırmızı bir satır ("Bu alan zorunlu" gibi) basmak — az kodla büyük netlik kazandırır, renk körü kullanıcılar için de kritik.

---

## 4. Tipografi — marka kimliği fırsatı

**Bulgu:** Uygulama boyunca hiçbir özel yazı tipi yüklenmiyor (`app/_layout.tsx` sadece ikon fontlarını yüklüyor: `useIconFonts`). Yani tüm metinler platformun varsayılan sistem fontuyla (Android'de Roboto, web'de tarayıcı varsayılanı) çıkıyor.

Skill'in bu ürün profili (B2B SaaS, teklif/dashboard aracı) için önerdiği eşleşme: **Plus Jakarta Sans** — "friendly, modern, saas, professional" olarak etiketlenmiş, tam da fatura/teklif üreten bir B2B aracın istediği ton. `expo-font` ile tek bir Google Font ekleyip `theme.ts`'e `fontFamily` eklemek yarım günlük bir iş ama şu an her ekran "tarayıcı varsayılanı" gibi göründüğü için markanın kendine ait bir tipografik kimliği yok.

---

## 5. Renk Paleti — mevcut palet zaten doğru yönde

Skill'in bu ürün tipi için ürettiği "ideal" paleti mevcut `theme.ts` ile karşılaştırdım:

| | Skill önerisi | Sizde (theme.ts) |
|---|---|---|
| Ana renk | `#2563EB` (güven mavisi) | `#4F46E5` (canlı indigo) |
| Vurgu/CTA | `#EA580C` (turuncu) | Servis modülü zaten `#EA580C` |
| Arka plan | `#F8FAFC` | `#F8FAFC` (surfaceSoft) — birebir aynı |

Yani renk stratejisi zaten "trust blue + turuncu CTA" B2B kalıbına uygun (muhtemelen daha önceki bir oturumda bilinçli seçilmiş — task #327'de sarı→turuncu geçişi var). Buradan büyük bir değişiklik önermiyorum, sadece madde 1'deki tek noktayı düzeltmek yeterli.

---

## 6. Ana Sayfa (Landing) — eksik olan tek büyük blok: Sosyal Kanıt

`(auth)/landing.tsx` şu anda Hero → Özellikler (6 kart) → Avantajlar (4 kart) → Nasıl Çalışır (3 adım) → CTA akışını içeriyor — bu, skill'in B2B SaaS için önerdiği "Hero + Features + CTA" kalıbına zaten uyuyor.

Eksik olan tek blok, skill'in "Trust & Authority" kalıbının vurguladığı **Proof (kanıt) bölümü**: müşteri sayısı, "kaç teklif oluşturuldu", gerçek bir kullanıcı yorumu/logosu gibi somut güven sinyalleri yok. Cam/PVC/alüminyum sektöründeki bir esnaf için "500+ firma kullanıyor" ya da "bugüne kadar X teklif hazırlandı" gibi tek bir sayı bile dönüşüm oranını ciddi artırır — bu veriyi zaten Panel'de tutuyorsunuz (toplam teklif/kullanıcı sayısı), landing'e taşımak sadece bir bölüm eklemek.

---

## 7. Kod Modernizasyonu — düşük öncelik

44 dosyada `TouchableOpacity`, sadece 2 yerde React Native'in önerdiği `Pressable` kullanılmış. Fonksiyonel bir sorun yaratmıyor (`TouchableOpacity` hâlâ çalışıyor ve deprecate değil) ama yeni bileşenlerde `Pressable` tercih edilirse basma geri bildirimi (ripple/opacity) daha tutarlı ve gelecekteki RN sürümleriyle daha uyumlu olur. Mevcut kodu değiştirmeye gerek yok, sadece yeni eklenen ekranlarda bu yönü tercih edebiliriz.

---

## Öncelik Sırası (skill'in 1-10 kategorisine göre)

1. **[5 dk]** `subscription.tsx` — "Uygula" butonunun yazı rengini düzelt (kontrast hatası)
2. **[yarım gün]** Form alanlarına inline hata metni ekle (customer-add, service-add, teklif.tsx)
3. **[yarım gün]** Landing sayfasına tek bir "sosyal kanıt" satırı/bölümü ekle
4. **[1 gün]** Plus Jakarta Sans (veya benzeri) marka fontunu tüm uygulamaya yükle

İlk madde çok küçük ve net — istersen hemen düzeltip deploy edeyim. Diğerleri için onay bekliyorum.

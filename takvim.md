# Anında Teklif: 10 Günlük Paylaşım Takvimi

Kampanya: her Reels'te izleyiciden yorumlara **TEKLİF** yazması istenir; otomatik cevapla hediye gider (1 ay Pro ücretsiz · kod **TEKLIF30** · ilk 1000 üyeye · anindateklif.co/hediye · üye olunca kod otomatik tanımlanır). Otomatik cevap kuralları: `plan/auto_reply.md`. Tüm metinler: `plan/posts.json`.

Saatler Europe/Istanbul (UTC+3). Her gün: 3 hikâye (sabah teaser, öğle özellik, akşam CTA) + 2 Reels (12:30 ve 20:30). Hafta sonu sabah hikâyesi 10:30'a kaydırıldı (insanlar daha geç uyanıyor).

## Tarihleri yeniden atama

Yalnızca gelecek ve boş günlere plan yapılır; geçmiş günlere ve zaten paylaşım olan günlere atama yapılmaz. `reels/` klasöründen:

```
node plan/assign_dates.mjs --start 2026-10-05 --skip 2026-10-07,2026-10-09
node plan/assign_dates.mjs --start 2026-10-05 --dry-run   # sadece göster
```

`day` (1–10) sırası korunur; tarihler başlangıçtan itibaren atlanmayan ardışık günlere dağıtılır. Script, bugünden (İstanbul saati) önceki bir tarihe atama yapmayı reddeder ve aşağıdaki tabloyu yeniden yazar.

## Takvim

<!-- TAKVIM:START -->
| Gün | Tarih | Saat | Tür | ID | Dosya | Platformlar | Hook / Başlık |
|---|---|---|---|---|---|---|---|
| 1 | 05.10.2026 Pazartesi | 09:15 | Story | s01 | `out/stories/s01.mp4` | IG Story · FB Story | sabah teaser: Anket: "Bir teklifi kaç dakikada hazırlıyorsun?" (5 dk altı / 30 dk+ / Akşam ofiste 😅) |
| 1 | 05.10.2026 Pazartesi | 12:30 | Reel | r01 | `out/reels/r01.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Bu teklif 8 saniyede hazırlandı ⏱ |
| 1 | 05.10.2026 Pazartesi | 13:45 | Story | s02 | `out/stories/s02.mp4` | IG Story · FB Story | öğle özellik: Özellik: ölçü gir → fiyat otomatik. Uygulama kaydından EN×BOY girişi ve hesaplanan fiyat. |
| 1 | 05.10.2026 Pazartesi | 20:30 | Reel | r02 | `out/reels/r02.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Zip perde fiyatı saniyede: EN × BOY gir, fiyat hazır |
| 1 | 05.10.2026 Pazartesi | 21:15 | Story | s03 | `out/stories/s03.mp4` | IG Story · FB Story | akşam CTA: CTA: 1 ay Pro hediye, kod TEKLIF30, ilk 1000 üyeye. Bağlantı çıkartması. |
| 2 | 06.10.2026 Salı | 09:15 | Story | s04 | `out/stories/s04.mp4` | IG Story · FB Story | sabah teaser: Soru: "Müşteri 3 firmadan teklif istedi. İşi kim alır?" (Emoji kaydırıcı) |
| 2 | 06.10.2026 Salı | 12:30 | Reel | r03 | `out/reels/r03.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Müşterin teklifi rakibinden önce alsın |
| 2 | 06.10.2026 Salı | 13:45 | Story | s05 | `out/stories/s05.mp4` | IG Story · FB Story | öğle özellik: Özellik: 4 PDF şablonu (Klasik/Modern/Minimal/Kurumsal). Test çıkartması: "Hangisi senin tarzın?" |
| 2 | 06.10.2026 Salı | 20:30 | Reel | r04 | `out/reels/r04.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | 4 PDF teklif şablonu: Klasik, Modern, Minimal, Kurumsal |
| 2 | 06.10.2026 Salı | 21:15 | Story | s06 | `out/stories/s06.mp4` | IG Story · FB Story | akşam CTA: CTA: "Bugünkü Reels'e TEKLİF yaz ya da linke dokun." TEKLIF30, 1 ay Pro. |
| 3 | 07.10.2026 Çarşamba | 09:15 | Story | s07 | `out/stories/s07.mp4` | IG Story · FB Story | sabah teaser: Teaser: "Perdeciler burada mı? 🙋" (Evet/Hayır anketi) |
| 3 | 07.10.2026 Çarşamba | 12:30 | Reel | r05 | `out/reels/r05.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Perdeci misin? Bunu izlemeden teklif yazma |
| 3 | 07.10.2026 Çarşamba | 13:45 | Story | s08 | `out/stories/s08.mp4` | IG Story · FB Story | öğle özellik: Özellik: AI asistan teklif kalemi açıklaması ve fiyat notu yazıyor. |
| 3 | 07.10.2026 Çarşamba | 20:30 | Reel | r06 | `out/reels/r06.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Teklif metnini yapay zekâ yazsın |
| 3 | 07.10.2026 Çarşamba | 21:15 | Story | s09 | `out/stories/s09.mp4` | IG Story · FB Story | akşam CTA: CTA: TEKLIF30 ile 1 ay Pro, üye olunca kod otomatik tanımlanır. |
| 4 | 08.10.2026 Perşembe | 09:15 | Story | s10 | `out/stories/s10.mp4` | IG Story · FB Story | sabah teaser: Anket: "Teklifleri hâlâ Excel'de mi tutuyorsun?" (Evet / Artık değil) |
| 4 | 08.10.2026 Perşembe | 12:30 | Reel | r07 | `out/reels/r07.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Excel'i bırak, teklifi uygulamadan ver |
| 4 | 08.10.2026 Perşembe | 13:45 | Story | s11 | `out/stories/s11.mp4` | IG Story · FB Story | öğle özellik: Özellik: Panel (aylık hacim, nakit durumu, teklif durumları). Demo veri. |
| 4 | 08.10.2026 Perşembe | 20:30 | Reel | r08 | `out/reels/r08.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | İşinin özeti tek ekranda: Panel |
| 4 | 08.10.2026 Perşembe | 21:15 | Story | s12 | `out/stories/s12.mp4` | IG Story · FB Story | akşam CTA: CTA: "Paneli kendi verinle gör: 1 ay Pro hediye." Link çıkartması. |
| 5 | 09.10.2026 Cuma | 09:15 | Story | s13 | `out/stories/s13.mp4` | IG Story · FB Story | sabah teaser: Soru kutusu: "Pergolacılar, teklifte en çok neye vakit harcıyorsunuz?" |
| 5 | 09.10.2026 Cuma | 12:30 | Reel | r09 | `out/reels/r09.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Pergolacılar için: ölçü gir, teklif hazır |
| 5 | 09.10.2026 Cuma | 13:45 | Story | s14 | `out/stories/s14.mp4` | IG Story · FB Story | öğle özellik: Özellik: Katalog. Ürünü bir kez tanımla, teklifte sadece seç. |
| 5 | 09.10.2026 Cuma | 20:30 | Reel | r10 | `out/reels/r10.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Ürününü bir kez tanımla, her teklifte sadece seç |
| 5 | 09.10.2026 Cuma | 21:15 | Story | s15 | `out/stories/s15.mp4` | IG Story · FB Story | akşam CTA: CTA: Hafta sonu öncesi hatırlatma, TEKLIF30 ile 1 ay Pro. |
| 6 | 10.10.2026 Cumartesi | 10:30 | Story | s16 | `out/stories/s16.mp4` | IG Story · FB Story | sabah teaser: Teaser: "Cam balkon ve giyotin cam yapanlar? Bugün sizin gününüz." (Emoji tepki) |
| 6 | 10.10.2026 Cumartesi | 12:30 | Reel | r11 | `out/reels/r11.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Cam balkoncu musun? Teklifi yerinde ver |
| 6 | 10.10.2026 Cumartesi | 13:45 | Story | s17 | `out/stories/s17.mp4` | IG Story · FB Story | öğle özellik: Özellik: Kasa ve tahsilat. Tahsilat girişi ve kasa özeti. |
| 6 | 10.10.2026 Cumartesi | 20:30 | Reel | r12 | `out/reels/r12.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Kasada ne var? Tahsilat ve kasa tek yerde |
| 6 | 10.10.2026 Cumartesi | 21:15 | Story | s18 | `out/stories/s18.mp4` | IG Story · FB Story | akşam CTA: CTA: "Hafta sonu kur, pazartesi teklif ver." TEKLIF30 link. |
| 7 | 11.10.2026 Pazar | 10:30 | Story | s19 | `out/stories/s19.mp4` | IG Story · FB Story | sabah teaser: Anket: "Pazar akşamı teklif yazan var mı?" (Ben 🙋 / Artık yok) |
| 7 | 11.10.2026 Pazar | 12:30 | Reel | r13 | `out/reels/r13.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Akşam ofiste teklif yazmaya son |
| 7 | 11.10.2026 Pazar | 13:45 | Story | s20 | `out/stories/s20.mp4` | IG Story · FB Story | öğle özellik: Özellik: PDF teklifi WhatsApp ile tek dokunuşla gönder. |
| 7 | 11.10.2026 Pazar | 20:30 | Reel | r14 | `out/reels/r14.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | PDF teklifi WhatsApp'tan tek dokunuşla gönder |
| 7 | 11.10.2026 Pazar | 21:15 | Story | s21 | `out/stories/s21.mp4` | IG Story · FB Story | akşam CTA: CTA: "Yeni haftaya hazır başla." 1 ay Pro, TEKLIF30. |
| 8 | 12.10.2026 Pazartesi | 09:15 | Story | s22 | `out/stories/s22.mp4` | IG Story · FB Story | sabah teaser: Soru: "Ölçü aldıktan sonra teklif müşteriye kaç saatte gidiyor?" (kaydırıcı) |
| 8 | 12.10.2026 Pazartesi | 12:30 | Reel | r15 | `out/reels/r15.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Sahada ölçü al, teklifi orada ver |
| 8 | 12.10.2026 Pazartesi | 13:45 | Story | s23 | `out/stories/s23.mp4` | IG Story · FB Story | öğle özellik: Özellik: teklif kalemleri ve otomatik toplam. |
| 8 | 12.10.2026 Pazartesi | 20:30 | Reel | r16 | `out/reels/r16.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Teklif kalemleri ve toplam: hepsi otomatik |
| 8 | 12.10.2026 Pazartesi | 21:15 | Story | s24 | `out/stories/s24.mp4` | IG Story · FB Story | akşam CTA: CTA: "Bir sonraki ölçüde dene." TEKLIF30 link. |
| 9 | 13.10.2026 Salı | 09:15 | Story | s25 | `out/stories/s25.mp4` | IG Story · FB Story | sabah teaser: Teaser: "Bugün hediye günü 🎁 Reels'e TEKLİF yazan kodunu alıyor." |
| 9 | 13.10.2026 Salı | 12:30 | Reel | r17 | `out/reels/r17.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Yorumlara TEKLİF yaz, 1 ay Pro hediye |
| 9 | 13.10.2026 Salı | 13:45 | Story | s26 | `out/stories/s26.mp4` | IG Story · FB Story | öğle özellik: Nasıl alınır: 1) Yorumlara TEKLİF yaz 2) Linke git 3) Üye ol, kod otomatik. |
| 9 | 13.10.2026 Salı | 20:30 | Reel | r18 | `out/reels/r18.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Hediye nasıl alınır? 3 adım |
| 9 | 13.10.2026 Salı | 21:15 | Story | s27 | `out/stories/s27.mp4` | IG Story · FB Story | akşam CTA: CTA: link çıkartması, anindateklif.co/hediye. İlk 1000 üyeye. |
| 10 | 14.10.2026 Çarşamba | 09:15 | Story | s28 | `out/stories/s28.mp4` | IG Story · FB Story | sabah teaser: Teaser: "Serinin son günü. Hangi özelliği en çok sevdin?" (test) |
| 10 | 14.10.2026 Çarşamba | 12:30 | Reel | r19 | `out/reels/r19.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn | Son hatırlatma: 1 ay Pro hediye |
| 10 | 14.10.2026 Çarşamba | 13:45 | Story | s29 | `out/stories/s29.mp4` | IG Story · FB Story | öğle özellik: Özet: katalog, ölçü→fiyat, PDF, WhatsApp, AI, panel, kasa. Hepsi tek uygulamada. |
| 10 | 14.10.2026 Çarşamba | 20:30 | Reel | r20 | `out/reels/r20.mp4` | IG Reels · FB Reels · YT Shorts · LinkedIn (yedek) | Anında Teklif: hepsi tek uygulamada |
| 10 | 14.10.2026 Çarşamba | 21:15 | Story | s30 | `out/stories/s30.mp4` | IG Story · FB Story | akşam CTA: Kapanış CTA: "Teşekkürler! Hediye hâlâ geçerli: TEKLIF30, ilk 1000 üyeye." Link. |
<!-- TAKVIM:END -->

`(yedek)`: LinkedIn'de günde en fazla 1 paylaşım önerilir. Öğle Reels'i "ana", akşam Reels'i "yedek" metindir; yedekler istenirse sonraki iş günü sabahına (08:30) kaydırılabilir.

## Yayın yöntemi: ne otomatik, ne elle?

| Platform | Video | API ile yayın | Not |
|---|---|---|---|
| Instagram Reels / Story | `out/reels/rNN.mp4`, `out/stories/sNN.mp4` | Elle (Meta Business Suite planlayıcı) | Hikâyelerde bağlantı çıkartması elle eklenir. |
| Facebook Sayfası | Reels videosu **elle** | API yalnızca görsel/metin/bağlantı gönderisi yapabilir | Video yerine otomatik gönderi gerekirse `platforms.facebook.image_post` (kapak `out/covers/rNN.jpg` + metin) kullanılır. |
| LinkedIn Sayfası | Native video **elle** | API yalnızca görsel/metin/bağlantı gönderisi yapabilir | Otomatik gönderi gerekirse `platforms.linkedin.image_post` (kapak + metin). |
| YouTube Shorts | **Elle** (YouTube Studio) | Buradan yayın yok | Studio'nun planlama özelliğiyle saat ayarlanabilir. |

Öncelik: video her zaman tercih edilir. `image_post` yalnızca o gün video elle yüklenemeyecekse yedek seçenektir; aynı Reels için hem video hem görsel gönderi paylaşma.

## Platform ipuçları

**Instagram Reels**
- 9:16, 1080×1920. Kapak olarak videonun ilk karesini ya da `out/covers/rNN.jpg` dosyasını seç; profil ızgarasında ortadaki 1080×1350 alanın okunur olduğunu kontrol et.
- Yazılar alttaki ~420 px arayüz alanının üstünde kalmalı (videolar buna göre hazırlandı).
- Müzik kitaplığından trend ve telifsiz bir parçayı düşük seste ekle.
- `first_comment` metnini paylaşır paylaşmaz yorum olarak yaz ve sabitle.
- Açıklamadaki bağlantı tıklanmaz; bio linki `anindateklif.co/hediye` olmalı.

**Instagram / Facebook Story**
- Akşam CTA hikâyelerinde bağlantı çıkartması: `https://anindateklif.co/hediye`, metin "1 ay Pro hediye".
- Anket/test/soru çıkartmalarını elle ekle (posts.json → `sticker`). Sahte geri sayım ya da "son X kişi" sayacı kullanılmaz.
- Ertesi gün iyi performans gösterenleri "Hediye" öne çıkanına ekle.

**Facebook Reels**
- Meta Business Suite'te Instagram Reels ile aynı anda "Facebook'ta da paylaş" seçilebilir; ama açıklamayı `platforms.facebook.caption` ile değiştir (bağlantı Facebook'ta tıklanabilir).
- Facebook yorumlarında da TEKLİF otomatik cevabı açık olmalı.

**YouTube Shorts**
- Süre 60 saniyenin altında olmalı (Shorts rafında en güvenli sınır), 9:16 dikey.
- Başlık ≤ 90 karakter ve `#shorts` içerir (posts.json'da hazır). Açıklamaya tam bağlantı yazılı.
- Studio'da "Planla" ile tarih/saat seç; kitle: "Çocuklar için yapılmadı".
- YouTube'da otomatik yorum cevabı yok: günde 2 kez elle cevapla (auto_reply.md, Bölüm 5).

**LinkedIn**
- Videoyu native olarak yükle (YouTube bağlantısı paylaşma; erişimi düşürür).
- Altyazı dosyası varsa ekle; LinkedIn'de videolar çoğunlukla sessiz izlenir.
- Bağlantı metnin içinde; hafta içi öğle saatleri en uygunu. Hafta sonu paylaşımları isteğe bağlı.
- Yorumlara resmî dille, elle cevap ver (auto_reply.md'de LinkedIn şablonu var).

## Günlük kontrol listesi

**Paylaşımdan önce (bir gün önce)**
- [ ] `out/reels/rNN.mp4` ve `out/stories/sNN.mp4` dosyaları var, oynatılıyor, 9:16, ses seviyesi uygun.
- [ ] Reels süreleri 60 saniyenin altında (YouTube için).
- [ ] Kapak `out/covers/rNN.jpg` hazır.
- [ ] Videolardaki uygulama görüntülerinde gerçek müşteri adı, telefonu veya adresi yok (demo veri).
- [ ] posts.json'daki metinler kopyalanmaya hazır; hashtag sayısı ≤ 8.
- [ ] `anindateklif.co/hediye` açılıyor; TEKLIF30 üyelikte otomatik tanımlanıyor (test hesabıyla dene).
- [ ] Instagram bio linki `anindateklif.co/hediye`.

**Paylaşım anında**
- [ ] Instagram: video + açıklama + hashtag'ler → paylaş → `first_comment` yorumunu yaz ve sabitle.
- [ ] Facebook: Reels videosu + `facebook.caption` (API ile yapılacaksa yalnızca `image_post`).
- [ ] YouTube: Studio'dan yükle, başlık/açıklama, planla.
- [ ] LinkedIn: native video + `linkedin.text` (yalnızca "ana" olanlar; yedekler isteğe bağlı).
- [ ] Hikâyeler: çıkartmalar (anket/test/soru/bağlantı) elle eklendi.

**Paylaşımdan sonra**
- [ ] İlk 60 dakika yorumları izle; otomatik cevabın çalıştığını kendi test hesabınla kontrol et.
- [ ] Şikâyet/soru içeren yorumları "İnceleme" listesine al, aynı gün elle cevapla.
- [ ] Spam ve hakaret içerikli yorumları gizle.
- [ ] Gün sonu: her Reels için izlenme, 3 sn izlenme oranı, yorum sayısı, TEKLİF yorum sayısı ve hediye sayfasına gelen kayıt sayısını not et (rakamlar yalnızca iç rapor içindir; paylaşımlarda kullanılmaz).
- [ ] Kampanya durumunu kontrol et; kapanırsa otomatik cevabı hemen kapat (auto_reply.md, Kural 9).

## İçerik ilkeleri

- Uydurma müşteri yorumu, istatistik, müşteri sayısı ya da kontenjan sayacı yok. Kullanılabilecek rakamlar: **1 ay**, **ilk 1000 üye**, **TEKLIF30**.
- Videodaki "8 saniye" ifadesi yalnızca videodaki gerçek ekran kaydı sayacına dayanır; genel bir vaat olarak kullanılmaz.
- Rakip firma adı anılmaz.

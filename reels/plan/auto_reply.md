# Yorum Otomatik Cevap Kurgusu: "TEKLİF" Kampanyası

Kampanya: Reels, Facebook, YouTube Shorts ve LinkedIn gönderilerinde izleyiciden yorumlara **TEKLİF** yazması isteniyor. Bu kelimeyi yazan kişiye otomatik cevapla hediye gönderiliyor.

**Hediye (kullanılabilecek tek sayısal bilgiler):** 1 ay Pro ücretsiz · kod **TEKLIF30** · **ilk 1000 üyeye** · https://anindateklif.co/hediye · üye olunca kod otomatik tanımlanır.

> Kalan kontenjan, üye sayısı ya da "son X kişi" gibi bir rakam **asla** yazılmaz. Müşteri yorumu veya referans uydurulmaz.

---

## 1. Tetikleyici kelimeler

Eşleştirme büyük/küçük harfe ve Türkçe i/ı/İ/I farkına duyarsız olmalı. Önerilen yöntem: yorumu önce normalize et, sonra eşleştir.

**Normalize adımları**
1. Türkçe harfleri sadeleştir: `İ→i`, `I→i`, `ı→i`, `Ş/ş→s`, `Ğ/ğ→g`, `Ü/ü→u`, `Ö/ö→o`, `Ç/ç→c`.
2. Küçük harfe çevir.
3. Noktalama, emoji ve fazla boşlukları sil; tekrarlanan harfleri tek harfe indir (`teklifff` → `teklif`).

**Eşleşen kelimeler (normalize sonrası `teklif` içerenler)**

| Yazılan | Eşleşir mi? |
|---|---|
| `TEKLİF`, `TEKLIF`, `teklif`, `Teklif`, `teklıf`, `TEKLİF!!`, `teklif 🙋` | Evet |
| `teklif istiyorum`, `teklif lütfen`, `teklif almak istiyorum`, `ben de teklif` | Evet |
| `#teklif`, `@anindateklif teklif` | Evet |
| `tekilf`, `teklf`, `teklfi` (yaygın yazım hataları) | Evet (isteğe bağlı fuzzy, uzaklık ≤ 1) |
| `hediye`, `kod`, `pro`, `TEKLIF30` | Evet (aynı kampanyayı soruyor) |

**Düzenli ifade (normalize edilmiş metin için):**

```
\b(teklif\w*|tekilf|teklf|teklfi|hediye|teklif30)\b
```

Normalize etmeden doğrudan eşleştirmek gerekirse (ör. araç Türkçe büyük/küçük harf çeviremiyorsa):

```
(?i)\b(t[eE][kK][lL][iİıI][fF]\w*|hediye|teklif30)\b
```

**Hariç tutulacaklar (tetiklese bile şablon gönderme, işaretle):** Bölüm 3'e bak.

---

## 2. Cevap şablonları (Instagram yorum cevabı)

Instagram yorumlarında bağlantılar tıklanamaz. Bu yüzden her şablonda hem **"profildeki linkten"** yönlendirmesi hem de **açık adres metni** var. Şablonlar sırayla dönsün (1→2→3→4→5→1…). Aynı kişiye aynı gönderide ikinci kez cevap verilmez. `@{kullanici}` yerine kullanıcı adı gelir.

**Şablon 1**
> @{kullanici} Hediyen hazır 🎁 TEKLIF30 koduyla Anında Teklif Pro 1 ay ücretsiz. Profildeki linkten ya da anindateklif.co/hediye adresinden üye ol; kod hesabına otomatik tanımlanır. Kampanya ilk 1000 üyeye.

**Şablon 2**
> @{kullanici} Teşekkürler! 🙌 1 ay Pro hediyen: TEKLIF30. Profilimizdeki linke dokun (anindateklif.co/hediye), üye ol, kod otomatik gelsin. İlk 1000 üyeye geçerli.

**Şablon 3**
> @{kullanici} Kodun: TEKLIF30 🎁 Anında Teklif Pro 1 ay senden yana. Adres: anindateklif.co/hediye (profildeki linkte de var). Üyelikte kod kendiliğinden tanımlanır.

**Şablon 4**
> @{kullanici} Hoş geldin! ⚡ TEKLIF30 ile 1 ay Pro ücretsiz. Profildeki linkten anindateklif.co/hediye sayfasına git, üye ol; kodu girmene gerek yok, otomatik tanımlanıyor. İlk 1000 üyeye.

**Şablon 5**
> @{kullanici} 1 ay Pro hediyen burada 🎁 Kod: TEKLIF30 · Link: anindateklif.co/hediye (profilde). Üye olunca kod otomatik tanımlanır, sonra ilk teklifini dene. Kampanya ilk 1000 üye için geçerli.

### Platforma göre küçük farklar

- **Facebook yorum cevabı:** Aynı şablonlar; bağlantılar tıklanabilir olduğu için adresi tam yaz: `https://anindateklif.co/hediye`. "Profildeki linkten" ifadesi yerine "buradan" denebilir.
- **YouTube yorum cevabı:** Bağlantı yorumlarda spam filtresine takılabilir. Önerilen: "Kod: TEKLIF30 · Bağlantı açıklamada ve kanal sayfasında: anindateklif.co/hediye". YouTube'da otomatik cevap aracı yoksa günde 2 kez elle cevaplanır (Bölüm 5).
- **LinkedIn yorum cevabı:** Daha resmî dil, emoji yok:
  > Teşekkürler {Ad} Bey/Hanım. 1 aylık Pro erişim için https://anindateklif.co/hediye adresinden üye olabilirsiniz; TEKLIF30 kodu hesabınıza otomatik tanımlanır. Kampanya ilk 1000 üye için geçerlidir.

  (Hitap emin değilsen "Teşekkürler {Ad}," yeterli.)

---

## 3. Kurallar

1. **Kişi başı tek cevap:** Aynı kullanıcıya aynı gönderide yalnızca bir kez cevap ver. Aynı kişi farklı bir gönderide yeniden yazarsa tekrar cevap verilebilir. Bir kullanıcıya tüm kampanya boyunca en fazla 3 otomatik cevap gönder; sonrasında sessiz kal.
2. **Kendi hesabını atla:** @anindateklif ve ekip hesaplarının yorumlarına cevap verme (sabit yorumlar dahil).
3. **Cevaplara cevap verme:** Yalnızca gönderiye yazılan ana yorumlara cevap ver; başka bir yoruma verilen cevap içindeki "teklif" kelimesi tetiklemesin. (İstisna: kişi kendi yorumunun altına "TEKLİF" yazarsa tetikleyebilir.)
4. **Spam ve olumsuz içeriği atla:** Bağlantı, reklam, başka hesap etiketlemesi dizisi, küfür veya hakaret içeren yorumlara şablon gönderme; gizle ya da spam olarak işaretle.
5. **Şikâyetlere şablonla cevap verme, işaretle:** Yorum "teklif" kelimesini içerse bile aşağıdaki işaretlerden biri varsa otomatik cevap **gönderme**, yorumu "İnceleme" etiketiyle ekibe ilet:
   - Olumsuz kelimeler: `şikayet`, `şikâyet`, `rezalet`, `berbat`, `dolandırıcı`, `iade`, `para iadesi`, `çalışmıyor`, `açılmıyor`, `hata`, `cevap vermiyor`, `ulaşamıyorum`, `memnun değilim`, `kod çalışmadı`, `kod geçmiyor`.
   - Soru içeren yorumlar (ör. "Fiyatı ne kadar?", "Android'de var mı?", "Kod çalışmıyor") → şablon değil, insan cevabı. Yanıt hedefi: mesai içinde aynı gün.
   - Kodun çalışmadığını söyleyen kişiye: özür + DM'den yardım teklifi, elle.
6. **Hız sınırı:** Platform engeline takılmamak için otomatik cevaplar arasında birkaç saniye bekleme olsun; aynı metni art arda göndermemek için şablonlar dönsün.
7. **Gizlilik:** Cevaplarda kişiye ait bilgi (telefon, e-posta) isteme. İletişim gerekiyorsa DM'ye davet et.
8. **Kayıt:** Her otomatik cevap için gönderi ID, kullanıcı adı, zaman ve şablon numarası kaydedilsin (tekrar cevabı önlemek ve sonuç ölçmek için).
9. **Kampanya bitince:** Kampanya kapanırsa veya kontenjan dolarsa otomatik cevabı hemen durdur ve tek bir bilgi cevabına geç: "Kampanya sona erdi, ilgin için teşekkürler. Güncel fırsatlar için profildeki linke göz atabilirsin." Kontenjan durumu ekip tarafından teyit edilmeden "doldu" denmez.

---

## 4. DM sürümü (ileride ManyChat için)

Instagram'da "yorumu yazana DM gönder" akışı kurulduğunda: yorum cevabı kısa kalır, ayrıntı DM'den gider.

**Yorum cevabı (DM akışı açıkken):**
> @{kullanici} Hediyen DM kutunda 🎁 Göremezsen "İstekler" klasörüne bak.

**DM mesajı 1 (otomatik):**
> Merhaba {ad} 👋 Anında Teklif'e gösterdiğin ilgi için teşekkürler!
>
> 🎁 Hediyen: **1 ay Pro ücretsiz**
> 🏷️ Kod: **TEKLIF30**
> 👉 https://anindateklif.co/hediye
>
> Üye olduğunda kod hesabına otomatik tanımlanır; ayrıca girmene gerek yok. Kampanya ilk 1000 üye için geçerli.
>
> [Buton: Hediyemi al] → https://anindateklif.co/hediye

**DM mesajı 2 (isteğe bağlı, buton: "Nasıl başlarım?"):**
> 3 adımda başla:
> 1️⃣ Katalogda ürünlerini ve fiyatlarını bir kez tanımla.
> 2️⃣ Yeni teklifte ürünü seç, ölçüyü gir; fiyat otomatik hesaplansın.
> 3️⃣ PDF teklifini seç (Klasik, Modern, Minimal, Kurumsal) ve WhatsApp'tan gönder.
>
> Sorun olursa bu mesaja yazman yeterli, ekibimiz dönüş yapar.

**DM kuralları**
- Kişi başı tek DM akışı (kampanya boyunca). Aynı kişi yeniden yorum yazarsa yalnızca yorum cevabı gider, DM tekrarlanmaz.
- Hikâye cevaplarında "TEKLİF" yazılırsa aynı DM mesajı 1 gönderilebilir.
- 24 saat mesajlaşma penceresi dışına çıkan takip mesajı gönderilmez.
- Şikâyet veya soru içeren DM'ler otomasyondan çıkarılıp ekibe devredilir ("Canlı destek" etiketi).

---

## 5. Elle yürütme (otomasyon kurulana kadar)

- Her Reels paylaşımından sonraki ilk 60 dakika ve günde iki kez (10:00 ve 22:00 civarı) yorumlar kontrol edilir.
- Şablonlar sırayla kopyalanır; cevaplanan yorumlar beğenilir (takip için görsel işaret).
- YouTube ve LinkedIn yorumları da aynı turda cevaplanır.
- Şikâyet ve sorular ayrı bir listeye not edilir, aynı gün içinde kişisel cevap verilir.

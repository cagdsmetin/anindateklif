# Devir özeti — yeni oturum buradan başlasın

Son güncelleme: 04.10.2026. Repo: `cagdsmetin/anindateklif`, çalışma dalı: **`claude/magical-hawking-5ympk8`**.
Ayrıntılı kimlikler ve adımlar: `memory/IOS_YAYIN_YAPILACAKLAR.md`. Mağaza metinleri: `memory/APP_STORE.md`.
Entegrasyon kurulumu: `memory/PRD.md` → "Entegrasyonlar".

## Kullanıcı ve çalışma şekli
- Kullanıcı Türkçe konuşuyor, kısa ve adım adım talimat istiyor; terminal ekran görüntüsü atarak ilerliyor.
- Mac kullanıyor (zsh). Çok satırı birden yapıştırınca `[200~ … ~` bozulması oluyor → **komutları tek tek ver**.
- Bulut Claude oturumu Mac'e, tarayıcıya, Apple hesabına erişemez; komutları kullanıcı çalıştırır.

## Bu oturumda yapılanlar (hepsi dalda, push edildi)
1. **Entegrasyonlar:** iyzico otomatik yenileme (abonelik), Google ile giriş, Google Takvim iki yönlü senkron,
   Google İşletme yorumları. Hepsi env anahtarı girilince açılır (liste: `IOS_YAYIN_YAPILACAKLAR.md`).
2. **Koltuk kademesi:** personel eklenip çıkınca (5 / 10 / 30 / sınırsız) iyzico planı bir sonraki dönemden
   otomatik değişiyor, iki yönlü.
3. **iOS hazırlığı:** mobilde satın alma gizli, Apple ile Giriş eklendi (Kural 4.8), kamera/galeri izin metinleri,
   şifreleme beyanı, TR/EN/IT dil tanımları (`frontend/locales/`), `eas.json` (Team ID + ASC App ID).
4. **Testler:** `cd backend && pytest tests/test_integrations.py -n 0` → 15 test geçiyor.
5. origin/main bu dala birleştirildi (03.10).

## App Store durumu
- Apple Developer (bireysel, Cagdas Metin) aktif. Apple ID: cagdasmetin1@icloud.com, Team ID MDR7AB4ZZW.
- App Store Connect'te "Anında Teklif" kaydı var (App ID 6818953431, bundle com.anindateklif.app).
- **Build 2** (1.0.0) yüklendi (dil desteği yok).
- **Build 3** (1.0.0, TR/EN/IT dil destekli) derlendi:
  https://expo.dev/accounts/cagdsmetin/projects/aninda-teklif/builds/87ebea2d-148c-4355-bf92-53d631aeacc0
  → `npx eas-cli submit --platform ios --latest` **çalıştırıldı mı teyit edilmedi**; ilk iş bunu sor/kontrol et.
- Mac'te derleme klasörü: `~/anindateklif-ios/frontend` (bu dalın temiz kopyası).
- Kararlar: **ana dil Türkçe**, ek diller İtalyanca + İngilizce; kategori İş / Verimlilik; ücretsiz;
  ilk sürüme yeni (yerel) ekranlar **konmayacak**, 1.0.1'de eklenecek.

## Sıradaki adımlar
1. Build 3'ün Apple'a yüklendiğini teyit et (yoksa `~/anindateklif-ios/frontend` içinde submit).
2. App Store Connect: ana dil Türkçe, kategori, gizlilik URL'si, İtalyanca + İngilizce dil ekle,
   `APP_STORE.md` metinlerini yapıştır.
3. Ekran görüntüleri (her dil için 3–10, iPhone 6.9"/6.7") — TestFlight ile iPhone'a kurup çek.
4. App Privacy formu (`APP_STORE.md` tablosu), yaş derecelendirmesi 4+, fiyat ücretsiz, AB tacir beyanı.
5. Demo hesap (örnek müşteri + teklif) aç, App Review Information'a yaz; İngilizce notu ekle.
6. Build 3'ü seç → Submit for Review. Apple'ın sorularını (özellikle Pro / uygulama içi satın alma, Kural 3.1)
   birlikte cevapla.
7. Onaydan sonra: bu dalı main'e PR ile birleştir.

## Bekleyen ayrı iş: `yerel-calismalar` dalı
- Kullanıcının Mac'te yüklenmemiş çalışmaları (aidat, çek-senet, kira, seans, kartvizit, işlem geçmişi ekranları
  + 17 değişmiş dosya) 04.10'da `yerel-calismalar` dalına push edildi (commit f365beb, main'in 28.09 haline göre).
- Bu dalla birleştirmede çakışan dosyalar: `frontend/app.json`, `frontend/app/(auth)/login.tsx`,
  `frontend/app/(auth)/register.tsx`, `frontend/app/_layout.tsx`. İnceleme + çözüm + test gerekiyor → 1.0.1 sürümü.
- Mac'teki `~/anindateklif` klasörü şu an `yerel-calismalar` dalında.

## Bilinen açıklar / doğrulanmamışlar
- iyzico webhook imza biçimi ve kademe yükseltme yanıtı gerçek iyzico hesabında denenmedi.
- iyzico'da ödenmeyen (UNPAID) abonelik için özel akış yok.
- Google'dan içe alınan ana takvim etkinliklerindeki düzenlemeler Google'a geri yazılmaz (salt okunur yetki).
- Apple ile Giriş yapan hesap silinirken Apple token iptali (REST revoke) yapılmıyor; Apple isterse eklenmeli
  (Sign in with Apple anahtarı .p8 gerekir).

# iOS App Store yayını — durum ve yapılacaklar

Bu dosya, App Store yayınını başka bir oturumda (Claude ile ya da elle) kaldığı
yerden sürdürmek için hazırlandı. Mağaza metinleri: `memory/APP_STORE.md`.

## Sabit bilgiler

| | |
|---|---|
| Apple ID (geliştirici hesabı) | cagdasmetin1@icloud.com — bireysel hesap "Cagdas Metin" |
| Apple Team ID | MDR7AB4ZZW |
| App Store Connect App ID | 6818953431 |
| Bundle ID | com.anindateklif.app |
| Expo hesabı / proje | cagdsmetin / aninda-teklif |
| iOS kodunun bulunduğu dal | `claude/magical-hawking-5ympk8` (henüz main'e birleşmedi) |
| Mac'te derleme klasörü | `~/anindateklif-ios/frontend` (bu dal checkout edilmiş temiz kopya) |

> Not: `~/anindateklif` klasöründe GitHub'a hiç yüklenmemiş çalışmalar var
> (aidat, çek-senet, kira, seans, kartvizit ekranları + 17 değişmiş dosya).
> O klasörde dal değiştirmeyin; derlemeyi `~/anindateklif-ios` içinde yapın.

## Tamamlananlar ✅

- [x] Apple Developer Program üyeliği (bireysel) aktif
- [x] Kod: Apple ile Giriş (Kural 4.8), mobilde satın alma gizli (Kural 3.1.1), hesap silme mevcut
- [x] Kod: kamera/galeri izin metinleri, şifreleme beyanı, TR/EN/IT dil tanımları (`frontend/locales/`)
- [x] `eas.json`: appleTeamId + ascAppId
- [x] İlk iOS derlemesi: 1.0.0 (build 2) — EAS build `4635afca-bfd4-45ef-826a-5771b5e562fa`
- [x] App Store Connect'e yüklendi (EAS submit), App Store Connect API anahtarı EAS'ta kayıtlı
- [x] Mağaza metinleri (IT/EN/TR), gizlilik cevapları, inceleme notu → `memory/APP_STORE.md`

## Yapılacaklar

### A. Mac terminalinde (komutlar)

1. **Yerel çalışmaları GitHub'a yedekle** (yeni terminal sekmesinde):
   ```
   cd ~/anindateklif
   git checkout -b yerel-calismalar
   git add -A
   git status        # .env / şifre dosyası olmadığını kontrol et
   git commit -m "Yerel çalışmalar: aidat, çek-senet, kira, seans, kartvizit"
   git push -u origin yerel-calismalar
   ```
2. **Dil desteğini içeren yeni derleme** (mağazada TR/EN/IT görünsün, izin pencereleri çevrilsin):
   ```
   cd ~/anindateklif-ios
   git pull origin claude/magical-hawking-5ympk8
   cd frontend
   npm install
   npx eas-cli build --platform ios --profile production
   npx eas-cli submit --platform ios --latest
   ```
   (Apple girişi artık sorulmamalı; sorulursa cagdasmetin1@icloud.com ile giriş + 6 haneli kod.)

### B. App Store Connect'te (tarayıcı: appstoreconnect.apple.com → Apps → Anında Teklif)

3. [ ] **Uygulama Bilgileri:** Ana dil → **Türkçe**; Kategori → İş (ikincil: Verimlilik);
       Gizlilik politikası URL → https://www.anindateklif.co/privacy
4. [ ] **Dil ekle** (sağ üst dil menüsü): İtalyanca, İngilizce (U.K. ve/veya U.S.) — Türkçe ana dil olarak zaten var
5. [ ] Her dil için `memory/APP_STORE.md` içindeki ad, alt başlık, anahtar kelimeler,
       tanıtım metni, açıklama, "Yenilikler" metnini yapıştır; Destek URL → https://www.anindateklif.co
6. [ ] **Ekran görüntüleri:** her dil için 3–10 adet, iPhone 6.9" (1320×2868) veya 6.7" (1290×2796)
       - TestFlight uygulamasıyla iPhone'a kur, telefon dilini değiştirerek her dilde çek
       - Sıra: Teklif oluşturma → PDF önizleme → WhatsApp paylaşım → Müşteriler → Tahsilat → Ekip
7. [ ] **Uygulama Gizliliği:** `memory/APP_STORE.md` → "App Privacy" tablosuna göre doldur, yayınla
8. [ ] **Yaş derecelendirmesi:** tüm sorular "Hayır" → 4+
9. [ ] **Fiyat ve Bulunabilirlik:** Ücretsiz; ülkeler (en az İtalya, Türkiye, İngiltere/ABD)
10. [ ] **AB Trader (tacir) beyanı:** İtalya/AB'de yayın için App Store Connect → İş (Business) bölümünde istenir
        (tacir ise adres/telefon/e-posta mağazada herkese açık görünür)
11. [ ] **Demo hesap:** uygulamada kurulumu tamamlanmış, örnek müşteri + teklif içeren hesap aç;
        e-posta/şifreyi "App Review Information"a yaz, `memory/APP_STORE.md`'deki İngilizce notu ekle
12. [ ] **Derleme seç:** sürüm sayfası → Build → en son build'i seç (dil destekli yeni build tercih edilir)
13. [ ] **Add for Review → Submit for Review**

### C. İnceleme sonrası

14. [ ] Apple'dan gelen mesajları takip et (iCloud e-postası + App Store Connect → App Review).
        Olası soru: Pro özelliklerin uygulama içi satın alması olmadığı (Kural 3.1.1/3.1.3).
        Mobilde satın alma düğmesi gizli; uygulama içinde web'e yönlendiren satın alma bağlantısı olmamalı.
15. [ ] Onaydan sonra "Yayınla" (otomatik veya elle)
16. [ ] `claude/magical-hawking-5ympk8` dalını main'e birleştir (PR aç), `yerel-calismalar` dalını incele/birleştir
17. [ ] Sonraki sürümler: `app.json` → `version` artır (ör. 1.0.1), sonra build + submit (build numarası otomatik artar)

## Başka bir Claude oturumuna verilecek komut örneği

> `memory/IOS_YAYIN_YAPILACAKLAR.md` dosyasını oku ve A bölümündeki adımları
> bilgisayarımda sırayla çalıştır; her adımdan sonra çıktıyı kontrol et.

Not: Terminal komutlarını (A bölümü) ancak **Mac'te çalışan** bir Claude oturumu
(Claude masaüstü uygulaması / Claude Code terminal) çalıştırabilir. Bulut oturumları
Mac'e erişemez. App Store Connect adımları (B) tarayıcıda yapılır; Apple girişi ve
iki adımlı doğrulama her zaman sizin tarafınızdan yapılmalıdır.

---

## Tüm kayıtlar / veriler

### Apple / Expo
| Alan | Değer |
|---|---|
| Apple ID | cagdasmetin1@icloud.com (Apple e-postaları bu adrese gelir, Gmail'e değil) |
| Hesap türü | Individual — "Cagdas Metin" |
| Team ID | MDR7AB4ZZW |
| Provider ID | 129541076 |
| App Store Connect App ID | 6818953431 |
| Bundle ID | com.anindateklif.app |
| URL scheme | anindateklif |
| Yetenekler (Capabilities) | Sign In with Apple, Push Notifications |
| Distribution Certificate | seri 709978ACBEA29278A8E484D03224D5B — bitiş 03.10.2027 |
| Provisioning Profile | RNC9764GM5 — active — bitiş 03.10.2027 |
| Push key | EAS'ta oluşturuldu, aninda-teklif'e atandı |
| App Store Connect API Key | "[Expo] EAS Submit we167fCvU2", Key ID JMAJ3LWH23, rol ADMIN, EAS sunucularında saklanıyor |
| TestFlight grubu | "Team (Expo)" — cagdasmetin1@icloud.com erişimli |
| Expo hesabı / slug | cagdsmetin / aninda-teklif |
| Expo projectId | 7d8d615f-66fb-42ec-b916-2ef957a4ac28 |
| Expo Updates URL | https://u.expo.dev/7d8d615f-66fb-42ec-b916-2ef957a4ac28 |
| 1. derleme | 1.0.0 (build 2), 03.10.2026 — https://expo.dev/accounts/cagdsmetin/projects/aninda-teklif/builds/4635afca-bfd4-45ef-826a-5771b5e562fa |
| 1. gönderim | https://expo.dev/accounts/cagdsmetin/projects/aninda-teklif/submissions/a3bd1122-dbf0-40a8-880b-20c915c84e6b |
| TestFlight | https://appstoreconnect.apple.com/apps/6818953431/testflight/ios |

Not: build 1 eski koddan başlatılıp iptal edildi; build numarası EAS'ta uzaktan tutulur (`appVersionSource: remote`, `autoIncrement: true`).

### Web adresleri
- Site / destek: https://www.anindateklif.co
- Gizlilik: https://www.anindateklif.co/privacy

### Sunucu ortam değişkenleri (entegrasyonlar — anahtar girilince açılır)
| Değişken | Ne açar |
|---|---|
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` | iyzico ödeme (mevcut) |
| `IYZICO_SUB_PLANS` | Otomatik yenileme. JSON: `{"<plan>:<kademe üst sınırı veya max>:<para birimi>": "<iyzico pricingPlanReferenceCode>"}` ör. `{"yearly:5:TRY":"...","yearly:10:TRY":"...","yearly:30:TRY":"...","yearly:max:TRY":"..."}`. Tüm kademe planları iyzico'da aynı ürün altında olmalı |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google ile giriş + Google Takvim senkronu. Yönlendirme adresi: `{BACKEND_BASE_URL}/api/google/oauth/callback`; Google Calendar API etkin olmalı |
| `GOOGLE_REDIRECT_URI` | (ops.) yönlendirme adresini elle vermek için |
| `GOOGLE_BUSINESS_ENABLED=true` | Google İşletme yorumları (Business Profile API onayı gelince) |
| `GOOGLE_TOKEN_KEY` | (ops.) Google yenileme anahtarlarının şifreleme anahtarı; yoksa JWT_SECRET'tan türetilir |
| `GCAL_SYNC_MINUTES` | (ops.) Takvim senkron aralığı, varsayılan 30 |
| `APPLE_BUNDLE_IDS` | (ops.) Apple girişinde kabul edilen paket kimlikleri, varsayılan `com.anindateklif.app` |

iyzico webhook adresi (iyzico panelinde tanımlanacak): `{BACKEND_BASE_URL}/api/subscription/recurring/webhook`

## Bu daldaki commit'ler (`claude/magical-hawking-5ympk8`)

| Commit | Tarih | Açıklama |
|---|---|---|
| 39599db | 30.09 | iyzico otomatik yenileme, Google ile giriş, Google Takvim, Google İşletme yorumları |
| e3037d9 | 30.09 | Personel sayısı kademe değiştirince iyzico planını bir sonraki dönemden güncelle (iki yönlü) |
| 8c25422 | 30.09 | iOS kamera izin metni + şifreleme beyanı |
| bba324c | 30.09 | Apple ile Giriş (Kural 4.8) |
| e9a160e | 30.09 | PRD düzenleme |
| 1a8665f | 03.10 | eas.json: Apple Team ID |
| 9ed1cbe | 03.10 | origin/main birleştirildi (panel ekip sayfaları) |
| 5285fbf | 04.10 | iOS TR/EN/IT dil tanımları |
| aa73f41 | 04.10 | eas.json: App Store Connect App ID |
| b85c4be | 04.10 | App Store metinleri (`memory/APP_STORE.md`) |

## Değişen dosyalar ve ne işe yaradıkları

**Sunucu**
- `backend/server.py` — iyzico abonelik (checkout, ödeme sayfası, callback, webhook, iptal, 6 saatlik kontrol, kademe geçişi); Google OAuth (giriş, takvim/işletme bağlama, bağlantı listeleme/kaldırma); Google Takvim iki yönlü senkron; Google İşletme konum/yorum/yanıt; Apple ile giriş (`POST /api/auth/apple`); ortak takvim öğeleri (`_calendar_items`); yeni indeksler
- `backend/tests/test_integrations.py` — 15 test (iyzico, kademe geçişi, Google giriş/takvim/işletme, Apple). Çalıştırma: `cd backend && pytest tests/test_integrations.py -n 0`
- `backend/requirements-dev.txt` — mongomock-motor, httpx (testler için)

**Uygulama**
- `frontend/app.json` — iOS: izin metinleri, `ITSAppUsesNonExemptEncryption: false`, `usesAppleSignIn`, `expo-apple-authentication` eklentisi, `locales` (tr/en/it)
- `frontend/eas.json` — submit.production.ios: appleTeamId MDR7AB4ZZW, ascAppId 6818953431
- `frontend/locales/{tr,en,it}.json` — uygulama adı ve izin pencerelerinin çevirileri
- `frontend/package.json`, `package-lock.json` — `expo-apple-authentication ~8.0.8`
- `frontend/src/components/AppleSignInButton.tsx` — iPhone'da "Apple ile devam et"
- `frontend/src/components/GoogleSignInButton.tsx` — Google butonu (+ iPhone'da Apple butonu)
- `frontend/src/lib/google.ts` — Google akışı yardımcıları
- `frontend/app/google-auth.tsx` — Google girişinden dönüş ekranı
- `frontend/app/_layout.tsx` — google-auth herkese açık rota
- `frontend/app/(auth)/login.tsx`, `register.tsx` — Google/Apple butonları
- `frontend/src/state/AuthContext.tsx` — `loginWithGoogleCode`, `loginWithApple`
- `frontend/src/lib/api.ts` — Google/Apple/İşletme/abonelik iptal API çağrıları
- `frontend/src/components/CalendarSync.tsx` — Google Takvim bağla/senkronla/kaldır
- `frontend/src/components/GoogleReviewsPanel.tsx`, `app/(tabs)/yorumlar.tsx` — Google yorumları + "Google'a gönder"
- `frontend/app/(tabs)/subscription.tsx` — mobilde satın alma gizli, otomatik yenileme kartı + iptal, kademe notu
- `frontend/src/components/ProBanner.tsx` — satın al düğmesi yalnız web'de
- `frontend/src/lib/i18n.tsx` — yeni metinler (tr/en/it)

**Belgeler**
- `memory/PRD.md` — "Entegrasyonlar" kurulum bölümü
- `memory/APP_STORE.md` — mağaza metinleri, gizlilik cevapları, inceleme notu
- `memory/IOS_YAYIN_YAPILACAKLAR.md` — bu dosya

## Mac'te GitHub'a yüklenmemiş dosyalar (`~/anindateklif`, main dalı — 04.10 itibarıyla)

Değişmiş: `backend/server.py`, `frontend/app.json`, `frontend/app/(auth)/login.tsx`, `frontend/app/(auth)/register.tsx`,
`frontend/app/(tabs)/_layout.tsx`, `frontend/app/(tabs)/company.tsx`, `frontend/app/(tabs)/customers.tsx`,
`frontend/app/(tabs)/tahsilat.tsx`, `frontend/app/_layout.tsx`, `frontend/app/campaign-detail.tsx`,
`frontend/app/customer-add.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/customer-import.ts`,
`frontend/src/lib/i18n.tsx`, `frontend/src/lib/navItems.ts`, `frontend/src/lib/tahsilat-utils.ts`, `frontend/src/lib/theme.ts`

Yeni: `frontend/app/(tabs)/aidat.tsx`, `cek-senet.tsx`, `islem-gecmisi.tsx`, `kartvizit.tsx`, `kira.tsx`, `seans.tsx`,
`frontend/app/k/`, `frontend/src/components/AgingCard.tsx`, `BankStatementCard.tsx`, `QrView.tsx`, `RentModule.tsx`,
`TagPicker.tsx`, `frontend/src/components/auth/`, `frontend/src/lib/bank-statement.ts`, `cek-senet.ts`, `rent.ts`,
`save-text.ts`, `vcard.ts`

Dikkat: Bu değişikliklerin bazıları (`login.tsx`, `register.tsx`, `api.ts`, `i18n.tsx`, `server.py`, `app.json`,
`_layout.tsx`) bu daldaki dosyalarla çakışabilir; `yerel-calismalar` dalı yüklendikten sonra birleştirme dikkatle yapılmalı.

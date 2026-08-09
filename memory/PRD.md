# Anında Teklif — SaaS PRD

## Vision
Profesyonel B2B teklif hazırlama SaaS uygulaması. Türkçe. **JWT email/şifre auth** ile giriş, çoklu firma (multi-tenant), 3-mod dinamik kalem sistemi, SKYART PDF taslağıyla piksel uyumlu çıktı ve WhatsApp paylaşım. Yeni kullanıcılar için 3 slaytlı splash + 6 adımlı kurulum sihirbazı.

## Auth (JWT — 2026-06 rewrite)
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET/PATCH /api/auth/me`, `POST /api/auth/logout`
- Password rules (backend + frontend live checklist): 8+ karakter, küçük harf, büyük harf, rakam, sembol
- Bearer JWT access token (7 gün) → `expo-secure-store` (mobile) / `localStorage` (web) under key `session_token_v1`
- Route guard 3 durumlu: unauthenticated → `/(auth)/splash`; authenticated ama `!onboarding_completed` → `/(setup)/wizard`; tamamlanmış → `/(tabs)`

## Onboarding — 6 Step Wizard (`app/(setup)/wizard.tsx`)
1. **Ülke seçimi** — TR/GB/US/CA, currency + tax label PATCH /auth/me
2. **İşletme kimliği** — Şirket adı + İmza metni
3. **Logo yükleme** (opsiyonel) — expo-image-picker base64
4. **İletişim & Vergi** — adres, telefon, vergi dairesi, vergi no
5. **Banka hesapları** (multi-add) — banka + hesap sahibi + IBAN
6. **İlk sistem tipi** — ad + virgülle ayrılmış alanlar (opsiyonel)
Final adım: `POST /api/companies` + `PATCH /api/auth/me {onboarding_completed:true}`

## Multi-Tenancy
Her koleksiyon dokümanında `userId` stamped. Her endpoint `Depends(get_current_user)` ile korunur ve queries userId ile filtrelenir. Cross-tenant read/write mümkün değil.

## Data Model
- `Company`: sirketAdi, logoBase64, adres, telefon(1,2), email, website, vergiDairesi/No, ozelNotlar, banklar[{turu, hesapSahibi, iban}], hazirlayanEmails[], motorlar[], aydinlatmalar[], sistemTipleri[]
- `CatalogItem`: kategori, urunAdi, aciklama, birim, birimFiyat, paraBirimi
- `Customer`: firma, yetkili, telefon, email, adres (auto-upserted from quotes)
- `Quote.items[]` → 3 modes:
  - `technical`: sistemTipi + genislikMm + uzunlukMm + yukseklikMm + motor + aydinlatma + kopukDolgu + ralAna + ralPanel + ekBilgi
  - `manual`: urunAdi + customFields[{key,value}][]
  - `general`: urunAdi + aciklama
  - Common: adet, birim, birimFiyat

## Screens
1. **Login** (`app/login.tsx`) — Google button, premium hero.
2. **Teklif Editor** (`app/(tabs)/index.tsx`) — Modal sheet to pick item mode; live preview of "SİSTEM/HİZMET" cell.
3. **Katalog** (`app/(tabs)/catalog.tsx`) — CRUD + CSV bulk.
4. **Geçmiş** (`app/(tabs)/history.tsx`) — Status filter + PDF/WhatsApp re-share.
5. **Müşteri** (`app/(tabs)/customers.tsx`) — Auto-populated from quotes.
6. **Firma** (`app/(tabs)/company.tsx`) — Multi-company + logo + bank list + motor/light/system-type lists + default özel notlar.
7. **PDF Önizleme** (`app/preview.tsx`) — Piksel uyumlu preview matching PDF.

## PDF Template
Layout matches SKYART Teklif_2026-260806.pdf:
- Firma info (sol) + logo (sağ)
- **TEKLİF FORMU** başlık, meta (Teklif No / Tarih / Geçerlilik)
- 2 kutu: MÜŞTERİ + SİPARİŞ BİLGİLERİ (dark headers, key-value rows)
- Kalem tablosu: **S.NO | SİSTEM / HİZMET | ADET | BİRİM FİYAT | TOPLAM FİYAT**
- "SİSTEM / HİZMET" sütununda teknik detaylar virgülle birleştirilir: `Pistonlu Bioklimatik Sistem, 4726x6720mm, H: 3000mm, Mosel Motor, Led: Günışığı, Strafor Köpük Dolgulu, Ral: Ana Renk, Demonte.`
- Kırmızı uyarı + Siyah `KDV HARİÇ FİYATTIR` bantı
- Özel Notlar (sol) + Ara Toplam / Genel Toplam / İmza (sağ)
- BANKA BİLGİLERİ tablosu (banka türü + IBAN, çoklu satır)

## File Naming
`Teklif_YYYY-DDMMYY-HHMM.pdf` — örn. `Teklif_2026-080826-1830.pdf`

## Share Message
"Teklifiniz ekte yer almaktadır. İyi çalışmalar dileriz."

## Palette
- Primary: `#2563EB` (bright blue)
- Secondary: `#1E293B` (deep navy)
- Background: pure white
- Rounded-lg buttons, premium shadows via `theme.shadow.{sm,md,lg}`

## Item Mode UX
- Kalem eklerken alttaki `Kalem Ekle` butonuna basınca modal sheet açılır: **Sistem/Teknik**, **Manuel Bilgi**, **Genel Ürün** üç seçenek.
- Teknik modda sistem tipi, motor ve aydınlatma dropdown'ları firmanın kendi listelerinden gelir.
- Her teknik/manuel kartın altında "PDF ÖNİZLEME" satırı canlı gösterilir.

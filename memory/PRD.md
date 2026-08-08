# Anında Teklif — SaaS PRD

## Vision
Profesyonel B2B teklif hazırlama SaaS uygulaması. Türkçe. Emergent Google Auth ile giriş, çoklu firma (multi-tenant), 3-mod dinamik kalem sistemi, SKYART PDF taslağıyla piksel uyumlu çıktı ve WhatsApp paylaşım.

## Auth
- Emergent Google Auth (POST /api/auth/session, GET /api/auth/me, POST /api/auth/logout)
- Bearer token (session_token) → `expo-secure-store` (mobile) / `localStorage` (web)
- Route guard: unauthenticated → `/login`; authenticated → `/(tabs)`

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

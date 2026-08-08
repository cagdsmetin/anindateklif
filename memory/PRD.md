# PRD - Pro Teklif Hazırlama ve Müşteri CRM Mobil Uygulaması

## Original Problem Statement
Kullanıcının yüklediği profesyonel teklif aracı (Netlify/HTML tabanlı) temel alınarak, her sektörden kullanıcının hızlıca teklif verebileceği, müşteri verilerini saklayıp geçmiş teklifleri takip edebileceği premium görünümlü bir Expo React Native mobil uygulaması geliştirmek.

## Architecture & Tasks Done
- **UI/UX Tasarım:** `design_guidelines.json` standartlarına uygun, koyu gri/kurumsal lacivert ve premium hissi veren modern mobil arayüz.
- **Teklif Listesi & CRM:** Tüm geçmiş tekliflerin listelenmesi, arama, durum filtreleme (Taslak, Görüldü, Onaylandı, Reddedildi) ve durum yönetimi.
- **Teklif Düzenleyici (Editor):** Temsilci seçimi, döviz birimi (USD, EUR, TRY, GBP), müşteri bilgileri, dinamik kalem ekleme/silme, iskonto ve KDV hesaplamaları.
- **PDF Önizleme ve Paylaşım:** A4 teklif şablonunun ekranda kusursuz önizlenmesi, WhatsApp ve PDF indirme simülasyonları.

## Mocked in Frontend
- Lokal veri yönetimi React state ve mock veri katmanı (`/app/frontend/src/mock.ts`) üzerinden sağlanmaktadır. Faz 2'de FastAPI + MongoDB backend entegrasyonu ile değiştirilecektir.

## Prioritized Backlog / Remaining Tasks
1. FastAPI + MongoDB backend entegrasyonu (Faz 2)
2. Gerçek PDF dosya oluşturma kütüphanesi entegrasyonu
3. Bulut senkronizasyonu ve kullanıcı giriş sistemi

## Smart Business Enhancement (Productivity & Conversion)
- **Akıllı Teklif Analitiği & Hatırlatıcılar:** Onay bekleyen tekliflerin süresi dolmadan önce müşteriye otomatik WhatsApp/E-posta hatırlatıcı önerileri sunarak teklif kazanma oranını %35 artırın.

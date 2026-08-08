# Anında Teklif — Product Requirements

## Overview
Türkçe, native React Native + Expo mobil uygulama. Çok firmalı fiyat teklifi hazırlama aracı. Kullanıcı kendi firmasını (logo, adres, banka, e-mail listesi) tanımlar, ürün kataloğunu yönetir, teklif oluşturur, HTML tabanlı PDF üretir ve WhatsApp'tan paylaşır.

## Stack
- Frontend: Expo Router (SDK 54), React Native 0.81, TypeScript, react-native-safe-area-context
- Backend: FastAPI + MongoDB (motor)
- PDF: expo-print (HTML → PDF)
- Sharing: expo-sharing (WhatsApp dahil native share sheet)
- Logo yükleme: expo-image-picker (base64 olarak Mongo'da saklanır)
- Persist: MongoDB (companies, catalog, customers, quotes) + AsyncStorage (active company id)

## Screens (tabs)
1. **Teklif** (`app/(tabs)/index.tsx`) — Yeni/mevcut teklif düzenle, katalogdan kalem ekle, KDV+iskonto+toplam hesaplama, PDF/WhatsApp paylaşım.
2. **Katalog** (`app/(tabs)/catalog.tsx`) — Ürün/hizmet ekle/düzenle/sil, CSV toplu içe aktar.
3. **Geçmiş** (`app/(tabs)/history.tsx`) — Teklif listesi, durum filtreleme (Beklemede/Görüldü/Onaylandı/Reddedildi), PDF/WhatsApp yeniden paylaş, düzenle.
4. **Müşteri** (`app/(tabs)/customers.tsx`) — Otomatik toplanan müşteri geçmişi + istatistik.
5. **Firma** (`app/(tabs)/company.tsx`) — Çoklu firma, logo/adres/telefon/banka bilgileri, hazırlayan e-mail listesi.

Ayrıca `app/preview.tsx` — Tam PDF önizleme (HTML şablonuna birebir yakın layout).

## Backend Endpoints (all prefixed `/api`)
- `GET/POST /companies`, `GET/PUT/DELETE /companies/{id}`
- `GET /catalog/{companyId}`, `POST /catalog`, `POST /catalog/bulk`, `PUT/DELETE /catalog/{id}`
- `GET /customers/{companyId}`, `POST /customers`, `DELETE /customers/{id}`
- `GET /quotes/{companyId}`, `POST/PUT /quotes[/{id}]`, `PATCH /quotes/{id}/status`, `DELETE /quotes/{id}`

## Data Model highlights
- `Company`: sirketAdi, logoBase64, adres, telefon(1,2), email, website, vergiDairesi/No, bankaBilgileri, hazirlayanEmails[]
- `CatalogItem`: kategori, urunAdi, aciklama, birim, birimFiyat, paraBirimi (USD/EUR/TRY)
- `Quote`: müşteri bilgileri + sipariş koşulları + items[] + iskonto + kdvOrani + durum + hesaplanmış toplamlar

## Key Features
- **Sabit uygulama başlığı**: Üstte her zaman "Anında Teklif" markası görünür (teklifi hazırlarken)
- **PDF**: HTML template ile birebir. Firmanın kendi logosu, adresi, telefonu, bankası PDF'de yer alır.
- **WhatsApp paylaşım**: Native share sheet ile PDF paylaşımı ("Teklifiniz ekte yer almaktadır" başlığı)
- **Otomatik müşteri kaydı**: Teklif oluşturuldukça müşteri geçmişine kaydolur, sonraki tekliflerde tek tıkla doldurulur.
- **Toplu ürün girişi**: CSV formatında yapıştırarak (kategori,ürün,birim,fiyat,parabirimi).
- **Durum takibi**: 4 durum + filtre + istatistik.

## Seed
Uygulama ilk açılışta `SKYART GROUP GÖLGELENDİRME` demo firmasını otomatik oluşturur (email listesi + banka bilgisi ile).

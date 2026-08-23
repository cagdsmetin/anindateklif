import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/src/lib/theme';

// Public, unauthenticated page — required by Google Play (Data Safety form)
// and the App Store (App Privacy). Kept outside the auth-gated navigator;
// see app/_layout.tsx RouteGuard `isPublic` check.
export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.headerTitle} onPress={() => router.push('/')}>
          Anında Teklif
        </Text>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.h1}>Gizlilik Politikası</Text>
        <Text style={s.updated}>Son güncelleme: 23 Ağustos 2026</Text>

        <Text style={s.p}>
          Bu gizlilik politikası, "Anında Teklif" mobil uygulamasını ve web sitesini
          (www.anindateklif.co) kullanırken toplanan, işlenen ve saklanan kişisel
          verileri açıklar. Uygulamayı kullanarak bu politikayı kabul etmiş olursunuz.
        </Text>

        <Section title="1. Veri Sorumlusu">
          <Text style={s.p}>
            Anında Teklif, esnaf ve küçük işletmelerin teklif, katalog, müşteri ve kasa
            yönetimini kolaylaştıran bir SaaS uygulamasıdır. Uygulama, sizin
            (işletme sahibi/kullanıcı) kendi müşterilerinize ait verileri kendi
            hesabınızda yönetmenizi sağlar; bu verilerin veri sorumlusu sizsiniz, biz
            veri işleyen sıfatıyla altyapıyı sağlarız.
          </Text>
        </Section>

        <Section title="2. Topladığımız Veriler">
          <Bullet>Hesap bilgileri: ad soyad, e-posta, telefon, şifre (şifrelenmiş olarak saklanır).</Bullet>
          <Bullet>Firma bilgileri: firma unvanı, adres, vergi bilgisi, logo (fotoğraf galerisinden seçtiğiniz görsel).</Bullet>
          <Bullet>Kullanıcı tarafından girilen iş verileri: müşteri kayıtları, teklifler, katalog/ürün-hizmet tanımları, kasa (gelir/gider) ve tahsilat (alacak/borç) kayıtları, kampanya ve hatırlatma verileri.</Bullet>
          <Bullet>AI Asistan sohbet içeriği: yapay zeka asistanına yazdığınız mesajlar, yanıt üretmek amacıyla Anthropic (Claude API) altyapısına iletilir.</Bullet>
          <Bullet>Teknik veriler: cihaz/tarayıcı bilgisi, IP adresi, uygulama kullanım günlükleri (hata ayıklama ve güvenlik amacıyla).</Bullet>
        </Section>

        <Section title="3. Verileri Kullanma Amaçlarımız">
          <Bullet>Uygulamanın temel işlevlerini sunmak (teklif oluşturma, katalog, müşteri/kasa/tahsilat takibi).</Bullet>
          <Bullet>PDF teklif oluşturma ve WhatsApp üzerinden paylaşım.</Bullet>
          <Bullet>AI Asistan üzerinden ürün/hizmet yapılandırma önerileri sunmak.</Bullet>
          <Bullet>Hesap güvenliği, kimlik doğrulama ve dolandırıcılığın önlenmesi.</Bullet>
          <Bullet>Yasal yükümlülüklerin yerine getirilmesi.</Bullet>
        </Section>

        <Section title="4. Verilerin Paylaşımı">
          <Text style={s.p}>
            Verileriniz, uygulamayı çalıştırmak için gerekli alt yüklenicilerle (barındırma
            sağlayıcısı Railway, veritabanı MongoDB, yapay zeka altyapısı Anthropic)
            sınırlı ölçüde paylaşılır. Verileriniz reklam amacıyla üçüncü taraflara
            satılmaz veya kiralanmaz.
          </Text>
        </Section>

        <Section title="5. Veri Saklama ve Güvenlik">
          <Text style={s.p}>
            Verileriniz, hesabınız aktif olduğu sürece saklanır. Hesabınızı silmek
            istediğinizde uygulama içinden veya aşağıdaki e-posta adresinden talepte
            bulunabilirsiniz; talebiniz makul bir süre içinde işleme alınır. Şifreler
            geri döndürülemez biçimde (hash) saklanır, veri iletimi şifreli bağlantı
            (HTTPS) üzerinden yapılır.
          </Text>
        </Section>

        <Section title="6. Haklarınız">
          <Text style={s.p}>
            KVKK ve ilgili mevzuat kapsamında verilerinize erişme, düzeltme, silme ve
            işlenmesine itiraz etme hakkına sahipsiniz. Taleplerinizi aşağıdaki
            iletişim adresinden bize iletebilirsiniz.
          </Text>
        </Section>

        <Section title="7. Çocukların Gizliliği">
          <Text style={s.p}>
            Anında Teklif, işletme sahiplerine yönelik bir iş uygulamasıdır ve 18 yaş
            altındaki kullanıcılara yönelik değildir; bilerek çocuklardan veri
            toplamayız.
          </Text>
        </Section>

        <Section title="8. İletişim">
          <Text style={s.p}>
            Gizlilikle ilgili sorularınız için: ncagdasm@gmail.com
          </Text>
        </Section>

        <Text style={s.footer}>© {new Date().getFullYear()} Anında Teklif — Tüm hakları saklıdır.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bulletRow}>
      <Ionicons name="ellipse" size={6} color={theme.colors.primary} style={s.bulletDot} />
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.navyDark },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 60, maxWidth: 720, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 24, fontWeight: '900', color: theme.colors.navyDark, marginBottom: 4 },
  updated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 18 },
  h2: { fontSize: 16, fontWeight: '800', color: theme.colors.navyDark, marginBottom: 8 },
  p: { fontSize: 14, lineHeight: 21, color: theme.colors.textSoft },
  section: { marginBottom: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bulletDot: { marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, color: theme.colors.textSoft },
  footer: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: 20 },
});

# Hukuki statik sayfalar: gizlilik politikası ve kullanım şartları.
# Gizlilik metni uygulamadaki /privacy ekranıyla aynıdır (src/lib/i18n.tsx, privacy.*);
# metin değişirse ikisini birlikte güncelleyin.
from ortak import DESTEK_EPOSTA, e

HUKUK_TARIH = "2026-11-06"

GIZLILIK_BASLIK = "Gizlilik Politikası | Anında Teklif"
GIZLILIK_ACIKLAMA = "Anında Teklif'in hangi kişisel verileri hangi amaçla işlediği, kimlerle paylaştığı, saklama süresi ve KVKK kapsamındaki haklarınız."

KULLANIM_BASLIK = "Kullanım Şartları | Anında Teklif"
KULLANIM_ACIKLAMA = "Anında Teklif web sitesi ve uygulamasının kullanım şartları: hesap, ücretli planlar, kabul edilebilir kullanım, sorumluluk ve iletişim."


def _bolumler(bolumler):
    cikti = []
    for baslik, paragraflar, maddeler in bolumler:
        s = f"<h2>{e(baslik)}</h2>"
        for p in paragraflar:
            s += f"<p>{p}</p>"
        if maddeler:
            s += "<ul>" + "".join(f"<li>{m}</li>" for m in maddeler) + "</ul>"
        cikti.append(s)
    return "".join(cikti)


def gizlilik_govde():
    b = [
        ("1. Veri Sorumlusu", [
            "Anında Teklif, esnaf ve küçük işletmelerin teklif, katalog, müşteri ve kasa yönetimini kolaylaştıran bir SaaS uygulamasıdır. Uygulama, sizin (işletme sahibi/kullanıcı) kendi müşterilerinize ait verileri kendi hesabınızda yönetmenizi sağlar; bu verilerin veri sorumlusu sizsiniz, biz veri işleyen sıfatıyla altyapıyı sağlarız."], []),
        ("2. Topladığımız Veriler", [], [
            "Hesap bilgileri: ad soyad, e-posta, telefon, şifre (şifrelenmiş olarak saklanır).",
            "Firma bilgileri: firma unvanı, adres, vergi bilgisi, logo (fotoğraf galerisinden seçtiğiniz görsel).",
            "Kullanıcı tarafından girilen iş verileri: müşteri kayıtları, teklifler, katalog/ürün-hizmet tanımları, kasa (gelir/gider) ve tahsilat (alacak/borç) kayıtları, kampanya ve hatırlatma verileri, tekliflere eklediğiniz dosya ekleri (PDF, Word, görsel).",
            "AI Asistan sohbet içeriği: yapay zeka asistanına yazdığınız mesajlar, yanıt üretmek amacıyla Anthropic (Claude API) altyapısına (ABD merkezli) iletilir; bu özellik isteğe bağlıdır, kullanmak zorunda değilsiniz.",
            "Teknik veriler: cihaz/tarayıcı bilgisi, IP adresi, uygulama kullanım günlükleri (hata ayıklama ve güvenlik amacıyla)."]),
        ("3. Verileri Kullanma Amaçlarımız", [], [
            "Uygulamanın temel işlevlerini sunmak (teklif oluşturma, katalog, müşteri/kasa/tahsilat takibi).",
            "PDF teklif oluşturma ve WhatsApp üzerinden paylaşım.",
            "AI Asistan üzerinden ürün/hizmet yapılandırma önerileri sunmak.",
            "Hesap güvenliği, kimlik doğrulama ve dolandırıcılığın önlenmesi.",
            "Yasal yükümlülüklerin yerine getirilmesi."]),
        ("4. Verilerin Paylaşımı", [
            "Verileriniz, uygulamayı çalıştırmak için gerekli alt yüklenicilerle (barındırma sağlayıcısı Railway, veritabanı MongoDB, yapay zeka altyapısı Anthropic) sınırlı ölçüde paylaşılır. Bu sağlayıcıların bir kısmı yurt dışında (örn. ABD) konumlanmış olabilir; veriler yalnızca hizmetin çalışması için gerekli ölçüde ve yeterli güvenlik önlemleriyle aktarılır. Verileriniz reklam amacıyla üçüncü taraflara satılmaz veya kiralanmaz."], []),
        ("5. Çerezler ve Tarayıcı Depolaması", [
            "Web sitemiz reklam, izleme veya analiz çerezi kullanmaz. Oturumunuzu açık tutmak ve taslak teklifinizi kaybetmemeniz için yalnızca tarayıcınızın yerel depolaması kullanılır; bu veriler cihazınızdan çıkmaz ve tarayıcı ayarlarınızdan silebilirsiniz."], []),
        ("6. Veri Saklama ve Güvenlik", [
            "Verileriniz, hesabınız aktif olduğu sürece saklanır. Hesabınızı silmek istediğinizde uygulama içinden veya aşağıdaki e-posta adresinden talepte bulunabilirsiniz; talebiniz makul bir süre içinde işleme alınır. Şifreler geri döndürülemez biçimde (hash) saklanır, veri iletimi şifreli bağlantı (HTTPS) üzerinden yapılır."], []),
        ("7. Haklarınız", [
            "KVKK ve ilgili mevzuat kapsamında verilerinize erişme, düzeltme, silme ve işlenmesine itiraz etme hakkına sahipsiniz. Taleplerinizi aşağıdaki iletişim adresinden bize iletebilirsiniz."], []),
        ("8. Çocukların Gizliliği", [
            "Anında Teklif, işletme sahiplerine yönelik bir iş uygulamasıdır ve 18 yaş altındaki kullanıcılara yönelik değildir; bilerek çocuklardan veri toplamayız."], []),
        ("9. İletişim", [f'Gizlilikle ilgili sorularınız için: <a href="mailto:{DESTEK_EPOSTA}">{DESTEK_EPOSTA}</a>'], []),
    ]
    return ('<article class="kap"><h1>Gizlilik Politikası</h1>'
            f'<p class="kunye">Son güncelleme: 6 Kasım 2026</p>'
            '<p>Bu gizlilik politikası, "Anında Teklif" mobil uygulamasını ve web sitesini (www.anindateklif.co) kullanırken toplanan, işlenen ve saklanan kişisel verileri açıklar. Uygulamayı kullanarak bu politikayı kabul etmiş olursunuz. '
            'Kullanım koşulları için <a href="/kullanim-sartlari.html">Kullanım Şartları</a> sayfasına bakın.</p>'
            + _bolumler(b) + "</article>")


def kullanim_govde():
    b = [
        ("1. Hizmetin Tanımı", [
            "Anında Teklif; işletmelerin fiyat teklifi hazırlamasını, müşteri, katalog, kasa ve tahsilat kayıtlarını tutmasını sağlayan bir yazılım hizmetidir (web, iOS ve Android). Hizmet, SkyArt Group Gölgelendirme Sistemleri A.Ş.'ye ait bir yazılım olarak sunulur."], []),
        ("2. Hesap ve Güvenlik", [], [
            "Hesap açmak için doğru ve güncel bilgi vermeniz, 18 yaşını doldurmuş olmanız gerekir.",
            "Şifrenizin ve hesabınızdan yapılan işlemlerin güvenliğinden siz sorumlusunuz; yetkisiz kullanım fark ederseniz bize hemen bildirin.",
            "Personel davet ettiğinizde, onların hesabınız altındaki işlemlerinden de siz sorumlu olursunuz."]),
        ("3. Ücretsiz ve Ücretli Planlar", [
            'Ücretsiz planda ayda sınırlı sayıda teklif hazırlanabilir. Ücretli planların kapsamı ve güncel ücretleri <a href="/fiyatlar.html">Fiyatlar</a> sayfasında yer alır. Ücretler ve plan koşulları önceden duyurularak değiştirilebilir; değişiklik, mevcut ödenmiş dönemi etkilemez.',
            "Ödemeler, ödeme kuruluşu aracılığıyla alınır; kart bilgileriniz bizim sistemlerimizde saklanmaz. İptal ve iade taleplerinizi aşağıdaki e-posta adresinden iletebilirsiniz; tüketici mevzuatından doğan haklarınız saklıdır."], []),
        ("4. Sizin İçeriğiniz", [
            "Hesabınıza girdiğiniz müşteri, teklif, fiyat ve diğer iş verileri size aittir. Bu verileri yalnızca hizmeti sunmak için işleriz; ayrıntı için Gizlilik Politikası'na bakın. Teklif ve belgelerin içeriğinden, fiyatların ve vergilerin doğruluğundan ve müşterilerinize karşı yükümlülüklerinizden siz sorumlusunuz."], []),
        ("5. Kabul Edilebilir Kullanım", [], [
            "Hizmeti yasa dışı, yanıltıcı veya üçüncü kişilerin haklarını ihlal eden amaçlarla kullanmamak.",
            "Hizmetin güvenliğini, erişimini veya performansını bozacak girişimlerde (yetkisiz erişim, otomatik toplu istek, kötü amaçlı yazılım) bulunmamak.",
            "Hizmeti veya kaynak kodunu izinsiz kopyalamamak, tersine mühendislik yapmamak, yeniden satmamak.",
            "Müşterilerinize ticari ileti gönderirken ilgili mevzuata (ret hakkı, gönderen kimliği vb.) uymak."]),
        ("6. Yapay Zeka Özellikleri", [
            "AI Asistan gibi özellikler öneri üretir ve hata yapabilir. Üretilen fiyat, ölçü ve metinleri göndermeden önce kontrol etmek sizin sorumluluğunuzdadır."], []),
        ("7. Hizmetin Sürekliliği", [
            "Hizmeti kesintisiz ve hatasız sunmayı hedefleriz; ancak bakım, güncelleme veya üçüncü taraf altyapı sorunları nedeniyle geçici kesintiler olabilir. Önemli verileriniz için gerektiğinde kendi yedeğinizi (ör. PDF/Excel dışa aktarma) almanız önerilir."], []),
        ("8. Sorumluluğun Sınırı", [
            "Yasaların izin verdiği ölçüde, hizmet \"olduğu gibi\" sunulur. Kullanıcının hatalı girdilerinden, hizmetin kullanılamamasından veya dolaylı zararlardan doğan kayıplardan sorumluluğumuz, kasıt ve ağır kusur halleri ile emredici mevzuattan doğan sorumluluklarımız saklı kalmak üzere, ilgili dönemde ödediğiniz ücretle sınırlıdır."], []),
        ("9. Hesabın Sona Ermesi", [
            "Hesabınızı istediğiniz zaman silebilirsiniz. Bu şartları ihlal eden hesapları askıya alma veya kapatma hakkımız saklıdır. Hesap kapatıldığında verileriniz Gizlilik Politikası'ndaki ilkelere göre işlenir."], []),
        ("10. Değişiklikler ve Uygulanacak Hukuk", [
            "Bu şartlar güncellenebilir; önemli değişiklikler uygulama veya e-posta ile duyurulur. Güncellemeden sonra hizmeti kullanmaya devam etmeniz yeni şartları kabul ettiğiniz anlamına gelir. Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır; uyuşmazlıklarda yetkili mahkemeler ve tüketici hakem heyetleri yetkilidir."], []),
        ("11. İletişim", [f'Sorularınız için: <a href="mailto:{DESTEK_EPOSTA}">{DESTEK_EPOSTA}</a>'], []),
    ]
    return ('<article class="kap"><h1>Kullanım Şartları</h1>'
            '<p class="kunye">Son güncelleme: 6 Kasım 2026</p>'
            '<p>Anında Teklif web sitesini ve uygulamasını kullanarak aşağıdaki şartları kabul etmiş olursunuz. Kişisel verilerinizin nasıl işlendiği için <a href="/privacy">Gizlilik Politikası</a>\'na bakın.</p>'
            + _bolumler(b) + "</article>")

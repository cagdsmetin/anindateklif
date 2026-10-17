# Albert Genau bayileri için tanıtım sayfası (/albert-genau-bayileri.html).
# Kullanıcı kararı (2026-10-18): Albert Genau bayilerine önerilmek üzere marka
# öne çıkarılıyor. İçerik backend/albert_genau_calc.py ve
# frontend/app/(tabs)/albert-genau.tsx'teki gerçek özelliklere dayanır.
# "Resmî Albert Genau uygulaması" gibi bir iddia YAZILMAZ; erişim, firma
# kurulumdaki "Albert Genau bayisiyim" beyanından sonra admin onayıyla açılır.

AG_SLUG = "/albert-genau-bayileri.html"
AG_BASLIK = "Albert Genau Bayileri İçin Teklif Programı | Anında Teklif"
AG_ACIKLAMA = ("Albert Genau bayileri için teklif programı: BIOFLEX bioklimatik pergola, VERTIFLEX, AIRFLEX ve BC sistemlerinde "
               "ölçüyü girin, malzeme listesi, fiyat ve teknik çizim otomatik hesaplansın; teklifi PDF olarak gönderin.")

AG_SSS = [
    ("Albert Genau hesaplama modülü kimlere açık?", "Albert Genau bayilerine açıktır. Ücretsiz Anında Teklif hesabı açarken firma kurulumunda \"Albert Genau bayisiyim\" seçeneğini işaretlersiniz; bayiliğiniz doğrulandıktan sonra modül hesabınızda açılır."),
    ("Fiyat listesi nasıl güncel kalıyor?", "Malzeme fiyat listesi merkezi olarak güncellenir; modülü kullanan bayilerin her birinin kendi Excel'ini yüklemesi gerekmez. Güncel liste tüm bayilerin hesaplamasına otomatik yansır."),
    ("Kâr marjını ve montaj bedelini ben mi belirliyorum?", "Evet. Alış iskontosu, montaj bedeli, imalat ve diğer giderler ile kâr marjını her bayi kendisi girer; teklif fiyatı buna göre oluşur."),
    ("Hangi sistemler hesaplanabiliyor?", "AG BIOFLEX bioklimatik pergola (4 ayak üstü, 2 ayak duvar, ayaksız), AG BIO sabit sistemler, VERTIFLEX, AIRFLEX ve BC ailesindeki 39 alt sistem (TIARA, SLIDER NEXT, SLIDE MASTER, ATRIUM, MOMENTUM, CENTRUM HD, TANGO, OPTIMA ve diğerleri); ayrıca 243 kalemlik yedek parça kataloğu."),
    ("Modül ücretli mi?", "Anında Teklif'in ücretsiz planıyla başlayabilirsiniz; ücretsiz planda ayda 5 teklif hazırlanır. Sınırsız teklif için abonelik fiyatları fiyatlar sayfasındadır."),
]


def ag_govde(cta, sss_html, e, DESTEK_EPOSTA):
    sistemler = [
        ("AG BIOFLEX bioklimatik pergola", "4 ayak üstü, 2 ayak duvar ve ayaksız tipler; genişlik, derinlik ve yükseklik (mm) ile"),
        ("AG BIO sabit sistemler", "Sabit 4 ayak üstü ve sabit duvar tipleri"),
        ("VERTIFLEX", "Giyotin cam sistemleri"),
        ("AIRFLEX", ""),
        ("BC ailesi · 39 alt sistem", "TIARA, TIARA FLAT, SLIDER NEXT, SLIDE MASTER, ATRIUM, MOMENTUM, CENTRUM HD, TANGO, OPTIMA ve diğerleri"),
        ("Yedek parça kataloğu", "243 kalem; parça ve adet seçerek perakende fiyatla"),
    ]
    sis = "".join(f"<li><h3>{e(a)}</h3>{f'<p>{e(b)}</p>' if b else ''}</li>" for a, b in sistemler)
    return f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Albert Genau bayileri</nav>
<p class="rozet">Albert Genau bayileri için</p>
<h1>Albert Genau sistemlerinde teklifi saniyeler içinde hazırlayın</h1>
<p class="giris-metni">Ölçüyü girin; Albert Genau'nun kendi maliyet analizi formülleriyle malzeme listesi, fiyat ve teknik çizim otomatik çıksın. Kâr marjınızı ve montaj bedelinizi ekleyin, logolu PDF teklifi müşterinize WhatsApp'tan gönderin.</p>
<p><a class="dugme buyuk" href="/register">Ücretsiz hesap aç</a></p>
<div class="kisa-cevap"><strong>Kısa cevap:</strong> Anında Teklif'in Albert Genau modülü, bayilerin bioklimatik pergola, VERTIFLEX, AIRFLEX ve BC sistemlerinde ölçü girerek tam malzeme listesini ve fiyatı otomatik hesaplamasını sağlar. Fiyat listesi merkezden güncellenir; bayi alış iskontosunu, montaj ve imalat giderlerini, kâr marjını kendisi belirler. Hesaplanan sistem teknik çizimiyle birlikte teklife eklenir.</div>

<h2>Excel'den teklife geçiş artık tek ekranda</h2>
<p>Albert Genau sistemlerinde fiyat vermek için çoğu bayi maliyet analizi Excel'ini açar, ölçüleri girer, malzeme toplamını alır, üstüne montajı ve kârı ekler, sonra ayrı bir dosyada müşteriye teklif yazar. Anında Teklif bu zinciri tek ekranda toplar:</p>
<ol class="adimlar">
<li><span>1</span><h3>Sistemi ve ölçüyü seçin</h3><p>Sistem tipi, genişlik, derinlik, yükseklik ve renk/yüzey (satine naturel, antrasit gri, bronz, RAL ve diğerleri).</p></li>
<li><span>2</span><h3>Malzeme ve fiyat hesaplansın</h3><p>Profil, aksesuar ve opsiyonların (LED dahil) miktarı ve maliyeti Albert Genau formülleriyle otomatik çıkar.</p></li>
<li><span>3</span><h3>Kârınızı ekleyip gönderin</h3><p>Alış iskontosu, montaj, imalat giderleri ve kâr marjı eklenir; teknik çizimli PDF teklif WhatsApp'tan gider.</p></li>
</ol>

<h2>Hesaplanan sistemler</h2>
<ul class="izgara">{sis}</ul>

<h2>Bayiye kazandırdıkları</h2>
<ul>
<li><strong>Hız:</strong> keşif sırasında, müşterinin yanında telefondan fiyat verirsiniz.</li>
<li><strong>Hatasız malzeme:</strong> formüller elle değil, maliyet analizi dosyalarından birebir aktarıldı ve dosyaların kendi örnek değerleriyle karşılaştırılarak test edildi.</li>
<li><strong>Güncel fiyat:</strong> liste merkezden güncellenir; her bayinin ayrı Excel taşıması gerekmez.</li>
<li><strong>Kendi kârınız:</strong> iskonto, montaj ve marj tamamen sizin kararınız; müşteri yalnızca teklif fiyatını görür.</li>
<li><strong>Tek yerde takip:</strong> onaylanan teklif müşterinin cari hesabına geçer; tahsilat, montaj görevi ve bakım hatırlatması aynı uygulamada.</li>
</ul>

<h2>Nasıl başlarım?</h2>
<ol>
<li><a href="/register">Ücretsiz hesap açın</a> (web, iPhone veya Android).</li>
<li>Firma kurulumunda <strong>"Evet, Albert Genau bayisiyim"</strong> seçeneğini işaretleyin.</li>
<li>Bayiliğiniz doğrulanınca Albert Genau modülü hesabınızda açılır; ilk teklifinizi hazırlayın.</li>
</ol>
<p>Sorularınız için: <strong>{DESTEK_EPOSTA}</strong></p>

{sss_html(AG_SSS)}
{cta("Albert Genau teklifinizi bugün hazırlayın", "Ücretsiz hesap açın, kurulumda Albert Genau bayisi olduğunuzu işaretleyin.")}
<p class="kucuk">Albert Genau ve ürün adları ilgili marka sahiplerine aittir. Anında Teklif bağımsız bir teklif uygulamasıdır; Albert Genau modülü bayilerin teklif hazırlamasını kolaylaştırmak için geliştirilmiştir. Diğer pergola ve gölgelendirme sistemleri için <a href="/sektor/pergola-golgelendirme-teklifi.html">pergola ve gölgelendirme teklifi</a> sayfasına bakın.</p>
</div>"""

#!/usr/bin/env python3
# Statik SEO/GEO katmanını üretir. frontend klasöründen çalıştırın:
#   python3 scripts/seo/uret.py
# Üretilenler (public/ altında, hepsi git'e girer):
#   index.html (Expo web şablonu + JS'siz okunabilir ana sayfa içeriği),
#   ozellikler.html, fiyatlar.html, sss.html, rehber/*.html, seo.css,
#   robots.txt, sitemap.xml, llms.txt, llms-full.txt, sablon/fiyat-teklifi-sablonu.xlsx
# og.png ayrıca scripts/seo/og.html'den Chrome ile çekilir (bkz. README notu uret.py sonunda).
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from ortak import (AD, ALT, APP_ID, DESTEK_EPOSTA, GUNCELLEME, ORG_ID, PLANLAR, SITE, UCRETSIZ_TEKLIF, UST,
                   cta, e, html_metne, kirinti, ld, kurulus, sayfa, sss_html, sss_sema, tl, uygulama)
from yazilar import YAZILAR
from sektorler import SEKTORLER
from araclar import ARAC_CSS, KDV_GOVDE, TEKLIF_OLUSTUR_GOVDE

KOK = os.path.join(os.path.dirname(__file__), "..", "..", "public")


def yaz(yol, icerik, ikili=False):
    tam = os.path.join(KOK, yol)
    os.makedirs(os.path.dirname(tam), exist_ok=True)
    with open(tam, "wb" if ikili else "w", **({} if ikili else {"encoding": "utf-8"})) as f:
        f.write(icerik)


OZELLIKLER = [
    ("Profesyonel PDF teklifler", "Klasik, modern, kurumsal ve daha fazla şablondan seçin; logonuz ve firma bilgilerinizle saniyeler içinde PDF fiyat teklifi oluşturun."),
    ("WhatsApp ile tek dokunuşta gönderim", "Teklifi WhatsApp'tan doğrudan müşterinize gönderin; e-posta ve indirme seçenekleri de hazır."),
    ("Teklif durumu ve müşteri geçmişi", "Tüm müşterilerinizi, geçmiş tekliflerinizi ve durumlarını (onaylandı, beklemede, reddedildi) tek listede takip edin."),
    ("Kasa, tahsilat ve cari hesap", "Gelir-gider kayıtlarını tutun; müşteri bazında alacak-borç durumunu ve cari hesapları anlık görün."),
    ("Katalog ve ölçüye göre fiyat", "Ürün ve hizmetlerinizi katalogda saklayın; en-boy ve metraja göre fiyatı otomatik hesaplayan yapılandırıcıyı kullanın."),
    ("Ekip yönetimi", "Personelinizi davet edin, yetkilerini belirleyin, ekip içi sohbetle iletişimi uygulamada tutun."),
    ("Türkçe, İngilizce, İtalyanca", "Uygulamayı ve teklifleri kendi dilinizde ya da müşterinizin dilinde hazırlayın."),
    ("Web, iOS ve Android", "Sahada telefondan, ofiste bilgisayardan aynı hesapla çalışın; verileriniz bulutta."),
]

KIMLER = ["Tadilat ve dekorasyon ustaları", "Perde, pergola ve gölgelendirme bayileri", "Alüminyum, PVC ve cam doğramacılar",
          "Teknik servisler", "Mobilya ve mutfak imalatçıları", "Ajanslar ve serbest çalışanlar", "Toptancılar ve satış ekipleri"]

ADIMLAR = [
    ("Kalemleri seçin", "Kataloğunuzdan ürün/hizmet seçin veya ölçüleri girin; yapılandırıcı fiyatı otomatik hesaplasın."),
    ("PDF otomatik oluşsun", "Logonuz ve firma bilgilerinizle hazırlanan PDF teklifi saniyeler içinde görün."),
    ("WhatsApp'tan gönderin", "Tek dokunuşla müşterinize iletin, durumunu (onaylandı/bekliyor) tek yerden takip edin."),
]

k0, h0, y0, l0 = PLANLAR[0]
GENEL_SSS = [
    ("Anında Teklif nedir?", f"Anında Teklif; ustaların, bayilerin ve küçük işletmelerin saniyeler içinde logolu PDF fiyat teklifi hazırlayıp WhatsApp ile göndermesini, müşteri, cari hesap, kasa ve tahsilatı aynı yerde takip etmesini sağlayan bir teklif hazırlama uygulamasıdır. Web tarayıcısında, iOS ve Android'de çalışır."),
    ("Anında Teklif ücretsiz mi?", f"Evet, ücretsiz planla kredi kartı girmeden ayda {UCRETSIZ_TEKLIF} teklif hazırlayabilirsiniz. Sınırsız kullanım için {k0} ekiplerde haftalık {tl(h0)} veya yıllık {tl(y0)} abonelik vardır. Ayrıntılar <a href=\"/fiyatlar.html\">fiyatlar</a> sayfasında."),
    ("Teklifleri WhatsApp'tan gönderebilir miyim?", "Evet. Teklif kaydedildiğinde PDF otomatik oluşur ve tek dokunuşla müşterinin WhatsApp'ına gönderilir. E-posta ve indirme seçenekleri de vardır."),
    ("Telefondan kullanılabilir mi?", "Evet. Anında Teklif web tarayıcısında, iPhone/iPad ve Android'de çalışır; aynı hesapla tüm cihazlarda aynı verilere erişirsiniz."),
    ("Ekibimle birlikte kullanabilir miyim?", "Evet. Personelinizi davet edip yetkilerini belirleyebilirsiniz. Abonelik fiyatı ekipteki kişi sayısına göre belirlenir ve tek abonelik tüm ekibi kapsar."),
    ("Ölçüye göre fiyat hesaplıyor mu?", "Evet. Katalogdaki ürünler için en-boy, metraj veya adede göre fiyatı otomatik hesaplayan yapılandırıcı vardır; perde, cam, doğrama, pergola gibi ölçülü işlerde zaman kazandırır."),
    ("Teklifleri İngilizce hazırlayabilir miyim?", "Evet. Teklifler Türkçe, İngilizce veya İtalyanca hazırlanabilir."),
    ("Verilerim güvende mi?", "Verileriniz bulutta saklanır ve her gece yedeklenir. Kişisel verilerin işlenmesi hakkında ayrıntılar <a href=\"/privacy\">gizlilik politikasında</a>."),
]


# ---------------------------------------------------------------- ana sayfa
def ana_icerik():
    oz = "".join(f"<li><h3>{e(b)}</h3><p>{e(a)}</p></li>" for b, a in OZELLIKLER)
    ad = "".join(f"<li><span>{i + 1}</span><h3>{e(b)}</h3><p>{e(a)}</p></li>" for i, (b, a) in enumerate(ADIMLAR))
    sk = "".join(f'<li><a href="/sektor/{x["slug"]}.html">{e(x["ad"])}</a></li>' for x in SEKTORLER)
    rh = "".join(f'<li><a href="/rehber/{y["slug"]}.html">{e(y["h1"][0].upper() + y["h1"][1:])}</a></li>' for y in YAZILAR[:6])
    return f"""<div id="seo-icerik">
{UST}
<main>
<section class="kahraman"><div class="kap">
<p class="rozet">Teklif hazırlama programı</p>
<h1>Saniyeler içinde profesyonel fiyat teklifi hazırlayın</h1>
<p class="giris-metni">PDF teklif oluşturun, WhatsApp ile paylaşın; müşterilerinizi, cari hesaplarınızı ve tahsilatlarınızı tek yerden yönetin. Anında Teklif ustalar, bayiler ve küçük işletmeler için web, iOS ve Android'de çalışır.</p>
<p><a class="dugme buyuk" href="/register">Ücretsiz başla</a> <a class="dugme ikincil buyuk" href="/login">Giriş yap</a></p>
<p class="kucuk">Kredi kartı gerekmez · Ücretsiz planda ayda {UCRETSIZ_TEKLIF} teklif</p>
</div></section>
<section class="kap"><h2>3 adımda teklif hazır</h2><ol class="adimlar">{ad}</ol></section>
<section class="kap" id="ozellikler"><h2>Tek uygulamada hepsi bir arada</h2><ul class="izgara">{oz}</ul><p><a href="/ozellikler.html">Tüm özellikler →</a></p></section>
<section class="kap"><h2>Sektörünüze göre teklif örnekleri</h2><ul class="etiketler">{sk}</ul><p><a href="/sektorler.html">Tüm sektörler →</a></p></section>
<section class="kap"><h2>Ücretsiz araçlar</h2><ul class="liste"><li><a href="/teklif-olustur.html">Online fiyat teklifi oluşturucu</a> — kayıt olmadan PDF teklif hazırlayın</li><li><a href="/kdv-hesaplama.html">KDV hesaplama</a> — KDV dahil ve hariç tutar</li><li><a href="/rehber/fiyat-teklifi-ornegi.html">Fiyat teklifi şablonu (Excel)</a></li></ul></section>
<section class="kap"><h2>Fiyatlar</h2><p>Ücretsiz planda ayda {UCRETSIZ_TEKLIF} teklif. Sınırsız teklif için {k0} ekiplerde <strong>haftalık {tl(h0)}</strong> veya <strong>yıllık {tl(y0)}</strong> (liste fiyatı {tl(l0)}). <a href="/fiyatlar.html">Tüm planlar →</a></p></section>
<section class="kap">{sss_html(GENEL_SSS)}</section>
<section class="kap"><h2>Rehber</h2><ul class="liste">{rh}</ul></section>
<section class="kap">{cta()}</section>
</main>
{ALT}
</div>"""


def ana_sayfa():
    baslik = "Teklif Hazırlama Programı – Anında Teklif | PDF ve WhatsApp"
    aciklama = (f"Saniyeler içinde logolu PDF fiyat teklifi hazırlayın, WhatsApp ile gönderin; müşteri, cari ve "
                f"tahsilatı tek yerden takip edin. Ücretsiz başlayın, ayda {UCRETSIZ_TEKLIF} teklif ücretsiz.")
    graf = {"@context": "https://schema.org", "@graph": [
        kurulus(),
        {"@type": "WebSite", "@id": SITE + "/#site", "url": SITE + "/", "name": AD, "inLanguage": "tr", "publisher": {"@id": ORG_ID}},
        {"@type": "WebPage", "@id": SITE + "/#sayfa", "url": SITE + "/", "name": baslik, "description": aciklama,
         "inLanguage": "tr", "isPartOf": {"@id": SITE + "/#site"}, "about": {"@id": APP_ID}, "dateModified": GUNCELLEME},
        uygulama(),
        sss_sema(GENEL_SSS),
    ]}
    # Expo bu dosyayı web şablonu olarak kullanır: <script> etiketlerini </body>'den
    # önce, favicon'u </head>'den önce kendisi ekler. #root içindeki statik içerik
    # JS'siz okuyan tarayıcılar (yapay zekâ botları, sosyal önizlemeler) için;
    # React ilk çizimde #root'u temizleyip kendi ekranını koyar.
    return f"""<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <title>{e(baslik)}</title>
    <meta name="description" content="{e(aciklama)}" />
    <link rel="canonical" href="{SITE}/" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#0B1220" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="{AD}" />
    <meta property="og:locale" content="tr_TR" />
    <meta property="og:title" content="{e(baslik)}" />
    <meta property="og:description" content="{e(aciklama)}" />
    <meta property="og:url" content="{SITE}/" />
    <meta property="og:image" content="{SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="manifest" href="/manifest.json" />
    <script>
      // Uygulama yolları ve oturumu açık kullanıcılar statik tanıtımı hiç görmesin;
      // /landing dışındaki SPA yollarında kanonik adres o yolun kendisi olsun.
      (function () {{
        var p = location.pathname, d = document.documentElement, oturum = false;
        try {{ oturum = !!localStorage.getItem('session_token_v1'); }} catch (x) {{}}
        if (oturum || (p !== '/' && p !== '/landing')) d.className += ' uygulama';
        if (p !== '/' && p !== '/landing') {{
          var c = document.querySelector('link[rel=canonical]');
          if (c) c.href = '{SITE}' + p;
        }}
      }})();
    </script>
    <style id="expo-reset">
      html, body {{ height: 100%; }}
      body {{ overflow: hidden; margin: 0; background: #0B1220; }}
      #root {{ display: flex; height: 100%; flex: 1; }}
      .uygulama #seo-icerik {{ display: none; }}
      #seo-icerik {{ flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }}
    </style>
    <link rel="stylesheet" href="/seo.css" />
    {ld(graf)}
  </head>
  <body>
    <div id="root">{ana_icerik()}</div>
  </body>
</html>
"""


# ------------------------------------------------------------ diğer sayfalar
def ozellikler_sayfasi():
    oz = "".join(f"<li><h3>{e(b)}</h3><p>{e(a)}</p></li>" for b, a in OZELLIKLER)
    km = "".join(f"<li>{e(k)}</li>" for k in KIMLER)
    govde = f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Özellikler</nav>
<h1>Anında Teklif özellikleri</h1>
<p class="giris-metni">Anında Teklif bir teklif hazırlama programıdır: teklifi hazırlar, PDF'e çevirir, WhatsApp'tan gönderir; onaylanan teklifi müşterinin cari hesabına, tahsilatı kasaya bağlar.</p>
<ul class="izgara">{oz}</ul>
<h2>Teklif akışı</h2>
<ol><li>Müşteriyi seçin veya yeni müşteri ekleyin.</li><li>Kalemleri katalogdan seçin; ölçülü ürünlerde en-boy girin, fiyat otomatik hesaplansın.</li><li>İskonto, KDV, ödeme ve teslim koşullarını ekleyin.</li><li>Şablon seçin; logolu PDF oluşsun.</li><li>WhatsApp, e-posta veya indirme ile gönderin.</li><li>Müşteri onaylayınca durumu "onaylandı" yapın; tutar cari hesaba geçsin.</li><li>Tahsilatları kaydedin; kasa ve müşteri bakiyesi güncellensin.</li></ol>
<h2>Kimler için?</h2><ul class="etiketler">{km}</ul>
{cta()}
</div>"""
    sema = [uygulama(), kirinti([("Ana sayfa", "/"), ("Özellikler", "/ozellikler.html")])]
    return sayfa("/ozellikler.html", "Özellikler – PDF Teklif, WhatsApp, Cari ve Tahsilat | Anında Teklif",
                 "PDF teklif şablonları, WhatsApp ile gönderim, teklif durumu, müşteri cari hesabı, kasa ve tahsilat, ölçüye göre fiyat hesaplama ve ekip yönetimi.",
                 govde, sema)


def fiyatlar_sayfasi():
    satir = "".join(f"<tr><td>{e(k)}</td><td>{tl(h)}</td><td>{tl(y)} <s>{tl(l)}</s></td></tr>" for k, h, y, l in PLANLAR)
    sorular = [
        ("Ücretsiz planda neler var?", f"Ücretsiz planda ayda {UCRETSIZ_TEKLIF} teklif hazırlayabilir, PDF olarak indirip WhatsApp'tan gönderebilirsiniz. Kredi kartı gerekmez."),
        ("Abonelik fiyatı neye göre değişir?", "Fiyat, ekipte uygulamayı kullanan kişi sayısına (firma sahibi + personel) göre belirlenir. Tek abonelik tüm ekibi kapsar."),
        ("Yıllık planın avantajı nedir?", f"{k0} ekiplerde yıllık plan {tl(y0)}'dir; liste fiyatı {tl(l0)} olduğundan haftalık plana göre belirgin indirimlidir."),
        ("Ödeme nasıl yapılır?", "Abonelik ödemesi uygulama içinden kredi veya banka kartıyla güvenli ödeme altyapısı üzerinden yapılır."),
    ]
    govde = f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Fiyatlar</nav>
<h1>Anında Teklif fiyatları</h1>
<p class="giris-metni">Ücretsiz başlayın: ayda {UCRETSIZ_TEKLIF} teklif ücretsiz, kredi kartı gerekmez. Sınırsız teklif için ekip büyüklüğünüze göre haftalık veya yıllık abonelik seçin. Fiyatlar Türk lirasıdır.</p>
<table class="fiyat"><thead><tr><th>Ekip büyüklüğü</th><th>Haftalık</th><th>Yıllık</th></tr></thead><tbody>
<tr><td>Ücretsiz plan</td><td colspan="2">0 TL · ayda {UCRETSIZ_TEKLIF} teklif</td></tr>{satir}</tbody></table>
<p class="kucuk">Güncelleme: {GUNCELLEME}. Fiyatlar uygulamadaki abonelik ekranında gösterilenlerle aynıdır; değişiklik olursa önce orada güncellenir.</p>
{sss_html(sorular)}
{cta()}
</div>"""
    sema = [kirinti([("Ana sayfa", "/"), ("Fiyatlar", "/fiyatlar.html")]), sss_sema(sorular), uygulama()]
    return sayfa("/fiyatlar.html", f"Fiyatlar – Ücretsiz Plan, Haftalık {tl(h0)}'den | Anında Teklif",
                 f"Anında Teklif fiyatları: ücretsiz planda ayda {UCRETSIZ_TEKLIF} teklif. Sınırsız teklif için haftalık {tl(h0)} veya yıllık {tl(y0)}'den başlayan, ekip büyüklüğüne göre abonelik.",
                 govde, sema)


def sss_sayfasi():
    govde = f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › SSS</nav>
<h1>Sık sorulan sorular</h1>
{sss_html(GENEL_SSS, "Anında Teklif hakkında")}
{cta()}
</div>"""
    return sayfa("/sss.html", "Sık Sorulan Sorular | Anında Teklif",
                 "Anında Teklif nedir, ücretsiz mi, WhatsApp'tan teklif gönderilir mi, telefondan ve ekiple kullanılır mı? Merak edilenlerin yanıtları.",
                 govde, [kirinti([("Ana sayfa", "/"), ("SSS", "/sss.html")]), sss_sema(GENEL_SSS)])


def rehber_dizini():
    kart = "".join(f'<li><a href="/rehber/{y["slug"]}.html"><h2>{e(y["h1"][0].upper() + y["h1"][1:])}</h2><p>{e(y["aciklama"])}</p></a></li>' for y in YAZILAR)
    govde = f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Rehber</nav>
<h1>Teklif hazırlama rehberi</h1>
<p class="giris-metni">Fiyat teklifi hazırlama, teklif örnekleri, proforma fatura, cari hesap ve tahsilat takibi üzerine pratik yazılar.</p>
<ul class="kartlar">{kart}</ul>
</div>"""
    liste = {"@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/rehber/{y['slug']}.html", "name": y["baslik"]} for i, y in enumerate(YAZILAR)]}
    return sayfa("/rehber.html", "Teklif Hazırlama Rehberi – Örnekler ve Şablonlar | Anında Teklif",
                 "Fiyat teklifi nasıl hazırlanır, fiyat teklifi örneği ve ücretsiz Excel şablonu, proforma fatura, geçerlilik süresi, cari hesap ve tahsilat takibi.",
                 govde, [kirinti([("Ana sayfa", "/"), ("Rehber", "/rehber.html")]), liste])


AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def tr_tarih(iso):
    y, a, g = iso.split("-")
    return f"{int(g)} {AYLAR[int(a) - 1]} {y}"


def yazi_sayfasi(y):
    yol = f"/rehber/{y['slug']}.html"
    tarih = y.get("tarih", GUNCELLEME)
    # Listedeki komşular: eski yazılar da yenilere bağlantı versin.
    i, n = YAZILAR.index(y), len(YAZILAR)
    ilgili = [YAZILAR[(i + k) % n] for k in (1, 2, -1, -2)]
    ilg = "".join(f'<li><a href="/rehber/{x["slug"]}.html">{e(x["h1"][0].upper() + x["h1"][1:])}</a></li>' for x in ilgili)
    govde = f"""<article class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › <a href="/rehber.html">Rehber</a> › {e(y['h1'])}</nav>
<h1>{e(y['h1'][0].upper() + y['h1'][1:])}</h1>
<p class="kunye">Anında Teklif Ekibi · Güncelleme: <time datetime="{tarih}">{tr_tarih(tarih)}</time></p>
<div class="kisa-cevap"><strong>Kısa cevap:</strong> {y['kisa']}</div>
{y['govde']}
{sss_html(y['sss'])}
{cta()}
<nav class="ilgili" aria-label="İlgili yazılar"><h2>İlgili yazılar</h2><ul class="liste">{ilg}</ul></nav>
</article>"""
    makale = {"@type": "Article", "@id": SITE + yol + "#yazi", "headline": y["baslik"], "description": y["aciklama"],
              "inLanguage": "tr", "datePublished": tarih, "dateModified": tarih,
              "author": {"@type": "Organization", "name": "Anında Teklif Ekibi", "url": SITE + "/"},
              "publisher": {"@id": ORG_ID}, "mainEntityOfPage": SITE + yol, "image": SITE + "/og.png",
              "about": {"@id": APP_ID}}
    return sayfa(yol, y["baslik"], y["aciklama"], govde,
                 [makale, kirinti([("Ana sayfa", "/"), ("Rehber", "/rehber.html"), (y["h1"], yol)]), sss_sema(y["sss"])],
                 og_tur="article")


def sektor_sayfasi(x):
    yol = f"/sektor/{x['slug']}.html"
    xlsx = f"/sablon/{x['slug']}.xlsx"
    satir = "".join(f"<tr><td>{e(a)}</td><td>{e(b)}</td><td>{e(n)}</td></tr>" for a, b, n in x["kalemler"])
    ipu = "".join(f"<li>{e(i)}</li>" for i in x["ipuclari"])
    diger = [y for y in SEKTORLER if y["slug"] != x["slug"]]
    dg = "".join(f'<li><a href="/sektor/{y["slug"]}.html">{e(y["ad"])}</a></li>' for y in diger)
    govde = f"""<article class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › <a href="/sektorler.html">Sektörler</a> › {e(x['ad'])}</nav>
<h1>{e(x['h1'])}</h1>
<p class="kunye">Anında Teklif Ekibi · Güncelleme: <time datetime="{GUNCELLEME}">16 Ekim 2026</time></p>
<div class="kisa-cevap"><strong>Kısa cevap:</strong> {e(x['kisa'])}</div>
<h2>{e(x['ad'])} teklifinde yer alan kalemler</h2>
<table><thead><tr><th>Kalem</th><th>Birim</th><th>Not</th></tr></thead><tbody>{satir}</tbody></table>
<p class="kucuk">Fiyatlar bölgeye, malzemeye ve işin koşullarına göre değiştiği için rakam verilmemiştir.</p>
<h2>Ücretsiz {e(x['ad'].lower())} teklif şablonu</h2>
<p>Bu kalemlerle hazırlanmış, toplam ve KDV'yi kendisi hesaplayan Excel şablonu: <a class="indir" href="{xlsx}" download>{x['slug']}.xlsx</a>. Kayıt olmadan tarayıcıda PDF teklif hazırlamak için <a href="/teklif-olustur.html">online teklif oluşturucuyu</a> kullanabilirsiniz.</p>
<h2>Teklifte unutulmaması gerekenler</h2><ul>{ipu}</ul>
<p>Her teklifte olması gereken genel bilgiler (firma ve müşteri bilgisi, KDV, geçerlilik süresi, ödeme koşulları) için <a href="/rehber/fiyat-teklifi-nasil-hazirlanir.html">fiyat teklifi nasıl hazırlanır</a> rehberine bakın.</p>
<h2>Anında Teklif ile {e(x['ad'].lower())} teklifi</h2>
<p>{e(x['uygulama'])} Teklif logolu PDF olarak oluşur ve WhatsApp'tan tek dokunuşla gönderilir; onaylanan teklif müşterinin cari hesabına geçer.</p>
{sss_html(x['sss'])}
{cta()}
<nav class="ilgili" aria-label="Diğer sektörler"><h2>Diğer sektörler</h2><ul class="etiketler">{dg}</ul></nav>
</article>"""
    makale = {"@type": "Article", "@id": SITE + yol + "#yazi", "headline": x["baslik"], "description": x["aciklama"],
              "inLanguage": "tr", "datePublished": GUNCELLEME, "dateModified": GUNCELLEME,
              "author": {"@type": "Organization", "name": "Anında Teklif Ekibi", "url": SITE + "/"},
              "publisher": {"@id": ORG_ID}, "mainEntityOfPage": SITE + yol, "image": SITE + "/og.png", "about": {"@id": APP_ID}}
    return sayfa(yol, x["baslik"], x["aciklama"], govde,
                 [makale, kirinti([("Ana sayfa", "/"), ("Sektörler", "/sektorler.html"), (x["ad"], yol)]), sss_sema(x["sss"])],
                 og_tur="article")


def sektor_dizini():
    kart = "".join(f'<li><a href="/sektor/{x["slug"]}.html"><h2>{e(x["ad"])}</h2><p>{e(x["aciklama"])}</p></a></li>' for x in SEKTORLER)
    govde = f"""<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Sektörler</nav>
<h1>Sektörlere göre teklif örnekleri ve şablonları</h1>
<p class="giris-metni">Her sektörün teklifinde farklı kalemler ve birimler kullanılır. Sektörünüzü seçin; örnek kalem listesini, ipuçlarını ve ücretsiz Excel şablonunu alın. Genel bir örnek için <a href="/rehber/tadilat-teklif-ornegi.html">tadilat teklif örneği</a> ve <a href="/rehber/fiyat-teklifi-ornegi.html">fiyat teklifi örneği</a> sayfalarına bakın.</p>
<ul class="kartlar">{kart}</ul>
{cta()}
</div>"""
    liste = {"@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/sektor/{x['slug']}.html", "name": x["baslik"]} for i, x in enumerate(SEKTORLER)]}
    return sayfa("/sektorler.html", "Sektörlere Göre Teklif Örnekleri ve Excel Şablonları | Anında Teklif",
                 "Perde, pergola, doğrama, cam balkon, inşaat, tadilat, teknik servis, su arıtma, klima ve daha fazla sektör için teklif örnekleri, kalem listeleri ve ücretsiz Excel şablonları.",
                 govde, [kirinti([("Ana sayfa", "/"), ("Sektörler", "/sektorler.html")]), liste])


def arac_sayfasi(yol, baslik, aciklama, govde, ad, sss=None):
    app = {"@type": "WebApplication", "@id": SITE + yol + "#arac", "name": ad, "url": SITE + yol, "applicationCategory": "BusinessApplication",
           "operatingSystem": "Web", "isAccessibleForFree": True, "inLanguage": "tr", "publisher": {"@id": ORG_ID},
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "TRY"}}
    sema = [app, kirinti([("Ana sayfa", "/"), (ad, yol)])]
    if sss:
        sema.append(sss_sema(sss)); govde += f'<div class="kap dar">{sss_html(sss)}</div>'
    return sayfa(yol, baslik, aciklama, govde, sema)


TEKLIF_SSS = [
    ("Online teklif oluşturucu ücretsiz mi?", "Evet, kayıt olmadan ve ücretsiz kullanılır. Bilgileriniz sunucuya gönderilmez, yalnızca kendi tarayıcınızda saklanır."),
    ("Teklifi PDF olarak nasıl indiririm?", "\"PDF olarak indir\" düğmesine basın ve açılan yazdırma penceresinde hedef olarak \"PDF olarak kaydet\"i seçin. Telefonda paylaş menüsünden de PDF kaydedebilirsiniz."),
    ("Logomu ekleyebilir miyim?", "Evet. Logo dosyanızı seçtiğinizde teklifin üst kısmına eklenir; dosya cihazınızdan çıkmaz."),
    ("Teklifleri kaydedip müşteriye WhatsApp'tan gönderebilir miyim?", "Online araç tek teklif içindir. Teklifleri saklamak, müşteriye WhatsApp'tan göndermek ve onay-tahsilat takibi için ücretsiz Anında Teklif hesabı açabilirsiniz."),
]
KDV_SSS = [
    ("KDV dahil fiyattan KDV nasıl çıkarılır?", "KDV dahil tutar (1 + KDV oranı)'na bölünür: %20 KDV'de 1.200 ÷ 1,20 = 1.000 TL KDV hariç tutardır; aradaki 200 TL KDV'dir."),
    ("Türkiye'de KDV oranları nedir?", "Genel oran %20, indirimli oranlar %10 ve %1'dir. Hangi oranın uygulanacağı mal veya hizmete göre değişir."),
]


# ------------------------------------------------------ makine okur dosyalar
STATIK = (["/", "/ozellikler.html", "/fiyatlar.html", "/teklif-olustur.html", "/kdv-hesaplama.html", "/sektorler.html", "/sss.html", "/rehber.html"]
          + [f"/sektor/{x['slug']}.html" for x in SEKTORLER] + [f"/rehber/{y['slug']}.html" for y in YAZILAR])


def robots():
    return f"""# Anında Teklif — tüm arama motorları ve yapay zekâ tarayıcıları tanıtım ve rehber sayfalarını okuyabilir.
User-agent: *
Allow: /
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email
Disallow: /join
Disallow: /wizard
Disallow: /splash
Disallow: /preview
Disallow: /subscription-result

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: {SITE}/sitemap.xml
"""


def sitemap():
    oncelik = {"/teklif-olustur.html": "0.9", "/sektorler.html": "0.8", "/kdv-hesaplama.html": "0.7", "/": "1.0", "/fiyatlar.html": "0.9", "/ozellikler.html": "0.9", "/rehber.html": "0.8", "/sss.html": "0.7"}
    tarih = {f"/rehber/{y['slug']}.html": y.get("tarih", GUNCELLEME) for y in YAZILAR}
    tarih["/rehber.html"] = max(tarih.values())
    url = "".join(f"<url><loc>{SITE}{y}</loc><lastmod>{tarih.get(y, GUNCELLEME)}</lastmod><priority>{oncelik.get(y, '0.7')}</priority></url>\n" for y in STATIK)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{url}</urlset>\n'


def llms():
    satir = "\n".join(f"- [{y['baslik']}]({SITE}/rehber/{y['slug']}.html): {y['aciklama']}" for y in YAZILAR)
    plan = "\n".join(f"- {k}: haftalık {tl(h)}, yıllık {tl(y)} (liste fiyatı {tl(l)})" for k, h, y, l in PLANLAR)
    oz = "\n".join(f"- **{b}:** {a}" for b, a in OZELLIKLER)
    sek = "\n".join(f"- [{x['baslik']}]({SITE}/sektor/{x['slug']}.html): {x['aciklama']}" for x in SEKTORLER)
    return f"""# Anında Teklif

> Anında Teklif ({SITE}), Türkiye'deki ustalar, bayiler ve küçük işletmeler için bir teklif hazırlama programıdır: saniyeler içinde logolu PDF fiyat teklifi hazırlar, WhatsApp ile gönderir; müşteri, cari hesap, kasa ve tahsilat takibini aynı yerde toplar. Web, iOS ve Android'de çalışır; Türkçe, İngilizce ve İtalyanca destekler. Ücretsiz planda ayda {UCRETSIZ_TEKLIF} teklif hazırlanabilir.

## Özellikler
{oz}

## Fiyatlar (Türk lirası, {GUNCELLEME})
- Ücretsiz plan: ayda {UCRETSIZ_TEKLIF} teklif, kredi kartı gerekmez
{plan}
- Fiyat ekipteki kişi sayısına göre belirlenir; tek abonelik tüm ekibi kapsar.

## Sayfalar
- [Ana sayfa]({SITE}/): Ürün tanıtımı ve hesap açma
- [Özellikler]({SITE}/ozellikler.html): Tüm özellikler ve teklif akışı
- [Fiyatlar]({SITE}/fiyatlar.html): Planlar ve abonelik fiyatları
- [Sık sorulan sorular]({SITE}/sss.html)
- [Gizlilik politikası]({SITE}/privacy)

## Rehber
{satir}

## Ücretsiz araçlar
- [Online fiyat teklifi oluşturucu]({SITE}/teklif-olustur.html): Kayıt olmadan tarayıcıda PDF teklif hazırlama
- [KDV hesaplama]({SITE}/kdv-hesaplama.html): KDV dahil/hariç tutar hesaplama

## Sektörel teklif örnekleri
{sek}

## Kaynaklar
- [Ücretsiz fiyat teklifi şablonu (Excel)]({SITE}/sablon/fiyat-teklifi-sablonu.xlsx)
- [Tüm içerik tek dosyada]({SITE}/llms-full.txt)

## İletişim
- E-posta: {DESTEK_EPOSTA}
- Instagram: https://www.instagram.com/anindateklif.co/
- YouTube: https://www.youtube.com/@anindateklif
- LinkedIn: https://www.linkedin.com/company/anindateklif

## English summary
Anında Teklif ("Instant Quote") is a quoting app for tradespeople, dealers and small businesses in Turkey: create branded PDF price quotes in seconds, send them via WhatsApp, and track customers, accounts receivable, cash and collections in one place. Web, iOS and Android; Turkish, English and Italian. Free plan: {UCRETSIZ_TEKLIF} quotes per month; paid plans from {h0} TRY/week or {y0} TRY/year for teams of up to 5.
"""


def llms_full():
    parca = [llms(), "\n---\n\n# Sık sorulan sorular\n"]
    parca += [f"\n## {s}\n{html_metne(c)}\n" for s, c in GENEL_SSS]
    import re
    for y in YAZILAR:
        metin = y["govde"]
        metin = re.sub(r"<h2>(.*?)</h2>", r"\n## \1\n", metin)
        metin = re.sub(r"<li>", "- ", metin)
        metin = re.sub(r"</(p|li|tr|div)>", "\n", metin)
        metin = re.sub(r"</t[dh]>", " | ", metin)
        metin = html_metne(metin)
        metin = re.sub(r"\n{3,}", "\n\n", metin)
        sss = "".join(f"\n**{s}** {html_metne(c)}\n" for s, c in y["sss"])
        parca.append(f"\n---\n\n# {y['baslik']}\nKaynak: {SITE}/rehber/{y['slug']}.html\n\n**Kısa cevap:** {html_metne(y['kisa'])}\n{metin}\n{sss}")
    for x in SEKTORLER:
        kal = "\n".join(f"- {a} ({b}){' — ' + n if n else ''}" for a, b, n in x["kalemler"])
        ipu = "\n".join(f"- {i}" for i in x["ipuclari"])
        sss = "".join(f"\n**{q}** {html_metne(c)}\n" for q, c in x["sss"])
        parca.append(f"\n---\n\n# {x['baslik']}\nKaynak: {SITE}/sektor/{x['slug']}.html\n\n**Kısa cevap:** {x['kisa']}\n\n## Kalemler\n{kal}\n\n## Dikkat edilecekler\n{ipu}\n\n{x['uygulama']}\n{sss}")
    return "".join(parca)


def excel_sablonu(kalemler=None, baslik="FİYAT TEKLİFİ", kaynak="/rehber/fiyat-teklifi-ornegi.html"):
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    wb = Workbook()
    ws = wb.active
    ws.title = "Fiyat Teklifi"
    ince = Side(style="thin", color="CBD5E1")
    kenar = Border(left=ince, right=ince, top=ince, bottom=ince)
    for sut, gen in zip("ABCDEF", [5, 44, 10, 10, 15, 16]):
        ws.column_dimensions[sut].width = gen
    ws["A1"] = "FİRMA ADINIZ"; ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = "Adres · Telefon · E-posta · Vergi dairesi / No"
    ws["E1"] = baslik; ws["E1"].font = Font(bold=True, size=14, color="2563EB")
    ws["E2"] = "Teklif no:"; ws["F2"] = "2026-0001"
    ws["E3"] = "Tarih:"; ws["F3"] = "=TODAY()"; ws["F3"].number_format = "DD.MM.YYYY"
    ws["A5"] = "Sayın:"; ws["B5"] = "Müşteri adı / unvanı"
    ws["A6"] = "Konu:"; ws["B6"] = "Teklifin konusu"
    bas = ["#", "Açıklama", "Miktar", "Birim", "Birim fiyat (TL)", "Tutar (TL)"]
    for i, b in enumerate(bas):
        h = ws.cell(row=8, column=i + 1, value=b)
        h.font = Font(bold=True, color="FFFFFF"); h.fill = PatternFill("solid", fgColor="1E3A8A"); h.border = kenar
        h.alignment = Alignment(horizontal="center")
    for r in range(9, 24):
        ws.cell(row=r, column=1, value=r - 8)
        ws.cell(row=r, column=6, value=f'=IF(C{r}="","",C{r}*E{r})')
        for c in range(1, 7):
            ws.cell(row=r, column=c).border = kenar
        ws.cell(row=r, column=5).number_format = "#,##0.00"
        ws.cell(row=r, column=6).number_format = "#,##0.00"
    if kalemler:
        for i, (ad, birim, _) in enumerate(kalemler[:15]):
            ws.cell(row=9 + i, column=2, value=ad); ws.cell(row=9 + i, column=4, value=birim)
    else:
        ws["B9"] = "Örnek kalem — silip kendi kaleminizi yazın"; ws["C9"] = 1; ws["D9"] = "adet"; ws["E9"] = 1000
    ws["E25"] = "Ara toplam"; ws["F25"] = "=SUM(F9:F23)"
    ws["D26"] = "KDV %"; ws["E26"] = 20; ws["F26"] = "=F25*E26/100"
    ws["E27"] = "GENEL TOPLAM"; ws["F27"] = "=F25+F26"
    for h in ("F25", "F26", "F27"):
        ws[h].number_format = "#,##0.00"
    ws["E27"].font = Font(bold=True); ws["F27"].font = Font(bold=True)
    notlar = ["Bu teklif düzenleme tarihinden itibaren 15 gün geçerlidir.",
              "Ödeme: %40 sipariş onayında, %60 teslimde.",
              "Teslim / montaj süresi: sipariş onayından itibaren ... iş günü.",
              "Teklife dahil olmayanlar: ...",
              "Kaşe / İmza:"]
    for i, n in enumerate(notlar):
        ws.cell(row=29 + i, column=1, value=n)
    ws.cell(row=36, column=1, value=f"Bu şablon {SITE}{kaynak} adresinden ücretsiz indirilmiştir. "
                                     "Teklifleri saniyeler içinde PDF olarak hazırlayıp WhatsApp'tan göndermek için: anindateklif.co").font = Font(italic=True, color="64748B", size=9)
    ws.print_area = "A1:F36"
    ws.page_setup.fitToWidth = 1
    b = io.BytesIO(); wb.save(b)
    return b.getvalue()



def karsilastirma_sablonu():
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Border, Font, PatternFill, Side
    wb = Workbook(); ws = wb.active; ws.title = "Karşılaştırma"
    ince = Side(style="thin", color="CBD5E1"); kenar = Border(left=ince, right=ince, top=ince, bottom=ince)
    ws["A1"] = "FİYAT TEKLİFİ KARŞILAŞTIRMA TABLOSU"; ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = "Talep / konu:"; ws["A3"] = "Tarih:"; ws["B3"] = "=TODAY()"; ws["B3"].number_format = "DD.MM.YYYY"
    bas = ["Kalem", "Miktar", "A birim fiyat", "A tutar", "B birim fiyat", "B tutar", "C birim fiyat", "C tutar"]
    for i, (b, gen) in enumerate(zip(bas, [36, 9, 14, 14, 14, 14, 14, 14])):
        h = ws.cell(row=5, column=i + 1, value=b); h.font = Font(bold=True, color="FFFFFF"); h.fill = PatternFill("solid", fgColor="1E3A8A"); h.border = kenar
        ws.column_dimensions[h.column_letter].width = gen
    ws["C4"] = "Tedarikçi A:"; ws["E4"] = "Tedarikçi B:"; ws["G4"] = "Tedarikçi C:"
    for r in range(6, 21):
        for c, kaynak in ((4, "C"), (6, "E"), (8, "G")):
            ws.cell(row=r, column=c, value=f'=IF(OR(B{r}="",{kaynak}{r}=""),"",B{r}*{kaynak}{r})')
        for c in range(1, 9):
            ws.cell(row=r, column=c).border = kenar
            if c > 2: ws.cell(row=r, column=c).number_format = "#,##0.00"
    satirlar = [("Ara toplam", "=SUM({c}6:{c}20)"), ("Nakliye / montaj", ""), ("İskonto", ""), ("Toplam (KDV hariç)", "={c}21+{c}22-{c}23"),
                ("KDV %", ""), ("Toplam (KDV dahil)", "={c}24*(1+{c}25/100)"), ("Ödeme vadesi (gün)", ""), ("Teslim süresi (iş günü)", ""), ("Garanti", ""), ("Not", "")]
    for i, (ad, form) in enumerate(satirlar):
        r = 21 + i; ws.cell(row=r, column=1, value=ad).font = Font(bold=ad.startswith("Toplam"))
        for c in ("D", "F", "H"):
            if form: ws[f"{c}{r}"] = form.format(c=c)
            if ad == "KDV %": ws[f"{c}{r}"] = 20
            ws[f"{c}{r}"].number_format = "#,##0.00"
    ws.cell(row=32, column=1, value=f"Şablon: {SITE}/rehber/fiyat-teklifi-karsilastirma-tablosu.html").font = Font(italic=True, color="64748B", size=9)
    b = io.BytesIO(); wb.save(b); return b.getvalue()


CSS = """:root{--bg:#0B1220;--yumusak:#111A2E;--kart:#1A2338;--cizgi:#243049;--mavi:#3B82F6;--turuncu:#DA7756;--metin:#E2E8F0;--soluk:#94A3B8;--beyaz:#fff}
*{box-sizing:border-box}
#seo-icerik,.statik{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--metin);background:var(--bg)}
.statik{margin:0}
#seo-icerik a,.statik a{color:#93C5FD}
.kap{max-width:1080px;margin:0 auto;padding:0 20px}.kap.dar{max-width:780px}
.ust{position:sticky;top:0;z-index:5;background:rgba(11,18,32,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--cizgi)}
.ust .kap{display:flex;align-items:center;gap:20px;min-height:64px;flex-wrap:wrap}
.marka{display:flex;align-items:center;gap:10px;color:var(--beyaz)!important;text-decoration:none;font-weight:800;font-size:18px}.marka img{border-radius:8px}.marka b{color:var(--turuncu)}
.ust nav{display:flex;gap:18px;flex:1}.ust nav a{white-space:nowrap}.ust nav a,.giris{color:var(--metin)!important;text-decoration:none;font-weight:600;font-size:15px}
.ust-eylem{display:flex;gap:14px;align-items:center}
.dugme{display:inline-block;background:var(--mavi);color:#fff!important;text-decoration:none;font-weight:700;padding:9px 16px;border-radius:10px}
.dugme.buyuk{padding:14px 24px;font-size:17px;border-radius:12px;margin:4px 6px 4px 0}.dugme.ikincil{background:transparent;border:1px solid var(--cizgi)}
h1,h2,h3{color:var(--beyaz);line-height:1.25}h1{font-size:clamp(30px,5vw,48px);margin:28px 0 14px}h2{font-size:clamp(22px,3vw,28px);margin:44px 0 12px}h3{font-size:18px;margin:0 0 6px}
.kahraman{padding:56px 0 24px;background:radial-gradient(60% 80% at 50% 0,rgba(59,130,246,.22),transparent)}
.rozet{display:inline-block;color:var(--turuncu);border:1px solid rgba(218,119,86,.4);border-radius:99px;padding:4px 12px;font-size:13px;font-weight:700;margin:0}
.giris-metni{font-size:19px;color:#CBD5E1;max-width:720px}.kucuk{font-size:13px;color:var(--soluk)}
.izgara{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.izgara li,.adimlar li,.kartlar li a{background:var(--kart);border:1px solid var(--cizgi);border-radius:16px;padding:18px}
.izgara p,.adimlar p{margin:0;color:var(--soluk);font-size:15px}
.adimlar{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.adimlar span{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--mavi);color:#fff;font-weight:800;margin-bottom:8px}
.etiketler{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}.etiketler li{border:1px solid var(--cizgi);border-radius:99px;padding:6px 14px;font-size:14px}
.liste li{margin:6px 0}
.kartlar{list-style:none;padding:0;display:grid;gap:12px}.kartlar li a{display:block;text-decoration:none}.kartlar h2{font-size:19px;margin:0 0 6px}.kartlar p{margin:0;color:var(--soluk);font-size:15px}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:15px;display:block;overflow-x:auto}
th,td{border:1px solid var(--cizgi);padding:9px 11px;text-align:left;vertical-align:top}th{background:var(--yumusak);color:#fff}
table.fiyat{display:table}s{color:var(--soluk);font-size:13px}
.kirinti{font-size:13px;color:var(--soluk);margin-top:22px}.kunye{color:var(--soluk);font-size:14px;margin-top:-6px}
.kisa-cevap{background:rgba(59,130,246,.1);border-left:4px solid var(--mavi);border-radius:10px;padding:14px 16px;margin:18px 0}
.uyari{background:rgba(218,119,86,.1);border-left:4px solid var(--turuncu);padding:10px 14px;border-radius:8px;font-size:14px}
.mesaj{background:#DCF8C6;color:#111;border-radius:12px 12px 12px 2px;padding:12px 14px;margin:10px 0;max-width:560px;font-size:15px}
.ornek-teklif{background:#fff;color:#1E293B;border-radius:14px;padding:22px;margin:14px 0}
.ornek-teklif table{display:table}.ornek-teklif th{background:#1E3A8A}.ornek-teklif td,.ornek-teklif th{border-color:#CBD5E1}.ornek-teklif tfoot td{text-align:right}.ornek-teklif tfoot td:last-child{text-align:left}
.ot-ust{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px}.ot-sag{text-align:right}.ot-not{font-size:13px;color:#475569}
.indir{font-weight:700}
.sss details{background:var(--kart);border:1px solid var(--cizgi);border-radius:12px;margin:8px 0;padding:0 16px}
.sss summary{cursor:pointer;font-weight:700;color:#fff;padding:14px 0}.sss details div{padding:0 0 14px;color:#CBD5E1}
.cta{text-align:center;background:linear-gradient(135deg,#1E3A8A,#0B1220);border:1px solid var(--cizgi);border-radius:20px;padding:30px 20px;margin:44px 0}.cta h2{margin-top:0}
.alt{border-top:1px solid var(--cizgi);margin-top:40px;padding:34px 0 16px;background:var(--yumusak)}
.alt .kap{display:grid;grid-template-columns:2fr 1fr 1.4fr 1fr;gap:24px}.alt h2{font-size:14px;margin:0 0 8px;color:var(--soluk);text-transform:uppercase;letter-spacing:.06em}
.alt a{display:block;margin:4px 0;font-size:14px;text-decoration:none}.alt p{color:var(--soluk);font-size:14px}.telif{display:block!important;font-size:13px;color:var(--soluk);margin-top:20px}
@media (max-width:720px){.ust nav{order:3;flex-basis:100%;overflow-x:auto;padding-bottom:8px}.alt .kap{grid-template-columns:1fr 1fr}.giris-metni{font-size:17px}}
"""


def main():
    yaz("index.html", ana_sayfa())
    yaz("ozellikler.html", ozellikler_sayfasi())
    yaz("fiyatlar.html", fiyatlar_sayfasi())
    yaz("sss.html", sss_sayfasi())
    yaz("rehber.html", rehber_dizini())
    for y in YAZILAR:
        yaz(f"rehber/{y['slug']}.html", yazi_sayfasi(y))
    yaz("sektorler.html", sektor_dizini())
    for x in SEKTORLER:
        yaz(f"sektor/{x['slug']}.html", sektor_sayfasi(x))
        yaz(f"sablon/{x['slug']}.xlsx", excel_sablonu(x["kalemler"], f"{x['ad'].upper()} TEKLİFİ", f"/sektor/{x['slug']}.html"), ikili=True)
    yaz("teklif-olustur.html", arac_sayfasi("/teklif-olustur.html", "Ücretsiz Online Fiyat Teklifi Oluşturucu (PDF) | Anında Teklif",
        "Kayıt olmadan ücretsiz fiyat teklifi hazırlayın: logo ekleyin, kalemleri girin, KDV ve toplam otomatik hesaplansın, PDF olarak indirin.",
        TEKLIF_OLUSTUR_GOVDE, "Online fiyat teklifi oluşturucu", TEKLIF_SSS))
    yaz("kdv-hesaplama.html", arac_sayfasi("/kdv-hesaplama.html", "KDV Hesaplama: KDV Dahil ve Hariç Tutar (%20, %10, %1) | Anında Teklif",
        "KDV dahil fiyattan KDV hariç tutarı, KDV hariç fiyattan KDV dahil tutarı hesaplayın. %20, %10, %1 ve özel oran; formüller ve örnekler.",
        KDV_GOVDE, "KDV hesaplama", KDV_SSS))
    yaz("seo.css", CSS + ARAC_CSS)
    # `serve -s` her uzantısız yolu SPA'ya yönlendirdiği için statik sayfalar .html
    # adresle sunulur; cleanUrls açıkken /x.html → /x 301'i SPA'ya düşürürdü.
    yaz("serve.json", '{\n  "cleanUrls": false\n}\n')
    yaz("robots.txt", robots())
    yaz("sitemap.xml", sitemap())
    yaz("llms.txt", llms())
    yaz("llms-full.txt", llms_full())
    yaz("sablon/fiyat-teklifi-sablonu.xlsx", excel_sablonu(), ikili=True)
    yaz("sablon/fiyat-teklifi-karsilastirma-tablosu.xlsx", karsilastirma_sablonu(), ikili=True)
    print(f"{len(STATIK)} sayfa + robots/sitemap/llms üretildi → {os.path.abspath(KOK)}")


if __name__ == "__main__":
    main()

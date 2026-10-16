# Statik SEO/GEO sayfalarının ortak parçaları: site bilgileri, şablon,
# yapılandırılmış veri (JSON-LD) yardımcıları. Üretim: `python3 scripts/seo/uret.py`
# (frontend klasöründen). Çıktılar public/ altına yazılır; `expo export`
# bunları dist/'e kopyalar, `serve -s` dosya varsa SPA'dan önce onu sunar.
import html
import json

SITE = "https://www.anindateklif.co"
AD = "Anında Teklif"
GUNCELLEME = "2026-10-16"
DESTEK_EPOSTA = "ncagdasm@gmail.com"
ORG_ID = SITE + "/#kurulus"
SOSYAL = [
    "https://www.instagram.com/anindateklif.co/",
    "https://www.youtube.com/@anindateklif",
    "https://www.linkedin.com/company/anindateklif",
]
WEB_ID = SITE + "/#site"
APP_ID = SITE + "/#uygulama"

# backend/server.py SEAT_TIERS ve FREE_MONTHLY_QUOTE_LIMIT ile aynı tutulmalı.
UCRETSIZ_TEKLIF = 5
PLANLAR = [
    # (kişi aralığı, haftalık, yıllık, yıllık liste fiyatı)
    ("1–5 kişi", 50, 2000, 2400),
    ("6–10 kişi", 70, 2800, 3400),
    ("11–30 kişi", 80, 3200, 3900),
    ("31+ kişi", 110, 4400, 5300),
]


def tl(n):
    return f"{n:,.0f}".replace(",", ".") + " TL"


def e(s):
    return html.escape(s, quote=True)


def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "</script>"


def kurulus():
    return {
        "@type": "Organization",
        "@id": ORG_ID,
        "name": AD,
        "alternateName": ["AnındaTeklif", "Aninda Teklif", "anindateklif.co"],
        "url": SITE + "/",
        "logo": {"@type": "ImageObject", "url": SITE + "/icon-512.png", "width": 512, "height": 512},
        "email": DESTEK_EPOSTA,
        "areaServed": "TR",
        "knowsLanguage": ["tr", "en", "it"],
        "description": "Küçük işletmeler, ustalar ve bayiler için teklif hazırlama, müşteri, cari ve tahsilat takibi uygulaması.",
        "sameAs": SOSYAL,
    }


def uygulama():
    teklifler = [{
        "@type": "Offer", "name": "Ücretsiz", "price": "0", "priceCurrency": "TRY",
        "description": f"Ayda {UCRETSIZ_TEKLIF} teklif, kredi kartı gerekmez.",
    }]
    k, h, y, _ = PLANLAR[0]
    teklifler.append({"@type": "Offer", "name": f"Haftalık ({k})", "price": str(h), "priceCurrency": "TRY",
                      "priceSpecification": {"@type": "UnitPriceSpecification", "price": str(h), "priceCurrency": "TRY", "billingDuration": "P1W"}})
    teklifler.append({"@type": "Offer", "name": f"Yıllık ({k})", "price": str(y), "priceCurrency": "TRY",
                      "priceSpecification": {"@type": "UnitPriceSpecification", "price": str(y), "priceCurrency": "TRY", "billingDuration": "P1Y"}})
    return {
        "@type": "SoftwareApplication",
        "@id": APP_ID,
        "name": AD,
        "url": SITE + "/",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Teklif hazırlama ve müşteri takip programı",
        "operatingSystem": "Web, iOS, Android",
        "inLanguage": ["tr", "en", "it"],
        "publisher": {"@id": ORG_ID},
        "description": ("Saniyeler içinde logolu PDF fiyat teklifi hazırlayıp WhatsApp ile gönderen; müşteri, "
                        "cari hesap, kasa ve tahsilat takibini aynı yerde toplayan teklif hazırlama programı."),
        "featureList": [
            "Logolu PDF fiyat teklifi (klasik, modern, kurumsal şablonlar)",
            "WhatsApp, e-posta ve indirme ile teklif paylaşma",
            "Teklif durumu takibi: onaylandı, beklemede, reddedildi",
            "Müşteri kartları ve teklif geçmişi",
            "Kasa, tahsilat ve müşteri cari hesap takibi",
            "Ürün/hizmet kataloğu ve ölçüye göre otomatik fiyat hesaplayan yapılandırıcı",
            "Personel daveti, yetkilendirme ve ekip içi sohbet",
            "Türkçe, İngilizce ve İtalyanca teklif",
        ],
        "offers": teklifler,
    }


def kirinti(ogeler):
    """ogeler: [(ad, yol)] — ilk öğe ana sayfa."""
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": ad, "item": SITE + yol}
            for i, (ad, yol) in enumerate(ogeler)
        ],
    }


def sss_sema(sorular):
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": s, "acceptedAnswer": {"@type": "Answer", "text": html_metne(c)}}
            for s, c in sorular
        ],
    }


def html_metne(s):
    import re
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def sss_html(sorular, baslik="Sık sorulan sorular"):
    parca = "".join(f"<details><summary>{e(s)}</summary><div>{c}</div></details>" for s, c in sorular)
    return f'<section class="sss" id="sss"><h2>{e(baslik)}</h2>{parca}</section>'


UST = """<header class="ust"><div class="kap">
<a class="marka" href="/" aria-label="Anında Teklif ana sayfa"><img src="/icon-192.png" alt="" width="32" height="32"><span>Anında <b>Teklif</b></span></a>
<nav aria-label="Ana menü"><a href="/ozellikler.html">Özellikler</a><a href="/fiyatlar.html">Fiyatlar</a><a href="/sektorler.html">Sektörler</a><a href="/rehber.html">Rehber</a><a href="/teklif-olustur.html">Teklif oluştur</a></nav>
<div class="ust-eylem"><a class="giris" href="/login">Giriş</a><a class="dugme" href="/register">Ücretsiz başla</a></div>
</div></header>"""

ALT = """<footer class="alt"><div class="kap">
<div><a class="marka" href="/"><img src="/icon-192.png" alt="" width="28" height="28"><span>Anında <b>Teklif</b></span></a>
<p>Ustalar, bayiler ve küçük işletmeler için teklif hazırlama, müşteri ve tahsilat takip uygulaması. Web, iOS ve Android.</p></div>
<div><h2>Ürün</h2><a href="/ozellikler.html">Özellikler</a><a href="/fiyatlar.html">Fiyatlar</a><a href="/sss.html">Sık sorulan sorular</a><a href="/register">Ücretsiz hesap aç</a></div>
<div><h2>Rehber</h2><a href="/rehber/fiyat-teklifi-nasil-hazirlanir.html">Fiyat teklifi nasıl hazırlanır?</a><a href="/rehber/fiyat-teklifi-ornegi.html">Fiyat teklifi örneği</a><a href="/rehber/proforma-fatura-nedir.html">Proforma fatura nedir?</a><a href="/rehber.html">Tüm yazılar</a></div>
<div><h2>Ücretsiz araçlar</h2><a href="/teklif-olustur.html">Online teklif oluşturucu</a><a href="/kdv-hesaplama.html">KDV hesaplama</a><a href="/sektorler.html">Sektörel teklif örnekleri</a></div>
<div><h2>İletişim</h2><a href="mailto:%s">%s</a><a href="/privacy">Gizlilik politikası</a><a href="https://www.instagram.com/anindateklif.co/" rel="me">Instagram</a><a href="https://www.youtube.com/@anindateklif" rel="me">YouTube</a><a href="https://www.linkedin.com/company/anindateklif" rel="me">LinkedIn</a></div>
</div><p class="telif kap">© 2026 Anında Teklif</p></footer>""" % (DESTEK_EPOSTA, DESTEK_EPOSTA)


def sayfa(yol, baslik, aciklama, govde, semalar, og_tur="website", ek_bas=""):
    kanonik = SITE + yol
    graf = {"@context": "https://schema.org", "@graph": [kurulus(), {"@type": "WebSite", "@id": WEB_ID, "url": SITE + "/", "name": AD, "inLanguage": "tr", "publisher": {"@id": ORG_ID}}] + semalar}
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(baslik)}</title>
<meta name="description" content="{e(aciklama)}">
<link rel="canonical" href="{kanonik}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0B1220">
<meta property="og:type" content="{og_tur}">
<meta property="og:site_name" content="{AD}">
<meta property="og:locale" content="tr_TR">
<meta property="og:title" content="{e(baslik)}">
<meta property="og:description" content="{e(aciklama)}">
<meta property="og:url" content="{kanonik}">
<meta property="og:image" content="{SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.json">
<link rel="stylesheet" href="/seo.css">
{ek_bas}{ld(graf)}
</head>
<body class="statik">
{UST}
<main>{govde}</main>
{ALT}
</body>
</html>
"""


def cta(baslik="İlk teklifinizi şimdi hazırlayın", alt=f"Ücretsiz hesapla ayda {UCRETSIZ_TEKLIF} teklif, kredi kartı gerekmez."):
    return f'<aside class="cta"><h2>{e(baslik)}</h2><p>{e(alt)}</p><a class="dugme buyuk" href="/register">Ücretsiz başla</a></aside>'

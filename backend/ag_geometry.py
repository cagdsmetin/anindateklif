"""Cizim geometrisi -- fiyat hesabindan BAGIMSIZ.

Bu modul yalnizca "ne cizilecek" sorusunu yanitlar: girilen olculerden
kanat / modul / panel bolunmesini turetir. albert_genau_calc.py'deki
Excel-dogrulanmis fiyat formullerine HIC dokunmaz; orasi fiyatin tek
dogruluk kaynagi olarak kalir. Buradan cikan model iki yeri birden besler:
ekrandaki canli cizim ve teklife eklenen teknik cizim -- ikisi ayni
sayilari gostersin diye tek yerden uretilir.

Uretilen model her zaman ayni zarfi kullanir:

    {'kind': 'cephe'|'modul'|'giyotin', ...alanlar..., 'uyarilar': [...]}

`uyarilar` kullaniciya gosterilecek, hesabi bozmayan notlardir (ornegin
"kanat sayisi onerilenden az").

KAPSAM NOTU -- cam olculeri: bir kanadin gercek cam olcusu seri bazinda
profil dusumu gerektirir (kasa payi, kanat bindirmesi, alt/ust ray). Bu
degerler Albert Genau'nun teknik cizimlerinde var, bizde HENUZ YOK. O
yuzden `profil_dusumu` verilmedigi surece cam olculeri None doner ve
arayuz sadece kanat bolunmesini gosterir -- uydurma bir olcu uretmektense
hic gostermemek dogru: o sayi cam siparisine gidiyor.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import math

# Bir kanadin varsayilan azami eksen genisligi. Uretici tavsiyesi disinda
# kalan genislikler kanadin sarkmasina / tekerlek yuklenmesine yol acar.
VARSAYILAN_MAX_KANAT_MM = 600.0

# Iki cephe arasindaki acinin gecerli degerleri. 'duvar' = cephe orada
# biter (komsu cephe yok); sayisal degerler ic acidir.
DUVAR = 'duvar'
GECERLI_ACILAR = (90.0, 135.0, 225.0, 270.0)

# Cephenin kanatlarinin nereye toplandigi. Kanat tiplerini bu belirler.
TOPLANMA_YONLERI = (
    'sola',          # tum kanatlar sola kayar, en soldaki kapi kanadi
    'saga',          # tum kanatlar saga kayar, en sagdaki kapi kanadi
    'sagavesola',    # ortadan bolunur, yarisi sola yarisi saga
    'sola_kaydir',   # sola kayar ama kapi kanadi yok
    'saga_kaydir',   # saga kayar ama kapi kanadi yok
    'sabit',         # hicbir kanat hareket etmez
)

KANAT_TIPLERI = (
    'sabit', 'sola_kayar', 'saga_kayar', 'sola_acilir', 'saga_acilir', 'dograma',
)


class GeometriHatasi(ValueError):
    """Cizilemeyecek bir girdi -- ornegin negatif genislik."""


@dataclass
class ProfilDusumu:
    """Bir serinin cam olcusunu kanat olcusunden turetmek icin gereken
    sabitler. Hepsi mm. Albert Genau'dan gelene kadar None birakilir."""
    yukseklik_dusumu_mm: float          # alt+ust ray/kasa toplam payi
    kanat_bindirme_mm: float            # komsu iki kanadin ust uste bindigi pay
    yan_pay_mm: float                   # en sol ve en sagdaki kasa payi (tek taraf)

    @classmethod
    def from_dict(cls, d: Optional[Dict[str, Any]]) -> Optional['ProfilDusumu']:
        if not d:
            return None
        try:
            return cls(
                yukseklik_dusumu_mm=float(d['yukseklikDusumuMm']),
                kanat_bindirme_mm=float(d.get('kanatBindirmeMm', 0.0)),
                yan_pay_mm=float(d.get('yanPayMm', 0.0)),
            )
        except (KeyError, TypeError, ValueError):
            return None


def onerilen_kanat_sayisi(genislik_mm: float, max_kanat_mm: float = VARSAYILAN_MAX_KANAT_MM) -> int:
    """Bir cephe genisligini azami kanat genisligine bolerek kanat sayisi
    onerir. Bugun bayinin kafadan yaptigi islem bu.

    >>> onerilen_kanat_sayisi(4000)
    7
    >>> onerilen_kanat_sayisi(2200)
    4
    """
    g = _pozitif(genislik_mm, 'Genislik')
    m = max_kanat_mm if max_kanat_mm and max_kanat_mm > 0 else VARSAYILAN_MAX_KANAT_MM
    return max(1, math.ceil(g / m))


def _pozitif(v: Any, ad: str) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise GeometriHatasi(f"{ad} sayisal olmali")
    if not math.isfinite(f) or f <= 0:
        raise GeometriHatasi(f"{ad} sifirdan buyuk olmali")
    return f


def _normalize_aci(ham: Any) -> Any:
    """'duvar' ya da dereceye cevirir. Serbest aci (Winnice'teki 'Diger')
    da kabul edilir -- 0 < aci < 360 oldugu surece."""
    if ham is None or ham == '' or ham == DUVAR:
        return DUVAR
    try:
        a = float(ham)
    except (TypeError, ValueError):
        return DUVAR
    if not math.isfinite(a) or a <= 0 or a >= 360:
        return DUVAR
    return a


def _kanat_tipleri(sayi: int, toplanma: str) -> List[str]:
    """Toplanma yonunden her kanadin tipini turetir.

    Kapi kanadi (ilk acilir kanat) toplanma yonundeki uc kanattir; gercek
    montajda once o acilir, digerleri ona paketlenir. Winnice'in cizimde
    farkli bir ok ile gosterdigi kanat da budur."""
    if toplanma == 'sabit':
        return ['sabit'] * sayi
    if toplanma == 'sagavesola':
        sol = sayi // 2
        tipler = ['sola_kayar'] * sol + ['saga_kayar'] * (sayi - sol)
        if sol:
            tipler[0] = 'sola_acilir'
        if sayi - sol:
            tipler[-1] = 'saga_acilir'
        return tipler
    if toplanma in ('saga', 'saga_kaydir'):
        tipler = ['saga_kayar'] * sayi
        if toplanma == 'saga':
            tipler[-1] = 'saga_acilir'
        return tipler
    # varsayilan: sola
    tipler = ['sola_kayar'] * sayi
    if toplanma == 'sola':
        tipler[0] = 'sola_acilir'
    return tipler


def _cam_olculeri(
    cephe_genislik_mm: float,
    cephe_yukseklik_mm: float,
    kanat_sayisi: int,
    dusum: Optional[ProfilDusumu],
):
    """Kanat basina (cam_genislik, cam_yukseklik) doner. Profil dusumu
    bilinmiyorsa (None, None) -- bkz. modul basligindaki KAPSAM NOTU."""
    if dusum is None:
        return None, None
    net_genislik = (
        cephe_genislik_mm
        - 2 * dusum.yan_pay_mm
        - (kanat_sayisi - 1) * dusum.kanat_bindirme_mm
    )
    if net_genislik <= 0:
        return None, None
    cam_y = cephe_yukseklik_mm - dusum.yukseklik_dusumu_mm
    if cam_y <= 0:
        return None, None
    return round(net_genislik / kanat_sayisi, 1), round(cam_y, 1)


def cephe_zinciri(
    cepheler: List[Dict[str, Any]],
    max_kanat_mm: float = VARSAYILAN_MAX_KANAT_MM,
    profil_dusumu: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Soldan saga girilen cephe listesinden cizim modelini uretir.

    Her cephe: {genislikMm, yukseklikMm, kanatSayisi?, adet?, sagAci?,
    toplanmaYonu?, solKoseGenisKapak?, sagKoseGenisKapak?}

    `kanatSayisi` verilmezse onerilen_kanat_sayisi ile doldurulur -- bayi
    isterse ustune yazar.

    KOSE DIKMESI: iki cephe bir aciyla birlesiyorsa aradaki dikme IKISININ
    ORTAK dikmesidir, tek sayilir. Bugun bayi iki ayri hesap yapip elle
    topladiginda bu dikme iki kez sayiliyor; asagidaki `koseDikmesi` tam
    olarak bu hatayi kapatmak icin var.
    """
    if not cepheler:
        raise GeometriHatasi('En az bir cephe gerekli')

    dusum = ProfilDusumu.from_dict(profil_dusumu)
    uyarilar: List[str] = []
    cikan_cepheler: List[Dict[str, Any]] = []
    tum_kanatlar: List[Dict[str, Any]] = []
    kose_sayisi = 0
    toplam_genislik = 0.0
    toplam_alan_m2 = 0.0
    global_sira = 0

    son_index = len(cepheler) - 1
    for i, ham in enumerate(cepheler):
        genislik = _pozitif(ham.get('genislikMm'), f'{i + 1}. cephe genisligi')
        yukseklik = _pozitif(ham.get('yukseklikMm'), f'{i + 1}. cephe yuksekligi')
        adet = int(ham.get('adet') or 1)
        if adet < 1:
            adet = 1

        onerilen = onerilen_kanat_sayisi(genislik, max_kanat_mm)
        kanat_sayisi = ham.get('kanatSayisi')
        if kanat_sayisi in (None, '', 0):
            kanat_sayisi = onerilen
        kanat_sayisi = max(1, int(kanat_sayisi))
        if kanat_sayisi < onerilen:
            uyarilar.append(
                f'{i + 1}. cephe: {kanat_sayisi} kanat için kanat genişliği '
                f'{round(genislik / kanat_sayisi)}mm — önerilen en az {onerilen} kanat.'
            )

        toplanma = ham.get('toplanmaYonu') or 'sola'
        if toplanma not in TOPLANMA_YONLERI:
            toplanma = 'sola'

        # Son cephenin sag acisi her zaman duvardir: saginda baska cephe yok.
        sag_aci = DUVAR if i == son_index else _normalize_aci(ham.get('sagAci'))
        if sag_aci != DUVAR:
            kose_sayisi += 1

        tipler = _kanat_tipleri(kanat_sayisi, toplanma)
        cam_g, cam_y = _cam_olculeri(genislik, yukseklik, kanat_sayisi, dusum)
        eksen_genislik = round(genislik / kanat_sayisi, 1)

        kanatlar = []
        for k, tip in enumerate(tipler):
            global_sira += 1
            kanatlar.append({
                'sira': global_sira,
                'cephe': i + 1,
                'cepheIci': k + 1,
                'tip': tip,
                'eksenGenislikMm': eksen_genislik,
                'camGenislikMm': cam_g,
                'camYukseklikMm': cam_y,
            })
        tum_kanatlar.extend(kanatlar)

        toplam_genislik += genislik * adet
        toplam_alan_m2 += (genislik * yukseklik * adet) / 1_000_000.0

        cikan_cepheler.append({
            'sira': i + 1,
            'genislikMm': genislik,
            'yukseklikMm': yukseklik,
            'kanatSayisi': kanat_sayisi,
            'onerilenKanatSayisi': onerilen,
            'adet': adet,
            'sagAci': sag_aci,
            'toplanmaYonu': toplanma,
            'solKoseGenisKapak': bool(ham.get('solKoseGenisKapak')),
            'sagKoseGenisKapak': bool(ham.get('sagKoseGenisKapak')),
            'kanatlar': kanatlar,
        })

    if dusum is None:
        uyarilar.append(
            'Cam ölçüleri gösterilmiyor: bu seri için profil düşüm değerleri '
            'tanımlı değil. Çizim oransal olarak doğrudur, cam siparişine esas '
            'alınamaz.'
        )

    return {
        'kind': 'cephe',
        'cepheler': cikan_cepheler,
        'kanatlar': tum_kanatlar,
        'toplamKanat': len(tum_kanatlar),
        'koseSayisi': kose_sayisi,
        'koseDikmesi': kose_sayisi,
        'toplamGenislikMm': round(toplam_genislik, 1),
        'toplamAlanM2': round(toplam_alan_m2, 2),
        'camOlculeriGuvenilir': dusum is not None,
        'uyarilar': uyarilar,
    }


def modul_semasi(
    genislik_mm: float,
    derinlik_mm: float,
    modul_sayisi: int,
    lamel_sayisi_toplam: int,
) -> Dict[str, Any]:
    """Bioklimatik pergolanin modul/lamel semasi.

    `modul_sayisi` ve `lamel_sayisi_toplam` DISARIDAN verilir -- bunlari
    uretmek albert_genau_calc.PriceBook.module_panel_count'un isi (Excel'den
    dogrulanmis matematik). Burada sadece yerlesim uretilir ki ekrandaki
    canli cizim ile teklife giden teknik cizim ayni bolunmeyi gostersin.

    DIKKAT -- lamel sayisi: module_panel_count'un dondurdugu G3 degeri
    formulunde C3 (modul sayisi) ile CARPILIR, yani TUM MODULLERIN TOPLAM
    lamel sayisidir; adi `panelSayisiModul` olmasina ragmen modul basina
    degildir. Cizimde her modulun icine bu sayinin tamami konursa cok
    modullu pergolada lamel sayisi katlanir. Burada toplam, modul sayisina
    bolunerek modul basina dusen lamel bulunur; fiyat hesabi TOPLAM degeri
    kullanmaya devam eder (malzeme miktari dogru).
    """
    g = _pozitif(genislik_mm, 'Genislik')
    d = _pozitif(derinlik_mm, 'Derinlik')
    modul_sayisi = max(1, int(modul_sayisi or 1))
    toplam = max(1, int(lamel_sayisi_toplam or 1))

    lamel_modul_basina = max(1, round(toplam / modul_sayisi))
    # Cok yuksek lamel sayisi cizimi okunmaz yapar; SADECE cizim icin
    # kirpilir, donen `lamelSayisiToplam` gercek degeri korur.
    cizilecek_lamel = min(40, lamel_modul_basina)

    modul_genislik = round(g / modul_sayisi, 1)
    uyarilar: List[str] = []
    if cizilecek_lamel != lamel_modul_basina:
        uyarilar.append(
            f'Lamel sayısı çizimde {cizilecek_lamel} ile sınırlandı '
            f'(gerçek: modül başına {lamel_modul_basina}).'
        )

    moduller = [{
        'sira': i + 1,
        'genislikMm': modul_genislik,
        'derinlikMm': d,
        'lamelSayisi': cizilecek_lamel,
    } for i in range(modul_sayisi)]

    return {
        'kind': 'modul',
        'moduller': moduller,
        'modulSayisi': modul_sayisi,
        'lamelSayisiToplam': toplam,
        'lamelSayisiModul': lamel_modul_basina,
        'genislikMm': g,
        'derinlikMm': d,
        'toplamAlanM2': round(g * d / 1_000_000.0, 2),
        'uyarilar': uyarilar,
    }


# Giyotin tiplerinde kac panel grubunun hareket ettigi. 'twin' ailesi iki
# bagimsiz hareket grubu, 'mono' tek grup kullanir.
_GIYOTIN_HAREKET = {
    'vertiflex_mono08': 1,
    'vertiflex_mono08_all_glass': 1,
    'vertiflex_tambalkon': 1,
    'vertiflex_twin': 2,
    'vertiflex_up_twin': 2,
    'impetus_clean_twin': 2,
}


def giyotin_semasi(
    tip: str,
    genislik_mm: float,
    yukseklik_mm: float,
    panel_sayisi: int,
) -> Dict[str, Any]:
    """Giyotin (VERTIFLEX) semasi: yatay panellerin dusey dizilimi.

    Paneller ustten alta numaralanir. EN ALTTAKI PANEL HER ZAMAN SABITTIR;
    ustundeki paneller asagi dogru hareket edip sabit panelin arkasina
    paketlenir, boylece ust bosluk acilir. Yani 3 panelli bir giyotinde
    altta 1 sabit, ustte 2 hareketli cam olur.
    """
    g = _pozitif(genislik_mm, 'Genislik')
    y = _pozitif(yukseklik_mm, 'Yukseklik')
    n = max(1, int(panel_sayisi or 1))
    hareket_grubu = _GIYOTIN_HAREKET.get(tip, 1)

    panel_yukseklik = round(y / n, 1)
    paneller = []
    for i in range(n):
        # Tek panelli sistemde sabit/hareketli ayrimi anlamsiz -- o panel
        # zaten hareketlidir (arkasina paketlenecek sabit panel yok).
        sabit = (i == n - 1) and n > 1
        paneller.append({
            'sira': i + 1,
            'genislikMm': round(g, 1),
            'yukseklikMm': panel_yukseklik,
            'hareketli': not sabit,
            'yon': None if sabit else 'asagi',
        })

    return {
        'kind': 'giyotin',
        'tip': tip,
        'paneller': paneller,
        'panelSayisi': n,
        'hareketGrubu': hareket_grubu,
        'genislikMm': g,
        'yukseklikMm': y,
        'toplamAlanM2': round(g * y / 1_000_000.0, 2),
        'uyarilar': [],
    }


# ============================================================================
# BC ailesi kopruleri
# ----------------------------------------------------------------------------
# calculate_bc kanat miktarlarini Excel hucre referanslariyla (C18, C19...)
# alir ve bugun bayi bu sayilari ELLE yaziyor. Asagidaki eslestirme, cephe
# zincirinden cikan kanat dagilimini o referanslara tasir.
#
# Eslestirme 39 BC varyantinin ref'leri tipten tipe kaydigi icin (TIARA 08'de
# kose F14, TIARA ZERO 08'de F15, bazi tiplerde hic yok) REF'E DEGIL ETIKETE
# bakar. Etiketler ureticiden geldigi icin bu bir sezgisel eslestirmedir:
# sonuclar ONERI olarak sunulur, sessizce uzerine yazilmaz; kategorilemedigi
# ref'e hic dokunmaz.
# ============================================================================

# Etiket -> kategori. Sira onemli: daha ozel kalip once denenir.
_BC_KATEGORI_KURALLARI = (
    ('sabit', ('SABIT KANAT', 'SABİT KANAT')),
    ('saga_kayar', ('SAG KAYAR', 'SAĞ KAYAR')),
    ('sola_kayar', ('SOL KAYAR',)),
    ('kayar', ('KAYAR KANAT',)),
    ('mentese', ('MENTESELI KANAT', 'MENTEŞELİ KANAT')),
)

# Bu kaliplari iceren satirlar kanat SAYISI degildir (kilit/ispanyolet
# takimlari, ara cita vs.) -- hicbir kategoriye sokulmaz.
_BC_HARIC = ('KILIT TAKIMI', 'KİLİT TAKIMI', 'ISPANYOLET', 'İSPANYOLET', 'ARA CITA', 'ARA ÇITA')


def _bc_kategori(etiket: str) -> Optional[str]:
    u = (etiket or '').upper()
    if any(h in u for h in _BC_HARIC):
        return None
    for kategori, kaliplar in _BC_KATEGORI_KURALLARI:
        if any(k in u for k in kaliplar):
            return kategori
    return None


def bc_ref_haritasi(
    kanat_inputs: Optional[Dict[str, Any]],
    flag_inputs: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Bir BC tipinin ref'lerini kategorilere ayirir.

    Doner: {'kategoriler': {ref: kategori}, 'koseRef': ref|None}
    Kose alani tipe gore F11/F12/F14/F15/F16 olabildigi icin ref sabitlenmez;
    kind='count' olan ve etiketinde KOSE gecen alan aranir.
    """
    kategoriler: Dict[str, str] = {}
    for ref, meta in (kanat_inputs or {}).items():
        kat = _bc_kategori((meta or {}).get('label', ''))
        if kat:
            kategoriler[ref] = kat

    kose_ref = None
    for ref, meta in (flag_inputs or {}).items():
        meta = meta or {}
        etiket = (meta.get('label') or '').upper()
        if meta.get('kind') == 'count' and ('KOSE' in etiket or 'KÖŞE' in etiket):
            kose_ref = ref
            break

    return {'kategoriler': kategoriler, 'koseRef': kose_ref}


def bc_oneri(
    model: Dict[str, Any],
    kanat_inputs: Optional[Dict[str, Any]],
    flag_inputs: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Cephe zinciri modelinden BC form degerleri onerir.

    Hareketli kanatlar yonlerine gore ayrilir; tip yon ayrimi yapmiyorsa
    (tek bir 'kayar' ref'i varsa) hepsi orada toplanir. Kapi kanatlari
    ('..._acilir') menteseli ref'i varsa oraya, yoksa kayar ref'ine yazilir --
    ispanyoletli/kilit satirlarina HIC dokunulmaz, onlar bayinin secimi.
    """
    harita = bc_ref_haritasi(kanat_inputs, flag_inputs)
    kategoriler = harita['kategoriler']
    ref_of = {kat: ref for ref, kat in kategoriler.items()}

    sayim: Dict[str, int] = {}
    for k in model.get('kanatlar', []):
        sayim[k['tip']] = sayim.get(k['tip'], 0) + 1

    kanat_miktarlari: Dict[str, int] = {}
    aciklama: List[str] = []

    def ekle(ref: Optional[str], adet: int):
        if ref and adet:
            kanat_miktarlari[ref] = kanat_miktarlari.get(ref, 0) + adet

    def hedef(*adaylar: str) -> Optional[str]:
        """Ilk bulunan ref'i doner. Sirali yedekleme sayesinde tipin
        yon ayrimi olmasa da (ya da tek yonu olsa da) hicbir kanat
        dusmez -- kaybolan kanat = eksik fiyat."""
        for a in adaylar:
            r = ref_of.get(a)
            if r:
                return r
        return None

    sabit = sayim.get('sabit', 0)
    sola_k, saga_k = sayim.get('sola_kayar', 0), sayim.get('saga_kayar', 0)
    sola_a, saga_a = sayim.get('sola_acilir', 0), sayim.get('saga_acilir', 0)

    ekle(hedef('sabit', 'kayar', 'sola_kayar', 'saga_kayar'), sabit)

    sol_ref = hedef('sola_kayar', 'kayar', 'saga_kayar')
    sag_ref = hedef('saga_kayar', 'kayar', 'sola_kayar')
    ekle(sol_ref, sola_k)
    ekle(sag_ref, saga_k)

    # Kapi kanatlari: ayri bir menteseli alan varsa oraya, yoksa KENDI
    # YONUNDEKI kayar alanina (sag kapi sag ref'e, sol kapi sol ref'e).
    mentese_ref = ref_of.get('mentese')
    if mentese_ref:
        ekle(mentese_ref, sola_a + saga_a)
    else:
        ekle(sol_ref, sola_a)
        ekle(sag_ref, saga_a)
        if sola_a + saga_a:
            aciklama.append(
                'Bu tipte ayrı bir menteşeli kanat alanı yok; kapı kanatları '
                'kendi yönündeki kayar kanat sayısına eklendi.'
            )

    # Guvenlik agi: onerilen toplam, cizimdeki kanat sayisini tutmali.
    onerilen_toplam = sum(kanat_miktarlari.values())
    cizim_toplam = len(model.get('kanatlar', []))
    if onerilen_toplam != cizim_toplam:
        aciklama.append(
            f'Dikkat: çizimde {cizim_toplam} kanat var, forma {onerilen_toplam} '
            f'yazıldı — kanat alanlarını kontrol edin.'
        )

    bayrak_degerleri: Dict[str, int] = {}
    if harita['koseRef']:
        bayrak_degerleri[harita['koseRef']] = int(model.get('koseDikmesi') or 0)
    elif model.get('koseDikmesi'):
        aciklama.append(
            'Bu tipte köşe sayısı alanı bulunamadı; köşe dikmesi elle '
            'kontrol edilmeli.'
        )

    kategorilenmeyen = [r for r in (kanat_inputs or {}) if r not in kategoriler]
    if kategorilenmeyen:
        aciklama.append(
            f"{len(kategorilenmeyen)} alan (kilit/ispanyolet takımları) çizimden "
            f"doldurulmaz, olduğu gibi bırakıldı."
        )

    return {
        'kanatMiktarlari': kanat_miktarlari,
        'bayrakDegerleri': bayrak_degerleri,
        'koseRef': harita['koseRef'],
        'kategoriler': kategoriler,
        'aciklama': aciklama,
    }

"""
Albert Genau (AG BIOFLEX/BIO Harmony) parametrik fiyat hesaplama motoru.

Bu modul, Albert Genau'nun kendi Excel maliyet analizi dosyalarindaki (5 sistem
tipi: 4 Ayak Ustu / 2 Ayak Duvar / Ayaksiz / Sabit 4 Ayak Ustu / Sabit Duvar)
gercek formulleri elle Python'a aktarilmis halidir. Her fonksiyon, Excel'in
kendi kayitli ornek degerleriyle (LibreOffice ile yeniden hesaplatilarak da
capraz dogrulanmis) birebir test edilmistir.

Onemli tasarim karari: Excel'deki formuller (profil uzunluklari, aksesuar
adetleri, vs.) burada SABIT KOD olarak yasiyor -- bunlar Albert Genau'nun
urun/imalat mantigi degistigi surece degismez. Sadece MALZEME FIYATLARI
(price_list) zamanla degisir; bu yuzden fiyat listesi ayri bir veri katmani
(Mongo'daki `albert_genau_config` koleksiyonu, ilk kurulumda bu dosyadaki
varsayilan JSON'dan tohumlanir) olarak tutulur ve Excel yeniden yuklenerek
guncellenebilir -- hesaplama formullerine hic dokunmadan.

Kapsam disi / v1 sinirlamasi: KRITERLER sekmesindeki "GDIKEY" (guclendirilmis
dikey) orta-destek-yonlendirme durumu cok nadir/asiri buyuk sistemlerde devreye
giriyor ve fiyata cok kucuk bir galvanizli celik profil maliyeti ekliyor;
v1'de her zaman "DIKEY" varsayilir (dogrulanan tum ornek senaryolarda da zaten
gercek deger DIKEY cikmistir). Ayrica sadece 4 AYAK USTU tipinin LED/kopuk
opsiyonel bloklari Excel'e karsi birebir dogrulanmistir; diger 4 tipin LED
bloklari ayni formul deseniyle port edilmis ama henuz ayrica dogrulanmamistir.
"""
import json
import math
import os
from typing import Any, Dict, Optional

_DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'albert_genau_price_data.json')

with open(_DATA_PATH, encoding='utf-8') as _f:
    _DEFAULT_DATA = json.load(_f)

SYSTEM_TYPES = [
    '4ayak_ustu',
    '2ayak_duvar',
    'ayaksiz',
    'sabit_4ayak_ustu',
    'sabit_duvar',
]

SYSTEM_TYPE_LABELS = {
    '4ayak_ustu': 'AG BIOFLEX 4 Ayak Ustu',
    '2ayak_duvar': 'AG BIOFLEX 2 Ayak Duvar',
    'ayaksiz': 'AG BIOFLEX Ayaksiz',
    'sabit_4ayak_ustu': 'AG BIO Sabit 4 Ayak Ustu',
    'sabit_duvar': 'AG BIO Sabit Duvar',
}

class DepthChoiceRequired(ValueError):
    """Girilen derinlik iki standart panel-adimi arasinda kaldiginda
    firlatilir -- otomatik yuvarlama yerine kullaniciya alt/ust secim
    yaptirmak icin (bkz. PriceBook.depth_choice)."""

    def __init__(self, floor_mm: float, ceil_mm: float, raw_mm: float):
        self.floor_mm = floor_mm
        self.ceil_mm = ceil_mm
        self.raw_mm = raw_mm
        super().__init__(
            f"Girilen derinlik ({raw_mm:.0f}mm) standart bir olcuye tam denk gelmiyor. "
            f"Alt (dar, {floor_mm:.0f}mm) veya ust (genis, {ceil_mm:.0f}mm) standart "
            f"derinlikten birini secmeniz gerekiyor."
        )


FINISH_OPTIONS = {
    'SATINE_NATUREL': 1.0,
    'ANTRASIT_GRI': 1.0,
    'BRONZ_1122_BOYALI': 1.0,
    'DIGER_RAL': 1.15,
    'BRONZ_ELOKSAL': 1.1,
    'PRES': 0.9,
}


class PriceBook:
    """Fiyat listesi + yardimci tablolari saran ince katman. `data` disaridan
    (Mongo'daki guncel kayittan) enjekte edilebilir; verilmezse bu dosyadaki
    varsayilan/ilk-yuklenen Excel verisi kullanilir."""

    def __init__(self, data: Optional[Dict[str, Any]] = None, odeme_tipi: str = 'nakit'):
        d = data or _DEFAULT_DATA
        self.price_list: Dict[str, Dict[str, Any]] = d['price_list']
        self.depth_table = {int(k): float(v) for k, v in d['depth_table'].items()}
        self.belt_table = {
            int(k): {int(m): v for m, v in mods.items()}
            for k, mods in d['belt_table'].items()
        }
        # 'nakit' | 'kredi_karti' -- price() bu alana gore hangi rakami
        # dondurecegine karar verir (bkz. asagidaki NAKIT_FACTOR notu).
        self.odeme_tipi = odeme_tipi if odeme_tipi in ('nakit', 'kredi_karti') else 'nakit'

    # `price_list`'teki birim fiyatlar Excel'in 'SIPARIS FORMU' sekmesindeki
    # KREDI KARTI (taksitli/liste) fiyat sutunundan geliyor. Excel'in kendi
    # toplam satirinda NAKIT (pesin) toplam = KREDI KARTI toplami * 0.89
    # olarak hesaplaniyor (bkz. G66 = C66 * 0.89) -- Excel'de bu iki rakam
    # HER ZAMAN yan yana, iki ayri sutun olarak gosterilir (bkz. kullanicinin
    # paylastigi ekran goruntusu: FIRE DAHIL MALIYET satirinda "KREDI
    # KARTINA TAKSITLI" ve "NAKIT" diye iki ayri deger var). Dolayisiyla
    # hesap motoru da ODEME TIPINE gore bu iki rakamdan birini uretmeli --
    # sabit olarak hep NAKIT'i dondurmek, kredi karti ile odeme yapacak
    # musteriler icin YANLIS (fazla iskontolu) bir fiyat cikariyordu.
    NAKIT_FACTOR = 0.89

    def price(self, sku: str) -> float:
        item = self.price_list.get(sku)
        if not item:
            raise KeyError(f"Fiyat listesinde bulunamayan SKU: {sku}")
        base = float(item['price'])
        if self.odeme_tipi == 'nakit':
            return base * self.NAKIT_FACTOR
        return base  # kredi_karti -> liste fiyati, carpan yok

    def depth_choice(self, raw_depth_mm: float) -> Optional[Dict[str, float]]:
        """Girilen derinlik standart panel-adimli tabloya TAM denk gelmiyorsa
        (yani otomatik ASAGI yuvarlama sessizce bir varsayim yapmis olacaksa),
        bunun yerine cagirana 'alt' (dar, guvenli) ve 'ust' (genis, biraz
        tasan) secenekleri dondurur ki kullanici acikca birini secsin. Tam
        eslesme varsa (veya tablonun tek ucunda ise, secilecek ikinci bir
        secenek yoksa) None doner -- bu durumda normal (floor) hesaplama
        sessizce devam eder."""
        vals = sorted(self.depth_table.values())
        if any(abs(v - raw_depth_mm) < 1e-6 for v in vals):
            return None
        floor_candidates = [v for v in vals if v < raw_depth_mm]
        ceil_candidates = [v for v in vals if v > raw_depth_mm]
        if not floor_candidates or not ceil_candidates:
            return None
        return {'floorMm': max(floor_candidates), 'ceilMm': min(ceil_candidates), 'rawMm': raw_depth_mm}

    def snap_depth(self, raw_depth_mm: float) -> float:
        """Standart (panel adimli) derinlige YUVARLAMAZ, her zaman ASAGI (floor)
        siknar -- sistem, musterinin belirttigi fiziksel alandan DAHA DERIN
        kurulamaz (duvara/sinira tasar). Excel'in kendi yardimci tablosundaki
        VLOOKUP(..., 1) (yaklasik eslesme, artan sirali) da ayni sekilde her
        zaman <= girilen deger olan en buyuk standart derinligi bulur --
        'en yakin' (yukari da yuvarlayabilen) bir mantik degildir."""
        vals = sorted(self.depth_table.values())
        candidates = [v for v in vals if v <= raw_depth_mm]
        if not candidates:
            raise ValueError(
                f"Girilen derinlik ({raw_depth_mm:.0f}mm) cok kucuk "
                f"(en kucuk desteklenen derinlik: {vals[0]:.0f}mm)"
            )
        chosen = max(candidates)
        if raw_depth_mm - chosen > 235:
            raise ValueError(
                f"Girilen derinlik ({raw_depth_mm:.0f}mm) desteklenen aralik disinda "
                f"(en yakin uygulanabilir derinlik: {chosen:.0f}mm, fark {raw_depth_mm - chosen:.0f}mm)"
            )
        return chosen

    def module_panel_count(self, genislik_mm: float, derinlik_mm_raw: float):
        """AG BIOFLEX/SABIT tiplerinin hepsinde ortak: MX M2=30.4, MX GENISLIK=7000mm."""
        E3 = self.snap_depth(derinlik_mm_raw)
        D72, E72 = 30.4, 7000.0
        C72 = genislik_mm * E3 / 1_000_000.0
        D73 = 1
        while C72 > D72 * D73:
            D73 += 1
        C73 = genislik_mm / D73
        C3 = math.ceil(genislik_mm / E72) if C73 > E72 else D73
        D80 = 233.68
        G3 = round(((E3 - 197.7 - 159.7) / D80) * C3)
        return C3, G3, E3

    def belt_line(self, panel_sayisi_modul: int, modul_sayisi: int):
        belt = self.belt_table.get(panel_sayisi_modul, {}).get(int(modul_sayisi))
        if not belt:
            return None
        belt_len, belt_qty = belt['length'], belt['qty']
        sku = 'P8500102' if belt_len == 16.6 else ('P8500103' if belt_len == 25 else None)
        if not sku:
            return None
        return sku, belt_qty


class Kalem:
    """Tek bir malzeme satiri (etiket, sku, birim fiyat, miktar)."""
    __slots__ = ('label', 'sku', 'price', 'qty')

    def __init__(self, label, sku, price, qty):
        self.label, self.sku, self.price, self.qty = label, sku, price, qty

    @property
    def total(self):
        return self.price * self.qty

    def dict(self):
        return {'label': self.label, 'sku': self.sku, 'birimFiyat': round(self.price, 2),
                'miktar': round(self.qty, 3), 'toplam': round(self.total, 2)}


def _finish_multiplier(finish: Optional[str]) -> float:
    if not finish:
        return 1.0
    return FINISH_OPTIONS.get(finish, 1.0)


# ============================================================
# TIP 1: AG BIOFLEX 4 AYAK USTU (motorlu/retraktabl, 4 ayakli, serbest duran)
# ============================================================
def _calc_4ayak_ustu(pb: PriceBook, genislik_mm, derinlik_mm_raw, yukseklik_mm,
                      corner_flat=False, somfy=False, led_mid_support=False, finish_mult=1.0):
    p = pb.price
    C2, G2 = genislik_mm, yukseklik_mm
    C3, G3, E3 = pb.module_panel_count(C2, derinlik_mm_raw)
    F73 = C2 / C3
    G73 = G3 / C3
    F34 = C3 * 2 if F73 > 5500 else 0
    F35 = C3 if F73 > 3500 else 0
    E73 = 'DIKEY'

    profil = []
    F5 = (((C2 - 297) - (140 * (C3 - 1))) * 2 + (E3 - 297) * 2) / 1000
    profil.append(Kalem('Kiris profili', 'B15224--', p('B15224--') * finish_mult, F5))
    F6 = (((C2 - 78) - (39 * C3 - 1)) * 2 + (E3 - 78) * (2 * C3)) / 1000
    profil.append(Kalem('Oluk profili', 'B15227--', p('B15227--') * finish_mult, F6))
    F7 = (E3 - 152 - 181) * 2 * C3 / 1000
    profil.append(Kalem('Ray profili', 'B15230--', p('B15230--') * finish_mult, F7))
    F8 = F7
    profil.append(Kalem('Ray kapak profili', 'B15232--', p('B15232--') * finish_mult, F8))
    F9 = ((C2 - 309) - ((C3 - 1) * 280)) / 1000 * G3 / C3
    profil.append(Kalem('Panel profili', 'B15235--', p('B15235--') * finish_mult, F9))
    F10 = ((C2 - 99) - ((C3 - 1) * 54)) / 1000
    profil.append(Kalem('Motor hazne profili', 'B15239--', p('B15239--') * finish_mult, F10))
    F11 = F10
    profil.append(Kalem('Motor kapak profili', 'B15241--', p('B15241--') * finish_mult, F11))
    F12 = (((G2 - 8 - 4) / 1000) * (4 + ((C3 - 1) * 2))) + (((G2 - 8 - 4) / 1000) * F34)
    profil.append(Kalem('Dikme profili', 'B15242--', p('B15242--') * finish_mult, F12))
    F13 = ((G2 - 8 + 227) / 1000) * 8 if not corner_flat else 0
    profil.append(Kalem('Oval dikme kapak profili', 'B15244--', p('B15244--') * finish_mult, F13))
    if corner_flat:
        F14 = (((G2 - 8 + 227) / 1000) * (8 + ((C3 - 1) * 4))) + (((G2 - 8 + 227) / 1000) * F34 * 2)
    else:
        F14 = (((G2 - 8 + 227) / 1000) * ((C3 - 1) * 4)) + (((G2 - 8 + 227) / 1000) * F34 * 2)
    profil.append(Kalem('Duz dikme kapak profili', 'B15245--', p('B15245--') * finish_mult, F14))
    F15 = (C3 * (E3 - 428)) / 1000 if F73 > 3500 else 0
    profil.append(Kalem('Orta destek profili', 'B15278--', p('B15278--') * finish_mult, F15))
    F16 = ((C3 - 1) * (E3 - 297)) / 1000
    profil.append(Kalem('Modul birlesim kiris profili', 'B15248--', p('B15248--') * finish_mult, F16))
    F17 = F10 - 0.065
    profil.append(Kalem('Sekizgen koruma borusu', 'TS8503201', p('TS8503201'), F17))

    aksesuar = []
    aksesuar.append(Kalem('Yarik hortum yan kapama contasi', 'B8505401', p('B8505401'), F9))
    aksesuar.append(Kalem('Kil firca', 'B8505305', p('B8505305'), F9))
    aksesuar.append(Kalem('BF oluk contasi (15mt paket)', 'B8505411', p('B8505411'), math.ceil(F6 / 15)))
    F27 = C3 * 1
    aksesuar.append(Kalem('BF motor panel gecme conta (7mt paket)', 'B8505412', p('B8505412'), F27))
    aksesuar.append(Kalem('Paslanmaz tabanli siyah kil firca', 'B8505102', p('B8505102'), F8))
    belt = pb.belt_line(round(G73), C3)
    if belt:
        sku, qty = belt
        aksesuar.append(Kalem('Triger zaman kayisi paketi', sku, p(sku), qty))
    aksesuar.append(Kalem('Poliamid orta destek citasi', 'B8505702', p('B8505702'), F15))
    aksesuar.append(Kalem('Baslangic-bitim makas panel takimi', 'P05003', p('P05003'), C3))
    F28 = G3 - (2 * C3)
    aksesuar.append(Kalem('Ara makas panel takimi', 'P05004', p('P05004'), F28))
    aksesuar.append(Kalem('Kose dikme baglanti takimi flansli', 'P05005', p('P05005'), 4))
    aksesuar.append(Kalem('Oluk baglanti takimi', 'P05007', p('P05007'), C3))
    aksesuar.append(Kalem('Ray baglanti takimi', 'P05008', p('P05008'), C3))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCX)', 'P05037', p('P05037'), C3 - 1))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCY)', 'P05038', p('P05038'), C3 - 1))
    aksesuar.append(Kalem('Yardimci dikme baglanti takimi', 'P05015', p('P05015'), F34))
    orta_destek_sku = 'P05039' if E73 == 'YATAY' else 'P05040'
    aksesuar.append(Kalem('Orta destek baglanti takimi', orta_destek_sku, p(orta_destek_sku), F35))
    aksesuar.append(Kalem('Premium su drenaj takimi', 'K05004', p('K05004'), C3 + 1))
    motor_sku = 'P05002' if somfy else 'P05001'
    aksesuar.append(Kalem('Motor ve aksam takimi', motor_sku, p(motor_sku), C3))
    kumanda5_sku = 'G05014' if somfy else 'G05011'
    aksesuar.append(Kalem('Kumanda (5 kanal)', kumanda5_sku, p(kumanda5_sku), 1))

    ctx = {'C2': C2, 'C3': C3, 'E3': E3, 'F9': F9, 'F15': F15, 'F35': F35, 'G50_scale': 1}
    return profil, aksesuar, ctx


def _led_kopuk_bloklari(pb: PriceBook, ctx, led_mid_support=False, finish_mult=1.0,
                         orta_destek_qty_key='F35'):
    """4 AYAK USTU icin Excel'e karsi dogrulanmis LED/kopuk opsiyonel blok
    formulleri. Digerlerinde de ayni desen -- sadece 'orta destek adedi'
    degiskeninin adi (F35/F36/F27/F29 vs) degisiyor, o yuzden context'ten
    parametrik okunuyor."""
    p = pb.price
    C2, C3, E3, F9 = ctx['C2'], ctx['C3'], ctx['E3'], ctx['F9']
    F_orta_destek_qty = ctx.get(orta_destek_qty_key, 0)
    F15 = ctx['F15']
    G50 = 1 if led_mid_support else 0

    F48 = math.ceil(F9 / 2)
    panel_dolgu = [Kalem('Panel dolgusu (iki parcali 2000mm)', 'P05024', p('P05024'), F48)]

    F_led = ((((C2 - 210 - 210) - ((C3 - 1) * 381)) * 2 - (F_orta_destek_qty * 116 * 2)
              + (E3 - 210) * (2 * C3)) / 1000) + (F15 * G50 * 2)
    F35_flag = ctx.get('F35', 0)
    F75 = C3 * 2 if C3 == F35_flag else C3
    G75 = F_led / F75 if F75 else 0
    F76 = 15 if G75 < 15 else 21
    serit_warm_sku = 'P05025' if F76 == 15 else 'P05026'
    serit_rgb_sku = 'P05027' if F76 == 15 else 'P05028'

    warm = [
        Kalem('LED profili', 'B15246--', p('B15246--') * finish_mult, F_led),
        Kalem('Warm LED kapagi', 'B8505616', p('B8505616'), F_led),
        Kalem('LED serit paketi (warm)', serit_warm_sku, p(serit_warm_sku), F75),
        Kalem('Dimmerli aydinlatma kontrol unitesi', 'P05023', p('P05023'), C3),
        Kalem('Gun isigi kumanda', 'P8500520', p('P8500520'), 1 if C3 < 8 else 2),
    ]
    G76 = C3 if (2 * F_led) / C3 < 44 else (2 * C3 if (2 * F_led) / C3 > 44 else C3)
    rgb = [
        Kalem('LED profili', 'B15246--', p('B15246--') * finish_mult, F_led),
        Kalem('Warm LED kapagi', 'B8505616', p('B8505616'), F_led),
        Kalem('RGB LED kapagi', 'B8505617', p('B8505617'), F_led),
        Kalem('LED serit paketi (warm)', serit_warm_sku, p(serit_warm_sku), F75),
        Kalem('LED serit paketi (RGB)', serit_rgb_sku, p(serit_rgb_sku), F75),
        Kalem('Ambiyans aydinlatma dimmerli kontrol unitesi', 'P05022', p('P05022'), G76),
        Kalem('RGB cok kanal kumanda', 'P8500515', p('P8500515'), 1 if C3 < 8 else 2),
    ]
    return panel_dolgu, warm, rgb


# ============================================================
# TIP 2: AG BIOFLEX 2 AYAK DUVAR (duvara montajli, 2 ayakli)
# ============================================================
def _calc_2ayak_duvar(pb: PriceBook, genislik_mm, derinlik_mm_raw, yukseklik_mm,
                       corner_flat=False, somfy=False, no_wall_bracket=False, finish_mult=1.0):
    p = pb.price
    C2, G2 = genislik_mm, yukseklik_mm
    C3, G3, E3 = pb.module_panel_count(C2, derinlik_mm_raw)
    F75 = C2 / C3
    F36 = C3 if F75 > 5500 else 0
    E75 = 'DIKEY'

    profil = []
    F5 = (((C2 - 88) - (140 * (C3 - 1))) * 2 + (E3 - 148.5) * 2) / 1000
    profil.append(Kalem('Kiris profili', 'B15224--', p('B15224--') * finish_mult, F5))
    F6 = (((C2 - 78) - (39 * C3 - 1)) * 2 + (E3 - 78) * (2 * C3)) / 1000
    profil.append(Kalem('Oluk profili', 'B15227--', p('B15227--') * finish_mult, F6))
    F7 = (E3 - 152 - 181) * 2 * C3 / 1000
    profil.append(Kalem('Ray profili', 'B15230--', p('B15230--') * finish_mult, F7))
    F8 = F7
    profil.append(Kalem('Ray kapak profili', 'B15232--', p('B15232--') * finish_mult, F8))
    F9 = ((C2 - 309) - ((C3 - 1) * 280)) / 1000 * G3 / C3
    profil.append(Kalem('Panel profili', 'B15235--', p('B15235--') * finish_mult, F9))
    F10 = ((C2 - 99) - ((C3 - 1) * 54)) / 1000
    profil.append(Kalem('Motor hazne profili', 'B15239--', p('B15239--') * finish_mult, F10))
    F11 = F10
    profil.append(Kalem('Motor kapak profili', 'B15241--', p('B15241--') * finish_mult, F11))
    F12 = ((G2 - 8 - 4) / 1000) * (2 + ((C3 - 1) * 1)) + (((G2 - 8 - 4) / 1000) * F36)
    profil.append(Kalem('Dikme profili', 'B15242--', p('B15242--') * finish_mult, F12))
    F13 = ((G2 - 5 + 227) / 1000) * 4 if not corner_flat else 0
    profil.append(Kalem('Oval dikme kapak profili', 'B15244--', p('B15244--') * finish_mult, F13))
    if corner_flat:
        F14 = ((G2 - 5 + 227) / 1000) * (4 + ((C3 - 1) * 2)) + (((G2 - 8 + 227) / 1000) * F36 * 2)
    else:
        F14 = ((G2 - 5 + 227) / 1000) * ((C3 - 1) * 2) + (((G2 - 8 + 227) / 1000) * F36 * 2)
    profil.append(Kalem('Duz dikme kapak profili', 'B15245--', p('B15245--') * finish_mult, F14))
    F15 = (C3 * (E3 - 428)) / 1000 if F75 > 3500 else 0
    profil.append(Kalem('Orta destek profili', 'B15278--', p('B15278--') * finish_mult, F15))
    F16 = ((C3 - 1) * (E3 - 297)) / 1000
    profil.append(Kalem('Modul birlesim kiris profili', 'B15248--', p('B15248--') * finish_mult, F16))
    F17 = F10 - 0.065
    profil.append(Kalem('Sekizgen koruma borusu', 'TS8503201', p('TS8503201'), F17))

    aksesuar = []
    aksesuar.append(Kalem('Yarik hortum yan kapama contasi', 'B8505401', p('B8505401'), F9))
    aksesuar.append(Kalem('Kil firca', 'B8505305', p('B8505305'), F9))
    aksesuar.append(Kalem('BF oluk contasi (15mt paket)', 'B8505411', p('B8505411'), math.ceil(F6 / 15)))
    F27 = C3 * 1
    aksesuar.append(Kalem('BF motor panel gecme conta (7mt paket)', 'B8505412', p('B8505412'), F27))
    aksesuar.append(Kalem('Paslanmaz tabanli siyah kil firca', 'B8505102', p('B8505102'), F8))
    belt = pb.belt_line(round(G3 / C3), C3)
    if belt:
        sku, qty = belt
        aksesuar.append(Kalem('Triger zaman kayisi paketi', sku, p(sku), qty))
    aksesuar.append(Kalem('Poliamid orta destek citasi', 'B8505702', p('B8505702'), F15))
    aksesuar.append(Kalem('Baslangic-bitim makas panel takimi', 'P05003', p('P05003'), C3))
    F28 = G3 - (2 * C3)
    aksesuar.append(Kalem('Ara makas panel takimi', 'P05004', p('P05004'), F28))
    aksesuar.append(Kalem('Kose dikme baglanti takimi gizli', 'P05029', p('P05029'), 2))
    aksesuar.append(Kalem('Oluk baglanti takimi', 'P05007', p('P05007'), C3))
    aksesuar.append(Kalem('Ray baglanti takimi', 'P05008', p('P05008'), C3))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCX)', 'P05037', p('P05037'), C3 - 1))
    if not no_wall_bracket:
        aksesuar.append(Kalem('Duvar kose baglanti takimi sag/sol', 'P05011', p('P05011'), 1))
        bucket = 3 if 0 < F75 <= 4000 else (4 if 4000 < F75 <= 7000 else 0)
        aksesuar.append(Kalem('Duvar baglanti takimi', 'P05012', p('P05012'), bucket * C3))
    aksesuar.append(Kalem('Duvar modul birlesim takimi', 'P05013', p('P05013'), C3 - 1))
    aksesuar.append(Kalem('Yardimci dikme baglanti takimi', 'P05015', p('P05015'), F36))
    orta_destek_sku = 'P05039' if E75 == 'YATAY' else 'P05040'
    orta_destek_qty = C3 if F75 > 3500 else 0
    aksesuar.append(Kalem('Orta destek baglanti takimi', orta_destek_sku, p(orta_destek_sku), orta_destek_qty))
    aksesuar.append(Kalem('Premium su drenaj takimi', 'K05004', p('K05004'), C3 + 1))
    motor_sku = 'P05002' if somfy else 'P05001'
    aksesuar.append(Kalem('Motor ve aksam takimi', motor_sku, p(motor_sku), C3))
    kumanda5_sku = 'G05014' if somfy else 'G05011'
    aksesuar.append(Kalem('Kumanda (5 kanal)', kumanda5_sku, p(kumanda5_sku), 1))

    ctx = {'C2': C2, 'C3': C3, 'E3': E3, 'F9': F9, 'F15': F15, 'F35': F36, 'F36': orta_destek_qty}
    return profil, aksesuar, ctx


# ============================================================
# TIP 3: AG BIOFLEX AYAKSIZ (iki duvar arasi, kolonsuz)
# ============================================================
def _calc_ayaksiz(pb: PriceBook, genislik_mm, derinlik_mm_raw,
                   corner_flat=False, somfy=False, no_wall_bracket=True, finish_mult=1.0):
    p = pb.price
    C2 = genislik_mm
    C3, G3, E3 = pb.module_panel_count(C2, derinlik_mm_raw)
    F69 = C2 / C3
    E69 = 'DIKEY'

    profil = []
    F5 = (((C2 - 88) - (140 * (C3 - 1))) * 2 + (E3 - 0) * 2) / 1000
    profil.append(Kalem('Kiris profili', 'B15224--', p('B15224--') * finish_mult, F5))
    F6 = (((C2 - 78) - (39 * C3 - 1)) * 2 + (E3 - 78) * (2 * C3)) / 1000
    profil.append(Kalem('Oluk profili', 'B15227--', p('B15227--') * finish_mult, F6))
    F7 = (E3 - 152 - 181) * 2 * C3 / 1000
    profil.append(Kalem('Ray profili', 'B15230--', p('B15230--') * finish_mult, F7))
    F8 = F7
    profil.append(Kalem('Ray kapak profili', 'B15232--', p('B15232--') * finish_mult, F8))
    F9 = ((C2 - 309) - ((C3 - 1) * 280)) / 1000 * G3 / C3
    profil.append(Kalem('Panel profili', 'B15235--', p('B15235--') * finish_mult, F9))
    F10 = ((C2 - 99) - ((C3 - 1) * 54)) / 1000
    profil.append(Kalem('Motor hazne profili', 'B15239--', p('B15239--') * finish_mult, F10))
    F11 = F10
    profil.append(Kalem('Motor kapak profili', 'B15241--', p('B15241--') * finish_mult, F11))
    F12 = (C3 * (E3 - 428)) / 1000 if C2 / C3 > 3500 else 0
    profil.append(Kalem('Orta destek profili', 'B15278--', p('B15278--') * finish_mult, F12))
    F13 = ((C3 - 1) * (E3 - 297)) / 1000
    profil.append(Kalem('Modul birlesim kiris profili', 'B15248--', p('B15248--') * finish_mult, F13))
    F14 = F10 - 0.065
    profil.append(Kalem('Sekizgen koruma borusu', 'TS8503201', p('TS8503201'), F14))

    aksesuar = []
    aksesuar.append(Kalem('Yarik hortum yan kapama contasi', 'B8505401', p('B8505401'), F9))
    aksesuar.append(Kalem('Kil firca', 'B8505305', p('B8505305'), F9))
    aksesuar.append(Kalem('BF oluk contasi (15mt paket)', 'B8505411', p('B8505411'), math.ceil(F6 / 15)))
    F24 = C3 * 1
    aksesuar.append(Kalem('BF motor panel gecme conta (7mt paket)', 'B8505412', p('B8505412'), F24))
    aksesuar.append(Kalem('Paslanmaz tabanli siyah kil firca', 'B8505102', p('B8505102'), F8))
    belt = pb.belt_line(round(G3 / C3), C3)
    if belt:
        sku, qty = belt
        aksesuar.append(Kalem('Triger zaman kayisi paketi', sku, p(sku), qty))
    aksesuar.append(Kalem('Poliamid orta destek citasi', 'B8505702', p('B8505702'), F12))
    aksesuar.append(Kalem('Baslangic-bitim makas panel takimi', 'P05003', p('P05003'), C3))
    F25 = G3 - (2 * C3)
    aksesuar.append(Kalem('Ara makas panel takimi', 'P05004', p('P05004'), F25))
    aksesuar.append(Kalem('Oluk baglanti takimi', 'P05007', p('P05007'), C3))
    aksesuar.append(Kalem('Ray baglanti takimi', 'P05008', p('P05008'), C3))
    aksesuar.append(Kalem('Duvar kose baglanti takimi sag/sol', 'P05011', p('P05011'), 2))
    if no_wall_bracket:
        F29 = 0
    else:
        bucket_module = 3 if 0 < F69 <= 4000 else (4 if 4000 < F69 <= 7000 else 0)
        bucket_depth = 3 if 0 < E3 <= 4000 else (4 if 4000 < E3 <= 7000 else 0)
        F29 = bucket_module * 2 * C3 + bucket_depth * 2
    aksesuar.append(Kalem('Duvar baglanti takimi', 'P05012', p('P05012'), F29))
    aksesuar.append(Kalem('Duvar modul birlesim takimi', 'P05013', p('P05013'), (C3 - 1) * 2))
    orta_destek_sku = 'P05039' if E69 == 'YATAY' else 'P05040'
    orta_destek_qty = C3 if F69 > 3500 else 0
    aksesuar.append(Kalem('Orta destek baglanti takimi', orta_destek_sku, p(orta_destek_sku), orta_destek_qty))
    aksesuar.append(Kalem('Premium su drenaj takimi', 'K05004', p('K05004'), C3 + 1))
    motor_sku = 'P05002' if somfy else 'P05001'
    aksesuar.append(Kalem('Motor ve aksam takimi', motor_sku, p(motor_sku), C3))
    kumanda5_sku = 'G05014' if somfy else 'G05011'
    aksesuar.append(Kalem('Kumanda (5 kanal)', kumanda5_sku, p(kumanda5_sku), 1))

    ctx = {'C2': C2, 'C3': C3, 'E3': E3, 'F9': F9, 'F15': F12, 'F35': orta_destek_qty, 'F36': orta_destek_qty}
    return profil, aksesuar, ctx


# ============================================================
# TIP 4: AG BIO SABIT 4 AYAK USTU (motorsuz/sabit, 4 ayakli)
# ============================================================
def _calc_sabit_4ayak(pb: PriceBook, genislik_mm, derinlik_mm_raw, yukseklik_mm,
                       corner_flat=False, finish_mult=1.0):
    p = pb.price
    C2, G2 = genislik_mm, yukseklik_mm
    C3, G3, E3 = pb.module_panel_count(C2, derinlik_mm_raw)
    F61 = C2 / C3
    F26 = C3 * 2 if F61 > 5500 else 0
    E61 = 'DIKEY'

    profil = []
    F5 = (((C2 - 297) - (140 * (C3 - 1))) * 2 + (E3 - 297) * 2) / 1000
    profil.append(Kalem('Kiris profili', 'B15224--', p('B15224--') * finish_mult, F5))
    F6 = (((C2 - 78) - (39 * C3 - 1)) * 2 + (E3 - 78) * (2 * C3)) / 1000
    profil.append(Kalem('Oluk profili', 'B15227--', p('B15227--') * finish_mult, F6))
    F7 = (E3 - 152 - 181) * 2 * C3 / 1000
    profil.append(Kalem('Sabit aksesuar adaptor profili', 'B15046--', p('B15046--') * finish_mult, F7))
    F8 = ((C2 - 248) - ((C3 - 1) * 280)) / 1000 * G3 / C3
    profil.append(Kalem('Panel profili', 'B15235--', p('B15235--') * finish_mult, F8))
    F9 = ((G2 - 8 - 4) / 1000) * (4 + ((C3 - 1) * 2)) + (((G2 - 8 - 4) / 1000) * F26)
    profil.append(Kalem('Dikme profili', 'B15242--', p('B15242--') * finish_mult, F9))
    F10 = ((G2 - 5 + 227) / 1000) * 8 if not corner_flat else 0
    profil.append(Kalem('Oval dikme kapak profili', 'B15244--', p('B15244--') * finish_mult, F10))
    if corner_flat:
        F11 = ((G2 - 8 + 227) / 1000) * (8 + ((C3 - 1) * 4)) + (((G2 - 8 + 227) / 1000) * F26 * 2)
    else:
        F11 = ((G2 - 8 + 227) / 1000) * ((C3 - 1) * 4) + (((G2 - 8 + 227) / 1000) * F26 * 2)
    profil.append(Kalem('Duz dikme kapak profili', 'B15245--', p('B15245--') * finish_mult, F11))
    F12 = (C3 * (E3 - 428)) / 1000 if C2 / C3 > 3500 else 0
    profil.append(Kalem('Orta destek profili', 'B15278--', p('B15278--') * finish_mult, F12))
    F13 = ((C3 - 1) * (E3 - 297)) / 1000
    profil.append(Kalem('Modul birlesim kiris profili', 'B15248--', p('B15248--') * finish_mult, F13))

    aksesuar = []
    aksesuar.append(Kalem('Yarik hortum yan kapama contasi', 'B8505401', p('B8505401'), F8))
    aksesuar.append(Kalem('Kil firca', 'B8505305', p('B8505305'), F8))
    aksesuar.append(Kalem('BF oluk contasi (15mt paket)', 'B8505411', p('B8505411'), math.ceil(F6 / 15)))
    aksesuar.append(Kalem('Poliamid orta destek citasi', 'B8505702', p('B8505702'), F12))
    aksesuar.append(Kalem('Sabit panel takimi', 'P05018', p('P05018'), G3))
    aksesuar.append(Kalem('Kose dikme baglanti takimi flansli', 'P05005', p('P05005'), 4))
    aksesuar.append(Kalem('Oluk baglanti takimi', 'P05007', p('P05007'), C3))
    aksesuar.append(Kalem('Sabit sistem baglanti takimi', 'P05019', p('P05019'), C3))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCX)', 'P05037', p('P05037'), C3 - 1))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCY)', 'P05038', p('P05038'), C3 - 1))
    aksesuar.append(Kalem('Yardimci dikme baglanti takimi', 'P05015', p('P05015'), F26))
    orta_destek_sku = 'P05039' if E61 == 'YATAY' else 'P05040'
    orta_destek_qty = C3 if F61 > 3500 else 0
    aksesuar.append(Kalem('Orta destek baglanti takimi', orta_destek_sku, p(orta_destek_sku), orta_destek_qty))
    aksesuar.append(Kalem('Premium su drenaj takimi', 'K05004', p('K05004'), C3 + 1))

    ctx = {'C2': C2, 'C3': C3, 'E3': E3, 'F9': F8, 'F15': F12, 'F35': orta_destek_qty, 'F27': orta_destek_qty}
    return profil, aksesuar, ctx


# ============================================================
# TIP 5: AG BIO SABIT DUVAR (motorsuz/sabit, duvara montajli)
# ============================================================
def _calc_sabit_duvar(pb: PriceBook, genislik_mm, derinlik_mm_raw, yukseklik_mm,
                       corner_flat=False, no_wall_bracket=False, finish_mult=1.0):
    p = pb.price
    C2, G2 = genislik_mm, yukseklik_mm
    C3, G3, E3 = pb.module_panel_count(C2, derinlik_mm_raw)
    F63 = C2 / C3
    F28 = C3 if F63 > 5500 else 0
    E63 = 'DIKEY'

    profil = []
    F5 = (((C2 - 88) - (140 * (C3 - 1))) * 2 + (E3 - 148.5) * 2) / 1000
    profil.append(Kalem('Kiris profili', 'B15224--', p('B15224--') * finish_mult, F5))
    F6 = (((C2 - 78) - (39 * C3 - 1)) * 2 + (E3 - 78) * (2 * C3)) / 1000
    profil.append(Kalem('Oluk profili', 'B15227--', p('B15227--') * finish_mult, F6))
    F7 = (E3 - 152 - 181) * 2 * C3 / 1000
    profil.append(Kalem('Sabit aksesuar adaptor profili', 'B15046--', p('B15046--') * finish_mult, F7))
    F8 = ((C2 - 248) - ((C3 - 1) * 280)) / 1000 * G3 / C3
    profil.append(Kalem('Panel profili', 'B15235--', p('B15235--') * finish_mult, F8))
    F9 = ((G2 - 5 - 4) / 1000) * (2 + ((C3 - 1) * 1)) + (((G2 - 8 - 4) / 1000) * F28)
    profil.append(Kalem('Dikme profili', 'B15242--', p('B15242--') * finish_mult, F9))
    F10 = ((G2 - 5 + 227) / 1000) * 4 if not corner_flat else 0
    profil.append(Kalem('Oval dikme kapak profili', 'B15244--', p('B15244--') * finish_mult, F10))
    if corner_flat:
        F11 = (((G2 - 5 + 227) / 1000) * (4 + ((C3 - 1) * 2))) + (((G2 - 8 - 4) / 1000) * F28)
    else:
        F11 = (((G2 - 5 + 227) / 1000) * ((C3 - 1) * 2)) + (((G2 - 8 - 4) / 1000) * F28)
    profil.append(Kalem('Duz dikme kapak profili', 'B15245--', p('B15245--') * finish_mult, F11))
    F12 = (C3 * (E3 - 428)) / 1000 if C2 / C3 > 3500 else 0
    profil.append(Kalem('Orta destek profili', 'B15278--', p('B15278--') * finish_mult, F12))
    F13 = ((C3 - 1) * (E3 - 297)) / 1000
    profil.append(Kalem('Modul birlesim kiris profili', 'B15248--', p('B15248--') * finish_mult, F13))

    aksesuar = []
    aksesuar.append(Kalem('Yarik hortum yan kapama contasi', 'B8505401', p('B8505401'), F8))
    aksesuar.append(Kalem('Kil firca', 'B8505305', p('B8505305'), F8))
    aksesuar.append(Kalem('BF oluk contasi (15mt paket)', 'B8505411', p('B8505411'), math.ceil(F6 / 15)))
    aksesuar.append(Kalem('Poliamid orta destek citasi', 'B8505702', p('B8505702'), F12))
    aksesuar.append(Kalem('Sabit panel takimi', 'P05018', p('P05018'), G3))
    aksesuar.append(Kalem('Kose dikme baglanti takimi gizli', 'P05029', p('P05029'), 2))
    aksesuar.append(Kalem('Oluk baglanti takimi', 'P05007', p('P05007'), C3))
    aksesuar.append(Kalem('Sabit sistem baglanti takimi', 'P05019', p('P05019'), C3))
    aksesuar.append(Kalem('Dikmeli modul baglanti takimi (MCX)', 'P05037', p('P05037'), C3 - 1))
    if not no_wall_bracket:
        aksesuar.append(Kalem('Duvar kose baglanti takimi sag/sol', 'P05011', p('P05011'), 1))
        bucket = 3 if 0 < F63 <= 4000 else (4 if 4000 < F63 <= 7000 else 0)
        aksesuar.append(Kalem('Duvar baglanti takimi', 'P05012', p('P05012'), bucket * C3))
    aksesuar.append(Kalem('Duvar modul birlesim takimi', 'P05013', p('P05013'), C3 - 1))
    aksesuar.append(Kalem('Yardimci dikme baglanti takimi', 'P05015', p('P05015'), F28))
    orta_destek_sku = 'P05039' if E63 == 'YATAY' else 'P05040'
    orta_destek_qty = C3 if F63 > 3500 else 0
    aksesuar.append(Kalem('Orta destek baglanti takimi', orta_destek_sku, p(orta_destek_sku), orta_destek_qty))
    aksesuar.append(Kalem('Premium su drenaj takimi', 'K05004', p('K05004'), C3 + 1))

    ctx = {'C2': C2, 'C3': C3, 'E3': E3, 'F9': F8, 'F15': F12, 'F35': orta_destek_qty, 'F29': orta_destek_qty}
    return profil, aksesuar, ctx


_TYPE_FUNCS = {
    '4ayak_ustu': (_calc_4ayak_ustu, True),
    '2ayak_duvar': (_calc_2ayak_duvar, True),
    'ayaksiz': (_calc_ayaksiz, False),
    'sabit_4ayak_ustu': (_calc_sabit_4ayak, False),
    'sabit_duvar': (_calc_sabit_duvar, False),
}


def calculate(
    tip: str,
    genislik_mm: float,
    derinlik_mm: float,
    yukseklik_mm: Optional[float] = None,
    corner_flat: bool = False,
    somfy: bool = False,
    no_wall_bracket: bool = False,
    finish: Optional[str] = None,
    led_option: Optional[str] = None,   # None | 'warm' | 'warm_rgb'
    led_mid_support: bool = False,
    kopuk: bool = False,
    alis_iskonto_pct: float = 0.0,
    montaj_bedeli: float = 0.0,
    kar_marji_pct: float = 0.0,
    odeme_tipi: str = 'nakit',
    price_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Bir Albert Genau sistemi icin tam fiyat kirilimini hesaplar.

    `odeme_tipi`: 'nakit' (varsayilan, KREDI KARTI liste fiyatinin *0.89'u) ya
    da 'kredi_karti' (liste fiyati, carpansiz) -- Excel'deki iki ayri sutuna
    (KREDI KARTINA TAKSITLI / NAKIT) karsilik gelir; musterinin sececegi
    odeme yontemine gore dogru rakam uretilsin diye.

    `price_data` verilmezse bu dosyadaki varsayilan/ilk-yuklenen Excel verisi
    kullanilir; canli kullanimda Mongo'daki guncel `albert_genau_config`
    kaydi buraya enjekte edilmelidir.
    """
    if tip not in _TYPE_FUNCS:
        raise ValueError(f"Bilinmeyen sistem tipi: {tip}")
    odeme_tipi_eff = odeme_tipi if odeme_tipi in ('nakit', 'kredi_karti') else 'nakit'
    pb = PriceBook(price_data, odeme_tipi=odeme_tipi_eff)
    choice = pb.depth_choice(derinlik_mm)
    if choice is not None:
        raise DepthChoiceRequired(choice['floorMm'], choice['ceilMm'], choice['rawMm'])
    finish_mult = _finish_multiplier(finish)
    func, needs_height = _TYPE_FUNCS[tip]

    kwargs = dict(finish_mult=finish_mult)
    if tip == '4ayak_ustu':
        kwargs.update(corner_flat=corner_flat, somfy=somfy, led_mid_support=led_mid_support)
        profil, aksesuar, ctx = func(pb, genislik_mm, derinlik_mm, yukseklik_mm, **kwargs)
        orta_destek_key = 'F35'
    elif tip == '2ayak_duvar':
        kwargs.update(corner_flat=corner_flat, somfy=somfy, no_wall_bracket=no_wall_bracket)
        profil, aksesuar, ctx = func(pb, genislik_mm, derinlik_mm, yukseklik_mm, **kwargs)
        orta_destek_key = 'F36'
    elif tip == 'ayaksiz':
        kwargs.update(corner_flat=corner_flat, somfy=somfy, no_wall_bracket=no_wall_bracket if no_wall_bracket else True)
        profil, aksesuar, ctx = func(pb, genislik_mm, derinlik_mm, **kwargs)
        orta_destek_key = 'F36'
    elif tip == 'sabit_4ayak_ustu':
        kwargs.update(corner_flat=corner_flat)
        profil, aksesuar, ctx = func(pb, genislik_mm, derinlik_mm, yukseklik_mm, **kwargs)
        orta_destek_key = 'F27'
    else:  # sabit_duvar
        kwargs.update(corner_flat=corner_flat, no_wall_bracket=no_wall_bracket)
        profil, aksesuar, ctx = func(pb, genislik_mm, derinlik_mm, yukseklik_mm, **kwargs)
        orta_destek_key = 'F29'

    # Profil (aluminyum) grubu maliyetine, gercek imalatta kacinilmaz kesim/
    # islem firesi icin %10 ek maliyet eklenir -- kullanicinin paylastigi
    # orijinal Excel'in TUM 5 sistem tipi analiz sayfasinda BIREBIR ayni
    # formul dogrulanmistir: P21 = (C19*1.1 + C40*1) - ((...)*iskonto) yani
    # "profil*1.1 + aksesuar*1" (bkz. hucre I41: "SISTEMIN TOPLAM FIRE
    # BEDELI; PROFIL TUTARININ %10'U KADAR KABUL EDILEREK HESAPLANMISTIR.").
    # Aksesuar grubuna VE opsiyonel (panel dolgu/LED/RGB) bloklarina fire
    # UYGULANMAZ -- o bloklarin kendi Excel formullerinde (C49/C57/C66) fire
    # carpani yoktur, dogrudan iskontoya tabi tutulurlar.
    PROFIL_FIRE_ORANI = 0.10
    profil_toplam_firesiz = sum(k.total for k in profil)
    profil_toplam = profil_toplam_firesiz * (1 + PROFIL_FIRE_ORANI)
    aksesuar_toplam = sum(k.total for k in aksesuar)

    opsiyonel_kalemler = []
    opsiyonel_toplam = 0.0
    if kopuk or led_option in ('warm', 'warm_rgb'):
        panel_dolgu, warm, rgb = _led_kopuk_bloklari(
            pb, ctx, led_mid_support=led_mid_support, finish_mult=finish_mult,
            orta_destek_qty_key=orta_destek_key,
        )
        if kopuk:
            opsiyonel_kalemler += panel_dolgu
            opsiyonel_toplam += sum(k.total for k in panel_dolgu)
        if led_option == 'warm':
            opsiyonel_kalemler += warm
            opsiyonel_toplam += sum(k.total for k in warm)
        elif led_option == 'warm_rgb':
            opsiyonel_kalemler += rgb
            opsiyonel_toplam += sum(k.total for k in rgb)

    maliyet_toplam = profil_toplam + aksesuar_toplam + opsiyonel_toplam

    # Is kurali (bayinin acik talimati):
    #   1) Alis iskontosu SADECE malzeme maliyetini dusurur -- montaj bedelini
    #      ve kar marjini ETKILEMEZ.
    #   2) Kar marji, SADECE (iskontolu) malzeme maliyeti uzerine uygulanir.
    #   3) Montaj bedeli en sonda DUZ (kar marjisiz) eklenir -- boylece montaja
    #      da yuzdelik kar konup toplam rakam "sisirilmis" olmaz.
    iskonto_pct_eff = alis_iskonto_pct or 0.0
    maliyet_indirimli = maliyet_toplam * (1 - iskonto_pct_eff / 100.0)
    kar_tutari = maliyet_indirimli * (kar_marji_pct or 0.0) / 100.0
    satis_fiyati = maliyet_indirimli + kar_tutari + montaj_bedeli

    return {
        'kind': 'geometric',
        'tip': tip,
        'tipAdi': SYSTEM_TYPE_LABELS[tip],
        'odemeTipi': odeme_tipi_eff,
        'girdi': {
            'genislikMm': genislik_mm,
            'derinlikMmGirilen': derinlik_mm,
            'yapilabilirDerinlikMm': ctx['E3'],
            'yukseklikMm': yukseklik_mm,
            'modulSayisi': ctx['C3'],
            # Derinlige gore bir moduldeki kanat/lamel (panel) sayisi -- sadece
            # teknik cizim onizlemesinde her modulun ic cizgi sayisini dogru
            # gostermek icin eklendi (bkz. server.py'deki teknik cizim uc noktasi).
            # ctx sozlugunde G3 saklanmadigi icin (bkz. yukaridaki _calc_* fonk.
            # ctx = {...} satirlari), ayni deterministik fonksiyonu burada tekrar
            # cagirmak -- pb.module_panel_count -- en guvenli yol.
            'panelSayisiModul': pb.module_panel_count(genislik_mm, derinlik_mm)[1],
        },
        'profilGrubuToplamFiresiz': round(profil_toplam_firesiz, 2),
        'profilFireOrani': PROFIL_FIRE_ORANI,
        'profilFireTutari': round(profil_toplam - profil_toplam_firesiz, 2),
        'profilGrubuToplam': round(profil_toplam, 2),
        'aksesuarGrubuToplam': round(aksesuar_toplam, 2),
        'opsiyonelToplam': round(opsiyonel_toplam, 2),
        'maliyetToplam': round(maliyet_toplam, 2),
        'alisIskontoPct': iskonto_pct_eff,
        'maliyetIndirimli': round(maliyet_indirimli, 2),
        'montajBedeli': round(montaj_bedeli, 2),
        'karMarjiPct': kar_marji_pct,
        'karTutari': round(kar_tutari, 2),
        'satisFiyati': round(satis_fiyati, 2),
        'kalemler': [k.dict() for k in (profil + aksesuar + opsiyonel_kalemler)],
    }


# ============ PARCA LISTESI SISTEMLERI (AIRFLEX ve benzerleri) ============
# BIOFLEX/BIO sistemlerinin aksine bu urun aileleri genislik/derinlik/yukseklik
# gibi bir OLCUYE degil, Albert Genau'nun kendi "SIPARIS FORMU" sekmesindeki
# duz parca listesi mantigina dayanir: bayi her kalem (profil/panel takimi/
# aksesuar) icin doğrudan MIKTAR girer, sistem kendisi bir geometriden
# turetilmez. Hangi SKU'lerin hangi sirada bir "sistem" olusturdugu burada
# SABIT KOD olarak tanimlanir (urun imalat mantigi degismedikce degismez);
# SKU'lerin isim/fiyati ise her zamanki gibi price_list veri katmanindan
# gelir -- boylece Albert Genau yeni bir fiyat listesi yayinladiginda burada
# hicbir sey degismeden sadece rakamlar guncellenir. Yeni bir urun ailesi
# (kullanicinin "hepsini ayri ayri yukleyecegim" dedigi diger Excel'ler)
# eklenecegi zaman, tek yapilmasi gereken: 1) SKU'lerini price_list'e eklemek,
# 2) burada PARTS_LIST_SYSTEMS'e yeni bir anahtar acmak -- yeni bir hesap
# fonksiyonu YAZMAYA gerek yok, calculate_parts_list() hepsini karsilar.
PARTS_LIST_SYSTEMS = {
    'airflex': {
        'label': 'AIRFLEX (Katlanır Cam Balkon)',
        'items': [
            'B15199--', 'B15200--', 'B15201--', 'B15202--', 'B15077--',
            'G05101', 'G05102', 'G05106', 'G05107',
            'G8505005', 'G8505006',
            'G05103', 'G05104', 'G05105',
        ],
    },
}


def _pl_price(pb: 'PriceBook', sku: str) -> float:
    """calculate_parts_list icin fiyat okuma yardimcisi. Normal PriceBook.price()
    ile ayni kural (odeme tipine gore NAKIT_FACTOR) uygulanir, ama SKU aktif
    fiyat listesinde (orn. firmanin AIRFLEX eklenmeden ONCE yukledigi eski
    kendi Excel'i) bulunamazsa, hesaplama tumden KILITLENMEK yerine bu
    paketin kendi varsayilan (Albert Genau'nun resmi) fiyatina duser --
    firma yeni urun ailesinin fiyatlarini kendi listesine ekleyip tekrar
    yukleyene kadar boslukta kalmasin diye. Bu, mevcut fiyat listesindeki bir
    SKU icin GERCEKTEN eksik/bozuk veri varsa hatayi gizlemez (o SKU zaten
    _DEFAULT_DATA'da da yoksa yine KeyError firlatilir)."""
    item = pb.price_list.get(sku) or _DEFAULT_DATA['price_list'].get(sku)
    if not item:
        raise KeyError(f"Fiyat listesinde bulunamayan SKU: {sku}")
    base = float(item['price'])
    return base * PriceBook.NAKIT_FACTOR if pb.odeme_tipi == 'nakit' else base


# ============ AIRFLEX MODUL HESABI (adet-bazli, olcu yerine sabit yukseklik) ============
# Kullanicinin (bayinin) acikca belirttigi is kurallari (bkz. sohbet/degisiklik
# gecmisi -- bunlar Albert Genau'nun kendi mühendislik kurallaridir, Excel'de
# formul olarak yazili degildi, bayiden alinan sozel bilgidir):
#   - Sistem yuksekligi HER ZAMAN 1850mm'dir (kullanicidan yukseklik ALINMAZ).
#   - "Adet" = tam bir sistem/modul sayisi. Her 1 adette, sistemin SAG ve SOL
#     tarafinda birer dikme cifti bulunur -> toplam 2 sabit dikme (B15199,
#     her biri 1000mm kesilir) + 2 hareketli dikme (B15200, her biri 850mm
#     kesilir) = adet basina 4 dikme parcasi.
#   - Panel takimlari da adet basina 2'ser gider: 2x hareketli panel takimi
#     (G05101) + 2x (sabit panel takimi G05102 YA DA tekerlekli sabit panel
#     takimi G05106 -- bayi hangisini kullanacagini secer, ikisi ayni anda
#     kullanilmaz).
#   - Kapi panel takimi (G05107) ve kilit takimi (G05103) ISTEGE BAGLI ve
#     adetten BAGIMSIZ: secilirse siparise sadece 1 adet olarak eklenir
#     (bir hatta genelde tek bir kapi/kilit noktasi olur).
#   - Genislik girdisinin profil/panel hesabina hicbir etkisi YOK. Sadece CAM
#     (alüminyum profillerden ayri, Albert Genau'nun fiyat listesinde OLMAYAN,
#     bayinin kendi tedarik ettigi bir kalem) genislige gore hesaplanir: sabit
#     paneller 10mm temperli, hareketli paneller 8mm temperli cam kullanir;
#     bayi cami kendi fiyatiyla (TL/m2) girer, yukseklik sabit 1850mm ile
#     carpilip alan bulunur ve toplama en sonda eklenir.
AIRFLEX_MODUL_YUKSEKLIK_M = 1.850
AIRFLEX_SABIT_DIKME_KESIM_M = 1.000
AIRFLEX_HAREKETLI_DIKME_KESIM_M = 0.850
AIRFLEX_DIKME_ADET_KATSAYISI = 2  # sag + sol
AIRFLEX_PANEL_TAKIM_ADET_KATSAYISI = 2  # sag + sol


def calculate_airflex_module(
    adet: int,
    tekerlekli: bool = False,
    kapi_var: bool = False,
    kilit_var: bool = False,
    cam_sabit_genislik_mm: float = 0.0,
    cam_sabit_fiyat_m2: float = 0.0,
    cam_hareketli_genislik_mm: float = 0.0,
    cam_hareketli_fiyat_m2: float = 0.0,
    finish: Optional[str] = None,
    alis_iskonto_pct: float = 0.0,
    montaj_bedeli: float = 0.0,
    kar_marji_pct: float = 0.0,
    odeme_tipi: str = 'nakit',
    price_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """AIRFLEX katlanir cam balkon sistemi icin adet-bazli fiyat hesabi.
    Yukarida acikca belgelenen sabit is kurallarini kullanir (bkz. modul
    basi yorum)."""
    if adet is None or adet < 1:
        raise ValueError("Adet en az 1 olmalidir")

    odeme_tipi_eff = odeme_tipi if odeme_tipi in ('nakit', 'kredi_karti') else 'nakit'
    pb = PriceBook(price_data, odeme_tipi=odeme_tipi_eff)
    finish_mult = _finish_multiplier(finish)

    kalemler = []

    def add_kalem(sku: str, qty: float):
        item = pb.price_list.get(sku) or _DEFAULT_DATA['price_list'].get(sku) or {}
        label = item.get('name', sku)
        price = _pl_price(pb, sku) * finish_mult
        kalemler.append(Kalem(label=label, sku=sku, price=price, qty=qty))

    # Dikme profilleri: adet x 2 (sag+sol), her biri sabit kesim boyunda.
    add_kalem('B15199--', adet * AIRFLEX_DIKME_ADET_KATSAYISI * AIRFLEX_SABIT_DIKME_KESIM_M)
    add_kalem('B15200--', adet * AIRFLEX_DIKME_ADET_KATSAYISI * AIRFLEX_HAREKETLI_DIKME_KESIM_M)

    # Panel takimlari: adet x 2.
    add_kalem('G05101', adet * AIRFLEX_PANEL_TAKIM_ADET_KATSAYISI)  # hareketli panel takimi
    sabit_panel_sku = 'G05106' if tekerlekli else 'G05102'
    add_kalem(sabit_panel_sku, adet * AIRFLEX_PANEL_TAKIM_ADET_KATSAYISI)

    # Kapi + kilit: adetten bagimsiz, secilirse sabit 1 adet.
    if kapi_var:
        add_kalem('G05107', 1)
    if kilit_var:
        add_kalem('G05103', 1)

    malzeme_toplam = sum(k.total for k in kalemler)

    # Cam: Albert Genau fiyat listesinde YOK -- bayi kendi fiyatiyla girer.
    # Panel sayisi kadar cam varsayilir (sabit/tekerlekli panel takimi ile
    # hareketli panel takimi sayilari zaten adet x 2 idi).
    cam_sabit_adet = adet * AIRFLEX_PANEL_TAKIM_ADET_KATSAYISI
    cam_hareketli_adet = adet * AIRFLEX_PANEL_TAKIM_ADET_KATSAYISI
    cam_sabit_alan_m2 = cam_sabit_adet * (cam_sabit_genislik_mm / 1000.0) * AIRFLEX_MODUL_YUKSEKLIK_M
    cam_hareketli_alan_m2 = cam_hareketli_adet * (cam_hareketli_genislik_mm / 1000.0) * AIRFLEX_MODUL_YUKSEKLIK_M
    cam_sabit_maliyet = cam_sabit_alan_m2 * cam_sabit_fiyat_m2
    cam_hareketli_maliyet = cam_hareketli_alan_m2 * cam_hareketli_fiyat_m2
    cam_toplam = cam_sabit_maliyet + cam_hareketli_maliyet

    if cam_sabit_maliyet > 0:
        kalemler.append(Kalem(
            label=f"Cam (Sabit Panel, 10mm Temperli, {cam_sabit_genislik_mm:.0f}x{AIRFLEX_MODUL_YUKSEKLIK_M*1000:.0f}mm)",
            sku='CAM-SABIT', price=cam_sabit_fiyat_m2, qty=round(cam_sabit_alan_m2, 3),
        ))
    if cam_hareketli_maliyet > 0:
        kalemler.append(Kalem(
            label=f"Cam (Hareketli Panel, 8mm Temperli, {cam_hareketli_genislik_mm:.0f}x{AIRFLEX_MODUL_YUKSEKLIK_M*1000:.0f}mm)",
            sku='CAM-HAREKETLI', price=cam_hareketli_fiyat_m2, qty=round(cam_hareketli_alan_m2, 3),
        ))

    maliyet_toplam = malzeme_toplam + cam_toplam

    iskonto_pct_eff = alis_iskonto_pct or 0.0
    maliyet_indirimli = maliyet_toplam * (1 - iskonto_pct_eff / 100.0)
    kar_tutari = maliyet_indirimli * (kar_marji_pct or 0.0) / 100.0
    satis_fiyati = maliyet_indirimli + kar_tutari + montaj_bedeli

    return {
        'kind': 'airflex_modul',
        'tip': 'airflex_modul',
        'tipAdi': 'AIRFLEX (Katlanır Cam Balkon)',
        'odemeTipi': odeme_tipi_eff,
        'girdi': {
            'adet': adet,
            'tekerlekli': tekerlekli,
            'kapiVar': kapi_var,
            'kilitVar': kilit_var,
            'yukseklikMm': AIRFLEX_MODUL_YUKSEKLIK_M * 1000,
        },
        'malzemeGrubuToplam': round(malzeme_toplam, 2),
        'camGrubuToplam': round(cam_toplam, 2),
        'maliyetToplam': round(maliyet_toplam, 2),
        'alisIskontoPct': iskonto_pct_eff,
        'maliyetIndirimli': round(maliyet_indirimli, 2),
        'montajBedeli': round(montaj_bedeli, 2),
        'karMarjiPct': kar_marji_pct,
        'karTutari': round(kar_tutari, 2),
        'satisFiyati': round(satis_fiyati, 2),
        'kalemler': [k.dict() for k in kalemler],
    }


def parts_list_items(system_id: str, price_data: Optional[Dict[str, Any]] = None):
    """Frontend'in miktar giris formunu olusturabilmesi icin, bir parca
    listesi sisteminin kalemlerini (sku/isim/birim), Excel'deki sirasiyla
    dondurur."""
    system = PARTS_LIST_SYSTEMS.get(system_id)
    if not system:
        raise ValueError(f"Bilinmeyen parca listesi sistemi: {system_id}")
    active = (price_data or {}).get('price_list') or {}
    default = _DEFAULT_DATA['price_list']
    out = []
    for sku in system['items']:
        item = active.get(sku) or default.get(sku) or {}
        out.append({'sku': sku, 'label': item.get('name', sku), 'unit': item.get('unit', '')})
    return out


def calculate_parts_list(
    system_id: str,
    quantities: Dict[str, float],
    finish: Optional[str] = None,
    alis_iskonto_pct: float = 0.0,
    montaj_bedeli: float = 0.0,
    kar_marji_pct: float = 0.0,
    odeme_tipi: str = 'nakit',
    price_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """AIRFLEX gibi "duz parca listesi" urun aileleri icin fiyat hesabi.

    Not (bilinen varsayim): kaynak Excel'de (BIOFLEX'in aksine, bkz. yukaridaki
    PROFIL_FIRE_ORANI notu) ayri bir imalat/kesim FIRESI orani belirtilmemis --
    bu yuzden burada fire payi UYGULANMAZ (fireOrani=0). Albert Genau ileride
    bunun icin de bir oran belirtirse `PARTS_LIST_FIRE_ORANI` guncellenmelidir.
    """
    system = PARTS_LIST_SYSTEMS.get(system_id)
    if not system:
        raise ValueError(f"Bilinmeyen parca listesi sistemi: {system_id}")

    odeme_tipi_eff = odeme_tipi if odeme_tipi in ('nakit', 'kredi_karti') else 'nakit'
    pb = PriceBook(price_data, odeme_tipi=odeme_tipi_eff)
    finish_mult = _finish_multiplier(finish)

    kalemler = []
    for sku in system['items']:
        qty = float((quantities or {}).get(sku) or 0)
        if qty <= 0:
            continue
        item = pb.price_list.get(sku) or _DEFAULT_DATA['price_list'].get(sku) or {}
        label = item.get('name', sku)
        price = _pl_price(pb, sku) * finish_mult
        kalemler.append(Kalem(label=label, sku=sku, price=price, qty=qty))

    if not kalemler:
        raise ValueError("En az bir kalem icin miktar girilmelidir")

    PARTS_LIST_FIRE_ORANI = 0.0
    malzeme_toplam_firesiz = sum(k.total for k in kalemler)
    fire_tutari = malzeme_toplam_firesiz * PARTS_LIST_FIRE_ORANI
    maliyet_toplam = malzeme_toplam_firesiz + fire_tutari

    iskonto_pct_eff = alis_iskonto_pct or 0.0
    maliyet_indirimli = maliyet_toplam * (1 - iskonto_pct_eff / 100.0)
    kar_tutari = maliyet_indirimli * (kar_marji_pct or 0.0) / 100.0
    satis_fiyati = maliyet_indirimli + kar_tutari + montaj_bedeli

    return {
        'kind': 'parts_list',
        'tip': system_id,
        'tipAdi': system['label'],
        'odemeTipi': odeme_tipi_eff,
        'malzemeGrubuToplamFiresiz': round(malzeme_toplam_firesiz, 2),
        'fireOrani': PARTS_LIST_FIRE_ORANI,
        'fireTutari': round(fire_tutari, 2),
        'maliyetToplam': round(maliyet_toplam, 2),
        'alisIskontoPct': iskonto_pct_eff,
        'maliyetIndirimli': round(maliyet_indirimli, 2),
        'montajBedeli': round(montaj_bedeli, 2),
        'karMarjiPct': kar_marji_pct,
        'karTutari': round(kar_tutari, 2),
        'satisFiyati': round(satis_fiyati, 2),
        'kalemler': [k.dict() for k in kalemler],
    }


# ============ VERTIFLEX (Giyotin/Dusey Sürme Cam Balkon) SISTEMLERI ============
# 2026/04 Haziran "GİYOTİN" Excel'inden (6 sistem: V MONO 08, V TWIN,
# V TAMBALKON, V UP TWIN, V MONO 08 ALL GLASS, STATU IMPETUS CLEAN TWIN) elle
# port edilmis formuller. BIOFLEX gibi genislik/yukseklik (mm) girdili
# GEOMETRIK bir aile ama farkli imalat mantigi (dusey giyotin, akordiyon
# degil) oldugu icin ayri fonksiyonlar olarak tutuluyor. Her fonksiyonun
# "profil_net" (kar/iskonto/fire oncesi profil+yan malzeme toplami) degeri,
# Excel'in kendi ANALIZ sekmesindeki E2=3500/F2=2500 ornek degerlerine karsi
# BIREBIR (ondalik hanesine kadar) capraz dogrulanmistir (bkz. gecmis/degisim
# notlari). NOT: BIOFLEX'in aksine bu Excel'de ayri bir imalat/kesim FIRESI
# orani belirtilmemis (tam tersine "FİRE VB. GİDERLER DİKKATE ALINMAMIŞTIR"
# notu var) -- bu yuzden burada da (AIRFLEX'te oldugu gibi) fire_orani=0
# kullanilir.
VERTIFLEX_SYSTEM_TYPES = [
    'vertiflex_mono08',
    'vertiflex_twin',
    'vertiflex_tambalkon',
    'vertiflex_up_twin',
    'vertiflex_mono08_all_glass',
    'impetus_clean_twin',
]

VERTIFLEX_TYPE_LABELS = {
    'vertiflex_mono08': 'VERTIFLEX MONO 08',
    'vertiflex_twin': 'VERTIFLEX TWIN',
    'vertiflex_tambalkon': 'VERTIFLEX TAMBALKON',
    'vertiflex_up_twin': 'VERTIFLEX UP TWIN',
    'vertiflex_mono08_all_glass': 'VERTIFLEX MONO 08 ALL GLASS',
    'impetus_clean_twin': 'STATU IMPETUS CLEAN TWIN',
}

_KUMANDA_SKU = {
    'ag': {1: 'G05010', 5: 'G05011', 16: 'G05012'},
    'somfy': {1: 'G05013', 5: 'G05014'},
}

# Frontend'in her VERTIFLEX tipi icin dogru formu (panel sayisi / motor /
# kumanda kanali / inox / alicisiz / su tahliyeli / secumax taraf / kac cam
# kalemi) kod tekrari yapmadan cizebilmesi icin tip->secenekler haritasi.
# calculate_vertiflex() icindeki dallanma mantigiyla (bkz. yukaridaki kwargs
# derlemesi) BIREBIR ayni kurallari yansitir.
VERTIFLEX_TYPE_META = {
    'vertiflex_mono08': {
        'panelSayisiOptions': ['2', '3'],
        'motorOptions': ['ag', 'somfy'],
        'kumandaKanalOptions': {'ag': [1, 5, 16], 'somfy': [1, 5]},
        'kumandaOptional': True,
        'inoxZincirli': True,
        'alicisiz': False,
        'suTahliyeliAltKasa': False,
        'secumaxTaraf': False,
        'camSkus': [{'sku': 'CAM-8MM-TEMPERLI', 'label': '8mm Temperli Cam'}],
    },
    'vertiflex_twin': {
        'panelSayisiOptions': ['2', '3', '4'],
        'motorOptions': ['ag', 'somfy'],
        'kumandaKanalOptions': {'ag': [1, 5, 16], 'somfy': [1, 5]},
        'kumandaOptional': True,
        'inoxZincirli': True,
        'alicisiz': True,
        'suTahliyeliAltKasa': True,
        'secumaxTaraf': False,
        'camSkus': [{'sku': 'CAM-ISICAM-TEMPERLI', 'label': '5mm Temperli+12mm HB+5mm Temperli Isicam'}],
    },
    'vertiflex_tambalkon': {
        'panelSayisiOptions': ['2', '3'],
        'motorOptions': ['ag', 'somfy'],
        'kumandaKanalOptions': {'ag': [1, 5, 16], 'somfy': [1, 5]},
        'kumandaOptional': True,
        'inoxZincirli': False,
        'alicisiz': False,
        'suTahliyeliAltKasa': False,
        'secumaxTaraf': False,
        'camSkus': [
            {'sku': 'CAM-ISICAM-TEMPERLI', 'label': '5mm Temperli+12mm HB+5mm Temperli Isicam'},
            {'sku': 'CAM-ISICAM-LAMINAT', 'label': '4+4.1mm Laminat+9mm HB+5mm Temperli Isicam'},
        ],
    },
    'vertiflex_up_twin': {
        'panelSayisiOptions': ['2', '3'],
        'motorOptions': ['ag', 'somfy'],
        'kumandaKanalOptions': {'ag': [1, 5, 16], 'somfy': [1, 5]},
        'kumandaOptional': True,
        'inoxZincirli': False,
        'alicisiz': False,
        'suTahliyeliAltKasa': False,
        'secumaxTaraf': True,
        'camSkus': [{'sku': 'CAM-ISICAM-TEMPERLI', 'label': '5mm Temperli+12mm HB+5mm Temperli Isicam'}],
    },
    'vertiflex_mono08_all_glass': {
        'panelSayisiOptions': [],
        'motorOptions': ['ag', 'somfy'],
        'kumandaKanalOptions': {'ag': [1, 5, 16], 'somfy': [1, 5]},
        'kumandaOptional': True,
        'inoxZincirli': True,
        'alicisiz': False,
        'suTahliyeliAltKasa': False,
        'secumaxTaraf': False,
        'camSkus': [{'sku': 'CAM-8MM-TEMPERLI', 'label': '8mm Temperli Cam'}],
    },
    'impetus_clean_twin': {
        'panelSayisiOptions': [],
        'motorOptions': ['ag'],
        'kumandaKanalOptions': {'ag': [1, 5, 15]},
        'kumandaOptional': False,
        'inoxZincirli': False,
        'alicisiz': False,
        'suTahliyeliAltKasa': False,
        'secumaxTaraf': False,
        'camSkus': [
            {'sku': 'CAM-ISICAM-TEMPERLI', 'label': '5mm Temperli+12mm HB+5mm Temperli Isicam'},
            {'sku': 'CAM-ISICAM-LAMINAT', 'label': '4+4.1mm Laminat+9mm HB+5mm Temperli Isicam'},
        ],
    },
}


def _vf_kalem(pb: 'PriceBook', sku: str, qty: float, finish_mult: float = 1.0, apply_finish: bool = False) -> Kalem:
    """VERTIFLEX kalemi olustur -- sadece PROFIL (aluminyum) kalemlerine
    finish_mult uygulanir (apply_finish=True), aksesuar/motor/panel-seti gibi
    hazir parcalara uygulanmaz -- BIOFLEX'teki ayni kural (bkz. yukaridaki
    _calc_4ayak_ustu ve benzerleri: sadece profil listesi finish_mult alır)."""
    item = pb.price_list.get(sku) or _DEFAULT_DATA['price_list'].get(sku) or {}
    label = item.get('name', sku)
    price = _pl_price(pb, sku) * (finish_mult if apply_finish else 1.0)
    return Kalem(label=label, sku=sku, price=price, qty=qty)


def _calc_vertiflex_mono08(pb, E2, F2, panel_sayisi='3', motor='ag', kumanda_kanal=5,
                            inox_zincirli=False, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    uclu = panel_sayisi == '3'

    b15133_qty = (E2 - 180) * 4 / 1000 if uclu else (E2 - 180) * 2 / 1000
    profil = [
        K('B15130--', (F2 - 137) * 2 / 1000),
        K('B15131--', (F2 - 137) * 2 / 1000),
        K('B15132--', (F2 - 137) * 4 / 1000),
        K('B15133--', b15133_qty),
        K('B15153--', (((F2 - 137) * 1 / 3) * 2) / 1000 if uclu else (((F2 - 137) * 1 / 2) * 2) / 1000),
        K('B15135--', (((E2 - 90 - 90) * 2) + ((F2 - 137) * 1 / 3) * 2) / 1000 if uclu else ((E2 - 90 - 90) * 2) / 1000),
        K('B15115--', ((E2 - 6) * 2) / 1000),
        K('B15136--', ((F2 - 137) * 2) / 1000 if uclu else ((F2 - 137) + (F2 / 2)) * 2 / 1000),
        K('B15119--', (E2 - 180) / 1000),
        K('TS8503201', (E2 - 75) / 1000, fin=False),
        K('B8505401', (((E2 - 6) * 3) + (E2 - 180) * 2) / 1000, fin=False),
        K('B8505405', ((E2 - 6) * 1) / 1000, fin=False),
        K('B8505308', b15133_qty * 2, fin=False),
        K('B8505305', (F2 - 137) * 6 * 2 / 1000 if uclu else (F2 - 137) * 3 * 2 / 1000, fin=False),
    ]

    aksesuar = [K('G05032' if motor == 'ag' else 'G05033', 1, fin=False)]
    kumanda_sku = _KUMANDA_SKU.get(motor, {}).get(kumanda_kanal)
    if kumanda_sku:
        aksesuar.append(K(kumanda_sku, 1, fin=False))
    if uclu:
        aksesuar.append(K('G05063' if inox_zincirli else 'G05034', 1, fin=False))
    else:
        aksesuar.append(K('G05064' if inox_zincirli else 'G05035', 1, fin=False))

    cam = [('8mm Temperli Cam', 'CAM-8MM-TEMPERLI', (E2 - 134) * (F2 - 185 - 37) / 1000000)]
    return profil, aksesuar, cam


def _calc_vertiflex_twin(pb, E2, F2, panel_sayisi='3', motor='ag', kumanda_kanal=5,
                          inox_zincirli=False, alicisiz=False, su_tahliyeli=False, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    uclu, ikili, dortlu = panel_sayisi == '3', panel_sayisi == '2', panel_sayisi == '4'
    F22 = 1 if su_tahliyeli else 0

    profil = [
        K('B15122--', (F2 - 137 - (F22 * 27)) * 2 / 1000),
        K('B15118--', (F2 - 137 - (F22 * 27)) * 2 / 1000),
        K('B15117--', (F2 - 137 - (F22 * 27)) * 4 / 1000),
    ]
    if dortlu:
        profil.append(K('B15137--', (F2 - 137 - (F22 * 27)) * 2 / 1000))
    if uclu:
        b15114 = (E2 - 184) * 4 / 1000
    elif ikili:
        b15114 = (E2 - 184) * 2 / 1000
    else:
        b15114 = (E2 - 184) * 7 / 1000
    profil.append(K('B15114--', b15114))
    if uclu:
        b15121 = (((E2 - 92 - 92) * 2) + ((F2 - 137 - (F22 * 27)) * 2 / 3) * 2) / 1000
    elif ikili:
        b15121 = (((E2 - 92 - 92) * 2) + ((F2 - 137 - (F22 * 27)) * 1 / 2) * 2) / 1000
    else:
        b15121 = (((E2 - 92 - 92) * 1) + ((F2 - 137 - (F22 * 27)) * (3 / 4)) * 2) / 1000
    profil.append(K('B15121--', b15121))
    profil.append(K('B15115--', ((E2 - 6) * 2) / 1000))
    if uclu:
        b15120 = ((F2 - 137 - (F22 * 27)) * 2) / 1000
    elif ikili:
        b15120 = ((F2 - 137 - (F22 * 27)) + ((F2 - 137 - (F22 * 27)) / 2)) * 2 / 1000
    else:
        b15120 = ((F2 - 137 - (F22 * 27)) + ((F2 - 137 - (F22 * 27)) / 2)) * 2 / 1000
    profil.append(K('B15120--', b15120))
    if not dortlu:
        profil.append(K('B15119--', (E2 - 184) / 1000))
    if F22 == 1 and not dortlu:
        profil.append(K('B15281--', (E2 - 16 - 16) / 1000))
    profil.append(K('TS8503201', (E2 - 75) / 1000, fin=False))
    profil.append(K('B8505401', (((E2 - 6) * 3) + (E2 - 184) * 2) / 1000, fin=False))
    profil.append(K('B8505405', ((E2 - 6) * 1) / 1000, fin=False))
    profil.append(K('B8505308', b15114 * 2, fin=False))
    if uclu:
        b8505305 = (F2 - 137) * 6 * 2 / 1000
    elif ikili:
        b8505305 = (F2 - 137) * 4 * 2 / 1000
    else:
        b8505305 = (F2 - 137) * 8 * 2 / 1000
    profil.append(K('B8505305', b8505305, fin=False))

    if motor == 'ag':
        motor_sku = 'G05039' if alicisiz else 'G05001'
    else:
        motor_sku = 'G05054' if alicisiz else 'G05002'
    aksesuar = [K(motor_sku, 1, fin=False)]
    kumanda_sku = _KUMANDA_SKU.get(motor, {}).get(kumanda_kanal)
    if kumanda_sku:
        aksesuar.append(K(kumanda_sku, 1, fin=False))
    if uclu:
        panel_sku = 'G05060' if inox_zincirli else 'G05003'
    elif ikili:
        panel_sku = 'G05061' if inox_zincirli else 'G05004'
    else:
        panel_sku = 'G05062' if inox_zincirli else 'G05037'
    aksesuar.append(K(panel_sku, 1, fin=False))
    if F22 == 1 and not dortlu:
        aksesuar.append(K('G8500205', 1, fin=False))

    cam = [('5mm Temperli+12mm HB+5mm Temperli Isicam', 'CAM-ISICAM-TEMPERLI',
            (E2 - 141) * (F2 - 185 - 37 - (F22 * 27)) / 1000000)]
    return profil, aksesuar, cam


def _calc_vertiflex_tambalkon(pb, E2, F2, panel_sayisi='3', motor='ag', kumanda_kanal=5, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    uclu = panel_sayisi == '3'

    C14 = (((F2 - 137) * 1 / 3) * 2) / 1000 if uclu else (((F2 - 137) * 1 / 2) * 2) / 1000
    b15114 = (E2 - 184) * 2 / 1000 if uclu else (E2 - 184) * 1 / 1000
    profil = [
        K('B15122--', (F2 - 137) * 2 / 1000),
        K('B15118--', (F2 - 137) * 2 / 1000 - C14),
        K('B15117--', ((F2 - 137) * 4 / 1000) - C14),
        K('B15114--', b15114),
        K('B15121--', ((((E2 - 92 - 92) * 1) + ((F2 - 137) * 2 / 3) * 2) / 1000) if uclu
          else ((((E2 - 92 - 92) * 1) + ((F2 - 137) * 1 / 2) * 2) / 1000)),
        K('B15115--', ((E2 - 6) * 2) / 1000),
        K('B15120--', (((F2 - 137) * 2) / 1000) if uclu else (((F2 - 137) + (F2 / 2)) * 2 / 1000)),
        K('B15119--', (E2 - 184) / 1000),
        K('B15139--', ((E2 - 28) * 1) / 1000),
        K('B15140--', (E2 - 184) * 2 / 1000 if uclu else (E2 - 184) * 1 / 1000),
        K('B15141--', C14),
        K('B15142--', C14),
        K('B15143--', (E2 - 184) * 1 / 1000 if uclu else 0.0),
        K('B15164--', C14),
        K('B15145--', 0.0 if uclu else (E2 - 184) * 1 / 1000),
        K('TS8503201', (E2 - 75) / 1000, fin=False),
        K('B8505401', (((E2 - 6) * 3) + (E2 - 184) * 2) / 1000, fin=False),
        K('AW1600106', E2 * 4 / 1000, fin=False),
        K('B8505405', ((E2 - 6) * 1) / 1000, fin=False),
        K('B8505308', b15114 * 2, fin=False),
        K('B8505305', (((F2 - 137) * 6 * 2 / 1000) + (C14 * 2)) if uclu else (((F2 - 137) * 3 * 2 / 1000) + (C14 * 2)), fin=False),
    ]

    aksesuar = [K('G05001' if motor == 'ag' else 'G05002', 1, fin=False)]
    kumanda_sku = _KUMANDA_SKU.get(motor, {}).get(kumanda_kanal)
    if kumanda_sku:
        aksesuar.append(K(kumanda_sku, 1, fin=False))
    aksesuar.append(K('G05040' if uclu else 'G05041', 1, fin=False))

    if uclu:
        cam_lam_m2 = ((E2 - 141) * (F2 - 185 - 37) / 1000000) * (1 / 3)
    else:
        cam_lam_m2 = ((E2 - 141) * (F2 - 185 - 37) / 1000000) * (1 / 2)
    cam_temp_m2 = ((E2 - 141) * (F2 - 185 - 37) / 1000000) - cam_lam_m2
    cam = [
        ('5mm Temperli+12mm HB+5mm Temperli Isicam', 'CAM-ISICAM-TEMPERLI', cam_temp_m2),
        ('4+4.1mm Laminat+9mm HB+5mm Temperli Isicam', 'CAM-ISICAM-LAMINAT', cam_lam_m2),
    ]
    return profil, aksesuar, cam


def _calc_vertiflex_up_twin(pb, E2, F2, panel_sayisi='3', motor='ag', secumax_taraf='sag',
                             kumanda_kanal=5, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    uclu = panel_sayisi == '3'

    b15114 = (E2 - 184) * 4 / 1000 if uclu else (E2 - 184) * 2 / 1000
    profil = [
        K('B15122--', (F2 - 137) * 2 / 1000),
        K('B15118--', (F2 - 137) * 2 / 1000),
        K('B15117--', (F2 - 137) * 4 / 1000),
    ]
    if uclu:
        profil.append(K('B15137--', (F2 - 137) * 2 / 1000))
    profil.append(K('B15114--', b15114))
    profil.append(K('B15121--', ((F2 - 137) * 2) / 1000))
    profil.append(K('B15115--', ((E2 - 6) * 2) / 1000))
    b15120 = ((F2 - 137) * 2 * 2) / 1000 if uclu else (((F2 - 137) + ((F2 - 137) / 2)) * 2) / 1000
    profil.append(K('B15120--', b15120))
    profil.append(K('B15144--', (E2 - 172) * 1 / 1000))
    profil.append(K('B15123--', (E2 - 184) * 1 / 1000))
    profil.append(K('B15169--', (E2 - 184) * 1 / 1000))
    profil.append(K('TS8503201', (E2 - 75) / 1000, fin=False))
    profil.append(K('B8505401', (((E2 - 6) * 4) + (E2 - 184) * 2) / 1000, fin=False))
    profil.append(K('B8505308', b15114 * 2, fin=False))
    b8505305 = (F2 - 137) * 6 * 2 / 1000 if uclu else (F2 - 137) * 4 * 2 / 1000
    profil.append(K('B8505305', b8505305, fin=False))

    if motor == 'ag':
        secumax_sku = 'G05043' if secumax_taraf == 'sag' else 'G05044'
    else:
        secumax_sku = 'G05045' if secumax_taraf == 'sag' else 'G05046'
    aksesuar = [K(secumax_sku, 1, fin=False)]
    kumanda_sku = _KUMANDA_SKU.get(motor, {}).get(kumanda_kanal)
    if kumanda_sku:
        aksesuar.append(K(kumanda_sku, 1, fin=False))
    aksesuar.append(K('G05047' if uclu else 'G05048', 1, fin=False))

    cam = [('5mm Temperli+12mm HB+5mm Temperli Isicam', 'CAM-ISICAM-TEMPERLI',
            (E2 - 141) * (F2 - 185 - 37) / 1000000)]
    return profil, aksesuar, cam


def _calc_vertiflex_mono08_all_glass(pb, E2, F2, motor='ag', kumanda_kanal=5, inox=False, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    profil = [
        K('B15130--', (F2 - 137) * 2 / 1000),
        K('B15131--', (F2 - 137) * 2 / 1000),
        K('B15132--', (F2 - 137) * 4 / 1000),
        K('B15153--', (((F2 - 137) * 1 / 2) * 2) / 1000),
        K('B15135--', ((E2 - 90 - 90) * 1) / 1000),
        K('B15115--', ((E2 - 6) * 2) / 1000),
        K('B15136--', ((F2 - 137) + (F2 / 2)) * 2 / 1000),
        K('TS8503201', (E2 - 75) / 1000, fin=False),
        K('B8505401', ((E2 - 6) * 2) / 1000, fin=False),
        K('B8505305', (F2 - 137) * 3 * 2 / 1000, fin=False),
    ]
    aksesuar = [K('G05032' if motor == 'ag' else 'G05033', 1, fin=False)]
    kumanda_sku = _KUMANDA_SKU.get(motor, {}).get(kumanda_kanal)
    if kumanda_sku:
        aksesuar.append(K(kumanda_sku, 1, fin=False))
    aksesuar.append(K('G05059' if inox else 'G05058', 1, fin=False))

    cam = [('8mm Temperli Cam', 'CAM-8MM-TEMPERLI', (E2 - 134) * (F2 - 185 - 37) / 1000000)]
    return profil, aksesuar, cam


def _calc_impetus_clean_twin(pb, E2, F2, kumanda_kanal=1, finish_mult=1.0):
    K = lambda sku, qty, fin=True: _vf_kalem(pb, sku, qty, finish_mult, fin)
    C8 = (((F2 - 137 - 36) / 3) * 2) / 1000
    C9 = (((F2 - 137 - 36) * 2 / 3) * 2) / 1000
    b15119 = (E2 - 207) / 1000
    b15316 = (E2 - 15 - 15) / 1000

    profil = [
        K('B15115--', ((E2 - 6) * 2) / 1000),
        K('B15119--', b15119),
        K('B15304--', ((F2 - 137 - 36) * 2) / 1000),
        K('B15306--', ((F2 - 137 - 36) * 2) / 1000),
        K('B15308--', C8),
        K('B15309--', C9),
        K('B15311--', C9),
        K('B15312--', (E2 - 207) * 2 / 1000),
        K('B15313--', (E2 - 207) * 1 / 1000),
        K('B15314--', (E2 - 207) * 2 / 1000),
        K('B15315--', (E2 - 207) * 1 / 1000),
        K('B15316--', b15316),
        K('TS8503201', (E2 - 75) / 1000, fin=False),
        K('B8505305', ((E2 - 6) * 2) / 1000, fin=False),
        K('B8505401', C8 + b15119 + C9, fin=False),
        K('AW1600106', b15316, fin=False),
        K('B8505405', ((E2 - 6) * 1) / 1000, fin=False),
        K('B8505308', (((E2 - 207) * 10) + (F2 * 4 * 2)) / 1000, fin=False),
    ]
    kumanda_map = {1: 'G05087', 5: 'G05088', 15: 'G05089'}
    aksesuar = [
        K('G05080', 1, fin=False),
        K(kumanda_map.get(kumanda_kanal, 'G05087'), 1, fin=False),
        K('G05084', 1, fin=False),
    ]
    cam_lam_m2 = ((E2 - 117 - 117) * (F2 - 172 - 49) * (1 / 3)) / 1000000
    cam_temp_m2 = ((E2 - 117 - 117) * (F2 - 172 - 49) / 1000000) - cam_lam_m2
    cam = [
        ('5mm Temperli+12mm HB+5mm Temperli Isicam', 'CAM-ISICAM-TEMPERLI', cam_temp_m2),
        ('4+4.1mm Laminat+9mm HB+5mm Temperli Isicam', 'CAM-ISICAM-LAMINAT', cam_lam_m2),
    ]
    return profil, aksesuar, cam


_VERTIFLEX_FUNCS = {
    'vertiflex_mono08': _calc_vertiflex_mono08,
    'vertiflex_twin': _calc_vertiflex_twin,
    'vertiflex_tambalkon': _calc_vertiflex_tambalkon,
    'vertiflex_up_twin': _calc_vertiflex_up_twin,
    'vertiflex_mono08_all_glass': _calc_vertiflex_mono08_all_glass,
    'impetus_clean_twin': _calc_impetus_clean_twin,
}


def calculate_vertiflex(
    tip: str,
    genislik_mm: float,
    yukseklik_mm: float,
    panel_sayisi: Optional[str] = None,        # '2' | '3' | '4' (tipe gore gecerli secenekler degisir)
    motor: str = 'ag',                          # 'ag' | 'somfy'
    kumanda_kanal: Optional[int] = None,        # 1 | 5 | 16 (ag) / 1 | 5 (somfy) / 1|5|15 (statu) -- None = kumanda eklenmez
    secumax_taraf: str = 'sag',                 # sadece UP TWIN: 'sag' | 'sol'
    inox_zincirli: bool = False,                # MONO 08 / TWIN panel setinde INOX zincirli alternatif
    alicisiz: bool = False,                     # sadece TWIN: alicisiz motor seti
    su_tahliyeli_alt_kasa: bool = False,        # sadece TWIN
    finish: Optional[str] = None,
    cam_fiyatlari_m2: Optional[Dict[str, float]] = None,  # {'CAM-8MM-TEMPERLI': 1200} gibi -- cam() etiketlerinden sku'ya gore
    alis_iskonto_pct: float = 0.0,
    montaj_bedeli: float = 0.0,
    kar_marji_pct: float = 0.0,
    odeme_tipi: str = 'nakit',
    price_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """VERTIFLEX/STATU IMPETUS (dusey giyotin cam balkon) ailesi icin tam fiyat
    kirilimi. BIOFLEX'teki `calculate()` ile ayni sozlesmeyi (odeme_tipi,
    price_data, iskonto/kar/montaj is kurallari) paylasir; Albert Genau'nun
    cami kendi fiyat listesinde SATMADIGI icin (BIOFLEX'te de boyle) bayi cami
    kendi m² fiyatiyla `cam_fiyatlari_m2` sozlugunden girer -- anahtar, ilgili
    sistemin cam kaleminin sku'su (CAM-8MM-TEMPERLI / CAM-ISICAM-TEMPERLI /
    CAM-ISICAM-LAMINAT); girilmezse o cam kalemi 0 TL ile (miktar bilgisi
    korunarak) listelenir."""
    if tip not in _VERTIFLEX_FUNCS:
        raise ValueError(f"Bilinmeyen VERTIFLEX sistem tipi: {tip}")
    odeme_tipi_eff = odeme_tipi if odeme_tipi in ('nakit', 'kredi_karti') else 'nakit'
    pb = PriceBook(price_data, odeme_tipi=odeme_tipi_eff)
    finish_mult = _finish_multiplier(finish)
    func = _VERTIFLEX_FUNCS[tip]

    kwargs: Dict[str, Any] = dict(finish_mult=finish_mult)
    default_panel = {'vertiflex_mono08': '3', 'vertiflex_twin': '3', 'vertiflex_tambalkon': '3',
                      'vertiflex_up_twin': '3'}.get(tip)
    if tip == 'vertiflex_mono08':
        kwargs.update(panel_sayisi=panel_sayisi or default_panel, motor=motor,
                      kumanda_kanal=kumanda_kanal, inox_zincirli=inox_zincirli)
    elif tip == 'vertiflex_twin':
        kwargs.update(panel_sayisi=panel_sayisi or default_panel, motor=motor,
                      kumanda_kanal=kumanda_kanal, inox_zincirli=inox_zincirli,
                      alicisiz=alicisiz, su_tahliyeli=su_tahliyeli_alt_kasa)
    elif tip == 'vertiflex_tambalkon':
        kwargs.update(panel_sayisi=panel_sayisi or default_panel, motor=motor, kumanda_kanal=kumanda_kanal)
    elif tip == 'vertiflex_up_twin':
        kwargs.update(panel_sayisi=panel_sayisi or default_panel, motor=motor,
                      secumax_taraf=secumax_taraf, kumanda_kanal=kumanda_kanal)
    elif tip == 'vertiflex_mono08_all_glass':
        kwargs.update(motor=motor, kumanda_kanal=kumanda_kanal, inox=inox_zincirli)
    else:  # impetus_clean_twin
        kwargs.update(kumanda_kanal=kumanda_kanal or 1)

    profil, aksesuar, cam_defs = func(pb, genislik_mm, yukseklik_mm, **kwargs)

    cam_fiyatlari = cam_fiyatlari_m2 or {}
    cam_kalemleri = []
    cam_toplam = 0.0
    for label, cam_sku, alan_m2 in cam_defs:
        birim_fiyat = float(cam_fiyatlari.get(cam_sku) or 0)
        k = Kalem(label=f"{label} ({alan_m2:.2f} m²)", sku=cam_sku, price=birim_fiyat, qty=round(alan_m2, 3))
        cam_kalemleri.append(k)
        cam_toplam += k.total

    # BIOFLEX'in aksine bu ailede belgelenmis bir imalat firesi orani yok
    # (Excel'in kendi notu: "FİRE VB. GİDERLER DİKKATE ALINMAMIŞTIR") --
    # AIRFLEX'teki gibi fire_orani=0 kullanilir.
    profil_toplam = sum(k.total for k in profil)
    aksesuar_toplam = sum(k.total for k in aksesuar)
    maliyet_toplam = profil_toplam + aksesuar_toplam + cam_toplam

    iskonto_pct_eff = alis_iskonto_pct or 0.0
    maliyet_indirimli = maliyet_toplam * (1 - iskonto_pct_eff / 100.0)
    kar_tutari = maliyet_indirimli * (kar_marji_pct or 0.0) / 100.0
    satis_fiyati = maliyet_indirimli + kar_tutari + montaj_bedeli

    return {
        'kind': 'vertiflex',
        'tip': tip,
        'tipAdi': VERTIFLEX_TYPE_LABELS[tip],
        'odemeTipi': odeme_tipi_eff,
        'girdi': {
            'genislikMm': genislik_mm,
            'yukseklikMm': yukseklik_mm,
            'panelSayisi': kwargs.get('panel_sayisi'),
            'motor': motor,
        },
        'profilGrubuToplam': round(profil_toplam, 2),
        'aksesuarGrubuToplam': round(aksesuar_toplam, 2),
        'camGrubuToplam': round(cam_toplam, 2),
        'maliyetToplam': round(maliyet_toplam, 2),
        'alisIskontoPct': iskonto_pct_eff,
        'maliyetIndirimli': round(maliyet_indirimli, 2),
        'montajBedeli': round(montaj_bedeli, 2),
        'karMarjiPct': kar_marji_pct,
        'karTutari': round(kar_tutari, 2),
        'satisFiyati': round(satis_fiyati, 2),
        'kalemler': [k.dict() for k in (profil + aksesuar + cam_kalemleri)],
    }

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

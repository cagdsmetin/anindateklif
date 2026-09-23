"""ag_geometry birim testleri -- calisan backend gerektirmez (saf fonksiyonlar).

Kapsam:
- onerilen_kanat_sayisi: Winnice'te gozlenen bolunmeyle ayni sonucu veriyor mu
- cephe_zinciri: kanat tipleri, global numaralandirma, alan/genislik toplami
- KOSE DIKMESI tek sayiliyor mu (bu modulun var olma sebebi)
- son cephenin sag acisi her zaman 'duvar'a zorlaniyor mu
- cam olculeri: profil dusumu yokken None, varken dogru
- modul_semasi / giyotin_semasi yerlesimi
- hatali girdiler GeometriHatasi firlatiyor mu

NOT: `uyarilar`/`aciklama` metinleri musteriye giden teklif PDF'ine basiliyor,
bu yuzden duzgun Turkce yazilmis durumda; asagidaki assert'ler de o metinlere
bakiyor (dosyanin geri kalani ASCII yorum kullansa da).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ag_geometry import (  # noqa: E402
    GeometriHatasi,
    cephe_zinciri,
    giyotin_semasi,
    modul_semasi,
    onerilen_kanat_sayisi,
)


# ---------------------------------------------------------------- kanat sayisi

@pytest.mark.parametrize('genislik,beklenen', [
    (4000, 7),   # Winnice'te 4000mm -> 7 kanat
    (2200, 4),   # Winnice'te 2200mm -> 4 kanat
    (600, 1),
    (601, 2),
    (1, 1),
])
def test_onerilen_kanat_sayisi(genislik, beklenen):
    assert onerilen_kanat_sayisi(genislik) == beklenen


def test_onerilen_kanat_sayisi_ozel_max():
    assert onerilen_kanat_sayisi(4000, max_kanat_mm=500) == 8
    # gecersiz max varsayilana duser
    assert onerilen_kanat_sayisi(4000, max_kanat_mm=0) == 7


# ---------------------------------------------------------------- cephe zinciri

def test_tek_cephe_temel_alanlar():
    m = cephe_zinciri([{'genislikMm': 4000, 'yukseklikMm': 2500}])
    assert m['kind'] == 'cephe'
    assert m['toplamKanat'] == 7
    assert m['cepheler'][0]['kanatSayisi'] == 7
    assert m['cepheler'][0]['sagAci'] == 'duvar'
    assert m['toplamAlanM2'] == 10.0
    assert m['toplamGenislikMm'] == 4000.0


def test_kanat_tipleri_sola_topla():
    m = cephe_zinciri([{'genislikMm': 4000, 'yukseklikMm': 2500, 'toplanmaYonu': 'sola'}])
    tipler = [k['tip'] for k in m['kanatlar']]
    assert tipler[0] == 'sola_acilir'          # kapi kanadi
    assert set(tipler[1:]) == {'sola_kayar'}


def test_kanat_tipleri_saga_ve_sola():
    m = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'kanatSayisi': 6,
         'toplanmaYonu': 'sagavesola'},
    ])
    tipler = [k['tip'] for k in m['kanatlar']]
    assert tipler == ['sola_acilir', 'sola_kayar', 'sola_kayar',
                      'saga_kayar', 'saga_kayar', 'saga_acilir']


def test_kanat_tipleri_sabit_ve_kaydir():
    sabit = cephe_zinciri([{'genislikMm': 1200, 'yukseklikMm': 2500, 'toplanmaYonu': 'sabit'}])
    assert {k['tip'] for k in sabit['kanatlar']} == {'sabit'}

    kaydir = cephe_zinciri([{'genislikMm': 1200, 'yukseklikMm': 2500,
                             'toplanmaYonu': 'sola_kaydir'}])
    # kaydir'da kapi kanadi yok
    assert {k['tip'] for k in kaydir['kanatlar']} == {'sola_kayar'}


def test_kanatlar_cepheler_boyunca_kesintisiz_numaralanir():
    m = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2200, 'yukseklikMm': 2500},
    ])
    assert m['toplamKanat'] == 11
    assert [k['sira'] for k in m['kanatlar']] == list(range(1, 12))
    # ikinci cephenin ilk kanadi global 8, cephe ici 1
    sekizinci = m['kanatlar'][7]
    assert (sekizinci['cephe'], sekizinci['cepheIci']) == (2, 1)


def test_kose_dikmesi_paylasilan_dikmeyi_TEK_sayar():
    """Bu modulun var olma sebebi: L balkonda kose dikmesi iki cephenin
    ORTAK dikmesidir. Bayi iki ayri hesap yapip topladiginda iki kez
    sayiliyordu."""
    l_balkon = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2200, 'yukseklikMm': 2500},
    ])
    assert l_balkon['koseSayisi'] == 1
    assert l_balkon['koseDikmesi'] == 1

    u_balkon = cephe_zinciri([
        {'genislikMm': 2000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2000, 'yukseklikMm': 2500},
    ])
    assert u_balkon['koseDikmesi'] == 2


def test_son_cephenin_sag_acisi_duvara_zorlanir():
    m = cephe_zinciri([
        {'genislikMm': 2000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2000, 'yukseklikMm': 2500, 'sagAci': 135},
    ])
    assert m['cepheler'][0]['sagAci'] == 90.0
    assert m['cepheler'][1]['sagAci'] == 'duvar'   # sagindaki cephe yok
    assert m['koseDikmesi'] == 1


def test_serbest_aci_kabul_edilir_gecersiz_aci_duvara_duser():
    m = cephe_zinciri([
        {'genislikMm': 2000, 'yukseklikMm': 2500, 'sagAci': 112.5},
        {'genislikMm': 2000, 'yukseklikMm': 2500, 'sagAci': 999},
        {'genislikMm': 2000, 'yukseklikMm': 2500},
    ])
    assert m['cepheler'][0]['sagAci'] == 112.5
    assert m['cepheler'][1]['sagAci'] == 'duvar'  # 999 gecersiz


def test_adet_alani_toplamlara_carpan_olarak_girer():
    m = cephe_zinciri([{'genislikMm': 2000, 'yukseklikMm': 2500, 'adet': 3}])
    assert m['toplamAlanM2'] == 15.0
    assert m['toplamGenislikMm'] == 6000.0
    # adet kanat sayisini cogaltmaz -- cizim tek cepheyi gosterir
    assert m['toplamKanat'] == 4


def test_az_kanat_girilirse_uyarir():
    m = cephe_zinciri([{'genislikMm': 4000, 'yukseklikMm': 2500, 'kanatSayisi': 3}])
    assert m['cepheler'][0]['kanatSayisi'] == 3
    assert m['cepheler'][0]['onerilenKanatSayisi'] == 7
    assert any('önerilen en az 7' in u for u in m['uyarilar'])


# ---------------------------------------------------------------- cam olculeri

def test_profil_dusumu_yokken_cam_olculeri_gosterilmez():
    m = cephe_zinciri([{'genislikMm': 4000, 'yukseklikMm': 2500}])
    assert m['camOlculeriGuvenilir'] is False
    assert all(k['camGenislikMm'] is None for k in m['kanatlar'])
    assert any('profil düşüm' in u for u in m['uyarilar'])


def test_profil_dusumu_verilince_cam_olculeri_hesaplanir():
    m = cephe_zinciri(
        [{'genislikMm': 4000, 'yukseklikMm': 2500, 'kanatSayisi': 7}],
        profil_dusumu={'yukseklikDusumuMm': 162, 'kanatBindirmeMm': 20, 'yanPayMm': 30},
    )
    assert m['camOlculeriGuvenilir'] is True
    k = m['kanatlar'][0]
    # (4000 - 2*30 - 6*20) / 7 = 3820/7 = 545.7
    assert k['camGenislikMm'] == 545.7
    assert k['camYukseklikMm'] == 2338.0


def test_eksik_profil_dusumu_sessizce_yok_sayilir():
    m = cephe_zinciri(
        [{'genislikMm': 4000, 'yukseklikMm': 2500}],
        profil_dusumu={'kanatBindirmeMm': 20},   # zorunlu yukseklikDusumuMm yok
    )
    assert m['camOlculeriGuvenilir'] is False


def test_dusum_olcuden_buyukse_cam_olcusu_uretilmez():
    m = cephe_zinciri(
        [{'genislikMm': 4000, 'yukseklikMm': 100}],
        profil_dusumu={'yukseklikDusumuMm': 162, 'kanatBindirmeMm': 20, 'yanPayMm': 30},
    )
    assert all(k['camYukseklikMm'] is None for k in m['kanatlar'])


# ---------------------------------------------------------------- hatali girdi

def test_bos_cephe_listesi_hata():
    with pytest.raises(GeometriHatasi):
        cephe_zinciri([])


@pytest.mark.parametrize('bozuk', [
    {'genislikMm': 0, 'yukseklikMm': 2500},
    {'genislikMm': -100, 'yukseklikMm': 2500},
    {'genislikMm': 'abc', 'yukseklikMm': 2500},
    {'genislikMm': 4000},
])
def test_gecersiz_olcu_hata(bozuk):
    with pytest.raises(GeometriHatasi):
        cephe_zinciri([bozuk])


# ---------------------------------------------------------------- modul semasi

def test_modul_semasi_genisligi_esit_boler():
    m = modul_semasi(genislik_mm=7000, derinlik_mm=4000,
                     modul_sayisi=2, lamel_sayisi_toplam=34)
    assert m['kind'] == 'modul'
    assert len(m['moduller']) == 2
    assert m['moduller'][0]['genislikMm'] == 3500.0
    assert m['toplamAlanM2'] == 28.0


def test_lamel_toplami_modul_basina_bolunur():
    """module_panel_count'un G3 degeri TUM modullerin toplamidir (adi
    `panelSayisiModul` olsa da). Cizimde her module toplam konursa cok
    modullu pergolada lamel sayisi katlanir."""
    m = modul_semasi(genislik_mm=12000, derinlik_mm=4340,
                     modul_sayisi=2, lamel_sayisi_toplam=34)
    assert m['lamelSayisiToplam'] == 34          # fiyat hesabinin kullandigi
    assert m['lamelSayisiModul'] == 17           # cizimde bir module dusen
    assert all(mo['lamelSayisi'] == 17 for mo in m['moduller'])


def test_tek_modulde_toplam_ve_modul_basina_ayni():
    m = modul_semasi(genislik_mm=5000, derinlik_mm=3870,
                     modul_sayisi=1, lamel_sayisi_toplam=15)
    assert m['lamelSayisiModul'] == 15
    assert m['moduller'][0]['lamelSayisi'] == 15


def test_modul_semasi_asiri_lamel_cizim_icin_kirpilir():
    m = modul_semasi(genislik_mm=7000, derinlik_mm=4000,
                     modul_sayisi=1, lamel_sayisi_toplam=120)
    assert m['moduller'][0]['lamelSayisi'] == 40
    assert m['lamelSayisiToplam'] == 120         # gercek deger korunur
    assert m['uyarilar']


def test_modul_semasi_gecersiz_olcu_hata():
    with pytest.raises(GeometriHatasi):
        modul_semasi(genislik_mm=0, derinlik_mm=4000,
                     modul_sayisi=1, lamel_sayisi_toplam=8)


# -------------------------------------------------------------- giyotin semasi

def test_giyotin_alt_panel_sabit_ustundekiler_hareketli():
    """Giyotinde en alttaki panel her zaman sabittir; ustundekiler asagi
    kayip onun arkasina paketlenir. 3 panelde: ustte 2 hareketli, altta
    1 sabit."""
    m = giyotin_semasi('vertiflex_mono08', genislik_mm=3000, yukseklik_mm=2400, panel_sayisi=3)
    assert m['kind'] == 'giyotin'
    assert [p['hareketli'] for p in m['paneller']] == [True, True, False]
    assert m['paneller'][-1]['yon'] is None          # sabit panel
    assert m['paneller'][0]['yon'] == 'asagi'
    assert m['paneller'][0]['yukseklikMm'] == 800.0


@pytest.mark.parametrize('n,beklenen', [
    (2, [True, False]),
    (3, [True, True, False]),
    (4, [True, True, True, False]),
])
def test_giyotin_her_panel_sayisinda_alt_sabit(n, beklenen):
    m = giyotin_semasi('vertiflex_twin', 3000, 2400, n)
    assert [p['hareketli'] for p in m['paneller']] == beklenen


def test_giyotin_twin_iki_hareket_grubu():
    mono = giyotin_semasi('vertiflex_mono08', 3000, 2400, 3)
    twin = giyotin_semasi('vertiflex_twin', 3000, 2400, 3)
    assert mono['hareketGrubu'] == 1
    assert twin['hareketGrubu'] == 2


def test_giyotin_tek_panel_sabit_sayilmaz():
    """Tek panelde arkasina paketlenecek sabit panel yok."""
    m = giyotin_semasi('vertiflex_mono08', 3000, 2400, 1)
    assert m['paneller'][0]['hareketli'] is True


def test_giyotin_bilinmeyen_tip_tek_gruba_duser():
    m = giyotin_semasi('bilinmeyen_tip', 3000, 2400, 2)
    assert m['hareketGrubu'] == 1


# ------------------------------------------------------------ BC koprusu

from ag_geometry import bc_oneri, bc_ref_haritasi  # noqa: E402

TIARA_KANAT = {
    'C18': {'label': 'TIARA 08 KAYAR KANAT TAKIMI', 'default': 0},
    'C19': {'label': 'TIARA 08 MENTEŞELİ KANAT TAKIMI', 'default': 1},
    'C20': {'label': 'TIARA 08 İSPANYOLETLİ MENTEŞELİ KT. 800 mm.', 'default': 0},
    'C22': {'label': 'TIARA 08 SABİT KANAT TAKIMI', 'default': 0},
}
TIARA_FLAG = {
    'F14': {'label': 'BALKON U VEYA L BALKON İSE KÖŞE SAYISINI, KUTUYA YAZINIZ',
            'kind': 'count', 'default': 0},
    'F28': {'label': 'CAMLARI DELİKLİ ÜRETMEK İSTİYORSANIZ 1 YAZINIZ',
            'kind': 'bool', 'default': 1},
}
YONLU_KANAT = {
    'C20': {'label': 'SLIDER NEXT ALL GLASS SAĞ KAYAR KANAT TAKIMI', 'default': 0},
    'C21': {'label': 'SLIDER NEXT ALL GLASS SOL KAYAR KANAT TAKIMI', 'default': 0},
    'C23': {'label': 'SLIDER NEXT BARELLİ KANCALI KİLİT TAKIMI', 'default': 0},
}


def test_ref_haritasi_kategorileri_etiketten_cikarir():
    h = bc_ref_haritasi(TIARA_KANAT, TIARA_FLAG)
    assert h['kategoriler'] == {'C18': 'kayar', 'C19': 'mentese', 'C22': 'sabit'}
    # ispanyoletli satir kanat sayisi degil -- kategorilenmez
    assert 'C20' not in h['kategoriler']
    assert h['koseRef'] == 'F14'


def test_ref_haritasi_kose_alanini_ref_yerine_etiketten_bulur():
    """Kose alani tipe gore F11/F12/F14/F15/F16 olabiliyor."""
    for ref in ('F11', 'F12', 'F15', 'F16'):
        h = bc_ref_haritasi(TIARA_KANAT, {
            ref: {'label': 'U VEYA L BALKON İSE KÖŞE SAYISI', 'kind': 'count', 'default': 0},
        })
        assert h['koseRef'] == ref


def test_kose_alani_yoksa_none_doner():
    h = bc_ref_haritasi(TIARA_KANAT, {'F16': {'label': 'ARA ÇITA İSTİYORSANIZ 1 YAZINIZ',
                                              'kind': 'count', 'default': 0}})
    assert h['koseRef'] is None


def test_bc_oneri_l_balkon_kanatlari_ve_koseyi_doldurur():
    model = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2200, 'yukseklikMm': 2500},
    ])
    o = bc_oneri(model, TIARA_KANAT, TIARA_FLAG)
    # her cephenin bir kapi kanadi var -> 2 menteseli, kalan 9 kayar
    assert o['kanatMiktarlari'] == {'C18': 9, 'C19': 2}
    assert o['bayrakDegerleri'] == {'F14': 1}
    assert sum(o['kanatMiktarlari'].values()) == model['toplamKanat']


def test_bc_oneri_kapi_kanadini_kendi_yonundeki_alana_yazar():
    """Yonlu ref'i olan tipte sag kapi sag alana, sol kapi sol alana."""
    model = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'kanatSayisi': 6,
         'toplanmaYonu': 'sagavesola'},
    ])
    o = bc_oneri(model, YONLU_KANAT, {})
    assert o['kanatMiktarlari'] == {'C20': 3, 'C21': 3}
    assert any('kendi yönündeki' in a for a in o['aciklama'])


def test_bc_oneri_hicbir_kanadi_dusurmez():
    """Kaybolan kanat = eksik fiyat. Tip yon ayrimi yapmasa da toplam tutmali."""
    model = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'kanatSayisi': 6,
         'toplanmaYonu': 'sagavesola'},
    ])
    sadece_kayar = {'C18': {'label': 'KAYAR KANAT TAKIMI', 'default': 0}}
    o = bc_oneri(model, sadece_kayar, {})
    assert o['kanatMiktarlari'] == {'C18': 6}
    assert not any('Dikkat' in a for a in o['aciklama'])


def test_bc_oneri_kilit_takimlarina_dokunmaz():
    model = cephe_zinciri([{'genislikMm': 2000, 'yukseklikMm': 2500}])
    o = bc_oneri(model, YONLU_KANAT, {})
    assert 'C23' not in o['kanatMiktarlari']       # kilit takimi
    assert any('kilit/ispanyolet' in a for a in o['aciklama'])


def test_bc_oneri_kose_alani_yoksa_uyarir():
    model = cephe_zinciri([
        {'genislikMm': 4000, 'yukseklikMm': 2500, 'sagAci': 90},
        {'genislikMm': 2200, 'yukseklikMm': 2500},
    ])
    o = bc_oneri(model, TIARA_KANAT, {})
    assert o['bayrakDegerleri'] == {}
    assert any('köşe sayısı alanı bulunamadı' in a for a in o['aciklama'])

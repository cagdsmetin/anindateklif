import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import { useAuth } from '@/src/state/AuthContext';
import {
  api,
  AlbertGenauResultT,
  AlbertGenauTypesResponseT,
  AlbertGenauCalculateInputT,
  AlbertGenauPriceListStatusT,
  AlbertGenauAirflexModuleResultT,
  AlbertGenauVertiflexResultT,
  AlbertGenauVertiflexTypesResponseT,
  AlbertGenauVertiflexTypeMetaT,
  AlbertGenauKisBahcesiResultT,
  AlbertGenauKisBahcesiTypesResponseT,
  AlbertGenauKisBahcesiTypeMetaT,
  AlbertGenauBcResultT,
  AlbertGenauBcTypesResponseT,
  AlbertGenauBcTypeMetaT,
  AlbertGenauYedekParcaResultT,
  AlbertGenauYedekParcaItemsResponseT,
  AlbertGenauYedekParcaItemT,
  RatesT,
  fetchAlbertGenauExcelBytes,
  fetchAlbertGenauDrawingBytes,
} from '@/src/lib/api';
import { bytesToBase64, AttachmentT } from '@/src/lib/pdf-merge';
import { downloadFileWeb } from '@/src/lib/web-download';
import NavDrawer from '@/src/components/NavDrawer';
import { Aurora, BorderBeam, CountUp, MotionScrollView, Reveal, TiltOnScroll, alpha, themedStyles } from '@/src/components/motion';
import { AG, AGS, Axis, DimField, Sheet, SystemRow } from '@/src/components/albert/ag-kit';
import Elevation from '@/src/components/albert/Elevation';

// Albert Genau parametrik pergola/bioklimatik hesaplayıcı — genel Katalog ve
// Ürün/Hizmet Yapılandırıcı'dan tamamen ayrı bir bölüm. Dealer genişlik/
// derinlik/yükseklik (mm) girer, Albert Genau'nun kendi Excel maliyet
// analizinden çıkarılmış gerçek formüllerle (backend/albert_genau_calc.py)
// tam malzeme listesi + fiyat otomatik hesaplanır. Montaj bedeli ve kar
// marjı burada dealer tarafından serbestçe belirlenir.

const FALLBACK_TYPES = [
  { id: '4ayak_ustu', label: 'AG BIOFLEX 4 Ayak Üstü' },
  { id: '2ayak_duvar', label: 'AG BIOFLEX 2 Ayak Duvar' },
  { id: 'ayaksiz', label: 'AG BIOFLEX Ayaksız' },
  { id: 'sabit_4ayak_ustu', label: 'AG BIO Sabit 4 Ayak Üstü' },
  { id: 'sabit_duvar', label: 'AG BIO Sabit Duvar' },
];

const FALLBACK_FINISHES = ['SATINE_NATUREL', 'ANTRASIT_GRI', 'BRONZ_1122_BOYALI', 'DIGER_RAL', 'BRONZ_ELOKSAL', 'PRES'];

// Ölçü (genişlik/derinlik) yerine düz parça listesi + miktar girişiyle çalışan
// ürün aileleri (bkz. backend/albert_genau_calc.py PARTS_LIST_SYSTEMS). Bu
// dizi sadece ilk yüklemede (meta gelene kadar) kısa bir varsayım -- gerçek
// liste her zaman /albert-genau/types üzerinden gelir, kullanıcının "hepsini
// ayrı ayrı yükleyeceğim" dediği yeni ürün aileleri backend'e eklendikçe
// burada hiçbir değişiklik gerekmeden otomatik görünür.
const FALLBACK_PARTS_LIST_SYSTEMS = [{ id: 'airflex', label: 'AIRFLEX (Katlanır Cam Balkon)' }];

// VERTIFLEX (dikey giyotin cam balkon, 6 alt tip) -- gerçek liste + tip
// bazlı seçenekler /albert-genau/vertiflex/types üzerinden gelir (bkz.
// backend ag_calc.VERTIFLEX_TYPE_META). Bu sadece ilk yükleme varsayımı.
const FALLBACK_VERTIFLEX_TYPES: AlbertGenauVertiflexTypeMetaT[] = [
  { id: 'vertiflex_mono08', label: 'VERTIFLEX MONO 08', panelSayisiOptions: ['2', '3'], motorOptions: ['ag', 'somfy'], kumandaKanalOptions: { ag: [1, 5, 16], somfy: [1, 5] }, kumandaOptional: true, inoxZincirli: true, alicisiz: false, suTahliyeliAltKasa: false, secumaxTaraf: false, camSkus: [{ sku: 'CAM-8MM-TEMPERLI', label: '8mm Temperli Cam' }] },
];

// Backend meta'sı eksik ya da kısmi gelirse (örn. VERTIFLEX_SYSTEM_TYPES'a
// VERTIFLEX_TYPE_META karşılığı olmayan bir tip eklenirse) tüm ekran çökmesin
// diye tip meta'sı okunmadan önce buradan geçirilir: eksik alanlar "bu tipte
// böyle bir seçenek yok" anlamına gelen güvenli varsayılanlara iner.
const safeVertiflexTypeMeta = (
  tm?: Partial<AlbertGenauVertiflexTypeMetaT> | null,
): AlbertGenauVertiflexTypeMetaT => ({
  id: tm?.id || '',
  label: tm?.label || '',
  panelSayisiOptions: tm?.panelSayisiOptions || [],
  motorOptions: tm?.motorOptions || [],
  kumandaKanalOptions: tm?.kumandaKanalOptions || {},
  // Meta yoksa kumanda opsiyonel sayılır -- kanal seçenekleri de boş
  // olacağı için aksi halde kullanıcıya hiçbir geçerli seçim kalmaz.
  kumandaOptional: tm?.kumandaOptional ?? true,
  inoxZincirli: !!tm?.inoxZincirli,
  alicisiz: !!tm?.alicisiz,
  suTahliyeliAltKasa: !!tm?.suTahliyeliAltKasa,
  secumaxTaraf: !!tm?.secumaxTaraf,
  camSkus: tm?.camSkus || [],
});

const VF_KUMANDA_LABELS: Record<number, string> = { 1: 'Tek Kanal', 5: '5 Kanal', 15: '15 Kanal', 16: '16 Kanal' };

// KIŞ BAHÇESİ (sabit cam tavanlı, 2 alt tip: PREMIUM 08-10 / PREMIUM TWIN) --
// gerçek liste + tip bazlı seçenekler /albert-genau/kis-bahcesi/types
// üzerinden gelir (bkz. backend ag_calc.KIS_BAHCESI_TYPE_META). Bu sadece
// ilk yükleme varsayımı.
const FALLBACK_KIS_BAHCESI_TYPES: AlbertGenauKisBahcesiTypeMetaT[] = [
  {
    id: 'kis_bahcesi_premium_08_10', label: 'KIŞ BAHÇESİ PREMIUM 08-10',
    ayarliDuvarBaglantisi: true, kirisUstuVidaKapama: true, ortaKayit: true, ucgenMikroPencere: true,
    camSkus: [
      { sku: 'CAM-KB0810-TAVAN', label: '4.4.2 (8,76) / 5.5.2 (10,76) Laminat Cam (Tavan)' },
      { sku: 'CAM-KB0810-MIKROPENCERE', label: '8mm Temperli Cam (Üçgen Mikro Pencere)' },
    ],
  },
];

// VERTIFLEX'teki gibi: kısmi/eksik gelen meta ekranı çökertmesin.
const safeKisBahcesiTypeMeta = (
  tm?: Partial<AlbertGenauKisBahcesiTypeMetaT> | null,
): AlbertGenauKisBahcesiTypeMetaT => ({
  id: tm?.id || '',
  label: tm?.label || '',
  ayarliDuvarBaglantisi: !!tm?.ayarliDuvarBaglantisi,
  kirisUstuVidaKapama: !!tm?.kirisUstuVidaKapama,
  ortaKayit: !!tm?.ortaKayit,
  ucgenMikroPencere: !!tm?.ucgenMikroPencere,
  camSkus: tm?.camSkus || [],
});

// BC ailesi (TIARA/TIARA FLAT/INT/ZERO/SLIM, SLIDER NEXT/SLIDE MASTER,
// ATRIUM/MOMENTUM/CENTRUM HD, TANGO/OPTIMA — 39 kaydırmalı sistem
// varyantı) -- gerçek liste + tip bazlı dinamik meta /albert-genau/bc/types
// üzerinden gelir (bkz. backend ag_calc.BC_TYPE_META). Bu sadece ilk
// yükleme varsayımı; kanat/bayrak/cam alanları tipe göre değişir.
const FALLBACK_BC_TYPES: AlbertGenauBcTypeMetaT[] = [
  {
    id: 'bc_tiara_08', label: 'TIARA 08', defaultGenislik: 3000, defaultYukseklik: 2000,
    kanatInputs: {}, flagInputs: {}, camItems: [], hasRayType: false,
  },
];

// VERTIFLEX'teki gibi: kısmi/eksik gelen meta ekranı çökertmesin. BC'de
// kanat/bayrak/cam alanları tamamen meta'dan kurulduğu için eksik meta
// "hiç alan gösterme" demektir.
const safeBcTypeMeta = (
  tm?: Partial<AlbertGenauBcTypeMetaT> | null,
): AlbertGenauBcTypeMetaT => ({
  id: tm?.id || '',
  label: tm?.label || '',
  defaultGenislik: Number(tm?.defaultGenislik) || 0,
  defaultYukseklik: Number(tm?.defaultYukseklik) || 0,
  kanatInputs: tm?.kanatInputs || {},
  flagInputs: tm?.flagInputs || {},
  camItems: tm?.camItems || [],
  hasRayType: !!tm?.hasRayType,
});

// BC tipleri 39 adet olduğu için tek satırda göstermek yerine alt-marka
// bazında gruplanır (kullanıcı dostu). Grup eşleşmesi tip id önekine göre.
const BC_GROUPS: { title: string; match: (id: string) => boolean }[] = [
  { title: 'TIARA Ailesi', match: (id) => id.startsWith('bc_tiara_') },
  { title: 'SLIDER NEXT Ailesi', match: (id) => id.startsWith('bc_slider_next_') },
  { title: 'SLIDE MASTER Ailesi', match: (id) => id.startsWith('bc_slide_master_') },
  { title: 'HD Ailesi (Atrium / Momentum / Centrum)', match: (id) => id.endsWith('_hd_10') },
  { title: 'TANGO / OPTIMA', match: (id) => id.startsWith('bc_tango_') || id.startsWith('bc_optima_') },
];

const BC_RAY_TIPI_LABELS: Record<number, string> = { 1: '5 Raylı', 2: '4 Raylı', 3: '3 Raylı', 4: '2 Raylı' };

const FINISH_LABELS: Record<string, string> = {
  SATINE_NATUREL: 'Satine Naturel',
  ANTRASIT_GRI: 'Antrasit Gri',
  BRONZ_1122_BOYALI: 'Bronz 1122 Boyalı',
  DIGER_RAL: 'Diğer RAL Renkleri (+%15)',
  BRONZ_ELOKSAL: 'Bronz Eloksal (+%10)',
  PRES: 'Preslenmiş (-%10)',
};

function needsHeight(tip: string) { return tip !== 'ayaksiz'; }
function hasMotorOption(tip: string) { return ['4ayak_ustu', '2ayak_duvar', 'ayaksiz'].includes(tip); }
function hasWallBracketOption(tip: string) { return ['2ayak_duvar', 'ayaksiz', 'sabit_duvar'].includes(tip); }

function money(n: number) {
  return (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Albert Genau kurumsal paleti (albertgenau.com'dan ölçülen değerler)
const AG_RED = '#B61231';
const AG_RED_LIGHT = '#E8536C';
// Bu ekran, uygulamanın açık temasından bağımsız olarak HER ZAMAN koyu:
// bayi Albert Genau bölümüne girince markanın kendi premium dilini görür.
const AG_SURFACE = '#17171D';
const AG_SURFACE_SOFT = '#1F1F27';
const AG_LINE = 'rgba(255,255,255,0.09)';
const AG_TEXT = '#F4F5F7';
const AG_TEXT_MUTED = '#9BA2AE';

export default function AlbertGenauScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeCompany, showToast, toast, addPendingNewQuoteAttachment, addPendingAlbertGenauItem } = useApp();
  const { user: me } = useAuth();
  const isStaffUser = !!me?.is_staff;
  // Bu ekranın kendi geri-tuşlu üst çubuğu var (TopHeader değil), bu yüzden
  // masaüstü genişliğinde sidebar zaten (tabs)/_layout.tsx tarafından
  // gösteriliyor olsa da, dar/mobil genişlikte diğer ekranlardaki hamburger
  // menüsüne (NavDrawer) buradan da erişim sağlanmalı -- kullanıcı "mevcut
  // bar kaybolmasın" diye bildirdi.
  const { width: winWidth } = useWindowDimensions();
  const showHamburger = !(Platform.OS === 'web' && winWidth >= 900);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const [meta, setMeta] = useState<AlbertGenauTypesResponseT>({ types: FALLBACK_TYPES, finishes: FALLBACK_FINISHES, partsListSystems: FALLBACK_PARTS_LIST_SYSTEMS });
  // 'geometric' -- AG BIOFLEX/BIO: genişlik/derinlik/yükseklik ölçüsüne göre
  // hesaplar. 'airflex_modul' -- AIRFLEX: ölçü yerine ADET (kaç sistem) +
  // birkaç seçenek girilir, yükseklik her zaman sabit 1850mm'dir (bkz.
  // backend calculate_airflex_module -- bayiden alınan gerçek mühendislik
  // kuralları: sabit dikme 1000mm + hareketli dikme 850mm kesim, panel
  // takımları adet×2, kapı/kilit istenirse sabit 1 adet, cam ayrı hesaplanır).
  const [family, setFamily] = useState<'geometric' | 'airflex_modul' | 'vertiflex' | 'kis_bahcesi' | 'bc' | 'yedek_parca'>('geometric');
  const partsListSystems = meta.partsListSystems && meta.partsListSystems.length ? meta.partsListSystems : FALLBACK_PARTS_LIST_SYSTEMS;
  const vertiflexTypes = meta.vertiflexTypes && meta.vertiflexTypes.length ? meta.vertiflexTypes : [{ id: 'vertiflex_mono08', label: 'VERTIFLEX MONO 08' }];

  // VERTIFLEX (dikey giyotin cam balkon) -- tip-bazli secenekler icin ayrica
  // /albert-genau/vertiflex/types cagirilir (bkz. ag_calc.VERTIFLEX_TYPE_META).
  const [vfMeta, setVfMeta] = useState<AlbertGenauVertiflexTypesResponseT>({ types: FALLBACK_VERTIFLEX_TYPES, finishes: FALLBACK_FINISHES });
  const [vfTip, setVfTip] = useState('vertiflex_mono08');
  const vfTypeMeta: AlbertGenauVertiflexTypeMetaT = useMemo(
    () => safeVertiflexTypeMeta(
      (vfMeta.types || []).find((t) => t.id === vfTip) || (vfMeta.types || [])[0] || FALLBACK_VERTIFLEX_TYPES[0],
    ),
    [vfMeta.types, vfTip],
  );
  const [vfGenislik, setVfGenislik] = useState('');
  const [vfYukseklik, setVfYukseklik] = useState('');
  const [vfPanelSayisi, setVfPanelSayisi] = useState('3');
  const [vfMotor, setVfMotor] = useState<'ag' | 'somfy'>('ag');
  const [vfKumandaKanal, setVfKumandaKanal] = useState<number | null>(null);
  const [vfSecumaxTaraf, setVfSecumaxTaraf] = useState<'sag' | 'sol'>('sag');
  const [vfInoxZincirli, setVfInoxZincirli] = useState(false);
  const [vfAlicisiz, setVfAlicisiz] = useState(false);
  const [vfSuTahliyeli, setVfSuTahliyeli] = useState(false);
  // Sadece STATU IMPETUS CLEAN TWIN icin: IMPETUS TWIN STATU ELEKTROMEKANIK
  // SET (G05080) adedi -- genis aciklikta birden fazla set gerekebilir,
  // varsayilan 1.
  const [vfElektromekanikSetAdet, setVfElektromekanikSetAdet] = useState('1');
  const [vfCamFiyatlari, setVfCamFiyatlari] = useState<Record<string, string>>({});

  useEffect(() => {
    api.albertGenauVertiflexTypes(activeCompany?.id).then(setVfMeta).catch(() => {});
  }, [activeCompany?.id]);

  // Secili tip meta listesinde yoksa (varsayilan vfTip artik gecerli degilse,
  // bayi degisince liste daraldiysa ya da /albert-genau/types ile
  // /albert-genau/vertiflex/types farkli tipler donduruyorsa) form sessizce
  // listenin ilk tipinin meta'sini kullanir: secicide hicbir tip isaretli
  // gorunmez ve Hesapla'ya meta'si olmayan bir tip gider. Gecersiz secimi
  // listenin ilk tipine cekerek secici/form/istek ucunu ayni tipte tutuyoruz.
  useEffect(() => {
    const ids = (vfMeta.types || []).map((t) => t.id);
    if (!ids.length || ids.includes(vfTip)) return;
    setVfTip(ids[0]);
  }, [vfMeta.types, vfTip]);

  // Tip degisince o tipte gecerli olmayan secenekleri (onceki tipten kalma)
  // sifirla -- orn. TAMBALKON'dan UP TWIN'e gecince inox secili kalmasin.
  useEffect(() => {
    const tm = vfTypeMeta;
    if (!tm) return;
    const panelOpts = tm.panelSayisiOptions || [];
    const motorOpts = tm.motorOptions || [];
    if (panelOpts.length && !panelOpts.includes(vfPanelSayisi)) {
      setVfPanelSayisi(panelOpts[0]);
    }
    if (!motorOpts.includes(vfMotor)) setVfMotor(motorOpts[0] || 'ag');
    if (!tm.inoxZincirli) setVfInoxZincirli(false);
    if (!tm.alicisiz) setVfAlicisiz(false);
    if (!tm.suTahliyeliAltKasa) setVfSuTahliyeli(false);
    if (vfTip !== 'impetus_clean_twin') setVfElektromekanikSetAdet('1');
    setVfKumandaKanal(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfTip]);

  // Motor markasi degisince (AG<->Somfy) o markanin gecerli kumanda kanali
  // secenekleri farkli olabilir (bkz. VERTIFLEX_TYPE_META.kumandaKanalOptions) --
  // eski secim artik gecersizse sifirla.
  useEffect(() => {
    const opts = vfTypeMeta?.kumandaKanalOptions?.[vfMotor] || [];
    if (vfKumandaKanal != null && !opts.includes(vfKumandaKanal)) setVfKumandaKanal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfMotor, vfTip]);

  // KIŞ BAHÇESİ (sabit cam tavanlı) -- tip-bazli secenekler icin ayrica
  // /albert-genau/kis-bahcesi/types cagirilir (bkz. ag_calc.KIS_BAHCESI_TYPE_META).
  const kisBahcesiTypes = meta.kisBahcesiTypes && meta.kisBahcesiTypes.length ? meta.kisBahcesiTypes : [{ id: 'kis_bahcesi_premium_08_10', label: 'KIŞ BAHÇESİ PREMIUM 08-10' }];
  const [kbMeta, setKbMeta] = useState<AlbertGenauKisBahcesiTypesResponseT>({ types: FALLBACK_KIS_BAHCESI_TYPES, finishes: FALLBACK_FINISHES });
  const [kbTip, setKbTip] = useState('kis_bahcesi_premium_08_10');
  const kbTypeMeta: AlbertGenauKisBahcesiTypeMetaT = useMemo(
    () => safeKisBahcesiTypeMeta(
      (kbMeta.types || []).find((t) => t.id === kbTip) || (kbMeta.types || [])[0] || FALLBACK_KIS_BAHCESI_TYPES[0],
    ),
    [kbMeta.types, kbTip],
  );
  const [kbGenislik, setKbGenislik] = useState('');
  const [kbDerinlik, setKbDerinlik] = useState('');
  const [kbTavanBolumSayisi, setKbTavanBolumSayisi] = useState('4');
  const [kbArkaDuvarAltYukseklik, setKbArkaDuvarAltYukseklik] = useState('');
  const [kbAraDikmeSayisi, setKbAraDikmeSayisi] = useState('0');
  const [kbAyarliDuvarBaglantisi, setKbAyarliDuvarBaglantisi] = useState(false);
  const [kbKirisUstuVidaKapama, setKbKirisUstuVidaKapama] = useState(false);
  const [kbOrtaKayit, setKbOrtaKayit] = useState(false);
  const [kbUcgenMikroPencere, setKbUcgenMikroPencere] = useState(false);
  const [kbCamFiyatlari, setKbCamFiyatlari] = useState<Record<string, string>>({});

  useEffect(() => {
    api.albertGenauKisBahcesiTypes(activeCompany?.id).then(setKbMeta).catch(() => {});
  }, [activeCompany?.id]);

  // vfTip senkronunun aynisi: secili tip meta listesinde yoksa secici hicbir
  // tipi isaretlemez ve Hesapla'ya meta'si olmayan bir tip gider.
  useEffect(() => {
    const ids = (kbMeta.types || []).map((t) => t.id);
    if (!ids.length || ids.includes(kbTip)) return;
    setKbTip(ids[0]);
  }, [kbMeta.types, kbTip]);

  // Tip degisince o tipte gecerli olmayan secenekleri sifirla -- orn.
  // PREMIUM 08-10'dan TWIN'e gecince ayarli-duvar-baglantisi secili kalmasin.
  useEffect(() => {
    const tm = kbTypeMeta;
    if (!tm) return;
    if (!tm.ayarliDuvarBaglantisi) setKbAyarliDuvarBaglantisi(false);
    if (!tm.kirisUstuVidaKapama) setKbKirisUstuVidaKapama(false);
    if (!tm.ortaKayit) setKbOrtaKayit(false);
    if (!tm.ucgenMikroPencere) setKbUcgenMikroPencere(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbTip]);

  // BC ailesi (TIARA/SLIDER NEXT/SLIDE MASTER/HD/TANGO/OPTIMA -- 39 varyant).
  // Diğer ailelerden farklı olarak kanat/bayrak/cam alanları TİPE GÖRE
  // DEĞİŞİR -- form, backend'den gelen meta'ya (BC_TYPE_META) göre dinamik
  // kurulur; sabit state alanları yerine {ref: değer} sözlükleri kullanılır.
  const bcTypes = meta.bcTypes && meta.bcTypes.length ? meta.bcTypes : [{ id: 'bc_tiara_08', label: 'TIARA 08' }];
  const [bcMeta, setBcMeta] = useState<AlbertGenauBcTypesResponseT>({ types: FALLBACK_BC_TYPES, finishes: FALLBACK_FINISHES });
  const [bcTip, setBcTip] = useState('bc_tiara_08');
  const bcTypeMeta: AlbertGenauBcTypeMetaT = useMemo(
    () => safeBcTypeMeta(
      (bcMeta.types || []).find((t) => t.id === bcTip) || (bcMeta.types || [])[0] || FALLBACK_BC_TYPES[0],
    ),
    [bcMeta.types, bcTip],
  );
  const [bcGenislik, setBcGenislik] = useState('');
  const [bcYukseklik, setBcYukseklik] = useState('');
  const [bcKanatMiktarlari, setBcKanatMiktarlari] = useState<Record<string, string>>({});
  const [bcBayrakDegerleri, setBcBayrakDegerleri] = useState<Record<string, string>>({});
  const [bcRayTipi, setBcRayTipi] = useState<number>(1);
  const [bcCamFiyatlari, setBcCamFiyatlari] = useState<Record<string, string>>({});

  useEffect(() => {
    api.albertGenauBcTypes(activeCompany?.id).then(setBcMeta).catch(() => {});
  }, [activeCompany?.id]);

  // vfTip senkronunun aynisi -- BC'de ayrica kanat/bayrak/cam alanlari tamamen
  // meta'dan kuruldugu icin gecersiz tipte form bosalir.
  useEffect(() => {
    const ids = (bcMeta.types || []).map((t) => t.id);
    if (!ids.length || ids.includes(bcTip)) return;
    setBcTip(ids[0]);
  }, [bcMeta.types, bcTip]);

  // Tip değişince ölçü alanlarını o tipin varsayılanıyla doldur, kanat/bayrak/
  // ray/cam girdilerini sıfırla -- bir önceki tipe ait ref'ler (örn. C18)
  // farklı bir sistemde tamamen farklı bir anlam taşıyabilir.
  useEffect(() => {
    const tm = bcTypeMeta;
    if (!tm) return;
    setBcGenislik(String(tm.defaultGenislik || ''));
    setBcYukseklik(String(tm.defaultYukseklik || ''));
    setBcKanatMiktarlari({});
    setBcBayrakDegerleri({});
    setBcRayTipi(1);
    setBcCamFiyatlari({});
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bcTip]);

  // YEDEK PARÇA -- dağıtık parça-değişim kataloğu (243 kalem). Sabit bir
  // "sistem" yok, bayı arama/grup filtresiyle kataloğu tarayıp istediği
  // kalemlere miktar girer (bir "sepet" gibi).
  const [ypMeta, setYpMeta] = useState<AlbertGenauYedekParcaItemsResponseT>({ items: [], groups: [] });
  const [ypSearch, setYpSearch] = useState('');
  const [ypGroupFilter, setYpGroupFilter] = useState<string>('ALL');
  const [ypQuantities, setYpQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    api.albertGenauYedekParcaItems(activeCompany?.id).then(setYpMeta).catch(() => {});
  }, [activeCompany?.id]);

  const ypFilteredItems = useMemo(() => {
    const q = ypSearch.trim().toLocaleLowerCase('tr');
    const hasSelection = ypGroupFilter !== 'ALL' || q.length >= 2;
    if (!hasSelection) return [];
    return ypMeta.items.filter((it) => {
      if (ypGroupFilter !== 'ALL' && it.group !== ypGroupFilter) return false;
      if (q.length >= 2) {
        const hay = `${it.name} ${it.sku}`.toLocaleLowerCase('tr');
        if (!hay.includes(q)) return false;
      }
      return true;
    }).slice(0, 100);
  }, [ypMeta.items, ypSearch, ypGroupFilter]);

  const ypSelectedCount = useMemo(
    () => Object.values(ypQuantities).filter((v) => Number((v || '').replace(',', '.')) > 0).length,
    [ypQuantities],
  );

  const [afAdet, setAfAdet] = useState('1');
  const [afTekerlekli, setAfTekerlekli] = useState(false);
  const [afKapiVar, setAfKapiVar] = useState(false);
  const [afKilitVar, setAfKilitVar] = useState(false);
  const [afCamSabitGenislik, setAfCamSabitGenislik] = useState('');
  const [afCamSabitFiyat, setAfCamSabitFiyat] = useState('');
  const [afCamHareketliGenislik, setAfCamHareketliGenislik] = useState('');
  const [afCamHareketliFiyat, setAfCamHareketliFiyat] = useState('');
  const [tip, setTip] = useState('4ayak_ustu');
  const [genislik, setGenislik] = useState('');
  const [derinlik, setDerinlik] = useState('');
  const [yukseklik, setYukseklik] = useState('');
  const [cornerFlat, setCornerFlat] = useState(false);
  const [somfy, setSomfy] = useState(false);
  const [noWallBracket, setNoWallBracket] = useState(false);
  const [finish, setFinish] = useState<string>('SATINE_NATUREL');
  const [ledOption, setLedOption] = useState<'' | 'warm' | 'warm_rgb'>('');
  const [ledMidSupport, setLedMidSupport] = useState(false);
  const [kopuk, setKopuk] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<'nakit' | 'kredi_karti'>('nakit');
  const [alisIskontoPct, setAlisIskontoPct] = useState('0');
  const [montajBedeli, setMontajBedeli] = useState('0');
  // İmalat ve Diğer Giderler -- Montaj Bedeli ile aynı mantık: kar marjı
  // yüzdesine sokulmadan, doğrudan satış fiyatına eklenen sabit bir tutar.
  const [imalatBedeli, setImalatBedeli] = useState('0');
  const [karMarjiPct, setKarMarjiPct] = useState('0');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AlbertGenauResultT | AlbertGenauAirflexModuleResultT | AlbertGenauVertiflexResultT | AlbertGenauKisBahcesiResultT | AlbertGenauBcResultT | AlbertGenauYedekParcaResultT | null>(null);
  const [lastPayload, setLastPayload] = useState<AlbertGenauCalculateInputT | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Girilen derinlik standart panel-adimina tam denk gelmediginde backend
  // 409 dondurur; kullaniciya alt (dar) veya ust (genis) standart derinlikten
  // birini secmesi icin bu bilgiyi sakliyoruz (bkz. onCalculate/onChooseDepth).
  // Bu artik sadece bir GUVENLIK AGI -- normalde asagidaki liveDepthChoice
  // (Hesapla'ya hic basmadan, derinlik yazilirken hesaplanan) devreye girer.
  const [depthChoice, setDepthChoice] = useState<{ floorMm: number; ceilMm: number; rawMm: number } | null>(null);

  // Secili sistem tipinin etiketi -- hem fov kunyesinde hem cizimin
  // basliginda kullanilir. Tip listede yoksa (veri henuz gelmediyse) bos
  // doner; "secilmedi" rozeti ve "tamamlandi" isareti tek kaynaktan gelsin
  // diye ayri bir degisken.
  const selectedTypeLabel = useMemo(
    () => (meta.types || []).find((tp) => tp.id === tip)?.label || '',
    [meta.types, tip]
  );

  // Kullanici derinligi YAZARKEN (Hesapla'ya basmadan), Excel'deki gibi anlik
  // olarak standart olcuye denk gelip gelmedigini kontrol eder. Backend'deki
  // PriceBook.depth_choice ile BIREBIR ayni mantik -- tam eslesme varsa veya
  // tablonun disindaysa null, degilse en yakin alt/ust standart degerleri.
  const liveDepthChoice = useMemo(() => {
    const vals = (meta.depthValuesMm || []).slice().sort((a, b) => a - b);
    if (!vals.length) return null;
    const raw = Number(derinlik.replace(',', '.'));
    if (!raw || raw <= 0) return null;
    if (vals.some((v) => Math.abs(v - raw) < 1e-6)) return null;
    const floorCandidates = vals.filter((v) => v < raw);
    const ceilCandidates = vals.filter((v) => v > raw);
    if (!floorCandidates.length || !ceilCandidates.length) return null;
    return { floorMm: Math.max(...floorCandidates), ceilMm: Math.min(...ceilCandidates), rawMm: raw };
  }, [derinlik, meta.depthValuesMm]);

  useEffect(() => {
    api.albertGenauTypes(activeCompany?.id).then(setMeta).catch(() => {});
  }, [activeCompany?.id]);

  // Satış fiyatının (₺) altında canlı kurla $ / € karşılığını göstermek için
  // -- Geçmiş ekranındaki tutar kartlarıyla aynı desen (bkz. history.tsx
  // cardEquiv). Kur verisi gelene kadar hiçbir şey gösterilmez.
  const [rates, setRates] = useState<RatesT | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchRates = () => api.rates().then((r) => { if (!cancelled) setRates(r); }).catch(() => {});
    fetchRates();
    const id = setInterval(fetchRates, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const satisFiyatiEquiv = useMemo(() => {
    if (!result || !rates) return null;
    const try_ = result.satisFiyati;
    const usd = rates.usd_try ? try_ / rates.usd_try : null;
    const eur = rates.eur_try ? try_ / rates.eur_try : null;
    if (usd == null && eur == null) return null;
    return { usd, eur };
  }, [result, rates]);

  // Firma-bazlı fiyat listesi: her Albert Genau bayisi (firma) kendi Excel
  // fiyat listesini kendi hesabından yükleyebilir -- yeni bir bayiye verilen
  // başlangıç dosyası budur, zam geldiğinde de aynı yerden tekrar yüklenir.
  // Ana hesaplama motoru/formüller hiç değişmez, sadece SKU->fiyat verisi.
  // Sadece firma SAHİBİ görüp yükleyebilir (personel göremez).
  const [priceListStatus, setPriceListStatus] = useState<AlbertGenauPriceListStatusT | null>(null);
  const [priceListOpen, setPriceListOpen] = useState(false);
  const [priceListUploading, setPriceListUploading] = useState(false);

  const loadPriceListStatus = () => {
    if (!activeCompany || isStaffUser) return;
    api.albertGenauCompanyPriceListStatus(activeCompany.id).then(setPriceListStatus).catch(() => {});
  };
  useEffect(() => { loadPriceListStatus(); }, [activeCompany?.id, isStaffUser]);

  const onPickAndUploadPriceList = async () => {
    if (!activeCompany || priceListUploading) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      setPriceListUploading(true);
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const dataUri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`;
      const result = await api.uploadAlbertGenauCompanyPriceList(activeCompany.id, dataUri);
      showToast(`Fiyat listeniz güncellendi: ${result.skuCount} kalem`);
      loadPriceListStatus();
      // Ekrandaki mevcut hesap sonucu artik eski fiyatı gösteriyor olabilir --
      // yeni derinlik tablosu da değişmiş olabileceğinden meta'yı da tazele.
      api.albertGenauTypes(activeCompany.id).then(setMeta).catch(() => {});
    } catch (e: any) {
      showToast(e?.message || 'Fiyat listesi yüklenemedi');
    } finally {
      setPriceListUploading(false);
    }
  };

  const onCalculateAirflexModule = async () => {
    setError('');
    const adetNum = Math.round(Number(afAdet.replace(',', '.')));
    if (!adetNum || adetNum < 1) { setError('Adet en az 1 olmalı'); return; }
    setBusy(true);
    setResult(null);
    setLastPayload(null);
    try {
      const res = await api.albertGenauAirflexModuleCalculate({
        companyId: activeCompany?.id,
        adet: adetNum,
        tekerlekli: afTekerlekli,
        kapiVar: afKapiVar,
        kilitVar: afKilitVar,
        camSabitGenislikMm: Number(afCamSabitGenislik.replace(',', '.')) || 0,
        camSabitFiyatM2: Number(afCamSabitFiyat.replace(',', '.')) || 0,
        camHareketliGenislikMm: Number(afCamHareketliGenislik.replace(',', '.')) || 0,
        camHareketliFiyatM2: Number(afCamHareketliFiyat.replace(',', '.')) || 0,
        finish,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      });
      setResult(res);
    } catch (e: any) {
      if (e?.status === 403 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'price_list_required') {
            setPriceListOpen(true);
            setError(info.message || 'Hesaplama yapabilmek için önce fiyat listenizi yükleyin.');
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onCalculateVertiflex = async () => {
    setError('');
    const g = Number(vfGenislik.replace(',', '.'));
    const y = Number(vfYukseklik.replace(',', '.'));
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!y || y <= 0) { setError('Yükseklik (mm) girin'); return; }
    const tm = vfTypeMeta;
    setBusy(true);
    setResult(null);
    try {
      const camFiyatlariM2: Record<string, number> = {};
      (tm?.camSkus || []).forEach((c) => {
        const v = Number((vfCamFiyatlari[c.sku] || '').replace(',', '.'));
        if (v > 0) camFiyatlariM2[c.sku] = v;
      });
      const res = await api.albertGenauVertiflexCalculate({
        companyId: activeCompany?.id,
        tip: vfTip,
        genislikMm: g,
        yukseklikMm: y,
        panelSayisi: tm?.panelSayisiOptions?.length ? vfPanelSayisi : null,
        motor: vfMotor,
        kumandaKanal: vfKumandaKanal,
        secumaxTaraf: vfSecumaxTaraf,
        inoxZincirli: tm?.inoxZincirli ? vfInoxZincirli : false,
        alicisiz: tm?.alicisiz ? vfAlicisiz : false,
        suTahliyeliAltKasa: tm?.suTahliyeliAltKasa ? vfSuTahliyeli : false,
        elektromekanikSetAdet: vfTip === 'impetus_clean_twin' ? (Number(vfElektromekanikSetAdet) || 1) : 1,
        finish,
        camFiyatlariM2,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      });
      setResult(res);
    } catch (e: any) {
      if (e?.status === 403 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'price_list_required') {
            setPriceListOpen(true);
            setError(info.message || 'Hesaplama yapabilmek için önce fiyat listenizi yükleyin.');
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onCalculateKisBahcesi = async () => {
    setError('');
    const g = Number(kbGenislik.replace(',', '.'));
    const d = Number(kbDerinlik.replace(',', '.'));
    const tavanBolum = Math.round(Number(kbTavanBolumSayisi.replace(',', '.')));
    const arkaDuvar = Number(kbArkaDuvarAltYukseklik.replace(',', '.'));
    const araDikme = Math.round(Number(kbAraDikmeSayisi.replace(',', '.'))) || 0;
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!d || d <= 0) { setError('Derinlik (mm) girin'); return; }
    if (!tavanBolum || tavanBolum < 1) { setError('Tavan bölüm sayısı en az 1 olmalı'); return; }
    if (!arkaDuvar || arkaDuvar <= 0) { setError('Arka duvar alt yüksekliği (mm) girin'); return; }
    const tm = kbTypeMeta;
    setBusy(true);
    setResult(null);
    try {
      const camFiyatlariM2: Record<string, number> = {};
      (tm?.camSkus || []).forEach((c) => {
        const v = Number((kbCamFiyatlari[c.sku] || '').replace(',', '.'));
        if (v > 0) camFiyatlariM2[c.sku] = v;
      });
      const res = await api.albertGenauKisBahcesiCalculate({
        companyId: activeCompany?.id,
        tip: kbTip,
        genislikMm: g,
        derinlikMm: d,
        tavanBolumSayisi: tavanBolum,
        arkaDuvarAltYukseklikMm: arkaDuvar,
        araDikmeSayisi: araDikme,
        ayarliDuvarBaglantisi: tm?.ayarliDuvarBaglantisi ? kbAyarliDuvarBaglantisi : false,
        kirisUstuVidaKapama: tm?.kirisUstuVidaKapama ? kbKirisUstuVidaKapama : false,
        ortaKayit: tm?.ortaKayit ? kbOrtaKayit : false,
        ucgenMikroPencere: tm?.ucgenMikroPencere ? kbUcgenMikroPencere : false,
        finish,
        camFiyatlariM2,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      });
      setResult(res);
    } catch (e: any) {
      if (e?.status === 403 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'price_list_required') {
            setPriceListOpen(true);
            setError(info.message || 'Hesaplama yapabilmek için önce fiyat listenizi yükleyin.');
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onCalculateBc = async () => {
    setError('');
    const g = Number(bcGenislik.replace(',', '.'));
    const y = Number(bcYukseklik.replace(',', '.'));
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!y || y <= 0) { setError('Yükseklik (mm) girin'); return; }
    const tm = bcTypeMeta;
    setBusy(true);
    setResult(null);
    try {
      const kanatMiktarlari: Record<string, number> = {};
      Object.keys(tm?.kanatInputs || {}).forEach((ref) => {
        const raw = bcKanatMiktarlari[ref];
        if (raw !== undefined && raw !== '') {
          const v = Number(raw.replace(',', '.'));
          if (!Number.isNaN(v)) kanatMiktarlari[ref] = v;
        }
      });
      const bayrakDegerleri: Record<string, number> = {};
      Object.keys(tm?.flagInputs || {}).forEach((ref) => {
        const raw = bcBayrakDegerleri[ref];
        if (raw !== undefined && raw !== '') {
          const v = Number(raw.replace(',', '.'));
          if (!Number.isNaN(v)) bayrakDegerleri[ref] = v;
        }
      });
      const camFiyatlariM2: Record<string, number> = {};
      (tm?.camItems || []).forEach((c) => {
        const v = Number((bcCamFiyatlari[c.camSku] || '').replace(',', '.'));
        if (v > 0) camFiyatlariM2[c.camSku] = v;
      });
      const res = await api.albertGenauBcCalculate({
        companyId: activeCompany?.id,
        tip: bcTip,
        genislikMm: g,
        yukseklikMm: y,
        kanatMiktarlari,
        bayrakDegerleri,
        rayTipi: tm?.hasRayType ? bcRayTipi : null,
        finish,
        camFiyatlariM2,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      });
      setResult(res);
    } catch (e: any) {
      if (e?.status === 403 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'price_list_required') {
            setPriceListOpen(true);
            setError(info.message || 'Hesaplama yapabilmek için önce fiyat listenizi yükleyin.');
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onCalculateYedekParca = async () => {
    setError('');
    const quantities: Record<string, number> = {};
    Object.entries(ypQuantities).forEach(([sku, raw]) => {
      const v = Number((raw || '').replace(',', '.'));
      if (v > 0) quantities[sku] = v;
    });
    if (!Object.keys(quantities).length) { setError('En az bir parça için miktar girin'); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await api.albertGenauYedekParcaCalculate({
        companyId: activeCompany?.id,
        quantities,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onCalculate = async (depthOverrideMm?: number) => {
    if (family === 'airflex_modul') { await onCalculateAirflexModule(); return; }
    if (family === 'vertiflex') { await onCalculateVertiflex(); return; }
    if (family === 'kis_bahcesi') { await onCalculateKisBahcesi(); return; }
    if (family === 'bc') { await onCalculateBc(); return; }
    if (family === 'yedek_parca') { await onCalculateYedekParca(); return; }
    setError('');
    setDepthChoice(null);
    const g = Number(genislik.replace(',', '.'));
    const d = depthOverrideMm ?? Number(derinlik.replace(',', '.'));
    const y = needsHeight(tip) ? Number(yukseklik.replace(',', '.')) : undefined;
    if (!g || g <= 0) { setError('Genişlik (mm) girin'); return; }
    if (!d || d <= 0) { setError('Derinlik (mm) girin'); return; }
    if (needsHeight(tip) && (!y || y <= 0)) { setError('Yükseklik (mm) girin'); return; }
    setBusy(true);
    setResult(null);
    try {
      const payload: AlbertGenauCalculateInputT = {
        companyId: activeCompany?.id,
        tip,
        genislikMm: g,
        derinlikMm: d,
        yukseklikMm: y,
        cornerFlat,
        somfy: hasMotorOption(tip) ? somfy : false,
        noWallBracket: hasWallBracketOption(tip) ? noWallBracket : false,
        finish,
        ledOption: ledOption || null,
        ledMidSupport: ledOption ? ledMidSupport : false,
        kopuk,
        alisIskontoPct: Number(alisIskontoPct.replace(',', '.')) || 0,
        montajBedeli: Number(montajBedeli.replace(',', '.')) || 0,
        imalatBedeli: Number(imalatBedeli.replace(',', '.')) || 0,
        karMarjiPct: Number(karMarjiPct.replace(',', '.')) || 0,
        odemeTipi,
      };
      const res = await api.albertGenauCalculate(payload);
      setResult(res);
      setLastPayload(payload);
      if (depthOverrideMm) setDerinlik(String(depthOverrideMm));
    } catch (e: any) {
      if (e?.status === 409 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'depth_choice_required') {
            setDepthChoice({ floorMm: info.floorMm, ceilMm: info.ceilMm, rawMm: info.rawMm });
            setBusy(false);
            return;
          }
        } catch {}
      }
      if (e?.status === 403 && e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          const info = parsed?.detail;
          if (info?.code === 'price_list_required') {
            // Firma kendi fiyat listesini henüz yüklemedi -- Fiyat Listesi
            // kartını açıp kullanıcıyı doğrudan oraya yönlendiriyoruz.
            setPriceListOpen(true);
            setError(info.message || 'Hesaplama yapabilmek için önce fiyat listenizi yükleyin.');
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(e?.message || 'Hesaplanamadı');
    } finally {
      setBusy(false);
    }
  };

  const onChooseDepth = (mm: number) => {
    setDepthChoice(null);
    onCalculate(mm);
  };

  // Derinlik henuz yazilirken (Hesapla'ya basmadan) gosterilen anlik secim
  // kutusundan bir deger secildiginde -- sadece derinlik alanini o degere
  // "snap"ler, otomatik hesaplama YAPMAZ (genislik/yukseklik gibi diger
  // alanlar henuz doldurulmamis olabilir). Kullanici normal sekilde Hesapla'ya
  // bastiginda artik tam eslesen bir derinlik ile calisir.
  const onPickLiveDepth = (mm: number) => {
    setDerinlik(String(mm));
  };

  const onShowKalemler = () => {
    if (!result) return;
    router.push({
      pathname: '/albert-genau-kalemler',
      params: {
        tipAdi: result.tipAdi,
        girdi: JSON.stringify(result.girdi || {}),
        kalemler: JSON.stringify(result.kalemler),
      },
    });
  };

  const onExportExcel = async () => {
    if (!lastPayload || exporting) return;
    setExporting(true);
    try {
      const buf = await fetchAlbertGenauExcelBytes(lastPayload);
      const fileName = `albert-genau-${lastPayload.tip}.xlsx`;
      const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (Platform.OS === 'web') {
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        await downloadFileWeb(url, fileName);
        showToast('Excel indirildi');
      } else {
        const b64 = bytesToBase64(new Uint8Array(buf));
        const uri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
        const avail = await Sharing.isAvailableAsync();
        if (avail) {
          await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: 'Albert Genau Hesabı', UTI: 'org.openxmlformats.spreadsheetml.sheet' });
        } else {
          showToast('Excel dosyası oluşturuldu ama paylaşım kullanılamıyor');
        }
      }
    } catch (e: any) {
      showToast(e?.message || 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  // Excel'in kendi "CIZIMLER" sayfasindaki modul semasina benzer, girilen
  // olculere gore backend'de otomatik uretilen (PNG) teknik cizimi indirip
  // -- fiziksel bir dosyaya kaydetmeden -- direkt data: URI'li bir ek
  // (AttachmentT) olarak, henuz olusturulmamis teklife eklenmek uzere
  // AppContext'teki bekleme alanina koyar (bkz. teklif.tsx'teki tuketici).
  const [addingDrawing, setAddingDrawing] = useState(false);
  const onAddDrawing = async () => {
    if (!lastPayload || addingDrawing) return;
    setAddingDrawing(true);
    try {
      const buf = await fetchAlbertGenauDrawingBytes(lastPayload);
      const b64 = bytesToBase64(new Uint8Array(buf));
      const att: AttachmentT = {
        id: `ag-cizim-${Date.now()}`,
        name: `albert-genau-${lastPayload.tip}-cizim.png`,
        uri: `data:image/png;base64,${b64}`,
        mime: 'image/png',
        size: buf.byteLength,
      };
      addPendingNewQuoteAttachment(att);
      showToast('Teknik çizim, teklife eklenmek üzere hazırlandı');
    } catch (e: any) {
      showToast(e?.message || 'Teknik çizim oluşturulamadı');
    } finally {
      setAddingDrawing(false);
    }
  };

  const buildAciklama = (r: AlbertGenauResultT | AlbertGenauAirflexModuleResultT | AlbertGenauVertiflexResultT | AlbertGenauKisBahcesiResultT | AlbertGenauBcResultT | AlbertGenauYedekParcaResultT) => {
    if (r.kind === 'yedek_parca') {
      return `${r.tipAdi} — ${r.girdi.kalemSayisi} kalem`;
    }
    if (r.kind === 'bc') {
      const parts = [
        `${r.girdi.genislikMm}×${r.girdi.yukseklikMm}mm`,
        r.girdi.rayTipi ? BC_RAY_TIPI_LABELS[r.girdi.rayTipi] : null,
        FINISH_LABELS[finish] || finish,
      ].filter(Boolean);
      return `${r.tipAdi} — ${parts.join(', ')}`;
    }
    if (r.kind === 'airflex_modul') {
      const parts = [
        `${r.girdi.adet} adet`,
        r.girdi.tekerlekli ? 'Tekerlekli ayak' : 'Sabit ayak',
        r.girdi.kapiVar ? 'Kapılı' : null,
        FINISH_LABELS[finish] || finish,
      ].filter(Boolean);
      return `${r.tipAdi} — ${parts.join(', ')}`;
    }
    if (r.kind === 'vertiflex') {
      const parts = [
        `${r.girdi.genislikMm}×${r.girdi.yukseklikMm}mm`,
        r.girdi.panelSayisi ? `${r.girdi.panelSayisi} panelli` : null,
        r.girdi.motor === 'somfy' ? 'Somfy motor' : (r.tip === 'impetus_clean_twin' ? 'Albert Genau Statü Motor' : 'AG motor'),
        r.girdi.elektromekanikSetAdet && r.girdi.elektromekanikSetAdet > 1 ? `${r.girdi.elektromekanikSetAdet} adet elektromekanik set` : null,
        FINISH_LABELS[finish] || finish,
      ].filter(Boolean);
      return `${r.tipAdi} — ${parts.join(', ')}`;
    }
    if (r.kind === 'kis_bahcesi') {
      const parts = [
        `${r.girdi.genislikMm}×${r.girdi.derinlikMm}mm`,
        `${r.girdi.tavanBolumSayisi} tavan bölümü`,
        r.girdi.araDikmeSayisi ? `${r.girdi.araDikmeSayisi} ara dikme` : null,
        FINISH_LABELS[finish] || finish,
      ].filter(Boolean);
      return `${r.tipAdi} — ${parts.join(', ')}`;
    }
    const parts = [
      `${r.girdi.genislikMm}×${r.girdi.yapilabilirDerinlikMm}mm`,
      r.girdi.yukseklikMm ? `Y:${r.girdi.yukseklikMm}mm` : null,
      `${r.girdi.modulSayisi} modül`,
      FINISH_LABELS[finish] || finish,
      somfy && hasMotorOption(tip) ? 'Motorlu (Somfy)' : null,
      cornerFlat ? 'Düz köşe' : null,
      kopuk ? 'Panel dolgu (köpük)' : null,
      ledOption === 'warm' ? 'Sıcak LED' : ledOption === 'warm_rgb' ? 'Sıcak + RGB LED' : null,
    ].filter(Boolean);
    return `${r.tipAdi} — ${parts.join(', ')}`;
  };

  // BUG FIX: önceden router.push({pathname:'/(tabs)/teklif', params:{albertGenau:...}})
  // kullanılıyordu -- bu, Teklif ekranının TAMAMEN YENİ (boş) bir kopyasını
  // açıp üzerine tek kalemi ekliyordu; kullanıcının o ana kadar doldurduğu
  // müşteri bilgisi/diğer kalemler arkada, ayrı bir ekran kopyasında kalıyordu
  // ve geri tuşu da bu yüzden beklenmedik şekilde (yığındaki eski kopyalar
  // üzerinden) Panel'e çıkıyordu. Ayrıca `adding` hiç false'a dönmediği için
  // (router.push ile bu ekrandan ayrılınca finally hiç işlemiyordu) kullanıcı
  // bu ekrana geri döndüğünde -- örn. aynı ürünü farklı ölçüyle tekrar eklemek
  // için -- "Teklife Ekle" butonu kalıcı olarak gri/pasif kalıyordu.
  // Artık: kalem AppContext'teki bekleme alanına konuyor (bkz. teklif.tsx'teki
  // tüketici efekt) ve router.back() ile AYNI Teklif ekranı örneğine dönülüyor.
  const onAddToQuote = () => {
    if (!result) return;
    if (adding) return;
    setAdding(true);
    try {
      addPendingAlbertGenauItem({
        urunAdi: result.tipAdi,
        aciklama: buildAciklama(result),
        birimFiyat: Math.round(result.satisFiyati * 100) / 100,
        // Kar HARİÇ maliyet kırılımı -- Geçmiş'teki "Maliyet Ekle" alanını
        // otomatik doldurmak için taşınıyor (bkz. history.tsx).
        agMaliyet: Math.round((result.maliyetIndirimli || 0) * 100) / 100,
        agMontajBedeli: Math.round((result.montajBedeli || 0) * 100) / 100,
        agImalatBedeli: Math.round((result.imalatBedeli || 0) * 100) / 100,
      });
      showToast('Albert Genau kalemi teklife eklendi');
      router.back();
    } finally {
      setAdding(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {toast ? (
        <View style={s.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={s.header}>
        <View style={s.headerLeftGroup}>
          {showHamburger ? (
            // Diğer ekranlardaki (TopHeader) yerleşimle tutarlı olsun diye
            // hamburger menüsü solda -- kullanıcı "3 çizgi neden solda değil"
            // diye bildirdi.
            <TouchableOpacity
              onPress={() => setDrawerVisible(true)}
              style={s.headerBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="hamburger-btn"
            >
              <Ionicons name="menu" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={s.headerTitle} numberOfLines={1}>Albert Genau Fiyat Hesaplama</Text>
        <View style={[s.headerBtn, showHamburger && { width: 80 }]} />
      </View>
      <View style={s.divider} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MotionScrollView
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.contentWrap}>
            {/* Albert Genau kimliği: bayi bu ekrana girince "kendi markasının
                aracı" hissini alsın diye markanın kendi dilini kullanıyoruz --
                albertgenau.com'dan alınan siyah + bordo (#B61231) palet,
                geniş harf aralıklı kelime işareti ve AG monogramı. */}
            <Aurora colors={[AG_RED, '#7A0E22', '#3A3A3A']} base={['#0D0D10', '#1A1114']} style={s.agHero}>
              <View style={s.agHeroInner}>
                {/* Markanın kendi logosu -- koyu zeminde okunsun diye beyaz
                    plaka üzerinde (logo siyah metinli). */}
                <Image
                  source={require('@/assets/images/albert-genau-logo-light.png')}
                  style={s.agLogo}
                  resizeMode="contain"
                />
                <View style={s.agRule} />
                <Text style={s.agTagline}>GÖLGELENDİRME & CAM SİSTEMLERİ</Text>
                <Text style={s.agCaption}>Ölçüleri girin; sistem malzeme listesini ve bayi fiyatını otomatik hesaplasın.</Text>
              </View>

              {/* Teknik çizimlerin sağ alt köşesindeki künye bloğu -- süs
                  değil, föyün kime ve ne zaman ait olduğunu söyleyen bilgi.
                  (Eskiden burada üç tane bordo rozet vardı; hiçbir iş
                  yapmıyorlardı.) */}
              <View style={s.agTitleBlock}>
                <TitleRow label="Bayi" value={activeCompany?.sirketAdi || '—'} />
                <TitleRow label="Föy" value="Bayi fiyat hesabı" />
                <TitleRow label="Tarih" value={new Date().toLocaleDateString('tr-TR')} last />
              </View>
            </Aurora>

            {/* Ürün ailesi: AG BIOFLEX/BIO ölçüye göre, AIRFLEX (ve ileride
                eklenecek diğerleri) düz parça listesi + miktara göre hesaplar. */}
            <Reveal variant="up" distance={18}>
            <Sheet index="01" title="Ürün ailesi" note="Hesaplama yöntemi seçtiğiniz aileye göre değişir.">
              <SystemRow
                label="AG BIOFLEX / BIO"
                caption="Bioklimatik pergola — ölçü bazlı hesap"
                code="ÖLÇÜ"
                selected={family === 'geometric'}
                onPress={() => { setFamily('geometric'); setResult(null); setError(''); }}
                testID="ag-family-geometric"
              />
              {partsListSystems.map((sysOpt) => (
                <SystemRow
                  key={sysOpt.id}
                  label={sysOpt.label}
                  caption="Modül adedi üzerinden parça listesi"
                  code="MODÜL"
                  selected={family === 'airflex_modul'}
                  onPress={() => { setFamily('airflex_modul'); setResult(null); setError(''); }}
                  testID={`ag-family-${sysOpt.id}`}
                />
              ))}
              <SystemRow
                label="VERTIFLEX"
                caption="Dikey giyotin cam sistemi"
                code="ÖLÇÜ"
                selected={family === 'vertiflex'}
                onPress={() => { setFamily('vertiflex'); setResult(null); setError(''); }}
                testID="ag-family-vertiflex"
              />
              <SystemRow
                label="KIŞ BAHÇESİ"
                caption="Sabit cam tavan"
                code="ÖLÇÜ"
                selected={family === 'kis_bahcesi'}
                onPress={() => { setFamily('kis_bahcesi'); setResult(null); setError(''); }}
                testID="ag-family-kis-bahcesi"
              />
              <SystemRow
                label="BC AİLESİ"
                caption="Tiara, Slider, Slide Master, HD, Tango ve Optima"
                code="ÖLÇÜ"
                selected={family === 'bc'}
                onPress={() => { setFamily('bc'); setResult(null); setError(''); }}
                testID="ag-family-bc"
              />
              <SystemRow
                label="Yedek parça"
                caption="Tek tek parça ve miktar girişi"
                code="PARÇA"
                selected={family === 'yedek_parca'}
                onPress={() => { setFamily('yedek_parca'); setResult(null); setError(''); }}
                testID="ag-family-yedek-parca"
              />
            </Sheet>
            </Reveal>

            {/* Firma-bazlı fiyat listesi -- sadece firma sahibi görür/yükler.
                Yeni bir bayi bu programı aldığında verilen başlangıç Excel'ini,
                zam geldiğinde de güncel Excel'i buradan kendisi yükler. */}
            {!isStaffUser && (
              <View style={[s.card, { marginBottom: 12 }]}>
                <TouchableOpacity
                  style={s.priceListToggle}
                  onPress={() => setPriceListOpen((v) => !v)}
                  testID="ag-price-list-toggle"
                >
                  <Ionicons name="pricetags-outline" size={16} color={theme.colors.primary} />
                  <Text style={s.priceListToggleText}>
                    {typeof priceListStatus?.skuCount === 'number'
                      ? `Fiyat listesi — ${priceListStatus.skuCount} kalem`
                      : 'Fiyat listesi'}
                  </Text>
                  <Ionicons name={priceListOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {priceListOpen && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={s.priceListSource}>
                      {priceListStatus?.exists
                        ? 'Kendi yüklediğiniz özel Excel kullanılıyor'
                        : 'Merkezi (güncel) fiyat listesi kullanılıyor — isterseniz kendi özel listenizi yükleyip önceliklendirebilirsiniz'}
                    </Text>
                    {priceListStatus?.updatedAt ? (
                      <Text style={s.priceListMeta}>Son güncelleme: {new Date(priceListStatus.updatedAt).toLocaleString('tr-TR')}</Text>
                    ) : null}
                    <Text style={s.priceListHint}>
                      Fiyatlar merkezi olarak yönetilir; yeni bir fiyat güncellemesi geldiğinde otomatik olarak
                      yansır. Sadece kendi özel fiyatlarınızla çalışmak isterseniz buradan bir Excel yükleyebilirsiniz.
                    </Text>
                    <TouchableOpacity
                      style={[s.priceListUploadBtn, priceListUploading && { opacity: 0.6 }]}
                      onPress={onPickAndUploadPriceList}
                      disabled={priceListUploading}
                      testID="ag-price-list-upload"
                    >
                      {priceListUploading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                          <Text style={s.priceListUploadBtnText}>
                            {priceListStatus?.exists ? 'Excel Dosyasını Güncelle' : 'Excel Dosyası Yükle'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {family === 'geometric' && (
            <>
            {/* Sistem tipi */}
            <Reveal variant="up" distance={18}>
            <Sheet
              index="02"
              title="Sistem tipi"
              note="Ayak düzeni; girilecek ölçüleri belirler."
              status={
                selectedTypeLabel ? { text: selectedTypeLabel, done: true } : { text: 'seçilmedi' }
              }
            >
              <View style={s.typeWrap}>
                {(meta.types || []).map((tp) => (
                  <SpecOption
                    key={tp.id}
                    label={tp.label}
                    selected={tip === tp.id}
                    onPress={() => { setTip(tp.id); setResult(null); }}
                    testID={`ag-type-${tp.id}`}
                  />
                ))}
              </View>
            </Sheet>
            </Reveal>

            {/* Ölçüler -- canlı cephe çizimi ekranın tek "hero" görseli.
                Bayi rakamı yazdıkça çizim gerçek oranına oturur; böylece
                ölçü girmek bir form doldurmaktan çıkıp sistemi görmeye
                dönüşür. */}
            <Reveal variant="up" distance={18}>
            <Sheet
              index="03"
              title="Ölçüler"
              note="Tüm ölçüler milimetre cinsindendir."
              status={{
                text: `${[genislik, derinlik, needsHeight(tip) ? yukseklik : '1'].filter((v) => Number(String(v).replace(',', '.')) > 0).length}/3 ölçü`,
                done: !!genislik && !!derinlik && (!needsHeight(tip) || !!yukseklik),
              }}
            >
              <Elevation
                w={genislik}
                h={needsHeight(tip) ? yukseklik : ''}
                d={derinlik}
                plan={!needsHeight(tip)}
                caption={selectedTypeLabel}
              />
              <View style={[s.row, { marginTop: AGS.rowGap }]}>
                <NumField label="Genişlik" value={genislik} onChange={setGenislik} testID="ag-genislik" />
                <NumField label="Derinlik" value={derinlik} onChange={setDerinlik} testID="ag-derinlik" />
              </View>
              {liveDepthChoice && (
                <View style={s.choiceBox}>
                  <View style={s.choiceHeader}>
                    <Ionicons name="git-compare-outline" size={17} color={AG.redLift} />
                    <Text style={s.choiceTitle}>Derinlik standart ölçüye denk gelmiyor</Text>
                  </View>
                  <Text style={s.choiceHint}>
                    {liveDepthChoice.rawMm}mm için iki standart derinlikten birini seçin:
                  </Text>
                  <View style={s.row}>
                    <TouchableOpacity style={s.choiceBtn} onPress={() => onPickLiveDepth(liveDepthChoice.floorMm)} testID="ag-depth-floor-live">
                      <Text style={s.choiceBtnLabel}>Alt ölçü</Text>
                      <Text style={s.choiceBtnValue}>{liveDepthChoice.floorMm}</Text>
                      <Text style={s.choiceBtnSub}>dar, içeride kalır</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.choiceBtn} onPress={() => onPickLiveDepth(liveDepthChoice.ceilMm)} testID="ag-depth-ceil-live">
                      <Text style={s.choiceBtnLabel}>Üst ölçü</Text>
                      <Text style={s.choiceBtnValue}>{liveDepthChoice.ceilMm}</Text>
                      <Text style={s.choiceBtnSub}>geniş, taşabilir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {needsHeight(tip) ? (
                <View style={{ marginTop: AGS.rowGap }}>
                  <NumField label="Yükseklik" value={yukseklik} onChange={setYukseklik} testID="ag-yukseklik" />
                </View>
              ) : (
                <Text style={s.hint}>Bu tip ayaksız (iki duvar arasına monte) olduğu için yükseklik girilmez.</Text>
              )}
            </Sheet>
            </Reveal>
            </>
            )}

            {family === 'airflex_modul' && (
              <>
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Sistem Adedi</Text>
                  <Text style={[s.hint, { marginTop: -4, marginBottom: 10 }]}>
                    Yükseklik her sistemde sabit 1850mm'dir; ayrıca girmenize gerek yoktur.
                  </Text>
                  <NumField label="Adet" value={afAdet} onChange={setAfAdet} testID="ag-af-adet" />
                  <Text style={[s.fieldLabel, { marginTop: 14 }]}>Sabit Panel Takımı Tipi</Text>
                  <View style={s.payWrap}>
                    <TouchableOpacity
                      style={[s.payPill, !afTekerlekli && s.payPillActive]}
                      onPress={() => { setAfTekerlekli(false); setResult(null); }}
                      testID="ag-af-sabit"
                    >
                      <Text style={[s.payPillText, !afTekerlekli && s.payPillTextActive]}>Sabit Ayak</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.payPill, afTekerlekli && s.payPillActive]}
                      onPress={() => { setAfTekerlekli(true); setResult(null); }}
                      testID="ag-af-tekerlekli"
                    >
                      <Text style={[s.payPillText, afTekerlekli && s.payPillTextActive]}>Tekerlekli Ayak</Text>
                    </TouchableOpacity>
                  </View>
                  <ToggleRow label="Kapı Panel Takımı Var" value={afKapiVar} onChange={setAfKapiVar} testID="ag-af-kapi" />
                  <ToggleRow label="Kilit Takımı Var" value={afKilitVar} onChange={setAfKilitVar} testID="ag-af-kilit" />
                  <Text style={s.hint}>Kapı ve kilit takımı seçilirse adetten bağımsız olarak 1'er adet fiyatlandırılır.</Text>
                </View>
                </Reveal>

                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Cam Hesabı</Text>
                  <Text style={[s.hint, { marginTop: -4, marginBottom: 10 }]}>
                    Cam, Albert Genau fiyat listesinde yer almaz; kendi tedarik fiyatınızla girin. Alan = Genişlik × 1850mm sabit yükseklik.
                  </Text>
                  <Text style={s.fieldLabel}>Sabit Panel Camı (10mm Temperli)</Text>
                  <View style={s.row}>
                    <NumField label="Genişlik (mm)" value={afCamSabitGenislik} onChange={setAfCamSabitGenislik} testID="ag-af-cam-sabit-genislik" />
                    <NumField label="Fiyat (₺/m²)" value={afCamSabitFiyat} onChange={setAfCamSabitFiyat} testID="ag-af-cam-sabit-fiyat" />
                  </View>
                  <Text style={[s.fieldLabel, { marginTop: 10 }]}>Hareketli Panel Camı (8mm Temperli)</Text>
                  <View style={s.row}>
                    <NumField label="Genişlik (mm)" value={afCamHareketliGenislik} onChange={setAfCamHareketliGenislik} testID="ag-af-cam-hareketli-genislik" />
                    <NumField label="Fiyat (₺/m²)" value={afCamHareketliFiyat} onChange={setAfCamHareketliFiyat} testID="ag-af-cam-hareketli-fiyat" />
                  </View>
                </View>
                </Reveal>
              </>
            )}

            {family === 'vertiflex' && (
              <>
                {/* Alt tip seçimi */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.fieldLabel}>VERTIFLEX Alt Tipi</Text>
                  <View style={s.typeWrap}>
                    {vertiflexTypes.map((tp) => (
                      <SpecOption
                        key={tp.id}
                        label={tp.label}
                        selected={vfTip === tp.id}
                        onPress={() => setVfTip(tp.id)}
                        testID={`ag-vf-type-${tp.id}`}
                      />
                    ))}
                  </View>
                </View>
                </Reveal>

                {/* Ölçüler */}
                <Reveal variant="up" distance={18}>
                <Sheet title="Ölçüler" note="Tüm ölçüler milimetre cinsindendir.">
                  <Elevation w={vfGenislik} h={vfYukseklik} caption={vfTypeMeta?.label} />
                  <View style={[s.row, { marginTop: AGS.rowGap }]}>
                    <NumField label="Genişlik" value={vfGenislik} onChange={setVfGenislik} testID="ag-vf-genislik" />
                    <NumField label="Yükseklik" value={vfYukseklik} onChange={setVfYukseklik} testID="ag-vf-yukseklik" />
                  </View>
                </Sheet>
                </Reveal>

                {/* Panel sayısı -- sadece bu tipte gecerliyse gosterilir */}
                {(vfTypeMeta.panelSayisiOptions || []).length > 0 && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.fieldLabel}>Panel Sayısı</Text>
                    <View style={s.payWrap}>
                      {(vfTypeMeta.panelSayisiOptions || []).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[s.payPill, vfPanelSayisi === p && s.payPillActive]}
                          onPress={() => { setVfPanelSayisi(p); setResult(null); }}
                          testID={`ag-vf-panel-${p}`}
                        >
                          <Text style={[s.payPillText, vfPanelSayisi === p && s.payPillTextActive]}>{p} Panel</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  </Reveal>
                )}

                {/* Motor markası + kumanda kanalı */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.fieldLabel}>Motor Markası</Text>
                  {(vfTypeMeta.motorOptions || []).length > 1 ? (
                    <View style={s.payWrap}>
                      {(vfTypeMeta.motorOptions || []).map((m) => (
                        <TouchableOpacity
                          key={m}
                          activeOpacity={0.8}
                          style={[s.payPill, vfMotor === m && s.payPillActive]}
                          onPress={() => { setVfMotor(m); setResult(null); }}
                          testID={`ag-vf-motor-${m}`}
                        >
                          <Text style={[s.payPillText, vfMotor === m && s.payPillTextActive]}>{m === 'ag' ? 'Albert Genau' : 'Somfy'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    // Tek secenek varsa (secilecek gercek bir alternatif yokken)
                    // dev boy, dokunulabilir gorunumlu bir pill yerine sakin,
                    // bilgilendirici bir satir gosterilir -- boyle bir alanda
                    // "secim" izlenimi vermek yaniltici ve yapay durur.
                    <View style={s.fixedValueRow} testID="ag-vf-motor-fixed">
                      <View style={s.fixedValueDot} />
                      <Text style={s.fixedValueText}>
                        {vfTip === 'impetus_clean_twin' ? 'Albert Genau Statü Motor' : 'Albert Genau'}
                      </Text>
                      <Text style={s.fixedValueTag}>SABİT</Text>
                    </View>
                  )}
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>Kumanda Kanalı{vfTypeMeta.kumandaOptional ? ' (opsiyonel)' : ''}</Text>
                  <View style={s.typeWrap}>
                    {vfTypeMeta.kumandaOptional && (
                      <TouchableOpacity
                        style={[s.finishPill, vfKumandaKanal === null && s.typePillActive]}
                        onPress={() => { setVfKumandaKanal(null); setResult(null); }}
                        testID="ag-vf-kumanda-none"
                      >
                        <Text style={[s.typePillText, vfKumandaKanal === null && s.typePillTextActive]}>Kumanda Yok</Text>
                      </TouchableOpacity>
                    )}
                    {(vfTypeMeta.kumandaKanalOptions?.[vfMotor] || []).map((k) => (
                      <TouchableOpacity
                        key={k}
                        style={[s.finishPill, vfKumandaKanal === k && s.typePillActive]}
                        onPress={() => { setVfKumandaKanal(k); setResult(null); }}
                        testID={`ag-vf-kumanda-${k}`}
                      >
                        <Text style={[s.typePillText, vfKumandaKanal === k && s.typePillTextActive]}>{VF_KUMANDA_LABELS[k] || `${k} Kanal`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                </Reveal>

                {/* Secumax taraf (sadece UP TWIN) */}
                {vfTypeMeta.secumaxTaraf && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.fieldLabel}>Secumax Motor Tarafı</Text>
                    <View style={s.payWrap}>
                      <TouchableOpacity
                        style={[s.payPill, vfSecumaxTaraf === 'sag' && s.payPillActive]}
                        onPress={() => { setVfSecumaxTaraf('sag'); setResult(null); }}
                        testID="ag-vf-secumax-sag"
                      >
                        <Text style={[s.payPillText, vfSecumaxTaraf === 'sag' && s.payPillTextActive]}>Sağ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.payPill, vfSecumaxTaraf === 'sol' && s.payPillActive]}
                        onPress={() => { setVfSecumaxTaraf('sol'); setResult(null); }}
                        testID="ag-vf-secumax-sol"
                      >
                        <Text style={[s.payPillText, vfSecumaxTaraf === 'sol' && s.payPillTextActive]}>Sol</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </Reveal>
                )}

                {/* Tip-bazlı ek seçenekler (inox / alıcısız / su tahliyeli) */}
                {(vfTypeMeta.inoxZincirli || vfTypeMeta.alicisiz || vfTypeMeta.suTahliyeliAltKasa) && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Seçenekler</Text>
                    {vfTypeMeta.inoxZincirli && (
                      <ToggleRow label="INOX zincirli panel seti" value={vfInoxZincirli} onChange={setVfInoxZincirli} testID="ag-vf-inox" />
                    )}
                    {vfTypeMeta.alicisiz && (
                      <ToggleRow label="Alıcısız motor seti" value={vfAlicisiz} onChange={setVfAlicisiz} testID="ag-vf-alicisiz" />
                    )}
                    {vfTypeMeta.suTahliyeliAltKasa && (
                      <ToggleRow label="Su tahliyeli alt kasa" value={vfSuTahliyeli} onChange={setVfSuTahliyeli} testID="ag-vf-sutahliyeli" />
                    )}
                  </View>
                  </Reveal>
                )}

                {/* Elektromekanik set adedi -- sadece STATU IMPETUS CLEAN TWIN'de gecerli */}
                {vfTip === 'impetus_clean_twin' && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Elektromekanik Set</Text>
                    <NumField
                      label="IMPETUS TWIN STATU Elektromekanik Set Adedi"
                      value={vfElektromekanikSetAdet}
                      onChange={setVfElektromekanikSetAdet}
                      testID="ag-vf-elektromekanik-adet"
                    />
                    <Text style={s.hint}>Geniş açıklıklarda birden fazla elektromekanik set gerekebilir; ihtiyacınız olan adedi girin.</Text>
                  </View>
                  </Reveal>
                )}

                {/* Cam fiyatları -- Albert Genau cam satmaz, bayi kendi m² fiyatını girer */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Cam Fiyatları</Text>
                  <Text style={[s.hint, { marginTop: -4, marginBottom: 10 }]}>
                    Cam, Albert Genau fiyat listesinde yer almaz; kendi tedarik fiyatınızla girin.
                  </Text>
                  {(vfTypeMeta.camSkus || []).map((c) => (
                    <NumField
                      key={c.sku}
                      label={`${c.label} (₺/m²)`}
                      value={vfCamFiyatlari[c.sku] || ''}
                      onChange={(v) => setVfCamFiyatlari((prev) => ({ ...prev, [c.sku]: v }))}
                      testID={`ag-vf-cam-${c.sku}`}
                    />
                  ))}
                </View>
                </Reveal>
              </>
            )}

            {family === 'kis_bahcesi' && (
              <>
                {/* Alt tip seçimi */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.fieldLabel}>KIŞ BAHÇESİ Alt Tipi</Text>
                  <View style={s.typeWrap}>
                    {kisBahcesiTypes.map((tp) => (
                      <SpecOption
                        key={tp.id}
                        label={tp.label}
                        selected={kbTip === tp.id}
                        onPress={() => setKbTip(tp.id)}
                        testID={`ag-kb-type-${tp.id}`}
                      />
                    ))}
                  </View>
                </View>
                </Reveal>

                {/* Ölçüler */}
                <Reveal variant="up" distance={18}>
                <Sheet title="Ölçüler" note="Tüm ölçüler milimetre cinsindendir.">
                  {/* Sabit cam tavan yukarıdan okunur: plan görünümü. */}
                  <Elevation w={kbGenislik} d={kbDerinlik} plan caption={kbTypeMeta?.label} />
                  <View style={[s.row, { marginTop: AGS.rowGap }]}>
                    <NumField label="Genişlik" value={kbGenislik} onChange={setKbGenislik} testID="ag-kb-genislik" />
                    <NumField label="Derinlik" value={kbDerinlik} onChange={setKbDerinlik} testID="ag-kb-derinlik" />
                  </View>
                  <View style={[s.row, { marginTop: AGS.rowGap }]}>
                    <NumField label="Tavan Bölüm Sayısı" value={kbTavanBolumSayisi} onChange={setKbTavanBolumSayisi} testID="ag-kb-tavan-bolum" />
                    <NumField label="Arka Duvar Alt Yüksekliği" value={kbArkaDuvarAltYukseklik} onChange={setKbArkaDuvarAltYukseklik} testID="ag-kb-arka-duvar" />
                  </View>
                  <Text style={s.hint}>
                    Ön dikme yüksekliği, arka duvar yüksekliğinden 8° çatı eğimine göre otomatik hesaplanır.
                  </Text>
                  <View style={{ marginTop: AGS.rowGap }}>
                    <NumField label="Ara Dikme Sayısı (opsiyonel)" value={kbAraDikmeSayisi} onChange={setKbAraDikmeSayisi} testID="ag-kb-ara-dikme" />
                  </View>
                </Sheet>
                </Reveal>

                {/* Tip-bazlı ek seçenekler */}
                {(kbTypeMeta.ayarliDuvarBaglantisi || kbTypeMeta.kirisUstuVidaKapama || kbTypeMeta.ortaKayit || kbTypeMeta.ucgenMikroPencere) && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Seçenekler</Text>
                    {kbTypeMeta.ayarliDuvarBaglantisi && (
                      <ToggleRow label="Ayarlı duvar bağlantı profili" value={kbAyarliDuvarBaglantisi} onChange={setKbAyarliDuvarBaglantisi} testID="ag-kb-ayarli-duvar" />
                    )}
                    {kbTypeMeta.kirisUstuVidaKapama && (
                      <ToggleRow label="Kiriş üstü vida kapama profili" value={kbKirisUstuVidaKapama} onChange={setKbKirisUstuVidaKapama} testID="ag-kb-kiris-vida" />
                    )}
                    {kbTypeMeta.ortaKayit && (
                      <ToggleRow label="Orta kayıt" value={kbOrtaKayit} onChange={setKbOrtaKayit} testID="ag-kb-orta-kayit" />
                    )}
                    {kbTypeMeta.ucgenMikroPencere && (
                      <ToggleRow label="Üçgen mikro pencere" value={kbUcgenMikroPencere} onChange={setKbUcgenMikroPencere} testID="ag-kb-ucgen-mikro" />
                    )}
                  </View>
                  </Reveal>
                )}

                {/* Cam fiyatları -- Albert Genau cam satmaz, bayi kendi m² fiyatını girer */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Cam Fiyatları</Text>
                  <Text style={[s.hint, { marginTop: -4, marginBottom: 10 }]}>
                    Cam, Albert Genau fiyat listesinde yer almaz; kendi tedarik fiyatınızla girin.
                  </Text>
                  {(kbTypeMeta.camSkus || []).map((c) => (
                    <NumField
                      key={c.sku}
                      label={`${c.label} (₺/m²)`}
                      value={kbCamFiyatlari[c.sku] || ''}
                      onChange={(v) => setKbCamFiyatlari((prev) => ({ ...prev, [c.sku]: v }))}
                      testID={`ag-kb-cam-${c.sku}`}
                    />
                  ))}
                </View>
                </Reveal>
              </>
            )}

            {family === 'bc' && (
              <>
                {/* Alt tip seçimi -- 39 varyant olduğu için alt-marka bazında
                    gruplanmış (bkz. BC_GROUPS). */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.fieldLabel}>BC Alt Tipi</Text>
                  {BC_GROUPS.map((g) => {
                    const groupTypes = bcTypes.filter((t) => g.match(t.id));
                    if (!groupTypes.length) return null;
                    return (
                      <View key={g.title} style={{ marginBottom: 10 }}>
                        <Text style={s.hint}>{g.title}</Text>
                        <View style={s.typeWrap}>
                          {groupTypes.map((tp) => (
                            <SpecOption
                              key={tp.id}
                              label={tp.label}
                              selected={bcTip === tp.id}
                              onPress={() => setBcTip(tp.id)}
                              testID={`ag-bc-type-${tp.id}`}
                            />
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
                </Reveal>

                {/* Ölçüler */}
                <Reveal variant="up" distance={18}>
                <Sheet title="Ölçüler" note="Tüm ölçüler milimetre cinsindendir.">
                  <Elevation w={bcGenislik} h={bcYukseklik} caption={bcTypeMeta?.label} />
                  <View style={[s.row, { marginTop: AGS.rowGap }]}>
                    <NumField label="Genişlik" value={bcGenislik} onChange={setBcGenislik} testID="ag-bc-genislik" />
                    <NumField label="Yükseklik" value={bcYukseklik} onChange={setBcYukseklik} testID="ag-bc-yukseklik" />
                  </View>
                </Sheet>
                </Reveal>

                {/* Ray tipi -- sadece SLIDER NEXT/FLAT sistemlerinde var */}
                {bcTypeMeta.hasRayType && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Ray Tipi</Text>
                    <View style={s.typeWrap}>
                      {[1, 2, 3, 4].map((rt) => (
                        <SpecOption
                          key={rt}
                          label={BC_RAY_TIPI_LABELS[rt]}
                          selected={bcRayTipi === rt}
                          onPress={() => setBcRayTipi(rt)}
                          testID={`ag-bc-ray-${rt}`}
                        />
                      ))}
                    </View>
                  </View>
                  </Reveal>
                )}

                {/* Kanat takımları -- tipe göre değişir (bkz. BC_TYPE_META.kanatInputs) */}
                {Object.keys(bcTypeMeta.kanatInputs || {}).length > 0 && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Kanat Takımları (Adet)</Text>
                    {Object.entries(bcTypeMeta.kanatInputs || {}).map(([ref, meta]) => (
                      <NumField
                        key={ref}
                        label={meta.label}
                        value={bcKanatMiktarlari[ref] ?? String(meta.default)}
                        onChange={(v) => setBcKanatMiktarlari((prev) => ({ ...prev, [ref]: v }))}
                        testID={`ag-bc-kanat-${ref}`}
                      />
                    ))}
                  </View>
                  </Reveal>
                )}

                {/* Bayrak/köşe girdileri -- tipe göre değişir (bkz. BC_TYPE_META.flagInputs) */}
                {Object.keys(bcTypeMeta.flagInputs || {}).length > 0 && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Ek Seçenekler</Text>
                    {Object.entries(bcTypeMeta.flagInputs || {}).map(([ref, meta]) =>
                      meta.kind === 'bool' ? (
                        <ToggleRow
                          key={ref}
                          label={meta.label}
                          value={(bcBayrakDegerleri[ref] ?? String(meta.default)) === '1'}
                          onChange={(v) => setBcBayrakDegerleri((prev) => ({ ...prev, [ref]: v ? '1' : '0' }))}
                          testID={`ag-bc-bayrak-${ref}`}
                        />
                      ) : (
                        <NumField
                          key={ref}
                          label={meta.label}
                          value={bcBayrakDegerleri[ref] ?? String(meta.default)}
                          onChange={(v) => setBcBayrakDegerleri((prev) => ({ ...prev, [ref]: v }))}
                          testID={`ag-bc-bayrak-${ref}`}
                        />
                      ),
                    )}
                  </View>
                  </Reveal>
                )}

                {/* Cam fiyatları -- Albert Genau cam satmaz, bayi kendi fiyatını girer */}
                {(bcTypeMeta.camItems || []).length > 0 && (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>Cam Fiyatları</Text>
                    <Text style={[s.hint, { marginTop: -4, marginBottom: 10 }]}>
                      Cam, Albert Genau fiyat listesinde yer almaz; kendi tedarik fiyatınızla girin.
                    </Text>
                    {(bcTypeMeta.camItems || []).map((c) => (
                      <NumField
                        key={c.camSku}
                        label={`${c.label} (₺/${c.unit})`}
                        value={bcCamFiyatlari[c.camSku] || ''}
                        onChange={(v) => setBcCamFiyatlari((prev) => ({ ...prev, [c.camSku]: v }))}
                        testID={`ag-bc-cam-${c.camSku}`}
                      />
                    ))}
                  </View>
                  </Reveal>
                )}
              </>
            )}

            {family === 'yedek_parca' && (
              <>
                {/* Arama + grup filtresi -- 243 kalemlik katalog tek seferde
                    listelenmez, kullanıcı arayarak veya grup seçerek daraltır. */}
                <Reveal variant="up" distance={18}>
                <View style={s.card}>
                  <Text style={s.fieldLabel}>Parça Ara</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      value={ypSearch}
                      onChangeText={setYpSearch}
                      placeholder="Parça adı veya stok kodu yazın (en az 2 harf)"
                      placeholderTextColor={theme.colors.textMuted}
                      testID="ag-yp-search"
                    />
                  </View>
                  <View style={[s.typeWrap, { marginTop: 10 }]}>
                    <SpecOption
                      label="Tümü"
                      selected={ypGroupFilter === 'ALL'}
                      onPress={() => setYpGroupFilter('ALL')}
                      testID="ag-yp-group-all"
                    />
                    {ypMeta.groups.map((g) => (
                      <SpecOption
                        key={g}
                        label={g}
                        selected={ypGroupFilter === g}
                        onPress={() => setYpGroupFilter(g)}
                        testID={`ag-yp-group-${g}`}
                      />
                    ))}
                  </View>
                  {ypSelectedCount > 0 && (
                    <Text style={[s.hint, { marginTop: 8 }]}>{ypSelectedCount} kalem seçildi</Text>
                  )}
                </View>
                </Reveal>

                {/* Filtrelenmiş liste -- hiçbir filtre uygulanmadan (grup=Tümü
                    ve arama<2 harf) tüm katalog render edilmez. */}
                {ypGroupFilter === 'ALL' && ypSearch.trim().length < 2 ? (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.hint}>Aramaya başlayın veya yukarıdan bir alt-marka grubu seçin.</Text>
                  </View>
                  </Reveal>
                ) : ypFilteredItems.length === 0 ? (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.hint}>Eşleşen parça bulunamadı.</Text>
                  </View>
                  </Reveal>
                ) : (
                  <Reveal variant="up" distance={18}>
                  <View style={s.card}>
                    <Text style={s.sectionTitle}>{`Sonuçlar (${ypFilteredItems.length}${ypFilteredItems.length >= 100 ? '+' : ''})`}</Text>
                    {ypFilteredItems.map((it: AlbertGenauYedekParcaItemT) => (
                      <View key={it.sku} style={s.partsRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={s.partsRowLabel} numberOfLines={2}>{it.name}</Text>
                          <Text style={s.partsRowSub}>{it.sku} • {it.unit} • ₺{money(it.price)}</Text>
                        </View>
                        <View style={s.partsRowInputWrap}>
                          <TextInput
                            style={s.input}
                            value={ypQuantities[it.sku] || ''}
                            onChangeText={(v) => setYpQuantities((prev) => ({ ...prev, [it.sku]: v }))}
                            placeholder="0"
                            placeholderTextColor={theme.colors.textMuted}
                            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                            testID={`ag-yp-qty-${it.sku}`}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                  </Reveal>
                )}
              </>
            )}

            {/* Ödeme Tipi — SADECE Bioklimatik Pergola (BIOFLEX) ailesinde
                gösterilir: Excel'deki KREDİ KARTINA TAKSİTLİ / NAKİT sütun
                ayrımı (KREDİ KARTI liste fiyatı, NAKİT ise liste fiyatının
                %89'u) sadece bu ailenin kaynak Excel'inde gerçekten var.
                Diğer ailelerde (Vertiflex/Giyotin, Kış Bahçesi, BC, Airflex
                Modül, Parça Listesi, Yedek Parça) kaynak Excel'de tek bir
                fiyat sütunu var, bu yüzden bu seçici orada gösterilmez ve
                backend de bu ailelerde fiyatı hep indirimsiz hesaplar. */}
            {family === 'geometric' && (
              <Reveal variant="up" distance={18}>
              <View style={s.card}>
                <Text style={s.sectionTitle}>Ödeme Tipi</Text>
                <View style={s.payWrap}>
                  <TouchableOpacity
                    style={[s.payPill, odemeTipi === 'nakit' && s.payPillActive]}
                    onPress={() => { setOdemeTipi('nakit'); setResult(null); }}
                    testID="ag-pay-nakit"
                  >
                    <Ionicons name="cash-outline" size={16} color={odemeTipi === 'nakit' ? '#fff' : theme.colors.textMuted} />
                    <Text style={[s.payPillText, odemeTipi === 'nakit' && s.payPillTextActive]}>Nakit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.payPill, odemeTipi === 'kredi_karti' && s.payPillActive]}
                    onPress={() => { setOdemeTipi('kredi_karti'); setResult(null); }}
                    testID="ag-pay-kredi"
                  >
                    <Ionicons name="card-outline" size={16} color={odemeTipi === 'kredi_karti' ? '#fff' : theme.colors.textMuted} />
                    <Text style={[s.payPillText, odemeTipi === 'kredi_karti' && s.payPillTextActive]}>Kredi Kartı</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.hint}>
                  Nakit ödemede fiyat listesinin %89'u; kredi kartı ile ödemede ise tam liste fiyatı esas alınır.
                </Text>
              </View>
              </Reveal>
            )}

            {/* Opsiyonlar (sadece ölçü bazlı AG BIOFLEX/BIO) */}
            {family === 'geometric' && (
              <Reveal variant="up" distance={18}>
              <View style={s.card}>
                <Text style={s.sectionTitle}>Seçenekler</Text>
                <ToggleRow label="Düz köşe kapağı" value={cornerFlat} onChange={setCornerFlat} testID="ag-cornerflat" />
                {hasMotorOption(tip) && (
                  <ToggleRow label="Motorlu (Somfy)" value={somfy} onChange={setSomfy} testID="ag-somfy" />
                )}
                {hasWallBracketOption(tip) && (
                  <ToggleRow label="Duvar bağlantı aparatı kullanılmayacak" value={noWallBracket} onChange={setNoWallBracket} testID="ag-nowallbracket" />
                )}
              </View>
              </Reveal>
            )}

            {/* Kaplama / Renk -- her iki ürün ailesinde de ortak (bkz.
                ag_calc.FINISH_OPTIONS / _finish_multiplier). */}
            <Reveal variant="up" distance={18}>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Kaplama / Renk</Text>
              <View style={s.typeWrap}>
                {(meta.finishes || []).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[s.finishPill, finish === f && s.typePillActive]}
                    onPress={() => setFinish(f)}
                    testID={`ag-finish-${f}`}
                  >
                    <Text style={[s.typePillText, finish === f && s.typePillTextActive]}>{FINISH_LABELS[f] || f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            </Reveal>

            {/* LED + Köpük (sadece ölçü bazlı AG BIOFLEX/BIO) */}
            {family === 'geometric' && (
              <Reveal variant="up" distance={18}>
              <View style={s.card}>
                <Text style={s.sectionTitle}>LED Aydınlatma &amp; Panel Dolgu</Text>
                <View style={s.typeWrap}>
                  <TouchableOpacity style={[s.finishPill, ledOption === '' && s.typePillActive]} onPress={() => setLedOption('')} testID="ag-led-none">
                    <Text style={[s.typePillText, ledOption === '' && s.typePillTextActive]}>LED Yok</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.finishPill, ledOption === 'warm' && s.typePillActive]} onPress={() => setLedOption('warm')} testID="ag-led-warm">
                    <Text style={[s.typePillText, ledOption === 'warm' && s.typePillTextActive]}>Sıcak Beyaz LED</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.finishPill, ledOption === 'warm_rgb' && s.typePillActive]} onPress={() => setLedOption('warm_rgb')} testID="ag-led-rgb">
                    <Text style={[s.typePillText, ledOption === 'warm_rgb' && s.typePillTextActive]}>Sıcak + RGB LED</Text>
                  </TouchableOpacity>
                </View>
                {!!ledOption && (
                  <ToggleRow label="LED, orta destek profiline bağlansın" value={ledMidSupport} onChange={setLedMidSupport} testID="ag-led-midsupport" />
                )}
                <ToggleRow label="Panel dolgu (köpük) eklensin" value={kopuk} onChange={setKopuk} testID="ag-kopuk" />
                <Text style={s.hint}>LED ve köpük fiyatları da aynı Excel formülleriyle otomatik hesaplanır; ekstra bir şey girmenize gerek yok.</Text>
              </View>
              </Reveal>
            )}

            {/* İskonto + Montaj + Kar -- eskiden üç alan tek satıra
                sıkıştırılmıştı; dar ekranda etiketler kesiliyordu. Artık
                anlamca eşleşen ikişerli iki satır: önce oranlar, sonra
                bedeller. */}
            <Reveal variant="up" distance={18}>
            <Sheet index="09" title="İskonto, montaj ve kâr" note="Bu değerler yalnızca sizin fiyatınızı etkiler; listeye yansımaz.">
              <View style={s.row}>
                <NumField label="Alış İskonto Oranı (%)" value={alisIskontoPct} onChange={setAlisIskontoPct} testID="ag-iskonto" />
                <NumField label="Kar Marjı (%)" value={karMarjiPct} onChange={setKarMarjiPct} testID="ag-kar" />
              </View>
              <View style={[s.row, { marginTop: AGS.rowGap }]}>
                <NumField label="Montaj Bedeli (₺)" value={montajBedeli} onChange={setMontajBedeli} testID="ag-montaj" />
                <NumField label="İmalat ve Diğer Giderler (₺)" value={imalatBedeli} onChange={setImalatBedeli} testID="ag-imalat" />
              </View>
              <View style={s.formulaBox}>
                <Text style={s.formulaHead}>Satış fiyatı nasıl bulunur</Text>
                <Text style={s.formulaLine}>
                  (Malzeme maliyeti − iskonto) × (1 + kâr marjı) + montaj + imalat ve diğer giderler
                </Text>
                <Text style={s.formulaNote}>
                  İskonto sadece malzeme maliyetini düşürür; montajı, imalat/diğer giderleri ve kâr marjını etkilemez.
                </Text>
              </View>
            </Sheet>
            </Reveal>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {depthChoice && (
              <View style={s.choiceBox}>
                <View style={s.choiceHeader}>
                  <Ionicons name="help-circle" size={18} color={theme.colors.primary} />
                  <Text style={s.choiceTitle}>Derinlik standart ölçüye tam denk gelmiyor</Text>
                </View>
                <Text style={s.choiceHint}>
                  Girdiğiniz {depthChoice.rawMm}mm için iki standart derinlikten birini seçin:
                </Text>
                <View style={s.row}>
                  <TouchableOpacity style={s.choiceBtn} onPress={() => onChooseDepth(depthChoice.floorMm)} testID="ag-depth-floor">
                    <Text style={s.choiceBtnLabel}>Alt Ölçü</Text>
                    <Text style={s.choiceBtnValue}>{depthChoice.floorMm}mm</Text>
                    <Text style={s.choiceBtnSub}>(dar, içeride kalır)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.choiceBtn} onPress={() => onChooseDepth(depthChoice.ceilMm)} testID="ag-depth-ceil">
                    <Text style={s.choiceBtnLabel}>Üst Ölçü</Text>
                    <Text style={s.choiceBtnValue}>{depthChoice.ceilMm}mm</Text>
                    <Text style={s.choiceBtnSub}>(geniş, taşabilir)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity style={[s.calcBtn, busy && s.ctaDisabled]} onPress={() => onCalculate()} disabled={busy} testID="ag-calculate">
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="calculator-outline" size={18} color="#fff" />
                  <Text style={s.calcBtnText}>Hesapla</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <TiltOnScroll maxRotate={12} minScale={0.95}>
              <BorderBeam radius={20} width={1.4} background={AG_SURFACE} baseBorder="rgba(182,18,49,0.45)" colors={['rgba(182,18,49,0)', '#B61231', '#E8536C', 'rgba(232,83,108,0)']}>
              <View style={[s.card, s.resultCard]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={s.sectionTitle}>{result.tipAdi}</Text>
                  <View style={s.payBadge}>
                    <Ionicons name={result.odemeTipi === 'nakit' ? 'cash-outline' : 'card-outline'} size={12} color={theme.colors.primary} />
                    <Text style={s.payBadgeText}>{result.odemeTipi === 'nakit' ? 'NAKİT' : 'KREDİ KARTI'}</Text>
                  </View>
                </View>
                {result.kind === 'airflex_modul' ? (
                  <Text style={s.resultSub}>
                    {result.girdi.adet} adet • {result.girdi.tekerlekli ? 'Tekerlekli' : 'Sabit'} ayak • Y:{result.girdi.yukseklikMm}mm
                  </Text>
                ) : result.kind === 'vertiflex' ? (
                  <Text style={s.resultSub}>
                    {result.girdi.genislikMm}×{result.girdi.yukseklikMm}mm{result.girdi.panelSayisi ? ` • ${result.girdi.panelSayisi} panel` : ''} • {result.girdi.motor === 'somfy' ? 'Somfy' : 'AG'} motor
                  </Text>
                ) : result.kind === 'kis_bahcesi' ? (
                  <Text style={s.resultSub}>
                    {result.girdi.genislikMm}×{result.girdi.derinlikMm}mm • {result.girdi.tavanBolumSayisi} tavan bölümü{result.girdi.araDikmeSayisi ? ` • ${result.girdi.araDikmeSayisi} ara dikme` : ''}
                  </Text>
                ) : result.kind === 'bc' ? (
                  <Text style={s.resultSub}>
                    {result.girdi.genislikMm}×{result.girdi.yukseklikMm}mm{result.girdi.rayTipi ? ` • ${BC_RAY_TIPI_LABELS[result.girdi.rayTipi]}` : ''}
                  </Text>
                ) : result.kind === 'yedek_parca' ? (
                  <Text style={s.resultSub}>{result.girdi.kalemSayisi} kalem</Text>
                ) : (
                  <Text style={s.resultSub}>
                    {result.girdi.genislikMm}×{result.girdi.yapilabilirDerinlikMm}mm{result.girdi.yukseklikMm ? ` • Y:${result.girdi.yukseklikMm}mm` : ''} • {result.girdi.modulSayisi} modül
                  </Text>
                )}

                {result.kind === 'airflex_modul' ? (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Malzeme Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.malzemeGrubuToplam)}</Text>
                    </View>
                    {result.camGrubuToplam > 0 && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>Cam Grubu</Text>
                        <Text style={s.breakdownValue}>₺{money(result.camGrubuToplam)}</Text>
                      </View>
                    )}
                  </>
                ) : result.kind === 'vertiflex' ? (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Profil Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplam)}</Text>
                    </View>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Aksesuar Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.aksesuarGrubuToplam)}</Text>
                    </View>
                    {result.camGrubuToplam > 0 && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>Cam Grubu</Text>
                        <Text style={s.breakdownValue}>₺{money(result.camGrubuToplam)}</Text>
                      </View>
                    )}
                  </>
                ) : result.kind === 'kis_bahcesi' ? (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Profil Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplam)}</Text>
                    </View>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Aksesuar Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.aksesuarGrubuToplam)}</Text>
                    </View>
                    {result.camGrubuToplam > 0 && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>Cam Grubu</Text>
                        <Text style={s.breakdownValue}>₺{money(result.camGrubuToplam)}</Text>
                      </View>
                    )}
                  </>
                ) : result.kind === 'bc' ? (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Profil Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplam)}</Text>
                    </View>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Kanat Takımları</Text>
                      <Text style={s.breakdownValue}>₺{money(result.aksesuarGrubuToplam)}</Text>
                    </View>
                    {result.camGrubuToplam > 0 && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>Cam Grubu</Text>
                        <Text style={s.breakdownValue}>₺{money(result.camGrubuToplam)}</Text>
                      </View>
                    )}
                  </>
                ) : result.kind === 'yedek_parca' ? (
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownLabel}>Malzeme Grubu</Text>
                    <Text style={s.breakdownValue}>₺{money(result.malzemeGrubuToplam)}</Text>
                  </View>
                ) : (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Profil Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.profilGrubuToplamFiresiz ?? result.profilGrubuToplam)}</Text>
                    </View>
                    {!!result.profilFireTutari && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>Profil Fire Payı (%{Math.round((result.profilFireOrani ?? 0.1) * 100)})</Text>
                        <Text style={s.breakdownValue}>₺{money(result.profilFireTutari)}</Text>
                      </View>
                    )}
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Aksesuar Grubu</Text>
                      <Text style={s.breakdownValue}>₺{money(result.aksesuarGrubuToplam)}</Text>
                    </View>
                    {result.opsiyonelToplam > 0 && (
                      <View style={s.breakdownRow}>
                        <Text style={s.breakdownLabel}>LED / Köpük</Text>
                        <Text style={s.breakdownValue}>₺{money(result.opsiyonelToplam)}</Text>
                      </View>
                    )}
                  </>
                )}
                <View style={[s.breakdownRow, { borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.breakdownLabel, { fontWeight: '800' }]}>Malzeme Maliyeti</Text>
                  <Text style={[s.breakdownValue, { fontWeight: '800' }]}>₺{money(result.maliyetToplam)}</Text>
                </View>
                {result.alisIskontoPct > 0 && (
                  <>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>Alış İskontosu (%{result.alisIskontoPct})</Text>
                      <Text style={[s.breakdownValue, { color: theme.colors.red }]}>−₺{money(result.maliyetToplam - result.maliyetIndirimli)}</Text>
                    </View>
                    <View style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>İskontolu Malzeme Maliyeti</Text>
                      <Text style={s.breakdownValue}>₺{money(result.maliyetIndirimli)}</Text>
                    </View>
                  </>
                )}
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Kar Tutarı (%{result.karMarjiPct})</Text>
                  <Text style={s.breakdownValue}>₺{money(result.karTutari)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>Montaj Bedeli</Text>
                  <Text style={s.breakdownValue}>₺{money(result.montajBedeli)}</Text>
                </View>
                <View style={s.breakdownRow}>
                  <Text style={s.breakdownLabel}>İmalat ve Diğer Giderler</Text>
                  <Text style={s.breakdownValue}>₺{money(result.imalatBedeli || 0)}</Text>
                </View>

                <View style={s.totalBox}>
                  <Text style={s.totalLabel}>SATIŞ FİYATI ({result.odemeTipi === 'nakit' ? 'NAKİT' : 'KREDİ KARTI'})</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.totalValue}>₺{money(result.satisFiyati)}</Text>
                    {satisFiyatiEquiv ? (
                      <Text style={s.totalValueEquiv}>
                        {[
                          satisFiyatiEquiv.usd != null ? `$ ${money(satisFiyatiEquiv.usd)}` : null,
                          satisFiyatiEquiv.eur != null ? `€ ${money(satisFiyatiEquiv.eur)}` : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity style={s.kalemlerToggle} onPress={onShowKalemler} testID="ag-show-kalemler">
                  <Text style={s.kalemlerToggleText}>{`Malzeme listesini görüntüle (${result.kalemler.length} kalem)`}</Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
                </TouchableOpacity>

                <View style={s.row}>
                  <TouchableOpacity style={[s.addBtn, { flex: 1 }, adding && s.ctaDisabled]} onPress={onAddToQuote} disabled={adding} testID="ag-add-to-quote">
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={s.calcBtnText}>Teklife Ekle</Text>
                  </TouchableOpacity>
                  {result.kind !== 'airflex_modul' && result.kind !== 'vertiflex' && result.kind !== 'kis_bahcesi' && result.kind !== 'bc' && result.kind !== 'yedek_parca' && (
                    <TouchableOpacity style={[s.excelBtn, exporting && s.ctaDisabled]} onPress={onExportExcel} disabled={exporting} testID="ag-export-excel">
                      {exporting ? <ActivityIndicator color={theme.colors.primary} /> : (
                        <>
                          <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                          <Text style={s.excelBtnText}>Excel</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {result.kind !== 'airflex_modul' && result.kind !== 'vertiflex' && result.kind !== 'kis_bahcesi' && result.kind !== 'bc' && result.kind !== 'yedek_parca' && (
                  <TouchableOpacity
                    style={[s.drawingBtn, addingDrawing && s.ctaDisabled]}
                    onPress={onAddDrawing}
                    disabled={addingDrawing}
                    testID="ag-add-drawing"
                  >
                    {addingDrawing ? <ActivityIndicator color={theme.colors.primary} /> : (
                      <>
                        <Ionicons name="image-outline" size={17} color={theme.colors.primary} />
                        <Text style={s.drawingBtnText}>Teknik Çizim Ekle (Teklife PDF ek olarak eklenir)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              </BorderBeam>
              </TiltOnScroll>
            )}
          </View>
        </MotionScrollView>
      </KeyboardAvoidingView>

      <NavDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

// Bir alanın hangi ekseni/büyüklüğü ölçtüğünü etiketinden çıkarır. Böylece
// 25 çağrı noktasına tek tek eksen yazmadan her alan doğru kot işaretini ve
// doğru birimi alır. (Önceden birim varsayılanı "mm" idi; "Kar Marjı (%)"
// alanının sağında da "mm" yazıyordu -- kullanıcının bildirdiği hata.)
function guessAxis(label: string): Axis {
  const l = label.toLocaleLowerCase('tr');
  if (l.includes('geniş')) return 'w';
  if (l.includes('yüksek')) return 'h';
  if (l.includes('derinlik')) return 'd';
  if (l.includes('%') || l.includes('oran') || l.includes('marj')) return 'pct';
  if (l.includes('₺') || l.includes('fiyat') || l.includes('bedel') || l.includes('gider')) return 'money';
  return 'n';
}

// Birim etikette yazılı değilse ne varsayılacağı: ölçü alanları mm, sayım
// alanları birimsiz.
function guessUnit(label: string): string | undefined {
  const a = guessAxis(label);
  if (a === 'w' || a === 'h' || a === 'd') return 'mm';
  return undefined;
}

// Albert Genau ölçü alanı -- ag-kit'teki DimField'e devreder. Çağrı imzası
// korunuyor; labelMinHeight artık gereksiz (etiket iki satıra yayılabiliyor,
// kesilmiyor) ama eski çağrıları bozmamak için kabul edilip yok sayılıyor.
function NumField({
  label,
  value,
  onChange,
  testID,
  unit,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  labelMinHeight?: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <DimField
      label={label}
      value={value}
      onChange={onChange}
      testID={testID}
      unit={unit ?? guessUnit(label)}
      axis={guessAxis(label)}
      hint={hint}
    />
  );
}

// Künye satırı: solda küçük alan adı, sağda değer -- teknik çizimlerin
// künye bloğundaki gibi hizalı, ince ayraçlı.
function TitleRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.agTitleRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.agTitleLabel}>{label}</Text>
      <Text style={s.agTitleValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// Sistem/tip seçimi: bordo şeritli, onay işaretli "konfigüratör" kartı.
function SpecOption({
  label,
  selected,
  onPress,
  testID,
  compact,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[s.specOption, compact && s.specOptionCompact, selected && s.specOptionActive]}>
      <View style={[s.specOptionBar, selected && s.specOptionBarActive]} />
      <Text style={[s.specOptionText, selected && s.specOptionTextActive]} numberOfLines={2}>
        {label}
      </Text>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={selected ? AG_RED_LIGHT : 'rgba(155,162,174,0.5)'}
      />
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <TouchableOpacity style={s.toggleRow} activeOpacity={0.7} onPress={() => onChange(!value)} testID={testID}>
      <View style={[s.checkbox, value && s.checkboxActive]}>
        {value && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={s.toggleLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: AG.ink },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: AG.ink },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerLeftGroup: { flexDirection: 'row', alignItems: 'center' },
  priceListToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceListToggleText: { flex: 1, fontSize: 13, fontWeight: '800', color: AG_TEXT },
  priceListSource: { fontSize: 12.5, color: AG_TEXT, fontWeight: '700', marginBottom: 4 },
  priceListSourceWarn: { color: theme.colors.red },
  priceListMeta: { fontSize: 11.5, color: AG_TEXT_MUTED, marginBottom: 8 },
  priceListHint: { fontSize: 11.5, color: AG_TEXT_MUTED, lineHeight: 16, marginBottom: 12 },
  priceListUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AG_RED, borderRadius: 12, paddingVertical: 12 },
  priceListUploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: AG_TEXT, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: AG_LINE },
  contentWrap: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  agHero: { borderRadius: 20, marginBottom: AGS.blockGap, borderWidth: 1, borderColor: 'rgba(182,18,49,0.35)', overflow: 'hidden' },
  // --- Albert Genau'ya özgü "teknik föy" alanları ---
  specField: {
    backgroundColor: AG_SURFACE_SOFT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AG_LINE,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  specTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  specLabel: { flex: 1, color: AG_TEXT_MUTED, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, },
  specUnit: { color: 'rgba(232,83,108,0.9)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  specInput: {
    color: AG_TEXT,
    fontSize: 21,
    fontWeight: '800',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    paddingHorizontal: 0,
    fontVariant: ['tabular-nums'],
  },
  specLineTrack: { height: 2, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 1, overflow: 'hidden' },
  specLine: { height: 2, backgroundColor: AG_RED, borderRadius: 1, transformOrigin: 'left' },
  specOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: AG.well,
    borderWidth: 1,
    borderColor: AG.line,
    borderRadius: AGS.radiusSm,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 0,
    overflow: 'hidden',
    marginBottom: 9,
    minWidth: 150,
    minHeight: 50,
    flexGrow: 1,
  },
  specOptionCompact: { minWidth: 110, minHeight: 44, paddingVertical: 9 },
  specOptionActive: { backgroundColor: 'rgba(182,18,49,0.13)', borderColor: 'rgba(182,18,49,0.55)' },
  specOptionBar: { width: 4, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 2 },
  specOptionBarActive: { backgroundColor: AG_RED },
  specOptionText: { flex: 1, color: AG.graphite, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  specOptionTextActive: { color: AG.chalk },
  agHeroInner: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: 'center' },
  agLogoPlate: {
    backgroundColor: AG_SURFACE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    boxShadow: '0 14px 30px rgba(0,0,0,0.45)',
  },
  agLogo: { width: 196, height: 52 },
  agRule: { width: 54, height: 2, borderRadius: 1, backgroundColor: AG_RED, marginTop: 10 },
  agTagline: { color: 'rgba(226,232,240,0.75)', fontSize: 9.5, fontWeight: '800', letterSpacing: 2.2, marginTop: 10 },
  agCaption: { color: 'rgba(203,213,225,0.9)', fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 12, maxWidth: 320 },
  agTitleBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  agTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  agTitleLabel: { color: 'rgba(232,83,108,0.95)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.6, width: 46 },
  agTitleValue: { flex: 1, color: '#E8EAEE', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  hero: { alignItems: 'center', marginBottom: 14 },
  heroCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(182,18,49,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(182,18,49,0.4)' },
  heroCaption: { fontSize: 12, color: AG_TEXT_MUTED, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20, lineHeight: 17 },
  card: {
    backgroundColor: AG.paper, borderRadius: AGS.radius, padding: AGS.blockPad, borderWidth: 1,
    borderColor: AG.lineSoft, marginBottom: AGS.blockGap,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AG.chalk, marginBottom: 14, letterSpacing: -0.2 },
  row: { flexDirection: 'row', gap: AGS.fieldGap, alignItems: 'stretch' },
  field: { marginBottom: 10 },
  // NOT: textTransform:'uppercase' kasitli KULLANILMADI -- Turkce kucuk "i"
  // harfi locale-siz uppercase donusumunde noktasiz "I"ya donusuyor (orn.
  // "iskonto" -> "ISKONTO"), bu da yanlis/bozuk gorunuyor.
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: AG.chalk, marginBottom: 10, letterSpacing: -0.1 },
  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  payWrap: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  payPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: AG_LINE, backgroundColor: AG_SURFACE_SOFT },
  payPillActive: {
    backgroundColor: AG_RED, borderColor: AG_RED,
    shadowColor: theme.colors.primary, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  payPillText: { fontSize: 12.5, fontWeight: '700', color: AG_TEXT_MUTED, letterSpacing: 0.1 },
  payPillTextActive: { color: '#fff', fontWeight: '800' },
  payBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(182,18,49,0.16)', borderWidth: 1, borderColor: AG_RED },
  payBadgeText: { fontSize: 10.5, fontWeight: '900', color: AG_RED_LIGHT, letterSpacing: 0.3 },
  typePill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 13, borderWidth: 1, borderColor: AG_LINE, backgroundColor: AG_SURFACE_SOFT },
  finishPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: AG_LINE, backgroundColor: AG_SURFACE_SOFT },
  typePillActive: {
    backgroundColor: AG_RED, borderColor: AG_RED,
    shadowColor: theme.colors.primary, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  typePillText: { fontSize: 12, fontWeight: '600', color: AG_TEXT_MUTED, letterSpacing: 0.05 },
  typePillTextActive: { color: '#fff', fontWeight: '800' },
  // Tek secenekli, gercekte "secilemeyen" alanlar icin sakin bilgi satiri
  // (bkz. Motor Markasi) -- dev, dolgun bir CTA gibi durup aslinda hicbir
  // sey yapmayan pill yerine kullanilir.
  fixedValueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 13, backgroundColor: AG_SURFACE_SOFT, borderWidth: 1, borderColor: AG_LINE, borderStyle: 'dashed',
  },
  fixedValueDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: AG_RED },
  fixedValueText: { flex: 1, fontSize: 13, fontWeight: '700', color: AG_TEXT },
  fixedValueTag: { fontSize: 10, fontWeight: '800', color: AG_TEXT_MUTED, letterSpacing: 0.3 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: AG_SURFACE_SOFT,
    borderWidth: 1.5, borderColor: AG_LINE, borderRadius: 12, paddingHorizontal: 13, minHeight: 46,
  },
  inputWrapFocused: {
    borderColor: AG_RED, backgroundColor: AG_SURFACE,
    shadowColor: theme.colors.primary, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '600', color: AG_TEXT, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}) },
  hint: { fontSize: 11.5, color: AG.graphite, marginTop: 10, lineHeight: 17 },
  partsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: AG_LINE },
  partsRowLabel: { fontSize: 12.5, fontWeight: '700', color: AG_TEXT },
  partsRowSub: { fontSize: 10.5, color: AG_TEXT_MUTED, marginTop: 2, fontWeight: '600' },
  partsRowInputWrap: { width: 84, flexDirection: 'row', alignItems: 'center', backgroundColor: AG_SURFACE_SOFT, borderWidth: 1.5, borderColor: AG_LINE, borderRadius: 11, paddingHorizontal: 10, minHeight: 42 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkbox: { width: 21, height: 21, borderRadius: 7, borderWidth: 1.5, borderColor: AG_LINE, alignItems: 'center', justifyContent: 'center', backgroundColor: AG_SURFACE },
  checkboxActive: {
    backgroundColor: AG_RED, borderColor: AG_RED,
    shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: AG_TEXT },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(182,18,49,0.14)',
    borderWidth: 1, borderColor: 'rgba(182,18,49,0.42)', borderRadius: 12, padding: 12, marginBottom: 12,
  },
  errorText: { color: '#FFC9D2', fontSize: 12.5, fontWeight: '700', flex: 1, lineHeight: 17 },
  choiceBox: {
    backgroundColor: AG.well, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(232,83,108,0.34)',
    padding: 14, marginTop: AGS.rowGap,
  },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  choiceTitle: { fontSize: 13, fontWeight: '800', color: AG_TEXT, flex: 1 },
  choiceHint: { fontSize: 11.5, color: AG.graphite, fontWeight: '600', marginBottom: 12, lineHeight: 16 },
  choiceBtn: {
    flex: 1, backgroundColor: AG.paperSoft, borderRadius: 13, borderWidth: 1,
    borderColor: 'rgba(232,83,108,0.45)', paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center',
  },
  choiceBtnLabel: { fontSize: 11, fontWeight: '800', color: AG.redLift, letterSpacing: 0.2 },
  choiceBtnValue: { fontSize: 19, fontWeight: '900', color: AG.chalk, marginTop: 4, fontVariant: ['tabular-nums'] },
  choiceBtnSub: { fontSize: 10, color: AG.graphiteDim, marginTop: 3, textAlign: 'center' },
  // Hesap formulu -- duz bir ipucu satiri degil, fis gibi okunan kucuk blok.
  formulaBox: {
    backgroundColor: AG.well, borderRadius: 12, borderWidth: 1, borderColor: AG.lineSoft,
    padding: 13, marginTop: AGS.rowGap,
  },
  formulaHead: { color: AG.redLift, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 6 },
  formulaLine: { color: AG.chalk, fontSize: 12.5, fontWeight: '700', lineHeight: 19 },
  formulaNote: { color: AG.graphiteDim, fontSize: 11, lineHeight: 16, marginTop: 7 },
  // Hesapla — bu ekranin tek "hero" eylemi; diger tum elemanlar sakin
  // tutulup boldlugun tamami buraya harcaniyor (bkz. tasarim notu).
  calcBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: AG_RED, borderRadius: 16, paddingVertical: 16, marginBottom: 12,
    shadowColor: theme.colors.primary, shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  calcBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  ctaDisabled: { opacity: 0.5 },
  resultCard: { borderColor: 'rgba(182,18,49,0.42)', borderWidth: 1, backgroundColor: '#17131A' },
  resultSub: { fontSize: 11.5, color: AG.graphite, marginBottom: 14, fontWeight: '600', lineHeight: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: AG.lineSoft },
  breakdownLabel: { fontSize: 12.5, color: AG.graphite, fontWeight: '600', flex: 1 },
  breakdownValue: { fontSize: 12.5, color: AG.chalk, fontWeight: '800', fontVariant: ['tabular-nums'] },
  totalBox: {
    backgroundColor: AG.red, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16,
    marginTop: 14, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  totalLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  totalValue: { color: '#fff', fontSize: 19, fontWeight: '900' },
  totalValueEquiv: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  kalemlerToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: AG_LINE, marginTop: 4 },
  kalemlerToggleText: { fontSize: 12, fontWeight: '700', color: AG_RED_LIGHT },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: AG.paperSoft, borderWidth: 1, borderColor: AG.line,
    borderRadius: 16, paddingVertical: 15, marginTop: 12,
  },
  excelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(182,18,49,0.16)', borderWidth: 1, borderColor: 'rgba(182,18,49,0.4)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  excelBtnText: { color: AG_RED_LIGHT, fontSize: 13.5, fontWeight: '800' },
  drawingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: AG_SURFACE_SOFT, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(182,18,49,0.4)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 12, marginTop: 10 },
  drawingBtnText: { color: AG_RED_LIGHT, fontSize: 12.5, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  toast: { position: 'absolute', top: 8, alignSelf: 'center', backgroundColor: theme.colors.navy, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24, zIndex: 9999, gap: 6, ...theme.shadow.md },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
}));

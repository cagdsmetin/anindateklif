import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { AG } from './ag-kit';
import type { ZipCizimModeli } from '@/src/lib/zip-cizim';
import ZipCizim from '@/src/components/zip/ZipCizim';

// ============================================================================
// Teknik çizim -- üç ürün ailesi, tek renderer
// ----------------------------------------------------------------------------
// Çizilecek modeli backend üretir (ag_geometry.py, POST /albert-genau/geometry);
// burası sadece onu ekrana koyar. Bölünmeyi burada tekrar hesaplamıyoruz --
// ekrandaki çizim ile teklife eklenen teknik çizimin aynı sayıları göstermesi
// buna bağlı.
//
// Elevation.tsx ile aynı teknik: react-native-svg projede YOK, çizim
// View'lardan kuruluyor. Bu bilinçli bir tercih -- svg native bir bağımlılık
// olduğu için eklenmesi yeni bir mağaza derlemesi gerektirir ve değişiklik
// OTA ile çıkamaz. View'larla native ve web'de aynı sonucu alıyoruz.
//
// Desteklenen üç model:
//   cephe   -- cam balkon / BC ailesi: soldan sağa cephe zinciri, numaralı kanatlar
//   modul   -- bioklimatik pergola: yan yana modüller, içlerinde lameller
//   giyotin -- VERTIFLEX: üst üste yatay paneller, hareketliler yukarı ok
// ============================================================================

const STAGE_H = 208;
const PAD_X = 14;

// Çizim iki ayrı ekranda kullanılıyor: Albert Genau hesaplayıcısı (kendi
// kırmızı-koyu paleti) ve Teklif ekranı (uygulamanın açık/koyu teması). Renkler
// bu yüzden dışarıdan verilebiliyor; verilmezse AG paleti kullanılır.
export type CizimPaleti = {
  yuzey: string;    // kart zemini
  cizgi: string;    // ince ayraç
  vurgu: string;    // kanat ayrımları, oklar, çerçeve
  vurguSoluk: string; // kanatlar arası ince ayraç
  cam: string;      // cam dolgusu
  camSabit: string; // sabit kanat dolgusu
  metin: string;
  metinSoluk: string;
};

type Stiller = ReturnType<typeof stiller>;

const AG_PALET: CizimPaleti = {
  yuzey: AG.well,
  cizgi: AG.lineSoft,
  vurgu: AG.redLift,
  vurguSoluk: 'rgba(232,83,108,0.45)',
  cam: 'rgba(182,18,49,0.08)',
  camSabit: 'rgba(148,155,168,0.12)',
  metin: AG.chalk,
  metinSoluk: AG.graphiteDim,
};

export type KanatTipi =
  | 'sabit' | 'sola_kayar' | 'saga_kayar' | 'sola_acilir' | 'saga_acilir' | 'dograma';

export type Kanat = {
  sira: number;
  cephe: number;
  cepheIci: number;
  tip: KanatTipi;
  eksenGenislikMm: number;
  camGenislikMm: number | null;
  camYukseklikMm: number | null;
};

export type Cephe = {
  sira: number;
  genislikMm: number;
  yukseklikMm: number;
  kanatSayisi: number;
  onerilenKanatSayisi: number;
  adet: number;
  sagAci: 'duvar' | number;
  toplanmaYonu: string;
  kanatlar: Kanat[];
};

export type CizimModeli =
  | {
      kind: 'cephe';
      cepheler: Cephe[];
      kanatlar: Kanat[];
      toplamKanat: number;
      koseSayisi: number;
      koseDikmesi: number;
      toplamGenislikMm: number;
      toplamAlanM2: number;
      camOlculeriGuvenilir: boolean;
      /** BC tipi gönderildiyse: kanat miktarı / köşe sayısı form önerisi
       *  (bkz. backend/ag_geometry.bc_oneri). */
      bcOneri?: {
        kanatMiktarlari: Record<string, number>;
        bayrakDegerleri: Record<string, number>;
        koseRef: string | null;
        aciklama: string[];
      };
      uyarilar: string[];
    }
  | {
      kind: 'modul';
      moduller: { sira: number; genislikMm: number; derinlikMm: number; lamelSayisi: number }[];
      modulSayisi: number;
      lamelSayisiToplam: number;
      lamelSayisiModul: number;
      genislikMm: number;
      derinlikMm: number;
      derinlikGirilenMm?: number;
      derinlikSnapMm?: number;
      toplamAlanM2: number;
      uyarilar: string[];
    }
  | {
      kind: 'giyotin';
      tip: string;
      paneller: { sira: number; genislikMm: number; yukseklikMm: number; hareketli: boolean; yon: string | null }[];
      panelSayisi: number;
      hareketGrubu: number;
      genislikMm: number;
      yukseklikMm: number;
      toplamAlanM2: number;
      uyarilar: string[];
    }
  // Zip Perde: çizim backend'den değil, ölçülerden istemcide üretilir
  // (bkz. src/lib/zip-cizim.ts); SVG ürün görseli olarak gösterilir.
  | ZipCizimModeli;

function fmtMm(n: number): string {
  return Math.round(n).toLocaleString('tr-TR');
}

/** Kanat tipine göre ok/işaret. Kapı kanadı (ilk açılır) köşeli okla
 *  ayrışır -- montajda önce o açılır, diğerleri ona paketlenir. */
function kanatIsareti(tip: KanatTipi): string {
  switch (tip) {
    case 'sola_acilir': return '⤹';
    case 'saga_acilir': return '⤸';
    case 'sola_kayar': return '←';
    case 'saga_kayar': return '→';
    case 'dograma': return '◫';
    default: return '·';
  }
}

// --- ortak kabuk ------------------------------------------------------------

function Kabuk({
  st,
  etiket,
  caption,
  children,
  altBilgi,
  uyarilar,
}: {
  st: Stiller;
  etiket: string;
  caption?: string;
  children: React.ReactNode;
  altBilgi?: string;
  uyarilar?: string[];
}) {
  return (
    <View style={st.wrap}>
      <View style={st.titleBlock}>
        <Text style={st.titleText} numberOfLines={1}>{etiket}</Text>
        <View style={st.titleRule} />
        <Text style={st.titleCaption} numberOfLines={1}>{caption || 'ölçek: otomatik'}</Text>
      </View>

      <View style={st.stage}>{children}</View>

      {altBilgi ? (
        <View style={st.footer}>
          <Text style={st.footerText} numberOfLines={1}>{altBilgi}</Text>
        </View>
      ) : null}

      {uyarilar && uyarilar.length ? (
        <View style={st.warnBox}>
          {uyarilar.map((u, i) => (
            <Text key={i} style={st.warnText}>{u}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BosDurum({ st, mesaj }: { st: Stiller; mesaj: string }) {
  return (
    <View style={st.empty}>
      <Text style={st.emptyText}>{mesaj}</Text>
    </View>
  );
}

// --- cephe zinciri ----------------------------------------------------------

function CepheCizimi({ st, model }: { st: Stiller; model: Extract<CizimModeli, { kind: 'cephe' }> }) {
  const [stageW, setStageW] = useState(0);
  const cepheler = model.cepheler;

  // Cepheler gerçek genişlikleri oranında yer kaplar; aralarındaki köşe için
  // sabit bir boşluk bırakılır (köşe dikmesi orada).
  const KOSE_W = 16;
  const toplamGenislik = cepheler.reduce((t, c) => t + c.genislikMm, 0);
  const koseSayisi = model.koseSayisi;
  const kullanilabilir = Math.max(60, stageW - PAD_X * 2 - koseSayisi * KOSE_W);

  // En uzun cephenin yüksekliği sahneyi belirler; hepsi aynı ölçekte çizilir.
  const maxYukseklik = Math.max(...cepheler.map((c) => c.yukseklikMm), 1);
  const alanH = STAGE_H - 54;
  const olcek = Math.min(
    kullanilabilir / Math.max(toplamGenislik, 1),
    alanH / maxYukseklik
  );

  return (
    <View style={st.cepheStage} onLayout={(e: LayoutChangeEvent) => setStageW(e.nativeEvent.layout.width)}>
      <View style={st.cepheRow}>
        {cepheler.map((c, ci) => {
          const w = Math.max(28, c.genislikMm * olcek);
          const h = Math.max(30, c.yukseklikMm * olcek);
          return (
            <React.Fragment key={c.sira}>
              <View style={{ width: w }}>
                <View style={[st.cepheFrame, { height: h }]}>
                  {c.kanatlar.map((k, ki) => (
                    <View
                      key={k.sira}
                      style={[
                        st.kanat,
                        ki === c.kanatlar.length - 1 && st.kanatSon,
                        k.tip === 'sabit' && st.kanatSabit,
                      ]}
                    >
                      <Text style={st.kanatNo} numberOfLines={1}>{k.sira}</Text>
                      <Text style={st.kanatOk} numberOfLines={1}>{kanatIsareti(k.tip)}</Text>
                      {k.camGenislikMm != null ? (
                        <Text style={st.kanatCam} numberOfLines={1}>
                          {Math.round(k.camGenislikMm)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                <Text style={st.cepheOlcu} numberOfLines={1}>
                  {fmtMm(c.genislikMm)} × {fmtMm(c.yukseklikMm)}
                </Text>
                <Text style={st.cepheAlt} numberOfLines={1}>
                  {c.sira}. cephe · {c.kanatSayisi} kanat
                </Text>
              </View>

              {c.sagAci !== 'duvar' && ci < cepheler.length - 1 ? (
                <View style={[st.kose, { width: KOSE_W, height: h }]}>
                  <View style={st.koseDikme} />
                  <Text style={st.koseAci} numberOfLines={1}>{c.sagAci}°</Text>
                </View>
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// --- bioklimatik pergola modülleri -----------------------------------------

function ModulCizimi({ st, model }: { st: Stiller; model: Extract<CizimModeli, { kind: 'modul' }> }) {
  const [stageW, setStageW] = useState(0);
  const moduller = model.moduller;

  const GAP = 8;
  const kullanilabilir = Math.max(60, stageW - PAD_X * 2 - (moduller.length - 1) * GAP);
  const modulW = kullanilabilir / moduller.length;
  // Modül derinliği kuşbakışı çizilir: genişlik/derinlik oranı korunur.
  const oran = model.derinlikMm / Math.max(model.genislikMm / moduller.length, 1);
  const modulH = Math.max(56, Math.min(STAGE_H - 58, modulW * oran));

  return (
    <View style={st.cepheStage} onLayout={(e: LayoutChangeEvent) => setStageW(e.nativeEvent.layout.width)}>
      <View style={[st.cepheRow, { gap: GAP }]}>
        {moduller.map((m) => (
          <View key={m.sira} style={{ width: modulW }}>
            <View style={[st.modulFrame, { height: modulH }]}>
              {/* Lameller derinlik boyunca dizilir -- kuşbakışında yatay çizgiler */}
              <View style={st.lamelAlan}>
                {Array.from({ length: m.lamelSayisi }).map((_, i) => (
                  <View key={i} style={st.lamel} />
                ))}
              </View>
              <View style={st.modulEtiketKutu}>
                <Text style={st.modulEtiket} numberOfLines={1}>M{m.sira}</Text>
              </View>
              {/* Köşe bağlantıları (ayak/kelepçe) */}
              <View style={[st.kose4, st.koseTL]} />
              <View style={[st.kose4, st.koseTR]} />
              <View style={[st.kose4, st.koseBL]} />
              <View style={[st.kose4, st.koseBR]} />
            </View>
            <Text style={st.cepheOlcu} numberOfLines={1}>{fmtMm(m.genislikMm)} mm</Text>
            <Text style={st.cepheAlt} numberOfLines={1}>{m.lamelSayisi} lamel</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- giyotin (VERTIFLEX) ----------------------------------------------------

function GiyotinCizimi({ st, model }: { st: Stiller; model: Extract<CizimModeli, { kind: 'giyotin' }> }) {
  const [stageW, setStageW] = useState(0);
  const paneller = model.paneller;

  const alanH = STAGE_H - 54;
  const oran = model.genislikMm / Math.max(model.yukseklikMm, 1);
  let h = alanH;
  let w = h * oran;
  const maxW = Math.max(60, stageW - PAD_X * 2);
  if (w > maxW) {
    w = maxW;
    h = w / oran;
  }

  return (
    <View style={st.cepheStage} onLayout={(e: LayoutChangeEvent) => setStageW(e.nativeEvent.layout.width)}>
      <View style={st.giyotinOrta}>
        <View style={{ width: Math.max(44, w) }}>
          <View style={[st.giyotinFrame, { height: Math.max(40, h) }]}>
            {paneller.map((p, i) => (
              <View
                key={p.sira}
                style={[
                  st.panel,
                  i === paneller.length - 1 && st.panelSon,
                  !p.hareketli && st.panelSabit,
                ]}
              >
                <Text style={st.panelNo} numberOfLines={1}>{p.sira}</Text>
                <Text style={p.hareketli ? st.panelOk : st.panelSabitYazi} numberOfLines={1}>
                  {p.hareketli ? (p.yon === 'yukari' ? '↑' : '↓') : 'sabit'}
                </Text>
                <Text style={st.panelOlcu} numberOfLines={1}>{fmtMm(p.yukseklikMm)}</Text>
              </View>
            ))}
          </View>
          <Text style={st.cepheOlcu} numberOfLines={1}>
            {fmtMm(model.genislikMm)} × {fmtMm(model.yukseklikMm)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// --- dışa açılan bileşen ----------------------------------------------------

export default function Cizim({
  model,
  caption,
  yukleniyor,
  bosMesaj = 'Ölçüleri girin, çizim burada oluşur',
  kindIpucu,
  palet = AG_PALET,
}: {
  model?: CizimModeli | null;
  caption?: string;
  yukleniyor?: boolean;
  bosMesaj?: string;
  /** Model henüz yokken başlıkta doğru etiketin görünmesi için -- ölçü
   *  girilmeden hangi aile olduğunu modelden bilemeyiz. */
  kindIpucu?: CizimModeli['kind'];
  /** Teklif ekranı uygulamanın açık/koyu temasını kullanıyor; verilmezse
   *  Albert Genau paletine düşer. */
  palet?: CizimPaleti;
}) {
  const st = useMemo(() => stiller(palet), [palet]);
  const altBilgi = useMemo(() => {
    if (!model || model.kind === 'zip') return undefined;
    if (model.kind === 'cephe') {
      const kose = model.koseDikmesi
        ? ` · ${model.koseDikmesi} köşe dikmesi`
        : '';
      return `${model.toplamKanat} kanat · ${model.toplamAlanM2} m²${kose}`;
    }
    if (model.kind === 'modul') {
      const snap =
        model.derinlikSnapMm != null &&
        model.derinlikGirilenMm != null &&
        Math.abs(model.derinlikSnapMm - model.derinlikGirilenMm) > 0.5
          ? ` · derinlik ${fmtMm(model.derinlikSnapMm)}mm'ye oturdu`
          : '';
      return `${model.modulSayisi} modül · ${model.lamelSayisiToplam} lamel · ${model.toplamAlanM2} m²${snap}`;
    }
    return `${model.panelSayisi} panel · ${model.hareketGrubu === 2 ? 'çift' : 'tek'} hareket · ${model.toplamAlanM2} m²`;
  }, [model]);

  if (model?.kind === 'zip') return <ZipCizim model={model} />;

  const kind = model?.kind ?? kindIpucu;
  const etiket = kind === 'modul' ? 'PLAN' : kind === 'giyotin' ? 'GİYOTİN' : 'CEPHE';

  if (!model) {
    return (
      <Kabuk st={st} etiket={etiket} caption={caption}>
        <BosDurum st={st} mesaj={yukleniyor ? 'Çizim hazırlanıyor…' : bosMesaj} />
      </Kabuk>
    );
  }

  return (
    <Kabuk st={st} etiket={etiket} caption={caption} altBilgi={altBilgi} uyarilar={model.uyarilar}>
      {model.kind === 'cephe' ? <CepheCizimi st={st} model={model} /> : null}
      {model.kind === 'modul' ? <ModulCizimi st={st} model={model} /> : null}
      {model.kind === 'giyotin' ? <GiyotinCizimi st={st} model={model} /> : null}
    </Kabuk>
  );
}

const stiller = (P: CizimPaleti) => StyleSheet.create({
  wrap: {
    backgroundColor: P.yuzey,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: P.cizgi,
    overflow: 'hidden',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: P.cizgi,
  },
  titleText: { color: P.vurgu, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  titleRule: { flex: 1, height: 1, backgroundColor: P.cizgi },
  titleCaption: { color: P.metinSoluk, fontSize: 10, fontWeight: '700', maxWidth: '52%' },

  stage: { minHeight: STAGE_H, justifyContent: 'center' },
  cepheStage: { paddingHorizontal: PAD_X, paddingVertical: 12 },
  cepheRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 0 },

  empty: { height: STAGE_H, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: P.metinSoluk, fontSize: 12, fontWeight: '700' },

  // --- cephe
  cepheFrame: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: P.vurgu,
    borderRadius: 3,
    backgroundColor: P.cam,
    overflow: 'hidden',
  },
  kanat: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: 1,
    borderRightColor: P.vurguSoluk,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  kanatSon: { borderRightWidth: 0 },
  kanatSabit: { backgroundColor: P.camSabit },
  kanatNo: { color: P.metinSoluk, fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kanatOk: { color: P.vurgu, fontSize: 12, fontWeight: '900' },
  kanatCam: { color: P.metinSoluk, fontSize: 8, fontWeight: '700', fontVariant: ['tabular-nums'] },

  cepheOlcu: {
    color: P.metin,
    fontSize: 10.5,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginTop: 6,
  },
  cepheAlt: {
    color: P.metinSoluk,
    fontSize: 9.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },

  kose: { alignItems: 'center', justifyContent: 'center' },
  koseDikme: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: P.vurgu, borderRadius: 2 },
  koseAci: {
    position: 'absolute',
    top: -14,
    // Açı yazısı köşe dikmesinin kolonundan (16px) geniş; negatif kenarlarla
    // taşmasına izin verilmezse "90°" yerine "9..." görünür.
    left: -14,
    right: -14,
    textAlign: 'center',
    color: P.vurgu,
    fontSize: 9,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  // --- modül
  modulFrame: {
    borderWidth: 1.5,
    borderColor: P.vurgu,
    borderRadius: 3,
    backgroundColor: P.cam,
    padding: 7,
    justifyContent: 'center',
  },
  lamelAlan: { ...StyleSheet.absoluteFillObject, margin: 9, justifyContent: 'space-between' },
  lamel: { height: 1, backgroundColor: P.vurguSoluk },
  modulEtiketKutu: { alignItems: 'center', justifyContent: 'center' },
  modulEtiket: {
    color: P.metin,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: P.yuzey,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  kose4: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: P.vurgu,
    backgroundColor: P.yuzey,
  },
  koseTL: { left: 2, top: 2 },
  koseTR: { right: 2, top: 2 },
  koseBL: { left: 2, bottom: 2 },
  koseBR: { right: 2, bottom: 2 },

  // --- giyotin
  giyotinOrta: { alignItems: 'center' },
  giyotinFrame: {
    borderWidth: 1.5,
    borderColor: P.vurgu,
    borderRadius: 3,
    backgroundColor: P.cam,
    overflow: 'hidden',
  },
  panel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: P.vurguSoluk,
  },
  panelSon: { borderBottomWidth: 0 },
  panelSabit: { backgroundColor: P.camSabit },
  panelNo: { color: P.metinSoluk, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  panelOk: { color: P.vurgu, fontSize: 15, fontWeight: '900' },
  panelSabitYazi: { color: P.metinSoluk, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  panelOlcu: { color: P.metinSoluk, fontSize: 9.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // --- alt bilgi / uyarı
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: P.cizgi,
  },
  footerText: { color: P.metinSoluk, fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  warnBox: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 4,
  },
  warnText: { color: P.metinSoluk, fontSize: 9.5, fontWeight: '600', lineHeight: 13 },
});

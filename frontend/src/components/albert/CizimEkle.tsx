import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AG, AGS, DimField } from './ag-kit';
import Cizim, { type CizimModeli } from './Cizim';
import CepheListesi, { yeniCephe, type CepheGirdi } from './CepheListesi';
import { useCizimModeli, mm } from '@/src/hooks/use-cizim-modeli';

// ============================================================================
// Teknik çizim editörü -- Albert Genau DIŞINDAKİ kalemler için
// ----------------------------------------------------------------------------
// Albert Genau hesaplayıcısında çizim, hesabın yan ürünü olarak kendiliğinden
// çıkıyor. Elle girilen kalemlerde öyle bir hesap yok, ama bayi yine de
// müşteriye çizimli teklif göndermek istiyor. Bu editör aynı geometri
// motorunu (backend/ag_geometry.py) elle girilen ölçülerle çalıştırır;
// çıkan model kaleme iliştirilir ve teklif PDF'inde aynı sayfayı üretir.
//
// Pergola modülünde Albert Genau'nun derinlik tablosu KULLANILMAZ: o tablo
// AG sistemlerine ait. Bunun yerine modül ve lamel sayısı bayiden alınır.
//
// Ekran kasıtlı olarak koyu: ölçü alanları (DimField) ve cephe listesi Albert
// Genau paletiyle çizilmiş bileşenler. Tam ekran bir "çizim aracı" olarak
// açıldığı için uygulamanın açık temasıyla yan yana durmuyor; kalem kartındaki
// küçük önizleme ise uygulamanın kendi temasını kullanıyor.
// ============================================================================

type Kind = 'cephe' | 'giyotin' | 'modul';

const KIND_ETIKET: { id: Kind; etiket: string; not: string }[] = [
  { id: 'cephe', etiket: 'Cam balkon', not: 'Soldan sağa cephe zinciri, köşeli olabilir' },
  { id: 'giyotin', etiket: 'Giyotin', not: 'Üst üste yatay paneller' },
  { id: 'modul', etiket: 'Pergola', not: 'Yan yana modüller, lamelli' },
];

export default function CizimEkle({
  acik,
  deger,
  onKaydet,
  onKapat,
}: {
  acik: boolean;
  /** Düzenlenecek mevcut çizim -- yeni çizimde null. */
  deger?: CizimModeli | null;
  onKaydet: (model: CizimModeli) => void;
  onKapat: () => void;
}) {
  const [kind, setKind] = useState<Kind>(deger && deger.kind !== 'zip' ? deger.kind : 'cephe');

  // Cam balkon
  const [cepheler, setCepheler] = useState<CepheGirdi[]>(() => {
    if (deger?.kind === 'cephe') {
      return deger.cepheler.map((c) => ({
        ...yeniCephe(),
        genislik: String(c.genislikMm),
        yukseklik: String(c.yukseklikMm),
        kanatSayisi: String(c.kanatSayisi),
        sagAci: c.sagAci,
        toplanmaYonu: c.toplanmaYonu as CepheGirdi['toplanmaYonu'],
      }));
    }
    return [yeniCephe()];
  });

  // Giyotin
  const [gyGenislik, setGyGenislik] = useState(
    deger?.kind === 'giyotin' ? String(deger.genislikMm) : ''
  );
  const [gyYukseklik, setGyYukseklik] = useState(
    deger?.kind === 'giyotin' ? String(deger.yukseklikMm) : ''
  );
  const [gyPanel, setGyPanel] = useState(
    deger?.kind === 'giyotin' ? String(deger.panelSayisi) : '3'
  );

  // Pergola
  const [pgGenislik, setPgGenislik] = useState(
    deger?.kind === 'modul' ? String(deger.genislikMm) : ''
  );
  const [pgDerinlik, setPgDerinlik] = useState(
    deger?.kind === 'modul' ? String(deger.derinlikMm) : ''
  );
  const [pgModul, setPgModul] = useState(
    deger?.kind === 'modul' ? String(deger.modulSayisi) : '1'
  );
  const [pgLamel, setPgLamel] = useState(
    deger?.kind === 'modul' ? String(deger.lamelSayisiToplam) : ''
  );

  const gecerliCepheler = useMemo(
    () => cepheler.filter((c) => mm(c.genislik) > 0 && mm(c.yukseklik) > 0),
    [cepheler]
  );

  const girdi = useMemo(() => {
    if (kind === 'cephe') {
      if (!gecerliCepheler.length) return null;
      return {
        kind: 'cephe' as const,
        cepheler: gecerliCepheler.map((c, i) => ({
          genislikMm: mm(c.genislik),
          yukseklikMm: mm(c.yukseklik),
          kanatSayisi: mm(c.kanatSayisi) || null,
          sagAci: i === gecerliCepheler.length - 1 ? ('duvar' as const) : c.sagAci,
          toplanmaYonu: c.toplanmaYonu,
        })),
      };
    }
    if (kind === 'giyotin') {
      if (!mm(gyGenislik) || !mm(gyYukseklik)) return null;
      return {
        kind: 'giyotin' as const,
        genislikMm: mm(gyGenislik),
        yukseklikMm: mm(gyYukseklik),
        panelSayisi: Number(gyPanel) || 3,
      };
    }
    if (!mm(pgGenislik) || !mm(pgDerinlik)) return null;
    const modulSayisi = Number(pgModul) || 1;
    return {
      kind: 'modul' as const,
      genislikMm: mm(pgGenislik),
      derinlikMm: mm(pgDerinlik),
      modulSayisi,
      // Boş bırakılırsa modül başına 1 lamel -- çizimde bölünme görünmez
      // ama ölçüler doğru kalır.
      lamelSayisiToplam: Number(pgLamel) || modulSayisi,
    };
  }, [kind, gecerliCepheler, gyGenislik, gyYukseklik, gyPanel, pgGenislik, pgDerinlik, pgModul, pgLamel]);

  const { model, yukleniyor } = useCizimModeli(girdi);
  const kaydedilebilir = !!model && model.kind === kind;

  return (
    <Modal visible={acik} animationType="slide" onRequestClose={onKapat} transparent={false}>
      <View style={st.ekran}>
        <View style={st.baslikSatiri}>
          <TouchableOpacity onPress={onKapat} style={st.kapat} accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color={AG.chalk} />
          </TouchableOpacity>
          <Text style={st.baslik}>Teknik çizim</Text>
          <TouchableOpacity
            onPress={() => model && onKaydet(model)}
            disabled={!kaydedilebilir}
            style={[st.kaydet, !kaydedilebilir && st.kaydetPasif]}
            testID="cizim-kaydet"
          >
            <Text style={[st.kaydetYazi, !kaydedilebilir && st.kaydetYaziPasif]}>Kaydet</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={st.govde} keyboardShouldPersistTaps="handled">
          <Text style={st.altBaslik}>Sistem türü</Text>
          <View style={st.kindWrap}>
            {KIND_ETIKET.map((k) => (
              <TouchableOpacity
                key={k.id}
                style={[st.kindKart, kind === k.id && st.kindKartOn]}
                onPress={() => setKind(k.id)}
                testID={`cizim-kind-${k.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k.id }}
              >
                <Text style={[st.kindEtiket, kind === k.id && st.kindEtiketOn]}>{k.etiket}</Text>
                <Text style={st.kindNot}>{k.not}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={st.onizleme}>
            <Cizim
              model={model && model.kind === kind ? model : null}
              yukleniyor={yukleniyor}
              kindIpucu={kind}
              caption="elle girilen ölçü"
              bosMesaj="Ölçüleri girin, çizim burada oluşur"
            />
          </View>

          {kind === 'cephe' ? (
            <View style={st.blok}>
              <Text style={st.altBaslik}>Cepheler</Text>
              <Text style={st.blokNot}>Balkonu soldan sağa girin; köşeler açıyla bağlanır.</Text>
              <CepheListesi
                cepheler={cepheler}
                onChange={setCepheler}
                onerilenKanatlar={
                  model?.kind === 'cephe'
                    ? model.cepheler.map((c) => c.onerilenKanatSayisi)
                    : undefined
                }
              />
            </View>
          ) : null}

          {kind === 'giyotin' ? (
            <View style={st.blok}>
              <Text style={st.altBaslik}>Ölçüler</Text>
              <Text style={st.blokNot}>
                Giyotinde en alttaki panel sabittir; üstündekiler aşağı kayıp onun arkasına
                paketlenir.
              </Text>
              <View style={st.row}>
                <DimField label="Genişlik" unit="mm" axis="w" value={gyGenislik} onChange={setGyGenislik} style={st.alan} compact testID="cizim-gy-genislik" />
                <DimField label="Yükseklik" unit="mm" axis="h" value={gyYukseklik} onChange={setGyYukseklik} style={st.alan} compact testID="cizim-gy-yukseklik" />
              </View>
              <View style={[st.row, { marginTop: AGS.fieldGap }]}>
                <DimField label="Panel sayısı" unit="adet" axis="n" value={gyPanel} onChange={setGyPanel} style={st.alan} compact testID="cizim-gy-panel" />
              </View>
            </View>
          ) : null}

          {kind === 'modul' ? (
            <View style={st.blok}>
              <Text style={st.altBaslik}>Ölçüler</Text>
              <Text style={st.blokNot}>
                Modül ve lamel sayısını siz girersiniz; bu kalem Albert Genau sistemi olmadığı
                için standart derinlik tablosu uygulanmaz.
              </Text>
              <View style={st.row}>
                <DimField label="Genişlik" unit="mm" axis="w" value={pgGenislik} onChange={setPgGenislik} style={st.alan} compact testID="cizim-pg-genislik" />
                <DimField label="Derinlik" unit="mm" axis="d" value={pgDerinlik} onChange={setPgDerinlik} style={st.alan} compact testID="cizim-pg-derinlik" />
              </View>
              <View style={[st.row, { marginTop: AGS.fieldGap }]}>
                <DimField label="Modül sayısı" unit="adet" axis="n" value={pgModul} onChange={setPgModul} style={st.alan} compact testID="cizim-pg-modul" />
                <DimField label="Lamel (toplam)" unit="adet" axis="n" value={pgLamel} onChange={setPgLamel} style={st.alan} compact testID="cizim-pg-lamel" />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  ekran: { flex: 1, backgroundColor: AG.ink },
  baslikSatiri: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: AGS.gutter,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: AG.lineSoft,
    backgroundColor: AG.paper,
  },
  kapat: { padding: 4 },
  baslik: { flex: 1, color: AG.chalk, fontSize: 16, fontWeight: '800' },
  kaydet: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AG.red,
  },
  kaydetPasif: { backgroundColor: 'rgba(255,255,255,0.07)' },
  kaydetYazi: { color: '#fff', fontSize: 13, fontWeight: '900' },
  kaydetYaziPasif: { color: AG.graphiteDim },

  govde: { padding: AGS.gutter, paddingBottom: 48, gap: AGS.blockGap },

  altBaslik: {
    color: AG.graphite,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  blok: { gap: 0 },
  blokNot: { color: AG.graphiteDim, fontSize: 10.5, fontWeight: '600', lineHeight: 14, marginBottom: 12 },

  kindWrap: { flexDirection: 'row', gap: 8 },
  kindKart: {
    flex: 1,
    padding: 10,
    borderRadius: AGS.radiusSm,
    borderWidth: 1,
    borderColor: AG.line,
    backgroundColor: AG.paperSoft,
  },
  kindKartOn: { borderColor: AG.red, backgroundColor: 'rgba(182,18,49,0.14)' },
  kindEtiket: { color: AG.graphite, fontSize: 12.5, fontWeight: '800' },
  kindEtiketOn: { color: AG.redLift },
  kindNot: { color: AG.graphiteDim, fontSize: 9.5, fontWeight: '600', marginTop: 3, lineHeight: 12 },

  onizleme: { marginTop: 2 },
  row: { flexDirection: 'row', gap: AGS.fieldGap },
  alan: { flex: 1 },
});

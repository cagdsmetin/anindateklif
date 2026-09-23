import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AG, AGS, DimField } from './ag-kit';

// ============================================================================
// Cephe zinciri girişi
// ----------------------------------------------------------------------------
// Bir balkon tek bir genişlik değil, soldan sağa giden cephelerin zinciridir.
// Usta sahada ölçüyü zaten bu sırayla alıyor; form da o sırayı izliyor.
//
// Her cephenin SAĞ AÇISI, kendisinden sonraki cepheyle arasındaki açıdır --
// "duvar" ise cephe orada biter. Son cephenin sağ açısı her zaman duvardır,
// bu yüzden onun açı seçeneği gösterilmez.
//
// Köşe dikmesi iki cephenin ORTAK dikmesidir; sayımı backend yapar
// (ag_geometry.cephe_zinciri), burada sadece açı toplanır.
// ============================================================================

export type CepheGirdi = {
  /** Kararlı React anahtarı -- sıra değişince satır yeniden kurulmasın. */
  id: string;
  genislik: string;
  yukseklik: string;
  /** Boş ise ölçüden önerilen kanat sayısı kullanılır. */
  kanatSayisi: string;
  sagAci: 'duvar' | number;
  toplanmaYonu: ToplanmaYonu;
};

export type ToplanmaYonu =
  | 'sola' | 'saga' | 'sagavesola' | 'sola_kaydir' | 'saga_kaydir' | 'sabit';

const ACILAR: ('duvar' | number)[] = ['duvar', 90, 135, 225, 270];

const TOPLANMA_ETIKET: Record<ToplanmaYonu, string> = {
  sola: 'Sola topla',
  saga: 'Sağa topla',
  sagavesola: 'Sağa ve sola',
  sola_kaydir: 'Sola kaydır',
  saga_kaydir: 'Sağa kaydır',
  sabit: 'Sabit',
};

let _sayac = 0;
export function yeniCephe(oncekiYukseklik?: string): CepheGirdi {
  _sayac += 1;
  return {
    id: `cephe-${Date.now()}-${_sayac}`,
    genislik: '',
    // Balkonun cepheleri neredeyse her zaman aynı yükseklikte -- bir öncekini
    // taşımak bayiye her satırda aynı sayıyı yazdırmıyor.
    yukseklik: oncekiYukseklik || '',
    kanatSayisi: '',
    sagAci: 'duvar',
    toplanmaYonu: 'sola',
  };
}

function Pill({
  etiket,
  secili,
  onPress,
  testID,
}: {
  etiket: string;
  secili: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[st.pill, secili && st.pillOn]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: secili }}
    >
      <Text style={[st.pillText, secili && st.pillTextOn]}>{etiket}</Text>
    </TouchableOpacity>
  );
}

function CepheSatiri({
  cephe,
  sira,
  sonMu,
  onerilenKanat,
  onDegis,
  onSil,
  silinebilir,
}: {
  cephe: CepheGirdi;
  sira: number;
  sonMu: boolean;
  onerilenKanat?: number;
  onDegis: (yeni: Partial<CepheGirdi>) => void;
  onSil: () => void;
  silinebilir: boolean;
}) {
  const [acik, setAcik] = useState(sira === 1);

  return (
    <View style={st.satir}>
      <View style={st.satirBas}>
        <View style={st.rozet}>
          <Text style={st.rozetYazi}>{sira}</Text>
        </View>
        <TouchableOpacity
          style={st.satirBaslik}
          onPress={() => setAcik((a) => !a)}
          accessibilityRole="button"
          testID={`ag-cephe-${sira}-ac`}
        >
          <Text style={st.satirOzet} numberOfLines={1}>
            {cephe.genislik && cephe.yukseklik
              ? `${cephe.genislik} × ${cephe.yukseklik}`
              : 'Ölçü girilmedi'}
          </Text>
          <Text style={st.satirAlt} numberOfLines={1}>
            {cephe.kanatSayisi || onerilenKanat || '—'} kanat ·{' '}
            {TOPLANMA_ETIKET[cephe.toplanmaYonu]}
            {!sonMu && cephe.sagAci !== 'duvar' ? ` · ${cephe.sagAci}° köşe` : ''}
          </Text>
        </TouchableOpacity>
        <Ionicons
          name={acik ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={AG.graphiteDim}
        />
        {silinebilir ? (
          <TouchableOpacity
            onPress={onSil}
            style={st.silBtn}
            accessibilityRole="button"
            accessibilityLabel={`${sira}. cepheyi sil`}
            testID={`ag-cephe-${sira}-sil`}
          >
            <Ionicons name="trash-outline" size={15} color={AG.redLift} />
          </TouchableOpacity>
        ) : null}
      </View>

      {acik ? (
        <View style={st.satirGovde}>
          <View style={st.row}>
            <DimField
              label="Genişlik"
              unit="mm"
              axis="w"
              value={cephe.genislik}
              onChange={(v) => onDegis({ genislik: v })}
              testID={`ag-cephe-${sira}-genislik`}
              style={st.alan}
              compact
            />
            <DimField
              label="Yükseklik"
              unit="mm"
              axis="h"
              value={cephe.yukseklik}
              onChange={(v) => onDegis({ yukseklik: v })}
              testID={`ag-cephe-${sira}-yukseklik`}
              style={st.alan}
              compact
            />
          </View>

          <View style={[st.row, { marginTop: AGS.fieldGap }]}>
            <DimField
              label="Kanat sayısı"
              unit="adet"
              axis="n"
              value={cephe.kanatSayisi}
              onChange={(v) => onDegis({ kanatSayisi: v })}
              hint={
                onerilenKanat
                  ? `Ölçüye göre ${onerilenKanat} — boş bırakırsanız bu kullanılır`
                  : 'Genişlik girilince önerilir'
              }
              testID={`ag-cephe-${sira}-kanat`}
              style={st.alan}
              compact
            />
          </View>

          <Text style={st.altBaslik}>Toplanma yönü</Text>
          <View style={st.pillWrap}>
            {(Object.keys(TOPLANMA_ETIKET) as ToplanmaYonu[]).map((y) => (
              <Pill
                key={y}
                etiket={TOPLANMA_ETIKET[y]}
                secili={cephe.toplanmaYonu === y}
                onPress={() => onDegis({ toplanmaYonu: y })}
                testID={`ag-cephe-${sira}-yon-${y}`}
              />
            ))}
          </View>

          {/* Son cephenin sağında başka cephe yok -- açı sorulmaz. */}
          {!sonMu ? (
            <>
              <Text style={st.altBaslik}>Sağındaki cepheyle açısı</Text>
              <View style={st.pillWrap}>
                {ACILAR.map((a) => (
                  <Pill
                    key={String(a)}
                    etiket={a === 'duvar' ? 'Duvar' : `${a}°`}
                    secili={cephe.sagAci === a}
                    onPress={() => onDegis({ sagAci: a })}
                    testID={`ag-cephe-${sira}-aci-${a}`}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function CepheListesi({
  cepheler,
  onChange,
  onerilenKanatlar,
}: {
  cepheler: CepheGirdi[];
  onChange: (yeni: CepheGirdi[]) => void;
  /** Backend'in her cephe için önerdiği kanat sayısı (sıra ile). */
  onerilenKanatlar?: number[];
}) {
  const sonYukseklik = useMemo(
    () => cepheler[cepheler.length - 1]?.yukseklik || '',
    [cepheler]
  );

  const degistir = (id: string, yama: Partial<CepheGirdi>) =>
    onChange(cepheler.map((c) => (c.id === id ? { ...c, ...yama } : c)));

  const sil = (id: string) => {
    const kalan = cepheler.filter((c) => c.id !== id);
    // Zincirin sonunda açı anlamsız kalmasın: son cephe duvara döner.
    if (kalan.length) kalan[kalan.length - 1] = { ...kalan[kalan.length - 1], sagAci: 'duvar' };
    onChange(kalan);
  };

  const ekle = () => {
    const oncekiler = cepheler.map((c, i) =>
      // Yeni cephe eklenince bir önceki artık son değil; açısı duvarsa
      // varsayılan olarak 90°'ye çekilir -- köşe eklemenin sebebi bu.
      i === cepheler.length - 1 && c.sagAci === 'duvar' ? { ...c, sagAci: 90 as const } : c
    );
    onChange([...oncekiler, yeniCephe(sonYukseklik)]);
  };

  return (
    <View>
      {cepheler.map((c, i) => (
        <CepheSatiri
          key={c.id}
          cephe={c}
          sira={i + 1}
          sonMu={i === cepheler.length - 1}
          onerilenKanat={onerilenKanatlar?.[i]}
          onDegis={(yama) => degistir(c.id, yama)}
          onSil={() => sil(c.id)}
          silinebilir={cepheler.length > 1}
        />
      ))}

      <TouchableOpacity
        style={st.ekleBtn}
        onPress={ekle}
        accessibilityRole="button"
        testID="ag-cephe-ekle"
      >
        <Ionicons name="add" size={16} color={AG.redLift} />
        <Text style={st.ekleYazi}>Cephe ekle</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  satir: {
    backgroundColor: AG.paperSoft,
    borderRadius: AGS.radiusSm,
    borderWidth: 1,
    borderColor: AG.lineSoft,
    marginBottom: 8,
    overflow: 'hidden',
  },
  satirBas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rozet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(182,18,49,0.18)',
    borderWidth: 1,
    borderColor: AG.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rozetYazi: { color: AG.redLift, fontSize: 11, fontWeight: '900' },
  satirBaslik: { flex: 1, minWidth: 0 },
  satirOzet: { color: AG.chalk, fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'] },
  satirAlt: { color: AG.graphiteDim, fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  silBtn: { padding: 4 },

  satirGovde: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: AG.lineSoft,
    paddingTop: 12,
  },
  row: { flexDirection: 'row', gap: AGS.fieldGap },

  alan: { flex: 1 },

  altBaslik: {
    color: AG.graphite,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: AGS.rowGap,
    marginBottom: 7,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AG.line,
    backgroundColor: AG.paper,
  },
  pillOn: { borderColor: AG.red, backgroundColor: 'rgba(182,18,49,0.16)' },
  pillText: { color: AG.graphite, fontSize: 11, fontWeight: '700' },
  pillTextOn: { color: AG.redLift, fontWeight: '900' },

  ekleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(182,18,49,0.4)',
    borderRadius: AGS.radiusSm,
    paddingVertical: 11,
    marginTop: 2,
  },
  ekleYazi: { color: AG.redLift, fontSize: 12.5, fontWeight: '800' },
});

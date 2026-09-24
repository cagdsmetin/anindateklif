import type { CizimModeli } from '@/src/components/albert/Cizim';
import type { CompanyT, QuoteT } from './api';
import { zipDokumSatirlari, zipTeknikSvg } from './zip-cizim';

// ============================================================================
// Teklif PDF'indeki teknik çizim sayfası
// ----------------------------------------------------------------------------
// Ekrandaki çizim (Cizim.tsx) ile BU sayfa aynı modelden beslenir
// (backend/ag_geometry.py). İki ayrı renderer var çünkü ekran React Native
// View'ları, PDF ise HTML/SVG istiyor; ama bölünmeyi ikisi de hesaplamıyor --
// sadece çiziyor. Bayinin ekranda gördüğü kanat sayısıyla müşteriye giden
// PDF'teki kanat sayısı bu yüzden birbirinden kayamaz.
//
// Renkler kasıtlı olarak koyu-üstüne-açık: teklif PDF'i beyaz kâğıda basılıyor
// ve çoğu bayi siyah-beyaz yazıcı kullanıyor. Dolgular gri tonlarında,
// ayrım çizgiyle yapılıyor.
// ============================================================================

const CIZGI = '#0f172a';
const CAM = '#e8eef3';
const CAM_SABIT = '#d4dae0';
const SOLUK = '#64748b';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const mm = (n: number) => Math.round(n).toLocaleString('tr-TR');

/** Kanat tipine göre PDF'te görünen işaret. Ekrandaki okların yazıcı dostu
 *  karşılığı -- kapı kanadı (ilk açılır) dolu üçgenle ayrışır. */
function kanatIsareti(tip: string): string {
  switch (tip) {
    case 'sola_acilir':
      return '&#9664;';
    case 'saga_acilir':
      return '&#9654;';
    case 'sola_kayar':
      return '&#8592;';
    case 'saga_kayar':
      return '&#8594;';
    case 'dograma':
      return '&#9645;';
    default:
      return '';
  }
}

const TIP_ETIKET: Record<string, string> = {
  sabit: 'Sabit',
  sola_kayar: 'Sola kayar',
  saga_kayar: 'Sağa kayar',
  sola_acilir: 'Sola açılır (kapı)',
  saga_acilir: 'Sağa açılır (kapı)',
  dograma: 'Doğrama',
};

const TOPLANMA_ETIKET: Record<string, string> = {
  sola: 'Sola topla',
  saga: 'Sağa topla',
  sagavesola: 'Sağa ve sola',
  sola_kaydir: 'Sola kaydır',
  saga_kaydir: 'Sağa kaydır',
  sabit: 'Sabit',
};

// --- cephe zinciri ----------------------------------------------------------

function cepheSvg(model: Extract<CizimModeli, { kind: 'cephe' }>): string {
  const W = 1000;
  const KOSE_W = 26;
  const PAD = 30;
  const ALT = 52; // ölçü yazıları için alt boşluk
  const UST = 22;

  const toplamGenislik = model.cepheler.reduce((t, c) => t + c.genislikMm, 0) || 1;
  const maxYukseklik = Math.max(...model.cepheler.map((c) => c.yukseklikMm), 1);
  const kullanilabilir = W - PAD * 2 - model.koseSayisi * KOSE_W;
  const olcek = kullanilabilir / toplamGenislik;
  const cizimH = maxYukseklik * olcek;
  const H = cizimH + UST + ALT;

  let x = PAD;
  const parcalar: string[] = [];

  model.cepheler.forEach((c, ci) => {
    const w = c.genislikMm * olcek;
    const h = c.yukseklikMm * olcek;
    const y = UST + (cizimH - h);
    const kanatW = w / c.kanatlar.length;

    parcalar.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CAM}" stroke="${CIZGI}" stroke-width="2"/>`
    );

    c.kanatlar.forEach((k, ki) => {
      const kx = x + ki * kanatW;
      if (k.tip === 'sabit') {
        parcalar.push(
          `<rect x="${kx}" y="${y}" width="${kanatW}" height="${h}" fill="${CAM_SABIT}"/>`
        );
      }
      if (ki > 0) {
        parcalar.push(
          `<line x1="${kx}" y1="${y}" x2="${kx}" y2="${y + h}" stroke="${CIZGI}" stroke-width="1"/>`
        );
      }
      const orta = kx + kanatW / 2;
      parcalar.push(
        `<text x="${orta}" y="${y + 18}" font-size="12" fill="${SOLUK}" text-anchor="middle">${k.sira}</text>`,
        `<text x="${orta}" y="${y + h / 2 + 6}" font-size="15" fill="${CIZGI}" text-anchor="middle">${kanatIsareti(
          k.tip
        )}</text>`
      );
      if (k.camGenislikMm != null) {
        parcalar.push(
          `<text x="${orta}" y="${y + h - 10}" font-size="10" fill="${SOLUK}" text-anchor="middle">${Math.round(
            k.camGenislikMm
          )}</text>`
        );
      }
    });

    // Cephe ölçü çizgisi
    const oy = UST + cizimH + 16;
    parcalar.push(
      `<line x1="${x}" y1="${oy}" x2="${x + w}" y2="${oy}" stroke="${SOLUK}" stroke-width="1"/>`,
      `<line x1="${x}" y1="${oy - 4}" x2="${x}" y2="${oy + 4}" stroke="${SOLUK}" stroke-width="1"/>`,
      `<line x1="${x + w}" y1="${oy - 4}" x2="${x + w}" y2="${oy + 4}" stroke="${SOLUK}" stroke-width="1"/>`,
      `<text x="${x + w / 2}" y="${oy + 18}" font-size="13" fill="${CIZGI}" text-anchor="middle">${mm(
        c.genislikMm
      )} × ${mm(c.yukseklikMm)}</text>`,
      `<text x="${x + w / 2}" y="${oy + 32}" font-size="10" fill="${SOLUK}" text-anchor="middle">${
        c.sira
      }. cephe · ${c.kanatSayisi} kanat</text>`
    );

    x += w;

    // Köşe dikmesi -- iki cephenin ORTAK dikmesi, tek çizilir.
    if (c.sagAci !== 'duvar' && ci < model.cepheler.length - 1) {
      const cx = x + KOSE_W / 2;
      parcalar.push(
        `<rect x="${cx - 3}" y="${UST}" width="6" height="${cizimH}" fill="${CIZGI}"/>`,
        `<text x="${cx}" y="${UST - 7}" font-size="11" fill="${CIZGI}" text-anchor="middle">${c.sagAci}°</text>`
      );
      x += KOSE_W;
    }
  });

  return `<svg viewBox="0 0 ${W} ${Math.round(H)}" xmlns="http://www.w3.org/2000/svg" width="100%">${parcalar.join(
    ''
  )}</svg>`;
}

// --- bioklimatik pergola modülleri -----------------------------------------

function modulSvg(model: Extract<CizimModeli, { kind: 'modul' }>): string {
  const W = 1000;
  const PAD = 30;
  const GAP = 14;
  const ALT = 40;
  const UST = 10;

  const n = model.moduller.length;
  const modulW = (W - PAD * 2 - (n - 1) * GAP) / n;
  const oran = model.derinlikMm / Math.max(model.genislikMm / n, 1);
  const modulH = Math.max(90, Math.min(360, modulW * oran));
  const H = modulH + UST + ALT;

  const parcalar: string[] = [];
  model.moduller.forEach((m, i) => {
    const x = PAD + i * (modulW + GAP);
    parcalar.push(
      `<rect x="${x}" y="${UST}" width="${modulW}" height="${modulH}" fill="${CAM}" stroke="${CIZGI}" stroke-width="2"/>`
    );
    // Lameller derinlik boyunca -- kuşbakışında yatay çizgiler
    const ic = 12;
    const alanH = modulH - ic * 2;
    for (let k = 1; k < m.lamelSayisi; k += 1) {
      const ly = UST + ic + (alanH / m.lamelSayisi) * k;
      parcalar.push(
        `<line x1="${x + ic}" y1="${ly}" x2="${x + modulW - ic}" y2="${ly}" stroke="${SOLUK}" stroke-width="0.8"/>`
      );
    }
    // Köşe bağlantıları (ayak/kelepçe)
    [
      [x + 8, UST + 8],
      [x + modulW - 8, UST + 8],
      [x + 8, UST + modulH - 8],
      [x + modulW - 8, UST + modulH - 8],
    ].forEach(([cx, cy]) => {
      parcalar.push(
        `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="#ffffff" stroke="${CIZGI}" stroke-width="1.2"/>`
      );
    });
    parcalar.push(
      `<text x="${x + modulW / 2}" y="${UST + modulH / 2 + 6}" font-size="18" font-weight="700" fill="${CIZGI}" text-anchor="middle">M${
        m.sira
      }</text>`,
      `<text x="${x + modulW / 2}" y="${UST + modulH + 20}" font-size="13" fill="${CIZGI}" text-anchor="middle">${mm(
        m.genislikMm
      )} mm</text>`,
      `<text x="${x + modulW / 2}" y="${UST + modulH + 34}" font-size="10" fill="${SOLUK}" text-anchor="middle">${
        m.lamelSayisi
      } lamel</text>`
    );
  });

  return `<svg viewBox="0 0 ${W} ${Math.round(H)}" xmlns="http://www.w3.org/2000/svg" width="100%">${parcalar.join(
    ''
  )}</svg>`;
}

// --- giyotin (VERTIFLEX) ----------------------------------------------------

function giyotinSvg(model: Extract<CizimModeli, { kind: 'giyotin' }>): string {
  const W = 1000;
  const ALT = 34;
  const UST = 10;
  const maxH = 420;

  const oran = model.genislikMm / Math.max(model.yukseklikMm, 1);
  let h = maxH;
  let w = h * oran;
  const maxW = W - 60;
  if (w > maxW) {
    w = maxW;
    h = w / oran;
  }
  const x = (W - w) / 2;
  const H = h + UST + ALT;

  const parcalar: string[] = [
    `<rect x="${x}" y="${UST}" width="${w}" height="${h}" fill="${CAM}" stroke="${CIZGI}" stroke-width="2"/>`,
  ];
  const panelH = h / model.paneller.length;
  model.paneller.forEach((p, i) => {
    const py = UST + i * panelH;
    if (!p.hareketli) {
      parcalar.push(`<rect x="${x}" y="${py}" width="${w}" height="${panelH}" fill="${CAM_SABIT}"/>`);
    }
    if (i > 0) {
      parcalar.push(
        `<line x1="${x}" y1="${py}" x2="${x + w}" y2="${py}" stroke="${CIZGI}" stroke-width="1"/>`
      );
    }
    parcalar.push(
      `<text x="${x + 14}" y="${py + panelH / 2 + 5}" font-size="12" fill="${SOLUK}">${p.sira}</text>`,
      `<text x="${x + w / 2}" y="${py + panelH / 2 + 6}" font-size="16" fill="${CIZGI}" text-anchor="middle">${
        p.hareketli ? (p.yon === 'yukari' ? '&#8593;' : '&#8595;') : 'SABİT'
      }</text>`,
      `<text x="${x + w - 14}" y="${py + panelH / 2 + 5}" font-size="11" fill="${SOLUK}" text-anchor="end">${mm(
        p.yukseklikMm
      )}</text>`
    );
  });
  parcalar.push(
    `<text x="${W / 2}" y="${UST + h + 22}" font-size="13" fill="${CIZGI}" text-anchor="middle">${mm(
      model.genislikMm
    )} × ${mm(model.yukseklikMm)}</text>`
  );

  return `<svg viewBox="0 0 ${W} ${Math.round(H)}" xmlns="http://www.w3.org/2000/svg" width="100%">${parcalar.join(
    ''
  )}</svg>`;
}

// --- döküm tablosu ----------------------------------------------------------

function dokumHtml(model: CizimModeli): string {
  if (model.kind === 'zip') {
    const satirlar = zipDokumSatirlari(model)
      .map(([k, v]) => `<tr><th style="width:38%">${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join('');
    return `<table class="cz-tbl"><tbody>${satirlar}</tbody></table>`;
  }
  if (model.kind === 'cephe') {
    const satirlar = model.cepheler
      .map((c) => {
        const dagilim = c.kanatlar.reduce<Record<string, number>>((a, k) => {
          a[k.tip] = (a[k.tip] || 0) + 1;
          return a;
        }, {});
        const dagilimYazi = Object.entries(dagilim)
          .map(([t, n]) => `${n} × ${TIP_ETIKET[t] || t}`)
          .join(', ');
        return `<tr>
          <td>${c.sira}</td>
          <td>${mm(c.genislikMm)} × ${mm(c.yukseklikMm)} mm</td>
          <td>${c.kanatSayisi}</td>
          <td>${esc(TOPLANMA_ETIKET[c.toplanmaYonu] || c.toplanmaYonu)}</td>
          <td>${c.sagAci === 'duvar' ? 'Duvar' : `${c.sagAci}°`}</td>
          <td>${esc(dagilimYazi)}</td>
        </tr>`;
      })
      .join('');
    return `<table class="cz-tbl">
      <thead><tr><th>#</th><th>Ölçü</th><th>Kanat</th><th>Toplanma</th><th>Sağ açı</th><th>Kanat dağılımı</th></tr></thead>
      <tbody>${satirlar}</tbody>
    </table>
    <div class="cz-ozet">Toplam ${model.toplamKanat} kanat · ${model.toplamAlanM2} m²${
      model.koseDikmesi ? ` · ${model.koseDikmesi} köşe dikmesi` : ''
    }</div>`;
  }

  if (model.kind === 'modul') {
    const satirlar = model.moduller
      .map(
        (m) =>
          `<tr><td>M${m.sira}</td><td>${mm(m.genislikMm)} mm</td><td>${mm(
            m.derinlikMm
          )} mm</td><td>${m.lamelSayisi}</td></tr>`
      )
      .join('');
    const snap =
      model.derinlikSnapMm != null &&
      model.derinlikGirilenMm != null &&
      Math.abs(model.derinlikSnapMm - model.derinlikGirilenMm) > 0.5
        ? ` · girilen derinlik ${mm(model.derinlikGirilenMm)} mm, standart ölçü ${mm(
            model.derinlikSnapMm
          )} mm`
        : '';
    return `<table class="cz-tbl">
      <thead><tr><th>Modül</th><th>Genişlik</th><th>Derinlik</th><th>Lamel</th></tr></thead>
      <tbody>${satirlar}</tbody>
    </table>
    <div class="cz-ozet">${model.modulSayisi} modül · toplam ${model.lamelSayisiToplam} lamel · ${
      model.toplamAlanM2
    } m²${snap}</div>`;
  }

  const satirlar = model.paneller
    .map(
      (p) =>
        `<tr><td>${p.sira}</td><td>${mm(p.genislikMm)} × ${mm(p.yukseklikMm)} mm</td><td>${
          p.hareketli ? `Hareketli (${p.yon === 'yukari' ? 'yukarı' : 'aşağı'})` : 'Sabit'
        }</td></tr>`
    )
    .join('');
  return `<table class="cz-tbl">
    <thead><tr><th>Panel</th><th>Ölçü</th><th>Durum</th></tr></thead>
    <tbody>${satirlar}</tbody>
  </table>
  <div class="cz-ozet">${model.panelSayisi} panel · ${
    model.hareketGrubu === 2 ? 'çift' : 'tek'
  } hareket grubu · ${model.toplamAlanM2} m²</div>`;
}

function svgFor(model: CizimModeli): string {
  if (model.kind === 'zip') return zipTeknikSvg(model);
  if (model.kind === 'cephe') return cepheSvg(model);
  if (model.kind === 'modul') return modulSvg(model);
  return giyotinSvg(model);
}

/** Çizim sayfalarının stil bloğu -- şablonun kendi CSS'iyle çakışmasın diye
 *  tüm seçiciler `cz-` ön ekiyle. */
export const CIZIM_CSS = `
  .cz-page { page-break-before: always; break-before: page; padding: 10mm; }
  .cz-hdr { display:flex; justify-content:space-between; align-items:flex-end;
            border-bottom:2px solid ${CIZGI}; padding-bottom:6px; margin-bottom:10px; }
  .cz-brand { font-weight:800; font-size:13px; color:${CIZGI}; }
  .cz-meta { font-size:10px; color:${SOLUK}; }
  .cz-title { font-size:15px; font-weight:800; color:${CIZGI}; margin:0 0 2px; }
  .cz-sub { font-size:10.5px; color:${SOLUK}; margin:0 0 12px; }
  .cz-draw { border:1px solid #cbd5e1; border-radius:4px; padding:10px; background:#fff; }
  .cz-tbl { width:100%; border-collapse:collapse; margin-top:12px; font-size:10px; }
  .cz-tbl th { background:#f1f5f9; color:${CIZGI}; text-align:left; padding:5px 7px;
               border:1px solid #cbd5e1; font-weight:700; }
  .cz-tbl td { padding:5px 7px; border:1px solid #e2e8f0; color:${CIZGI}; }
  .cz-ozet { margin-top:8px; font-size:11px; font-weight:700; color:${CIZGI}; }
  .cz-not { margin-top:6px; font-size:9.5px; color:${SOLUK}; line-height:1.5; }
`;

/** Teklifteki çizimli kalemler için sayfa üretir. Çizimi olmayan kalem
 *  atlanır -- eski teklifler ve elle girilen kalemler etkilenmez. */
export function buildCizimPagesHtml(company: CompanyT, quote: QuoteT): string {
  const kalemler = (quote.items || []).filter((it) => !!it.agCizim);
  if (!kalemler.length) return '';

  return kalemler
    .map((it, i) => {
      const model = it.agCizim as CizimModeli;
      const baslik = it.urunAdi || it.sistemTipi || 'Teknik çizim';
      const notlar = (model.uyarilar || [])
        .map((u) => `<div class="cz-not">${esc(u)}</div>`)
        .join('');
      return `
  <div class="cz-page">
    <div class="cz-hdr">
      <div class="cz-brand">${esc(company.sirketAdi || '')}</div>
      <div class="cz-meta">Teklif No: <b>${esc(quote.teklifNo)}</b> · Teknik Çizim ${i + 1}/${
        kalemler.length
      }</div>
    </div>
    <div class="cz-title">${esc(baslik)}</div>
    <div class="cz-sub">${esc(it.aciklama || '')}</div>
    <div class="cz-draw">${svgFor(model)}</div>
    ${dokumHtml(model)}
    ${notlar}
  </div>`;
    })
    .join('');
}

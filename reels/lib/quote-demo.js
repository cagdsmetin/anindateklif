/*
 * QuoteDemo — deterministic vector replica of the Anında Teklif "Yeni Teklif"
 * screen (frontend/app/(tabs)/teklif.tsx) for frame-captured reels.
 *
 *   QuoteDemo.mount(el)   builds a 430x932 CSS-px phone screen inside `el`
 *   QuoteDemo.render(t)   paints the state at local time t (seconds); pure f(t)
 *   QuoteDemo.T           timeline constants
 *   QuoteDemo.rect(name)  logical bbox {x,y,w,h} inside the 430x932 box for
 *                         'width' | 'height' | 'total' | 'send' (+ 'lineTotal',
 *                         'area', 'grand', 'toast', 'item', 'header')
 *
 * No CSS transitions/animations, no Date, no rAF. Font: 'Plus Jakarta Sans'
 * 400–800, to be loaded by the host page. Colors/radii/sizes follow
 * src/lib/theme.ts (light) and the StyleSheets in teklif.tsx / TopHeader.tsx.
 * All prices are DEMO data.
 */
(function () {
  'use strict';

  // ---- theme.ts (light) -------------------------------------------------------
  var C = {
    primary: '#4F46E5', primaryDark: '#4338CA', primarySoft: '#EEF2FF', primaryBorder: '#C7D2FE',
    navy: '#1E293B', navyDark: '#0F172A', green: '#16A34A', greenSoft: '#DCFCE7',
    red: '#DC2626', text: '#0F172A', textMuted: '#64748B', textSoft: '#475569',
    surface: '#FFFFFF', surfaceSoft: '#F8FAFC', line: '#E2E8F0', lineDark: '#CBD5E1',
    wa: '#25D366', ink: '#0B1119'
  };

  // ---- demo data --------------------------------------------------------------
  var W_STR = '4,20', H_STR = '3,00';
  var W = 4.2, H = 3.0, AREA = 12.6, UNIT = 6850, KDV = 20;
  var LINE = AREA * UNIT;                 // 86.310,00
  var KDV_T = LINE * KDV / 100;           // 17.262,00
  var GRAND = LINE + KDV_T;               // 103.572,00

  var T = {
    widthStart: 0.10, widthEnd: 0.90,
    heightStart: 0.95, heightEnd: 1.55,
    priceStart: 1.60, priceEnd: 2.20,
    sendPress: 2.60, toast: 3.00,
    hold: 6.0
  };
  // keystroke times (uneven, human cadence)
  var W_KEYS = [0.16, 0.38, 0.58, 0.74];
  var H_KEYS = [1.00, 1.18, 1.33, 1.46];

  // ---- math -------------------------------------------------------------------
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function expoOut(p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); }
  function quintOut(p) { return 1 - Math.pow(1 - p, 5); }
  function quintInOut(p) { return p < 0.5 ? 16 * p * p * p * p * p : 1 - Math.pow(-2 * p + 2, 5) / 2; }
  function backOut(p, s) { s = s == null ? 1.7 : s; var q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  // quick rise then quint decay; 0 outside
  function pulse(t, t0, up, down) {
    if (t < t0) return 0;
    if (t < t0 + up) return quintOut((t - t0) / up);
    return 1 - quintOut(clamp((t - t0 - up) / down, 0, 1));
  }

  var NF = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmt(n) { return '₺ ' + NF.format(n || 0); }   // fmt() in teklif.tsx

  // ---- icons (Ionicons-like, inline SVG) ---------------------------------------
  function svg(path, size, color, extra) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + path + '</svg>';
  }
  var I = {
    menu: function (c) { return svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 22, c); },
    flash: function (c) { return '<svg width="17" height="17" viewBox="0 0 24 28"><path d="M14 1 3 16h7l-2 11 11-15h-7l2-11z" fill="' + c + '"/></svg>'; },
    bell: function (c) { return svg('<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/>', 19, c, 'stroke-width="1.8"'); },
    biz: function (c) { return svg('<rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 9h5a1 1 0 0 1 1 1v11H14M7 7h4M7 11h4M7 15h4"/>', 13, c); },
    chevDown: function (c, s) { return svg('<path d="m6 9 6 6 6-6"/>', s || 11, c, 'stroke-width="2.6"'); },
    chevUp: function (c, s) { return svg('<path d="m6 15 6-6 6 6"/>', s || 15, c, 'stroke-width="2.6"'); },
    layers: function (c) { return '<svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 2 1 8l11 6 11-6-11-6z" fill="' + c + '"/><path d="m1 13 11 6 11-6" stroke="' + c + '" stroke-width="2.4" fill="none" stroke-linejoin="round"/></svg>'; },
    construct: function (c) { return '<svg width="11" height="11" viewBox="0 0 24 24"><path d="M21.7 6.3 18 10l-4-4 3.7-3.7a6 6 0 0 0-7.9 7.6L2.6 17.2a2 2 0 0 0 2.8 2.8l7.3-7.2a6 6 0 0 0 7.6-7.9z" fill="' + c + '"/></svg>'; },
    copy: function (c) { return svg('<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>', 19, c, 'stroke-width="1.8"'); },
    closeCircle: function (c) { return '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="' + c + '"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'; },
    tag: function (c) { return '<svg width="12" height="12" viewBox="0 0 24 24"><path d="M3 3h8.2l9.6 9.6a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0L3 11.2V3z" fill="' + c + '"/><circle cx="7.5" cy="7.5" r="1.7" fill="#fff"/></svg>'; },
    checkCircle: function (c, s) { return '<svg width="' + (s || 15) + '" height="' + (s || 15) + '" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="' + c + '"/><path d="m7.5 12.3 3 3 6-6.3" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'; },
    checkbox: function (c) { return '<svg width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" fill="' + c + '"/><path d="m7.5 12.3 3 3 6-6.3" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'; },
    share: function (c) { return svg('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 13.3 7.4 4.4M15.7 6.3l-7.4 4.4"/>', 17, c, 'stroke-width="2"'); },
    wa: function (c) { return '<svg width="17" height="17" viewBox="0 0 24 24"><path fill="' + c + '" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.3 4.1c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.6 5.7 4.9 2.8 1.1 3.4.9 4 .8.6-.1 2-.8 2.2-1.6.3-.8.3-1.5.2-1.6-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6z"/></svg>'; },
    eye: function (c) { return svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 16, c); }
  };

  // ---- CSS ----------------------------------------------------------------------
  var CSS = [
    '.qd{position:relative;width:430px;height:932px;overflow:hidden;background:' + C.surface + ';color:' + C.text + ';',
    "font-family:'Plus Jakarta Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:'tnum' 1;text-rendering:geometricPrecision}",
    '.qd *{box-sizing:border-box;margin:0;padding:0}',
    '.qd .sb{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 26px 0 32px;font-size:15px;font-weight:700;letter-spacing:-.2px}',
    '.qd .sb .r{display:flex;gap:6px;align-items:center}',
    '.qd .hd{height:62px;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ' + C.line + ';background:' + C.surface + '}',
    '.qd .hb{width:36px;height:36px;border-radius:10px;background:' + C.surfaceSoft + ';display:flex;align-items:center;justify-content:center;margin-right:8px}',
    '.qd .brand{display:flex;align-items:center;gap:10px;flex:1}',
    '.qd .bi{width:38px;height:38px;border-radius:10px;background:' + C.primary + ';display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(79,70,229,.3)}',
    '.qd .an{font-size:15px;font-weight:800;letter-spacing:.2px;line-height:19px}',
    '.qd .as{font-size:11px;color:' + C.textMuted + ';margin-top:1px;line-height:14px;font-weight:500}',
    '.qd .ra{display:flex;align-items:center;gap:8px}',
    '.qd .bell{width:36px;height:36px;display:flex;align-items:center;justify-content:center}',
    '.qd .pk{display:flex;align-items:center;gap:3px;background:' + C.primarySoft + ';border:1px solid ' + C.primaryBorder + ';border-radius:10px;padding:8px}',
    '.qd .av{width:36px;height:36px;border-radius:18px;background:' + C.navy + ';color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center}',
    '.qd .sc{padding:14px}',
    // grand total banner (BorderBeam + gradient)
    '.qd .beam{position:relative;border-radius:20px;padding:1.4px;overflow:hidden;margin-bottom:14px}',
    '.qd .beam .rot{position:absolute;left:50%;top:50%;width:640px;height:640px;margin:-320px 0 0 -320px;background:conic-gradient(from 0deg,rgba(148,163,184,.22) 0deg,rgba(148,163,184,.22) 250deg,rgba(129,140,248,0) 260deg,#818CF8 300deg,#22D3EE 340deg,rgba(34,211,238,0) 356deg,rgba(148,163,184,.22) 360deg)}',
    '.qd .tb{position:relative;border-radius:18.6px;background:' + C.navyDark + ';overflow:hidden}',
    '.qd .tb .grad{position:absolute;inset:0;background:linear-gradient(135deg,rgba(79,70,229,.55),rgba(15,23,42,0) 70%)}',
    '.qd .tb .glow{position:absolute;left:-40px;top:-60px;width:320px;height:200px;border-radius:50%;background:radial-gradient(closest-side,rgba(129,140,248,.85),rgba(34,211,238,.25) 60%,rgba(34,211,238,0));opacity:0}',
    '.qd .tbi{position:relative;display:flex;align-items:center;padding:14px 16px;gap:12px}',
    '.qd .tl{color:#94a3b8;font-size:10.5px;font-weight:700;letter-spacing:.6px;line-height:14px}',
    '.qd .tv{display:inline-block;color:#fff;font-size:24px;font-weight:800;margin-top:3px;letter-spacing:.2px;line-height:31px;transform-origin:0 60%;white-space:nowrap}',
    '.qd .ms{display:flex;flex-direction:column;align-items:flex-end;gap:4px}',
    '.qd .db{display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:10px;background:rgba(100,116,139,.19);margin-bottom:2px}',
    '.qd .dd{width:6px;height:6px;border-radius:3px;background:' + C.textMuted + '}',
    '.qd .dbt{color:#fff;font-size:9.5px;font-weight:800}',
    '.qd .mst{color:#fff;font-size:12px;font-weight:700}',
    '.qd .mss{color:#818CF8;font-size:10px;font-weight:800;margin-top:2px}',
    // section header
    '.qd .sh{display:flex;align-items:center;margin-top:4px}',
    '.qd .siw{width:18px;height:18px;border-radius:9px;background:rgba(79,70,229,.094);display:flex;align-items:center;justify-content:center;margin-right:6px}',
    '.qd .sht{font-size:11px;font-weight:800;letter-spacing:.5px}',
    '.qd .sl{height:2px;border-radius:1px;margin:6px 0 10px;background:linear-gradient(90deg,' + C.primary + ',rgba(79,70,229,.15) 55%,rgba(79,70,229,0))}',
    // item card
    '.qd .card{position:relative;background:#fff;border-radius:14px;padding:12px;border:1px solid ' + C.line + ';border-left:4px solid ' + C.primary + ';box-shadow:0 2px 4px rgba(15,23,42,.06);margin-bottom:10px}',
    '.qd .ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}',
    '.qd .chl{display:flex;align-items:center;gap:8px}',
    '.qd .mv{display:flex;flex-direction:column;align-items:center;margin-right:2px;line-height:0}',
    '.qd .no{font-size:11px;font-weight:800;color:' + C.textMuted + '}',
    '.qd .mb{display:flex;align-items:center;padding:3px 8px;border-radius:12px;border:1px solid ' + C.primary + ';background:rgba(79,70,229,.125);gap:3px}',
    '.qd .mbt{font-size:9px;font-weight:800;letter-spacing:.4px;color:' + C.primary + '}',
    '.qd .chr{display:flex;align-items:center;gap:8px}',
    '.qd .lp{font-size:13px;font-weight:800;white-space:nowrap}',
    '.qd .lbl{font-size:9.5px;line-height:12px;min-height:12px;font-weight:800;color:' + C.textSoft + ';margin-bottom:5px;letter-spacing:.4px}',
    '.qd .fg{margin-bottom:9px}',
    '.qd .sel{display:flex;align-items:center;justify-content:space-between;background:' + C.primarySoft + ';border:1.5px solid ' + C.primaryBorder + ';border-radius:13px;padding:0 11px;height:44px}',
    '.qd .selt{font-size:13.5px;font-weight:700;flex:1;white-space:nowrap}',
    '.qd .grid{display:flex;gap:8px}',
    '.qd .grid>.fg{flex:1;min-width:0}',
    '.qd .inp{position:relative;display:flex;align-items:center;height:44px;background:' + C.surfaceSoft + ';border:1.5px solid ' + C.line + ';border-radius:13px;padding:0 11px;font-size:15px;font-weight:700;white-space:nowrap}',
    '.qd .inp .ph{color:#94a3b8;font-weight:500}',
    '.qd .inp .u{margin-left:auto;font-size:11px;font-weight:700;color:' + C.textMuted + '}',
    '.qd .ch1{display:inline-block}',
    '.qd .caret{display:inline-block;width:2px;height:20px;border-radius:1px;background:' + C.primary + ';margin-left:1px;vertical-align:middle}',
    // price block
    '.qd .pb{margin-top:3px;background:' + C.surfaceSoft + ';border-radius:14px;border:1px solid ' + C.line + ';padding:11px}',
    '.qd .bhr{display:flex;align-items:center;gap:6px;margin-bottom:8px}',
    '.qd .bh{font-size:10px;font-weight:800;color:' + C.textMuted + ';letter-spacing:1px}',
    '.qd .bt{margin-left:auto;font-size:14px;font-weight:800;color:' + C.primary + ';white-space:nowrap;display:inline-block;transform-origin:100% 50%}',
    '.qd .calc{display:flex;align-items:center;gap:8px;height:34px;border-radius:10px;background:#fff;border:1px dashed ' + C.primaryBorder + ';padding:0 10px;margin-bottom:10px;font-size:12.5px;font-weight:700;color:' + C.textSoft + '}',
    '.qd .calc b{color:' + C.text + ';font-weight:800}',
    '.qd .calc .eq{margin-left:auto;display:flex;align-items:baseline;gap:0;transform-origin:100% 50%;color:' + C.primary + ';font-weight:800;font-size:13.5px}',
    '.qd .row3{display:flex;gap:8px}',
    '.qd .row3 .fg{margin-bottom:0}',
    '.qd .inp.sm{font-size:13.5px}',
    // totals
    '.qd .tc{background:#fff;border-radius:12px;border:1px solid ' + C.line + ';padding:8px;box-shadow:0 2px 4px rgba(15,23,42,.06)}',
    '.qd .tr{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid ' + C.line + '}',
    '.qd .trl{color:' + C.textMuted + ';font-size:12px;font-weight:700}',
    '.qd .trv{font-size:13px;font-weight:800;white-space:nowrap}',
    '.qd .gr{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;background:' + C.navy + ';border-radius:8px;margin-top:4px}',
    '.qd .grl{color:#cbd5e1;font-size:11.5px;font-weight:800;letter-spacing:.6px}',
    '.qd .grv{color:#fff;font-size:17px;font-weight:800;white-space:nowrap}',
    // buttons
    '.qd .ar{display:flex;gap:10px;margin-top:12px}',
    '.qd .btn{position:relative;flex:1;height:50px;border-radius:13px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:800;letter-spacing:.3px;overflow:hidden}',
    '.qd .bp{background:' + C.primary + ';color:#fff;box-shadow:0 4px 8px rgba(79,70,229,.35)}',
    '.qd .bw{background:' + C.wa + ';color:' + C.ink + ';box-shadow:0 4px 8px rgba(37,211,102,.35)}',
    '.qd .bw .shade{position:absolute;inset:0;background:#0B1119;opacity:0}',
    '.qd .bw .rip{position:absolute;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.55);left:0;top:0;opacity:0}',
    '.qd .bw .lab{position:relative;display:flex;align-items:center;gap:8px}',
    '.qd .spin{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2.5px solid rgba(11,17,25,.25);border-top-color:' + C.ink + ';opacity:0}',
    // tap indicator
    '.qd .tap{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(15,23,42,.18);border:2px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(15,23,42,.25);opacity:0;pointer-events:none}',
    // toast (TopHeader toast)
    '.qd .toast{position:absolute;left:50%;top:52px;display:flex;align-items:center;gap:8px;background:' + C.navy + ';color:#fff;padding:9px 16px 9px 10px;border-radius:24px;font-size:12.5px;font-weight:700;white-space:nowrap;box-shadow:0 12px 28px rgba(15,23,42,.28);opacity:0;z-index:20}',
    '.qd .toast .ck{width:22px;height:22px;border-radius:11px;background:' + C.wa + ';display:flex;align-items:center;justify-content:center}',
    '.qd .toast .sub{color:#94a3b8;font-weight:600}'
  ].join('\n');

  // ---- DOM ----------------------------------------------------------------------
  var root = null, el = {};

  function mount(container) {
    if (!document.getElementById('qd-style')) {
      var st = document.createElement('style'); st.id = 'qd-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    root = document.createElement('div');
    root.className = 'qd';
    root.innerHTML = [
      '<div class="sb"><span>9:41</span><span class="r">',
      '<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#0F172A"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#0F172A"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#0F172A"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#0F172A"/></svg>',
      '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 2.5c2.3 0 4.4.9 6 2.4l1.2-1.3A10.2 10.2 0 0 0 8 .7 10.2 10.2 0 0 0 .8 3.6L2 4.9a8.4 8.4 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.8 6.8 0 0 0 8 4.3a6.8 6.8 0 0 0-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.6l1.9-2a2.8 2.8 0 0 0-3.8 0z" fill="#0F172A"/></svg>',
      '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="#0F172A" opacity=".4" fill="none"/><rect x="2" y="2" width="18" height="9" rx="2" fill="#0F172A"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="#0F172A" opacity=".45"/></svg>',
      '</span></div>',
      '<div class="hd"><div class="hb">' + I.menu(C.text) + '</div>',
      '<div class="brand"><div class="bi">' + I.flash('#fff') + '</div><div><div class="an">Anında Teklif</div><div class="as">Yeni Teklif</div></div></div>',
      '<div class="ra"><div class="bell">' + I.bell(C.text) + '</div><div class="pk">' + I.biz(C.primary) + I.chevDown(C.primary) + '</div><div class="av">D</div></div></div>',
      '<div class="sc">',
      // banner
      '<div class="beam" data-k="total"><div class="rot"></div><div class="tb"><div class="grad"></div><div class="glow"></div><div class="tbi">',
      '<div style="flex:1;min-width:0"><div class="tl">GENEL TOPLAM (TRY)</div><span class="tv">' + fmt(0) + '</span></div>',
      '<div class="ms"><div class="db"><span class="dd"></span><span class="dbt">Beklemede</span></div><div class="mst">1 kalem</div><div class="mss">KDV %20</div></div>',
      '</div></div></div>',
      // section
      '<div class="sh"><span class="siw">' + I.layers(C.primary) + '</span><span class="sht">KALEMLER (1)</span></div><div class="sl"></div>',
      // card
      '<div class="card" data-k="item"><div class="ch"><div class="chl"><div class="mv">' + I.chevUp(C.line) + I.chevDown(C.line, 15) + '</div>',
      '<span class="no">#1</span><span class="mb">' + I.construct(C.primary) + '<span class="mbt">HİZMET / ÜRÜN</span></span>' + I.chevUp(C.textMuted, 16) + '</div>',
      '<div class="chr"><span class="lp">' + fmt(0) + '</span>' + I.copy(C.primary) + I.closeCircle(C.red) + '</div></div>',
      '<div class="fg"><div class="lbl">Hizmet / Ürün</div><div class="sel"><span class="selt">Bioklimatik Pergola</span>' + I.chevDown(C.primary, 14) + '</div></div>',
      '<div class="grid">',
      '<div class="fg"><div class="lbl">Genişlik (m)</div><div class="inp" data-k="width"><span class="val"></span><span class="u">m</span></div></div>',
      '<div class="fg"><div class="lbl">Derinlik (m)</div><div class="inp" data-k="height"><span class="val"></span><span class="u">m</span></div></div>',
      '</div>',
      '<div class="grid">',
      '<div class="fg"><div class="lbl">Renk</div><div class="sel" style="background:' + C.primarySoft + '"><span class="selt" style="font-weight:600">Antrasit</span>' + I.checkCircle(C.green) + '</div></div>',
      '<div class="fg"><div class="lbl">LED Aydınlatma</div><div class="sel" style="background:#fff;border-color:' + C.lineDark + ';border-width:1px;justify-content:flex-start;gap:8px">' + I.checkbox(C.primary) + '<span class="selt" style="font-weight:600">Evet</span></div></div>',
      '</div>',
      '<div class="pb"><div class="bhr">' + I.tag(C.primary) + '<span class="bh">FİYATLANDIRMA</span><span class="bt">' + fmt(0) + '</span></div>',
      '<div class="calc" data-k="area"><span class="cw">— m</span><span>×</span><span class="ch2">— m</span><span class="eq"><span class="ar2">0,00</span> m²</span></div>',
      '<div class="row3">',
      '<div class="fg" style="flex:.8"><div class="lbl">Adet</div><div class="inp sm adet"><span class="val">0</span></div></div>',
      '<div class="fg" style="flex:.7"><div class="lbl">Birim</div><div class="inp sm"><span>m²</span></div></div>',
      '<div class="fg" style="flex:1.4"><div class="lbl">Birim Fiyat</div><div class="inp sm"><span>6.850</span><span class="u">₺ / m²</span></div></div>',
      '</div></div>',
      '</div>',
      // totals
      '<div class="tc"><div class="tr"><span class="trl">Ara Toplam</span><span class="trv sub">' + fmt(0) + '</span></div>',
      '<div class="tr"><span class="trl">KDV (%20)</span><span class="trv kdv">' + fmt(0) + '</span></div>',
      '<div class="gr" data-k="grand"><span class="grl">GENEL TOPLAM</span><span class="grv">' + fmt(0) + '</span></div></div>',
      // actions
      '<div class="ar"><div class="btn bp">' + I.share('#fff') + '<span>Kaydet &amp; PDF</span></div>',
      '<div class="btn bw" data-k="send"><div class="shade"></div><div class="rip"></div><div class="lab">' + I.wa(C.ink) + '<span>WhatsApp Gönder</span></div><div class="spin"></div></div></div>',
      '</div>',
      '<div class="tap"></div>',
      '<div class="toast" data-k="toast"><span class="ck"><svg width="14" height="14" viewBox="0 0 24 24"><path class="ckp" d="m5 12.5 4.5 4.5L19 7.5" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/></svg></span>',
      '<span>PDF Teklif Hazır</span><span class="sub">· WhatsApp\'a gönderildi</span></div>'
    ].join('');
    container.appendChild(root);

    var q = function (s) { return root.querySelector(s); };
    el = {
      rot: q('.beam .rot'), beam: q('.beam'), glow: q('.tb .glow'), tv: q('.tv'),
      lp: q('.lp'), bt: q('.bt'),
      wIn: q('[data-k=width]'), hIn: q('[data-k=height]'),
      wVal: q('[data-k=width] .val'), hVal: q('[data-k=height] .val'),
      calc: q('.calc'), cw: q('.cw'), ch2: q('.ch2'), ar2: q('.ar2'), eq: q('.calc .eq'),
      adet: q('.adet'), adetVal: q('.adet .val'),
      sub: q('.trv.sub'), kdv: q('.trv.kdv'), grv: q('.grv'), grand: q('.gr'),
      send: q('.bw'), shade: q('.bw .shade'), rip: q('.bw .rip'), lab: q('.bw .lab'), spin: q('.bw .spin'),
      tap: q('.tap'), toast: q('.toast'), ckp: q('.ckp')
    };
    render(0);
    return root;
  }

  // ---- typing helpers --------------------------------------------------------------
  function typed(str, keys, t) {
    var n = 0; for (var i = 0; i < keys.length; i++) if (t >= keys[i]) n = i + 1;
    return { n: n, last: n ? keys[n - 1] : -1, str: str.slice(0, n) };
  }
  function typedHTML(str, keys, t) {
    var h = '';
    for (var i = 0; i < str.length; i++) {
      if (t < keys[i]) break;
      var p = expoOut(prog(t, keys[i], keys[i] + 0.16));
      var y = lerp(5, 0, p), s = lerp(1.25, 1, p);
      h += '<span class="ch1" style="opacity:' + Math.min(1, p * 2).toFixed(3) + ';transform:translateY(' + y.toFixed(2) + 'px) scale(' + s.toFixed(3) + ')">' + str[i] + '</span>';
    }
    return h;
  }
  function caretOn(t, lastKey) {
    if (t - lastKey < 0.5) return true;           // solid while typing
    return Math.floor((t - lastKey - 0.5) / 0.5) % 2 === 1;
  }
  function focusAmt(t, a, b) {                     // focus ring in/out (180ms / 220ms)
    if (t < a || t > b + 0.22) return 0;
    if (t <= b) return expoOut(prog(t, a, a + 0.18));
    return 1 - quintOut(prog(t, b, b + 0.22));
  }
  function mix(c1, c2, p) {
    var a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    var r = Math.round(lerp(a >> 16, b >> 16, p)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, p)), bl = Math.round(lerp(a & 255, b & 255, p));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function paintInput(box, valEl, str, keys, t, fa, fb) {
    var f = focusAmt(t, fa, fb);
    box.style.borderColor = mix(C.line, C.primary, f);
    box.style.background = mix(C.surfaceSoft, '#FFFFFF', f);
    box.style.boxShadow = '0 0 0 ' + (3 * f).toFixed(2) + 'px rgba(79,70,229,' + (0.16 * f).toFixed(3) + ')';
    var ty = typed(str, keys, t);
    var html = ty.n ? typedHTML(str, keys, t) : '';
    var focused = t >= fa && t <= fb;
    if (focused && caretOn(t, ty.n ? ty.last : fa)) html += '<span class="caret"></span>';
    else if (focused) html += '<span class="caret" style="opacity:0"></span>';
    if (!ty.n) html = (focused ? html : '') + '<span class="ph">0</span>';
    valEl.innerHTML = html;
  }

  // ---- render ------------------------------------------------------------------------
  function render(t) {
    if (!root) return;
    t = Math.max(0, +t || 0);

    // border beam: slow ambient rotation, eased with the "price" moment boost
    var beamAng = 110 + t * 48 + 140 * quintInOut(prog(t, T.priceStart, T.priceEnd + 0.4));
    el.rot.style.transform = 'rotate(' + beamAng.toFixed(2) + 'deg)';

    // inputs
    paintInput(el.wIn, el.wVal, W_STR, W_KEYS, t, T.widthStart - 0.04, T.widthEnd);
    paintInput(el.hIn, el.hVal, H_STR, H_KEYS, t, T.heightStart - 0.04, T.priceStart);

    // area line (live: shows width as soon as typed, area when both done)
    var wDone = t >= W_KEYS[3], hDone = t >= H_KEYS[3];
    el.cw.innerHTML = wDone ? '<b>4,20 m</b>' : '— m';
    el.ch2.innerHTML = hDone ? '<b>3,00 m</b>' : '— m';
    var pA = expoOut(prog(t, T.priceStart, T.priceStart + 0.45));
    el.ar2.textContent = NF.format(AREA * pA);
    var aPop = pulse(t, T.priceStart, 0.09, 0.45);
    el.eq.style.transform = 'scale(' + (1 + 0.12 * aPop).toFixed(4) + ')';
    el.calc.style.borderColor = mix(C.primaryBorder, C.primary, aPop);
    el.calc.style.borderStyle = t >= T.priceStart ? 'solid' : 'dashed';
    el.calc.style.background = mix('#FFFFFF', C.primarySoft, Math.max(aPop, t >= T.priceStart ? 0.55 : 0));

    // Adet <- m² (auto fill flash)
    var adetP = t >= T.priceStart ? 1 : 0;
    el.adetVal.textContent = adetP ? NF.format(AREA * pA) : '0';
    var aFlash = pulse(t, T.priceStart, 0.08, 0.7);
    el.adet.style.background = mix(C.surfaceSoft, C.primarySoft, aFlash);
    el.adet.style.borderColor = mix(C.line, C.primary, aFlash);

    // price count-up
    var pp = expoOut(prog(t, T.priceStart, T.priceEnd));
    var line = Math.round(LINE * pp * 100) / 100;
    var kdv = Math.round(line * KDV) / 100;
    var grand = Math.round((line + kdv) * 100) / 100;
    if (t >= T.priceEnd) { line = LINE; kdv = KDV_T; grand = GRAND; }
    el.tv.textContent = fmt(grand);
    el.lp.textContent = fmt(line);
    el.bt.textContent = fmt(line);
    el.sub.textContent = fmt(line);
    el.kdv.textContent = fmt(kdv);
    el.grv.textContent = fmt(grand);

    // landing pop + glow on the total
    var pop = pulse(t, T.priceEnd - 0.04, 0.12, 0.55);
    el.tv.style.transform = 'scale(' + (1 + 0.075 * pop).toFixed(4) + ')';
    el.tv.style.textShadow = '0 0 ' + (18 * pop).toFixed(1) + 'px rgba(165,180,252,' + (0.9 * pop).toFixed(3) + ')';
    var glowLong = pulse(t, T.priceEnd - 0.04, 0.15, 1.4);
    var countGlow = t >= T.priceStart && t < T.priceEnd ? 0.35 * prog(t, T.priceStart, T.priceEnd) : 0;
    var g = Math.max(glowLong, countGlow, t >= T.priceEnd ? 0.18 : 0);
    el.glow.style.opacity = g.toFixed(3);
    el.beam.style.boxShadow = '0 10px ' + (26 + 30 * g).toFixed(1) + 'px rgba(79,70,229,' + (0.18 + 0.32 * g).toFixed(3) + ')';
    el.bt.style.transform = 'scale(' + (1 + 0.1 * pulse(t, T.priceEnd - 0.04, 0.1, 0.45)).toFixed(4) + ')';
    var grPop = pulse(t, T.priceEnd, 0.1, 0.6);
    el.grand.style.boxShadow = '0 0 0 ' + (3 * grPop).toFixed(2) + 'px rgba(79,70,229,' + (0.35 * grPop).toFixed(3) + ')';

    // ---- send press -------------------------------------------------------------
    var sr = rect('send');
    var tx = sr.x + sr.w * 0.58, ty = sr.y + sr.h * 0.55;
    var tapIn = expoOut(prog(t, T.sendPress - 0.22, T.sendPress));
    var tapOut = quintOut(prog(t, T.sendPress + 0.32, T.sendPress + 0.62));
    var tapA = tapIn * (1 - tapOut);
    var tapS = lerp(1.35, 1, tapIn) * (t >= T.sendPress ? lerp(1, 0.82, expoOut(prog(t, T.sendPress, T.sendPress + 0.12))) : 1);
    var tapDrift = lerp(16, 0, tapIn);
    el.tap.style.left = tx + 'px'; el.tap.style.top = (ty + tapDrift) + 'px';
    el.tap.style.opacity = tapA.toFixed(3);
    el.tap.style.transform = 'scale(' + tapS.toFixed(4) + ')';

    var pressDown = expoOut(prog(t, T.sendPress, T.sendPress + 0.1));
    var release = prog(t, T.sendPress + 0.18, T.sendPress + 0.5);
    var press = t < T.sendPress + 0.18 ? pressDown : 1 - backOut(release, 2.2);
    el.send.style.transform = 'scale(' + (1 - 0.05 * press).toFixed(4) + ')';
    el.shade.style.opacity = (0.12 * clamp(press, 0, 1)).toFixed(3);
    var rp = prog(t, T.sendPress, T.sendPress + 0.6);
    var rr = expoOut(rp) * 260;
    el.rip.style.left = (tx - sr.x) + 'px'; el.rip.style.top = (ty - sr.y) + 'px';
    el.rip.style.width = el.rip.style.height = rr.toFixed(1) + 'px';
    el.rip.style.marginLeft = el.rip.style.marginTop = (-rr / 2).toFixed(1) + 'px';
    el.rip.style.opacity = t >= T.sendPress ? (0.6 * (1 - quintOut(rp))).toFixed(3) : '0';

    // spinner between release and toast (waSharing state)
    var spinA = t >= T.sendPress + 0.16 && t < T.toast + 0.12
      ? Math.min(expoOut(prog(t, T.sendPress + 0.16, T.sendPress + 0.3)), 1 - expoOut(prog(t, T.toast - 0.02, T.toast + 0.12))) : 0;
    el.spin.style.opacity = spinA.toFixed(3);
    el.spin.style.transform = 'rotate(' + (t * 900).toFixed(1) + 'deg)';
    el.lab.style.opacity = (1 - spinA).toFixed(3);
    el.lab.style.transform = 'scale(' + (1 - 0.15 * spinA).toFixed(4) + ')';

    // ---- toast --------------------------------------------------------------------
    var tp = prog(t, T.toast, T.toast + 0.5);
    var ty2 = lerp(-70, 0, backOut(tp, 1.4));
    el.toast.style.opacity = expoOut(prog(t, T.toast, T.toast + 0.18)).toFixed(3);
    el.toast.style.transform = 'translate(-50%,' + ty2.toFixed(2) + 'px) scale(' + lerp(0.92, 1, expoOut(tp)).toFixed(4) + ')';
    el.ckp.setAttribute('stroke-dashoffset', (24 * (1 - quintOut(prog(t, T.toast + 0.18, T.toast + 0.5)))).toFixed(2));
  }

  // ---- geometry (logical 430x932, independent of host CSS transform) -----------------
  function rectOf(node) {
    var rb = root.getBoundingClientRect(), b = node.getBoundingClientRect();
    var k = rb.width / 430 || 1;
    // undo the element's own render transform for stable rects
    return { x: (b.left - rb.left) / k, y: (b.top - rb.top) / k, w: b.width / k, h: b.height / k };
  }
  function rect(name) {
    if (!root) return null;
    var n = root.querySelector('[data-k="' + name + '"]');
    if (!n) return null;
    var saved = n.style.transform; n.style.transform = 'none';
    var r = rectOf(n);
    n.style.transform = saved;
    if (name === 'toast') {           // centered via translate(-50%) at rest
      r.x -= r.w / 2;
    }
    return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.w * 10) / 10, h: Math.round(r.h * 10) / 10 };
  }

  window.QuoteDemo = { mount: mount, render: render, T: T, rect: rect, data: { W: W, H: H, AREA: AREA, UNIT: UNIT, LINE: LINE, KDV: KDV_T, GRAND: GRAND, fmt: fmt } };
})();

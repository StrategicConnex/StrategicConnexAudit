/* ═══════════════════════════════════════════════════════════════════════════
   CAD ATLAS — exportador DXF (AC1015 / AutoCAD 2000) a partir del SVG.

   Las láminas se dibujan en SVG con 1 unidad = 0.1 mm, así que la conversión a
   milímetros es exacta: x/10 y (2970 − y)/10. Eso permite abrir los planos en
   AutoCAD, LibreCAD, QCAD, FreeCAD, Fusion 360 o Inkscape y medir de verdad.

   Sin dependencias: parser de las primitivas que emite svg.mjs (rect, line,
   path M/L/H/V/A/Z, ellipse) → entidades LINE, LWPOLYLINE, SOLID, ELLIPSE y
   TEXT, con una capa por color de la paleta y grosores cuantizados a los
   valores válidos de DXF.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAPER_H = 2970;

/* ── Paleta → capa + índice de color ACI ────────────────────────────────── */

const LAYER_OF = {
  "#15160f": ["INK", 7],
  "#4e5045": ["SOFT", 8],
  "#8c8b78": ["FAINT", 9],
  "#8f6f24": ["GOLD", 40],
  "#2a6666": ["TEAL", 4],
  "#9e332c": ["RED", 1],
  "#3c6739": ["GREEN", 3],
  "#2f4e6e": ["BLUE", 5],
  "#f3f0e6": ["PAPER", 254],
  "#fbfaf3": ["CARD", 255],
  "#e3dec9": ["GRID", 253],
  "#d2ccb2": ["GRID2", 252],
};

/** Grosor SVG (0.1 mm) → valor válido de lineweight DXF (1/100 mm). */
const LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const lw = (sw) => {
  const want = Math.round((Number(sw) || 0) * 10);
  return LW.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), 0);
};

/* ── Texto: DXF no admite cualquier glifo ───────────────────────────────── */

/** CP1252 pone estos en 0x80–0x9F; latin1 no los codifica. Se normalizan. */
const ASCII_FIX = { "…": "...", "–": "-", "—": "-", "›": ">", "‹": "<", "\u00a0": " " };

/**
 * Deja el texto en ASCII + latin1, que es lo que `$DWGCODEPAGE ANSI_1252`
 * espera. Los glifos que no existen en esa página (flechas, ●◐○, ≤, ↔) se
 * emiten como escape `\U+XXXX`, soportado por los lectores DXF modernos.
 */
export function dxfText(s) {
  let out = "";
  for (const ch of String(s)) {
    if (ASCII_FIX[ch]) {
      out += ASCII_FIX[ch];
      continue;
    }
    const cp = ch.codePointAt(0);
    if (cp < 0x7f) out += ch;
    else if (cp >= 0xa0 && cp <= 0xff) out += ch;
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

const unescapeHtml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/* ── Lectura de atributos y estilos ─────────────────────────────────────── */

function attrs(s) {
  const o = {};
  const re = /([a-zA-Z_:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) o[m[1]] = m[2];
  return o;
}

function styleMap(s) {
  const o = {};
  String(s || "")
    .split(";")
    .forEach((kv) => {
      const i = kv.indexOf(":");
      if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
  return o;
}

const colorKey = (c) => String(c || "").toLowerCase().trim();
const layerFor = (c) => LAYER_OF[colorKey(c)] ?? ["INK", 7];
const isPaint = (c) => c && c !== "none" && !/^url\(/.test(c);

/* ── Parser de `path` (M L H V A Z, absoluto y relativo) ────────────────── */

/** Arco SVG (endpoint) → polyline, con la conversión estándar a centro. */
function arcPoints(p0, rx, ry, phiDeg, largeArc, sweep, p1, steps = 24) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-9 || ry < 1e-9) return [p1];

  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (p0[0] - p1[0]) / 2;
  const dy2 = (p0[1] - p1[1]) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;

  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;

  const ang = (ux, uy, vx, vy) => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;

  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = t1 + (dt * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return pts;
}

function parsePath(d) {
  const toks = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let cur = [0, 0];
  let start = [0, 0];
  let sub = [];
  let cmd = "";
  let i = 0;
  const num = () => parseFloat(toks[i++]);

  const flush = (closed = false) => {
    if (sub.length > 1) subs.push({ pts: sub, closed });
    sub = [];
  };

  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? cur : [0, 0];
    const C = cmd.toUpperCase();

    if (C === "M") {
      flush();
      cur = [num() + base[0], num() + base[1]];
      start = cur;
      sub = [cur];
      cmd = rel ? "l" : "L"; // puntos siguientes del M son líneas
    } else if (C === "L") {
      cur = [num() + base[0], num() + base[1]];
      sub.push(cur);
    } else if (C === "H") {
      cur = [num() + base[0], cur[1]];
      sub.push(cur);
    } else if (C === "V") {
      cur = [cur[0], num() + base[1]];
      sub.push(cur);
    } else if (C === "A") {
      const rx = num();
      const ry = num();
      const rot = num();
      const la = num();
      const sw = num();
      const p1 = [num() + base[0], num() + base[1]];
      arcPoints(cur, rx, ry, rot, !!la, !!sw, p1).forEach((p) => sub.push(p));
      cur = p1;
    } else if (C === "Z") {
      flush(true);
      cur = start;
      cmd = "";
    } else {
      // comando no soportado: se consume un número para no perder el hilo
      num();
    }
  }
  flush();
  return subs;
}

/* ── Extracción de entidades del SVG ────────────────────────────────────── */

function extract(svg) {
  const body = String(svg)
    .replace(/<defs>[\s\S]*?<\/defs>/g, "")
    .replace(/<svg[^>]*>/, "");

  const out = [];
  const re =
    /<(\w+)\b([^>]*?)\/>|<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m;

  while ((m = re.exec(body))) {
    const tag = m[1];
    const a = attrs(m[2] ?? m[3] ?? "");
    if (m[1] === undefined && m[3] !== undefined) {
      out.push({
        type: "text",
        a,
        style: styleMap(a.style),
        text: unescapeHtml(m[4]),
      });
      continue;
    }
    if (tag === "rect") out.push({ type: "rect", a });
    else if (tag === "line") out.push({ type: "line", a });
    else if (tag === "path") out.push({ type: "path", a, subs: parsePath(a.d) });
    else if (tag === "ellipse" || tag === "circle")
      out.push({
        type: "ellipse",
        a:
          tag === "circle"
            ? { ...a, rx: a.r, ry: a.r }
            : a,
      });
  }
  return out;
}

/* ── Emisor DXF ─────────────────────────────────────────────────────────── */

const num = (v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(4)));
const X = (x) => num(x / 10);
const Y = (y) => num((PAPER_H - y) / 10);

function toDxf(svg) {
  const ents = extract(svg);

  /* capas y grosores usados */
  const layers = new Map();
  const useLayer = (color, sw) => {
    const [name, aci] = layerFor(color);
    const prev = layers.get(name);
    const w = lw(sw);
    layers.set(name, { aci, lw: prev ? Math.max(prev.lw, w) : w });
    return name;
  };

  const body = [];
  const push = (...rows) => body.push(...rows.flat());

  /* ─ primitivas ─ */

  const polyline = (layer, pts, closed, lt) => {
    push(
      "0", "LWPOLYLINE",
      "100", "AcDbEntity",
      "8", layer,
      lt ? ["6", lt] : [],
      "100", "AcDbPolyline",
      "90", String(pts.length),
      "70", closed ? "1" : "0",
      ...pts.flatMap(([x, y]) => ["10", X(x), "20", Y(y)]),
    );
  };

  const solid = (layer, x1, y1, x2, y2, color) => {
    // DXF SOLID: el orden correcto es p0, p1, p3, p2 (si no, sale en lazo).
    push(
      "0", "SOLID",
      "100", "AcDbEntity",
      "8", layer,
      "62", String(color),
      "100", "AcDbTrace",
      "10", X(x1), "20", Y(y1), "30", "0",
      "11", X(x2), "21", Y(y1), "31", "0",
      "12", X(x1), "22", Y(y2), "32", "0",
      "13", X(x2), "23", Y(y2), "33", "0",
    );
  };

  let arrowheads = 0;

  for (const e of ents) {
    if (e.type === "rect") {
      const { x, y, width, height } = e.a;
      if (x === undefined || y === undefined) continue;
      const rx = +x;
      const ry = +y;
      const rw = +width;
      const rh = +height;
      const op = e.a.opacity === undefined ? 1 : +e.a.opacity;

      // relleno (los `url(#...)` son tramas: no se exportan)
      if (isPaint(e.a.fill)) {
        const faint = op < 0.2;
        const lname = faint ? "SHADE" : useLayer(e.a.fill, 0);
        if (faint) layers.set("SHADE", layers.get("SHADE") ?? { aci: 253, lw: 0 });
        const col = faint ? 253 : (LAYER_OF[colorKey(e.a.fill)] ?? ["", 7])[1];
        solid(lname, rx, ry, rx + rw, ry + rh, col);
      }
      if (isPaint(e.a.stroke) && Number(e.a["stroke-width"] || 0) > 0) {
        const lname = useLayer(e.a.stroke, e.a["stroke-width"]);
        const lt = e.a["stroke-dasharray"] ? "DASHED" : null;
        polyline(
          lname,
          [
            [rx, ry],
            [rx + rw, ry],
            [rx + rw, ry + rh],
            [rx, ry + rh],
          ],
          true,
          lt,
        );
      }
    } else if (e.type === "line") {
      const a = e.a;
      const lname = useLayer(a.stroke, a["stroke-width"]);
      push(
        "0", "LINE",
        "100", "AcDbEntity",
        "8", lname,
        a["stroke-dasharray"] ? ["6", "DASHED"] : [],
        "100", "AcDbLine",
        "10", X(+a.x1), "20", Y(+a.y1), "30", "0",
        "11", X(+a.x2), "21", Y(+a.y2), "31", "0",
      );
    } else if (e.type === "path") {
      const a = e.a;
      if (!isPaint(a.stroke)) continue;
      const lname = useLayer(a.stroke, a["stroke-width"]);
      const lt = a["stroke-dasharray"] ? "DASHED" : null;
      for (const s of e.subs) polyline(lname, s.pts, s.closed, lt);

      // marcador de flecha → triángulo relleno al final del trazado
      if (a["marker-end"]) {
        const s = e.subs[e.subs.length - 1];
        if (s && s.pts.length >= 2) {
          const [p1, p0] = [s.pts[s.pts.length - 1], s.pts[s.pts.length - 2]];
          const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          const L = 12;
          const W = 5.2;
          const bx = p1[0] - L * Math.cos(ang);
          const by = p1[1] - L * Math.sin(ang);
          const nx = -Math.sin(ang) * W;
          const ny = Math.cos(ang) * W;
          const col = (LAYER_OF[colorKey(a.stroke)] ?? ["", 7])[1];
          // triángulo como polilínea cerrada rellena mediante SOLID degenerado
          const t = [
            [p1[0], p1[1]],
            [bx + nx, by + ny],
            [bx - nx, by - ny],
            [bx, by],
          ];
          push(
            "0", "SOLID",
            "100", "AcDbEntity",
            "8", lname,
            "62", String(col),
            "100", "AcDbTrace",
            ...t.flatMap(([x, y], k) => [
              String(10 + k), X(x),
              String(20 + k), Y(y),
              String(30 + k), "0",
            ]),
          );
          arrowheads++;
        }
      }
    } else if (e.type === "ellipse") {
      const a = e.a;
      const lname = useLayer(a.stroke, a["stroke-width"]);
      const rx = +a.rx;
      const ry = +a.ry;
      push(
        "0", "ELLIPSE",
        "100", "AcDbEntity",
        "8", lname,
        "100", "AcDbEllipse",
        "10", X(+a.cx), "20", Y(+a.cy), "30", "0",
        "11", X(rx), "21", "0", "31", "0",
        "40", num(ry / rx),
        "41", "0",
        "42", num(Math.PI * 2),
      );
    } else if (e.type === "text") {
      const s = e.style;
      const txt = dxfText(e.text);
      if (!txt.trim()) continue;
      const size = parseFloat(s["font-size"] || 26);
      const anchor = s["text-anchor"] || "start";
      const color = s.fill || "#15160f";
      const lname = useLayer(color, 0);
      const h = num(Math.max(0.0001, size / 10));

      let rot = 0;
      let px = +e.a.x;
      let py = +e.a.y;
      const tr = /rotate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(e.a.transform || "");
      if (tr) {
        rot = ((-parseFloat(tr[1]) % 360) + 360) % 360;
        const [, , cx, cy] = tr;
        // rotar la inserción alrededor del punto de giro
        const rad = (-parseFloat(tr[1]) * Math.PI) / 180;
        const dx = px - +cx;
        const dy = py - +cy;
        px = +cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        py = +cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      }

      const halign = anchor === "middle" ? 1 : anchor === "end" ? 2 : 0;
      push(
        "0", "TEXT",
        "100", "AcDbEntity",
        "8", lname,
        "100", "AcDbText",
        "10", X(px), "20", Y(py), "30", "0",
        "40", h,
        "1", txt,
        "50", num(rot),
        "7", "MONO",
        "72", String(halign),
        ...(halign ? ["11", X(px), "21", Y(py), "31", "0"] : []),
      );
    }
  }

  /* ── tablas ── */

  const ltypeTable = [
    "0", "TABLE", "2", "LTYPE", "70", "3",
    "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
    "0", "LTYPE", "2", "DASHED", "70", "0", "3", "Dashed __ __", "72", "65", "73", "2", "40", "1.5", "49", "0.9", "49", "-0.6",
    "0", "LTYPE", "2", "HIDDEN", "70", "0", "3", "Hidden _ _", "72", "65", "73", "2", "40", "0.6", "49", "0.15", "49", "-0.45",
    "0", "ENDTAB",
  ];

  const layerTable = ["0", "TABLE", "2", "LAYER", "70", String(layers.size)];
  for (const [name, def] of layers) {
    layerTable.push(
      "0", "LAYER",
      "2", name,
      "70", "0",
      "62", String(def.aci),
      "6", "CONTINUOUS",
      "370", String(def.lw),
    );
  }
  layerTable.push("0", "ENDTAB");

  const styleTable = [
    "0", "TABLE", "2", "STYLE", "70", "1",
    "0", "STYLE", "2", "MONO", "70", "0", "40", "0.0", "41", "0.62",
    "50", "0.0", "71", "0", "42", "2.5", "3", "txt", "4", "",
    "0", "ENDTAB",
  ];

  const header = [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1015",
    "9", "$DWGCODEPAGE", "3", "ANSI_1252",
    "9", "$INSUNITS", "70", "4", // milímetros
    "9", "$MEASUREMENT", "70", "1",
    "9", "$LTSCALE", "40", "1.0",
    "9", "$EXTMIN", "10", "0", "20", "0", "30", "0",
    "9", "$EXTMAX", "10", "210", "20", "297", "30", "0",
    "9", "$LIMMIN", "10", "0", "20", "0",
    "9", "$LIMMAX", "10", "210", "20", "297",
    "9", "$HANDLING", "70", "0",
    "0", "ENDSEC",
  ];

  const lines = [
    ...header,
    "0", "SECTION", "2", "TABLES",
    ...ltypeTable,
    ...layerTable,
    ...styleTable,
    "0", "ENDSEC",
    "0", "SECTION", "2", "BLOCKS",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...body,
    "0", "ENDSEC",
    "0", "EOF",
  ];

  // Control de integridad: cada texto con contenido del SVG debe llegar al
  // DXF. Los `<text>` vacíos no son entidades y no cuentan. Si el parser dejase
  // de reconocer una primitiva, el build lo ve aquí.
  const svgTexts = [...String(svg).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].filter((mt) =>
    unescapeHtml(mt[1]).trim(),
  ).length;
  const dxfTexts = ents.filter((e) => e.type === "text" && e.text.trim()).length;
  if (svgTexts !== dxfTexts) {
    throw new Error(`DXF: ${svgTexts} textos en el SVG pero ${dxfTexts} en el DXF`);
  }

  return {
    content: lines.join("\r\n"),
    stats: { entities: ents.length, layers: layers.size, arrowheads, texts: dxfTexts },
  };
}

/* ── API pública ────────────────────────────────────────────────────────── */

/** Convierte un SVG de lámina en DXF (milímetros, capas por color). */
export function svgToDxf(svg) {
  return toDxf(svg);
}

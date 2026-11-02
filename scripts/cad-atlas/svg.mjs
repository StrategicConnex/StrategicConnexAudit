/* ═══════════════════════════════════════════════════════════════════════════
   CAD ATLAS — toolkit de dibujo técnico (SVG puro, 1 unidad = 0.1 mm)
   A4 = 2100 × 2970 unidades. Sin dependencias externas.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PAPER = { w: 2100, h: 2970 };

export const C = {
  paper: "#F3F0E6",
  card: "#FBFAF3",
  ink: "#15160F",
  soft: "#4E5045",
  faint: "#8C8B78",
  grid: "#E3DEC9",
  grid2: "#D2CCB2",
  gold: "#8F6F24",
  teal: "#2A6666",
  red: "#9E332C",
  green: "#3C6739",
  blue: "#2F4E6E",
};

export const MONO = "'Consolas','DejaVu Sans Mono','Courier New',monospace";
export const SANS = "'Segoe UI','Helvetica Neue',Arial,sans-serif";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/* ── Texto ──────────────────────────────────────────────────────────────── */

export function T(x, y, s, o = {}) {
  const {
    size = 26,
    weight = 400,
    anchor = "start",
    fill = C.ink,
    mono = true,
    ls = 0,
    opacity = 1,
    halo = false,
    italic = false,
    rotate = 0,
  } = o;
  const style = [
    `font-family:${mono ? MONO : SANS}`,
    `font-size:${size}px`,
    `font-weight:${weight}`,
    `fill:${fill}`,
    `text-anchor:${anchor}`,
    `letter-spacing:${ls}`,
    `opacity:${opacity}`,
    italic ? "font-style:italic" : "",
    halo ? `paint-order:stroke;stroke:${C.paper};stroke-width:7;stroke-linejoin:round` : "",
  ]
    .filter(Boolean)
    .join(";");
  const tr = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" style="${style}"${tr}>${esc(s)}</text>`;
}

/** Texto multilínea; devuelve el y final. */
export function TP(x, y, lines, o = {}) {
  const { lh = (o.size ?? 24) * 1.32 } = o;
  let out = "";
  lines.forEach((l, i) => {
    if (l === "") return;
    out += T(x, y + i * lh, l, o);
  });
  return out;
}

export function line(x1, y1, x2, y2, o = {}) {
  const { stroke = C.ink, w = 2, dash = "", opacity = 1, cap = "butt" } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="${cap}" ${dash ? `stroke-dasharray="${dash}"` : ""} opacity="${opacity}"/>`;
}

export function rect(x, y, w, h, o = {}) {
  const { fill = "none", stroke = C.ink, sw = 2, dash = "", rx = 0, opacity = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ""} opacity="${opacity}"/>`;
}

/* ── Símbolos / marcadores ──────────────────────────────────────────────── */

export function defs() {
  const marker = (id, color, size = 12) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="${size}" markerHeight="${size}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0.6 L10,5 L0,9.4 z" fill="${color}"/></marker>`;
  return `<defs>
    <pattern id="hatch" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="11" stroke="${C.gold}" stroke-width="1.1" opacity="0.55"/>
    </pattern>
    <pattern id="hatchSoft" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="16" stroke="${C.ink}" stroke-width="1" opacity="0.13"/>
    </pattern>
    <pattern id="grid10" width="100" height="100" patternUnits="userSpaceOnUse">
      <path d="M100,0 L0,0 L0,100" fill="none" stroke="${C.grid}" stroke-width="1"/>
    </pattern>
    <pattern id="grid50" width="500" height="500" patternUnits="userSpaceOnUse">
      <path d="M500,0 L0,0 L0,500" fill="none" stroke="${C.grid2}" stroke-width="1.4"/>
    </pattern>
    ${marker("arw", C.ink)}
    ${marker("arwGold", C.gold)}
    ${marker("arwTeal", C.teal)}
    ${marker("arwRed", C.red)}
    ${marker("arwSoft", C.soft)}
  </defs>`;
}

/* ── Caja técnica ───────────────────────────────────────────────────────── */

export function box(o) {
  const {
    x,
    y,
    w,
    h,
    title = "",
    subs = [],
    tag = "",
    accent = null,
    fill = C.card,
    stroke = C.ink,
    sw = 2.2,
    dash = "",
    titleSize = 27,
    subSize = 22,
    align = "left",
    hatch = false,
    tagPos = "tr",
  } = o;
  const parts = [];
  parts.push(rect(x, y, w, h, { fill, stroke, sw, dash }));
  if (hatch) parts.push(rect(x + 1, y + 1, w - 2, h - 2, { fill: "url(#hatchSoft)", stroke: "none", sw: 0 }));
  if (accent) parts.push(rect(x, y, 7, h, { fill: accent, stroke: "none", sw: 0 }));
  const tx = align === "center" ? x + w / 2 : x + (accent ? 20 : 14);
  const anchor = align === "center" ? "middle" : "start";
  if (title) {
    parts.push(T(tx, y + 32, title, { size: titleSize, weight: 700, anchor, halo: hatch }));
    if (subs.length) parts.push(line(x + 10, y + 42, x + w - 10, y + 42, { stroke: C.faint, w: 1 }));
  }
  subs.forEach((s, i) => {
    parts.push(
      T(tx, y + (title ? 66 : 30) + i * (subSize * 1.28), s, {
        size: subSize,
        fill: C.soft,
        anchor,
        halo: hatch,
      }),
    );
  });
  if (tag) {
    const tw = tag.length * (subSize * 0.62) + 16;
    const tx2 = tagPos === "tr" ? x + w - tw - 8 : x + 8;
    parts.push(rect(tx2, y + 7, tw, subSize * 1.5, { fill: C.paper, stroke: C.faint, sw: 1 }));
    parts.push(T(tx2 + tw / 2, y + 7 + subSize * 1.06, tag, { size: subSize * 0.86, fill: C.soft, anchor: "middle" }));
  }
  return parts.join("");
}

/* ── Conectores ortogonales ─────────────────────────────────────────────── */

export function route(pts) {
  return pts.map((p, i) => `${i ? "L" : "M"}${Math.round(p[0])},${Math.round(p[1])}`).join(" ");
}

/** Ruta en L: primero horizontal, luego vertical. */
export function hv(x1, y1, x2, y2) {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
  ];
}

/** Ruta en L: primero vertical, luego horizontal. */
export function vh(x1, y1, x2, y2) {
  return [
    [x1, y1],
    [x1, y2],
    [x2, y2],
  ];
}

export function conn(pts, o = {}) {
  const { color = C.ink, w = 2.2, dash = "", marker = "arw", label = "", lx, ly, lsize = 21 } = o;
  const d = typeof pts === "string" ? pts : route(pts);
  const out = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} marker-end="url(#${marker})" stroke-linejoin="round"/>`,
  ];
  if (label) {
    out.push(
      T(lx ?? 0, ly ?? 0, label, {
        size: lsize,
        fill: color === C.ink ? C.soft : color,
        anchor: "middle",
        halo: true,
      }),
    );
  }
  return out.join("");
}

export function labelPill(x, y, s, o = {}) {
  const { size = 21, fill = C.paper, stroke = C.faint, color = C.soft } = o;
  const w = s.length * size * 0.6 + 14;
  return (
    rect(x - w / 2, y - size * 0.95, w, size * 1.4, { fill, stroke, sw: 1 }) +
    T(x, y, s, { size, fill: color, anchor: "middle" })
  );
}

/* ── Cotas ──────────────────────────────────────────────────────────────── */

export function dimH(x1, x2, y, label, o = {}) {
  const { color = C.gold, ext = 22, size = 21 } = o;
  const tick = 9;
  return [
    line(x1, y - ext, x1, y + tick, { stroke: color, w: 1.2 }),
    line(x2, y - ext, x2, y + tick, { stroke: color, w: 1.2 }),
    line(x1, y, x2, y, { stroke: color, w: 1.4 }),
    line(x1 + tick, y - tick * 0.7, x1, y, { stroke: color, w: 2.4 }),
    line(x1, y, x1 + tick, y + tick * 0.7, { stroke: color, w: 2.4 }),
    line(x2 - tick, y - tick * 0.7, x2, y, { stroke: color, w: 2.4 }),
    line(x2, y, x2 - tick, y + tick * 0.7, { stroke: color, w: 2.4 }),
    T((x1 + x2) / 2, y - 9, label, { size, fill: color, anchor: "middle", halo: true }),
  ].join("");
}

export function dimV(y1, y2, x, label, o = {}) {
  const { color = C.gold, ext = 22, size = 21 } = o;
  const tick = 9;
  return [
    line(x - ext, y1, x + tick, y1, { stroke: color, w: 1.2 }),
    line(x - ext, y2, x + tick, y2, { stroke: color, w: 1.2 }),
    line(x, y1, x, y2, { stroke: color, w: 1.4 }),
    line(x - tick * 0.7, y1 + tick, x, y1, { stroke: color, w: 2.4 }),
    line(x, y1, x + tick * 0.7, y1 + tick, { stroke: color, w: 2.4 }),
    line(x - tick * 0.7, y2 - tick, x, y2, { stroke: color, w: 2.4 }),
    line(x, y2, x + tick * 0.7, y2 - tick, { stroke: color, w: 2.4 }),
    T(x - 12, (y1 + y2) / 2, label, { size, fill: color, anchor: "middle", halo: true, rotate: -90 }),
  ].join("");
}

/* ── Tablas ─────────────────────────────────────────────────────────────── */

export function table(o) {
  const {
    x,
    y,
    w,
    cols,
    rows,
    rowH = 40,
    headH = 44,
    size = 21,
    headSize = 21,
    headFill = C.paper,
    rule = C.faint,
    zebra = false,
    align = [],
    colors = [],
  } = o;
  const total = cols.reduce((a, c) => a + (c.w ?? 1), 0);
  const widths = cols.map((c) => ((c.w ?? 1) / total) * w);
  const xs = widths.reduce((acc, cw, i) => [...acc, (acc[i] ?? x) + cw], [x]);
  const out = [];
  out.push(rect(x, y, w, headH, { fill: headFill, stroke: C.ink, sw: 1.8 }));
  let cx = x;
  cols.forEach((c, i) => {
    out.push(
      T(cx + 10, y + headH - 14, c.label, {
        size: headSize,
        weight: 700,
        fill: C.ink,
      }),
    );
    cx += widths[i];
  });
  rows.forEach((r, ri) => {
    const ry = y + headH + ri * rowH;
    if (zebra && ri % 2 === 1) out.push(rect(x, ry, w, rowH, { fill: C.ink, stroke: "none", sw: 0, opacity: 0.03 }));
    out.push(line(x, ry, x + w, ry, { stroke: rule, w: 1 }));
    let cx2 = x;
    r.forEach((cell, ci) => {
      const a = align[ci] ?? "start";
      const px = a === "middle" ? cx2 + widths[ci] / 2 : a === "end" ? cx2 + widths[ci] - 10 : cx2 + 10;
      out.push(
        T(px, ry + rowH - 13, cell, {
          size,
          anchor: a === "middle" ? "middle" : a === "end" ? "end" : "start",
          fill: colors[ci] ?? C.ink,
          weight: ci === 0 ? 600 : 400,
        }),
      );
      cx2 += widths[ci];
    });
  });
  const h = headH + rows.length * rowH;
  out.push(rect(x, y, w, h, { stroke: C.ink, sw: 1.8 }));
  return out.join("");
}

/* ── Notas numeradas ────────────────────────────────────────────────────── */

/** Corta un texto monoespaciado en líneas que caben en `w`. */
export function wrap(text, w, size) {
  const max = Math.max(8, Math.floor(w / (size * 0.56)));
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = word;
    } else cur += " " + word;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

export function notes(x, y, w, items, o = {}) {
  const { size = 21, lh = 27, title = "NOTAS" } = o;
  const out = [T(x, y, title, { size: size + 1, weight: 700, ls: 1.6 })];
  out.push(line(x, y + 9, x + w, y + 9, { stroke: C.ink, w: 1.4 }));
  let yy = y + 34;
  items.forEach((n, i) => {
    out.push(T(x, yy, `${String(i + 1).padStart(2, "0")}`, { size: size - 2, fill: C.gold, weight: 700 }));
    const lines = wrap(n, w - 40, size);
    lines.forEach((l, j) => out.push(T(x + 40, yy + j * lh, l, { size, fill: C.soft })));
    yy += lines.length * lh;
  });
  return out.join("");
}

/** Párrafo con wrapping por longitud (mono). */
export function para(x, y, w, text, o = {}) {
  const { size = 21, lh = 28, fill = C.soft } = o;
  return wrap(text, w, size)
    .map((l, i) => T(x, y + i * lh, l, { size, fill }))
    .join("");
}

/* ── Marco / cajetín ────────────────────────────────────────────────────── */

export function frame(o) {
  const {
    dwg = "SCAUDIT-CAD-00",
    title = "",
    subtitle = "",
    sheet = 1,
    total = 9,
    rev = "1.0",
    date = "2026-11-02",
    accent = C.gold,
  } = o;
  const out = [];
  const M = 80;
  const IX = 112;
  const IY = 112;
  const IW = PAPER.w - IX * 2;
  const IH = PAPER.h - IY * 2;

  // papel + retícula
  out.push(rect(0, 0, PAPER.w, PAPER.h, { fill: C.paper, stroke: "none", sw: 0 }));
  out.push(rect(150, 210, 1800, 2240, { fill: "url(#grid10)", stroke: "none", sw: 0 }));
  out.push(rect(150, 210, 1800, 2240, { fill: "url(#grid50)", stroke: "none", sw: 0 }));

  // marcos
  out.push(rect(M, M, PAPER.w - M * 2, PAPER.h - M * 2, { stroke: C.ink, sw: 4 }));
  out.push(rect(IX, IY, IW, IH, { stroke: C.ink, sw: 1.6 }));

  // zonas 1..8 / A..F
  const cols = 8;
  const rows = 6;
  const cw = IW / cols;
  const rh = IH / rows;
  for (let i = 0; i < cols; i++) {
    const cx = IX + cw * (i + 0.5);
    out.push(T(cx, M + 46, String(i + 1), { size: 22, anchor: "middle", fill: C.soft }));
    out.push(T(cx, IY + IH + 30, String(i + 1), { size: 22, anchor: "middle", fill: C.soft }));
    out.push(line(IX + cw * i, M + 8, IX + cw * i, IY, { stroke: C.ink, w: 1 }));
    out.push(line(IX + cw * i, IY + IH, IX + cw * i, PAPER.h - M - 8, { stroke: C.ink, w: 1 }));
  }
  for (let j = 0; j < rows; j++) {
    const cy = IY + rh * (j + 0.5);
    const label = "ABCDEF"[j];
    out.push(T(M + 34, cy + 8, label, { size: 22, anchor: "middle", fill: C.soft }));
    out.push(T(IX + IW + 32, cy + 8, label, { size: 22, anchor: "middle", fill: C.soft }));
    out.push(line(M + 8, IY + rh * j, IX, IY + rh * j, { stroke: C.ink, w: 1 }));
    out.push(line(IX + IW, IY + rh * j, PAPER.w - M - 8, IY + rh * j, { stroke: C.ink, w: 1 }));
  }

  // cabecera
  out.push(T(150, 176, `${dwg} · REV ${rev} · ${date}`, { size: 22, fill: C.soft, ls: 1 }));
  out.push(T(150, 250, title, { size: 44, weight: 700, mono: false, ls: 0.4 }));
  if (subtitle) out.push(T(150, 288, subtitle, { size: 19, fill: C.soft, ls: 1.4 }));
  out.push(line(150, 302, 1950, 302, { stroke: C.ink, w: 1.4 }));
  out.push(rect(150, 302, 260, 6, { fill: accent, stroke: "none", sw: 0 }));
  out.push(
    T(1950, 176, "PROYECTO: STRATEGICAUDIT PRO (SCAUDIT)", { size: 22, anchor: "end", fill: C.soft }),
  );
  out.push(T(1950, 250, `LÁMINA ${String(sheet).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { size: 24, anchor: "end", weight: 700 }));
  out.push(T(1950, 288, "ESCALA N/A · UNIDADES mm · FORMATO A4", { size: 19, anchor: "end", fill: C.soft }));

  return out.join("");
}

export function titleBlock(o) {
  const {
    dwg = "SCAUDIT-CAD-00",
    subtitle = "",
    sheet = 1,
    total = 9,
    rev = "1.0",
    date = "2026-11-02",
    scale = "N/A",
    scope = "ARQUITECTURA DE SOFTWARE",
    accent = C.gold,
  } = o;
  const x = 1150;
  const y = 2500;
  const w = 800;
  const h = 360;
  const out = [];
  out.push(rect(x, y, w, h, { fill: C.card, stroke: C.ink, sw: 2.4 }));
  out.push(rect(x, y, w, 66, { fill: C.paper, stroke: C.ink, sw: 1.6 }));
  out.push(T(x + 16, y + 30, "STRATEGICAUDIT PRO — ATLAS TÉCNICO", { size: 23, weight: 700, ls: 0.8 }));
  out.push(T(x + 16, y + 55, scope, { size: 17, fill: C.soft, ls: 1.2 }));
  out.push(rect(x + w - 106, y + 10, 92, 46, { fill: accent, stroke: "none", sw: 0 }));
  out.push(T(x + w - 60, y + 42, "CAD", { size: 26, weight: 700, anchor: "middle", fill: C.paper }));

  out.push(T(x + 16, y + 96, subtitle, { size: 20, fill: C.soft }));
  out.push(line(x, y + 112, x + w, y + 112, { stroke: C.faint, w: 1 }));

  const rows = [
    ["Nº PLANO", dwg, "REV", rev],
    ["ESCALA", scale, "FECHA", date],
    ["LÁMINA", `${String(sheet).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, "FORMATO", "A4 · 210×297"],
  ];
  rows.forEach((r, i) => {
    const ry = y + 112 + i * 62;
    out.push(line(x, ry, x + w, ry, { stroke: C.faint, w: 1 }));
    out.push(T(x + 16, ry + 26, r[0], { size: 17, fill: C.soft, ls: 1 }));
    out.push(T(x + 150, ry + 27, r[1], { size: 22, weight: 700 }));
    out.push(line(x + 452, ry, x + 452, ry + 62, { stroke: C.faint, w: 1 }));
    out.push(T(x + 468, ry + 26, r[2], { size: 17, fill: C.soft, ls: 1 }));
    out.push(T(x + 600, ry + 27, r[3], { size: 22, weight: 700 }));
  });
  out.push(line(x, y + h - 40, x + w, y + h - 40, { stroke: C.faint, w: 1 }));
  out.push(
    T(x + 16, y + h - 14, "DOCUMENTO GENERADO DESDE EL CÓDIGO Y LOS ADR DEL REPOSITORIO", {
      size: 15,
      fill: C.faint,
      ls: 0.6,
    }),
  );
  return out.join("");
}

export function sheetSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${PAPER.w} ${PAPER.h}">
    ${defs()}
    ${inner}
  </svg>`;
}

/* ── Bloque de título de sección dentro del plano ───────────────────────── */

export function sectionTag(x, y, code, label, color = C.gold) {
  return [
    rect(x, y - 22, 46, 30, { fill: color, stroke: "none", sw: 0 }),
    T(x + 23, y, code, { size: 20, weight: 700, anchor: "middle", fill: C.paper }),
    T(x + 60, y, label, { size: 24, weight: 700, ls: 0.8 }),
    line(x + 60, y + 14, x + 700, y + 14, { stroke: C.faint, w: 1 }),
  ].join("");
}

export function legendRow(x, y, kind, label, color = C.ink) {
  const out = [];
  if (kind === "flow")
    out.push(line(x, y - 7, x + 64, y - 7, { stroke: color, w: 2.4 }), `<path d="M${x + 64},${y - 12} L${x + 78},${y - 7} L${x + 64},${y - 2} z" fill="${color}"/>`);
  if (kind === "dash")
    out.push(
      line(x, y - 7, x + 72, y - 7, { stroke: color, w: 2.2, dash: "9 6" }),
      `<path d="M${x + 72},${y - 12} L${x + 86},${y - 7} L${x + 72},${y - 2} z" fill="${color}"/>`,
    );
  if (kind === "trust")
    out.push(rect(x, y - 20, 80, 26, { stroke: color, sw: 1.6, dash: "7 5" }));
  if (kind === "service") out.push(rect(x, y - 20, 80, 26, { fill: C.card, stroke: color, sw: 2.2 }));
  if (kind === "data")
    out.push(
      `<path d="M${x},${y - 14} h64 v16 a32,7 0 0 1 -64,0 z" fill="${C.card}" stroke="${color}" stroke-width="2.2"/>`,
      `<ellipse cx="${x + 32}" cy="${y - 14}" rx="32" ry="7" fill="none" stroke="${color}" stroke-width="2.2"/>`,
    );
  if (kind === "job")
    out.push(
      rect(x, y - 18, 78, 24, { fill: C.card, stroke: color, sw: 2.2 }),
      T(x + 39, y - 2, "JOB", { size: 15, anchor: "middle", fill: color }),
    );
  out.push(T(x + 96, y - 1, label, { size: 20, fill: C.soft }));
  return out.join("");
}

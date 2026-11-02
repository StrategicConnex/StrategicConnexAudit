/* ═══════════════════════════════════════════════════════════════════════════
   LÁMINA 09 — Selección de framework

   No inventa versiones: las lee de package.json vía introspect.mjs.
   La matriz es cualitativa (● / ◐ / ○) contra los criterios del proyecto,
   no un benchmark de rendimiento.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  C,
  T,
  box,
  conn,
  rect,
  line,
  frame,
  titleBlock,
  sheetSvg,
  sectionTag,
  para,
} from "./svg.mjs";

const TOTAL = 10;

function page(n, cfg, inner, m) {
  return sheetSvg(
    [
      frame({ dwg: cfg.dwg, title: cfg.title, subtitle: cfg.subtitle, sheet: n, total: TOTAL, accent: cfg.accent, date: m?.date }),
      inner,
      titleBlock({
        dwg: cfg.dwg,
        subtitle: cfg.blockSub ?? cfg.subtitle,
        sheet: n,
        total: TOTAL,
        accent: cfg.accent,
        date: m?.date,
        scope: cfg.scope ?? "ARQUITECTURA DE SOFTWARE",
      }),
    ].join(""),
  );
}

const GLYPH = { yes: "●", part: "◐", no: "○" };
const GCOLOR = { yes: C.green, part: C.gold, no: C.red };

function mark(x, y, kind) {
  return T(x, y, GLYPH[kind], { size: 24, anchor: "middle", fill: GCOLOR[kind] });
}

export function sheet09(m) {
  const f = [];
  const v = (s) => (s ? String(s).replace(/^[\^~]/, "") : "—");

  /* ── A · capas del stack ─────────────────────────────────────────────── */
  f.push(sectionTag(150, 350, "A", "STACK EN USO · UNA CAPA, UN FRAMEWORK"));

  const cards = [
    [
      "APLICACIÓN",
      "Next.js",
      v(m.stack.next),
      [["App Router + RSC", "78 route handlers", "proxy.ts + Server Actions"], C.gold],
    ],
    [
      "INTERFAZ",
      "React",
      v(m.stack.react),
      [["client + server components", "Tailwind 4 · tokens OKLCH", "recharts · reactflow · leaflet"], C.teal],
    ],
    [
      "DATOS",
      "Drizzle ORM",
      v(m.stack.drizzle),
      [["Postgres + RLS", `${m.db.migrations} migraciones`, "una sola capa de acceso"], C.teal],
    ],
    [
      "JOBS",
      "Trigger.dev",
      v(m.stack.trigger),
      [[`${m.triggers.tasks} tasks · ${m.triggers.crons} crons`, "durable + reintentos", "Vercel Cron de respaldo"], C.gold],
    ],
    [
      "CALIDAD",
      "Vitest + Playwright",
      `${v(m.stack.vitest)} · ${v(m.stack.playwright)}`,
      [[`${m.code.tests} archivos de test`, "guards estructurales en CI", "a11y con axe"], C.ink],
    ],
  ];

  cards.forEach((c, i) => {
    const x = 150 + i * 362;
    const y = 382;
    f.push(rect(x, y, 350, 200, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(x, y, 350, 6, { fill: c[3][1], stroke: "none", sw: 0 }));
    f.push(T(x + 16, y + 30, c[0], { size: 14, fill: c[3][1], weight: 700, ls: 1.4 }));
    f.push(T(x + 16, y + 62, c[1], { size: 20, weight: 700 }));
    f.push(T(x + 16, y + 86, `v${c[2]}`, { size: 14, fill: C.soft }));
    c[3][0].forEach((l, j) => f.push(T(x + 16, y + 118 + j * 26, l, { size: 14.5, fill: C.soft })));
  });

  /* ── B · matriz de ajuste ────────────────────────────────────────────── */
  f.push(sectionTag(150, 630, "B", "MATRIZ DE AJUSTE · CANDIDATOS VS CRITERIOS DEL PROYECTO"));

  const cols = [
    { label: "CANDIDATO", x: 150, w: 320, align: "start" },
    { label: "RSC", x: 470, w: 96, align: "middle" },
    { label: "API", x: 566, w: 96, align: "middle" },
    { label: "SERVERLESS", x: 662, w: 140, align: "middle" },
    { label: "ECOSISTEMA", x: 802, w: 150, align: "middle" },
    { label: "I18N · PWA", x: 952, w: 140, align: "middle" },
    { label: "MIGRACIÓN", x: 1092, w: 140, align: "middle" },
    { label: "VEREDICTO", x: 1232, w: 718, align: "start" },
  ];

  const rows = [
    ["Next.js 16 · App Router", "yes", "yes", "yes", "yes", "yes", "n/a", "EN USO · encaje total, migrar no aporta nada", C.gold],
    ["React Router (Remix)", "no", "yes", "yes", "yes", "part", "part", "Alternativa React válida; pierde RSC y el proxy de Next", C.ink],
    ["SvelteKit", "no", "yes", "yes", "no", "yes", "no", "Reescritura de la UI y de sus 5 librerías de visualización", C.ink],
    ["Nuxt", "no", "yes", "yes", "no", "yes", "no", "Reescritura total; el ecosistema actual es React", C.ink],
    ["Astro", "part", "part", "yes", "part", "part", "part", "Correcto para el sitio público de marketing, no para el dashboard", C.teal],
    ["NestJS + React", "no", "yes", "no", "part", "part", "no", "Duplica runtime y DI; no encaja en serverless", C.ink],
    ["Hono + React", "no", "yes", "yes", "part", "no", "part", "Útil como worker de API aparte, no como app", C.teal],
  ];

  const y0 = 660;
  const headH = 56;
  const rowH = 52;

  f.push(rect(150, y0, 1800, headH, { fill: C.paper, stroke: C.ink, sw: 1.8 }));
  cols.forEach((c) => {
    const px = c.align === "middle" ? c.x + c.w / 2 : c.x + 10;
    f.push(T(px, y0 + 34, c.label, { size: 14, weight: 700, anchor: c.align, ls: 0.6 }));
  });

  rows.forEach((r, i) => {
    const y = y0 + headH + i * rowH;
    if (i === 0) f.push(rect(150, y, 1800, rowH, { fill: C.gold, stroke: "none", sw: 0, opacity: 0.09 }));
    f.push(line(150, y, 1950, y, { stroke: C.faint, w: 1 }));
    f.push(T(164, y + 32, r[0], { size: 17, weight: 700, fill: r[7] }));
    cols.slice(1, 7).forEach((c, j) => {
      const kind = r[j + 1];
      if (kind === "n/a") {
        f.push(T(c.x + c.w / 2, y + 32, "—", { size: 18, anchor: "middle", fill: C.faint }));
      } else {
        f.push(mark(c.x + c.w / 2, y + 33, kind));
      }
    });
    f.push(T(1246, y + 32, r[7], { size: 14.5, fill: C.soft }));
  });

  const yEnd = y0 + headH + rows.length * rowH;
  f.push(rect(150, y0, 1800, yEnd - y0, { stroke: C.ink, sw: 1.8 }));
  cols.slice(1, 7).forEach((c) => f.push(line(c.x, y0, c.x, yEnd, { stroke: C.faint, w: 1 })));
  f.push(line(1232, y0, 1232, yEnd, { stroke: C.faint, w: 1 }));

  f.push(
    T(150, yEnd + 26, "● cumple · ◐ parcial · ○ no cumple · — no aplica", { size: 14, fill: C.faint }),
  );

  /* ── C · decisión ────────────────────────────────────────────────────── */
  f.push(sectionTag(150, 1170, "C", "DECISIÓN"));
  f.push(rect(150, 1198, 1060, 330, { fill: C.card, stroke: C.ink, sw: 2.4 }));
  f.push(rect(150, 1198, 8, 330, { fill: C.gold, stroke: "none", sw: 0 }));
  f.push(T(176, 1236, "MANTENER NEXT.JS 16 · NO MIGRAR · ADR-011", { size: 22, weight: 700, fill: C.gold }));
  const evidence = [
    "Server-side por defecto: 78 handlers y 4 módulos «use server» mantienen keys y RLS fuera del cliente.",
    "proxy.ts implementa CSP con nonce por request — está acoplado al runtime de Next 16.",
    "Vercel nativo: maxDuration, cron de respaldo y región fija sin adaptador propio (vercel.json).",
    "i18n cookie-based sin reestructurar URLs (ADR-003) y PWA ya servida desde public/.",
    "Migrar exige reescribir 835 archivos TS/TSX y reintegrar cinco dependencias de UI (recharts, reactflow, react-pdf, leaflet, swagger).",
  ];
  evidence.forEach((e, i) => {
    const y = 1274 + i * 46;
    f.push(T(180, y, `${String(i + 1).padStart(2, "0")}`, { size: 15, weight: 700, fill: C.faint }));
    f.push(para(216, y, 960, e, { size: 15.5, lh: 20 }));
  });

  /* ── D · cuándo reabrir ──────────────────────────────────────────────── */
  f.push(sectionTag(1240, 1170, "D", "CUÁNDO REABRIR LA DECISIÓN"));
  f.push(rect(1240, 1198, 710, 330, { fill: C.card, stroke: C.ink, sw: 1.8 }));
  const triggers = [
    [">50 % del tráfico", "es contenido estático → Astro para el sitio público", C.teal],
    ["Cómputo >120 s", "o binarios nativos → contenedor solo para ese worker", C.gold],
    ["Streaming de chat", "→ Vercel AI SDK dentro del router actual, no un framework nuevo", C.gold],
    ["API de terceros", "estable → worker Hono aparte, mismo Postgres", C.teal],
    ["Equipo de UI", "mayoritariamente no-React → evaluar SvelteKit con presupuesto de 6 meses", C.ink],
  ];
  triggers.forEach((t, i) => {
    const y = 1236 + i * 56;
    f.push(rect(1260, y - 18, 5, 40, { fill: t[2], stroke: "none", sw: 0 }));
    f.push(T(1278, y, t[0], { size: 15, weight: 700 }));
    f.push(T(1278, y + 20, t[1], { size: 14, fill: C.soft }));
  });

  /* ── E · qué no añadir ───────────────────────────────────────────────── */
  f.push(sectionTag(150, 1560, "E", "QUÉ NO AÑADIR (Y POR QUÉ)"));
  const notAdd = [
    ["NestJS / Express", "Duplica el runtime, rompe el modelo serverless y añade una segunda entrypoint (R-16).", C.red],
    ["Redis / BullMQ", "ADR-008: cola y caché L2 ya viven en Postgres; un servicio menos que operar.", C.red],
    ["LangChain / LangGraph", "El pool ya resuelve cadenas por tarea, failover, caché, presupuesto y self-heal de JSON.", C.red],
    ["Docker / Kubernetes", "Vercel cubre el despliegue; no hay binarios nativos ni procesos de larga vida.", C.red],
  ];
  notAdd.forEach((n, i) => {
    const x = 150 + i * 455;
    f.push(rect(x, 1590, 435, 190, { fill: C.card, stroke: C.ink, sw: 1.6 }));
    f.push(rect(x, 1590, 435, 5, { fill: C.red, stroke: "none", sw: 0 }));
    f.push(T(x + 16, 1624, `NO · ${n[0]}`, { size: 16, weight: 700, fill: C.red }));
    f.push(para(x + 16, 1654, 400, n[1], { size: 14, lh: 19 }));
  });

  /* ── F · mapa framework → código ─────────────────────────────────────── */
  f.push(sectionTag(150, 1810, "F", "MAPA FRAMEWORK → CÓDIGO"));
  const chain = [
    ["proxy.ts", "edge · CSP + sesión"],
    ["app/", `${m.pages.total} páginas · RSC`],
    ["app/api/", `${m.routes.total} handlers`],
    ["server/", "dominio server-only"],
    ["shared/db/", `${m.db.tables.total} tablas`],
  ];
  chain.forEach((c, i) => {
    const x = 150 + i * 362;
    f.push(rect(x, 1840, 336, 120, { fill: C.card, stroke: C.ink, sw: 2 }));
    f.push(T(x + 16, 1878, c[0], { size: 18, weight: 700 }));
    f.push(T(x + 16, 1906, c[1], { size: 14, fill: C.soft }));
    f.push(T(x + 16, 1936, `CAPA ${i + 1}`, { size: 12, fill: C.faint, ls: 1 }));
    if (i < 4) f.push(conn([[x + 336, 1900], [x + 362, 1900]], { marker: "arw", w: 2 }));
  });
  f.push(
    T(150, 2004, "El build de Next resuelve las cinco capas; no hay servidor propio ni proceso persistente.", { size: 15, fill: C.soft }),
  );

  /* ── pie metodológico ────────────────────────────────────────────────── */
  f.push(line(150, 2060, 1950, 2060, { stroke: C.faint, w: 1 }));
  f.push(T(150, 2096, "MÉTODO", { size: 14, weight: 700, ls: 1.4, fill: C.ink }));
  f.push(
    para(
      236,
      2096,
      1710,
      "Evaluación cualitativa contra los criterios que el proyecto ya exige (RSC, route handlers, serverless en Vercel, ecosistema React, i18n/PWA, coste de migración). No es un benchmark de rendimiento ni una comparativa de precios: los candidatos se puntúan por encaje arquitectónico, no por velocidad.",
      { size: 14.5, lh: 20 },
    ),
  );
  f.push(
    T(150, 2160, `Versiones leídas de package.json en el build del ${m.date} · commit ${m.commit}.`, {
      size: 14,
      fill: C.faint,
    }),
  );

  return page(
    9,
    {
      dwg: "SCAUDIT-CAD-09",
      title: "SELECCIÓN DE FRAMEWORK",
      subtitle: "STACK EN USO · MATRIZ DE AJUSTE · DECISIÓN Y DISPARADORES",
      accent: C.blue,
      blockSub: "Por qué Next.js 16 es el framework correcto aquí",
      scope: "DECISIÓN TÉCNICA",
    },
    f.join(""),
  );
}

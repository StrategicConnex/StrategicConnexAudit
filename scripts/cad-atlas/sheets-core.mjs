/* ═══════════════════════════════════════════════════════════════════════════
   LÁMINAS 00–04 — contexto, capas, pipeline, pool IA y carátula
   Todas las cifras se calculan en el build con introspect.mjs (rutas, páginas,
   esquema Drizzle, journal, trigger files y registro de tools). Ninguna se
   escribe a mano: si el código cambia, la lámina cambia.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  C,
  T,
  TP,
  box,
  conn,
  hv,
  vh,
  route,
  line,
  rect,
  dimH,
  dimV,
  table,
  notes,
  para,
  frame,
  titleBlock,
  sheetSvg,
  sectionTag,
  legendRow,
  labelPill,
  wrap,
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

/* ═══════════════════════════════ 00 · CARÁTULA ═══════════════════════════ */

export function sheet00(m) {
  const f = [];
  const rows = [
    ["00", "CARÁTULA E ÍNDICE", "Portada, leyenda, métricas verificadas, glosario", "—"],
    ["01", "CONTEXTO · C4 L1", "Actores, sistema, servicios externos y protocolos", "—"],
    ["02", "CAPAS Y CONTENEDORES", "Siete capas, dirección de dependencia y superficies", "L2"],
    ["03", "MOTOR DE INTELIGENCIA", "Pipeline de escaneo, 12 etapas y modos de ejecución", "L3"],
    ["04", "POOL DE IA", "Routing por tarea, failover multi-proveedor, contratos", "L3"],
    ["05", "MODELO DE DATOS", "ERD del núcleo, tenancy, RLS y colas", "L2"],
    ["06", "SEGURIDAD", "Fronteras de confianza y defensa en profundidad", "L2"],
    ["07", "REGLAS DE ORO", "Constitución de ingeniería y su verificación", "—"],
    ["08", "OPERACIÓN", "Jobs, observabilidad, SIEM y respuesta", "L2"],
    ["09", "FRAMEWORK", "Stack, matriz de ajuste y decisión técnica", "—"],
  ];

  f.push(sectionTag(150, 370, "A", "ÍNDICE DE LÁMINAS"));
  f.push(
    table({
      x: 150,
      y: 396,
      w: 1180,
      cols: [
        { label: "N°", w: 0.6 },
        { label: "PLANO", w: 2.6 },
        { label: "CONTENIDO", w: 5.4 },
        { label: "NIVEL", w: 0.9 },
      ],
      rows,
      rowH: 50,
      headH: 40,
      size: 21,
      align: ["middle", "start", "start", "middle"],
    }),
  );

  f.push(sectionTag(150, 970, "B", "LEYENDA DE SÍMBOLOS"));
  f.push(rect(150, 996, 1180, 240, { fill: C.card, stroke: C.ink, sw: 1.6 }));
  const lg = [
    ["flow", "Flujo de datos / llamada síncrona", C.ink],
    ["dash", "Evento, job o dependencia asíncrona", C.teal],
    ["trust", "Frontera de confianza (trust boundary)", C.red],
    ["service", "Componente desplegable / módulo", C.ink],
    ["data", "Almacén de datos (Postgres)", C.teal],
    ["job", "Tarea programada (cron / Trigger.dev)", C.gold],
  ];
  lg.forEach((r, i) => {
    const x = 190 + (i % 2) * 590;
    const y = 1042 + Math.floor(i / 2) * 62;
    f.push(legendRow(x, y, r[0], r[1], r[2]));
  });

  /* métricas verificadas */
  f.push(sectionTag(1370, 370, "C", "MÉTRICAS VERIFICADAS"));
  f.push(
    table({
      x: 1370,
      y: 396,
      w: 580,
      cols: [{ label: "MÉTRICA", w: 3.2 }, { label: "VALOR", w: 1.1 }],
      rows: [
        ["Route handlers HTTP", String(m.routes.total)],
        ["Dominios de API", String(m.routes.domains.length)],
        ["Páginas (App Router)", String(m.pages.total)],
        ["Tablas pgTable", String(m.db.tables.total)],
        ["Migraciones SQL", String(m.db.migrations)],
        ["Archivos .trigger.ts", String(m.triggers.files)],
        ["Task IDs declarados", String(m.triggers.tasks)],
        ["Entradas cron", String(m.triggers.crons)],
        ["Tools registradas", String(m.tools.total)],
        ["Módulos ejecutores", String(m.executors.modules)],
        ["Archivos TS/TSX en src", String(m.code.srcFiles)],
        ["Archivos de test", String(m.code.tests)],
      ],
      rowH: 40,
      headH: 38,
      size: 20,
      align: ["start", "end"],
      zebra: true,
    }),
  );

  f.push(
    T(1370, 938, `MEDIDO EN EL BUILD · ${m.date} · commit ${m.commit}`, { size: 15, fill: C.faint, ls: 0.6 }),
  );

  f.push(sectionTag(1370, 980, "D", "STACK"));
  f.push(
    box({
      x: 1370,
      y: 1006,
      w: 580,
      h: 250,
      title: "EJECUCIÓN",
      accent: C.teal,
      subs: [
        "Next.js 16.3.3 · React 19.2 · App Router",
        "TypeScript 5 · Tailwind v4 · OKLCH tokens",
        "Drizzle ORM 0.45 · Supabase Postgres",
        "Trigger.dev 4.7.2 · Sentry 11 · Vercel iad1",
      ],
      subSize: 21,
    }),
  );

  /* flujo de lectura */
  f.push(sectionTag(150, 1300, "E", "ORDEN DE LECTURA RECOMENDADO"));
  const steps = [
    ["01", "QUÉ ES", "Contexto y actores", "Lámina 01"],
    ["02", "ORDEN", "Capas y dependencias", "Lámina 02"],
    ["03", "EJECUCIÓN", "Pipeline de escaneo", "Lámina 03"],
    ["04", "IA", "Pool y failover", "Lámina 04"],
    ["05", "DATOS", "Modelo relacional", "Lámina 05"],
    ["06", "DEFENSA", "Seguridad y RLS", "Lámina 06"],
    ["07", "LEY", "Reglas de oro", "Lámina 07"],
    ["08", "OPERACIÓN", "Jobs y señales", "Lámina 08"],
  ];
  steps.forEach((s, i) => {
    const x = 150 + i * 227;
    f.push(rect(x, 1330, 205, 130, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(x, 1330, 205, 6, { fill: i < 6 ? C.gold : C.teal, stroke: "none", sw: 0 }));
    f.push(T(x + 12, 1366, s[0], { size: 28, weight: 700, fill: C.faint }));
    f.push(T(x + 12, 1396, s[1], { size: 18, weight: 700 }));
    f.push(T(x + 12, 1422, s[2], { size: 15, fill: C.soft }));
    f.push(T(x + 12, 1446, s[3], { size: 16, fill: C.gold }));
    if (i < 7) f.push(T(x + 209, 1400, "›", { size: 26, fill: C.faint }));
  });

  /* principios */
  f.push(sectionTag(150, 1560, "F", "PRINCIPIOS RECTORES"));
  const pr = [
    ["RESILIENCIA", "La app nunca depende de IA ni de servicios auxiliares. Excepción: el rate limit, que es fail-closed acotado (ADR-002 §16)."],
    ["FUENTE ÚNICA", "Un solo registro de tools, un solo esquema SQL canónico, un solo punto de entrada por ruta (checks de CI)."],
    ["DEFENSA EN PROFUNDIDAD", "RLS + egress-guard SSRF + CSP con nonce + rate limit + audit log. Ningún control es la única barrera."],
    ["SIN EVIDENCIA NO HAY DONE", "Ninguna afirmación de validación sin comando ejecutado y salida observada (CORE_SYSTEM §9)."],
  ];
  pr.forEach((p, i) => {
    const x = 150 + (i % 2) * 900;
    const y = 1596 + Math.floor(i / 2) * 210;
    f.push(rect(x, y, 860, 180, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(x, y, 6, 180, { fill: i % 2 ? C.teal : C.gold, stroke: "none", sw: 0 }));
    f.push(T(x + 20, y + 34, `${String(i + 1).padStart(2, "0")} · ${p[0]}`, { size: 22, weight: 700, fill: i % 2 ? C.teal : C.gold }));
    f.push(para(x + 20, y + 64, 820, p[1], { size: 20, lh: 26 }));
  });

  /* declaración */
  f.push(rect(150, 2020, 1800, 300, { fill: C.card, stroke: C.ink, sw: 2.2 }));
  f.push(rect(150, 2020, 1800, 8, { fill: C.gold, stroke: "none", sw: 0 }));
  f.push(T(180, 2068, "DECLARACIÓN DE ALCANCE", { size: 22, weight: 700, fill: C.gold, ls: 1.4 }));
  f.push(
    para(
      180,
      2104,
      1700,
      `SCAUDIT Pro es un monolito modular desplegado en Vercel: Next.js 16 (App Router) sobre Supabase Postgres con RLS, motor de inteligencia propio que expone ${m.tools.total} herramientas sobre redes públicas bajo un egress-guard anti-SSRF, y un pool de IA multi-proveedor con degradación graciosa. No hay Docker, Kubernetes ni Redis: la cola de escaneo y la caché distribuida viven en Postgres (ADR-008).`,
      { size: 22, lh: 31 },
    ),
  );
  f.push(
    para(
      180,
      2230,
      1700,
      "Este atlas describe el sistema tal como está en el repositorio, no una intención de roadmap. Cada lámina separa lo verificado en código de lo asumido; las cifras son conteos directos sobre el árbol de trabajo.",
      { size: 20, lh: 28, fill: C.faint },
    ),
  );

  /* glosario mínimo */
  f.push(sectionTag(150, 2380, "G", "GLOSARIO"));
  const gl = [
    ["RLS", "Row Level Security por claim JWT"],
    ["Tool", "herramienta registrada y ejecutable"],
    ["Sink", "destino de telemetría o alertas"],
    ["TD / ADR", "deuda técnica / decisión registrada"],
  ];
  gl.forEach((g, i) => {
    const x = 150 + (i % 2) * 470;
    const y = 2416 + Math.floor(i / 2) * 34;
    f.push(T(x, y, g[0], { size: 18, weight: 700, fill: C.teal }));
    f.push(T(x + 92, y, g[1], { size: 16, fill: C.soft }));
  });

  return page(
    0,
    {
      dwg: "SCAUDIT-CAD-00",
      title: "ATLAS TÉCNICO DEL SISTEMA",
      subtitle: "PORTADA · ÍNDICE · LEYENDA · MÉTRICAS VERIFICADAS",
      accent: C.gold,
      blockSub: "Portada e índice general del atlas",
      scope: "DOCUMENTO MAESTRO",
    },
    f.join(""),
    m,
  );
}

/* ═════════════════════════════ 01 · CONTEXTO ══════════════════════════════ */

export function sheet01(m) {
  const f = [];

  f.push(sectionTag(150, 370, "A", "ACTORES"));
  const actors = [
    ["ANALISTA / CISO", ["Dashboard, copilot,", "reportes PDF"]],
    ["CONSUMIDOR API v1", ["API key Bearer", "rate limit por key"]],
    ["CI / CD", ["Webhook firmado", "HMAC SHA-256"]],
  ];
  actors.forEach((a, i) => {
    const y = 430 + i * 170;
    f.push(box({ x: 150, y, w: 340, h: 130, title: a[0], subs: a[1], subSize: 20 }));
    f.push(conn(hv(490, y + 65, 650, 470 + i * 150), { marker: "arw", color: C.ink }));
  });

  /* sistema */
  f.push(rect(650, 390, 700, 940, { fill: C.card, stroke: C.ink, sw: 3.2 }));
  f.push(rect(650, 390, 700, 62, { fill: C.paper, stroke: C.ink, sw: 2 }));
  f.push(T(672, 430, "SCAUDIT PRO · [SISTEMA]", { size: 25, weight: 700, ls: 0.8 }));
  f.push(T(1330, 430, "Next.js 16 · Vercel iad1", { size: 16, anchor: "end", fill: C.soft }));

  const inner = [
    ["EDGE", ["proxy.ts · CSP con nonce por request", "HSTS preload · X-Frame-Options DENY · updateSession"], C.teal],
    ["WEB", [`App Router · ${m.pages.total} páginas · ${m.pages.layouts} layouts`, "next-intl es/en · PWA · Server Actions"], C.ink],
    ["API", [`${m.routes.total} route handlers en ${m.routes.domains.length} dominios`, "Zod + withErrorHandler + withRateLimit"], C.ink],
    ["DOMINIO", ["ai · intelligence (core, executors, discovery, mitre)", "security · notifications · reports (server-only)"], C.ink],
    ["DATOS", [`Drizzle ORM · Postgres Supabase · ${m.db.tables.total} tablas`, "RLS · outbox · scan_queue · caché L2"], C.teal],
    ["JOBS", ["Vercel Cron ×3 (garantizado) · CRON_SECRET", `Trigger.dev: ${m.triggers.files} archivos · ${m.triggers.tasks} tasks · ${m.triggers.crons} schedules`], C.gold],
  ];
  inner.forEach((b, i) => {
    const y = 470 + i * 134;
    f.push(box({ x: 678, y, w: 644, h: 118, title: b[0], subs: b[1], subSize: 19, accent: b[2], titleSize: 22 }));
  });

  /* externos */
  f.push(sectionTag(1600, 370, "B", "SERVICIOS EXTERNOS"));
  const ext = [
    ["SUPABASE", ["Postgres + Auth + RLS", "pooler :6543 · directo :5432"]],
    ["POOL IA", ["OpenRouter primario", "failover Groq → Gemini"]],
    ["TRIGGER.DEV", [`${m.triggers.tasks} tasks · ${m.triggers.crons} schedules`, "opcional, no bloqueante"]],
    ["SIEM", ["Slack · PagerDuty", "Splunk · Resend"]],
    ["GOOGLE APIs", ["Search Console · GA4", "OAuth refresh token"]],
    ["SENTRY", ["errores + trazas", "túnel /monitoring"]],
  ];
  const extY = [390, 550, 710, 870, 1030, 1190];
  const extLabels = ["TLS · RLS", "HTTPS", "SDK", "HTTPS", "OAuth", "DSN"];
  ext.forEach((e, i) => {
    f.push(box({ x: 1600, y: extY[i], w: 350, h: 126, title: e[0], subs: e[1], subSize: 18, titleSize: 22 }));
    f.push(conn(hv(1350, 470 + Math.min(i, 5) * 134, 1600, extY[i] + 63), { color: C.soft, marker: "arwSoft" }));
    f.push(labelPill(1478, extY[i] + 48, extLabels[i], { size: 16 }));
  });

  /* protocolos */
  f.push(sectionTag(150, 1420, "C", "PROTOCOLOS Y AUTENTICACIÓN"));
  f.push(
    table({
      x: 150,
      y: 1448,
      w: 1800,
      cols: [
        { label: "ORIGEN", w: 2.2 },
        { label: "DESTINO", w: 2.2 },
        { label: "PROTOCOLO", w: 2.2 },
        { label: "AUTENTICACIÓN", w: 3 },
        { label: "CONTROL DE BORDE", w: 4 },
      ],
      rows: [
        ["Navegador / PWA", "Edge (proxy.ts)", "HTTPS 443", "Cookie de sesión Supabase", "CSP nonce · HSTS · X-Frame-Options"],
        ["API v1 consumidor", "Route handler", "HTTPS REST", "Bearer API key (hash en BD)", "withPublicApi · rate limit por key"],
        ["Pipeline CI/CD", "Webhook", "HTTPS POST", "Firma HMAC SHA-256", "verifyWebhookSignature + egress re-check"],
        ["Dominio", "Postgres", "TCP 6543 / 5432", "service_role (server) o claims JWT", "withRLS() por transacción"],
        ["Dominio", "Servicios OSINT", "HTTPS saliente", "según proveedor", "egress-guard: solo IP pública"],
        ["Vercel Cron", "Route /api/cron/*", "HTTPS", "CRON_SECRET", "comparación en tiempo constante"],
      ],
      rowH: 44,
      headH: 40,
      size: 19,
      zebra: true,
    }),
  );

  /* notas + límites */
  f.push(sectionTag(150, 1840, "D", "LÍMITES Y SUPUESTOS"));
  f.push(
    notes(
      150,
      1870,
      940,
      [
        "Monolito modular: sin Docker, Kubernetes ni Redis. La cola y la caché L2 viven en Postgres (ADR-008).",
        "Trigger.dev es opcional: los crons de Vercel son el mecanismo garantizado de operación.",
        "La IA es auxiliar: su caída degrada el copilot, nunca la disponibilidad de la app.",
        "Región única iad1 declarada en vercel.json; no contrastada contra el panel de Vercel.",
      ],
      { size: 17, lh: 22 },
    ),
  );
  f.push(
    box({
      x: 1180,
      y: 1860,
      w: 770,
      h: 230,
      title: "ALCANCE DEL PLANO",
      accent: C.red,
      subs: [
        "Incluye: frontend, API, motor, IA, datos, jobs y seguridad.",
        "Excluye: internals de Supabase, Vercel y OpenRouter.",
        "Nivel C4: L1 contexto · L2 contenedores · L3 componentes.",
        "Fuente: código + ADR + registro de deuda del repo.",
      ],
      subSize: 18,
    }),
  );

  /* secuencia de un request */
  f.push(sectionTag(150, 2160, "E", "SECUENCIA DE UN REQUEST AUTENTICADO"));
  const seq = [
    ["NAVEGADOR", "cookie de sesión"],
    ["proxy.ts", "CSP + updateSession"],
    ["ROUTE", "Zod + auth"],
    ["RATE LIMIT", "ventana Postgres"],
    ["DISPATCHER", "breaker + semáforo"],
    ["EXECUTOR", "egress-guard"],
    ["withRLS", "claims + rol"],
    ["JSON", "RateLimit-* + datos"],
  ];
  seq.forEach((s, i) => {
    const w = 196;
    const x = 150 + i * 222;
    f.push(rect(x, 2192, w, 96, { fill: C.card, stroke: C.ink, sw: 1.6 }));
    f.push(T(x + 12, 2222, `${String(i + 1).padStart(2, "0")} ${s[0]}`, { size: 15, weight: 700 }));
    f.push(T(x + 12, 2252, s[1], { size: 14, fill: C.soft }));
    if (i < 7) f.push(conn([[x + w + 2, 2240], [x + w + 22, 2240]], { marker: "arw", w: 1.8 }));
  });
  f.push(T(150, 2330, "Toda la cadena ocurre server-side; el navegador solo recibe JSON o HTML ya autorizado.", { size: 16, fill: C.soft }));

  return page(
    1,
    {
      dwg: "SCAUDIT-CAD-01",
      title: "CONTEXTO DEL SISTEMA · C4 L1",
      subtitle: "ACTORES · SISTEMA · SERVICIOS EXTERNOS · PROTOCOLOS",
      accent: C.gold,
      blockSub: "Quién usa el sistema y de qué depende",
    },
    f.join(""),
    m,
  );
}

/* ═══════════════════════════════ 02 · CAPAS ═══════════════════════════════ */

export function sheet02(m) {
  const f = [];
  const d = (n) => m.routes.domains.find((x) => x.name === n)?.count ?? 0;
  const listed = d("intelligence") + d("public") + d("security") + d("projects") + d("ai");
  const rest = m.routes.total - listed;
  const bands = [
    {
      code: "L0",
      name: "CLIENTE",
      y: 360,
      h: 120,
      color: C.teal,
      boxes: [
        ["NAVEGADOR / PWA", ["standalone · SW · offline"]],
        ["API v1", ["Bearer key + rate limit"]],
        ["CI/CD", ["webhook con firma HMAC"]],
      ],
    },
    {
      code: "L1",
      name: "EDGE",
      y: 500,
      h: 120,
      color: C.red,
      boxes: [
        ["proxy.ts", ["CSP nonce + HSTS + headers"]],
        ["updateSession()", ["refresh + redirect a /login"]],
        ["Rate limit global", ["fail-closed acotado"]],
      ],
    },
    {
      code: "L2",
      name: "PRESENTACIÓN",
      y: 640,
      h: 190,
      color: C.ink,
      boxes: [
        [`app/ (${m.pages.total} páginas)`, ["dashboard · intelligence", "security · settings"]],
        ["features/intelligence", ["components · hooks", "stores · lib"]],
        ["Server Actions", ["audits · projects · reports"]],
      ],
    },
    {
      code: "L3",
      name: "API",
      y: 850,
      h: 200,
      color: C.ink,
      boxes: [
        [`intelligence (${d("intelligence")})`, ["runs · tools · live"]],
        [`public/v1 (${d("public")}) + ai (${d("ai")})`, ["API key · copilot · report"]],
        [`security (${d("security")}) · projects (${d("projects")})`, ["audit · siem · csp · crud"]],
        [`resto (${rest})`, ["webhooks · cron · dominio"]],
      ],
    },
    {
      code: "L4",
      name: "DOMINIO",
      y: 1070,
      h: 280,
      color: C.gold,
      boxes: [
        ["intelligence/core", ["dispatcher · registry", "cache · breaker · semáforo", "risk-engine · scan-response"]],
        [`executors (${m.executors.modules})`, ["dns · tls · osint · cve", "email · whois · takeover", "discovery · mitre"]],
        ["ai/", ["ai-router · TASK_ROUTING", "failover · usage"]],
        ["seguridad y salida", ["SIEM · HMAC · api-keys", "push · reportes PDF"]],
      ],
    },
    {
      code: "L5",
      name: "DATOS",
      y: 1370,
      h: 230,
      color: C.teal,
      boxes: [
        ["Drizzle ORM", [`schemas · ${m.db.tables.total} pgTable`, `migraciones ${m.db.migrations} · journal ${m.db.journal}`]],
        ["withRLS()", ["claims JWT + rol en 1 statement", "transaccional, nunca persistente"]],
        ["Postgres Supabase", ["RLS · índices · outbox", "scan_queue · caché distribuida"]],
      ],
    },
    {
      code: "L6",
      name: "JOBS",
      y: 1620,
      h: 190,
      color: C.gold,
      boxes: [
        ["Vercel Cron ×3", ["siem 03:00 · uptime 03:30", "ai-healthcheck 04:00"]],
        ["Trigger.dev", [`${m.triggers.tasks} tasks · ${m.triggers.crons} schedules`, "discovery · anomaly · queue"]],
        ["On-demand", ["runProjectAudit · webhooks", "purga de cola · reportes"]],
      ],
    },
  ];

  f.push(sectionTag(150, 340, "A", "CAPAS Y CONTENEDORES"));
  bands.forEach((b) => {
    f.push(rect(150, b.y, 1370, b.h, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(150, b.y, 150, b.h, { fill: C.paper, stroke: C.ink, sw: 1.4 }));
    f.push(T(162, b.y + 34, b.code, { size: 24, weight: 700, fill: b.color }));
    f.push(T(162, b.y + 58, b.name, { size: 17, weight: 700, fill: C.soft }));
    const bx = 318;
    const bw = (1370 - 168 - (b.boxes.length - 1) * 14) / b.boxes.length;
    b.boxes.forEach((bx2, i) => {
      const x = bx + i * (bw + 14);
      const pad = 22;
      f.push(box({ x, y: b.y + 12, w: bw, h: b.h - 24, title: bx2[0], subs: bx2[1], subSize: 15, titleSize: 18, accent: b.color }));
      void pad;
    });
  });

  /* dirección de dependencia */
  f.push(sectionTag(1560, 340, "B", "REGLA DE DEPENDENCIA"));
  f.push(rect(1560, 366, 390, 700, { fill: C.card, stroke: C.ink, sw: 1.8 }));
  f.push(T(1580, 400, "SOLO HACIA ABAJO", { size: 20, weight: 700, fill: C.gold }));
  f.push(T(1580, 424, "Una capa no importa de la superior.", { size: 17, fill: C.soft }));
  ["L0", "L1", "L2", "L3", "L4", "L5", "L6"].forEach((l, i) => {
    const y = 446 + i * 58;
    f.push(rect(1600, y, 90, 40, { fill: C.paper, stroke: C.ink, sw: 1.4 }));
    f.push(T(1645, y + 27, l, { size: 18, anchor: "middle", weight: 700 }));
    if (i < 6) f.push(conn(vh(1645, y + 40, 1645, y + 58), { w: 2, marker: "arw" }));
    if (l === "L4") f.push(T(1706, y + 27, "server-only", { size: 16, fill: C.red }));
    if (l === "L5") f.push(T(1706, y + 27, "sin UI", { size: 16, fill: C.red }));
    if (l === "L6") f.push(T(1706, y + 27, "solo server", { size: 16, fill: C.red }));
  });
  f.push(T(1580, 890, "PROHIBIDO", { size: 18, weight: 700, fill: C.red }));
  f.push(T(1580, 914, "cliente → DB directa", { size: 16, fill: C.soft }));
  f.push(T(1580, 936, "componente → ai-router", { size: 16, fill: C.soft }));
  f.push(T(1580, 958, "route → executor sin registry", { size: 16, fill: C.soft }));
  f.push(T(1580, 980, "job → UI", { size: 16, fill: C.soft }));
  f.push(T(1580, 1012, "El cliente NUNCA conoce", { size: 16, fill: C.ink, weight: 700 }));
  f.push(T(1580, 1034, "keys, provider, fallback", { size: 16, fill: C.soft }));

  /* superficies */
  f.push(sectionTag(1560, 1100, "C", "SUPERFICIES"));
  f.push(
    table({
      x: 1560,
      y: 1126,
      w: 390,
      cols: [{ label: "ELEMENTO", w: 2.4 }, { label: "N", w: 0.6 }],
      rows: [
        ["Páginas", String(m.pages.total)],
        ["Route handlers", String(m.routes.total)],
        ["Dominios API", String(m.routes.domains.length)],
        ["Tools", String(m.tools.total)],
        ["Ejecutores", String(m.executors.modules)],
        ["Tablas", String(m.db.tables.total)],
      ],
      rowH: 40,
      headH: 36,
      size: 19,
      align: ["start", "end"],
    }),
  );

  f.push(
    box({
      x: 1560,
      y: 1420,
      w: 390,
      h: 390,
      title: "FRONTERA SERVER",
      accent: C.teal,
      subs: [
        "src/server/** es server-only.",
        "Secretos en env-secrets.ts.",
        "service_role solo en admin.ts.",
        "",
        "El client bundle no contiene",
        "NINGUNA credencial: guard:secrets",
        "falla el build si aparece.",
        "",
        "Toda lectura multi-tenant pasa",
        "por withRLS(userId).",
      ],
      subSize: 17,
    }),
  );

  /* distribución real de route handlers */
  f.push(sectionTag(150, 1870, "D", `DISTRIBUCIÓN DE ROUTE HANDLERS · ${m.routes.total}`));
  const top = m.routes.domains.slice(0, 9);
  const restCount = m.routes.total - top.reduce((a, x) => a + x.count, 0);
  const restDomains = m.routes.domains.length - top.length;
  const dom = [
    ...top.map((x) => [x.name, x.count]),
    [`resto (${restDomains} dominios)`, restCount],
  ];
  const peak = Math.max(...dom.map((x) => x[1]), 1);
  dom.forEach((row, i) => {
    const y = 1908 + i * 34;
    const bw2 = (row[1] / peak) * 640;
    f.push(T(150, y + 17, row[0], { size: 16, fill: C.soft }));
    f.push(rect(390, y, 640, 22, { fill: C.paper, stroke: C.faint, sw: 1 }));
    f.push(rect(390, y, bw2, 22, { fill: i === 0 ? C.gold : C.teal, stroke: "none", sw: 0, opacity: i === 0 ? 0.9 : 0.55 }));
    f.push(T(1044, y + 16, String(row[1]), { size: 15, weight: 700 }));
  });

  f.push(
    notes(
      1110,
      1870,
      840,
      [
        "L2 no habla con L5: las páginas consumen Server Actions o route handlers, nunca Drizzle directo.",
        "L4 es el único lugar con lógica de negocio; L3 solo valida, autoriza y serializa.",
        "L6 reutiliza los servicios de L4 — no duplica queries ni reglas de riesgo.",
        "Los guards de CI impiden reintroducir capas eliminadas (check:entrypoint, cascade-drop).",
      ],
      { size: 16, lh: 21 },
    ),
  );

  return page(
    2,
    {
      dwg: "SCAUDIT-CAD-02",
      title: "CAPAS Y CONTENEDORES · C4 L2",
      subtitle: "SIETE CAPAS · DIRECCIÓN DE DEPENDENCIA · SUPERFICIES",
      accent: C.teal,
      blockSub: "Estructura de capas y regla de dependencia",
    },
    f.join(""),
    m,
  );
}

/* ══════════════════════════ 03 · MOTOR DE INTELIGENCIA ═══════════════════ */

export function sheet03(m) {
  const f = [];
  const W = 380;
  const GAP = 52;
  const X0 = 190;

  const stage = (i, x, y, title, subs, color = C.ink, tag = "") => {
    const out = [];
    out.push(rect(x, y, W, 292, { fill: C.card, stroke: C.ink, sw: 2 }));
    out.push(rect(x, y, W, 40, { fill: color, stroke: "none", sw: 0 }));
    out.push(T(x + 12, y + 27, `${String(i).padStart(2, "0")} · ${title}`, { size: 18, weight: 700, fill: C.paper }));
    subs.forEach((s, j) => {
      const bold = s.startsWith("*");
      out.push(
        T(x + 14, y + (bold ? 78 : 78) + j * 30, bold ? s.slice(1) : s, {
          size: 17,
          fill: bold ? C.ink : C.soft,
          weight: bold ? 700 : 400,
        }),
      );
    });
    out.push(line(x + 14, y + 250, x + W - 14, y + 250, { stroke: C.faint, w: 1 }));
    out.push(T(x + 14, y + 274, `ETAPA ${String(i).padStart(2, "0")} / 12`, { size: 13, fill: C.faint, ls: 1 }));
    out.push(T(x + W - 14, y + 274, "SCAUDIT ENGINE", { size: 13, fill: C.faint, anchor: "end" }));
    if (tag) out.push(T(x + W - 12, y + 270, tag, { size: 15, fill: C.faint, anchor: "end" }));
    return out.join("");
  };

  f.push(sectionTag(150, 350, "A", "PIPELINE DE ESCANEO"));
  f.push(T(150, 386, "POST /api/intelligence/runs → resultado persistido (camino síncrono) o encolado (FEATURE_SCAN_QUEUE)", { size: 18, fill: C.soft }));

  /* fila 1 */
  const r1y = 410;
  const row1 = [
    ["ENTRADA", ["*POST /api/intelligence/runs", "Zod: target, tools[], projectId", "Sesión Supabase obligatoria", "→ request validado o 400"], C.teal],
    ["CONTROL DE TASA", ["*withRateLimit()", "Ventana deslizante en Postgres", "429 + cabeceras RateLimit-*", "→ continuar o 429"], C.gold],
    ["POLÍTICA DE PLAN", ["*policy-enforcer.ts", "Cupo de tools y concurrencia", "Plan free/pro/business (interno)", "→ plan y cupo sellados"], C.ink],
    ["CACHÉ L1/L2", ["*core/cache.ts", "TTL corto + clave por tool+target", "L2 en Postgres (ADR-008)", "→ hit (fin) o miss"], C.ink],
  ];
  row1.forEach((s, i) => {
    const x = X0 + i * (W + GAP);
    f.push(stage(i + 1, x, r1y, s[0], s[1], s[2]));
    f.push(T(x + W - 14, r1y + 22, s[0] === "ENTRADA" ? "HTTP" : "", { size: 14, fill: C.paper, anchor: "end" }));
  });
  for (let i = 0; i < 3; i++) {
    const x1 = X0 + i * (W + GAP) + W;
    f.push(conn([[x1 + 4, r1y + 146], [x1 + GAP - 4, r1y + 146]], { marker: "arw", color: C.ink }));
  }


  /* fila 2 (derecha→izquierda) */
  const r2y = 770;
  const row2 = [
    ["DISPATCHER", ["*core/dispatcher.ts", "circuit breaker (fail-open 1.5 s)", "semáforo de concurrencia", "→ tool ejecutado o degradado"], C.gold],
    ["TOOL REGISTRY", ["*core/tool-registry.ts", "FUENTE ÚNICA (ADR-001)", `${m.tools.total} tools + plugins lazy`, "→ executor resuelto"], C.gold],
    ["EXECUTOR TIPADO", ["*ToolExecutor<I,O>", "dns · tls · osint · cve · email", "resultado normalizado", "→ JSON tipado"], C.ink],
    ["EGRESS GUARD", ["*security/egress-guard.ts", "bloquea CIDR privados v4/v6", "revalida DNS y redirects", "→ HTTP saliente seguro"], C.red],
  ];
  row2.forEach((s, i) => {
    const x = X0 + (3 - i) * (W + GAP);
    f.push(stage(5 + i, x, r2y, s[0], s[1], s[2]));
  });
  for (let i = 0; i < 3; i++) {
    const x = X0 + (3 - i) * (W + GAP);
    f.push(conn([[x - 4, r2y + 146], [x - GAP + 4, r2y + 146]], { marker: "arw" }));
  }
  f.push(conn([[X0 + 3 * (W + GAP) + W / 2, r1y + 292], [X0 + 3 * (W + GAP) + W / 2, r2y]], { marker: "arw" }));
  f.push(
    conn([[X0 + 3 * (W + GAP) + W / 2, r2y + 292], [X0 + 3 * (W + GAP) + W / 2, r2y + 330], [X0 + W / 2, r2y + 330], [X0 + W / 2, r2y + 370]], {
      marker: "arw",
    }),
  );

  /* fila 3 */
  const r3y = 1140;
  const row3 = [
    ["RED PÚBLICA", ["*solo IP pública", "DNS · TLS · WHOIS · CVE", "timeout por herramienta", "→ datos crudos"], C.teal],
    ["RISK ENGINE", ["*core/risk-engine.ts", "severidad + confianza", "score por hallazgo", "→ severidad + score"], C.ink],
    ["PERSISTENCIA RLS", ["*withRLS(userId)", "tool_runs · findings · assets", "transacción atómica", "→ filas persistidas"], C.teal],
    ["OUTBOX / RESPUESTA", ["*outbox + eventos de run", "JSON normalizado al cliente", "dispara webhooks y jobs", "→ respuesta + eventos"], C.ink],
  ];
  row3.forEach((s, i) => {
    const x = X0 + i * (W + GAP);
    f.push(stage(9 + i, x, r3y, s[0], s[1], s[2]));
  });
  for (let i = 0; i < 3; i++) {
    const x = X0 + i * (W + GAP) + W;
    f.push(conn([[x + 4, r3y + 146], [x + GAP - 4, r3y + 146]], { marker: "arw" }));
  }
  f.push(conn([[X0 + W / 2, r2y + 292], [X0 + W / 2, r3y]], { marker: "arw" }));

  /* paneles inferiores */
  f.push(sectionTag(150, 1500, "B", "DOS MODOS DE EJECUCIÓN"));
  f.push(
    box({
      x: 150,
      y: 1530,
      w: 560,
      h: 300,
      title: "SÍNCRONO (por defecto)",
      accent: C.ink,
      subs: [
        "La ruta ejecuta el dispatcher y",
        "devuelve el resultado en el request.",
        "",
        "Límite: maxDuration = 120 s.",
        "Uso: 1–3 tools rápidas.",
      ],
      subSize: 19,
    }),
  );
  f.push(
    box({
      x: 730,
      y: 1530,
      w: 560,
      h: 300,
      title: "COLA (FEATURE_SCAN_QUEUE)",
      accent: C.teal,
      subs: [
        "enqueueScanJob() sella el plan y",
        "escribe scan_queue; el worker drena",
        "con FOR UPDATE SKIP LOCKED y slots.",
        "",
        "Fail-closed: si la cola está apagada,",
        "la ruta ejecuta en línea.",
      ],
      subSize: 19,
    }),
  );
  f.push(
    box({
      x: 1310,
      y: 1530,
      w: 640,
      h: 300,
      title: "INVARIANTES DEL MOTOR",
      accent: C.red,
      subs: [
        "Toda salida HTTP pasa por egress-guard.",
        "Todo tool se resuelve por el registry.",
        "Toda persistencia usa withRLS(userId).",
        "El breaker es fail-open; el rate limit, no.",
        "La caché nunca devuelve datos de otro tenant.",
      ],
      subSize: 19,
    }),
  );

  /* límites duros */
  f.push(sectionTag(150, 1880, "C", "PRESUPUESTO DE EJECUCIÓN"));
  f.push(
    table({
      x: 150,
      y: 1908,
      w: 1800,
      cols: [
        { label: "ETAPA", w: 2.2 },
        { label: "LÍMITE", w: 1.6 },
        { label: "MECANISMO", w: 3.4 },
        { label: "CONSECUENCIA SI SE AGOTA", w: 3.6 },
      ],
      rows: [
        ["Request completo", "120 s", "maxDuration de la función", "504; el cliente reintenta"],
        ["Tool individual", "timeout por tool", "AbortSignal en el executor", "Hallazgo marcado como error, resto continúa"],
        ["Circuito", "1.5 s", "circuit-breaker fail-open", "Se salta el proveedor y se degrada el resultado"],
        ["Concurrencia", "cupo por plan", "semáforo + slots de scan_queue", "El job espera en cola, no falla"],
        ["Rate limit", "ventana deslizante", "Postgres (memoria acotada si cae)", "429 con RateLimit-Reset"],
      ],
      rowH: 42,
      headH: 38,
      size: 18,
      zebra: true,
    }),
  );

  f.push(
    notes(
      150,
      2180,
      1800,
      [
        "El dispatcher no conoce proveedores concretos: resuelve por toolId contra el registro único.",
        "scan-response normaliza las claves (bug histórico de mayúsculas DNS corregido por accessors tipados).",
        "El worker de cola reutiliza exactamente la misma lógica que el camino síncrono — no hay dos implementaciones.",
      ],
      { size: 18, lh: 23 },
    ),
  );

  return page(
    3,
    {
      dwg: "SCAUDIT-CAD-03",
      title: "MOTOR DE INTELIGENCIA · PIPELINE",
      subtitle: "12 ETAPAS · DOS MODOS · PRESUPUESTO DE EJECUCIÓN",
      accent: C.gold,
      blockSub: "Cómo se ejecuta un escaneo de principio a fin",
    },
    f.join(""),
    m,
  );
}

/* ════════════════════════════════ 04 · POOL IA ═══════════════════════════ */

export function sheet04(m) {
  const f = [];
  f.push(sectionTag(150, 350, "A", "ENTRADA Y CONTRATO"));
  const flow = [
    ["useAiChat (hook)", "estado del chat · sin secretos"],
    ["POST /api/ai/copilot", "Zod · rate limit 5/60 s"],
    ["callAIWithFallback()", "taskType + messages"],
    ["Caché L1 → L2", "TTL 5 min · LRU 200"],
    ["TASK_ROUTING[task]", "cadena de modelos por tarea"],
  ];
  flow.forEach((s, i) => {
    const y = 390 + i * 150;
    f.push(rect(150, y, 500, 112, { fill: C.card, stroke: C.ink, sw: 2 }));
    f.push(T(168, y + 30, s[0], { size: 21, weight: 700 }));
    f.push(T(168, y + 58, s[1], { size: 18, fill: C.soft }));
    f.push(T(168, y + 84, `ETAPA ${String(i + 1).padStart(2, "0")}`, { size: 15, fill: C.faint }));
    if (i < 4) f.push(conn([[400, y + 112], [400, y + 158]], { marker: "arw" }));
  });

  /* lanes */
  f.push(sectionTag(710, 350, "B", "CADENAS POR TAREA (TASK_ROUTING)"));
  const lanes = [
    ["general-chat", ["openrouter/free", "nemotron-omni", "gemma-4", "nemotron-super", "nemotron-nano"], "20 s × 5"],
    ["copilot-remediation", ["openrouter/free", "gemma-4", "nemotron-omni", "nemotron-super", "nemotron-ultra"], "20 s × 5"],
    ["incident-brief", ["openrouter/free", "gemma-4", "nemotron-super", "nemotron-omni", "nemotron-ultra"], "20 s × 5"],
    ["seo-report (JSON)", ["openrouter/free", "gemma-4"], "50 s × 2"],
  ];
  lanes.forEach((l, i) => {
    const y = 392 + i * 222;
    f.push(rect(710, y, 690, 190, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(710, y, 6, 190, { fill: i === 3 ? C.red : C.gold, stroke: "none", sw: 0 }));
    f.push(T(730, y + 32, l[0], { size: 21, weight: 700 }));
    f.push(T(1380, y + 32, l[2], { size: 16, anchor: "end", fill: C.soft }));
    l[1].forEach((m, j) => {
      const x = 730 + j * 130;
      const chip = m.replace("openrouter/free", "or/free").replace("nemotron-", "");
      f.push(rect(x, y + 62, 118, 54, { fill: C.paper, stroke: C.ink, sw: 1.4 }));
      f.push(T(x + 8, y + 84, `${j + 1}º`, { size: 13, fill: C.gold }));
      f.push(T(x + 8, y + 105, chip, { size: 13 }));
    });
    f.push(T(730, y + 152, "meta-modelo primero · modelos :free verificados en vivo", { size: 16, fill: C.soft }));
  });

  /* failover */
  f.push(sectionTag(1460, 350, "C", "FAILOVER"));
  const fo = [
    ["OPENROUTER", "primario · modelos :free", C.ink],
    ["GROQ", "gpt-oss-120b · 0.65–1.1 s", C.teal],
    ["GEMINI", "3.8-flash · 2.9–4 s", C.teal],
    ["ERROR GRACIOSO", "sin filtrar trazas ni keys", C.red],
  ];
  fo.forEach((e, i) => {
    const y = 392 + i * 150;
    f.push(rect(1460, y, 490, 112, { fill: C.card, stroke: C.ink, sw: 2 }));
    f.push(rect(1460, y, 6, 112, { fill: e[2], stroke: "none", sw: 0 }));
    f.push(T(1478, y + 32, e[0], { size: 21, weight: 700, fill: e[2] }));
    f.push(T(1478, y + 62, e[1], { size: 17, fill: C.soft }));
    if (i < 3) f.push(conn([[1705, y + 112], [1705, y + 150]], { marker: "arw", color: i === 3 ? C.red : C.soft, dash: i === 0 ? "" : "8 5" }));
  });
  f.push(T(1460, 1010, "El failover conserva el contrato: tools + JSON + self-heal.", { size: 16, fill: C.soft }));
  f.push(T(1460, 1036, "Piso de 512 max_tokens (los modelos de reasoning lo consumen).", { size: 16, fill: C.soft }));
  f.push(T(1460, 1062, "Solo usa el remanente de maxDuration si quedan > 8 s.", { size: 16, fill: C.soft }));

  /* jerarquía de prompt */
  f.push(sectionTag(150, 1290, "D", "JERARQUÍA DEL PROMPT (ANTI-INYECCIÓN)"));
  const layers = [
    ["[SYSTEM INSTRUCTIONS]", "máxima prioridad · no sobrescribible", C.red, 0],
    ["[APPLICATION CONTEXT]", "generado por la app · acotado", C.gold, 1],
    ["[UNTRUSTED DATA]", "OSINT, evidencias, logs · delimitado", C.teal, 2],
  ];
  layers.forEach((l, i) => {
    const x = 150 + i * 420;
    f.push(rect(x, 1326, 390, 170, { fill: C.card, stroke: C.ink, sw: 2 }));
    f.push(rect(x, 1326, 390, 8, { fill: l[2], stroke: "none", sw: 0 }));
    f.push(T(x + 16, 1362, l[0], { size: 19, weight: 700, fill: l[2] }));
    f.push(T(x + 16, 1400, l[1], { size: 17, fill: C.soft }));
    f.push(T(x + 16, 1450, `PRIORIDAD ${3 - i}`, { size: 15, fill: C.faint }));
    if (i > 0) f.push(T(x - 20, 1416, "›", { size: 24, fill: C.faint }));
  });
  f.push(
    box({
      x: 1410,
      y: 1326,
      w: 540,
      h: 170,
      title: "REGLA DURA",
      accent: C.red,
      subs: ["Datos externos NUNCA cambian", "las instrucciones del sistema.", "Salida validada por schema."],
      subSize: 18,
    }),
  );

  /* contrato de respuesta */
  f.push(sectionTag(150, 1530, "E", "CONTRATO DE SALIDA Y TELEMETRÍA"));
  f.push(
    table({
      x: 150,
      y: 1558,
      w: 880,
      cols: [{ label: "CAMPO", w: 2 }, { label: "SIGNIFICADO", w: 4.4 }],
      rows: [
        ["success / content", "resultado útil para el cliente"],
        ["modelUsed", "prefijo groq:… o gemini:… en failover"],
        ["latencyMs", "medida real del proveedor"],
        ["fromCache", "true si sirvió L1 o L2"],
        ["fallbackUsed", "true si cambió de proveedor"],
        ["tokens", "input / output / total"],
        ["correlationId", "traza extremo a extremo, sin secretos"],
      ],
      rowH: 40,
      headH: 36,
      size: 18,
    }),
  );
  f.push(
    box({
      x: 1070,
      y: 1558,
      w: 880,
      h: 300,
      title: "PERSISTENCIA Y LÍMITES",
      accent: C.teal,
      subs: [
        "scheduleAiUsage() registra con after(): la invocación",
        "sobrevive al response; con fallback en tests/Trigger.dev.",
        "Un fallo de telemetría NUNCA rompe la respuesta al usuario.",
        "",
        "La key vive solo en envSecrets (server). El navegador",
        "nunca ve provider, cadena ni fallback.",
        "",
        "Sin ninguna key el chat muestra onboarding; con la",
        "caída del pool, error accionable — no 'configura tu key'.",
      ],
      subSize: 18,
    }),
  );

  f.push(
    notes(
      150,
      1904,
      1300,
      [
        "Los modelos JSON-críticos excluyen el meta-router: solo modelos con salida estructurada verificada en vivo.",
        "Los evals con modelOverride miden al modelo real y no entran al failover.",
        "Trade-off documentado: el free tier de Gemini puede usar el contenido para mejorar el producto.",
        "El presupuesto de 120 s de la route se comparte entre la cadena primaria y el failover.",
      ],
      { size: 16, lh: 21 },
    ),
  );

  /* escenarios límite */
  f.push(sectionTag(150, 2092, "F", "QUÉ PASA SI…"));
  const sc = [
    ["NO HAY NINGUNA KEY", "El chat muestra onboarding; el resto del producto sigue operativo. No es un error 500.", C.gold],
    ["OPENROUTER RESPONDE 429", "Se recorre la cadena y se pasa a Groq (0.65–1.1 s). La UI no alarma.", C.teal],
    ["TODO EL POOL FALLA", "Error accionable con correlationId; nunca se filtran trazas ni el nombre de la key.", C.red],
  ];
  sc.forEach((s, i) => {
    const x = 150 + i * 590;
    f.push(box({ x, y: 2122, w: 570, h: 160, title: s[0], accent: s[2], subs: wrap(s[1], 510, 16), subSize: 16 }));
  });

  return page(
    4,
    {
      dwg: "SCAUDIT-CAD-04",
      title: "POOL DE IA · ROUTING Y FAILOVER",
      subtitle: "CADENAS POR TAREA · ANTI-MONODEPENDENCIA · CONTRATOS",
      accent: C.teal,
      blockSub: "Cómo se elige, degrada y audita un modelo",
    },
    f.join(""),
    m,
  );
}

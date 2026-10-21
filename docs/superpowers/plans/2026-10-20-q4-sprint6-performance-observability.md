# Sprint 6 (Q4) — Performance & Observabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el Sprint 6 de `docs/plans/IMPLEMENTATION-PLAN-2026-Q4.md` (§ features 6.0–6.5): hoja de ruta pública en el disclaimer, particionado de `uptime_logs`, caché de IA distribuida (L2), optimización de índices, headers de estáticos y dashboard de uso en `/admin/usage`.

**Architecture:** Cada feature es aditiva y testeable por separado. La caché IA añade un L2 en Postgres reutilizando el `CacheStore` de ADR-008 (fail-open). El particionado es una migración SQL manual idempotente (patrón `drizzle/YYYY-MM-DD_*.sql` del journal) con copia de datos y copia de RLS/grants desde la tabla legacy. El dashboard de uso sigue el patrón de `/ai/health`: server actions con `assertPlatformAdmin` + `directDb`, reducer puro testeado y dashboard cliente con recharts.

**Tech Stack:** TypeScript, Drizzle (SQL manual en `drizzle/` con journal), Postgres (particiones declarativas), `@upstash`-free (Postgres `distributed_cache`), recharts + `useChartColors`, vitest (+ PGlite para SQL real), next 16.3.3.

**Specs de referencia:**
- `docs/plans/IMPLEMENTATION-PLAN-2026-Q4.md` (§Sprint 6 + anexo disclaimer/tarea 6.0)
- `docs/architecture/ADR/ADR-008-postgres-cache-and-queue.md` (caché L2)
- `docs/architecture/ADR/ADR-005-egress-guard-ssrf.md` (no aplica directamente, citado)
- `docs/archive/` — contexto RLS

## Global Constraints

- Copy en **español de España**. Las claves i18n del disclaimer viven en `src/app/disclaimer/{es,en}.json`: `pnpm guard:i18n` NO las cubre (solo compara `messages/{es,en}.json`) → el plan incluye un test de paridad propio (Task 2).
- **Zonas vetadas**: `src/proxy.ts`, RLS (políticas), auth. **Excepciones gateadas**: Task 3 edita el pool de IA (`ai-cache.ts`) → su Step 0 pide aprobación explícita del owner y se detiene sin ella; Task 9 toca la BD de producción → requiere package CHANGE + aprobación. La migración del Task 5 copia policies RLS de la tabla legacy pero NO crea/edita políticas nuevas.
- **Gate antes de cada push**: `pnpm typecheck` + `pnpm vitest run` + `pnpm build` + eslint 0 errores.
- Next.js 16.3.3 **no es el Next.js de la memoria**: ante cualquier duda de API de config/página, leer la guía en `node_modules/next/dist/docs/` antes de escribir código.
- Sin secretos nuevos, sin CDNs externos en el bundle cliente (guard `guard:cdn`, VULN-010).
- Sin dependencias nuevas en `package.json` en este sprint (todo con lo existente).
- Prohibido borrar/renombrar tablas de la BD de producción sin verificación + rollback documentado (Task 9).

## Desviaciones frente a `IMPLEMENTATION-PLAN-2026-Q4.md` (evidencia de lectura del repo)

1. **6.4 CDN externo descartado**: `scripts/guard-client-cdns.mjs` prohibe CDNs de terceros en el bundle cliente (VULN-010). El entregable real del 6.4 es caché inmutable same-origin en `/next.config.ts` + decisión documentada de CDN en la capa de red (no código).
2. **6.3**: `security_audit_logs` **no tiene columna `project_id`** (es global, no por tenant: `security-audit.ts:12-29`) → el índice compuesto del plan (`user_id, project_id, created_at`) se substituye por `(user_id, created_at)` + `(created_at)`. Además `idx_uptime_logs_project_checked` **ya existe** (no se recrea en 6.3; se re-crea como índice de tabla particionada en el Task 5).
3. **6.1 re-scoped a `uptime_logs`**: `intelligence_findings` es una tabla caliente con 8 índices + RLS activo; particionarla este sprint es alto riesgo sin datos de campo. Se deja candado de revisión Q1-2027 (criterio: `pg_total_relation_size` > 10 GB o queries > 500 ms).
4. **6.0**: los textos del disclaimer viven en JSON locales (`src/app/disclaimer/{es,en}.json`), no en `messages/` — el plan Q4 asumía `messages/es.json|en.json` con `disclaimer.roadmap.*`; se mantiene la técnica (`titleKey` + fechas ISO en datos) pero cargando del JSON local. Las fechas son la fuente única en `src/shared/data/public-roadmap.ts` (ISO), con 14 items condensados (el item "secReview" del 28-dic cubre rendimiento+seguridad). Las 3 fechas omitidas del detalle (queries 22-oct, pooling 5-dic) no se publican — discreción al owner.
5. **Momentum**: la caché IA L1 ya existe (`ai-cache.ts`, integrada en `ai-router.ts`); 6.2 es SOLO el conector L2 (0.5-1 día).

---

## Enmienda 1 — Condiciones del review del owner (2026-10-20, veredicto: "ejecutable con 3 condiciones")

Este plan queda **APROBADO en modo Subagent-Driven** bajo las modificaciones siguientes (que ya están integradas en las tareas correspondientes):

1. **Task 3 (caché IA): APROBADO CONDICIONAL a C1–C6** — veredicto íntegro en la cabecera de la Task 3; cada condición exige evidencia (test PASS o artifact). Incumplida una → volver a `[PENDING-APPROVAL]` con evidencia.
2. **Task 5 (particionado): requiere ADDENDUM de cutover P1–P5** — integrado como bloque propio al inicio de la Task 5 (cutover online medido, rollback con legacy conservada, baseline del guard RLS en el mismo commit, prohibición de `drizzle-kit generate` por TD-19, retención 13 meses como ticket futuro conectado a `cleanup.trigger.ts`).
3. **Task 9 (rollout): criterios de rollback escritos R1–R3** — integrados tras la cabecera de la Task 9.
4. **Checkpoints de revisión**: tras Task 5 (cutover) hay checkpoint OBLIGATORIO adicional, además de los gates ya pausados. Tasks 1, 2, 4, 6 son de riesgo bajo y corren sin pausa. Tasks 7-8: vigilar que recharts quede aislado en la ruta `/admin/usage` (el App Router lo hace por ruta; verificar que NINGÚN componente compartido de la landing importe nada de esta ruta — sensibilidad post-H-10).
5. **Regla de desviaciones**: cualquier subagente que se desvíe del plan DEBE documentarlo en el mismo formato de las 5 desviaciones de la sección anterior (evidencia + razón), dentro de su propia tarea. **Desviación silenciosa = tarea rechazada** (el reviewer la envía a rehacer).
6. **Task 6 + RUM (REQ-002)**: el 6.4 es la única tárea medible con RUM — capturar p75 de LCP/TTFB ANTES del deploy y 48 h después (step añadido al Task 6).
7. **Recordatorio (no bloquea)**: 2026-10-22 revisión H-10b con 48 h de RUM — independiente de este plan.

---

### Task 1: Módulo de datos `public-roadmap.ts` (fuente única de fechas)

**Files:**
- Create: `src/shared/data/public-roadmap.ts`
- Test: `src/shared/data/public-roadmap.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro de datos).
- Produces (Task 2 consume EXACTOS): `type RoadmapGroupId = "perf" | "integrations" | "compliance" | "refinement"`, `type RoadmapItem = { id: string; group: RoadmapGroupId; titleKey: string; targetDate: string }`, `const PUBLIC_ROADMAP: RoadmapItem[]`, `const ROADMAP_GROUPS: Array<{ id: RoadmapGroupId; titleKey: string }>`. Los `titleKey` de items son `roadmap.items.<id>`, los de grupos `roadmap.groups.<id>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/data/public-roadmap.test.ts
import { describe, it, expect } from "vitest";
import { PUBLIC_ROADMAP, ROADMAP_GROUPS } from "./public-roadmap";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("public-roadmap — invariantes de datos", () => {
  it("declara exactamente los 14 items del plan Q4", () => {
    expect(PUBLIC_ROADMAP).toHaveLength(14);
    expect(PUBLIC_ROADMAP.map((i) => i.id)).toEqual([
      "partitioning", "aiCache", "cdn", "usagePanel",
      "osint", "webhooks", "docx", "bgJobs",
      "iso27001", "soc2pci", "soc2prep",
      "docs", "tutorials", "secReview",
    ]);
  });

  it("ids únicos y fechas ISO válidas futuras", () => {
    const ids = new Set(PUBLIC_ROADMAP.map((i) => i.id));
    expect(ids.size).toBe(PUBLIC_ROADMAP.length);
    for (const item of PUBLIC_ROADMAP) {
      expect(ISO_DATE.test(item.targetDate), item.id).toBe(true);
      expect(Number.isNaN(new Date(item.targetDate).getTime()), item.id).toBe(false);
    }
  });

  it("cada item pertenece a un grupo válido con titleKey <group>.<id> e item <id>", () => {
    const groupIds = new Set(ROADMAP_GROUPS.map((g) => g.id));
    for (const item of PUBLIC_ROADMAP) {
      expect(groupIds.has(item.group), item.id).toBe(true);
      expect(item.titleKey).toBe(`roadmap.items.${item.id}`);
    }
  });

  it("grupos en orden editorial y titleKeys únicos", () => {
    expect(ROADMAP_GROUPS.map((g) => g.id)).toEqual([
      "perf", "integrations", "compliance", "refinement",
    ]);
    const keys = new Set(ROADMAP_GROUPS.map((g) => g.titleKey));
    expect(keys.size).toBe(ROADMAP_GROUPS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/data/public-roadmap.test.ts`
Expected: FAIL — "Cannot find module './public-roadmap'"

- [ ] **Step 3: Write the module** (fechas copiadas verbatim del anexo del plan Q4)

```ts
// src/shared/data/public-roadmap.ts
/**
 * public-roadmap.ts — Fuente única de verdad de la hoja de ruta pública
 * (tarea 6.0 del plan Q4): fechas en ISO, textos vía i18n (titleKey).
 * El formato "día mes año" lo produce Intl.DateTimeFormat en el renderer —
 * aquí solo viven datos, nunca texto localizado.
 */

export type RoadmapGroupId =
  | "perf"
  | "integrations"
  | "compliance"
  | "refinement";

export type RoadmapItem = {
  id: string;
  group: RoadmapGroupId;
  titleKey: string;
  /** ISO: '2026-10-21' */
  targetDate: string;
};

export const ROADMAP_GROUPS: Array<{ id: RoadmapGroupId; titleKey: string }> = [
  { id: "perf", titleKey: "roadmap.groups.perf" },
  { id: "integrations", titleKey: "roadmap.groups.integrations" },
  { id: "compliance", titleKey: "roadmap.groups.compliance" },
  { id: "refinement", titleKey: "roadmap.groups.refinement" },
];

export const PUBLIC_ROADMAP: RoadmapItem[] = [
  { id: "partitioning", group: "perf", titleKey: "roadmap.items.partitioning", targetDate: "2026-10-21" },
  { id: "aiCache", group: "perf", titleKey: "roadmap.items.aiCache", targetDate: "2026-10-24" },
  { id: "cdn", group: "perf", titleKey: "roadmap.items.cdn", targetDate: "2026-10-27" },
  { id: "usagePanel", group: "perf", titleKey: "roadmap.items.usagePanel", targetDate: "2026-11-02" },
  { id: "osint", group: "integrations", titleKey: "roadmap.items.osint", targetDate: "2026-11-06" },
  { id: "webhooks", group: "integrations", titleKey: "roadmap.items.webhooks", targetDate: "2026-11-11" },
  { id: "docx", group: "integrations", titleKey: "roadmap.items.docx", targetDate: "2026-11-13" },
  { id: "bgJobs", group: "integrations", titleKey: "roadmap.items.bgJobs", targetDate: "2026-11-16" },
  { id: "iso27001", group: "compliance", titleKey: "roadmap.items.iso27001", targetDate: "2026-11-21" },
  { id: "soc2pci", group: "compliance", titleKey: "roadmap.items.soc2pci", targetDate: "2026-11-28" },
  { id: "soc2prep", group: "compliance", titleKey: "roadmap.items.soc2prep", targetDate: "2026-12-14" },
  { id: "docs", group: "refinement", titleKey: "roadmap.items.docs", targetDate: "2026-12-17" },
  { id: "tutorials", group: "refinement", titleKey: "roadmap.items.tutorials", targetDate: "2026-12-22" },
  { id: "secReview", group: "refinement", titleKey: "roadmap.items.secReview", targetDate: "2026-12-28" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/data/public-roadmap.test.ts`
Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add src/shared/data/public-roadmap.ts src/shared/data/public-roadmap.test.ts
git commit -m "feat(roadmap): fuente unica de datos de la hoja de ruta publica (tarea 6.0)"
```

---

### Task 2: Hoja de ruta pública en el disclaimer (i18n + UI colapsable)

**Files:**
- Modify: `src/app/disclaimer/es.json` (añadir namespace `roadmap` dentro del objeto raíz `disclaimer`)
- Modify: `src/app/disclaimer/en.json` (espejo exacto)
- Create: `src/app/disclaimer/RoadmapDisclosure.tsx`
- Modify: `src/app/disclaimer/page.tsx` (insertar el bloque entre la card de reportes y `<DisclaimerForm />`)
- Test: `src/app/disclaimer/RoadmapDisclosure.test.tsx`

**Interfaces:**
- Consumes (Task 1): `PUBLIC_ROADMAP`, `ROADMAP_GROUPS`, `RoadmapGroupId`.
- Consumes (existente): `src/i18n/request.ts#getLocale()`, mensajes locales `(locale === "en" ? enMessages : esMessages).disclaimer` (patrón de `page.tsx:39-41`).
- Produces: componente `<RoadmapDisclosure messages={messages} locale={locale} />` donde `messages` = el objeto `disclaimer.roadmap` del JSON (typed inline abajo) y `locale: "es" | "en"`.

- [ ] **Step 1: Add the failing parity + component tests**

```tsx
// src/app/disclaimer/roadmap-parity.test.ts
import { describe, it, expect } from "vitest";
import es from "./es.json";
import en from "./en.json";

/** Aplanado tipo a.b.c — mismo criterio que scripts/i18n-parity.mjs. */
function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const key of flatten(v as Record<string, unknown>, path)) keys.add(key);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

describe("disclaimer JSON — paridad roadmap es/en", () => {
  it("los dos locales exponen las MISMAS claves bajo disclaimer.roadmap", () => {
    const esKeys = flatten(es.disclaimer.roadmap);
    const enKeys = flatten(en.disclaimer.roadmap);
    expect([...esKeys].sort()).toEqual([...enKeys].sort());
  });

  it("cubre 4 grupos y 14 items", () => {
    expect(Object.keys(es.disclaimer.roadmap.groups)).toHaveLength(4);
    expect(Object.keys(es.disclaimer.roadmap.items)).toHaveLength(14);
  });
});
```

```tsx
// src/app/disclaimer/RoadmapDisclosure.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RoadmapDisclosure, type RoadmapMessages } from "./RoadmapDisclosure";
import es from "./es.json";

const messages = (es as { disclaimer: { roadmap: RoadmapMessages } }).disclaimer.roadmap;

describe("RoadmapDisclosure", () => {
  it("renderiza los 4 grupos con 14 <time> totales dentro de un <details>", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);

    const root = screen.getByRole("group");
    expect(root.tagName).toBe("DETAILS");
    for (const group of ["perf", "integrations", "compliance", "refinement"]) {
      expect(root.querySelector(`[data-roadmap-group="${group}"]`)).not.toBeNull();
    }
    expect(root.querySelectorAll("time")).toHaveLength(14);
  });

  it("formatea la fecha al locale: '21 de octubre de 2026' con dateTime ISO", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    const time = screen.getByText("21 de octubre de 2026");
    expect(time.getAttribute("datetime")).toBe("2026-10-21");
  });

  it("el aviso de estimaciones está visible al final", () => {
    render(<RoadmapDisclosure messages={messages} locale="es" />);
    expect(screen.getByText(messages.notice)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/disclaimer`
Expected: FAIL — `es.disclaimer.roadmap` es `undefined` y `RoadmapDisclosure` no existe.

- [ ] **Step 3: Añadir el namespace `roadmap` a ambos JSON** (dentro del objeto raíz `disclaimer`, al final)

`src/app/disclaimer/es.json` (copy español de España):

```json
"roadmap": {
  "title": "HOJA DE RUTA PÚBLICA (fechas estimadas)",
  "notice": "Las fechas son estimaciones publicadas por transparencia. Cualquier ajuste se anunciará en el changelog público de la plataforma.",
  "groups": {
    "perf": "Rendimiento y observabilidad",
    "integrations": "Integraciones avanzadas",
    "compliance": "Cumplimiento y gobernanza",
    "refinement": "Refinamiento y documentación"
  },
  "items": {
    "partitioning": "Particionado de tablas de historial (consultas más rápidas)",
    "aiCache": "Caché de respuestas de IA (menor latencia)",
    "cdn": "Caché inmutable de assets estáticos",
    "usagePanel": "Panel de uso de la plataforma",
    "osint": "Nuevas fuentes OSINT: VirusTotal, AlienVault OTX, Shodan",
    "webhooks": "Webhooks para integraciones externas",
    "docx": "Exportación de reportes a DOCX/ODT",
    "bgJobs": "Generación de reportes pesados en segundo plano",
    "iso27001": "Panel de cumplimiento ISO 27001",
    "soc2pci": "Cobertura SOC 2 y PCI DSS en el panel",
    "soc2prep": "Inicio de preparación SOC 2 Type II (políticas)",
    "docs": "Documentación técnica actualizada",
    "tutorials": "Vídeos tutoriales",
    "secReview": "Revisión final de rendimiento y seguridad"
  }
}
```

`src/app/disclaimer/en.json` (espejo exacto, mismas claves):

```json
"roadmap": {
  "title": "Public roadmap (estimated dates)",
  "notice": "Dates are estimates published for transparency. Any adjustment will be announced in the platform's public changelog.",
  "groups": {
    "perf": "Performance and observability",
    "integrations": "Advanced integrations",
    "compliance": "Compliance and governance",
    "refinement": "Refinement and documentation"
  },
  "items": {
    "partitioning": "History tables partitioning (faster queries)",
    "aiCache": "AI response caching (lower latency)",
    "cdn": "Immutable caching for static assets",
    "usagePanel": "Platform usage dashboard",
    "osint": "New OSINT sources: VirusTotal, AlienVault OTX, Shodan",
    "webhooks": "Webhooks for external integrations",
    "docx": "Report export to DOCX/ODT",
    "bgJobs": "Heavy report generation in the background",
    "iso27001": "ISO 27001 compliance dashboard",
    "soc2pci": "SOC 2 and PCI DSS coverage in the dashboard",
    "soc2prep": "Start of SOC 2 Type II preparation (policies)",
    "docs": "Updated technical documentation",
    "tutorials": "Video tutorials",
    "secReview": "Final performance and security review"
  }
}
```

- [ ] **Step 4: Implementar el componente** (server component: `<details>` nativo, sin JS cliente ni scripts nuevos → CSP intacta)

```tsx
// src/app/disclaimer/RoadmapDisclosure.tsx
import {
  PUBLIC_ROADMAP,
  ROADMAP_GROUPS,
  type RoadmapGroupId,
} from "@/shared/data/public-roadmap";

/** Tipo espejo del namespace "disclaimer.roadmap" del JSON local. */
export type RoadmapMessages = {
  title: string;
  notice: string;
  groups: Record<RoadmapGroupId, string>;
  items: Record<string, string>;
};

const LOCALE_TAG: Record<"es" | "en", string> = { es: "es-ES", en: "en-US" };

/**
 * Bloque colapsable `<details>` con la hoja de ruta público fechada.
 * HTML nativo (details/summary/time): sin scripts, sin CSP nueva.
 * La cookie de aceptación y el botón NO cambian — este bloque es informativo.
 */
export function RoadmapDisclosure({
  messages,
  locale,
}: {
  messages: RoadmapMessages;
  locale: "es" | "en";
}) {
  const fmt = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <details role="group" className="rounded-lg border border-border bg-card/40 px-6 py-4 text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {messages.title}
      </summary>
      <div className="mt-4 space-y-4 text-muted-foreground">
        {ROADMAP_GROUPS.map((group) => (
          <section key={group.id} data-roadmap-group={group.id}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              {messages.groups[group.id]}
            </h3>
            <ul className="mt-2 space-y-1 leading-relaxed">
              {PUBLIC_ROADMAP.filter((item) => item.group === group.id).map((item) => (
                <li key={item.id} className="pl-4">
                  <time dateTime={item.targetDate}>{fmt.format(new Date(item.targetDate))}</time>
                  {" — "}
                  {messages.items[item.id]}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted-foreground/80">{messages.notice}</p>
      </div>
 </details>
  );
}
```

- [ ] **Step 5: Wire en `src/app/disclaimer/page.tsx`**

Imports arriba (junto a `./DisclaimerForm`):

```tsx
import { RoadmapDisclosure } from "./RoadmapDisclosure";
```

Bloque a insertar ENTRE la card de reporte (termina `</p></div>` de `messages.reportHint`) y `<DisclaimerForm … />`:

```tsx
<RoadmapDisclosure
  messages={messages.roadmap}
  locale={locale === "en" ? "en" : "es"}
/>
```

Nota: el objeto `messages` de `page.tsx:41` es `(locale === "en" ? enMessages : esMessages).disclaimer` → `messages.roadmap` ya queda typed contra el JSON.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/app/disclaimer`
Expected: PASS — parity 2/2 + component 3/3

- [ ] **Step 7: Gate de i18n y accesibilidad**

Run: `pnpm guard:i18n` → sin cambios en `messages/*`, debe seguir verde (exit 0).
Contrate WCAG: los textos usan los tokens existentes `text-muted-foreground`/`border-border` (ya AA con tema); `<summary>` es enfocable nativo con Enter/Space.

- [ ] **Step 8: Commit**

```bash
git add src/app/disclaimer/es.json src/app/disclaimer/en.json src/app/disclaimer/RoadmapDisclosure.tsx src/app/disclaimer/page.tsx src/app/disclaimer/RoadmapDisclosure.test.tsx src/app/disclaimer/roadmap-parity.test.ts
git commit -m "feat(disclaimer): hoja de ruta publica fechada en bloque colapsable (tarea 6.0)"
```

---

### Task 3: Conector L2 de la caché de IA (feature 6.2) — ZONA VETADA: pool IA · APROBADO CONDICIONAL (C1–C6)

**⚠️ VEREDICTO (2026-10-20, review del owner): APROBADO CONDICIONAL a C1–C6. Este task SE EJECUTA, y su aceptación final está condicionada a que cada condición deje EVIDENCIA (test con PASS o artifact). Si alguna condición no se demuestra, el task vuelve a `[PENDING-APPROVAL]` con la evidencia del incumplimiento — no se parchea a mano.**

**Condición C1 — Aislamiento entre tenants**: la cache key es `sha256(taskType + scope + mensajes)` (ai-cache.ts:46-56) y el scope lo aporta el caller incluyendo el tenant (contrato ya en uso: `seo-report:{projectId}:{yyyy-mm-dd}` — `seo-report-service.ts:161`). Evidencia: test de dos tenants con el MISMO prompt → keys distintas.

**Condición C2 — TTL y on-write invalidación**: el TTL del L2 se CAP'a a un máximo de **1 hora** (aun para taskTypes cuya semántica L1 deliberada es 24h — `seo-report`/`exec-brief` — se respeta la semántica L1 pero el L2 nunca sirve más allá de 1h; el L1 solo se consulta primero, así el L2 frío sirve a lo sumo respuestas ≤ 1h). Además `invalidateCacheScope` (que `audit.trigger.ts` ya llama en cada scan nuevo) pasa a invalidar TAMBIÉN el L2 (nuevo `deleteByPrefix` en el `CacheStore`, con fail-open).

**Condición C3 — Sin secretos**: las claves son hash truncado (el prompt NUNCA va en la clave) y los values del L2 son `{content, modelId}` de la respuesta IA — sin credenciales (no hay otra��이터 en la tabla). La tabla vive en Postgres con RLS sin policies (solo backend), tomar cómó store post-rem�ng.

**Condición C4 — Accounting limpio**: en cache-hit el router responde con `modelUsed` de caché sin doble-contar tokens: el contrato actual `ai_usage.fromCache` (boolean, health.ts:99) YA es el señalador; el hit de la caché NO altera `tokensIn/out/costUsd` ni los probes del healthcheck. Evidencia: tests de accounting del router corren verdes tras el cambio + grep de confirmación.

**Condición C5 — Failover intacto**: el lookup del L2 se produce ANTES del camino del pool: un miss cae EXACTAMENTE al mismo path de `callAIWithFallback` (pool/fallback/circuit breakers, B-06); la capa de caché no envuelve los errores del proveedor. Evidencia: suite completa de `ai-router` (unit + chaos) en verde sin modificación de esa capa.

**Condición C6 — ADR-008 enmendado**: topología L1/L2, TTLs (cap 1h L2), scoping (claves por tenant protegidas por backend-only + contrato de scope), confidencialidad, y declaración explícita de que el L2 es **Postgres** (`distributed_cache`), NO Redis externo (el proyecto lo eliminó y no se re-introduce).

**Files:**
- Modify: `src/server/ai/ai-cache.ts` (conector + cap + invalidación L2)
- Modify: `src/shared/lib/distributed-cache.ts` (add `deleteByPrefix` opcional en el interfaz `CacheStore` + impl Postgres/memoria + wrapper fail-open)
- Modify: `src/server/ai/ai-router.ts` (~L338: comentario obsoleto "L1 memoria + L2 Redis" → real)
- Create: `docs/architecture/ADR/ADR-008-AMEND-ai-cache-l2.md`
- Test: `src/server/ai/ai-cache.test.ts` (describe nuevo) · `tests/platform/distributed-cache-deletebyprefix.test.ts` (PGlite)

**Interfaces:**
- Consumes (ADR-008, existente): `cacheGet<T>(key)`, `cacheSet(key, value, ttlMs?)`, `isDistributedCacheEnabled()` de `@/shared/lib/distributed-cache`; NUEVO: `cacheDeleteByPrefix(prefix): Promise<number>` (misma semántica fail-open).
- Produces: firmas públicas de `ai-cache.ts` SIN CAMBIOS (`buildSemanticKey`, `getSemanticCache`, `setSemanticCache`, `invalidateCacheScope`, `cacheMetrics`, `resetCacheMetrics`); `CacheStore` con el método `deleteByPrefix?` opcional (backwards-compatible: los tests existentes siguen fieles).

- [ ] **Step 0: Gate — registro de la aprobación condicional (sin bloqueo hoy)**

La aprobación ya fue otorgada por el owner el 2026-10-20 bajo las condiciones C1–C6 arriba. El ejecutor registra en el commit final la frase literal: «Task 3 ejecutado bajo aprobación condicional C1–C6 del review 2026-10-20» y añade al final del task un checklist de evidencia por condición. Si al cerrar el task FALTA una evidencia → NO commitear, reportar y volver a `[PENDING-APPROVAL]`.

- [ ] **Step 1: Write the failing tests** (añadir al final de `src/server/ai/ai-cache.test.ts`; extender import: `import { describe, it, expect, vi, beforeEach } from "vitest";`)

```ts
// ─── Conector L2 distribuido (6.2 — aprobado condicional C1–C6) ──────────────
// vi.hoisted: el factory de vi.mock corre antes que el body del módulo de test.
const { l2, mocks } = vi.hoisted(() => ({
  l2: new Map<string, { content: string; modelId: string; expiresAt: number }>(),
  mocks: {
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    deleteByPrefix: vi.fn(async (prefix: string) => {
      let n = 0;
      for (const k of Array.from(l2.keys())) {
        if (k.startsWith(prefix)) { l2.delete(k); n++; }
      }
      return n;
    }),
  },
}));

vi.mock("@/shared/lib/distributed-cache", () => ({
  isDistributedCacheEnabled: () => true,
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheDeleteByPrefix: mocks.deleteByPrefix,
}));

beforeEach(() => {
  l2.clear();
  mocks.cacheGet.mockReset();
  mocks.cacheSet.mockReset();
  mocks.deleteByPrefix.mockClear();
  mocks.cacheGet.mockImplementation(async (key: string) => l2.get(key));
  mocks.cacheSet.mockImplementation(async (key: string, value: unknown) => {
    l2.set(key, value as { content: string; modelId: string; expiresAt: number });
  });
});

describe("ai-cache — conector L2 distribuido (6.2)", () => {
  it("sirve desde L1 cuando la entrada está caliente y ESCRIBE también al L2", async () => {
    const key = buildSemanticKey("seo-report", "proj-a:2026-10-20", [
      { role: "user", content: "prompt" },
    ]);
    await setSemanticCache(key, "respuesta", "groq:openai/gpt-oss-120b", "seo-report");
    const hit = await getSemanticCache(key);
    expect(hit).toEqual({ content: "respuesta", modelId: "groq:openai/gpt-oss-120b" });
    expect(l2.has(key)).toBe(true);
  });

  it("sirve desde L2 cuando el L1 está frío (instancia nueva tras deploy)", async () => {
    const key = "ai:seo-report:proj-a:cross:deadbeef"; // nunca pasada por setSemanticCache
    l2.set(key, {
      content: "desde distribuida",
      modelId: "m",
      expiresAt: Date.now() + 60_000,
    });
    const hit = await getSemanticCache(key);
    expect(hit).toEqual({ content: "desde distribuida", modelId: "m" });
  });

  it("L2 expirado NO se sirve (miss limpio)", async () => {
    const key = "ai:seo-report:expired:l2";
    l2.set(key, { content: "viejo", modelId: "m", expiresAt: Date.now() - 1 });
    expect(await getSemanticCache(key)).toBeNull();
  });

  it("fail-open: fallo del L2 en GET → miss, en SET → no lanza (C5)", async () => {
    const key = buildSemanticKey("exec-brief", "proj-a", [{ role: "user", content: "x" }]);
    mocks.cacheGet.mockRejectedValueOnce(new Error("db down"));
    expect(await getSemanticCache(key)).toBeNull();
    mocks.cacheSet.mockRejectedValueOnce(new Error("db down"));
    await expect(
      setSemanticCache(key, "ok", "m", "exec-brief"),
    ).resolves.not.toThrow();
  });

  // ── C1: aislamiento entre tenants ───────────────────────────────────────────
  it("C1 — dos tenants con el MISMO prompt generan keys distintas", () => {
    const msgs = [{ role: "user" as const, content: "Resuma los riesgos" }];
    const keyA = buildSemanticKey("seo-report", "proj-a", msgs);
    const keyB = buildSemanticKey("seo-report", "proj-b", msgs);
    expect(keyA).not.toBe(keyB);
    expect(keyA.startsWith("ai:seo-report:proj-a")).toBe(true);
    expect(keyB.startsWith("ai:seo-report:proj-b")).toBe(true);
  });

  it("C1 — un hit del tenant A NO se sirve al tenant B", async () => {
    const keyA = "ai:seo-report:proj-a:hash-a";
    l2.set(keyA, { content: "informe de A", modelId: "m", expiresAt: Date.now() + 60_000 });
    expect(await getSemanticCache(keyA)).toEqual({ content: "informe de A", modelId: "m" });
    expect(await getSemanticCache("ai:seo-report:proj-b:hash-b")).toBeNull();
  });

  // ── C2: cap de TTL del L2 + invalidación on-write ───────────────────────────
  it("C2 — el TTL del L2 nunca supera 1 h aunque la semántica L1 sea 24 h", async () => {
    const key = buildSemanticKey("seo-report", "proj-a:2026-10-20", [
      { role: "user", content: "prompt" },
    ]);
    await setSemanticCache(key, "r", "m", "seo-report"); // ttlFor = 24 h
    const call = mocks.cacheSet.mock.calls.find((c) => c[0] === key);
    expect(call).toBeDefined();
    expect(call![2]).toBeLessThanOrEqual(3_600_000);
  });

  it("C2 — invalidateCacheScope borra L1 y L2 del scope", async () => {
    const scope = "proj-a:2026-10-20";
    const keyA = buildSemanticKey("seo-report", scope, [{ role: "user", content: "a" }]);
    await setSemanticCache(keyA, "r", "m", "seo-report"); // L1 + L2
    const deleted = await invalidateCacheScope("seo-report", "proj-a");
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await getSemanticCache(keyA)).toBeNull(); // L1 fuera y L2 fuera
    expect(l2.has(keyA)).toBe(false);
  });

  // ── C3: la clave nunca contiene el prompt crudo ──────────────────────────────
  it("C3 — la clave es hash truncado: NUNCA contiene el contenido del prompt", () => {
    const key = buildSemanticKey("copilot-remediation", "proj-a", [
      { role: "user", content: "SECRETO-super-hyper-estrictamente-privado" },
    ]);
    expect(key.includes("SECRETO-super")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/ai/ai-cache.test.ts`
Expected: FAIL en el describe nuevo — hoy `lookupSemanticCache` nunca consulta el mock y `invalidateCacheScope` no toca L2.

- [ ] **Step 3: `deleteByPrefix` en `distributed-cache.ts`** (ADR-008 C2 — change aditivo)

```ts
// (1) Interfaz — añadir al final de CacheStore:
export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  purgeExpired(): Promise<number>;
  /**
   * Elimina por prefijo (invalidación por scope, C2 del review).
   * Opcional: los callers la usan con fail-open.
   */
  deleteByPrefix?(prefix: string): Promise<number>;
}
```

```ts
// (2) Store postgres — añadir dentro de createPostgresCacheStore:
    async deleteByPrefix(prefix: string): Promise<number> {
      const res = await exec(
        sql`DELETE FROM distributed_cache WHERE key LIKE ${prefix + "%"}`,
      );
      return res.rowCount ?? 0;
    },
```

```ts
// (3) Store memoria — añadir dentro de createMemoryCacheStore:
    async deleteByPrefix(prefix: string): Promise<number> {
      let deleted = 0;
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) {
          map.delete(k);
          deleted++;
        }
      }
      return deleted;
    },
```

```ts
// (4) Wrapper fail-open en la API pública (junto a cacheGet/cacheSet):
/** Borra por prefijo; ante cualquier error devuelve 0 (invalidación nunca rompe). */
export async function cacheDeleteByPrefix(prefix: string): Promise<number> {
  try {
    const store = getCacheStore();
    return (await store.deleteByPrefix?.(prefix)) ?? 0;
  } catch (error) {
    logger.warn(`[distributed-cache] deleteByPrefix falló (fail-open) para "${prefix}":`, error);
    return 0;
  }
}
```

- [ ] **Step 4: Conector + cap + invalidación en `ai-cache.ts`**

```ts
// (1) Import (junto a los existentes):
import {
  cacheGet,
  cacheSet,
  cacheDeleteByPrefix,
  isDistributedCacheEnabled,
} from "@/shared/lib/distributed-cache";

/** C2 (review): el L2 jamás sirve respuestas de más 1 h — cap sobre ttlFor(). */
const L2_MAX_TTL_MS = 3_600_000;
```

```ts
// (2) lookupSemanticCache — reemplaza la función privada completa:
async function lookupSemanticCache(key: string): Promise<CacheHit | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    return { content: mem.content, modelId: mem.modelId };
  }
  if (mem) memory.delete(key);
  // L2 distribuido (ADR-008 C2): el store ya es fail-open (error → undefined).
  // Sólo activo con CACHE_STORE=postgres: dev/test siguen en memoria pura.
  if (isDistributedCacheEnabled()) {
    const l2 = await cacheGet<CacheHit & { expiresAt: number }>(key);
    if (l2 && l2.expiresAt > now) {
      return { content: l2.content, modelId: l2.modelId };
    }
  }
  return null;
}
```

```ts
// (3) setSemanticCache — reemplaza la función completa (desalojo L1 sin cambios):
export async function setSemanticCache(
  key: string,
  content: string,
  modelId: string,
  taskType: AITaskType
): Promise<void> {
  const ttlSec = ttlFor(taskType);
  if (memory.size > 500) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  const expiresAt = Date.now() + ttlSec * 1000;
  memory.set(key, { content, modelId, expiresAt });
  if (isDistributedCacheEnabled()) {
    await cacheSet(
      key,
      { content, modelId, expiresAt },
      Math.min(ttlSec * 1000, L2_MAX_TTL_MS)
    );
  }
}
```

```ts
// (4) invalidateCacheScope — reemplaza la función completa (L1 + L2, C2):
export async function invalidateCacheScope(
  taskType: AITaskType,
  scope: string
): Promise<number> {
  const prefix = `ai:${taskType}:${scope}`;
  let deleted = 0;
  for (const key of Array.from(memory.keys())) {
    if (key.startsWith(prefix)) {
      memory.delete(key);
      deleted++;
    }
  }
  // Invalidación on-write en el L2 (fail-open del wrapper). El caller
  // (audit.trigger.ts: invalidateCacheScope en cada scan nuevo) ya la dispara.
  const l2Deleted = await cacheDeleteByPrefix(prefix);
  return deleted + l2Deleted;
}
```

- [ ] **Step 5: Comentario obsoleto en `ai-router.ts`** (~L338)

Reemplazar por:

```
// Ver src/server/ai/ai-cache.ts: L1 memoria + L2 Postgres (distributed_cache,
// ADR-008 C2), clave sha256 de los mensajes completos + taskType + scope (el
// scope incluye tenant). El L2 tiene TTL cap 1h y soporta invalidación por
// prefijo (cacheDeleteByPrefix) con fail-open.
```

- [ ] **Step 6: Evidencia C4/C5 (router y accounting — VERIFICACIÓN, no código nuevo)**

```bash
# C5 — failover intacto: suite completa del módulo (unit + chaos + sprint1):
pnpm vitest run src/server/ai/
# C4 — contrato de accounting: locate evidencia existente:
grep -n "fromCache" src/server/ai/ai-router.ts src/server/ai/ai-usage.ts src/shared/db/schemas/health.ts
grep -n "getSemanticCache\|setSemanticCache" src/server/ai/ai-router.ts
```

Expected (paste en el reporte de la tarea):
- `pnpm vitest run src/server/ai/` → 0 fails (unit + chaos + sprint1: el pool, circuit breakers y fallback quedan intactos porque este task NO modifica ai-router salvo el comentario).
- `ai_usage.fromCache` (health.ts:99) es el señalador existente; `getSemanticCache` se consulta ANTES del path del pool: un miss sigue EXACTAMENTE el mismo `callAIWithFallback`. Si algún test del router referencia las funciones movidas y falla, corregir el import (mismo módulo), nunca la lógica.

- [ ] **Step 7: ADR-008 enmendado (C6)** — Create `docs/architecture/ADR/ADR-008-AMEND-ai-cache-l2.md`

```markdown
---
layout: default
title: ADR-008 AMEND — Caché IA L2 en distributed_cache
nav_order: 3.4.8
permalink: /docs/architecture/adr/008-amend-ai-cache-l2
version: 0.2
fecha: 2026-10-20
autor: Owner (veredicto condicional) + Engineering
estado: Aprobado (condicional C1–C6, evidencia en tests)
---

# ADR-008 AMEND — Caché IA L2 (topología, TTL, scoping, confidencialidad)

## 1. Topología
- **L1**: memoria por instancia (`ai-cache.ts`, preexistente, P1-3). Primer lookup, latencia 0.
- **L2**: tabla `postgres` existente `distributed_cache` vía `distributed-cache.ts` (ADR-008 C2).
- **NO Redis**: el proyecto eliminó Upstash/Redis (ADR-002 enmiendas 14-15) y NO se re-introduce: el L2 es Postgres con el mismo `DATABASE_URL` (REQ-4 del ADR-008) — sin procesador externo, sin credenciales nuevas.

## 2. Scoping y confidencialidad
- Clave: `ai:<taskType>:<scope>:<hash-sha256(messages)>`. El **scope incluye el tenant** (contratado: `seo-report:{projectId}:{yyyy-mm-dd}`, `exec-brief:{projectId}`), y el hash nunca incluye el contenido del prompt crudo (C3).
- Acceso: la tabla conserva RLS habilitada sin policies (patrón `rate_limit_windows`): solo backend `directDb` lee/escribe; `anon`/`authenticated` no pueden tocarlo. No hay leak cross-tenant por SQL, y las claves por tenant garantizan aislamiento lógico (test C1).
- Values: `{ content, modelId, expiresAt }` de respuesta IA. Sin secretos ni tokens (C3).

## 3. TTL y invalidación
- L2: cap duro de **1 h** (L2_MAX_TTL_MS) sobre el TTL de taskType — ningún L2 sirve respuestas de más de 1 h (C2).
- L1: TTLs por taskType actuales sin cambio (deliberados: seo-report/exec-brief 24h porque su scope ya incluye fecha; el L1 gana siempre al L2).
- Invalidación on-write: `invalidateCacheScope(taskType, scope)` borra L1 **y ahora también** L2 (`cacheDeleteByPrefix`); `audit.trigger.ts` ya la dispara en cada scan nuevo (C2).

## 4. Semántica y contabilidad
- Hit → `modelUsed` de caché; el accounting existente de `ai_usage.fromCache` NO se toca (C4): tokens/costes siguen fiel-factorizados.
- Miss → path único `callAIWithFallback` intacto; la caché ni envuelve errores de proveedor ni toca circuit breakers (C5).

## 5. Interfaz añadida al ADR-008
- `CacheStore.deleteByPrefix?(prefix): Promise<number>` + wrapper `cacheDeleteByPrefix` fail-open (postgresql: DELETE key LIKE; memoria: ops Map). Opcional para backwards-compat.

## Consecuencia para §7 del ADR original
El requisito §7 ("comparte por tool+target público, nunca por dato de tenant") queda escindido: keys públicas para tools OSINT; keys por-tenant para la caché IA, protegidas por backend-only + scope. Ambos mecanismos permanecen en el ADR-008.
```

- [ ] **Step 8: Test PGlite del `deleteByPrefix`** — Create `tests/platform/distributed-cache-deletebyprefix.test.ts`

```ts
// tests/platform/distributed-cache-deletebyprefix.test.ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { splitStatements } from "../../scripts/db/rls-inventory.mjs";
import {
  createPostgresCacheStore,
  DEFAULT_TTL_MS,
  type SqlExec,
} from "../../src/shared/lib/distributed-cache";

const MIGRATION = readFileSync(
  join(process.cwd(), "drizzle/0040_platform_cache_queue.sql"),
  "utf8",
);

let pglite: PGlite;
let d: ReturnType<typeof drizzle>;
let store: ReturnType<typeof createPostgresCacheStore>;

beforeAll(async () => {
  pglite = new PGlite();
  d = drizzle(pglite);
  const exec: SqlExec = async (q) =>
    (await d.execute(q)) as unknown as { rows: unknown[]; rowCount?: number | null };

  for (const s of splitStatements(MIGRATION).filter((s: string) => s.trim().length > 0)) {
    await d.execute(sql.raw(s));
  }
  store = createPostgresCacheStore(exec);
});

describe("CacheStore.deleteByPrefix — postgres (C2)", () => {
  it("borra por prefijo y deja el resto intacto", async () => {
    await store.set("ai:seo-report:proj-a:hash-1", { c: "1" }, DEFAULT_TTL_MS);
    await store.set("ai:seo-report:proj-a:hash-2", { c: "2" }, DEFAULT_TTL_MS);
    await store.set("ai:seo-report:proj-b:hash-3", { c: "3" }, DEFAULT_TTL_MS);
    await store.set("otro:grupo:key", { c: "4" }, DEFAULT_TTL_MS);

    const deletedInA = await store.deleteByPrefix!("ai:seo-report:proj-a");
    expect(deletedInA).toBe(2);

    expect(await store.get("ai:seo-report:proj-a:hash-1")).toBeUndefined();
    expect(await store.get("ai:seo-report:proj-b:hash-3")).toEqual({ c: "3" });
    expect(await store.get("otro:grupo:key")).toEqual({ c: "4" });
  });

  it("prefijo sin matches devuelve 0 (idempotente)", async () => {
    expect(await store.deleteByPrefix!("ai:seo-report:proj-a")).toBe(0);
  });
});
```

- [ ] **Step 9: Gates y commit (checklist de evidencia C1–C6 en el cuerpo)**

```bash
pnpm vitest run src/server/ai/ai-cache.test.ts tests/platform/distributed-cache-deletebyprefix.test.ts
pnpm typecheck
pnpm vitest run src/server/ai/           # C5: 0 fails
pnpm vitest run src/server/ai/sprint1.test.ts
```

```bash
git add src/server/ai/ai-cache.ts src/server/ai/ai-router.ts src/server/ai/ai-cache.test.ts src/shared/lib/distributed-cache.ts tests/platform/distributed-cache-deletebyprefix.test.ts docs/architecture/ADR/ADR-008-AMEND-ai-cache-l2.md
git commit -m "perf(ai-cache): conector L2 postgres con scope tenant, cap TTL 1h y invalidacion on-write (6.2, C1-C6)"
```

El cuerpo del commit incluye: «Task 3 ejecutado bajo aprobación condicional C1–C6 del review 2026-10-20» + líneas de evidencia:
- C1: test "C1 — dos tenants..." PASS
- C2: tests "C2 — cap TTL..." y "C2 — invalidateCacheScope..." PASS + deleteByPrefix PGlite 2/2
- C3: test "C3 — la clave..." PASS
- C4: grep `fromCache` pegado + suite router verde → accounting no alterado
- C5: `pnpm vitest run src/server/ai/` 0 fails (unit+chaos inclujo)
- C6: ADR-008-AMEND creado (estado Aprobado condicional con topología/TTL/scoping/confidencialidad)

Con cualquier evidencia fallida al final: detener, reportar y volver el task a `[PENDING-APPROVAL]` (no se plazca ni se parchea a mano).

### Task 4: Índices compuestos que faltan (feature 6.3, re-scoped)

**Files:**
- Modify: `src/shared/db/schemas/intelligence.ts` (intelligenceFindings, bloque de índices L121-135)
- Modify: `src/shared/db/schemas/security-audit.ts` (securityAuditLogs, bloque de índices L22-29)
- Create: `drizzle/2026-10-21_sprint6_indexes.sql`
- Modify: `drizzle/meta/_journal.json` (añadir entry 64)

**Interfaces:**
- Produces: en Schema: `idx_findings_project_severity_created` en `intelligenceFindings` (`projectId, severity, desc(createdAt)`); `idx_sec_audit_user_created` y `idx_sec_audit_created` en `securityAuditLogs`. En BD: mismos nombres. Task 9 los aplicará a producción.

- [ ] **Step 1: Editar schemas TS** (drizzle compila los índices que el drift-check espera ver en BD)

```ts
// src/shared/db/schemas/intelligence.ts — añadir al final del array de índices de intelligenceFindings:
  index("idx_findings_project_severity_created").on(
    t.projectId,
    t.severity,
    desc(t.createdAt),
  ),
```

(importar `desc` de `drizzle-orm` si no está ya importado en el archivo; `idx_findings_status` en L131 ya usa el mismo patrón sobre `status, desc(createdAt)`.)

```ts
// src/shared/db/schemas/security-audit.ts — añadir al array de índices de securityAuditLogs:
  // Sprint 6 (Q4 6.3): panel de uso — actividad por usuario + sweeps por fecha.
  // Tabla global (sin project_id): el compuesto del plan Q4 era erróneo.
  index("idx_sec_audit_user_created").on(t.userId, desc(t.createdAt)),
  index("idx_sec_audit_created").on(t.createdAt),
```

- [ ] **Step 2: SQL de migración** — Create `drizzle/2026-10-21_sprint6_indexes.sql`

```sql
-- Sprint 6 (Q4 6.3): índices compuestos faltantes (idempotente).
-- CREATE INDEX CONCURRENTLY dentro de migración transaccional NO se permite;
-- las tablas están por debajo del umbral de bloqueo (verificar row_count antes
-- de aplicar en prod — Task 9) y se usan plain CREATE ... IF NOT EXISTS.
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_findings_project_severity_created
  ON intelligence_findings (project_id, severity, created_at DESC);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sec_audit_user_created
  ON security_audit_logs (user_id, created_at DESC);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_sec_audit_created
  ON security_audit_logs (created_at);
```

- [ ] **Step 3: Registrar en journal** — Modify `drizzle/meta/_journal.json`

Calcular el `when` (UTC del 21-oct-2026 00:00):

```bash
node -e "console.log(Date.UTC(2026, 9, 21))"
```

Añadir como último elemento del array `logEntries` (el `idx` 64 sigue tras el 63 de `0052_remove_project_members`):

```json
,
{
  "idx": 64,
  "version": "7",
  "when": <resultado del comando de arriba>,
  "tag": "2026-10-21_sprint6_indexes",
  "breakpoints": true
}
```

- [ ] **Step 4: Drizzle validate**

Run: `pnpm db:check`
Expected: `Everything's fine`.

- [ ] **Step 5: Aplicar en BD local/test y verificar**

```bash
pnpm db:migrate     # aplica contra la BD de .env.local / prepare-test
```

Verificación EXPLAIN (con la BD local, en `scripts/db/` hay `psql` del string `DATABASE_URL`):

```sql
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id, severity, title FROM intelligence_findings
WHERE project_id = gen_random_uuid() AND severity = 'critical'
ORDER BY created_at DESC LIMIT 50;
```

Expected: `Index Scan using idx_findings_project_severity_created` (la query objetivo debe escanear por el nuevo índice; sin datos en local el planner puede caer a Seq Scan — en ese caso verificar con `SET enable_seqscan = off;` delante).

- [ ] **Step 6: Guardas de esquema**

```bash
pnpm db:drift-check && pnpm db:index-guard
```

Expected: ambos exit 0 (sombra = sin drift entre schemas TS y BD).

- [ ] **Step 7: Commit**

```bash
git add src/shared/db/schemas/intelligence.ts src/shared/db/schemas/security-audit.ts drizzle/2026-10-21_sprint6_indexes.sql drizzle/meta/_journal.json
git commit -m "perf(db): indices compuestos sprint 6 (findings proyecto/fecha, audit usuario/fecha)"
```

- [ ] **Nota: producción** — la aplicación de esta migración a PROD está en Task 9 (aprobación owner).

---

### Task 5: Particionado de `uptime_logs` (feature 6.1, re-scoped)

**⚠️ ADDENDUM de cutover (P1–P5, exigido por el review del owner 2026-10-20 — PGlite prueba correctitud, NO el cutover de producción):**

- **P1 — Cutover online medido**: ANTES de aplicar en prod, medir volumen:
  ```sql
  SELECT count(*) FROM uptime_logs;  -- el resultado va al CHANGE-003
  ```
  - Si la copia estimada es < 60 s (≈ < 500k filas en Supabase): ejecutar TODA la migración dentro de una única transacción explícita (`BEGIN; … COMMIT;` vía psql, respetando los `-- statement-breakpoint` como orden de statements). La ventana de lock para escritores dura lo que la copia; coordinarla en el hueco entre ticks del cron de uptime (cada 15 min — confirmar el momento del último tick antes de empezar) y con un `statement_timeout` suficiente.
  - Si el volumen es mayor: dos fases — (a) crear tabla particionada + particiones + trigger SIN renombrar legado, (b) backfill por lotes (`INSERT … SELECT … WHERE checked_at <= $1 ORDER BY checked_at LIMIT 50000` con checkpoint a cada lote), y (c) swap final del nombre en una transacción corta con el `statement_timeout` apretado. Checkpoints documentados en el CHANGE-003.
- **P2 — Rollback**: la tabla legacy (`uptime_logs_legacy`) se CONSERVA en producción un mínimo de 48 h de estabilización; el `DROP` solo se ejecuta tras la paridad R1 del Task 9 y con segunda confirmación del owner. El rollback completo está documentado en el §Rollback del CHANGE-003 (renombrar de vuelta).
- **P3 — Baseline del guard RLS**: las policies se re-crean con nombres idénticos, pero el guard de superficie RLS puede fallar por snapshot desfasado. Es OBLIGATORIO regenerar el snapshot del guard en el MISMO commit de la migración con la justificación en el mensaje (`pnpm db:rls-surface-guard` → si falla por recreación de policies: regenerar el snapshot según el mecanismo documentado en la cabecera de `scripts/db/rls-surface-guard.mjs` y commitar la regeneración junto a la migración; nunca editar expectativas a mano).
- **P4 — TD-19**: migración SQL ARTESANAL e idempotente (como este plan ya hace). **PROHIBIDO `pnpm db:generate`** para estas migraciones: los snapshots de drizzle-kit están desfasados y re-emitiría ~20 CREATE TABLE. Solo SQL manual + entries manuales del journal.
- **P5 — Retención**: la retención de particiones (13 meses sugeridos) es TICKET FUTURO conectado a `cleanup.trigger.ts` — NO implementarla ahora, NO improvisar cron nuevo (el presupuesto de 10 schedules está agotado 10/10, guardado por `cron-dispatchers.trigger.test.ts`). Añadir el ticket al registro de deuda (`docs/technical-debt/TECH-DEBT-REGISTER.md`).

**Files:**
- Create: `drizzle/2026-10-21_partition_uptime_logs.sql`
- Modify: `drizzle/meta/_journal.json` (entry 65)
- Modify: `src/shared/db/schemas/index.ts` (fin de `uptimeLogs`, L494-505)
- Test: `tests/platform/partition-uptime-logs.test.ts`

**Interfaces:**
- Consumes: `scripts/db/rls-inventory.mjs#splitStatements` (helper existente usado en PGlite) y patrón de `tests/platform/platform-cache-queue.test.ts` (PGlite + DDL read + splitStatements).
- Produces: tabla partición `uptime_logs` con PK `(id, checked_at)`, particiones mensuales oct-nov-dez 2026 + trigger de creación automática, índices re-creados, RLS/grants copiados del legacy. El schema TS pasa a PK compuesta (drizzle-kit check debe seguir verde después).

- [ ] **Step 1: SQL de migración** — Create `drizzle/2026-10-21_partition_uptime_logs.sql`

```sql
-- Sprint 6 (Q4 6.1, re-scoped): particionar uptime_logs por RANGE(checked_at).
-- Estrategia rename → reconstruir → copiar → policies/grants → (drop legacy en
-- fase posterior, Task 9, tras verificación).
-- statement-breakpoint
ALTER TABLE uptime_logs RENAME TO uptime_logs_legacy;
-- statement-breakpoint
DROP INDEX IF EXISTS idx_uptime_logs_project_checked;
-- statement-breakpoint
DROP INDEX IF EXISTS idx_uptime_logs_checked;
-- statement-breakpoint
CREATE TABLE uptime_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_up BOOLEAN NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, checked_at)
) PARTITION BY RANGE (checked_at);
-- statement-breakpoint
-- Particiones del trimestre en curso (idempotente).
CREATE TABLE IF NOT EXISTS uptime_logs_2026_09 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS uptime_logs_2026_10 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS uptime_logs_2026_11 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS uptime_logs_2026_12 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS uptime_logs_2027_01 PARTITION OF uptime_logs
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS uptime_logs_2027_02 PARTITION OF uptime_logs
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
-- statement-breakpoint
-- Trigger de fallback: si un insert cae fuera de las particiones pre-creadas,
-- crea la partición del mes al vuelo (concurrencia baja; el higiene diaria
-- pre-crea 2 meses adelante en un task aparte futuro).
CREATE OR REPLACE FUNCTION create_uptime_logs_partition()
RETURNS TRIGGER AS $$
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF uptime_logs FOR VALUES FROM (%L) TO (%L)',
    'uptime_logs_' || to_char(NEW.checked_at, 'YYYY"_"MM'),
    date_trunc('month', NEW.checked_at),
    date_trunc('month', NEW.checked_at) + interval '1 month'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- statement-breakpoint
CREATE TRIGGER trigger_create_uptime_partition
BEFORE INSERT ON uptime_logs
FOR EACH ROW EXECUTE FUNCTION create_uptime_logs_partition();
-- statement-breakpoint
-- Índices re-creados como índices participados (en el parent, heredados).
CREATE INDEX IF NOT EXISTS idx_uptime_logs_project_checked
  ON uptime_logs (project_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked
  ON uptime_logs (checked_at);
-- statement-breakpoint
-- Copia de datos: el trigger crea la partición si falta alguna.
INSERT INTO uptime_logs (id, project_id, is_up, status_code, response_time_ms, error_message, checked_at)
SELECT id, project_id, is_up, status_code, response_time_ms, error_message, checked_at
FROM uptime_logs_legacy
ORDER BY checked_at;
-- statement-breakpoint
-- Copia de policies RLS de la tabla legacy usando pg_policies (solo CREATE de
-- política igual — NO cambia la superficie RLS; el manifest sigue apuntando a
-- "uptime_logs" y los nombres de las policies son exactos).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'uptime_logs_legacy'
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON uptime_logs %s TO %s %s %s',
      c.policyname,
      c.cmd,
      (SELECT string_agg(quote_ident(r), ', ') FROM unnest(c.roles) r),
      CASE WHEN c.qual IS NOT NULL THEN 'USING ' || c.qual ELSE '' END,
      CASE WHEN c.with_check IS NOT NULL THEN 'WITH CHECK ' || c.with_check ELSE '' END
    );
  END LOOP;
END
$$;
-- statement-breakpoint
-- Copia de GRANTs (privilegios del legacy → nova tabla).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'uptime_logs_legacy'
      AND grantee != 'PUBLIC' AND grantee != 'postgres'
  LOOP
    EXECUTE format('GRANT %s ON uptime_logs TO %I', c.privilege_type, c.grantee);
  END LOOP;
END
$$;
-- statement-breakpoint
-- (El DROP de uptime_logs_legacy NO va en esta migración: se ejecuta en Task 9
-- tras verificación de conteos y muestra. Deja un comentario sentinela aquí.)
```

⚠️ Cambio de PK ⇒ actualizar schema (Step 2) ANTES de correr `db:check`, pero la migración es independiente del orden en repo.

- [ ] **Step 2: Schema TS a PK compuesta** — Modify `src/shared/db/schemas/index.ts` L494-505

```ts
// 30. Uptime Logs (Phase 2) — PARTICIONADO por RANGE(checked_at) (Sprint 6).
// La PK debe incluir la key de partición (regla Postgres de constraints
// únicos en tablas participadas).
export const uptimeLogs = pgTable("uptime_logs", {
  id: uuid("id").defaultRandom().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  isUp: boolean("is_up").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.id, t.checkedAt] }),
  index("idx_uptime_logs_project_checked").on(t.projectId, t.checkedAt),
  index("idx_uptime_logs_checked").on(t.checkedAt),
]);
```

(importar `primaryKey` de `drizzle-orm/pg-core` si no está.)

- [ ] **Step 3: Journal entry** — Modify `drizzle/meta/_journal.json` (entry 65 tras la del Task 4)

```json
,
{
  "idx": 65,
  "version": "7",
  "when": 1792963200000,
  "tag": "2026-10-21_partition_uptime_logs",
  "breakpoints": true
}
```

⚠️ **Lección del Task 4 (evidenciada en drizzle-orm 0.45.2, `pg-core/dialect.js:62`) — OBLIGATORIA**:
el migrator compara `lastDbMigration.created_at < migration.folderMillis` y SALTA en silencio
(sin error, sin escribir en el ledger) cualquier entry con `when` ≤ último aplicado. El último
aplicado es el idx 64 (`1792876800000`), así que `1792963200000` (= último aplicado + 1 día
exacto — ATENCIÓN: no confundir con `Date.UTC(2026,9,22)`, que es otro valor; la única
propiedad funcional es que `when` sea ESTRICTAMENTE mayor que el último `created_at` del
ledger) es el mínimo viable. `1792876800000` saltaría la migración. Tras `pnpm db:migrate`, NO te fíes del
output "applied successfully": verifica el DDL real (los objetos existen en el catálogo) y que
`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`
devuelva `created_at = 1792963200000`.

- [ ] **Step 4: Write the failing test (PGlite — SQL real)**

```ts
// tests/platform/partition-uptime-logs.test.ts
// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { splitStatements } from "../../scripts/db/rls-inventory.mjs";

let pglite: PGlite;
let d: ReturnType<typeof drizzle>;

const MIGRATION = readFileSync(
  join(process.cwd(), "drizzle/2026-10-21_partition_uptime_logs.sql"),
  "utf8",
);

beforeAll(async () => {
  pglite = new PGlite();
  d = drizzle(pglite);

  // Dependencia mínima: tabla projects (la migración crea FK hacia ella).
  await d.execute(sql`
    CREATE TABLE projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT
    );
  `);

  // Legacy mínima con policy + grant para probar la COPIA de RLS/grants.
  await d.execute(sql`
    CREATE TABLE uptime_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
      is_up BOOLEAN NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      error_message TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`ALTER TABLE uptime_logs ENABLE ROW LEVEL SECURITY;`);
  await d.execute(sql`
    CREATE POLICY uptime_system ON uptime_logs
      FOR ALL USING (checked_at IS NOT NULL) WITH CHECK (true);
  `);
  // El rol de test debe existir para que el GRANT del DO block funcione.
  await d.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
        CREATE ROLE anonymous NOLOGIN;
      END IF;
    END $$;
  `);
  await d.execute(sql`GRANT SELECT ON uptime_logs TO "anonymous";`);

  // Aplicar la migración statement a statement (helper del guard RLS).
  for (const s of splitStatements(MIGRATION).filter((s: string) => s.trim().length > 0)) {
    await d.execute(sql.raw(s));
  }
});

describe("particionado de uptime_logs (Q4 6.1)", () => {
  it("la tabla es particionada RANGE(checked_at) con PK compuesta", async () => {
    const res = (await d.execute(
      sql`SELECT partstrat FROM pg_partitioned_table p
          JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ partstrat: string }> };
    expect(res.rows[0]?.partstrat).toBe("r");

    const pk = (await d.execute(
      sql`SELECT COUNT(*)::int AS n FROM pg_constraint
          WHERE conrelid = 'uptime_logs'::regclass AND contype = 'p'`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(pk.rows[0]?.n).toBe(1); // PK compuesta (id, checked_at)
  });

  it("fallback DDL: insert en mes sin partición crea la partición al vuelo", async () => {
    const { rows } = (await d.execute(
      sql`INSERT INTO projects (name) VALUES ('p') RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    await d.execute(
      sql`INSERT INTO uptime_logs (project_id, is_up, checked_at)
          VALUES (${rows[0]!.id}, true, '2027-03-15T00:00:00Z')`,
    );
    const created = (await d.execute(
      sql`SELECT to_regclass('public.uptime_logs_2027_03') AS t`,
    )) as unknown as { rows: Array<{ t: string | null }> };
    expect(created.rows[0]?.t).toContain("uptime_logs_2027_03");
  });

  it("policies y grants copiados del legacy: la tabla sigue protegida", async () => {
    const policies = (await d.execute(
      sql`SELECT policyname FROM pg_policies WHERE tablename = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ policyname: string }> };
    expect(policies.rows.map((r) => r.policyname)).toContain("uptime_system");

    const relisrls = (await d.execute(
      sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'uptime_logs'`,
    )) as unknown as { rows: Array<{ relrowsecurity: boolean }> };
    expect(relisrls.rows[0]?.relrowsecurity).toBe(true);
  });

  it("los inserts caen en la partición del mes correspondiente", async () => {
    const { rows: pj } = (await d.execute(
      sql`INSERT INTO projects (name) VALUES ('p2') RETURNING id`,
    )) as unknown as { rows: Array<{ id: string }> };
    await d.execute(
      sql`INSERT INTO uptime_logs (project_id, is_up, checked_at)
          VALUES (${pj[0]!.id}, true, '2026-11-10T12:00:00Z')`,
    );
    const inPart = (await d.execute(
      sql`SELECT COUNT(*)::int AS n FROM uptime_logs_2026_11`,
    )) as unknown as { rows: Array<{ n: number }> };
    expect(inPart.rows[0]?.n).toBe(1);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/platform/partition-uptime-logs.test.ts`
Expected: PASS — 4/4 (PGlite es Postgres real compilado a WASM: soporta particiones declarativas, triggers DDL y RLS).

- [ ] **Step 6: Validación drizzle + auditoría de superficie**

```bash
pnpm db:check && pnpm db:rls-surface-guard
```

Expected: `Everything's fine` y el guard de superficie sin cambios duros (uptime_logs mantiene su clasificación del manifest).

- [ ] **Step 7: Commit**

```bash
git add drizzle/2026-10-21_partition_uptime_logs.sql drizzle/meta/_journal.json src/shared/db/schemas/index.ts tests/platform/partition-uptime-logs.test.ts
git commit -m "perf(db): particionar uptime_logs por mes con trigger fallback (feature 6.1)"
```

- [ ] **Nota: producción** — aplicar esta migración a PROD va en Task 9 (requiere aprobación owner + copia previa). El DROP de `uptime_logs_legacy` está GUARDED fuera de este código.

---

### Task 6: Caché inmutable same-origin para estáticos (feature 6.4, re-scoped)

**Files:**
- Modify: `next.config.ts` (headers existentes, L31-46)

**Interfaces:**
- Produce: header `Cache-Control: public, max-age=31536000, immutable` para `/_next/static/**`. Sin CDNs externos (guard:cdn VULN-010 lo prohíbe).

- [ ] **Step 1: Editar `next.config.ts`**

Dentro de `async headers()`, añadir un entry ANTES del actual `/(.*)`:

```ts
        {
          // Q4 6.4 (re-scoped): assets fingerprinted por Next son inmutables.
          // next ya setea esto por defecto; explicito para no depender del
          // default Y para que un reverse-proxy (Cloudflare) lo respete al
          // añadido sin re-escribir (vamos a mantener los headers origen).
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ],
        },
```

- [ ] **Step 2: Build + verificación del header**

```bash
pnpm build
pnpm start &
sleep 5
$chunk = (Get-ChildItem .next/static/chunks -Filter *.js | Select-Object -First 1).Name
curl.exe -I "http://localhost:3000/_next/static/chunks/$chunk"
```

Expected: `Cache-Control: public, max-age=31536000, immutable`. (Detener el server: `Stop-Process -Name node` a mano o Ctrl+C.)

- [ ] **Step 3: Guard de terceros tras el build**

Run: `pnpm guard:cdn`
Expected: exit 0 (el bundle NO referencia CDNs prohibidos — el re-scoped 6.4 jamás introduce ninguno).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "perf(headers): cache inmutable para /_next/static (feature 6.4)"
```

---


- [ ] **Step 5: Captura RUM para REQ-002 (pre/post deploy — review owner 2026-10-20)**

PASO DE OBSERVACIÓN (antes del deploy/commit): baseline de campo p75 de LCP y TTFB:

```sql
SELECT date_trunc('day', recorded_at) AS d,
       ROUND(percentile_disc(0.75) WITHIN GROUP (ORDER BY lcp)::numeric, 0) AS lcp_p75_ms,
       ROUND(percentile_disc(0.75) WITHIN GROUP (ORDER BY ttfb)::numeric, 0) AS ttfb_p75_ms
FROM web_vitals_logs
WHERE recorded_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;
```

- Pegar el output verbatim en el reporte del sprint como BASELINE.
- 48 h después del deploy a producción, repetir la query y pegar ambas capturas juntas: es la evidencia con datos de campo del entregable 6.4 (cierre de REQ-002 en el mismo movimiento). Si p75 empeora de forma sostenida → abrir incidencia de performance, no cerrar el 6.4.

### Task 7: Módulo puro de métricas + server actions de uso (feature 6.5, parte datos)

**Files:**
- Create: `src/server/admin/usage-metrics.ts`
- Test: `src/server/admin/usage-metrics.test.ts`
- Create: `src/app/admin/usage/actions.ts`

**Interfaces:**
- Consumes (existente): `directDb` de `@/shared/db`, `assertPlatformAdmin` de `@/server/auth/admin`, schemas `users`, `projects`, `auditLogs` (`@/shared/db/schemas`), `intelligenceFindings` (`@/shared/db/schemas/intelligence`), `aiUsage` (`@/shared/db/schemas/health`).
- Produces (Task 8 consume EXACTOS):
  - `type UsageMetrics = { totalUsers: number; totalProjects: number; auditsLast30d: number; findingsLast30d: number; findingsBySeverity: Record<'critical'|'high'|'medium'|'low', number>; activeUsersLast7d: number; aiCallsLast30d: number; aiTokensLast30d: { in: number; out: number }; aiCostUsdLast30d: number; aiCacheHitsLast30d: { hits: number; total: number } }`
  - `reduceUsageMetrics(rows: {...}): UsageMetrics` (puro, testeado; acepta snapshots cr textos de counts directamente).
  - server action `getUsageMetrics(): Promise<UsageMetrics>` (gate: `await assertPlatformAdmin()` FUERA del try — patrón `/ai/health/actions.ts:50-53`; fallo de query → zeros, no throw: panel de admins NO debe quedar en blanco por un fallo agregado).

- [ ] **Step 1: Write the failing test** (reducer puro, sin BD)

```ts
// src/server/admin/usage-metrics.test.ts
import { describe, it, expect } from "vitest";
import { reduceUsageMetrics } from "./usage-metrics";

describe("reduceUsageMetrics", () => {
  it("agrega counts y reparte findings por severidad", () => {
    const m = reduceUsageMetrics({
      totalUsers: 12,
      totalProjects: 8,
      auditsLast30d: 33,
      findingsLast30d: [
        { severity: "critical", n: 4 },
        { severity: "high", n: 7 },
        { severity: "medium", n: 2 },
        { severity: "low", n: 1 },
      ],
      activeUsersLast7d: 5,
      aiLast30d: { calls: 120, tokensIn: 9000, tokensOut: 3000, costUsd: 0.42, cacheHits: 40 },
    });

    expect(m).toEqual({
      totalUsers: 12,
      totalProjects: 8,
      auditsLast30d: 33,
      findingsLast30d: 14,
      findingsBySeverity: { critical: 4, high: 7, medium: 2, low: 1 },
      activeUsersLast7d: 5,
      aiCallsLast30d: 120,
      aiTokensLast30d: { in: 9000, out: 3000 },
      aiCostUsdLast30d: 0.42,
      aiCacheHitsLast30d: { hits: 40, total: 120 },
    });
  });

  it("zeros defensivos para valores nulos", () => {
    expect(reduceUsageMetrics({
      totalUsers: 0,
      totalProjects: 0,
      auditsLast30d: 0,
      findingsLast30d: [],
      activeUsersLast7d: 0,
      aiLast30d: { calls: 0, tokensIn: null, tokensOut: null, costUsd: null, cacheHits: 0 },
    })).toMatchObject({
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      aiTokensLast30d: { in: 0, out: 0 },
      aiCostUsdLast30d: 0,
      aiCacheHitsLast30d: { hits: 0, total: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/admin/usage-metrics.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar el reducer puro**

```ts
// src/server/admin/usage-metrics.ts
/**
 * usage-metrics.ts — Reducer puro del panel de uso (Q4 6.5).
 * Sin I/O: las server actions (actions.ts) hacen las queries y llaman aquí.
 * Escala de severidad INTELIGENCIA: critical|high|medium|low (≠ auditorías
 * critical|warning|info — NO se mezclan dominios).
 */

export type SeverityIntelligence = "critical" | "high" | "medium" | "low";

export type UsageMetrics = {
  totalUsers: number;
  totalProjects: number;
  auditsLast30d: number;
  findingsLast30d: number;
  findingsBySeverity: Record<SeverityIntelligence, number>;
  activeUsersLast7d: number;
  aiCallsLast30d: number;
  aiTokensLast30d: { in: number; out: number };
  aiCostUsdLast30d: number;
  aiCacheHitsLast30d: { hits: number; total: number };
};

const EMPTY_SEVERITY: Record<SeverityIntelligence, number> = {
  critical: 0, high: 0, medium: 0, low: 0,
};

export function reduceUsageMetrics(input: {
  totalUsers: number;
  totalProjects: number;
  auditsLast30d: number;
  findingsLast30d: Array<{ severity: string; n: number }>;
  activeUsersLast7d: number;
  aiLast30d: {
    calls: number;
    tokensIn: number | null;
    tokensOut: number | null;
    costUsd: number | null;
    cacheHits: number;
  };
}): UsageMetrics {
  const bySeverity = { ...EMPTY_SEVERITY };
  let findingsTotal = 0;
  for (const row of input.findingsLast30d) {
    const tilt = row.severity as SeverityIntelligence;
    const n = row.n ?? 0;
    if (tilt in bySeverity) {
      bySeverity[tilt] += n;
      findingsTotal += n;
    }
  }

  return {
    totalUsers: input.totalUsers ?? 0,
    totalProjects: input.totalProjects ?? 0,
    auditsLast30d: input.auditsLast30d ?? 0,
    findingsLast30d: findingsTotal,
    findingsBySeverity: bySeverity,
    activeUsersLast7d: input.activeUsersLast7d ?? 0,
    aiCallsLast30d: input.aiLast30d?.calls ?? 0,
    aiTokensLast30d: {
      in: input.aiLast30d?.tokensIn ?? 0,
      out: input.aiLast30d?.tokensOut ?? 0,
    },
    aiCostUsdLast30d: input.aiLast30d?.costUsd ?? 0,
    aiCacheHitsLast30d: {
      hits: input.aiLast30d?.cacheHits ?? 0,
      total: input.aiLast30d?.calls ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** → `pnpm vitest run src/server/admin/usage-metrics.test.ts` → PASS 2/2.

- [ ] **Step 5: Server actions** — Create `src/app/admin/usage/actions.ts`

```ts
"use server";

import { directDb } from "@/shared/db";
import {
  users,
  projects,
  auditLogs,
} from "@/shared/db/schemas";
import { intelligenceFindings } from "@/shared/db/schemas/intelligence";
import { aiUsage } from "@/shared/db/schemas/health";
import { count, gte, sql } from "drizzle-orm";
import { assertPlatformAdmin } from "@/server/auth/admin";
import {
  reduceUsageMetrics,
  type UsageMetrics,
} from "@/server/admin/usage-metrics";

const ZERO_METRICS: UsageMetrics = reduceUsageMetrics({
  totalUsers: 0,
  totalProjects: 0,
  auditsLast30d: 0,
  findingsLast30d: [],
  activeUsersLast7d: 0,
  aiLast30d: { calls: 0, tokensIn: null, tokensOut: null, costUsd: null, cacheHits: 0 },
});

export async function getUsageMetrics(): Promise<UsageMetrics> {
  // SECURITY: gate fuera del try/catch — server action invocable que no se
  // ensarta silencio si falla el gate (patrón /ai/health/actions.ts:50-53).
  await assertPlatformAdmin();

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  try {
    const [totalUsersRow, totalProjectsRow, auditsRow, findingsRows, activeRow, aiRow] =
      await Promise.all([
        directDb.select({ n: count(users.id) }).from(users),
        directDb.select({ n: count(projects.id) }).from(projects),
        directDb
          .select({ n: count(auditLogs.id) })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, since30d)),
        directDb
          .select({
            severity: sql<string>`${intelligenceFindings.severity}`,
            n: count(intelligenceFindings.id),
          })
          .from(intelligenceFindings)
          .where(gte(intelligenceFindings.createdAt, since30d))
          .groupBy(intelligenceFindings.severity),
        directDb
          .select({ n: sql<number>`count(distinct ${auditLogs.userId})` })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, since7d)),
        directDb
          .select({
            calls: count(aiUsage.id),
            tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`,
            tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`,
            costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`,
            cacheHits: sql<number>`count(${aiUsage.id}) filter (where ${aiUsage.fromCache})`,
          })
          .from(aiUsage)
          .where(gte(aiUsage.createdAt, since30d)),
      ]);

    return reduceUsageMetrics({
      totalUsers: Number(totalUsersRow[0]?.n ?? 0),
      totalProjects: Number(totalProjectsRow[0]?.n ?? 0),
      auditsLast30d: Number(auditsRow[0]?.n ?? 0),
      findingsLast30d: findingsRows.map((r) => ({
        severity: r.severity,
        n: Number(r.n ?? 0),
      })),
      activeUsersLast7d: Number(activeRow[0]?.n ?? 0),
      aiLast30d: {
        calls: Number(aiRow[0]?.calls ?? 0),
        tokensIn: Number(aiRow[0]?.tokensIn ?? 0) || null,
        tokensOut: Number(aiRow[0]?.tokensOut ?? 0) || null,
        costUsd: Number(aiRow[0]?.costUsd ?? 0) || null,
        cacheHits: Number(aiRow[0]?.cacheHits ?? 0),
      },
    });
  } catch (error) {
    console.error("[admin/usage] queries falló (zeros defensivos):", error);
    return ZERO_METRICS;
  }
}

export async function getUsageDailyAudits(): Promise<Array<{ date: string; n: number }>> {
  await assertPlatformAdmin();
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const rows = await directDb
      .select({
        date: sql<string>`to_char(date_trunc('day', ${auditLogs.createdAt}), 'YYYY-MM-DD')`,
        n: count(auditLogs.id),
      })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since30d))
      .groupBy(sql`date_trunc('day', ${auditLogs.createdAt})`)
      .orderBy(sql`date_trunc('day', ${auditLogs.createdAt}) asc`);
    return rows.map((r) => ({ date: r.date, n: Number(r.n ?? 0) }));
  } catch {
    return [];
  }
}
```

Nota: si `users.ts` exporta la tabla con otro nombre, corregir el import (ver `schemas/index.ts:22`). `auditLogs` (CRUD app) es la fuente de auditorías y de DAU — la tabla de `security_audit_logs` (eventos de request) sería ruido; así se alinea con la métrica del plan ("usuarios activos, proyectos, auditorías").

- [ ] **Step 6: Run full suite + all tests**

Run: `pnpm vitest run src/server/admin`
Expected: PASS 2/2.

- [ ] **Step 7: Commit**

```bash
git add src/server/admin/usage-metrics.ts src/server/admin/usage-metrics.test.ts src/app/admin/usage/actions.ts
git commit -m "feat(admin): metricas de uso del panel (reducer puro + server actions)"
```

---

### Task 8: Página `/admin/usage` + dashboard cliente (feature 6.5, parte UI)

**Files:**
- Create: `src/app/admin/usage/page.tsx`
- Create: `src/app/admin/usage/usage-dashboard.client.tsx`
- Create: `src/app/admin/usage/error.tsx`

**Interfaces:**
- Consumes (Task 7): `getUsageMetrics`, `getUsageDailyAudits`, `UsageMetrics`.
- Consumes (existente): `requireAdmin()` de `@/server/auth/admin`, patrón de página `/ai/health/page.tsx` (force-dynamic, auth user → redirect `/login`, `<AccessDenied />` si `!gate.ok`, `Promise.all` de actions), recharts + `useChartColors` de `@/shared/design-system` (patrón `/ai/health/health-dashboard.client.tsx`).

- [ ] **Step 1: Página** — Create `src/app/admin/usage/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { UsageDashboardLazy } from "./usage-dashboard.client";
import { requireAdmin } from "@/server/auth/admin";
import { getUsageMetrics, getUsageDailyAudits } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel de uso — StrategicAudit Pro",
  description: "Métricas de uso de la plataforma (Q4 6.5).",
};

export default async function UsagePage() {
  const { createClient } = await import("@/shared/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <main className="p-6 text-sm text-muted-foreground">
        Acceso denegado: se requiere rol admin (patrón del resto del área admin).
      </main>
    );
  }

  const [metrics, daily] = await Promise.all([
    getUsageMetrics(),
    getUsageDailyAudits(),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Panel de uso de la plataforma</h1>
      <UsageDashboardLazy metrics={metrics} daily={daily} />
    </main>
  );
}
```

- [ ] **Step 2: Dashboard cliente** — Create `src/app/admin/usage/usage-dashboard.client.tsx`

```tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChartColors } from "@/shared/design-system";
import type { UsageMetrics } from "@/server/admin/usage-metrics";

const KPI = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

function UsageDashboard({
  metrics,
  daily,
}: {
  metrics: UsageMetrics;
  daily: Array<{ date: string; n: number }>;
}) {
  const colors = useChartColors();
  const hitRate =
    metrics.aiCacheHitsLast30d.total === 0
      ? null
      : Math.round((metrics.aiCacheHitsLast30d.hits / metrics.aiCacheHitsLast30d.total) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI label="Usuarios totales" value={metrics.totalUsers} />
        <KPI label="Usuarios activos (7d)" value={metrics.activeUsersLast7d} />
        <KPI label="Proyectos" value={metrics.totalProjects} />
        <KPI label="Auditorías (30d)" value={metrics.auditsLast30d} />
        <KPI label="Findings (30d)" value={metrics.findingsLast30d} />
        <KPI label="Llamadas IA (30d)" value={metrics.aiCallsLast30d} hint={hitRate === null ? undefined : `Hit-rate caché: ${hitRate}%`} />
        <KPI
          label="Tokens IA (30d)"
          value={`${metrics.aiTokensLast30d.in} / ${metrics.aiTokensLast30d.out}`}
          hint="entrada / salida"
        />
        <KPI label="Coste IA (30d)" value={`$${metrics.aiCostUsdLast30d.toFixed(2)}`} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Auditorías por día (30d)</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="usageAudits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{ fill: colors.mutedForeground }} fontSize={11} />
              <YAxis allowDecimals={false} tick={{ fill: colors.mutedForeground }} fontSize={11} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="n"
                name="Auditorías"
                stroke={colors.primary}
                fill="url(#usageAudits)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Findings por severidad (30d)</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {(
            Object.entries(metrics.findingsBySeverity) as Array<
              [keyof UsageMetrics["findingsBySeverity"], number]
            >
          ).map(([severity, n]) => (
            <li key={severity} className="rounded-md bg-surface px-3 py-2">
              <span className="text-muted-foreground">{severity}</span>
              <span className="block text-lg font-bold">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const UsageDashboardLazy = UsageDashboard;
```

- [ ] **Step 3: error.tsx** — Create `src/app/admin/usage/error.tsx` (client boundary mínima al estilo del área admin):

```tsx
"use client";

export default function UsageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[admin/usage] boundary:", error);
  }
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">
        No se pudo cargar el panel de uso.
      </p>
      <button
        onClick={reset}
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-card/80"
      >
        Reintentar
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verificación manual + tipo**

```bash
pnpm typecheck
pnpm dev    # login como usuario admin; abrir http://localhost:3000/admin/usage
```

Expected: KPIs con datos reales (o zeros defensivos); la URL NO renderiza para usuario no-admin (pantalla de "Acceso denegado"). `useChartColors()` — si el export no existe en `@/shared/design-system`, copiar el import EXACTO usado por `src/app/ai/health/health-dashboard.client.tsx:22` (único caso de divergencia de firma permitido, reflejado en un comentario).

- [ ] **Step 5: Eslint + commit**

```bash
pnpm lint
git add src/app/admin/usage/
git commit -m "feat(admin): panel /admin/usage con KPIs y grafico dai (feature 6.5)"
```

---

### Task 9: Rollout a producción gated (CHANGE package + aprobación owner)

**Files:**
- Create: `docs/database/CHANGE-003-APPROVAL-PACKAGE.md`
- (Ejecución en prod: Owner o el agente tras aprobación explícita)

**Interfaces:**
- Consumes: migraciones del Task 4 (`2026-10-21_sprint6_indexes`) y Task 5 (`2026-10-21_partition_uptime_logs`, entry journal 64/65).
- Produces: prod con índices + particionado aplicado y verificado; checkpoints de rollback documentados.

Este task NO ejecuta nada en producción sin el sí explícito del owner EN ESTA SESIÓN. Pasos una vez aprobado:

**Criterios de rollback ESCRITOS (R1–R3, exigidos por el review del owner — sin estos, el rollback es una esperanza):**
- **R1 — Paridad de filas**: tras aplicar el particionado, `SELECT count(*)` de `uptime_logs_legacy` vs `uptime_logs` DEBE ser igual. Se mide 3 veces: al final de la migración, +1 h, +24 h. Diferencia > 0 sostenida entre lecturas → REVERT (runbook del §Rollback del CHANGE-003) y post-mortem el mismo día.
- **R2 — Escrituras vivas del cron**: confirmar que el cron de uptime (cada 15 min) está produciendo filas NUEVAS en la partición del mes en curso (`uptime_logs_2026_10`): comparar `count(*)` de la partición en t₀ y t₀+15 min; delta > 0 esperado. Dos ciclos seguidos sin delta → REVERT.
- **R3 — Señal de fallo disparadora**: (a) cualquier error de INSERT sobre `uptime_logs` en Sentry/logs de Vercel dentro de las 24 h post-cutover, o (b) fallos repetidos del task de uptime en `runs.list` de Trigger.dev. Cualquiera de las dos → REVERT. Tras un revert NO se reintenta la migración el mismo día: root cause primero, y repetir en ventana de baja.
- Toda ejecución de REVERT deja evidencia pegada en el reporte post-push (MAT-5xx) y el CHANGE-003 pasa a estado `revertido` con el motivo.

- [ ] **Step 1: CHANGE package** — Create `docs/database/CHANGE-003-APPROVAL-PACKAGE.md` (plantilla del repo: ver `docs/database/CHANGE-002-APPROVAL-PACKAGE.md`):

```markdown
# CHANGE-003 — Índices Sprint 6 + particionado uptime_logs

**Fecha**: <hoy>
**Estado**: pendiente-aprobacion
**Autor**: agente + owner
**Origen**: feature 6.1/6.3 del plan Q4 (docs/plans/IMPLEMENTATION-PLAN-2026-Q4.md)

## Cambios
1. `2026-10-21_sprint6_indexes` — CREATE INDEX IF NOT EXISTS x3 (findings
   proyecto/sev/fecha + audit user/fecha + audit fecha). Sin DDL destructivo,
   sin lock duradero (tablas < <row_count verificable> filas — medir antes).
2. `2026-10-21_partition_uptime_logs` — rename legacy → tabla particionada
   RANGE(checked_at), PK (id, checked_at), 6 particiones sep26-feb27 + trigger de
   fallback, idx re-creados, copia de datos con ORDER BY checked_at, copia de
   policies RLS + GRANTs vía pg_policies/information_schema. NO elimina nada.

## Riesgos
- B R1: tabla bloqueada durante la copia (solo el monitor de uptime escribe
  uptime_logs) — aplicar en ventana baja; rollback = renombrar de vuelta.
- B R2: PK compuesta cambia el contrato del schema — verificado en PGlite
  (tests/platform/partition-uptime-logs.test.ts) + db:drift-check verde.

## Rollback
- Índices: `DROP INDEX IF EXISTS <nombre>;` (idempotente).
- Particionado: el legacy queda INTOCTO (ningún dato perdido): rollback =
  `ALTER TABLE uptime_logs RENAME TO uptime_logs_new;
   ALTER TABLE uptime_logs_legacy RENAME TO uptime_logs;` — la app vuelve a
  escribir en la tabla original; limpiar `uptime_logs_new` cuando se pueda.

## Aprobación
- [ ] Owner OK (fecha + quien)
```

- [ ] **Step 2: Conteo y verificación previa en prod** (lecturas solas, sin escribir)

```sql
SELECT count(*) FROM uptime_logs;      -- <row_count> para el package
SELECT pg_size_pretty(pg_total_relation_size('uptime_logs'));
SELECT count(*) FROM intelligence_findings;
```

- [ ] **Step 3: Aplicar migraciones (en orden de journal)**

```bash
pnpm db:migrate        # contra DATABASE_URL de producción (carpeta drizzle)
```

Expected: los dos tags nuevos aplican sin error (`drizzle-` journal en `__drizzle_migrations`).

- [ ] **Step 4: Verificación post-push (patrón MAT-50x)**

```sql
-- particiones
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'uptime_logs%';
-- policies copiadas
SELECT policyname FROM pg_policies WHERE tablename = 'uptime_logs';
-- conteos cruzados legacy vs nueva (igual antes de drop)
SELECT (SELECT count(*) FROM uptime_logs_legacy) AS legacy,
       (SELECT count(*) FROM uptime_logs) AS nueva;
```

Expected: `legacy == nueva`, policies presentes, particiones 2026-09..2027-02 existe. Tomar sample: `SELECT * FROM uptime_logs ORDER BY checked_at DESC LIMIT 5`.

- [ ] **Step 5: Guardas de superficie contra prod**

```bash
pnpm db:rls-surface-guard --snapshot && pnpm db:index-guard && pnpm db:drift-check
```

Expected: exit 0 — el manifest RLS no detecta cambios en uptime_logs (sus policies se copia idénticas) y los índices del schema coinciden.

- [ ] **Step 6: Solo tras verificación de conteos ≥ 24h de estabilización: DROP del legacy** (procedimiento apuntado en el comment sentinela de la migración; requiere segunda confirmación del owner).

- [ ] **Step 7: Update del changelog + reporte post-push** — crear `docs/database/MAT-5xx-CHANGE-003-POST-PUSH-REPORT.md` con evidencia (salidas verbatim de Steps 3-5), siguiendo el formato de los MAT-5xx existentes, y marcar el CHANGE-003 como `aplicado`.

---

## Candados y revisión final (fuera del scope ejecutable del plan)

- **intelligence_findings** particionado: revisión con datos de campo en Q1-2027 (criterio: `pg_total_relation_size('intelligence_findings')` > 10 GB, o queries con severidad > 500 ms). Sin tarea este sprint (decisión documentada en las desviaciones).
- **H-10b**: sigue gateado a datos de campo (u 2026-10-22, antes del push del Sprint 6 si ese fecha cayese).
- **Fechas del disclaimer público** (tarea 6.0): si un entregable se retraso, mover la fecha ES TU responsabilidad explícita vía changelog público (el notice del disclaimer estipula eso).

## Self-review del plan (ejecutada al redactarlo)

1. **Cobertura**: 6.0 → Tasks 1-2 ✓ · 6.1 → Task 5 ✓ · 6.2 → Task 3 ✓ · 6.3 → Task 4 ✓ · 6.4 → Task 6 ✓ · 6.5 → Tasks 7-8 ✓ · rollout → Task 9 ✓.
2. **Placeholders**: ninguno — cada step lleva código/literal/command expected.
3. **Type consistency**: `PUBLIC_ROADMAP`/`RoadmapItem`/`ROADMAP_GROUPS` (T1→T2) ✓ · `UsageMetrics`/`reduceUsageMetrics` (T7→T8) ✓ · firmas públicas de `ai-cache.ts` invariantes en T3 ✓ · nombres de índices/migraciones idénticos entre SQL/journal/schema (T4, T5) ✓.

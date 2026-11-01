# Diseño — ISO 27001 Compliance Dashboard (MVP)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-01 |
| Estado | Aprobado por el propietario (sesión de brainstorming 2026-11-01) |
| Autor | Agent (OpenCode) con aprobación del propietario |
| Relacionados | `docs/superpowers/specs/2026-09-20-ai-features-roadmap.md` (compliance copilot ENS), `docs/improvements/BRAINSTORM-2026-10.md` B14, roadmap público item `iso27001` (objetivo 2026-11-21) |
| Versión | 1.0 |

## 1. Objetivo

Añadir a SCAUDIT un dashboard de cumplimiento ISO 27001 (Anexo A 2022) por proyecto: estado del
portfolio de 93 controles, derivado automáticamente cuando existe señal real en el producto y
completado con declaración (attestation) manual auditada cuando no la hay, con exportación de
paquete de evidencias JSON con hash de custodia.

## 2. Decisiones de diseño (aprobadas)

| Decisión | Elección |
|---|---|
| Framework inicial | ISO 27001 Anexo A (2022); estructura de datos framework-agnostic |
| Estado por control | Híbrido: señal automática + attestation manual (lo que espera un auditor) |
| Arquitectura | Enfoque A: catálogo en código + evaluación pura on-read; se persiste solo lo manual |
| Alcance iteración 1 | MVP sin PDF: datos + motor + API + tab en dashboard + evidence pack JSON |

## 3. Alcance y fuera de alcance

**Dentro**: migración `compliance_attestations`; catálogo Anexo A en código; motor puro; 3
endpoints; `ComplianceTab` en el dashboard (proyecto); i18n es/en; tests unitarios/ruta/integración;
docs de módulo; brand flag `FEATURE_COMPLIANCE`.

**Fuera de alcance (fast-follow, no se implementan aquí)**: PDF white-label de compliance
(requiere primero arreglar `primaryColor` ignorado en `src/server/reports/pdf-template.tsx`);
snapshots históricos de scorecard; catálogos ENS/NIS2/EU AI Act; connectors de evidencia externa
(GSC/GA4); badges automáticos en `OverviewTab` (los pellets estáticos actuales quedan intactos
salvo que se decida reemplazarlos en una iteración posterior).

## 4. Modelo de datos (migración 1)

Nueva tabla `compliance_attestations` (única tabla nueva; el estado automático NO se persiste):

```ts
export const complianceAttestations = pgTable("compliance_attestations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  frameworkId: text("framework_id").notNull().default("iso27001-annex-a"),
  controlCode: text("control_code").notNull(),          // "A.5.1" .. "A.8.34"
  status: complianceAttestationEnum("status").notNull(), // compliant | non_compliant | not_applicable
  note: text("note"),                                    // declaración del usuario (obligatoria para non_compliant y not_applicable)
  evidenceUrl: text("evidence_url"),                     // documento oficial (p. ej. política firmada)
  assertedBy: uuid("asserted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.frameworkId, t.controlCode),
  index("idx_compliance_attestation_project").on(t.projectId),
]);
```

- Enum `complianceAttestationEnum` en `src/shared/db/schemas/compliance.ts` (archivo nuevo; se
  re-exporta en `src/shared/db/schemas/index.ts`).
- RLS owner-only con el patrón de `0025`/`0052`: policies `USING (public.user_has_project_access(project_id))`
  para SELECT/INSERT/UPDATE/DELETE + `GRANT` DML a `authenticated`/`service_role` y
  `GRANT USAGE ON SCHEMA public`, idempotente (DROP+CREATE, markers `--> statement-breakpoint`).
  Entra como migración nueva con entrada de journal (siguiente idx).
- Validación de contenido (`zod`): `note` obligatoria cuando `status ∈ {non_compliant, not_applicable}`;
  `evidenceUrl` debe ser https si existe.

## 5. Catálogo framework-agnostic

`src/server/compliance/catalog/iso27001-annex-a.ts` (nuevo):

```ts
export interface ControlDefinition {
  code: string;                       // "A.8.16"
  theme: "a5-organizational" | "a6-people" | "a7-physical" | "a8-technological";
  titleEs: string; titleEn: string;
  signals: ControlSignal[];           // vacío = exige attestation (lo común)
}
export interface FrameworkCatalog {
  id: "iso27001-annex-a";
  labelEs: string; labelEn: string;
  controls: ControlDefinition[];      // 93 controles, contados y testeado
}
export const ISO27001_ANNEX_A: FrameworkCatalog;
```

Convenciones: `frameworkId` va en la tabla para permitir catálogos futuros (ENS, NIS2, AI Act)
sin cambios de schema. El fichero de catálogo es dato versionado con revisión manual (los 93
códigos contra la tabla del Anexo A) y test de integridad (unicidad de códigos, count = 93,
temas con los totales correctos 37/8/14/34).

## 6. Motor de evaluación (funciones puras)

`src/server/compliance/engine.ts` (nuevo, sin acceso a BD — el llamador inyecta contexto):

```ts
export type ControlStatus =
  | "compliant"          // señal auto positiva confirmada o attestation compliant
  | "non_compliant"      // señal auto negativa (findings abiertos mapeados)
  | "not_applicable"     // solo vía attestation
  | "declared"           // attestation compliant SIN señal auto que lo confirme
  | "no_signal";         // sin attestation ni señal → "pendiente de declaración" en UI

export function findingToControls(finding: FindingLike): string[];   // mapper determinista, sin sobre-afirmar
export function evaluateControlSignals(signals: ControlSignal[], ctx: EvaluationContext): AutoSignal;
export function computeControlState(auto: AutoSignal | null, attestation: AttestationDTO | null): ControlStatus;
export function buildScorecard(controls: ControlDefinition[], ctx: EvaluationContext,
  attestations: AttestationDTO[]): Scorecard;
```

Reglas honestas de MVP (lección B3 de la auditoría: nada de datos fabricados):

1. **Auto `non_compliant`**: existe ≥1 finding abierto `intelligenceFindings` mapeado por
   `findingToControls` a ese control (severidad ≥ medium). La evidencia enlaza los finding IDs.
2. **Auto `compliant` (confirmado)**: `remediationActions` con estado `verified` cuya
   `vulnerabilityTitle`/`assessmentId` está vinculado a findings mapeados al mismo control.
3. **Alcance limitado de `findingToControls`**: solo mapea por patrones de palabras clave de
   `title` + `evidence._toolId` hacia controles A.8 (y A.5.15/A.5.16 para access control) cuando
   la correspondencia es inequívoca; el resto devuelve `[]`. Un test anti-sobre-afirmación
   impide nuevos matchers sin revisión explícita.
4. **Estado final**: la attestation gana siempre a la señal auto; la UI distingue "confirmado"
   (auto+attest), "declarado" (solo attest) y "no conforme" (auto).
5. **Scorecard**: `% conformidad = compliant / (compliant + non_compliant + no_signal)`
   (excluye `not_applicable`). Veredicto reutilizando `verdictFromScore()` de
   `src/server/reports/exec-summary.ts` (≥75 ok · ≥40 warn · <40 critical).

## 7. API (sesión + `withRLS`, patrón `soc2-pack`)

| Endpoint | Método | Permiso | Respuesta |
|---|---|---|---|
| `/api/compliance/iso27001/overview?projectId=` | GET | sesión + `requireProjectPermission("report:view")` | scorecard: resumen del portfolio por theme, estado por control y evidencia de cada estado |
| `/api/compliance/iso27001/evidence-pack?projectId=` | GET | misma auth | JSON adjunto con `sha256` del hash (patrón soc2-pack): scorecard + attestations + finding refs |
| `/api/compliance/iso27001/attestation` | POST | sesión + rol admin del proyecto (patrón de escritura de remediation) | upsert por `(projectId, frameworkId, controlCode)`; rechaza sin note bajo non_compliant/no aplicable |

Errores estándar: 401 no autenticado, 403 sin permiso/rol, 404 proyecto inexistente. Sin cache
HTTP en esta iteración (estado dinámico); coste de lectura asumible (consultas de conteos con
índices por proyecto).

## 8. UI — `ComplianceTab`

- `src/features/dashboard/tabs/ComplianceTab.tsx` (nuevo), registrado en `DashboardContainer`
  tras `reports` (id `compliance`), acceso por proyecto (RLS owner).
- Cabecera: gauge de veredicto + % conformidad + veredicto (ok/warn/critical) + contador por estado.
- Tabla de controles agrupada por tema (A.5→A.8, colapsable) con filtro por estado y búsqueda de texto;
  cada fila: código, título, chip de estado (`confirmado`/`declarado`/`no conforme`/
  `no aplicable`/`sin señal`), nº de findings abiertos mapeados, acción **Declarar** (modal con
  status + nota + URL de evidencia; nota obligatoria bajo non_compliant/NA).
- Los findings mapeados enlazan al tab de intelligence existente.

## 9. Seguridad

- Acceso a lectura y escritura bajo sesión + `withRLS` (rol `authenticated`), sin Bearer API key
  en esta iteración (el patrón API-key Bearer existe en `/api/looker-studio` si se requiere en fast-follow).
- RLS owner-only en la nueva tabla; cross-tenant invisible (test de integración lo demuestra).
- No se exponen PII en el evidence-pack; hash de custodia `sha256` sobre el JSON serializado.

## 10. i18n (es/en)

Namespace `compliance` nuevo en `messages/es.json` y `messages/en.json` (títulos, chips, modal,
mensajes de empty state + "pending attestation"). Paridad `node scripts/i18n-parity.mjs` ≤ 2 %.
Los títulos de controles viven en el catálogo (`titleEs/titleEn`), NO en messages.

## 11. Testing y DoD

| ID | Requisito/test |
|---|---|
| REQ-201 | Catálogo Anexo A como código, framework-agnostic, 93 controles |
| REQ-202 | Estado por control = attestation ?? señal auto ?? no_signal (motor puro) |
| REQ-203 | Scorecard con % conformidad y veredicto (reutiliza `verdictFromScore`) |
| REQ-204 | API overview / evidencia JSON / attestation bajo sesión + permisos |
| REQ-205 | Attestation persistente con RLS owner-only y unique por (target, control) |
| REQ-206 | Tab Compliance con filtros, attest modal e i18n es/en |
| TEST-201 | Motor: 93 controles evaluables; reglas honestas; anti-sobre-afirmación del mapper |
| TEST-202 | Rutas: 401/403/404 y happy path de los 3 endpoints |
| TEST-203 | Integración (PGlite/Postgres): RLS cross-tenant invisible; upsert idempotente |
| TEST-204 | Catálogo: 93 códigos únicos, totales por tema 37/8/14/34 |

DoD: todo lo anterior verde local (`vitest run` de la zona), quality-gate `--table docs/modules ... --min 80`
PASS para `docs/modules/compliance.md`, paridad i18n OK, y CI sin nuevas zonas de fallo
(baseline: 7 verdes; los 2 rojos estructurales pre-existentes TD-20/TD-29 están fuera del
alcance de esta feature).

## 12. Fast-follows previstos (no en esta iteración)

1. PDF white-label de compliance (fix previo: aplicar `primaryColor` en `pdf-template.tsx`).
2. Tabla de snapshots puntuales si se pide histórico del % conformidad (Approach B parcial:
   una fila por evaluación global, no por control).
3. Catálogos ENS (medidas op.exp/op.fac), NIS2, EU AI Act reutilizando el mismo motor.
4. Badge consolidado en `OverviewTab` reemplazando los pellets estáticos "SOC 2".
5. Integración de los items de roadmap público `soc2pci`/`soc2prep` con el mismo motor.

## 13. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Sobre-afirmación de señales automáticas (dar como conforme algo que no se sabe) | solo 2 reglas de señal; mapper restrictivo y testado; estados "sin señal"/"declarado" explícitos en UI |
| Interpretación errónea de % con NA excluidos | definición documentada + tooltip con fórmula en el tab |
| Creencia de que el dashboard certifica certificación real | etiqueta "autoevaluación" + disclaimers en evidence-pack y tab |
| Coste de lectura on-read | consultas limitadas por projectId con índices; sin cache en MVP; medicición posterior |

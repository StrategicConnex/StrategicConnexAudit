# Archivo de diseño (histórico)

Documentos superados por [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) (v3, vigente desde ago-2026). Se conservan como referencia histórica, **no como especificación**.

| Documento | Estado |
|---|---|
| `DESIGN.md` | Sistema Apple (Black/Pale Gray, SF Pro). Reemplazado por la identidad NOC oliva/dorado/teal. |
| `SCAUDIT-THEME.md` | Theme v2 (Tailwind v4 + OKLCH, índigo/chartreuse). Reemplazado por v3 (oro/teal). Ver páginas que aún usaban v2 migradas a tokens. |
| `DESIGN_AUDIT.md` | Auditoría visual del 21-ago-2026. Sus hallazgos P0 se resolvieron en las Fases 1-5 (ver CHANGELOG). |
| `ANALISIS-PROYECTO-2026-10-19.md` | Análisis puntual del 2026-10-19 del estado del proyecto; superado por CHANGELOG + PERFORMANCE_REPORT + MASTER-INDEX B13 (2026-10-20). |
| `HALLAZGOS-BACHES-2026-10-19.md` | Hallazgos de baches UX del 2026-10-19; hallazgos resueltos o ticketados ver CHANGELOG / TECH-DEBT-REGISTER (batch B13). |

---

## `legacy-root-docs/` (2026-11-01)

Documentos de diseño de la **raíz del workspace**, movidos aquí por la consolidación del 2026-11-01. **No son especificación vigente**: la referencia de estado es [`architecture/CURRENT-STATE.md`](../architecture/CURRENT-STATE.md) y el informe integral [`MASTER-REPORT-2026-11-01.md`](../MASTER-REPORT-2026-11-01.md).

| Documento | Fecha | Estado histórico |
|---|---|---|
| `SRS-Strategic-AuditPro-V2.md` | 2026-05-06 | SRS v2 aspiracional: stack de mayo-2026 (Next 15, `src/modules/*` descartada en TD-04), TimescaleDB histórico. Los FR-* son referencia de producto. |
| `Master_Database_V2.md` | 2026-05-06 | Modelo de datos v2 (Postgres 16 + TimescaleDB + Supabase). Hoy: Drizzle ORM con 67 migraciones/78 tablas y particionado nativo de `uptime_logs`. Esquema canónico: `drizzle/schema.ts`. |
| `Plan_de_Accion_StrategicAudit_Pro_v2.md` | 2026-05-07 | Plan de ejecución de la fase de construcción (biblioteca de prompts). Ejecutado; progreso vivo en CHANGELOG + TECH-DEBT-REGISTER. |
| `Plan_de_Mejoras_StrategicAudit_Pro.md` | 2026-09-14 | Hallazgos P0 pre-auditoría sobre el producto real. Tratados por el ciclo auditoría 2026-10-11 → P0 → FINAL-SUMMARY (2026-10-18). |

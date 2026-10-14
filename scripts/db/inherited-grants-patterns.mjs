/**
 * inherited-grants-patterns.mjs — lógica pura del guard de grants heredados.
 *
 * POR QUÉ EXISTE: Supabase concede `arwdDxtm` (INSERT/SELECT/UPDATE/DELETE/
 * TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) a `anon`/`authenticated`/`service_role`
 * en CADA tabla nueva de `public` vía el event trigger `pgrst_ddl_watch`
 * (`ddl_command_end`) — verificado el 2026-10-13 contra la base: no hay entrada
 * de `public` en `pg_default_acl`, el origen es ese trigger. No hay forma de
 * arreglarlo desde las migraciones del repo (es interno de Supabase), así que
 * cada tabla sensible nueva hereda `DELETE`/`TRIGGER`/`REFERENCES` sin que nadie
 * lo pida.
 *
 * ALCANCE DEL GUARD: NO exige limpiar las 52 tablas que ya los tienen (eso es
 * deuda heredada, no una regresión nueva). Congela ese conjunto como baseline y
 * falla si una tabla NUEVA aparece con esos privilegios, o si una tabla ya
 * congelada GANA uno. Una reducción también se reporta: es una mejora que debe
 * consolidarse con `--snapshot` en su commit (mismo contrato que
 * `rls-surface-patterns.mjs`).
 */

/** Privilegios que exceden el mínimo y no deberían estar por defecto. */
export const DANGEROUS_PRIVILEGES = ["DELETE", "TRIGGER", "REFERENCES"];

/**
 * Convierte las filas de `information_schema.role_table_grants` (una por
 * privilegio) en `{ tabla: [privilegios ordenados] }`.
 */
export function buildGrantMap(rows) {
  const map = {};
  for (const row of rows) {
    const tabla = row.table_name ?? row.TABLE_NAME;
    const priv = row.privilege_type ?? row.PRIVILEGE_TYPE;
    (map[tabla] ??= []).push(priv);
  }
  for (const tabla of Object.keys(map)) map[tabla] = [...new Set(map[tabla])].sort();
  return map;
}

/**
 * Compara el baseline congelado con lo medido y devuelve SOLO las discrepancias.
 *
 * `baseline` y `current`: `{ tabla: string[] }` (privilegios peligrosos).
 * Cada discrepancia: `{ tabla, tipo: nuevo|cambio|vacio, antes, ahora,
 * ganadas?, perdidas? }`. `nuevo` = tabla ausente del baseline (posible
 * regresión); `cambio` = cambió el conjunto de privilegios; `vacio` = la tabla
 * desapareció del conteo (todos revocados → mejora).
 */
export function diffGrants(baseline, current) {
  const out = [];

  for (const [tabla, privs] of Object.entries(current)) {
    const ahora = [...privs].sort();
    const antes = baseline[tabla];
    if (antes == null) {
      out.push({ tabla, tipo: "nuevo", antes: null, ahora });
      continue;
    }
    const antesSet = new Set(antes);
    const ahoraSet = new Set(ahora);
    const ganadas = ahora.filter((p) => !antesSet.has(p));
    const perdidas = antes.filter((p) => !ahoraSet.has(p));
    if (ganadas.length > 0 || perdidas.length > 0) {
      out.push({ tabla, tipo: "cambio", antes: [...antes].sort(), ahora, ganadas, perdidas });
    }
  }

  for (const [tabla, antes] of Object.entries(baseline)) {
    if (current[tabla] !== undefined) continue;
    out.push({ tabla, tipo: "vacio", antes: [...antes].sort(), ahora: [] });
  }

  // Orden estable para que el reporte y los tests no dependan de la inserción.
  return out.sort((a, b) => (a.tabla < b.tabla ? -1 : a.tabla > b.tabla ? 1 : 0));
}

/** Formatea una discrepancia. `mejora` marca reducciones (exigen re-congelar). */
export function formatDiscrepancy(d) {
  const lista = (arr) => (arr.length ? arr.join(", ") : "ninguno");

  if (d.tipo === "nuevo") {
    return `TABLA NUEVA con grants peligrosos (sin baseline): ${d.tabla} [${lista(d.ahora)}]`;
  }
  if (d.tipo === "vacio") {
    return `PRIVILEGIOS REVOCADOS del todo: ${d.tabla} [antes ${lista(d.antes)} → ahora ninguno]  ← mejora: re-congela con --snapshot en este commit`;
  }
  const ganadas = d.ganadas ?? [];
  const perdidas = d.perdidas ?? [];
  const detalle =
    ganadas.length && perdidas.length
      ? `ganadas ${lista(ganadas)} / perdidas ${lista(perdidas)}`
      : ganadas.length
        ? `ganadas ${lista(ganadas)}`
        : `perdidas ${lista(perdidas)}`;
  const mejora = ganadas.length === 0;
  return `CAMBIO en tabla: ${d.tabla} [antes ${lista(d.antes)} → ahora ${lista(d.ahora)} (${detalle})]${mejora ? "  ← mejora: re-congela con --snapshot en este commit" : ""}`;
}

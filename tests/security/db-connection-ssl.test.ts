// @vitest-environment node
/**
 * Política TLS de los scripts de BD (`scripts/lib/db-connection.mjs`).
 *
 * El test central es una REGRESIÓN del bug reproducido el 2026-10-11: en
 * `pg@8.20.0`, `ConnectionParameters` hace
 * `config = Object.assign({}, config, parse(config.connectionString))`
 * (`pg/lib/connection-parameters.js:59-60`) y `pg-connection-string@2.12.0`
 * convierte cualquier `sslmode` en `config.ssl = {}`
 * (`pg-connection-string/index.js:77-79`). Es decir: el `sslmode` de la URL
 * PISA el objeto `ssl` que le pasas → `{ rejectUnauthorized: false }` se vuelve
 * código muerto y la conexión contra el pooler de Supabase muere con
 * «self-signed certificate in certificate chain».
 *
 * No necesita base de datos: se inspecciona el config ya normalizado por pg.
 */
import { describe, expect, it } from "vitest";
import pg from "pg";
import { connectionFor, stripSslmode } from "../../scripts/lib/db-connection.mjs";

/** DSN de forma idéntica al pooler de Supabase (usuario/clave ficticios). */
const POOLER = "postgresql://postgres.abcdef:pw@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

/** El `ssl` que pg usará de verdad, tras parsear el connectionString. */
const effectiveSsl = (config: { connectionString: string; ssl?: unknown }) =>
  new pg.Client(config as pg.ClientConfig).connectionParameters.ssl;

describe("pg pisa el objeto ssl con el sslmode de la URL (el bug que este helper evita)", () => {
  it("`sslmode=require` descarta el `ssl: { rejectUnauthorized: false }` explícito", () => {
    // Comportamiento de la librería, no del helper: si algún día pg deja de
    // descartar el objeto, este test falla a propósito y hay que revisar el
    // helper (y el comentario de `db-connection.mjs`).
    expect(effectiveSsl({ connectionString: `${POOLER}?sslmode=require`, ssl: { rejectUnauthorized: false } })).toEqual(
      {},
    );
  });

  it("`sslmode=require` ignora un `rejectUnauthorized: true` (el flag invertido del backup)", () => {
    // Antes `backup-manager.ts` calculaba `rejectUnauthorized:
    // DB_ALLOW_INSECURE_SSL === 'true'` → con la variable a `true` pedía
    // inseguridad y obtenía verificación estricta. Aquí se documenta el efecto.
    expect(effectiveSsl({ connectionString: `${POOLER}?sslmode=require`, ssl: { rejectUnauthorized: true } })).toEqual(
      {},
    );
  });
});

describe("connectionFor — política única de los scripts", () => {
  it("retira `sslmode` de la URL y acepta la cadena del pooler", () => {
    const config = connectionFor(`${POOLER}?sslmode=require`);
    expect(config.connectionString).not.toMatch(/sslmode/i);
    expect(effectiveSsl(config)).toEqual({ rejectUnauthorized: false });
  });

  it("conserva el resto de parámetros de la query, en cualquier posición", () => {
    expect(stripSslmode(`${POOLER}?sslmode=require&options=-c%20statement_timeout%3D5000`)).toBe(
      `${POOLER}?options=-c%20statement_timeout%3D5000`,
    );
    expect(stripSslmode(`${POOLER}?application_name=ci&sslmode=require`)).toBe(`${POOLER}?application_name=ci`);
    expect(stripSslmode(`${POOLER}?a=1&sslmode=require&b=2`)).toBe(`${POOLER}?a=1&b=2`);
    expect(stripSslmode(`${POOLER}?sslmode=require`)).toBe(POOLER);
    expect(stripSslmode(POOLER)).toBe(POOLER);
  });

  it("`sslmode=disable` → sin TLS (Postgres local, misma regla que drift-check)", () => {
    const config = connectionFor(`${POOLER}?sslmode=disable`);
    expect(config.ssl).toBe(false);
    expect(effectiveSsl(config)).toBe(false);
  });

  it("sin `sslmode` aplica la misma política y no toca el DSN", () => {
    const config = connectionFor(POOLER);
    expect(config.connectionString).toBe(POOLER);
    expect(effectiveSsl(config)).toEqual({ rejectUnauthorized: false });
  });

  it("no confunde un `sslmode` dentro del usuario o la contraseña", () => {
    const weird = "postgresql://u_sslmode=disable:pw@localhost:5432/db";
    expect(connectionFor(weird).ssl).toEqual({ rejectUnauthorized: false });
    expect(connectionFor(weird).connectionString).toBe(weird);
  });
});

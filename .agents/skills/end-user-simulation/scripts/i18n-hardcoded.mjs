#!/usr/bin/env node
/**
 * i18n-hardcoded — detector de cadenas en español hardcodeadas en JSX.
 *
 * POR QUÉ EXISTE: `scripts/i18n-parity.mjs` (guard de CI) sólo comprueba que
 * las claves existan igual en es.json y en.json. No puede ver que un
 * componente ignore esas claves y escriba el texto directamente en el JSX.
 * Resultado: paridad 0.00% y, aun así, la UI en inglés muestra español.
 *
 * USO:  node .agents/skills/end-user-simulation/scripts/i18n-hardcoded.mjs
 *       node .../i18n-hardcoded.mjs --max 40
 *       node .../i18n-hardcoded.mjs --fail-over 0     (para CI)
 *
 * SALE 1 si hay hallazgos por encima del umbral (útil como gate).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// Palabras/acentos que delatan un literal en español.
const ACCENTS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that',
]);
const ES_WORDS = new RegExp(
  '\\b(' +
    [
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'al', 'y', 'o', 'u', 'e',
      'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia',
      'en', 'a', 'es', 'son', 'está', 'están', 'ser', 'fue', 'hay', 'no', 'sí',
      'nuevo', 'nueva', 'crear', 'crea', 'guardar', 'cerrar', 'eliminar',
      'borrar', 'descargar', 'exportar', 'importar', 'buscar', 'busca',
      'continuar', 'volver', 'siguiente', 'anterior', 'cargando', 'error',
      'proyecto', 'proyectos', 'dominio', 'dominios', 'informe', 'informes',
      'auditoría', 'auditorías', 'salud', 'copiar', 'confirmar', 'configuración',
      'selecciona', 'seleccionar', 'todos', 'ningún', 'ninguna', 'sin',
      'página', 'páginas', 'panel', 'resumen', 'rendimiento', 'palabras',
      'clave', 'inteligencia', 'adversario', 'marketplace', 'historial',
      'organización', 'creación', 'expiración', 'verificación', 'diagnóstico',
      'instrucción', 'destino', 'agregados', 'política', 'módulo',
      'geolocalización', 'disponibles', 'detectado', 'detectados', 'variaciones',
      'snapshot', 'snapshots', 'nameservers', 'acciones', 'todavía', 'arriba',
      'progreso', 'notificación', 'notificaciones', 'leídas', 'diálogo',
      'marcador', 'categoría', 'título', 'descripción', 'buscar', 'filtro',
      'pausa', 'país', 'precisa', 'producción', 'copiloto', 'consola',
      'ejecución', 'contenido', 'principal', 'experiencia', 'aplicar',
      'facebook', 'instagram', 'tú', 'tu', 'está', 'entra', 'aquí',
    ].join('|') +
  ')\\b',
  'i'
);

// Literal de atributo: attr="texto en español"
const ATTR_RE =
  /\b(aria-label|title|placeholder|alt|label|description|tooltip)\s*=\s*"([^"{}]{2,120})"/g;
// Texto como hijo de JSX: >texto<
const TEXT_RE = />([^<>{}]{3,80})</g;

function looksSpanish(s) {
  const t = s.trim();
  if (!t) return false;
  if (/[{}<>${]/.test(t)) return false;
  if (/^[\d\s.,:%€$+-]+$/.test(t)) return false; // sólo números
  if (ACCENTS.test(t)) return true;
  if (STOP.has(t.toLowerCase())) return false;
  // Sólo si la mayoría de palabras son españolas (evita "Overview Live").
  const words = t.toLowerCase().split(/[^a-záéíóúüñ]+/).filter(Boolean);
  if (!words.length) return false;
  const es = words.filter((w) => ES_WORDS.test(w)).length;
  return es / words.length >= 0.5;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

const rows = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comentarios
    for (const re of [ATTR_RE, TEXT_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const value = (m[2] ?? m[1] ?? '').trim();
        if (!looksSpanish(value)) continue;
        rows.push({ file: rel, line: i + 1, kind: re === ATTR_RE ? 'attr' : 'text', value });
      }
    }
  });
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const byFile = new Map();
for (const r of rows) byFile.set(r.file, (byFile.get(r.file) ?? 0) + 1);

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : 25;
const failOverIdx = args.indexOf('--fail-over');
const failOver = failOverIdx >= 0 ? Number(args[failOverIdx + 1]) : null;

console.log(
  `i18n-hardcoded: ${rows.length} literal(es) en español fuera de i18n en ${byFile.size} fichero(s).`
);
console.log('');

const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [file, n] of top) console.log(`  ${String(n).padStart(3)}  ${file}`);
console.log('');

for (const r of rows.slice(0, max)) {
  console.log(`  ${r.file}:${r.line}  [${r.kind}]  ${r.value.slice(0, 70)}`);
}
if (rows.length > max) console.log(`  … y ${rows.length - max} más (usa --max N)`);

if (failOver !== null) {
  if (rows.length > failOver) {
    console.error(
      `\n❌ i18n-hardcoded: ${rows.length} > ${failOver} permitido(s). Gate falla.`
    );
    process.exit(1);
  }
  console.log(`\n✅ i18n-hardcoded OK (${rows.length} <= ${failOver}).`);
}

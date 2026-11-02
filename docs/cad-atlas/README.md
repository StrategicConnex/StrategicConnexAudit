# Atlas CAD de SCAUDIT Pro

Diez láminas A4 con el diseño y funcionamiento del sistema, dibujadas a partir del código y de los ADR del repositorio. Estilo plano técnico (marco con zonas, cajetín, cotas, retícula y leyenda).

## Descargas

| # | Lámina | PNG (300 dpi) | PDF A4 | DXF (mm) |
|---|--------|---------------|--------|----------|
| 00 | Carátula, índice, leyenda y métricas del build | [PNG](SCAUDIT-CAD-00-CARATULA.png) | [PDF](SCAUDIT-CAD-00-CARATULA.pdf) | [DXF](SCAUDIT-CAD-00-CARATULA.dxf) |
| 01 | Contexto C4 L1 | [PNG](SCAUDIT-CAD-01-CONTEXTO.png) | [PDF](SCAUDIT-CAD-01-CONTEXTO.pdf) | [DXF](SCAUDIT-CAD-01-CONTEXTO.dxf) |
| 02 | Capas y contenedores C4 L2 | [PNG](SCAUDIT-CAD-02-CAPAS.png) | [PDF](SCAUDIT-CAD-02-CAPAS.pdf) | [DXF](SCAUDIT-CAD-02-CAPAS.dxf) |
| 03 | Motor de inteligencia (pipeline) | [PNG](SCAUDIT-CAD-03-MOTOR.png) | [PDF](SCAUDIT-CAD-03-MOTOR.pdf) | [DXF](SCAUDIT-CAD-03-MOTOR.dxf) |
| 04 | Pool de IA (routing y failover) | [PNG](SCAUDIT-CAD-04-POOL-IA.png) | [PDF](SCAUDIT-CAD-04-POOL-IA.pdf) | [DXF](SCAUDIT-CAD-04-POOL-IA.dxf) |
| 05 | Modelo de datos (ERD) | [PNG](SCAUDIT-CAD-05-DATOS.png) | [PDF](SCAUDIT-CAD-05-DATOS.pdf) | [DXF](SCAUDIT-CAD-05-DATOS.dxf) |
| 06 | Seguridad y fronteras de confianza | [PNG](SCAUDIT-CAD-06-SEGURIDAD.png) | [PDF](SCAUDIT-CAD-06-SEGURIDAD.pdf) | [DXF](SCAUDIT-CAD-06-SEGURIDAD.dxf) |
| 07 | Reglas de oro (constitución) | [PNG](SCAUDIT-CAD-07-REGLAS.png) | [PDF](SCAUDIT-CAD-07-REGLAS.pdf) | [DXF](SCAUDIT-CAD-07-REGLAS.dxf) |
| 08 | Operación, jobs y observabilidad | [PNG](SCAUDIT-CAD-08-OPERACION.png) | [PDF](SCAUDIT-CAD-08-OPERACION.pdf) | [DXF](SCAUDIT-CAD-08-OPERACION.dxf) |
| 09 | Selección de framework | [PNG](SCAUDIT-CAD-09-FRAMEWORK.png) | [PDF](SCAUDIT-CAD-09-FRAMEWORK.pdf) | [DXF](SCAUDIT-CAD-09-FRAMEWORK.dxf) |

- **Atlas completo:** [SCAUDIT-ATLAS-CAD-COMPLETO.pdf](SCAUDIT-ATLAS-CAD-COMPLETO.pdf) (10 páginas A4).
- **Galería navegable:** abrir [index.html](index.html).

Cada PNG mide 2481 × 3509 px (A4 a 300 dpi). Cada PDF es A4 vectorial (210 × 297 mm), listo para imprimir.

## Formato DXF

Los diez DXF son geometría CAD real, no una captura: **milímetros**, con el origen en la esquina inferior izquierda, `$INSUNITS = 4` y `$ACADVER = AC1015` (AutoCAD 2000), que es el dialecto que leen AutoCAD, LibreCAD, QCAD, FreeCAD, Fusion 360, BricsCAD e Inkscape.

- **Capas por color**: `INK`, `SOFT`, `FAINT`, `GOLD`, `TEAL`, `RED`, `GREEN`, `BLUE`, `PAPER`, `CARD`, `SHADE`, cada una con su índice ACI y su grosor.
- **Entidades**: `LINE`, `LWPOLYLINE` (cajas y trazados, con arcos ya convertidos a polilínea), `SOLID` (rellenos y puntas de flecha), `ELLIPSE` y `TEXT`.
- **Textos**: alto en milímetros, estilo `MONO`, alineación tomada de la lámina y rotación real (por ejemplo las cotas verticales). Las tildes viajan en CP1252 y los glifos que esa página no tiene (→, ●, ◐, ○, ≤, ↔) como escape `\U+XXXX`, que los lectores modernos interpretan.
- **Grosores**: los válidos de DXF, cuantizados desde el trazo de la lámina.

Lo que **no** se exporta, y por qué: el fondo de papel y las tramas/texturas (`url(#…)`, retícula y achurado) son rellenos de patrón que pidió el render SVG; en CAD ese fondo no aporta y el plano sale limpio sobre blanco. La escala es 1:1 en milímetros: medir sobre el DXF da la medida real del plano.

`dxf.mjs` comprueba en cada build que el número de textos del SVG coincide con el del DXF, y `build.mjs` aborta si no.

## Origen de los datos

**Ninguna cifra está escrita a mano.** `scripts/cad-atlas/introspect.mjs` recorre el repositorio en cada build y calcula:

- **Rutas y dominios**: archivos `route.ts` bajo `src/app/api`.
- **Páginas y layouts**: `page.tsx` / `layout.tsx` bajo `src/app`.
- **Tablas y archivos de esquema**: `pgTable("…")` en `src/shared/db/schemas` (con validación de unicidad).
- **Migraciones**: archivos en `drizzle/` y entradas del journal.
- **Jobs**: archivos `.trigger.ts`, tareas `task({` y expresiones `cron`.
- **Tools**: `NATIVE_TOOLS` + `ORPHAN_DEFINITIONS` del registro único.

The lámina 00 muestra la fecha del build y el commit medido. Si el código cambia, la lámina cambia. Además `assertAtlasContracts()` hace fallar el build cuando una tabla o un dominio que la lámina dibuja deja de existir, para que el plano nunca quede mintiendo en silencio.

Contenido doctrinal: `docs/CORE_SYSTEM.md`, `docs/architecture/ADR/*`, `docs/architecture/ENTERPRISE-ARCHITECTURE.md`, `docs/architecture/SYSTEM-MAP.md` y `docs/technical-debt/TECH-DEBT-REGISTER.md`.

## Regenerar

```bash
node scripts/cad-atlas/build.mjs
```

El generador es SVG puro sobre Playwright/Chromium: `introspect.mjs` (cifras y versiones), `svg.mjs` (marco, cajetín, cotas, tablas), `sheets-core.mjs` (láminas 00–04), `sheets-sec.mjs` (05–08), `sheets-stack.mjs` (09), `dxf.mjs` (traducción SVG → DXF) y `build.mjs` (render PNG/PDF/DXF + galería). Un solo dibujo, tres salidas: raster a 300 dpi, vector para imprimir y geometría editable.

El atlas es un artefacto de build: no se edita a mano. Para cambiar un dibujo se cambia el generador; para cambiar una cifra, se cambia el código.

## Alcance

Describe el sistema tal como está en el repositorio. Las afirmaciones de operación (deploy de Trigger.dev, disponibilidad de crons) reflejan lo declarado en la documentación y los ADR; lo que no se pudo verificar desde el código se marca como supuesto en las notas de cada lámina.

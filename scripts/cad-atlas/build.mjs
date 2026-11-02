/* ═══════════════════════════════════════════════════════════════════════════
   Render del atlas CAD a A4: PNG 300 dpi + PDF vectorial por lámina y PDF
   combinado. Uso: node scripts/cad-atlas/build.mjs
   ═══════════════════════════════════════════════════════════════════════════ */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sheet00, sheet01, sheet02, sheet03, sheet04 } from "./sheets-core.mjs";
import { sheet05, sheet06, sheet07, sheet08 } from "./sheets-sec.mjs";
import { sheet09 } from "./sheets-stack.mjs";
import { introspect, assertAtlasContracts } from "./introspect.mjs";
import { svgToDxf } from "./dxf.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs", "cad-atlas");

const SHEETS = [
  ["00", "CARATULA", "Carátula e índice", sheet00],
  ["01", "01-CONTEXTO", "Contexto C4 L1", sheet01],
  ["02", "02-CAPAS", "Capas y contenedores", sheet02],
  ["03", "03-MOTOR", "Motor de inteligencia", sheet03],
  ["04", "04-POOL-IA", "Pool de IA", sheet04],
  ["05", "05-DATOS", "Modelo de datos", sheet05],
  ["06", "06-SEGURIDAD", "Seguridad", sheet06],
  ["07", "07-REGLAS", "Reglas de oro", sheet07],
  ["08", "08-OPERACION", "Operación", sheet08],
  ["09", "09-FRAMEWORK", "Selección de framework", sheet09],
];

const html = (svg) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>SCAUDIT CAD</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  svg { display:block; width:210mm; height:297mm; }
</style></head><body>${svg}</body></html>`;

const combinedHtml = (svgs) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>SCAUDIT — Atlas CAD completo</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  .page { width:210mm; height:297mm; overflow:hidden; page-break-after:always; break-after:page; }
  .page:last-child { page-break-after:auto; break-after:auto; }
  svg { display:block; width:100%; height:100%; }
</style></head><body>${svgs.map((s) => `<div class="page">${s}</div>`).join("")}</body></html>`;

async function main() {
  const m = introspect(ROOT);
  assertAtlasContracts(m);
  console.log(
    `  introspección: ${m.routes.total} rutas · ${m.pages.total} páginas · ${m.db.tables.total} tablas · ` +
      `${m.tools.total} tools · ${m.triggers.files} trigger files · commit ${m.commit}\n`,
  );

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 3.125,
  });

  const rendered = [];
  const sheetSvgs = SHEETS.map(([, , , fn]) => fn(m));

  for (const [idx, [num, slug, label]] of SHEETS.entries()) {
    const svg = sheetSvgs[idx];
    const file = `SCAUDIT-CAD-${num === "00" ? "00" : num}-${num === "00" ? "CARATULA" : slug.split("-").slice(1).join("-")}`;
    const pngPath = path.join(OUT, `${file}.png`);
    const pdfPath = path.join(OUT, `${file}.pdf`);
    const dxfPath = path.join(OUT, `${file}.dxf`);

    await page.setContent(html(svg), { waitUntil: "load" });
    // Chromium falla de forma esporádica al capturar; un reintento basta.
    for (let attempt = 1; ; attempt++) {
      try {
        await page.screenshot({ path: pngPath, fullPage: false });
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        await page.waitForTimeout(400);
      }
    }
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });

    // DXF: geometría en mm con capas por color, editable en cualquier CAD
    const dxf = svgToDxf(svg);
    fs.writeFileSync(dxfPath, dxf.content, "latin1");

    rendered.push({
      num,
      label,
      png: path.basename(pngPath),
      pdf: path.basename(pdfPath),
      dxf: path.basename(dxfPath),
      ents: dxf.stats.entities,
      layers: dxf.stats.layers,
    });
    const kb = (fs.statSync(pngPath).size / 1024).toFixed(0);
    console.log(
      `  ✓ ${num} ${label.padEnd(26)} ${path.basename(pngPath)} (${kb} KB) · dxf ${dxf.stats.entities} ent · ${dxf.stats.layers} capas`,
    );
  }

  // PDF combinado
  const svgs = sheetSvgs;
  await page.setContent(combinedHtml(svgs), { waitUntil: "load" });
  const fullPdf = path.join(OUT, "SCAUDIT-ATLAS-CAD-COMPLETO.pdf");
  await page.pdf({
    path: fullPdf,
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });

  // Galería navegable
  const cards = rendered
    .map(
      (r) => `      <figure>
        <a href="${r.png}" target="_blank"><img src="${r.png}" alt="Lámina ${r.num}: ${r.label}"/></a>
        <figcaption><b>${r.num}</b> · ${r.label}<br/><a href="${r.pdf}" download>PDF A4</a> · <a href="${r.png}" download>PNG 300 dpi</a> · <a href="${r.dxf}" download>DXF</a><br/><span class="cad">${r.ents} entidades · ${r.layers} capas</span></figcaption>
      </figure>`,
    )
    .join("\n");
  const gallery = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SCAUDIT — Atlas CAD</title>
<style>
  :root{--paper:#F3F0E6;--ink:#15160F;--gold:#8F6F24;--card:#FBFAF3}
  *{box-sizing:border-box}
  body{margin:0;background:#141510;color:var(--ink);font-family:'Segoe UI',system-ui,sans-serif}
  header{padding:42px 6vw 26px;color:var(--paper)}
  header h1{margin:0;font-size:clamp(22px,3vw,38px);letter-spacing:.4px}
  header p{margin:8px 0 0;color:#B9B49F;font-size:14px;max-width:70ch;line-height:1.55}
  header a{color:var(--gold)}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:26px;padding:0 6vw 60px}
  figure{margin:0;background:var(--card);border:1px solid #3A3B31;padding:10px}
  figure img{display:block;width:100%;height:auto;border:1px solid #D8D3BE}
  figcaption{font-size:12.5px;line-height:1.6;padding:9px 4px 3px;color:#3D3E34}
  figcaption a{color:var(--gold);text-decoration:none;font-weight:600}
  figcaption .cad{color:#6E6F60;font-size:11.5px}
</style></head>
<body>
  <header>
    <h1>STRATEGICAUDIT PRO · ATLAS CAD DEL SISTEMA</h1>
    <p>Diez láminas A4 dibujadas a partir del código: contexto, capas, pipeline de inteligencia, pool de IA, modelo de datos, seguridad, reglas de oro, operación y selección de framework. Cada PNG está a 300 dpi (2481 × 3509 px), cada PDF es A4 vectorial y cada <b>DXF</b> contiene la misma geometría en milímetros reales (210 × 297 mm), con capas por color, listo para AutoCAD, LibreCAD, QCAD o FreeCAD.</p>
    <p>Cifras calculadas en el build del ${m.date} (commit ${m.commit}): ${m.routes.total} rutas · ${m.pages.total} páginas · ${m.db.tables.total} tablas · ${m.tools.total} tools · ${m.triggers.files} archivos de trigger.</p>
    <p><a href="SCAUDIT-ATLAS-CAD-COMPLETO.pdf" download>Descargar el atlas completo (PDF, 9 páginas)</a></p>
  </header>
  <main>
${cards}
  </main>
</body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), gallery, "utf8");

  await browser.close();
  console.log(`\n  PDF combinado: ${path.basename(fullPdf)} (${(fs.statSync(fullPdf).size / 1024).toFixed(0)} KB)`);
  console.log(`  Galería:       docs/cad-atlas/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import {
  MITRE_MAPPING,
  MITRE_TACTICS,
  getMitreCoverage,
  getToolsByTactic,
  type MitreTechnique,
} from "@/server/intelligence/mitre/mapping";

// NOTE: intentionally NOT force-static — the CSP nonce (src/proxy.ts) requires
// dynamic rendering so Next.js can apply the per-request nonce to inline scripts.


// ─── Tactic color mapping ─────────────────────────────────────────────────────

const TACTIC_COLORS: Record<string, { bar: string; text: string; light: string }> = {
  Reconnaissance:       { bar: "bg-blue-500",   text: "text-blue-400",   light: "bg-blue-500/10" },
  "Resource Development": { bar: "bg-purple-500", text: "text-purple-400", light: "bg-purple-500/10" },
  Discovery:           { bar: "bg-cyan-500",   text: "text-cyan-400",   light: "bg-cyan-500/10" },
  Collection:          { bar: "bg-indigo-500",  text: "text-indigo-400",  light: "bg-indigo-500/10" },
  "Command and Control": { bar: "bg-violet-500",  text: "text-violet-400", light: "bg-violet-500/10" },
};

function getColor(tactic: string) {
  return TACTIC_COLORS[tactic] || { bar: "bg-zinc-500", text: "text-zinc-400", light: "bg-zinc-500/10" };
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function buildCoverageData() {
  const coverage = getMitreCoverage();

  // Map tactic → tools + techniques
  const tactics = MITRE_TACTICS.filter((t) => coverage.toolsPerTactic[t.name]);
  const tacticData = tactics.map((tactic) => {
    const toolIds = getToolsByTactic(tactic.name);
    const techniques = new Map<string, MitreTechnique>();
    for (const toolId of toolIds) {
      const t = MITRE_MAPPING[toolId];
      if (t) for (const tech of t) techniques.set(tech.id, tech);
    }
    return {
      tactic,
      toolCount: toolIds.length,
      techniqueCount: techniques.size,
      tools: toolIds,
      techniques: Array.from(techniques.values()),
    };
  });

  const maxTools = Math.max(...tacticData.map((d) => d.toolCount), 1);

  // All unique techniques
  const allTechniques = new Map<string, { technique: MitreTechnique; tools: string[] }>();
  for (const [toolId, techs] of Object.entries(MITRE_MAPPING)) {
    for (const tech of techs) {
      if (!allTechniques.has(tech.id)) {
        allTechniques.set(tech.id, { technique: tech, tools: [] });
      }
      allTechniques.get(tech.id)!.tools.push(toolId);
    }
  }

  return { coverage, tacticData, maxTools, allTechniques: Array.from(allTechniques.values()) };
}

// ─── SVG Mini Donut ───────────────────────────────────────────────────────────

function MiniDonut({ value, max, color }: { value: number; max: number; color: string }) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="oklch(0.2 0 0)" strokeWidth={5} />
      <circle
        cx={36} cy={36} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90, 36, 36)"
        className="transition-all duration-1000"
      />
      <text x={36} y={36} textAnchor="middle" dominantBaseline="central"
        className="fill-zinc-100 text-[13px] font-bold font-mono">
        {value}
      </text>
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MitreCoveragePage() {
  const { coverage, tacticData, maxTools, allTechniques } = buildCoverageData();

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-blue-500/20">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-[#070707]">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🎯</span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                MITRE ATT&CK Coverage
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Mapeo de herramientas de inteligencia contra el framework MITRE ATT&CK Enterprise v15
              </p>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* ═══════════════════════════════════════════════════════════════
           Section 1: Global Summary (3 stat cards)
           ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Total Techniques */}
            <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-6 flex items-center gap-5">
              <MiniDonut value={coverage.totalTechniques} max={coverage.totalTechniques} color="oklch(0.55 0.15 260)" />
              <div>
                <p className="text-2xl font-bold text-blue-400 font-mono">{coverage.totalTechniques}</p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Técnicas MITRE Cubiertas</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  De 700+ técnicas en MITRE ATT&CK Enterprise v15
                </p>
              </div>
            </div>

            {/* Total Tactics */}
            <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-6 flex items-center gap-5">
              <MiniDonut value={coverage.totalTactics} max={14} color="oklch(0.6 0.15 300)" />
              <div>
                <p className="text-2xl font-bold text-purple-400 font-mono">{coverage.totalTactics}</p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Tácticas Alcanzadas</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  De 14 tácticas en la matriz Enterprise
                </p>
              </div>
            </div>

            {/* Total Tools */}
            <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-6 flex items-center gap-5">
              <MiniDonut value={coverage.totalTools} max={coverage.totalTools} color="oklch(0.65 0.12 180)" />
              <div>
                <p className="text-2xl font-bold text-cyan-400 font-mono">{coverage.totalTools}</p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Herramientas de Escaneo</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Cada una mapeada a 1+ técnica MITRE
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
           Section 2: Tools per Tactic (Horizontal Bar Chart)
           ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[11px]">📊</span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Cobertura por Táctica</h2>
              <p className="text-[10px] text-zinc-500">Cantidad de herramientas de escaneo que aportan a cada táctica MITRE</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {tacticData.map(({ tactic, toolCount, techniqueCount, techniques }) => {
              const c = getColor(tactic.name);
              const pct = Math.round((toolCount / maxTools) * 100);
              return (
                <details key={tactic.id} className="group bg-zinc-900/40 border border-zinc-800/40 rounded-lg overflow-hidden transition-all duration-200 hover:border-zinc-700/60">
                  <summary className="flex items-center gap-4 px-5 py-3.5 cursor-pointer list-none hover:bg-zinc-800/20 transition-colors select-none">
                    {/* Tactic badge */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.bar}`} />

                    {/* Tactic name */}
                    <span className="text-sm font-medium text-zinc-200 min-w-[160px]">{tactic.name}</span>

                    {/* Bar */}
                    <div className="flex-1 h-4 bg-zinc-800/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${c.bar} rounded-full transition-all duration-700 opacity-80`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Numbers */}
                    <div className="flex items-center gap-4 shrink-0 text-xs">
                      <span className="font-mono font-bold text-zinc-300 min-w-[3ch] text-right">{toolCount}</span>
                      <span className="text-zinc-600">tools</span>
                      <span className="font-mono text-zinc-500 min-w-[3ch] text-right">{techniqueCount}</span>
                      <span className="text-zinc-600">técnicas</span>
                    </div>

                    {/* Expand indicator */}
                    <span className="text-zinc-600 text-xs group-open:rotate-180 transition-transform duration-200 shrink-0">
                      ▼
                    </span>
                  </summary>

                  {/* Expanded content: tool list + technique cards */}
                  <div className="border-t border-zinc-800/40 px-5 py-4 space-y-4 bg-zinc-900/20">
                    {/* Technique badges */}
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2.5">
                        Técnicas MITRE ({techniques.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {techniques.map((tech) => (
                          <a
                            key={tech.id}
                            href={tech.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors hover:brightness-110 ${getColor(tech.tactic).light} ${getColor(tech.tactic).text} border-zinc-700/50 hover:border-zinc-600`}
                          >
                            <span className="font-mono font-bold text-[10px]">{tech.id}</span>
                            <span className="opacity-70">·</span>
                            <span>{tech.name.split("/").pop()?.trim() || tech.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* Tools list */}
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                        Herramientas ({toolCount})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {tacticData
                          .find((d) => d.tactic.id === tactic.id)
                          ?.tools.map((toolId) => (
                            <span
                              key={toolId}
                              className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-800/40 border border-zinc-800/30"
                            >
                              {toolId}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
           Section 3: Technique Detail Table
           ═══════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[11px]">📋</span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Catálogo Completo de Técnicas</h2>
              <p className="text-[10px] text-zinc-500">Todas las técnicas MITRE cubiertas con herramientas asociadas</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900/80 border-b border-zinc-800/60">
                  <th className="text-left py-3 px-4 text-zinc-500 font-semibold tracking-wider uppercase text-[10px]">Técnica</th>
                  <th className="text-left py-3 px-4 text-zinc-500 font-semibold tracking-wider uppercase text-[10px]">Nombre</th>
                  <th className="text-left py-3 px-4 text-zinc-500 font-semibold tracking-wider uppercase text-[10px]">Táctica</th>
                  <th className="text-left py-3 px-4 text-zinc-500 font-semibold tracking-wider uppercase text-[10px]">Herramientas</th>
                  <th className="text-left py-3 px-4 text-zinc-500 font-semibold tracking-wider uppercase text-[10px]">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {allTechniques.map(({ technique: tech, tools }) => (
                  <tr key={tech.id} className="hover:bg-zinc-800/20 transition-colors group">
                    <td className="py-3 px-4">
                      <a
                        href={tech.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-mono font-bold text-[11px] ${getColor(tech.tactic).text} hover:underline`}
                      >
                        {tech.id}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-zinc-200 font-medium whitespace-nowrap">{tech.name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${getColor(tech.tactic).light} ${getColor(tech.tactic).text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${getColor(tech.tactic).bar}`} />
                        {tech.tactic}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {tools.slice(0, 4).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-500 bg-zinc-800/40 border border-zinc-800/30">
                            {t}
                          </span>
                        ))}
                        {tools.length > 4 && (
                          <span className="text-[9px] text-zinc-600 px-1.5 py-0.5">+{tools.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 max-w-[300px] truncate" title={tech.description}>
                      {tech.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
           Section 4: Legend / Notes
           ═══════════════════════════════════════════════════════════════ */}
        <section className="pb-12">
          <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-6 text-xs text-zinc-500 space-y-2">
            <p className="flex items-center gap-2">
              <span className="text-zinc-600">🔗</span>
              Todos los IDs de técnica enlazan a la documentación oficial de{" "}
              <a href="https://attack.mitre.org/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                MITRE ATT&CK
              </a>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-zinc-600">📊</span>
              {coverage.totalTechniques} técnicas únicas cubiertas por {coverage.totalTools} herramientas en {coverage.totalTactics} tácticas.
              Las herramientas se asignan manualmente según su propósito de detección.
            </p>
            <p className="flex items-center gap-2">
              <span className="text-zinc-600">🔄</span>
              El mapeo se actualiza cuando se agregan nuevas herramientas de escaneo. Fuente:{" "}
              <code className="text-zinc-400 font-mono text-[10px] bg-zinc-800/40 px-1.5 py-0.5 rounded">src/shared/data/mitre-mapping.ts</code>
            </p>
          </div>
        </section>

      </main>
    </div>
  );
}

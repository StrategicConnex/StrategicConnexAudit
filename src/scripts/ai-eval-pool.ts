/**
 * ai-eval-pool.ts — Runner MANUAL del eval continuo del pool (Sprint 4 #8, NO corre en CI).
 *
 * Ejecuta el golden dataset contra modelos CONCRETOS del pool y persiste cada
 * fila en ai_eval_results con su prompt_version. Consume llamadas del free-tier.
 *
 * Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local src/scripts/ai-eval-pool.ts [N] [--model <slug|all>]
 *   npx tsx --conditions=react-server --env-file=.env.local src/scripts/ai-eval-pool.ts --report
 *   npx tsx --conditions=react-server --env-file=.env.local src/scripts/ai-eval-pool.ts --propose
 *
 * Notas:
 *   - `--conditions=react-server` neutraliza el paquete `server-only` fuera de Next.
 *   - Sin --model evalúa solo el primer modelo del pool (presupuesto acotado).
 *   - N acota casos (rotación manual); sin N, dataset completo (10 casos).
 */
import {
  runModelEval,
  evalReportSince,
  proposeAdversaryChain,
  EVAL_MODELS,
  EVAL_PASS_THRESHOLD,
} from "@/server/ai/eval-runner";
import type { GoldenCase } from "@/server/ai/eval/triage-scorer";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  if (process.argv.includes("--report")) {
    const rows = await evalReportSince(45);
    console.table(rows.map((r) => ({ ...r, lastRun: r.lastRun?.toISOString?.() ?? r.lastRun })));
    return;
  }
  if (process.argv.includes("--propose")) {
    const p = await proposeAdversaryChain({ minRuns: 10, days: 45 });
    console.log("Cadena actual:");
    p.current.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    console.log("Propuesta:");
    p.proposed.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    for (const r of p.reasons) console.log(`  · ${r}`);
    if (p.proposed.join() !== p.current.join()) {
      console.log("\nPara aplicar: edita TASK_ROUTING[\"adversary-analysis\"] en src/server/ai/ai-router.ts");
    }
    return;
  }

  const modelArgIdx = process.argv.indexOf("--model");
  const modelArg =
    modelArgIdx !== -1 ? (process.argv[modelArgIdx + 1] ?? undefined) : undefined;
  const models: string[] = !modelArg
    ? EVAL_MODELS.slice(0, 1)
    : modelArg === "all"
      ? [...EVAL_MODELS]
      : [modelArg];
  const limitArg = Number(process.argv.find((a) => /^\d+$/.test(a)));
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 10;

  const golden = JSON.parse(
    readFileSync(join(root, "src/server/ai/eval/adversary-golden.json"), "utf8")
  ) as { cases: GoldenCase[] };

  console.log(`Eval del pool: ${models.length} modelo(s) × ${Math.min(limit, golden.cases.length)} caso(s)`);
  for (const model of models) {
    const res = await runModelEval(model, { cases: golden.cases.slice(0, limit) });
    console.log(`\n=== ${model} ===`);
    for (const r of res.results) {
      const mark = r.errored ? "ERR " : r.passed ? "PASS" : "FAIL";
      console.log(`  ${mark} ${r.caseId} → ${r.score} (${r.latencyMs ?? "?"}ms)${r.detail ? ` · ${r.detail.slice(0, 90)}` : ""}`);
    }
    console.log(`  avg ${res.avgScore} · ok ${res.okCalls}/${res.results.length} (umbral ${EVAL_PASS_THRESHOLD})`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

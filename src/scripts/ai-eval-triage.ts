/**
 * ai-eval-triage.ts — Runner MANUAL del harness de eval (P2-2, NO corre en CI).
 *
 * Ejecuta los casos dorados contra modelos EN VIVO y los puntúa con el scorer.
 * Consume llamadas del free-tier: usar con N pequeño (default 3).
 *
 * Uso:
 *   npx tsx --env-file=.env.local src/scripts/ai-eval-triage.ts [N] [--case <id>]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { triageEvidence } from "@/server/intelligence/adversary/assessment/ai-analyst";
import { scoreTriageOutput, type GoldenCase } from "@/server/ai/eval/triage-scorer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(
  readFileSync(join(root, "server/ai/eval/adversary-golden.json"), "utf8")
) as { cases: GoldenCase[] };

const onlyId = process.argv.includes("--case")
  ? process.argv[process.argv.indexOf("--case") + 1]
  : undefined;
const limitArg = Number(process.argv.find((a) => /^\d+$/.test(a) && a !== "--case"));
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 3;

const cases = golden.cases.filter((c) => !onlyId || c.id === onlyId).slice(0, limit);

async function main() {
  console.log(`Eval triage en vivo: ${cases.length} caso(s)`);
  const scores: Array<{ id: string; score: number; model: string }> = [];
  for (const c of cases) {
    try {
      const out = await triageEvidence(
        {
          target: (c.evidence.target as string) ?? "eval.invalid",
          checks: ((c.evidence.checks as Array<Record<string, unknown>>) ?? []).map((ch, i) => ({
            id: String(ch.id ?? `check-${i}`),
            status: String(ch.status ?? "vulnerable"),
            severity: (ch.severity as string) ?? null,
            summary: String(ch.summary ?? ""),
            evidence: ch.evidence,
          })),
        } as never,
        "eval-golden",
        { userId: "eval-harness" }
      );
      const s = scoreTriageOutput(c, out);
      scores.push({ id: c.id, score: s.score, model: out.modelUsed });
      console.log(`  ${s.score >= 80 ? "PASS" : "FAIL"} ${c.id} → ${s.score} (${out.modelUsed})`);
      for (const check of s.checks.filter((x) => !x.pass)) {
        console.log(`      ✗ ${check.name}${check.detail ? ` [${check.detail}]` : ""}`);
      }
    } catch (err) {
      console.log(`  ERROR ${c.id}: ${err instanceof Error ? err.message : err}`);
      scores.push({ id: c.id, score: 0, model: "error" });
    }
  }
  const avg = scores.length
    ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
    : 0;
  console.log(`Promedio: ${avg} (${scores.filter((s) => s.score >= 80).length}/${scores.length} PASS)`);
  process.exit(avg >= 80 ? 0 : 1);
}

main();

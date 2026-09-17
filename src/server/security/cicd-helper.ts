import crypto from "crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const expectedSignature = `sha256=${hmac.update(payload).digest("hex")}`;
  // timingSafeEqual requiere buffers del MISMO byte length; comparar los
  // strings crudos lanzaría RangeError cuando la firma recibida tiene una
  // longitud distinta (p.ej. firma truncada por un atacante → 500 en vez de
  // rechazo). Hashear ambos lados antes de comparar: longitudes siempre
  // iguales (32 bytes), sin filtrar la longitud de la firma esperada.
  const received = crypto.createHash("sha256").update(signature).digest();
  const expected = crypto
    .createHash("sha256")
    .update(expectedSignature)
    .digest();
  return crypto.timingSafeEqual(received, expected);
}

export function generateGithubWorkflowSnippet(webhookUrl: string): string {
  return `name: SCAUDIT Pro Security Scan

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Security Audit
        run: |
          curl -X POST "${webhookUrl}" \\
            -H "Content-Type: application/json" \\
            -H "X-SCAUDIT-Signature: \${{ secrets.SCAUDIT_WEBHOOK_SECRET }}" \\
            -d '{"commit": "\${{ github.sha }}", "ref": "\${{ github.ref }}"}'
`;
}

export function generateGitlabCiSnippet(webhookUrl: string): string {
  return `stages:
  - security

scaudit_scan:
  stage: security
  script:
    - curl -X POST "${webhookUrl}" -H "Content-Type: application/json" -H "X-SCAUDIT-Signature: $SCAUDIT_WEBHOOK_SECRET" -d "{\\"commit\\":\\"$CI_COMMIT_SHA\\"}"
  only:
    - main
`;
}

export interface GatePolicy {
  /** Máximo de issues críticas toleradas (default 0). */
  maxCritical: number;
  /** Score mínimo de salud 0-100 (default 70). */
  minScore: number;
}

export interface GateEvaluation {
  gate: "pass" | "fail";
  score: number | null;
  criticals: number;
  warnings: number;
  reasons: string[];
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  maxCritical: 0,
  minScore: 70,
};

/**
 * B-1: veredicto puro del quality gate (testeable sin DB ni red).
 * Sin auditoría completada (score null) el gate FALLA cerrado: no hay
 * evidencia de que el cambio sea seguro.
 */
export function evaluateGate(
  score: number | null,
  criticals: number,
  warnings: number,
  policy: GatePolicy = DEFAULT_GATE_POLICY
): GateEvaluation {
  const reasons: string[] = [];
  if (score === null) {
    reasons.push("Sin auditoría completada: no hay evidencia para aprobar");
  } else if (score < policy.minScore) {
    reasons.push(`Score ${score} bajo el mínimo ${policy.minScore}`);
  }
  if (criticals > policy.maxCritical) {
    reasons.push(`${criticals} issue(s) crítica(s) superan el máximo ${policy.maxCritical}`);
  }
  return {
    gate: reasons.length === 0 ? "pass" : "fail",
    score,
    criticals,
    warnings,
    reasons,
  };
}

export function generateGithubGateSnippet(webhookUrl: string, projectId: string): string {
  return `      - name: SCAUDIT quality gate
        run: |
          GATE=$(curl -s -X POST "${webhookUrl}" \\
            -H "Content-Type: application/json" \\
            -H "X-SCAUDIT-Signature: \${{ secrets.SCAUDIT_WEBHOOK_SECRET }}" \\
            -d '{"commit": "\${{ github.sha }}", "ref": "\${{ github.ref }}", "projectId": "${projectId}"}')
          echo "$GATE" | grep -q '"gate":"pass"' || (echo "$GATE"; echo "SCAUDIT gate: FAIL"; exit 1)
`;
}

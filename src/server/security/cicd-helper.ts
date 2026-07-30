import crypto from "crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const expectedSignature = `sha256=${hmac.update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
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

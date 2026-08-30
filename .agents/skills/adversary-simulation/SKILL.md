---
name: adversary-simulation
description: "Expert in the SCAUDIT adversary simulation engine: MITRE ATT&CK evaluation, adversary scenarios, sandbox executor, assessment runner, real-world testing, and threat actor profiling. Use when building or modifying adversary simulation features."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - adversary
  - mitre-attack
  - simulation
  - red-team
  - assessment
  - sandbox
  - threat-intelligence
---

# Adversary Simulation Expert

Expert in the SCAUDIT adversary simulation engine. Covers MITRE ATT&CK framework integration, adversarial scenario execution, real-world assessment, and sandboxed testing.

## When to Use This Skill

- When working with adversary scenarios (`src/server/intelligence/adversary/`)
- When modifying MITRE ATT&CK evaluation (`src/server/intelligence/adversary/mitre-eval/`)
- When building or modifying the assessment runner (`src/server/intelligence/adversary/assessment/`)
- When working with the sandbox executor
- When adding new adversary techniques or scenarios
- When modifying the adversary trigger tasks
- When reviewing the adversary catalog

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│            Adversary Simulation Engine            │
├──────────────────────────────────────────────────┤
│                                                  │
│  Trigger Tasks          Catalog                  │
│  ├─ adversary.trigger   ├─ scenario definitions  │
│  ├─ adversary-assessment.trigger                  │
│  └─ mitre-evaluation.trigger                      │
│                                                  │
│  Execution Layer                                  │
│  ├─ Scenario Runner (scenarios against targets)  │
│  ├─ Assessment Runner (real-world checks)        │
│  ├─ MITRE Runner (ATT&CK technique evaluation)  │
│  └─ Sandbox Executor (isolated execution)        │
│                                                  │
│  Analysis Layer                                   │
│  ├─ AI Analyst (finding summarization)           │
│  ├─ MITRE Analyst (coverage mapping)             │
│  └─ Summary Schema (structured output)           │
│                                                  │
│  Storage                                          │
│  ├─ intelligenceFindings (severity, evidence)    │
│  └─ intelligenceAssets (discovered assets)       │
└──────────────────────────────────────────────────┘
```

## Core Components

### Adversary Catalog (`adversary/catalog.ts`)

Registry of all available adversary scenarios and techniques.

```typescript
interface AdversaryScenario {
  id: string;
  name: string;
  description: string;
  category: "reconnaissance" | "initial-access" | "persistence" | "exfiltration" | "disruption";
  severity: "info" | "low" | "medium" | "high" | "critical";
  mitreMapping: string[];  // e.g., ["T1595", "T1592"]
  requiredConsent: boolean; // true for active testing
  checkType: "passive" | "active";
  handler: (target: string, context: ScanContext) => Promise<CheckResult>;
}
```

### Scenario Runner (`adversary/scenario-runner.ts`)

Executes predefined attack scenarios against a target.

**Workflow:**
1. Load scenario from catalog
2. Validate target and consent (`activeTestingAuthorized`)
3. Execute scenario in sandbox
4. Collect findings and evidence
5. Score and store results

**Rules:**
- NEVER execute active scenarios without `activeTestingAuthorized = true` on the project
- Always use the sandbox executor for code execution
- Log every scenario execution with full audit trail
- Set appropriate timeouts per scenario category

### Assessment Runner (`adversary/assessment/assessment-runner.ts`)

Runs comprehensive security assessments combining multiple checks.

**Assessment types:**
- `passive`: OSINT, DNS analysis, certificate inspection (no direct contact)
- `active`: Port scanning, service enumeration, vulnerability probing (requires consent)
- `real`: Actual exploitation attempts in controlled environment (requires explicit consent)

**Assessment workflow:**
```
Load Assessment Config
    → Validate Legal Consent
    → Select Checks (from assessment/checks/)
    → Execute Checks (via sandbox)
    → Aggregate Results
    → AI Analysis (ai-analyst.ts)
    → Generate Summary (summary-schema.ts)
    → Store Findings
```

### Assessment Checks (`adversary/assessment/checks/`)

Individual security checks organized by category:

- **DNS checks**: Zone transfer, subdomain takeover, DNS poisoning
- **Web checks**: Headers, CORS, CSP, information disclosure
- **SSL/TLS checks**: Certificate validity, protocol support, cipher suites
- **Infrastructure checks**: Open ports, exposed services, banner grabbing
- **Application checks**: Input validation, authentication, authorization

### MITRE ATT&CK Evaluation (`adversary/mitre-eval/`)

Maps detected weaknesses to MITRE ATT&CK techniques.

**Components:**
- `checks-map.ts`: Maps tool outputs to ATT&CK techniques
- `mitre-runner.ts`: Executes technique-specific evaluations
- `mitre-analyst.ts`: AI-powered analysis of ATT&CK coverage
- `mitre-service.ts`: Service layer for MITRE data

**ATT&CK Tactics covered:**
| Tactic | Examples |
|--------|---------|
| Reconnaissance | T1595 (Active Scanning), T1592 (Gather Victim Host Info) |
| Resource Development | T1583 (Acquire Infrastructure), T1587 (Develop Capabilities) |
| Initial Access | T1190 (Exploit Public-Facing App), T1133 (External Remote Services) |
| Execution | T1059 (Command and Scripting Interpreter) |
| Persistence | T1078 (Valid Accounts), T1136 (Create Account) |
| Privilege Escalation | T1068 (Exploitation for Privilege Escalation) |
| Defense Evasion | T1027 (Obfuscated Files), T1070 (Indicator Removal) |
| Credential Access | T1003 (OS Credential Dumping), T1110 (Brute Force) |
| Discovery | T1046 (Network Service Discovery), T1082 (System Info Discovery) |
| Lateral Movement | T1021 (Remote Services) |
| Collection | T1005 (Data from Local System) |
| Exfiltration | T1041 (Exfil Over C2 Channel) |
| Impact | T1485 (Data Destruction), T1489 (Service Stop) |

### Sandbox Executor (`adversary/sandbox-executor.ts`)

Executes adversary checks in an isolated environment.

**Rules:**
- All code execution happens in the sandbox
- Network access is restricted to the target only
- No filesystem access beyond scratch space
- Execution timeout enforced (default: 30s)
- Resource limits (memory, CPU) enforced

```typescript
const result = await sandboxExecutor.run({
  checkId: "dns-zone-transfer",
  target: "example.com",
  timeout: 30_000,
  memoryLimit: "256mb",
  networkPolicy: {
    allowedHosts: ["example.com"],
    denyInternal: true,
  },
});
```

### AI Analyst (`adversary/assessment/ai-analyst.ts`)

Uses AI to analyze raw findings and generate human-readable summaries.

- Summarizes technical findings into actionable insights
- Prioritizes findings by business impact
- Generates remediation recommendations
- Maps findings to compliance frameworks

### Summary Schema (`adversary/assessment/summary-schema.ts`)

Zod schema for structured assessment output:

```typescript
const AssessmentSummarySchema = z.object({
  target: z.string(),
  overallScore: z.number().min(0).max(100),
  riskLevel: z.enum(["critical", "high", "medium", "low", "info"]),
  findings: z.array(z.object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(["critical", "high", "medium", "low", "info"]),
    category: z.string(),
    description: z.string(),
    evidence: z.record(z.unknown()),
    recommendation: z.string(),
    mitreMapping: z.array(z.string()),
  })),
  assets: z.array(z.object({
    type: z.string(),
    value: z.string(),
    risk: z.enum(["critical", "high", "medium", "low"]),
  })),
  recommendations: z.array(z.string()),
  metadata: z.object({
    checksRun: z.number(),
    duration: z.number(),
    consentLevel: z.string(),
  }),
});
```

## Consent Model

The adversary engine has a strict consent model:

```
Project.activeTestingAuthorized
    │
    ├─ false → Only passive checks (OSINT, DNS analysis, public data)
    │
    └─ true  → Active checks allowed (port scanning, service enumeration)
               Still requires explicit consent for exploitation attempts
```

**Never bypass the consent check.** Active testing without authorization is a legal liability.

## Adding a New Adversary Scenario

1. **Define the scenario** in `catalog.ts`
2. **Create the check** in `assessment/checks/`
3. **Map to MITRE** in `mitre-eval/checks-map.ts`
4. **Write tests** co-located with the check
5. **Update the catalog index**
6. **Document** the scenario purpose and expected outcomes

## Sharp Edges

### Active testing without consent
**Problem:** Scenario executes active checks against a project with `activeTestingAuthorized = false`.
**Fix:** The policy enforcer must check consent before every active check. Add integration tests for this path.

### MITRE mapping drift
**Problem:** ATT&CK technique IDs change between framework versions.
**Fix:** Pin to a specific ATT&CK version and document it. Update mappings when upgrading.

### Sandbox escape
**Problem:** Adversary code escapes the sandbox and affects the host.
**Fix:** Use container-based isolation with minimal capabilities. Monitor resource usage.

### False positives in assessment
**Problem:** Passive checks report findings that are actually false positives.
**Fix:** Implement confidence scoring. Require multiple evidence sources for high-severity findings.

## Validation Checklist

Before modifying adversary simulation code:

- [ ] Consent check is enforced for active scenarios
- [ ] Sandbox isolation is maintained
- [ ] MITRE mappings are current and accurate
- [ ] Findings have proper evidence attached
- [ ] Risk scoring is applied consistently
- [ ] Tests cover both passive and active scenarios
- [ ] Audit trail logs all executions
- [ ] AI analyst output is validated against schema

## Related Skills
- `intelligence-engine` (core pipeline patterns)
- `cyber-intelligence` (OSINT and discovery)
- `security-auditor` (general security audit)
- `007` (comprehensive security audit)
- `threat-modeling-expert` (STRIDE/PASTA methodology)

## When to Use
- User mentions adversary simulation, red team, or attack scenarios
- User mentions MITRE ATT&CK, technique mapping, or ATT&CK evaluation
- User needs to add or modify assessment checks
- User asks about consent model or active vs passive testing

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

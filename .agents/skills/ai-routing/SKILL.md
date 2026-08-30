---
name: ai-routing
description: "Expert in SCAUDIT's AI routing system: OpenRouter integration, AI model selection, prompt engineering, cost control, and the AI copilot. Use when building or modifying AI-powered features."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - ai
  - openrouter
  - llm
  - prompt-engineering
  - copilot
  - cost-control
  - routing
---

# AI Routing Expert

Expert in SCAUDIT's AI routing system. Covers OpenRouter integration, model selection, prompt engineering, cost control, and the AI copilot interface.

## When to Use This Skill

- When working with the AI router (`src/server/ai/ai-router.ts`)
- When modifying AI tools (`src/server/ai/tools/`)
- When building or modifying the AI Copilot UI
- When creating AI-powered analysis features
- When working with the AI report generation
- When modifying AI cost controls or caching
- When building AI health checks

## Architecture

```
┌──────────────────────────────────────────────┐
│              AI Routing System                │
├──────────────────────────────────────────────┤
│                                              │
│  AI Router (src/server/ai/ai-router.ts)      │
│  ├─ Model selection (cost/quality tradeoff)  │
│  ├─ Prompt assembly                          │
│  ├─ Response parsing                         │
│  ├─ Error handling & retries                 │
│  └─ Cost tracking                            │
│                                              │
│  AI Tools (src/server/ai/tools/)             │
│  ├─ Adversary analysis tools                 │
│  ├─ Finding summarization                    │
│  └─ Report generation                        │
│                                              │
│  AI Copilot (src/features/dashboard/)        │
│  ├─ Chat interface                           │
│  ├─ Context injection                        │
│  └─ Action execution                         │
│                                              │
│  External: OpenRouter API                    │
│  ├─ Multi-model routing                      │
│  ├─ Cost optimization                        │
│  └─ Fallback models                          │
└──────────────────────────────────────────────┘
```

## AI Router (`ai-router.ts`)

Central hub for all AI operations.

### Model Selection

```typescript
const modelConfig = {
  // High quality, higher cost
  analysis: {
    model: "anthropic/claude-3.5-sonnet",
    maxTokens: 4096,
    costPer1kTokens: 0.003,
  },
  // Balanced
  summarization: {
    model: "openai/gpt-4o-mini",
    maxTokens: 2048,
    costPer1kTokens: 0.00015,
  },
  // Fast, low cost
  classification: {
    model: "openai/gpt-4o-mini",
    maxTokens: 512,
    costPer1kTokens: 0.00015,
  },
};
```

### Prompt Engineering Pattern

```typescript
async function analyzeFinding(finding: IntelligenceFinding) {
  const systemPrompt = `You are a cybersecurity expert analyzing security findings.
Analyze the following finding and provide:
1. Risk assessment (1-10)
2. Potential impact
3. Remediation steps
4. MITRE ATT&CK mapping

Respond in structured JSON.`;

  const userPrompt = `
## Finding
Title: ${finding.title}
Severity: ${finding.severity}
Description: ${finding.description}
Evidence: ${JSON.stringify(finding.evidence)}
Affected Asset: ${finding.affectedAsset}
`;

  return await aiRouter.chat({
    system: systemPrompt,
    user: userPrompt,
    model: "analysis",
    responseFormat: "json",
  });
}
```

### Cost Control

```typescript
// Per-project AI budget
const projectBudget = {
  daily: 5.00,    // $5/day
  monthly: 50.00, // $50/month
  perRequest: 0.50, // $0.50 max per request
};

// Track spending
await costTracker.record({
  projectId,
  model: "anthropic/claude-3.5-sonnet",
  inputTokens: 1500,
  outputTokens: 800,
  cost: 0.007,
});
```

### Caching

AI responses are cached to avoid redundant calls:

```typescript
// Cache key: hash(system_prompt + user_prompt + model)
const cacheKey = aiCache.generateKey({
  system: systemPrompt,
  user: userPrompt,
  model: "analysis",
});

const cached = await aiCache.get(cacheKey);
if (cached) return cached;

const response = await aiRouter.chat(params);
await aiCache.set(cacheKey, response, { ttl: 3600_000 }); // 1 hour
```

## AI Copilot

### Chat Interface

The AI copilot (`src/features/dashboard/AiCopilot.tsx`) provides:
- Natural language queries about project data
- Action execution (run scans, generate reports)
- Context-aware responses (project data injected into prompts)

### Context Injection

```typescript
const copilotContext = {
  project: {
    name: project.name,
    domain: project.domain,
    score: project.score,
  },
  recentFindings: findings.slice(0, 10),
  recentAudits: audits.slice(0, 5),
  teamMembers: members.length,
};

// Inject into system prompt
const systemPrompt = `You are the SCAUDIT AI Copilot for ${project.name}.
Project domain: ${project.domain}
Current security score: ${project.score}/100
Recent findings: ${copilotContext.recentFindings.length}

Answer questions about this project's security posture.`;
```

## AI Report Generation

AI-powered report generation (`src/app/api/ai/report/route.ts`):
1. Collects project data (audits, findings, metrics)
2. Assembles comprehensive prompt
3. Generates narrative analysis
4. Formats into structured report
5. Returns for PDF rendering

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/ai/copilot` | Chat with AI copilot |
| `/api/ai/report` | Generate AI report |
| `/api/ai/healthcheck` | Check AI service health |

## Sharp Edges

### Cost explosion
**Problem:** AI calls accumulate unexpected costs.
**Fix:** Implement per-request and daily budget limits. Monitor spending in real-time.

### Prompt injection
**Problem:** User input manipulated to extract system prompts or bypass rules.
**Fix:** Treat all user input as untrusted. Use structured delimiters. Never include raw user input in system prompts.

### Model downtime
**Problem:** Primary model becomes unavailable.
**Fix:** Implement fallback models. Cache successful responses for resilience.

### Response format inconsistency
**Problem:** AI returns unexpected JSON structure.
**Fix:** Validate all AI responses with Zod schemas before processing. Handle format errors gracefully.

## Validation Checklist

Before modifying AI code:

- [ ] Cost tracking is implemented for new AI features
- [ ] Budget limits are enforced
- [ ] User input is sanitized before prompt assembly
- [ ] Response validation with Zod is in place
- [ ] Fallback model is configured
- [ ] Caching is implemented for repeated queries
- [ ] Error handling covers API failures
- [ ] Token usage is logged for monitoring

## Related Skills
- `zod-validation-expert` (response validation)
- `intelligence-engine` (data pipeline)
- `trigger-dev` (background AI tasks)

## When to Use
- User mentions AI, LLM, OpenRouter, or copilot
- User mentions prompt engineering, AI routing, or model selection
- User needs to build or modify AI-powered features
- User mentions AI cost control or token usage

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

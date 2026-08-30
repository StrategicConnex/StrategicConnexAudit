---
name: plugin-marketplace
description: "Expert in the SCAUDIT plugin marketplace system: plugin registry, executor, types, and extension architecture. Use when building or modifying the plugin/marketplace system."
risk: unknown
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - plugins
  - marketplace
  - extensions
  - registry
  - executor
---

# Plugin Marketplace Expert

Expert in the SCAUDIT plugin marketplace system. Covers plugin registration, execution, types, and the extension architecture.

## When to Use This Skill

- When working with the plugin registry (`src/server/intelligence/plugins/registry.ts`)
- When building plugin executors (`src/server/intelligence/plugins/plugin-executor.ts`)
- When defining plugin types (`src/server/intelligence/plugins/types.ts`)
- When building the marketplace UI (MarketplaceTab)
- When integrating plugins into the intelligence pipeline
- When creating custom plugins for SCAUDIT

## Architecture

```
┌──────────────────────────────────────────────┐
│           Plugin Marketplace                  │
├──────────────────────────────────────────────┤
│                                              │
│  Plugin Registry                             │
│  ├─ Built-in plugins (core features)        │
│  ├─ Community plugins (third-party)         │
│  └─ Custom plugins (user-defined)           │
│                                              │
│  Plugin Executor                             │
│  ├─ Sandboxed execution                      │
│  ├─ Input/output validation                  │
│  ├─ Timeout enforcement                      │
│  └─ Resource limits                          │
│                                              │
│  Plugin Types                                │
│  ├─ Scanner (security scanning)              │
│  ├─ Analyzer (data analysis)                 │
│  ├─ Reporter (report generation)             │
│  ├─ Connector (external API integration)     │
│  └─ Monitor (continuous monitoring)          │
│                                              │
│  Storage: plugins table in database          │
└──────────────────────────────────────────────┘
```

## Core Components

### Plugin Types (`plugins/types.ts`)

```typescript
interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: PluginCategory;
  type: PluginType;
  config: PluginConfig;
  enabled: boolean;
  projectId: string;
}

type PluginCategory = "security" | "seo" | "performance" | "monitoring" | "reporting" | "integration";
type PluginType = "scanner" | "analyzer" | "reporter" | "connector" | "monitor";

interface PluginConfig {
  settings: Record<string, unknown>;
  schedule?: string;        // Cron expression for scheduled plugins
  triggers?: string[];      // Event triggers
  permissions: string[];    // Required permissions
}
```

### Plugin Registry (`plugins/registry.ts`)

Central catalog of available plugins.

```typescript
class PluginRegistry {
  private plugins: Map<string, PluginDefinition> = new Map();

  register(definition: PluginDefinition): void;
  unregister(pluginId: string): void;
  get(pluginId: string): PluginDefinition | undefined;
  list(category?: PluginCategory): PluginDefinition[];
  search(query: string): PluginDefinition[];
}
```

### Plugin Executor (`plugins/plugin-executor.ts`)

Runs plugins in a controlled environment.

```typescript
class PluginExecutor {
  async execute(
    plugin: Plugin,
    input: PluginInput,
    context: ExecutionContext
  ): Promise<PluginOutput> {
    // 1. Validate input against plugin schema
    // 2. Check permissions
    // 3. Set timeout
    // 4. Execute in sandbox
    // 5. Validate output
    // 6. Return result
  }
}
```

### Plugin Input/Output

```typescript
interface PluginInput {
  target: string;           // Target to analyze
  projectId: string;        // Project context
  config: Record<string, unknown>;  // Plugin-specific config
  previousResults?: unknown;  // Results from dependent plugins
}

interface PluginOutput {
  success: boolean;
  findings: PluginFinding[];
  data: Record<string, unknown>;
  metadata: {
    executionTimeMs: number;
    pluginVersion: string;
  };
  errors: string[];
}
```

## Plugin Lifecycle

```
1. Discovery    → Plugin found in registry
2. Installation → Plugin installed for project
3. Configuration → User configures plugin settings
4. Activation   → Plugin enabled and ready
5. Execution    → Plugin runs on trigger/schedule
6. Deactivation → Plugin disabled
7. Removal      → Plugin removed from project
```

## Adding a New Plugin

1. **Define the plugin** in the registry
2. **Implement the executor** logic
3. **Create input/output schemas** with Zod
4. **Add to the marketplace catalog**
5. **Write tests** (unit + integration)
6. **Document** configuration options

## Sharp Edges

### Plugin timeout
**Problem:** Plugin hangs and blocks the pipeline.
**Fix:** Always enforce execution timeout (default 30s). Use AbortController for cancellable operations.

### Resource consumption
**Problem:** Plugin consumes excessive memory or CPU.
**Fix:** Set resource limits in the executor. Monitor usage and kill runaway plugins.

### Plugin conflicts
**Problem:** Two plugins modify the same data.
**Fix:** Implement plugin dependency ordering. Use conflict detection in the executor.

## Related Skills
- `intelligence-engine` (pipeline integration)
- `trigger-dev` (background plugin execution)
- `zod-validation-expert` (input/output validation)

## When to Use
- User mentions plugins, marketplace, or extensions
- User needs to create or modify a plugin
- User asks about the plugin architecture or executor

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

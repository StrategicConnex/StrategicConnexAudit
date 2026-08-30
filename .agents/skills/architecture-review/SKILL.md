---
name: architecture-review
description: "Architecture review for Next.js modular monoliths: DDD layer separation, module boundaries, dependency flow, coupling analysis, and system design validation. Use when reviewing architecture or planning refactoring."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - architecture
  - ddd
  - modular-monolith
  - nextjs
  - design
  - refactoring
  - coupling
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Architecture Review

## Overview

Systematic architecture review for modular monolith Next.js applications. Validates DDD layer separation, module boundaries, dependency flow, coupling metrics, and system design patterns.

## When to Use

- Pre-production architecture validation
- Refactoring planning
- New module design review
- Dependency hell investigation
- Scaling preparation
- Technical debt assessment

## Review Process

### Phase 1: Module Discovery

```bash
# Map module structure
find src/modules -maxdepth 2 -type d | sort

# Map layer structure per module
for module in src/modules/*/; do
  echo "=== $(basename $module) ==="
  ls "$module" 2>/dev/null
done

# Check for DDD layers
find src/modules -maxdepth 3 -type d | grep -E "domain|application|infrastructure|presentation" | sort
```

### Phase 2: Dependency Flow Analysis

**DDD Layer Rules:**

```
presentation → application → domain ← infrastructure
     ↓              ↓            ↓
   (UI)        (Use Cases)   (Entities)
                              (No outward deps)
```

```bash
# Check for violations: domain depending on infrastructure
grep -rn "from.*infrastructure\|from.*server\|from.*app/" src/modules/*/domain/ --include="*.ts" 2>/dev/null | head -20

# Check for violations: domain depending on presentation
grep -rn "from.*components\|from.*features\|react" src/modules/*/domain/ --include="*.ts" 2>/dev/null | head -20

# Check for circular dependencies
grep -rn "from.*\.\./\.\." src/modules/ --include="*.ts" | head -30
```

**Dependency Rules:**

| Rule | Description | Violation Example |
|------|-------------|-------------------|
| Domain Isolation | Domain layer has no outward dependencies | `domain/user.ts` imports from `infrastructure/` |
| Presentation → Application | UI calls use cases, never domain directly | Component imports from `domain/` |
| Infrastructure → Domain | Infra implements domain interfaces | Infra imports from `application/` |
| No Circular Deps | Module A → Module B, never B → A | Two modules importing each other |

### Phase 3: Coupling Analysis

```bash
# Find shared types between modules
grep -rn "export.*type\|export.*interface" src/modules/ --include="*.ts" | head -30

# Find cross-module imports
grep -rn "from.*modules/" src/modules/ --include="*.ts" | head -30

# Count imports per module
for module in src/modules/*/; do
  name=$(basename $module)
  count=$(grep -rn "from.*modules/$name" src/ --include="*.ts" 2>/dev/null | wc -l)
  echo "$name: $count imports"
done
```

**Coupling Metrics:**

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Afferent coupling (Ca) — incoming deps | >2 | 1-2 | 0 (dead module) |
| Efferent coupling (Ce) — outgoing deps | <5 | 5-10 | >10 (bloated) |
| Instability (Ce/(Ca+Ce)) | 0.2-0.8 | 0-0.2 or 0.8-1.0 | 0 (rigid) or 1 (unstable) |
| Cross-module imports | <5 | 5-15 | >15 (spaghetti) |

### Phase 4: Module Completeness

**Per-Module Checklist:**

| Layer | Required Files | Purpose |
|-------|---------------|---------|
| **domain/** | entities, value-objects, interfaces | Core business logic |
| **application/** | use-cases, services | Orchestration |
| **infrastructure/** | repositories, external-services | Implementation |
| **presentation/** | components, hooks, pages | UI |

```bash
# Check module completeness
for module in src/modules/*/; do
  name=$(basename $module)
  echo "=== $name ==="
  for layer in domain application infrastructure presentation; do
    if [ -d "$module$layer" ]; then
      files=$(find "$module$layer" -name "*.ts" -o -name "*.tsx" | wc -l)
      echo "  ✓ $layer: $files files"
    else
      echo "  ✗ $layer: MISSING"
    fi
  done
done
```

### Phase 5: God Object Detection

```bash
# Find oversized files
find src/ -name "*.ts" -o -name "*.tsx" | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 300 ]; then
    echo "$lines LOC: $f"
  fi
done | sort -rn | head -20

# Find functions with too many parameters
grep -rn "function.*(.*)" src/ --include="*.ts" | grep -o "function[^(]*(.*)" | awk -F',' 'NF>4' | head -10
```

**God Object Thresholds:**

| Metric | Healthy | Warning | Split |
|--------|---------|---------|-------|
| File LOC | <300 | 300-500 | >500 |
| Function params | ≤4 | 5-6 | >6 |
| Module files | 5-30 | 30-50 | >50 |
| Imports per file | <10 | 10-15 | >15 |

### Phase 6: Separation of Concerns

```bash
# Check for mixed concerns in components
grep -rn "fetch\|axios\|supabase\|db\." src/components/ --include="*.tsx" 2>/dev/null | head -20

# Check for UI logic in API routes
grep -rn "className\|style\|<div\|<span" src/app/api/ --include="*.ts" 2>/dev/null | head -10

# Check for business logic in components
grep -rn "calculate\|validate\|transform\|process" src/components/ --include="*.tsx" 2>/dev/null | head -20
```

**Separation Rules:**
- Components: UI only, no data fetching, no business logic
- Server Actions: Orchestration only, no complex logic
- Domain: Pure business logic, no framework dependencies
- Infrastructure: Implementation details, no business rules

## Output Format

```markdown
## Architecture Review Report

### Module Map
| Module | Layers | Files | Coupling | Health |
|--------|--------|-------|----------|--------|

### Dependency Flow
[Diagram or description of actual vs intended flow]

### Violations Found
| Violation | Location | Severity | Impact |
|-----------|----------|----------|--------|

### Coupling Analysis
| Module | Ca | Ce | Instability | Status |
|--------|----|----|-------------|--------|

### Recommendations
[Prioritized refactoring actions]
```

## Architecture Health Score

| Area | Weight | Scoring |
|------|--------|---------|
| Layer separation | 25% | All layers properly isolated = 100 |
| Module boundaries | 25% | No cross-module coupling = 100 |
| Dependency direction | 20% | All deps follow DDD rules = 100 |
| File size compliance | 15% | All files <300 LOC = 100 |
| God object absence | 15% | No modules >50 files = 100 |

**Final Score** = Weighted average (0-100)

## Limitations

- Cannot assess runtime behavior without execution
- Architecture decisions involve tradeoffs not captured by metrics
- Some coupling is acceptable for practical reasons

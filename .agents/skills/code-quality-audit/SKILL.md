---
name: code-quality-audit
description: "Comprehensive code quality audit for Next.js/TypeScript projects. Reviews coding conventions, design patterns, SOLID principles, anti-patterns, dead code, and maintainability. Use when auditing code quality or requesting code reviews."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - audit
  - code-quality
  - typescript
  - nextjs
  - review
  - refactoring
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Code Quality Audit

## Overview

Systematic code quality audit for Next.js/TypeScript projects. Identifies anti-patterns, design flaws, dead code, and maintainability issues with actionable remediation.

## When to Use

- Code review requests
- Pre-deployment quality checks
- Technical debt assessment
- Onboarding quality baseline
- Refactoring planning

## Audit Process

### Phase 1: Static Analysis

```bash
# Lint check
pnpm lint 2>&1 | head -100

# Type check
npx tsc --noEmit 2>&1 | head -100

# Find dead code indicators
grep -rn "TODO\|FIXME\|HACK\|XXX\|WORKAROUND" src/ --include="*.ts" --include="*.tsx" | head -50
```

### Phase 2: Convention Review

Check adherence to project conventions:

| Area | Check |
|------|-------|
| **Naming** | camelCase functions, PascalCase components/types, UPPER_SNAKE constants |
| **Imports** | Consistent path aliases, no circular deps, barrel exports |
| **Components** | Server vs Client boundary, prop types, default exports |
| **Functions** | Single responsibility, max params (≤4), pure functions where possible |
| **Types** | No `any`, prefer interfaces over type aliases for objects, discriminated unions |
| **Error handling** | Try/catch in async, error boundaries, typed errors |

### Phase 3: Anti-Pattern Detection

Scan for common anti-patterns:

```typescript
// ❌ Anti-patterns to look for
any                          // Untyped code
// @ts-ignore / @ts-expect-error  // Type suppression
console.log() in production  // Debug leftovers
Promise.all with mutations   // Race conditions
Large components (>300 LOC)  // SRP violation
Deep nesting (>3 levels)     // Complexity
Magic numbers/strings        // Hardcoded values
Duplicate code blocks        // DRY violations
```

### Phase 4: SOLID Principles Check

| Principle | What to Audit |
|-----------|---------------|
| **S**ingle Responsibility | Each module/component does one thing |
| **O**pen/Closed | Extensible without modification |
| **L**iskov Substitution | Interfaces are correctly implemented |
| **I**nterface Segregation | Small, focused interfaces |
| **D**ependency Inversion | Depend on abstractions, not concretions |

### Phase 5: Maintainability Scoring

| Metric | Weight | Scoring |
|--------|--------|---------|
| Lint errors | 20% | 0 errors = 100, >20 = 0 |
| Type safety (`any` usage) | 20% | 0 `any` = 100, >10 = 0 |
| Dead code (TODOs/FIXMEs) | 15% | 0 = 100, >15 = 0 |
| Component size (avg LOC) | 15% | <150 = 100, >400 = 0 |
| Test coverage | 15% | >80% = 100, <30% = 0 |
| Documentation | 15% | JSDoc on exports = 100, none = 0 |

**Final Score** = Weighted average (0-100)

| Score | Verdict |
|-------|---------|
| 90-100 | Excellent — production ready |
| 70-89 | Good — minor improvements needed |
| 50-69 | Fair — significant cleanup required |
| 0-49 | Poor — major refactoring needed |

## Output Format

```markdown
## Code Quality Audit Report

### Summary
- Files analyzed: X
- Issues found: X critical, X warnings, X info
- Overall score: X/100

### Critical Issues
[List with file:line references]

### Warnings
[List with file:line references]

### Recommendations
[Prioritized action items]

### Quick Wins
[Easy fixes with high impact]
```

## Limitations

- Does not replace manual code review by domain experts
- Static analysis cannot catch all runtime issues
- Scores are guidelines, not absolute quality measures

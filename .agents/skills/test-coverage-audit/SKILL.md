---
name: test-coverage-audit
description: "Test coverage audit for Next.js projects: coverage analysis, testing gaps, test quality review, and test strategy recommendations. Use when assessing test health or planning test improvements."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - testing
  - coverage
  - vitest
  - playwright
  - test-strategy
  - quality
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Test Coverage Audit

## Overview

Comprehensive test coverage audit covering unit tests, integration tests, E2E tests, test quality, and testing strategy for Next.js projects using Vitest and Playwright.

## When to Use

- Pre-deployment quality gate
- Test strategy planning
- Coverage regression investigation
- New module test planning
- QA process improvement

## Audit Process

### Phase 1: Coverage Collection

```bash
# Run tests with coverage
pnpm test:coverage 2>&1 | tail -50

# Run E2E tests
pnpm test:e2e 2>&1 | tail -30

# Count test files
find src/ tests/ e2e/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.e2e.ts" 2>/dev/null | wc -l

# List test files
find src/ tests/ e2e/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.e2e.ts" 2>/dev/null | sort
```

### Phase 2: Coverage Analysis

```bash
# Check coverage configuration
cat vitest.config.ts 2>/dev/null | head -30

# Check coverage thresholds
grep -rn "coverage\|threshold" vitest.config.ts package.json 2>/dev/null | head -10
```

**Coverage Thresholds:**

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Statements | >80% | 60-80% | <60% |
| Branches | >75% | 50-75% | <50% |
| Functions | >80% | 60-80% | <60% |
| Lines | >80% | 60-80% | <60% |

### Phase 3: Testing Gap Analysis

```bash
# Find source files without tests
for f in $(find src/ -name "*.ts" -o -name "*.tsx" | grep -v "test\|spec\|\.d\.ts" | sort); do
  base=$(basename "$f" | sed 's/\.tsx\?$//')
  dir=$(dirname "$f")
  # Check for corresponding test file
  if ! find "$dir" -name "${base}.test.*" -o -name "${base}.spec.*" 2>/dev/null | grep -q .; then
    echo "NO TEST: $f"
  fi
done | head -30
```

**Testing Priority Matrix:**

| Priority | What to Test | Why |
|----------|-------------|-----|
| 🔴 Critical | Authentication flows | Security, data protection |
| 🔴 Critical | Payment/billing logic | Financial accuracy |
| 🔴 Critical | Data mutations (create/update/delete) | Data integrity |
| 🟡 High | API endpoints | Contract testing |
| 🟡 High | Business logic in domain layer | Core value |
| 🟠 Medium | UI components | User experience |
| 🟠 Medium | Utility functions | Reusable code |
| 🟢 Low | Config/setup code | Usually stable |

### Phase 4: Test Quality Review

```bash
# Check for flaky test patterns
grep -rn "setTimeout\|sleep\|waitFor.*timeout\|retry" e2e/ tests/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -20

# Check for snapshot overuse
find tests/ e2e/ -name "*.snap" 2>/dev/null | wc -l

# Check for test isolation issues
grep -rn "beforeAll\|beforeEach\|global\." tests/ --include="*.ts" 2>/dev/null | head -20
```

**Test Quality Checklist:**

| Quality | Check | Good | Bad |
|---------|-------|------|-----|
| **Isolation** | Tests don't depend on each other | Each test is independent | Tests run in specific order |
| **Determinism** | Same input = same output | No randomness, no time deps | `Math.random()`, `Date.now()` |
| **Speed** | Tests run quickly | <100ms per unit test | >1s per unit test |
| **Readability** | Clear test names and structure | Descriptive `it("should...")` | `it("test1")` |
| **Coverage** | Tests cover edge cases | Null, empty, boundary values | Only happy path |
| **Assertions** | Meaningful assertions | Specific value checks | `expect(result).toBeTruthy()` |
| **Mocking** | Appropriate mock usage | Mock external deps only | Mock everything |

### Phase 5: Test Strategy Audit

**Per-Layer Testing Strategy:**

| Layer | Test Type | Tool | Coverage Target |
|-------|-----------|------|-----------------|
| **Domain** | Unit | Vitest | >90% |
| **Application** | Unit + Integration | Vitest | >80% |
| **Infrastructure** | Integration | Vitest | >70% |
| **API Routes** | Contract + Integration | Vitest | >80% |
| **Server Actions** | Integration | Vitest | >70% |
| **UI Components** | Unit + Visual | Vitest + Playwright | >60% |
| **E2E Flows** | E2E | Playwright | Critical paths |

**Test Distribution Check:**

```bash
# Count tests by layer
echo "=== Unit Tests ==="
find src/modules/*/domain/ src/modules/*/application/ -name "*.test.*" 2>/dev/null | wc -l

echo "=== Integration Tests ==="
find src/modules/*/infrastructure/ src/app/api/ -name "*.test.*" 2>/dev/null | wc -l

echo "=== E2E Tests ==="
find e2e/ -name "*.e2e.*" 2>/dev/null | wc -l

echo "=== Component Tests ==="
find src/components/ src/modules/*/presentation/ -name "*.test.*" 2>/dev/null | wc -l
```

### Phase 6: Missing Test Patterns

```bash
# Check for missing error path tests
grep -rn "describe\|it\|test" tests/ --include="*.ts" | grep -i "error\|fail\|reject\|throw" | wc -l

# Check for missing edge case tests
grep -rn "describe\|it\|test" tests/ --include="*.ts" | grep -i "edge\|boundary\|empty\|null\|undefined" | wc -l

# Check for missing integration tests
grep -rn "describe\|it\|test" tests/ --include="*.ts" | grep -i "integration\|e2e\|api" | wc -l
```

## Output Format

```markdown
## Test Coverage Audit Report

### Summary
- Total test files: X
- Total test cases: X
- Coverage: X% statements, X% branches, X% functions, X% lines
- Overall test health: [Excellent/Good/Fair/Poor]

### Coverage Breakdown
| Layer | Files | Tests | Coverage | Status |
|-------|-------|-------|----------|--------|

### Testing Gaps
| Priority | File/Module | Gap Type | Recommendation |
|----------|-------------|----------|----------------|

### Test Quality Issues
| Issue | Location | Impact | Fix |
|-------|----------|--------|-----|

### Test Strategy Recommendations
[Layer-by-layer improvements]

### Implementation Plan
1. [Critical gaps first]
2. [High priority coverage]
3. [Quality improvements]
```

## Test Health Score

| Area | Weight | Scoring |
|------|--------|---------|
| Statement coverage | 25% | >80% = 100, <60% = 0 |
| Branch coverage | 20% | >75% = 100, <50% = 0 |
| Critical path E2E | 20% | All paths covered = 100 |
| Test quality (isolation, speed) | 20% | All quality checks pass = 100 |
| Error path coverage | 15% | Error paths tested = 100 |

**Final Score** = Weighted average (0-100)

## Limitations

- Coverage percentage doesn't equal test quality
- Some code (config, types) doesn't need tests
- E2E tests are expensive and slow
- Mocking can give false confidence

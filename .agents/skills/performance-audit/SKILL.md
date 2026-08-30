---
name: performance-audit
description: "Performance audit for Next.js applications: Core Web Vitals, bundle analysis, rendering performance, serverless optimization, caching strategies, and database query performance."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - performance
  - nextjs
  - react
  - web-vitals
  - bundle-size
  - caching
  - serverless
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Performance Audit

## Overview

Comprehensive performance audit covering client-side rendering, bundle size, Core Web Vitals, serverless cold starts, caching, and database query performance for Next.js applications.

## When to Use

- Performance regression investigation
- Pre-launch performance baseline
- Core Web Vitals optimization
- Bundle size reduction
- Serverless cost optimization
- Database query optimization

## Audit Process

### Phase 1: Bundle Analysis

```bash
# Analyze bundle size
ANALYZE=true pnpm build 2>&1 | tail -50

# Check for large dependencies
npx next-build-visualizer 2>/dev/null || echo "Install next-build-visualizer for visual bundle analysis"

# Check dependency count
cat pnpm-lock.yaml | grep "    " | wc -l
```

**Bundle Audit Checklist:**
- [ ] No duplicate dependencies
- [ ] Tree-shaking is effective (check named vs default imports)
- [ ] Dynamic imports for heavy components
- [ ] No unnecessary polyfills
- [ ] Images optimized (WebP/AVIF, lazy loading, proper sizing)
- [ ] Fonts optimized (subset, swap display, preloaded)
- [ ] Third-party scripts deferred/async

### Phase 2: React Rendering Performance

| Check | Tool/Method | Target |
|-------|-------------|--------|
| Unnecessary re-renders | React DevTools Profiler | 0 wasted renders |
| Large component trees | Component profiling | <16ms per frame |
| Context over-use | Context usage audit | Split by update frequency |
| State colocation | State analysis | State closest to consumer |
| Memo usage | useMemo/useCallback audit | Only where needed |

**Anti-patterns to detect:**
```typescript
// ❌ Object/array literals in render
<Component data={{ key: value }} />    // Creates new ref each render
<Component items={[...items, newItem]} />

// ❌ Inline functions in JSX
<Button onClick={() => doSomething(id)} />

// ❌ Missing keys or non-unique keys
{items.map((item, i) => <Item key={i} />)}  // Index as key = bad

// ❌ Heavy computation in render
{items.sort().filter().map(...)}  // Should be memoized
```

### Phase 3: Core Web Vitals

| Metric | Target | Common Issues |
|--------|--------|---------------|
| **LCP** | <2.5s | Slow server, large hero image, render-blocking resources |
| **INP** | <200ms | Heavy event handlers, long tasks, main thread blocking |
| **CLS** | <0.1 | Dynamic content insertion, unsized images, web fonts |

**LCP Optimization:**
- Preload critical resources
- Optimize server response time (TTFB <800ms)
- Use `next/image` with priority for LCP element
- Inline critical CSS

**CLS Optimization:**
- Set explicit `width`/`height` on images
- Use `aspect-ratio` CSS property
- Reserve space for dynamic content
- Use `font-display: swap` for web fonts

### Phase 4: Serverless & Caching

```bash
# Check for caching opportunities
grep -rn "fetch\|revalidate\|cache" src/ --include="*.ts" --include="*.tsx" | head -30

# Check for unnecessary server component re-renders
grep -rn "noStore\|no-store\|dynamic.*=.*force" src/ --include="*.ts" --include="*.tsx" | head -20
```

**Caching Strategy Audit:**

| Layer | Strategy | Check |
|-------|----------|-------|
| **ISR** | `revalidate` on pages | Every page has appropriate revalidation |
| **Route Cache** | Static generation | Pages are static by default |
| **Data Cache** | `fetch` caching | API calls are cached appropriately |
| **Full Route Cache** | Server-side caching | No unnecessary dynamic routes |
| **Client Cache** | React Query / SWR | Stale-while-revalidate configured |
| **CDN** | Edge caching | Static assets served from edge |

### Phase 5: Database Query Performance

```bash
# Check for N+1 queries
grep -rn "findMany\|findFirst\|findUnique" src/ --include="*.ts" | head -30

# Check for missing indexes (Drizzle schema)
grep -rn "index\|primaryKey\|uniqueIndex" src/ --include="*.ts" | head -20
```

**Query Audit Checklist:**
- [ ] No N+1 queries (use `include`/`with` for relations)
- [ ] Pagination on all list endpoints
- [ ] Proper indexes on filter/sort columns
- [ ] Select only needed columns
- [ ] Connection pooling configured
- [ ] Query timeout set

## Output Format

```markdown
## Performance Audit Report

### Summary
- Overall Performance Score: X/100
- Critical Issues: X
- Warnings: X

### Core Web Vitals
| Metric | Current | Target | Status |
|--------|---------|--------|--------|

### Bundle Analysis
| Category | Size | Budget | Status |
|----------|------|--------|--------|

### Serverless & Caching
[Findings and recommendations]

### Database Performance
[Query optimization findings]

### Recommendations (Priority Order)
1. [Highest impact first]
```

## Performance Budgets

| Resource | Budget |
|----------|--------|
| Total JS | <250KB gzipped |
| Total CSS | <50KB gzipped |
| First Contentful Paint | <1.8s |
| Largest Contentful Paint | <2.5s |
| Time to Interactive | <3.8s |
| Total page weight | <1MB |
| Server response time | <200ms |

## Limitations

- Bundle analysis requires a build
- Real user metrics (CrUX) differ from lab tests
- Performance varies by device/network conditions
- Serverless cold starts depend on provider configuration

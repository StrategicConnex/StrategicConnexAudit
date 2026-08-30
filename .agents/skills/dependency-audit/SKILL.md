---
name: dependency-audit
description: "Dependency audit for supply chain security: CVE scanning, outdated packages, license compliance, lockfile integrity, and dependency hygiene. Use when auditing dependencies or pre-deployment security."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - dependencies
  - security
  - cve
  - supply-chain
  - licenses
  - pnpm
  - npm
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Dependency Audit

## Overview

Comprehensive dependency audit covering vulnerability scanning, outdated packages, license compliance, lockfile integrity, and supply chain security for pnpm-based Next.js projects.

## When to Use

- Pre-deployment security check
- Regular dependency health review
- License compliance verification
- Supply chain attack prevention
- Dependency cleanup planning

## Audit Process

### Phase 1: Vulnerability Scan

```bash
# Built-in audit
pnpm audit 2>&1 | head -100

# Check for critical/high vulnerabilities
pnpm audit --audit-level=critical 2>&1 | head -50

# Alternative: npm audit (if pnpm audit unavailable)
npm audit 2>&1 | head -100
```

### Phase 2: Outdated Packages

```bash
# List outdated packages
pnpm outdated 2>&1 | head -50

# Check for major version gaps
pnpm outdated --format json 2>/dev/null | head -100 || pnpm outdated 2>&1
```

**Update Priority:**

| Priority | Condition | Action |
|----------|-----------|--------|
| 🔴 Critical | Security vulnerability | Update immediately |
| 🟡 High | Major version behind + security fix available | Update within 1 week |
| 🟠 Medium | Minor version behind | Update in next sprint |
| 🟢 Low | Patch version behind | Update opportunistically |

### Phase 3: License Compliance

```bash
# Check licenses
pnpm licenses list 2>&1 | head -50

# Find problematic licenses
pnpm licenses list --json 2>/dev/null | grep -E "GPL|AGPL|SSPL|BSL" | head -20
```

**License Risk Matrix:**

| License | Risk | Action |
|---------|------|--------|
| MIT, Apache-2.0, BSD | ✅ Safe | No action needed |
| ISC, 0BSD, Unlicense | ✅ Safe | No action needed |
| MPL-2.0 | 🟡 Moderate | Review file-level obligations |
| LGPL-2.1+ | 🟠 High | Ensure dynamic linking |
| GPL-2.0+ | 🔴 Critical | Legal review required |
| AGPL-3.0 | 🔴 Critical | Network copyleft, legal review |
| SSPL | 🔴 Critical | Commercial use restrictions |

### Phase 4: Lockfile Integrity

```bash
# Verify lockfile is up to date
pnpm install --frozen-lockfile 2>&1 | head -20

# Check for lockfile changes
git diff pnpm-lock.yaml | head -50

# Check lockfile size
wc -l pnpm-lock.yaml

# Check for phantom dependencies
grep -r "node_modules" pnpm-lock.yaml | head -5 || echo "Lockfile structure OK"
```

### Phase 5: Dependency Hygiene

```bash
# Count total dependencies
cat package.json | grep -c "\"" 2>/dev/null

# Check for duplicate packages
pnpm ls --depth=0 2>&1 | head -30

# Find unused dependencies (heuristic)
# Check if each dep is actually imported
cat package.json | python3 -c "
import json, sys
pkg = json.load(sys.stdin)
deps = list(pkg.get('dependencies', {}).keys())
for dep in deps:
    print(dep)
" 2>/dev/null | head -50
```

**Hygiene Checklist:**

| Check | Command/Method |
|-------|---------------|
| No phantom dependencies | `pnpm ls` matches package.json |
| Lockfile committed | `git status pnpm-lock.yaml` |
| No local file: dependencies | `grep "file:" package.json` |
| No git: dependencies | `grep "git+" package.json` |
| devDependencies minimal | Review for unnecessary tools |
| No duplicate packages | `pnpm dedupe --check` |
| Engines field set | Check `package.json` engines |

### Phase 6: Supply Chain Security

```bash
# Check for known malicious packages
# Reference: https://socket.dev/
pnpm audit 2>&1 | grep -i "malicious\|suspicious\|backdoor" | head -10

# Check package provenance
grep -r "integrity\|resolved" pnpm-lock.yaml | head -5

# Verify no install scripts that could be malicious
cat pnpm-lock.yaml | grep -A2 "hasInstallScript: true" | head -20
```

**Supply Chain Checklist:**
- [ ] All packages from official registry (npmjs.org)
- [ ] No typosquatting (check package names carefully)
- [ ] Packages have maintained repos
- [ ] No suspicious install scripts
- [ ] Lockfile integrity hashes present
- [ ] Package download counts reasonable
- [ ] No packages with known compromises

## Output Format

```markdown
## Dependency Audit Report

### Summary
- Total dependencies: X
- Vulnerabilities: X critical, X high, X moderate, X low
- Outdated: X major, X minor, X patch
- License issues: X

### Vulnerabilities
| Package | Severity | CVE | Description | Fix |
|---------|----------|-----|-------------|-----|

### Outdated Packages
| Package | Current | Latest | Type | Priority |
|---------|---------|--------|------|----------|

### License Issues
| Package | License | Risk | Action |
|---------|---------|------|--------|

### Supply Chain Risks
[Findings]

### Recommendations
[Prioritized action items]
```

## Dependency Budgets

| Category | Budget |
|----------|--------|
| Total dependencies | <80 |
| devDependencies | <30 |
| Direct dependencies | <50 |
| Transitive dependencies | <500 |
| Critical vulnerabilities | 0 |
| High vulnerabilities | 0 |
| Outdated major versions | <5 |

## Limitations

- Cannot detect all supply chain attacks
- License compliance requires legal review for commercial products
- Some vulnerabilities may not have fixes available

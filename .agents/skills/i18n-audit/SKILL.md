---
name: i18n-audit
description: "Internationalization (i18n) audit for Next.js applications using next-intl: translation completeness, RTL support, locale consistency, date/number formatting, and accessibility. Use when auditing localization quality."
category: audit
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - i18n
  - localization
  - translation
  - next-intl
  - accessibility
  - rtl
  - internationalization
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# i18n Audit

## Overview

Comprehensive internationalization audit for Next.js applications using next-intl. Covers translation completeness, locale consistency, RTL support, date/number formatting, and accessibility for multi-language support.

## When to Use

- Adding new language support
- Pre-launch i18n validation
- Translation gap analysis
- RTL layout testing
- Accessibility audit for multilingual content

## Audit Process

### Phase 1: Translation File Analysis

```bash
# Find all translation files
find src/ messages/ -name "*.json" -o -name "*.ts" | grep -i "locale\|i18n\|lang\|translation\|messages" | head -20

# Check message directory structure
ls messages/ 2>/dev/null

# Compare translation key counts between locales
for f in messages/*.json; do
  locale=$(basename "$f" .json)
  count=$(grep -c "\"" "$f" 2>/dev/null)
  echo "$locale: $count keys"
done
```

**Translation Completeness Check:**

```bash
# Extract keys from base locale
cat messages/en.json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
def flatten(d, prefix=''):
    keys = []
    for k, v in d.items():
        full = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            keys.extend(flatten(v, full))
        else:
            keys.append(full)
    return keys
print('\n'.join(flatten(data)))
" > /tmp/base_keys.txt 2>/dev/null

# Compare with each target locale
for f in messages/*.json; do
  locale=$(basename "$f" .json)
  [ "$locale" = "en" ] && continue
  cat "$f" | python3 -c "
import json, sys
data = json.load(sys.stdin)
def flatten(d, prefix=''):
    keys = []
    for k, v in d.items():
        full = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            keys.extend(flatten(v, full))
        else:
            keys.append(full)
    return keys
print('\n'.join(flatten(data)))
" > /tmp/target_keys.txt 2>/dev/null
  missing=$(comm -23 /tmp/base_keys.txt /tmp/target_keys.txt | wc -l)
  extra=$(comm -13 /tmp/base_keys.txt /tmp/target_keys.txt | wc -l)
  echo "$locale: missing=$missing, extra=$extra"
done
```

### Phase 2: Hardcoded String Detection

```bash
# Find hardcoded strings in JSX (should use t() function)
grep -rn "[\"'][A-Z][a-z].*[\"']" src/ --include="*.tsx" | grep -v "import\|export\|console\|test\|spec\|type\|interface" | head -30

# Find hardcoded strings in non-JSX files
grep -rn "\"[A-Z][a-zA-Z ]*\"" src/ --include="*.ts" | grep -v "import\|export\|console\|test\|type\|interface\|path\|url\|http" | head -30

# Find potential UI strings not using t()
grep -rn ">[A-Z][a-zA-Z ]*<" src/ --include="*.tsx" | grep -v "import\|export\|test\|spec\|type" | head -20
```

**Hardcoded String Patterns to Find:**

```typescript
// ❌ Hardcoded strings in JSX
<h1>Dashboard</h1>
<p>Welcome back, {user.name}</p>
<Button>Submit</Button>
<placeholder="Enter URL" />

// ✅ Using t() function
<h1>{t("dashboard.title")}</h1>
<p>{t("dashboard.welcome", { name: user.name })}</p>
<Button>{t("common.submit")}</Button>
<placeholder={t("urlInput.placeholder")} />

// ❌ Hardcoded error messages
throw new Error("Invalid URL");
return { error: "Something went wrong" };

// ✅ Using t() for errors
throw new Error(t("errors.invalidUrl"));
return { error: t("errors.generic") };
```

### Phase 3: Locale Configuration Audit

```bash
# Check i18n configuration
cat src/i18n/config.ts 2>/dev/null | head -30
cat next-intl.config.ts 2>/dev/null | head -30
cat src/i18n/request.ts 2>/dev/null | head -30

# Check locale middleware
cat src/middleware.ts 2>/dev/null | head -50
```

**Locale Configuration Checklist:**

| Area | Check |
|------|-------|
| **Supported Locales** | All intended locales are configured |
| **Default Locale** | Default locale is set (usually `en`) |
| **Locale Detection** | Browser detection + cookie persistence |
| **URL Structure** | `/en/path` or domain-based routing |
| **Locale Switcher** | UI for changing language |
| **Fallback** | Missing translations fall back to default |
| **Preloading** | `<link rel="alternate">` for SEO |

### Phase 4: Date/Number Formatting

```bash
# Find hardcoded date formats
grep -rn "toLocaleDateString\|toLocaleTimeString\|toLocaleString\|toISOString\|dateFormat\|YYYY\|MM/DD\|DD/MM" src/ --include="*.ts" --include="*.tsx" | head -20

# Find hardcoded number formats
grep -rn "toFixed\|toLocaleString\|Intl\.Number\|Intl\.DateTime" src/ --include="*.ts" --include="*.tsx" | head -20
```

**Formatting Checklist:**

```typescript
// ❌ Hardcoded date format
const formatted = date.toLocaleDateString("en-US");

// ✅ Locale-aware formatting
const formatted = date.toLocaleDateString(locale);

// ❌ Hardcoded currency
const price = `$${amount.toFixed(2)}`;

// ✅ Intl formatting
const price = new Intl.NumberFormat(locale, {
  style: "currency",
  currency: getCurrencyForLocale(locale),
}).format(amount);

// ❌ Hardcoded number separator
const num = "1,234,567";

// ✅ Locale-aware
const num = new Intl.NumberFormat(locale).format(1234567);
```

### Phase 5: RTL (Right-to-Left) Support

```bash
# Check for direction handling
grep -rn "dir=\|direction\|rtl\|ltr" src/ --include="*.tsx" --include="*.ts" | head -20

# Check for RTL-unaware CSS
grep -rn "margin-left\|margin-right\|padding-left\|padding-right\|text-align.*left\|text-align.*right" src/ --include="*.css" --include="*.tsx" | head -20
```

**RTL Checklist:**
- [ ] `dir` attribute set based on locale
- [ ] CSS uses logical properties (`margin-inline-start` not `margin-left`)
- [ ] Icons/images are mirrored for RTL
- [ ] Layout flows correctly in RTL
- [ ] Text alignment adapts to direction

### Phase 6: Accessibility i18n

```bash
# Check for lang attribute
grep -rn "lang=" src/ --include="*.tsx" | head -10

# Check for aria-label with translatable text
grep -rn "aria-label=" src/ --include="*.tsx" | head -20
```

**Accessibility i18n Checklist:**
- [ ] `<html lang={locale}>` is set
- [ ] All `aria-label` values are translated
- [ ] Screen reader text is translated
- [ ] Form labels are translated
- [ ] Error messages are translated
- [ ] Alt text is translated

## Output Format

```markdown
## i18n Audit Report

### Summary
- Supported locales: X
- Total translation keys: X
- Missing translations: X
- Hardcoded strings found: X

### Translation Completeness
| Locale | Keys | Missing | Coverage | Status |
|--------|------|---------|----------|--------|

### Hardcoded Strings
| File | Line | String | Suggested Key |
|------|------|--------|---------------|

### Formatting Issues
| File | Issue | Fix |
|------|-------|-----|

### RTL Issues
[Findings]

### Accessibility i18n
[Findings]

### Recommendations
[Prioritized action items]
```

## i18n Health Score

| Area | Weight | Scoring |
|------|--------|---------|
| Translation completeness | 30% | >95% = 100, <80% = 0 |
| Hardcoded string absence | 25% | 0 hardcoded = 100, >20 = 0 |
| Date/number formatting | 15% | All locale-aware = 100 |
| RTL support | 15% | Full RTL = 100, none = 0 |
| Accessibility | 15% | All aria-labels translated = 100 |

## Limitations

- Translation quality requires native speaker review
- Some languages have complex pluralization rules
- RTL support requires visual testing
- Machine translations may not capture context

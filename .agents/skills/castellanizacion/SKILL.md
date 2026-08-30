---
name: castellanizacion
description: "Auditoría y traducción de strings hardcodeados a castellano. Verifica i18n, traduce PDFs, documentación y UI. Usa next-intl como framework de internacionalización."
category: i18n
risk: safe
source: personal
date_added: "2026-08-30"
tags:
  - i18n
  - castellano
  - traduccion
  - localization
  - next-intl
tools:
  - claude-code
  - cursor
  - gemini-cli
---

# Castellanización

## Overview

Auditoría y traducción de strings hardcodeados a castellano para proyectos Next.js con next-intl. Verifica paridad de traducciones, detecta strings sin traducir y sugiere mejoras.

## When to Use

- Agregar nuevo idioma o verificar paridad
- Detectar strings hardcodeados en UI
- Traducir PDFs y documentos generados
- Verificar i18n después de cambios grandes
- Preparar proyecto para mercado hispanohablante

## Proceso de Castellanización

### Fase 1: Análisis de Paridad i18n

```bash
# Verificar paridad de claves entre idiomas
cat messages/es.json | python3 -c "
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
print(len(flatten(data)))
" 2>/dev/null

cat messages/en.json | python3 -c "
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
print(len(flatten(data)))
" 2>/dev/null
```

### Fase 2: Detectar Strings Hardcodeados

```bash
# Strings en TSX que no usan t()
grep -rn ">[A-Z][a-zA-Z ]*<" src/ --include="*.tsx" | \
  grep -v "import\|export\|test\|spec\|type\|interface\|node_modules" | \
  grep -v "className\|useTranslations\|t(" | head -30

# Strings en componentes
grep -rn "\"[A-Z][a-z].*\"" src/app/ src/components/ --include="*.tsx" | \
  grep -v "import\|export\|test\|spec\|type\|interface\|className\|useTranslations\|t(" | head -30
```

### Fase 3: Traducir PDF Templates

```bash
# Encontrar strings en PDFs
grep -rn "Text.*>.*<" src/server/reports/ src/app/api/*/report/pdf/ | \
  grep -v "import\|style\|{.*}" | head -30
```

**Patrón de traducción para PDFs:**
```tsx
// ❌ ANTES
<Text>Security Score /100</Text>
<Text>Findings</Text>
<Text>Critical/High</Text>

// ✅ DESPUÉS
<Text>Puntuación de Seguridad /100</Text>
<Text>Hallazgos</Text>
<Text>Críticos/Altos</Text>
```

### Fase 4: Verificar Locale por Defecto

```bash
# Verificar que español es el locale por defecto
grep -n "defaultLocale" src/i18n/request.ts
```

**Configuración correcta:**
```typescript
export const defaultLocale: Locale = "es";
```

### Fase 5: Documentación

```bash
# Verificar documentación en español
grep -rn "README\|CHANGELOG\|CONTRIBUTING" . | head -10
```

## Diccionario de Traducciones Comunes

| Inglés | Castellano |
|--------|------------|
| Security Score | Puntuación de Seguridad |
| Findings | Hallazgos |
| Critical/High | Críticos/Altos |
| Executive Overview | Resumen Ejecutivo |
| Consolidated Findings | Hallazgos Consolidados |
| Detailed Findings | Hallazgos Detallados |
| Severity Distribution | Distribución por Severidad |
| Scores by Investigation | Puntuaciones por Investigación |
| Discovered Assets | Activos Descubiertos |
| Generated | Generado |
| Weak | Débil |
| Fair | Regular |
| Good | Bueno |
| No findings detected | No se detectaron hallazgos |
| Enterprise Cyber Intelligence | Inteligencia Ciber Empresarial |

## Output Format

```markdown
## Informe de Castellanización

### Resumen
- Claves i18n en es.json: X
- Claves i18n en en.json: X
- Paridad: X%
- Strings hardcodeados: X

### Strings Traducidos
| Archivo | Línea | Antes | Después |
|---------|-------|-------|---------|

### Pendientes
| Archivo | Línea | String | Prioridad |
|---------|-------|--------|-----------|

### Recomendaciones
[Acciones sugeridas]
```

## Limitations

- Algunos strings son técnicos (nombres de columnas, códigos de error)
- PDFs generados por librerías pueden no soportar UTF-8 completo
- API docs pueden necesitar ambos idiomas

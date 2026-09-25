# I18N-AUDIT — Paridad es/en

**B09 / TSK-021 / REQ-115** · Auditado: 2026-09-25 · Veredicto: **✅ 0 divergencia — PASS**

Auditoría de paridad de claves de internacionalización entre locales, verificable por script y ejecutada en CI.

---

## 1. Resultado (2026-09-25)

```text
$ node scripts/i18n-parity.mjs
es=633 en=633 divergencia=0.00% (máx 2.00%)
i18n-parity: OK   → exit 0
```

| Métrica | Valor |
|---------|-------|
| Claves `messages/es.json` | **633** |
| Claves `messages/en.json` | **633** |
| Claves solo en `es` | 0 |
| Claves solo en `en` | 0 |
| Divergencia | **0.00%** (umbral CI: 2.00%) |
| Veredicto | **PASS** |

---

## 2. Mecanismo

| Elemento | Detalle |
|----------|---------|
| Script | `scripts/i18n-parity.mjs` (zero-deps, node puro) |
| Fuentes | `messages/es.json`, `messages/en.json` |
| Método | Aplana anidamiento a claves `a.b.c` y compara en **ambas direcciones**; claves ICU de pluralización (`{count, plural...}`) cuentan como una sola |
| Fórmula | `divergencia = (faltan_en + faltan_es) / max(|es|, |en|)` |
| Umbral | `--max-divergence 0.02` (2%); exit 1 si lo excede o hay claves faltantes |
| CI | `.github/workflows/ci.yml:41-42` — paso **"Guard i18n parity (es/en)"** corre el script en cada push/PR |

> Nota: el plan TSK-021 preveía `scripts/i18n-audit.mjs`; el implementado es `scripts/i18n-parity.mjs` con la misma función (diff de claves, 0 diffs aceptado) + guard en CI.

---

## 3. Cobertura y límites

**Cubierto:**
- Existencia/ausencia de claves en ambos idiomas (huérfanas en cualquier dirección)
- Ejecución automática en CI con umbral duro

**No cubierto (fuera de alcance de este audit):**
- Calidad de la traducción (solo paridad de claves, no de significado)
- Interpolaciones/Placeholders `{name}` presentes en un idioma y no en el otro
- Fechas/números/plurales a nivel de runtime (`next-intl`/`Intl.*`)

---

## 4. Criterios de aceptación TSK-021

- [x] Script de diff de claves → `scripts/i18n-parity.mjs`
- [x] Ejecución con 0 diffs → `es=633 en=633 divergencia=0.00% OK`
- [x] Artefacto de auditoría → **este documento**
- [x] CI job opcional → `ci.yml:41-42` con `--max-divergence 0.02`

**Fuentes primarias:** `scripts/i18n-parity.mjs` · `messages/es.json` · `messages/en.json` · `.github/workflows/ci.yml`

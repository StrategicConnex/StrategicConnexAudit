# 🔍 Auditoría de Diseño — StrategiAudit Pro (SCAUDIT)

**Fecha:** 21 de agosto, 2026  
**Metodología:** Frontend Design Skill — proceso de 3 pasos (Brainstorm → Plan → Critique)  
**Modo:** Evaluación y documentación (sin implementar cambios)

---

## 1. Estado Actual — Token System

### Paleta

| Token | Dark (actual) | Light (actual) | Evaluación |
|-------|---------------|----------------|------------|
| `--bg` | `oklch(1.8% 0.003 265)` | `oklch(96.5% 0.006 265)` | ✅ Profundidad correcta |
| `--primary` | `oklch(68% 0.14 230)` | `oklch(48% 0.15 258)` | ⚠️ Indigo genérico — patrón AI default |
| `--chartreuse` | `oklch(78% 0.18 140)` | `oklch(47% 0.13 130)` | ⚠️ Acid-green = patrón AI default #2 |
| `--destructive` | `oklch(55% 0.22 25)` | `oklch(52% 0.21 25)` | ✅ Rojo coral, funciona bien |

**Hallazgo crítico:** La paleta indigo + chartreuse en fondo oscuro es literalmente el **patrón #2 de AI-generated design** que el skill Frontend Design identifica como default genérico: *"a near-black background with a single bright acid-green or vermilion accent"*. No es una elección deliberada para SCAUDIT — es el look que cae automáticamente.

### Tipografía

| Rol | Fuente | Peso | Evaluación |
|-----|--------|------|------------|
| Display | DM Sans | 400–1000 | ⚠️ Neutral, sin carácter distintivo |
| Body | Inter | — | ✅ Excelente para UI, pero sobreusada |
| Mono | JetBrains Mono | — | ✅ Correcta para datos/código |

**Problema:** DM Sans e Inter son las mismas fuentes que usa cualquier proyecto Next.js. No hay "memoria tipográfica" — nada en el texto dice "esto es SCAUDIT y no otra plataforma".

### Layout

```
┌──────────┬────────────────────────────────────────┐
│ Sidebar  │ Header (80px fixed)                    │
│ (266px)  ├────────────────────────────────────────┤
│          │                                        │
│ Nav      │ Content Panel (max-w-6xl, p-10)        │
│ Links    │                                        │
│ Status   │   ┌──────────┐ ┌──────────┐           │
│ Footer   │   │  Hero    │ │  KPIs    │           │
│          │   │  Card    │ │  Stack   │           │
│          │   └──────────┘ └──────────┘           │
│          │   ┌──────────┐ ┌──────────┐           │
│          │   │  Chart   │ │ Terminal │           │
│          │   │  (2fr)   │ │ (1fr)    │           │
│          │   └──────────┘ └──────────┘           │
└──────────┴────────────────────────────────────────┘
```

**Evaluación:** Layout funcional pero estándar. El sidebar de 266px es ancho para el contenido que muestra (solo iconos + labels). El header de 80px es espacio desperdiciado — solo muestra título + 3-4 botones.

### Efectos visuales

| Efecto | Implementación | Evaluación |
|--------|---------------|------------|
| Glassmorphism | `backdrop-blur(24px)` + glass tokens | ✅ Bien ejecutado, soporte fallback |
| Red neuronal | Canvas animado con nodos/edges | ✅ Distingue la marca, pero solo visible en login |
| Scan-lines | CSS repeating-gradient | ⚠️ Sutil pero cliché |
| Background orbs | blur(150px) pulsantes | ⚠️ Patrón genérico de AI landing pages |
| View Transitions | API nativa + fallback CSS | ✅ Excelente implementación |

---

## 2. Hallazgos por Severidad

### 🔴 ALTO — Identidad Visual Genérica

**Problema:** La paleta, tipografía y efectos combinados no crean una identidad distinguible. Si quitas el logo, la app podría ser cualquier plataforma SaaS de ciberseguridad.

**Evidencia:**
- Paleta indigo + chartreuse = 1 de los 3 looks genéricos de AI
- DM Sans + Inter = tipografía default de Next.js
- Sidebar fijo + tabs = patrón estándar de dashboard SaaS
- Scan-lines + orbs = efectos de AI landing page

**Impacto:** El producto se siente como "template con features" en vez de "producto con personalidad". Para un producto de ciberseguridad que compite con CrowdStrike, SentinelOne, o Wiz — esto reduce credibilidad percibida.

### 🟡 MEDIO — Espacio de Layout Ineficiente

| Componente | Problema | Sugiere |
|------------|----------|---------|
| **Sidebar** (266px) | Ocupa ~22% del viewport en 1280px. Contenido: 9 nav buttons + 1 status card + 6 links. | Colapsable a 72px (solo iconos) con expand on hover |
| **Header** (80px) | Solo muestra título + subtítulo + 4 botones. Verticalmente desperdiciado. | Reducir a 56px o integrar en sidebar |
| **Content panel** | `p-10` (40px) de padding en todas las páginas. En mobile se pierde ~80px horizontales. | `p-6 lg:p-10` responsive |

### 🟡 MEDIO — Datos Estáticos Hardcoded

| Ubicación | Dato hardcoded | Problema |
|-----------|---------------|----------|
| **OverviewTab hero** | `1,247 req/s` | Se muestra como live metric pero es estático |
| **OverviewTab KPIs** | `1.8ms`, `127d`, `99.9%` | Estos valores nunca cambian |
| **Sidebar status card** | `Security Index: 99.98` | Hardcoded, no refleja datos reales |
| **ProjectCard** | `healthScore = latestAudit ? 85 : 45` | Binario, no mide salud real |
| **Performance badge** | `92%` hardcoded en sidebar | No refleja rendimiento real |
| **Activity terminal** | Logs de ejemplo con timestamps falsos | Se siente como demo perpetua |

**Impacto:** El usuario pierde confianza cuando los "live metrics" no cambian nunca. Para un producto de ciberseguridad, datos falsos son peor que datos ausentes.

### 🟢 BAJO — Micro-detail Issues

| Archivo | Issue | Severidad |
|---------|-------|-----------|
| `ScoreGauge.tsx` | Colores hardcoded (`#8BC34A`, `#6271C4`, `#EBA52D`) en vez de CSS tokens | Baja |
| `ProjectCard.tsx` | `getHealthStyle()` usa oklch inline en template literals — Tailwind no puede purgar | Baja |
| `DashboardHeader.tsx` | Títulos hardcodeados en español sin i18n (el resto del app usa `useTranslations`) | Baja |
| `AiCopilot.tsx` | Quick questions hardcodeadas en español | Baja |
| `OverviewTab.tsx` | Gráfico SVG inline con `viewBox="0 0 100 100"` — no es responsive a datos | Baja |

---

## 3. Propuesta de Rediseño — Token System

### Nueva Paleta — "Thermal Imaging"

Inspirada en la terminología real de ciberseguridad: la paleta de cámaras térmicas usadas en centros de datos. Esto ancla el diseño en el mundo del producto.

| Rol | Hex | OKLCH | Uso |
|-----|-----|-------|-----|
| **Void** (bg) | `#08090E` | `oklch(3% 0.012 260)` | Fondo profundo con tinte azul |
| **Plasma** (primary) | `#4F7CFF` | `oklch(62% 0.18 260)` | Azul eléctrico — confiabilidad, institucional |
| **Thermal** (accent) | `#FF6B35` | `oklch(68% 0.19 30)` | Naranja térmico — alertas, señales live |
| **Frost** (success) | `#00D4AA` | `oklch(75% 0.15 165)` | Verde agua — sistema operativo |
| **Carbon** (muted) | `#1A1D28` | `oklch(12% 0.015 260)` | Superficies elevadas |
| **Signal** (destructive) | `#FF4757` | `oklch(62% 0.25 25)` | Rojo vivo — errores críticos |

**¿Por qué no chartreuse?** El chartreuse es el color de "hacker genérico". El naranja térmico es más distintivo, visually cálido, y conecta con la metáfora de "thermal imaging" que es específico de ciberseguridad de redes.

### Nueva Tipografía

| Rol | Fuente | Razón |
|-----|--------|-------|
| **Display** | **Space Grotesk** | Geométrica, técnica, con personalidad. Los `G` y `R` tienen formas distintivas. No es la fuente "bonita por defecto" de AI. |
| **Body** | **Inter** | Mantener — es excelente para UI y el ecosistema de Next.js la optimiza automáticamente. |
| **Mono** | **JetBrains Mono** | Mantener — perfecta para datos y código. |

**¿Por qué Space Grotesk?** Es geométrica sin ser fría, técnica sin ser monoespaciada, y tiene la "personalidad" que DM Sans no tiene. Los caracteres como `G`, `R`, `3` tienen formas únicas que crean memoria visual.

### Layout Propuesto

```
┌──────────────────────────────────────────────────┐
│ Top Bar (48px)                                   │
│ [☰] [Logo] SCAUDIT          [Search] [🔔] [Avatar]│
├──────┬───────────────────────────────────────────┤
│      │                                           │
│ Mini │ Content Panel                             │
│ Side │                                           │
│ bar  │   ┌─────────────────────────────────┐     │
│(72px)│   │ Command Bar / Breadcrumb         │     │
│      │   └─────────────────────────────────┘     │
│ [⊞]  │                                           │
│ [◉]  │   ┌───────────┐ ┌───────────┐ ┌───────┐ │
│ [⚡] │   │  Metric   │ │  Metric   │ │ Metric│ │
│ [🛡] │   │  Card 1   │ │  Card 2   │ │ Card 3│ │
│ [📡] │   └───────────┘ └───────────┘ └───────┘ │
│ [⚙]  │                                           │
│      │   ┌──────────────────┐ ┌──────────────┐  │
│      │   │  Main Content    │ │  Side Panel  │  │
│      │   │  (Chart/Table)   │ │  (Context)   │  │
│      │   └──────────────────┘ └──────────────┘  │
└──────┴───────────────────────────────────────────┘
```

**Cambios clave:**
1. **Top bar horizontal** en vez de header sticky — integra search, notificaciones, avatar
2. **Sidebar colapsable** (72px icon-only → 266px on hover/click) — recupera ~200px de ancho
3. **Command bar** como breadcrumb interactivo — permite búsqueda global
4. **Bento grid** más denso — menos padding, más información por viewport

### Elemento Firma — "Thermal Scan Line"

Un sutil gradiente animado que cruza horizontalmente las tarjetas de métricas cada 8-12 segundos, simulando un escaneo térmico. No es decorativo — indica que el sistema está monitoreando activamente.

```css
@keyframes thermal-scan {
  0% { transform: translateX(-100%); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateX(200%); opacity: 0; }
}
```

El gradiente usa el color `Thermal` (naranja) con opacidad baja, visible solo sobre las tarjetas de datos. Es el equivalente visual del "pulse" de la red neuronal pero aplicado al dashboard completo.

---

## 4. Mapa de Cambios por Prioridad

### P0 — Impacto Alto, Esfuerzo Medio

| # | Cambio | Archivos afectados | Riesgo |
|---|--------|-------------------|--------|
| 1 | **Nueva paleta de colores** | `globals.css` (tokens) | Bajo — solo cambian valores de variables |
| 2 | **Space Grotesk como display** | `layout.tsx` (font import) | Bajo — swap de Google Font |
| 3 | **Eliminar datos hardcoded** del hero y sidebar | `OverviewTab.tsx`, `DashboardSidebar.tsx` | Medio — necesita fuente de datos real o estados vacíos |

### P1 — Impacto Medio, Esfuerzo Bajo

| # | Cambio | Archivos afectados | Riesgo |
|---|--------|-------------------|--------|
| 4 | **Header responsive** — reducir de 80px a 56px | `DashboardHeader.tsx` | Bajo |
| 5 | **Sidebar colapsable** — icon-only a 72px | `DashboardSidebar.tsx` | Medio — afecta layout del dashboard |
| 6 | **i18n en hardcoded strings** — DashboardHeader y AiCopilot | `DashboardHeader.tsx`, `AiCopilot.tsx` | Bajo |
| 7 | **ScoreGauge con tokens** — reemplazar hex hardcoded | `ScoreGauge.tsx` | Bajo |

### P2 — Impacto Bajo, Esfuerzo Bajo

| # | Cambio | Archivos afectados | Riesgo |
|---|--------|-------------------|--------|
| 8 | **Thermal scan line** — efecto en metric cards | `globals.css`, `OverviewTab.tsx` | Bajo |
| 9 | **ProjectCard health real** — calcular de datos reales | `ProjectCard.tsx`, `OverviewTab.tsx` | Bajo |
| 10 | **Content padding responsive** — `p-6 lg:p-10` | `DashboardContainer.tsx` | Bajo |

---

## 5. Lo que NO Cambiaría

| Elemento | Razón |
|----------|-------|
| **Red neuronal de fondo** | Es el elemento más distintivo de SCAUDIT. Solo se ve en login y dashboard, no compite con el contenido. |
| **Glassmorphism system** | Bien implementado, con fallback, funciona en ambos temas. |
| **View Transitions** | Excelente UX, API nativa con fallback CSS. |
| **Theme system** (dark/light) | Arquitectura sólida con `useSyncExternalStore` y anti-FOUC. |
| **Code splitting por tabs** | Patrón correcto — cada tab carga solo lo que necesita. |
| **CSP + nonce system** | Seguridad correcta, no tocar. |
| **NeuralNetworkBackground** | Canvas interactivo que responde al copilot — excelente micro-interacción. |

---

## 6. Riesgos del Rediseño

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Breaking changes en Tailwind classes | Media | Alto | Cambiar tokens CSS, no clases Tailwind |
| Theme light roto con nueva paleta | Media | Medio | Verificar ambos temas después de cada cambio |
| Performance de nuevos efectos | Baja | Bajo | Usar `will-change` y `transform` solo |
| Regresiones en responsive | Baja | Medio | Probar en 320px, 768px, 1024px, 1440px |
| Pérdida de identidad actual | Baja | Alto | Mantener red neuronal + glassmorphism como anclas |

---

## 7. Recomendación Final

**El rediseño más efectivo es el P0 completo** — nueva paleta, Space Grotesk, y eliminar datos hardcoded. Son cambios de bajo riesgo que transforman la identidad visual sin reescribir componentes.

La paleta "Thermal Imaging" (azul eléctrico + naranja térmico) es más distintiva que indigo + chartreuse, conecta con la terminología de ciberseguridad, y evita los 3 looks genéricos de AI.

El sidebar colapsable (P1) es el cambio de layout con mayor impacto — recupera ~200px de ancho en desktop y hace que el dashboard se sienta más moderno y menos "SaaS template".

**No implementar todos los cambios de golpe.** Recomendación: P0 primero (1-2 horas), verificar, luego P1 (2-3 horas), verificar, luego P2 cuando haya tiempo.

---

*Documento generado como parte de la auditoría SC Platform Universal AI + Frontend Design Skill.*  
*No se han realizado cambios al código. Este documento es solo evaluación y recomendación.*

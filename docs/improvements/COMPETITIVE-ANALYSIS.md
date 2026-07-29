# Análisis Competitivo — SCAUDIT Pro vs. Mercado

> **Fecha:** Julio 2026
> **Propósito:** Identificar brechas de funcionalidad, oportunidades de mejora y tendencias de UX/UI en herramientas de ciberseguridad e inteligencia de red.

---

## 1. Tabla Comparativa General

| Característica | SCAUDIT Pro | Shodan | Censys | SecurityTrails | GreyNoise | Detectify | Datadog |
|---|---|---|---|---|---|---|---|
| Escaneo DNS completo | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| WHOIS histórico | ✅ (actual) | ❌ | ❌ | ✅ (pasivo) | ❌ | ❌ | ❌ |
| TLS/SSL profundo | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Email security (SPF/DKIM/DMARC) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Descubrimiento continuo de activos** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Visualización de superficie de ataque** | ✅ (básico) | ✅ (mapas) | ✅ (grafos) | ❌ | ❌ | ✅ (topología) | ✅ |
| **Alertas en tiempo real** | ❌ | ✅ (Shodan Monitor) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Reportes PDF white-label** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Colaboración en equipo** | ❌ | ✅ (workspaces) | ✅ (RBAC) | ✅ | ✅ | ✅ | ✅ |
| **Integración CI/CD** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Observabilidad en vivo** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Perfilado de tecnologías** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **API pública** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Benchmarking / MITRE ATT&CK** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Machine Learning / Anomalías** | ❌ | ❌ | ❌ | ❌ | ✅ (tags) | ❌ | ✅ |

---

## 2. Análisis por Competidor

### 2.1 Shodan — "El Google de los Dispositivos IoT"
**Fortalezas:** Escaneo global continuo, búsqueda tipo search engine, alertas Shodan Monitor, API poderosa, mapas geográficos.

**Qué podemos adoptar:**
- **Motor de búsqueda tipo Shodan**: Query box con sintaxis estructurada (`port:443 country:AR`) para búsqueda avanzada de activos
- **Monitoreo continuo de activos**: Shodan Monitor detecta cuando un nuevo activo aparece en IPs vigiladas — podríamos tener monitoreo pasivo de subdominios y puertos
- **Mapa geográfico interactivo**: Visualización de GeoIP de activos sobre mapa mundial

### 2.2 Censys — EASM (External Attack Surface Management)
**Fortalezas:** Asset graph traversal, certificados TLS tracking, cloud storage detection, colecciones compartibles.

**Qué podemos adoptar:**
- **Asset Graph traversal**: Navegar desde un dominio → certificado → IP → otros dominios en mismo certificado
- **Detección de cloud buckets**: S3, GCS, Azure Blob expuestos
- **Colecciones de activos**: Agrupar activos por proyecto con herencia de configuraciones

### 2.3 SecurityTrails — DNS & WHOIS Histórico
**Fortalezas:** Passive DNS history, WHOIS histórico, subdomain discovery, pivoting entre dominios.

**Qué podemos adoptar:**
- **Passive DNS history**: Almacenar cada resolución DNS del tiempo, permitir consultar "¿qué IP tenía example.com en marzo 2025?"
- **WHOIS histórico**: Trackear cambios de registrar, fechas de expiración, nameservers
- **Domain pivoting**: "Mostrar todos los dominios que comparten esta IP/nameserver/email WHOIS"
- **Subdomain discovery recursivo**: Fuerza bruta + certificate transparency + DNS zone transfer

### 2.4 GreyNoise — Filtrado de Ruido de Fondo
**Fortalezas:** Clasificación de IPs (benign/malicious/unknown), tags asociados a CVEs, visualizer GNQL, alertas.

**Qué podemos adoptar:**
- **Clasificación de tráfico**: Diferenciar scanners legítimos (Googlebot, Shodan) de tráfico malicioso
- **Enriquecimiento con CVE**: Asociar hallazgos a vulnerabilidades CVE específicas con severity score
- **GNQL-like query language**: Lenguaje de consulta propio para filtrar/buscar hallazgos
- **Alertas inteligentes**: Notificar solo cuando se detecta actividad NO benigna

### 2.5 AttackIQ / Pentera — Validación de Seguridad Automatizada
**Fortalezas:** Adversary simulation, attack path topology, MITRE ATT&CK mapping, kill-chain reconstruction.

**Qué podemos adoptar:**
- **Attack path reconstruction**: Mostrar cómo un atacante podría encadenar vulnerabilidades
- **MITRE ATT&CK mapping**: Mapear cada hallazgo a tácticas y técnicas de MITRE ATT&CK
- **Adversary simulation**: Simulación controlada de vectores de ataque reales (opcional, nivel enterprise)
- **Safe breach testing**: Pruebas controladas de credenciales filtradas, configuraciones débiles

### 2.6 Detectify — DAST + Crowdsource Intelligence
**Fortalezas:** Dynamic Application Security Testing, ethical hacker crowdsource, CI/CD integration, shadow asset detection.

**Qué podemos adoptar:**
- **CI/CD webhook integration**: Disparar escaneos automáticos cuando se hace push a GitHub/GitLab
- **Shadow asset detection**: Detectar subdominios olvidados, certificados expirados, S3 buckets públicos
- **Crowdsource modules**: Checklists de seguridad mantenidas por la comunidad
- **Vulnerability queue triage**: Priorización inteligente de hallazgos con contexto de negocio

### 2.7 Moz Pro / SEMrush — SEO Auditing
**Fortalezas:** Crawl error breakdown por severidad, white-label PDF reports, scheduled reporting, competitive intelligence.

**Qué podemos adoptar:**
- **Reportes PDF White-Label**: Reportes personalizables con marca del cliente (ya hay ExportPdfButton pero esbozo)
- **Scheduled reporting**: Envío automático de reportes por email cada semana/mes
- **Competitive intelligence**: Comparar métricas SEO contra competidores
- **Site crawl visual**: Árbol de páginas con issues por tipo y severidad

### 2.8 Datadog / Grafana — Observabilidad
**Fortalezas:** Custom dashboards, live streaming metrics, anomaly detection, APM tracing, alerting engine.

**Qué podemos adoptar:**
- **Custom dashboards drag-and-drop**: Permitir que el usuario configure su dashboard (widgets movibles)
- **Live streaming metrics**: Métricas en tiempo real con WebSockets (no polling cada N segundos)
- **Anomaly detection**: Detección automática de picos anómalos en LCP, uptime, latencia
- **Multi-condition alerting**: Alertas compuestas (si LCP > 2.5s AND error rate > 1% durante 5 min)
- **Metric correlations**: "Cuando el LCP sube, también sube X" — correlación automática

---

## 3. Oportunidades de Mejora por Prioridad

### 3.1 P0 — Crítico (Foundation)

| # | Mejora | Inspiración | Impacto |
|---|---|---|---|
| P0.1 | **Descubrimiento continuo de activos** | Censys, Shodan | Detecta shadow IT, previene breach por activos olvidados |
| P0.2 | **Historical DNS/WHOIS tracking** | SecurityTrails | Forense, compliance, tracking de cambios en infraestructura |
| P0.3 | **Alertas multi-canal en tiempo real** | GreyNoise, Datadog | Respuesta inmediata a cambios de seguridad |

### 3.2 P1 — Alta (Core Features)

| # | Mejora | Inspiración | Impacto |
|---|---|---|---|
| P1.1 | **API pública REST para escaneos** | Shodan, SecurityTrails | Integraciones third-party, automatización |
| P1.2 | **Reportes PDF exportables white-label** | Moz Pro, Datadog | Clientes enterprise, agencias |
| P1.3 | **Team collaboration (RBAC)** | Censys, Detectify | Equipos multi-usuario, agencias |
| P1.4 | **CI/CD webhook integration** | Detectify | Shift-left security, DevSecOps |
| P1.5 | **Scheduled scanning con cron UI** | Moz Pro | Auditorías recurrentes automáticas |
| P1.6 | **MITRE ATT&CK mapping** | AttackIQ | Framework estándar de ciberseguridad |

### 3.3 P2 — Media (UX/Dashboard)

| # | Mejora | Inspiración | Impacto |
|---|---|---|---|
| P2.1 | **Interactive geography map** | Shodan | Visualización GeoIP de activos |
| P2.2 | **Custom dashboards drag-and-drop** | Grafana, Datadog | UX personalizable por usuario |
| P2.3 | **Asset graph traversal** | Censys | Navegación entre dominios ⇄ IPs ⇄ certs |
| P2.4 | **Technology profiling (BuiltWith-like)** | BuiltWith, Wappalyzer | Perfil tecnológico de cualquier sitio |
| P2.5 | **Cloud bucket detection** | Censys | Detectar almacenamiento cloud expuesto |
| P2.6 | **Live streaming metrics via WebSocket** | Datadog | Observabilidad en tiempo real |

### 3.4 P3 — Deseable (Nice to Have)

| # | Mejora | Inspiración | Impacto |
|---|---|---|---|
| P3.1 | **Mobile app / PWA** | - | Acceso desde cualquier dispositivo |
| P3.2 | **Anomaly detection ML** | Datadog | Detección proactiva de incidentes |
| P3.3 | **Adversary simulation** | AttackIQ, Pentera | Validación activa de defensas |
| P3.4 | **Plugin / module marketplace** | Detectify | Extensibilidad por la comunidad |
| P3.5 | **Multi-language (INGLÉS primero)** | Todos | Reach global |
| P3.6 | **Benchmarking dashboard** | Moz Pro | "Tu score vs. industria" |

---

## 4. Tendencias de UX/UI en el Mercado 2026

1. **Dark mode como default** — 100% de las herramientas analizadas usan dark mode, pero todas ofrecen light mode también
2. **Query-first interfaces** — Shodan, GreyNoise, y Splunk priorizan la barra de búsqueda como punto de entrada
3. **Bento grid layout** — Datadog y Grafana popularizaron grids asimétricos para dashboards
4. **Terminal-inspired consoles** — Varias herramientas usan estética de terminal para logs de escaneo (SCAUDIT ya hace esto bien)
5. **Risk score dials + gauges** — Scores visuales tipo velocímetro son el estándar (SCAUDIT ya tiene ScoreGauge)
6. **Topology maps** — Grafos de red interactivos son cada vez más comunes (Censys, AttackIQ, Detectify)
7. **Inline markdown rendering** — Reportes renderizados en el dashboard sin descargar PDF
8. **Real-time collaboration cursors** — Similar a Figma/Google Docs pero para SOC teams
9. **Progressive disclosure** — Mostrar resúmenes primero, profundizar en expandables
10. **Alerting as a first-class citizen** — Ya no es feature secundario, los alerts son parte central del dashboard

---

## 5. Resumen de Ventajas Competitivas Actuales de SCAUDIT

| Ventaja | Descripción | Competidores que NO lo tienen |
|---|---|---|
| 🥇 **AI Copilot + Remediation** | Asistente IA que genera planes de remediación | Ninguno (Shodan/Censys no tienen IA generativa) |
| 🥇 **Incident Brief con IA** | Documento ejecutivo generado por IA | Ninguno |
| 🥇 **Email Security Audit (SPF/DKIM/DMARC)** | Auditoría profesional de correo | Shodan, Censys, GreyNoise no |
| 🥇 **Score + Drift Detection** | Score de seguridad + detección de cambios | SecurityTrails y Detectify lo tienen parcial |
| 🥇 **SEO + Security en un solo producto** | Unifica auditoría SEO y ciberseguridad | Moz (solo SEO), Shodan (solo security) |
| 🥇 **SIEM Exporter** | Exporta alertas a Slack/PagerDuty/Splunk | Solo herramientas enterprise (Splunk, Datadog) |
| 🥇 **Magic Link Auth sin contraseña** | Autenticación moderna sin passwords | La mayoría requiere username/password |
| 🥇 **CSP + Security Headers hardening** | Seguridad web incorporada en el proxy | Ninguno ofrece esto como feature |

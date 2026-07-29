---
layout: default
title: Configurar Alertas SIEM
nav_order: 7
permalink: /docs/guides/alerting-setup
---

# Cómo configurar alertas SIEM multicanal

{: .no_toc }

<details open markdown="block">
  <summary>Table of Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

Esta guía te muestra cómo configurar **alertas automáticas** para cambios DNS, WHOIS, expiración de API keys, y eventos de seguridad. Las alertas pueden enviarse a Slack, Email, PagerDuty y Splunk simultáneamente.

---

## Prerequisitos

- SCAUDIT instalado y funcionando (ver [Guía de instalación](../installation.md))
- Acceso a al menos uno de los servicios de destino (Slack, Resend, PagerDuty, Splunk)

---

## 1. ¿Qué eventos generan alertas?

### Cambios DNS

Cuando `processDnsResults()` detecta modificaciones en registros DNS:

| Evento | Disparado por |
|--------|---------------|
| Registro A/IP cambiado | `dns.lookup` executor |
| MX record modificado/eliminado | `dns.mx` executor |
| NS record modificado/eliminado | `dns.ns` executor |
| TXT record (SPF/DKIM) cambiado | `dns.txt` executor |
| Nuevo registro añadido | Cualquier executor DNS |

### Cambios WHOIS

Cuando `persistWhoisSnapshot()` detecta diferencias con el snapshot anterior:

| Evento | Severidad |
|--------|-----------|
| Fecha de expiración modificada | 🔴 Critical |
| Registrador cambiado | 🟡 Warning |
| Nameservers cambiados | 🟡 Warning |
| Organización registrante cambiada | 🟡 Warning |

### Eventos de seguridad (SIEM)

Detectados por `runSiemExport()` cada 5 minutos:

| Patrón | Threshold | Ventana |
|--------|-----------|---------|
| 🚨 Open Redirect Attack | 3 intentos | 5 min |
| 🚨 Rate Limit Bypass | 1 intento | 5 min |
| 🚨 AI Model Failure | 1 fallo | 5 min |
| ⚠️ Rate Limit Spike | 20 hits | 5 min |
| ⚠️ CSP Violation Spike | 10 violaciones | 10 min |
| ⚠️ Auth Failure Burst | 5 fallos | 5 min |
| ℹ️ Invalid Input Spike | 10 eventos | 5 min |

### Expiración de API Keys

Verificadas diariamente a las 09:00 UTC por `api-key-expiry.trigger.ts`:

- Keys con expiración en **1-7 días**: alerta warning
- Keys expiradas: alerta crítica

---

## 2. Configurar Slack

### Paso 1: Crear app en Slack

1. Ve a [api.slack.com/apps](https://api.slack.com/apps)
2. Haz clic en **Create New App → From scratch**
3. Nombre: `SCAUDIT SIEM`
4. Selecciona tu workspace

### Paso 2: Habilitar Incoming Webhooks

1. En la barra lateral, selecciona **Incoming Webhooks**
2. Activa el toggle **Activate Incoming Webhooks**
3. Haz clic en **Add New Webhook to Workspace**
4. Selecciona el canal donde quieres recibir alertas (ej: `#security-alerts`)
5. Autoriza la integración

### Paso 3: Copiar Webhook URL

```
https://hooks.slack.com/services/T00/B000/XXXXXXXXXX
```

### Paso 4: Configurar en SCAUDIT

```bash
# En .env.local (desarrollo):
SIEM_WEBHOOK_SLACK=https://hooks.slack.com/services/T00/B000/XXXXXXXXXX

# En Vercel (producción):
vercel env add SIEM_WEBHOOK_SLACK
```

### Paso 5: Probar

```bash
curl http://localhost:3000/api/security/siem/test
```

Deberías ver un mensaje como este en Slack:

```
🚨 ⚠️ [SCAUDIT SIEM]
• IP: `198.51.100.99`
• Count: 3 en 5 min
• Paths: `/auth/callback`
```

---

## 3. Configurar Email (Resend)

### Paso 1: Crear cuenta en Resend

1. Ve a [resend.com](https://resend.com) y crea cuenta
2. Verifica tu dominio (o usa el dominio sandbox `@resend.dev` para pruebas)

### Paso 2: Crear API Key

1. Ve a **API Keys**
2. Haz clic en **Create API Key**
3. Copia la key: `re_xxxxxxxxxxxx`

### Paso 3: Configurar en SCAUDIT

```bash
# En .env.local:
RESEND_API_KEY=re_xxxxxxxxxxxx
SIEM_EMAIL_FROM=alerts@tudominio.com    # Debe estar verificado en Resend
SIEM_EMAIL_TO=admin@tudominio.com        # Tu correo
```

**Nota:** Para el plan gratuito de Resend, usa `onboarding@resend.dev` como `SIEM_EMAIL_FROM` y solo puedes enviar a tu propio email verificado.

### Paso 4: Probar

Ve a `/security/audit` y haz clic en **Test Webhooks**. El email incluye:

- Asunto: `[SCAUDIT SIEM] 🧪 SIEM Test Alert`
- Template HTML con métricas, timeline y metadata
- Diseño corporativo oscuro

---

## 4. Configurar PagerDuty

### Paso 1: Obtener Routing Key

1. En tu cuenta de PagerDuty, ve a **Integrations → Event Orchestration**
2. Crea una nueva integración **Events API v2**
3. Copia el **Routing Key** (32 caracteres hexadecimales)

### Paso 2: Configurar en SCAUDIT

```bash
SIEM_WEBHOOK_PAGERDUTY=https://events.pagerduty.com/v2/enqueue/
SIEM_PAGERDUTY_ROUTING_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Cómo funciona

Las alertas PagerDuty incluyen:

- **Dedup key:** Basada en `eventType + IP + timestamp` para evitar incidentes duplicados
- **Severity mapping:** `critical → P1`, `warning → P2`, `info → P3`
- **Component:** Siempre `security-audit`
- **Class:** Siempre `security_event`

---

## 5. Configurar Splunk

### Paso 1: Obtener HEC Token

1. En Splunk, ve a **Settings → Data Inputs → HTTP Event Collector**
2. Crea un nuevo token
3. Copia el token

### Paso 2: Configurar en SCAUDIT

```bash
SIEM_WEBHOOK_SPLUNK=https://http-inputs-mysplunk.splunkcloud.com:8088/services/collector/event
```

### Formato de eventos

```json
{
  "event": "security_alert",
  "sourcetype": "scaudit:siem:alert",
  "fields": {
    "alert_type": "dns_change_detected",
    "severity": "warning",
    "ip": "strategicconnex.com.ar",
    "count": 3,
    "window_minutes": 60,
    "metadata": [{ "recordType": "A", "previousValue": "1.2.3.4", "currentValue": "5.6.7.8" }]
  }
}
```

---

## 6. Verificar que las alertas funcionan

### Dashboard de seguridad

Ve a **`/security/audit`** en el dashboard:

| Pestaña | Qué ver |
|---------|---------|
| 🛡️ Security Events | Eventos de auditoría en tiempo real |
| 📡 SIEM Alerts | Alertas enviadas con estado de entrega |
| 🔍 WHOIS Alerts | Cambios WHOIS con diff visual |
| 🌐 DNS Alerts | Cambios DNS con badges de record type |

### Botón "Test Webhooks"

En la pestaña **SIEM Alerts**, haz clic en **🧪 Test Webhooks** para enviar una alerta de prueba a todos los canales configurados.

### Heartbeat

El SIEM exporter envía un **heartbeat cada 30 minutos** a todos los canales. Si dejas de recibir heartbeats, algo está mal con el pipeline.

```
💓 SIEM Heartbeat
• Uptime: 12345s
• Env: production
• Status: ✓ Delivered
```

### Logs de servidor

```bash
# Ver eventos de alerta en tiempo real
pnpm dev | grep -i "SIEM\|WHOIS\|DNS.*Alert\|heartbeat"
```

---

## 7. Solución de problemas

| Problema | Causa posible | Solución |
|----------|---------------|----------|
| No llegan alertas a Slack | Webhook URL incorrecta | Verificar `SIEM_WEBHOOK_SLACK` |
| Email no enviado | Resend API key inválida | Verificar `RESEND_API_KEY` |
| PagerDuty no recibe | Routing key incorrecta | Verificar `SIEM_PAGERDUTY_ROUTING_KEY` |
| Splunk rechaza eventos | HEC Token incorrecto | Verificar `SIEM_WEBHOOK_SPLUNK` |
| Heartbeat no aparece | SIEM exporter no ejecutándose | Verificar Trigger.dev tasks |
| Test Webhooks falla | Sin canales configurados | Configurar al menos un canal |
| WHOIS alerts no llegan | Sin cambios detectados | Esperar a que expire o cambie un dominio |
| DNS alerts no llegan | Sin cambios entre escaneos | Ejecutar escaneo segundo con datos diferentes |

### Verificar canales activos

```bash
curl http://localhost:3000/api/security/siem/test
# Response:
{
  "targetsAttempted": 2,
  "success": true,
  "details": [
    { "name": "Slack", "status": "ok", "message": "200 OK" },
    { "name": "Email", "status": "ok", "message": "200 OK" }
  ]
}
```

---

## 8. Referencia de variables de entorno

| Variable | Propósito | ¿Obligatoria? |
|----------|-----------|---------------|
| `SIEM_WEBHOOK_SLACK` | Webhook URL de Slack | Opcional |
| `RESEND_API_KEY` | API key de Resend | Opcional (para email) |
| `SIEM_EMAIL_FROM` | Remitente de alertas email | Opcional |
| `SIEM_EMAIL_TO` | Destinatario de alertas email | Opcional |
| `SIEM_WEBHOOK_PAGERDUTY` | URL de PagerDuty Events API | Opcional |
| `SIEM_PAGERDUTY_ROUTING_KEY` | Routing key de PagerDuty | Opcional |
| `SIEM_WEBHOOK_SPLUNK` | URL de Splunk HEC | Opcional |

Puedes tener **uno, varios, o todos** los canales activos simultáneamente. Las alertas se envían a todos los canales configurados en paralelo.

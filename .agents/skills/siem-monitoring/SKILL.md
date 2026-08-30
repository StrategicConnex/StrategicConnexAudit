---
name: siem-monitoring
description: "Expert in SCAUDIT's SIEM integration, uptime monitoring, anomaly detection, alerting systems, and security event correlation. Use when building or modifying SIEM, monitoring, or alerting features."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - siem
  - monitoring
  - anomaly-detection
  - alerting
  - uptime
  - security-events
  - dns-alerts
  - whois-alerts
---

# SIEM & Monitoring Expert

Expert in the SCAUDIT security monitoring infrastructure. Covers SIEM integration, uptime monitoring, anomaly detection, DNS/WHOIS change alerting, and security event correlation.

## When to Use This Skill

- When working with the SIEM exporter (`src/server/security/siem-exporter.ts`)
- When modifying uptime monitoring (`src/server/intelligence/core/health-checker.ts`)
- When building anomaly detection (`src/server/intelligence/anomaly/detector.ts`)
- When working with DNS/WHOIS change alerts
- When modifying cron jobs for monitoring (`src/app/api/cron/siem/route.ts`, `src/app/api/cron/uptime/route.ts`)
- When building or modifying alerting systems
- When working with the monitoring tab in the dashboard

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│           SIEM & Monitoring System                │
├──────────────────────────────────────────────────┤
│                                                  │
│  Data Sources          Processing                │
│  ├─ Uptime Checks     ├─ Anomaly Detector       │
│  ├─ DNS Changes       ├─ SIEM Correlator        │
│  ├─ WHOIS Changes     ├─ Alert Evaluator        │
│  ├─ Web Vitals        └─ Event Enricher         │
│  ├─ Security Events                              │
│  └─ Audit Logs                                   │
│                                                  │
│  Alerting              Output                    │
│  ├─ DNS Change Alert   ├─ Dashboard Metrics      │
│  ├─ WHOIS Change Alert ├─ SIEM Export            │
│  ├─ API Key Expiry     ├─ Push Notifications     │
│  └─ Uptime Alert       └─ Webhook Dispatch       │
│                                                  │
│  Trigger Tasks                                  │
│  ├─ siem.trigger (scheduled SIEM sync)          │
│  ├─ uptime.trigger (periodic uptime checks)     │
│  ├─ monitoring.trigger (continuous monitoring)   │
│  └─ anomaly.trigger (anomaly detection runs)    │
└──────────────────────────────────────────────────┘
```

## Core Components

### SIEM Exporter (`server/security/siem-exporter.ts`)

Exports security events in standard SIEM formats (CEF, LEEF, JSON).

```typescript
interface SIEMEvent {
  timestamp: Date;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  source: string;
  target: string;
  action: string;
  outcome: "success" | "failure";
  details: Record<string, unknown>;
}

// Export formats
await siemExporter.export(event, { format: "cef" });   // ArcSight
await siemExporter.export(event, { format: "json" });  // Elastic/Splunk
await siemExporter.export(event, { format: "leef" });  // QRadar
```

### Uptime Monitor

Periodic health checks for project domains.

**Check types:**
- HTTP/HTTPS status check
- Response time monitoring
- SSL certificate expiry
- DNS resolution verification

**Schedule:** Configured per project, default every 5 minutes.

**Data stored in:** `uptimeLogs` table

### Anomaly Detection (`server/intelligence/anomaly/detector.ts`)

Detects unusual patterns in monitoring data.

**Detection methods:**
- Statistical outlier detection (z-score)
- Trend analysis (sudden changes)
- Baseline deviation (user-defined thresholds)
- Correlation analysis (multiple signals)

**Anomaly types:**
- Traffic spikes/drops
- DNS changes (new subdomains, record modifications)
- WHOIS changes (registrar, contact info)
- Performance degradation
- SSL certificate changes

### DNS Change Alert (`server/security/dns-change-alert.ts`)

Monitors DNS records for unauthorized changes.

**Monitored record types:**
- A/AAAA (IP changes)
- MX (mail server changes)
- NS (nameserver changes)
- TXT (SPF/DKIM/DMARC changes)
- CNAME (alias changes)

**Alert triggers:**
- Record added or removed
- Record value changed
- TTL changed significantly

### WHOIS Change Alert (`server/security/whois-change-alert.ts`)

Monitors WHOIS data for changes.

**Monitored fields:**
- Registrar changes
- Registrant contact changes
- Domain status changes
- Expiry date changes
- Nameserver changes

### API Key Expiry Alert (`server/security/api-key-expiry-alert.ts`)

Monitors API keys for upcoming expiration.

**Alert schedule:**
- 30 days before expiry: Info alert
- 7 days before expiry: Warning alert
- 1 day before expiry: Critical alert
- Expired: Emergency alert

### Monitoring Tab (Dashboard)

Real-time monitoring dashboard showing:
- Uptime status (up/down/degraded)
- Response time trends
- DNS change history
- WHOIS change history
- Active alerts
- Anomaly timeline

## Cron Job Structure

### SIEM Cron (`src/app/api/cron/siem/route.ts`)
```
Schedule: Every 5 minutes
1. Collect new security events
2. Correlate events into incidents
3. Export to configured SIEM endpoints
4. Update monitoring dashboard data
```

### Uptime Cron (`src/app/api/cron/uptime/route.ts`)
```
Schedule: Per-project interval (default 5 min)
1. For each active project:
   a. HTTP check
   b. DNS check
   c. SSL check
2. Store results in uptimeLogs
3. Compare with previous results
4. Trigger alerts on changes
```

## Event Severity Mapping

| Event Type | Default Severity | Escalation |
|------------|-----------------|------------|
| DNS nameserver changed | Critical | Immediate |
| WHOIS registrar changed | High | Within 1 hour |
| DNS A record changed | High | Within 1 hour |
| Uptime check failed | High | After 3 consecutive failures |
| SSL cert expiring <7 days | High | Daily |
| Response time >2s | Medium | Within 4 hours |
| DNS TXT record changed | Medium | Within 4 hours |
| Uptime degraded (slow) | Low | Within 24 hours |

## Alert Delivery

### Push Notifications (`server/notifications/push.ts`)
- Critical alerts: Immediate push notification
- High alerts: Push notification within 5 minutes
- Medium alerts: Batched in hourly digest
- Low alerts: Daily summary only

### Webhook Dispatch
```typescript
await webhookDispatcher.dispatch({
  projectId,
  event: "alert.triggered",
  payload: { severity, title, details },
});
```

## Adding a New Monitoring Check

1. **Define the check** in the appropriate module
2. **Add a data source** (API, DNS query, HTTP request)
3. **Implement the detector** (compare with previous state)
4. **Create an alert rule** (severity, delivery method)
5. **Add to cron schedule** or monitoring trigger
6. **Write tests** (unit + integration)
7. **Update the dashboard** to display new metrics

## Sharp Edges

### Alert fatigue
**Problem:** Too many low-severity alerts cause users to ignore critical ones.
**Fix:** Implement alert grouping, deduplication, and rate limiting per project.

### False positive DNS alerts
**Problem:** Legitimate DNS changes (CDN rotation) trigger alerts.
**Fix:** Allow users to whitelist expected changes. Implement change frequency baselines.

### Cron job overlap
**Problem:** Slow cron jobs overlap with the next scheduled run.
**Fix:** Use job-level locks or idempotency keys to prevent concurrent execution.

### SIEM export buffer overflow
**Problem:** High event volume fills the export buffer.
**Fix:** Implement backpressure and batch exports with configurable batch size.

## Validation Checklist

Before modifying SIEM/monitoring code:

- [ ] Alert severity matches the event impact
- [ ] Deduplication prevents alert storms
- [ ] Cron jobs don't overlap
- [ ] SIEM export handles network failures gracefully
- [ ] DNS/WHOIS changes are compared correctly
- [ ] Anomaly detection has appropriate thresholds
- [ ] Tests cover alert generation and suppression
- [ ] Dashboard reflects real-time state

## Related Skills
- `intelligence-engine` (core pipeline patterns)
- `trigger-dev` (background task patterns)
- `cyber-intelligence` (discovery and analysis)
- `security-auditor` (general security practices)

## When to Use
- User mentions SIEM, security event correlation, or log export
- User mentions uptime monitoring, health checks, or availability
- User mentions anomaly detection, alerting, or notification systems
- User mentions DNS monitoring, WHOIS changes, or certificate tracking

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

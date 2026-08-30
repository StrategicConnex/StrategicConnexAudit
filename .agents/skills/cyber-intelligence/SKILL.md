---
name: cyber-intelligence
description: "Expert in SCAUDIT's cyber intelligence capabilities: OSINT gathering, DNS analysis, subdomain discovery, shadow IT detection, CT monitor, and WHOIS history. Use when building or modifying intelligence discovery features."
risk: critical
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - osint
  - dns
  - subdomain
  - discovery
  - shadow-it
  - ct-monitor
  - whois
  - intelligence
---

# Cyber Intelligence Expert

Expert in SCAUDIT's cyber intelligence and OSINT capabilities. Covers DNS analysis, subdomain discovery, shadow IT detection, Certificate Transparency monitoring, and WHOIS history tracking.

## When to Use This Skill

- When working with the discovery engine (`src/server/intelligence/discovery/`)
- When modifying DNS brute-force or enumeration
- When building shadow IT detection (`shadow-detector.ts`)
- When working with CT monitor (`ct-monitor.ts`)
- When modifying WHOIS history tracking
- When building the intelligence discovery trigger
- When working with the asset graph or drift analysis

## Architecture

```
┌──────────────────────────────────────────────┐
│           Cyber Intelligence Engine           │
├──────────────────────────────────────────────┤
│                                              │
│  Discovery (src/server/intelligence/discovery/) │
│  ├─ orchestrator.ts   (coordinates all)      │
│  ├─ dns-brute.ts      (DNS enumeration)      │
│  ├─ ct-monitor.ts     (Certificate Trans.)   │
│  └─ shadow-detector.ts (Shadow IT)           │
│                                              │
│  History (src/server/intelligence/history/)   │
│  ├─ dns-history.ts    (DNS record tracking)  │
│  ├─ whois-history.ts  (WHOIS change tracking)│
│  └─ orchestrator.ts   (history pipeline)     │
│                                              │
│  Storage                                     │
│  ├─ intelligenceAssets (discovered assets)   │
│  └─ intelligenceInvestigations (sessions)    │
│                                              │
│  Trigger Task: discovery.trigger.ts          │
└──────────────────────────────────────────────┘
```

## Core Components

### Discovery Orchestrator (`discovery/orchestrator.ts`)

Coordinates all discovery sub-engines:

```typescript
interface DiscoveryResult {
  assets: IntelligenceAsset[];
  subdomains: string[];
  ipAddresses: string[];
  certificates: CertificateInfo[];
  shadowAssets: ShadowAsset[];
}

async function runDiscovery(target: string, projectId: string): Promise<DiscoveryResult> {
  // 1. DNS Brute-force: enumerate subdomains
  const subdomains = await dnsBrute.enumerate(target);
  
  // 2. CT Monitor: find certificates
  const certificates = await ctMonitor.getCertificates(target);
  
  // 3. Shadow Detector: find unauthorized assets
  const shadowAssets = await shadowDetector.detect(target, projectId);
  
  // 4. Resolve IPs for all discovered subdomains
  const ipAddresses = await resolveIPs(subdomains);
  
  // 5. Store all assets
  const assets = await storeAssets(projectId, {
    subdomains, ipAddresses, certificates, shadowAssets,
  });
  
  return { assets, subdomains, ipAddresses, certificates, shadowAssets };
}
```

### DNS Brute-Force (`discovery/dns-brute.ts`)

Enumerates subdomains through DNS queries.

**Techniques:**
- Dictionary-based brute force
- DNS zone transfer attempts
- Passive DNS data
- Certificate Transparency log parsing

```typescript
const subdomains = await dnsBrute.enumerate("example.com", {
  wordlist: "common",          // or "extended" for thorough scan
  maxDepth: 2,                 // recursion depth
  timeout: 5000,               // per-query timeout
  concurrency: 10,             // parallel queries
});
```

### CT Monitor (`discovery/ct-monitor.ts`)

Monitors Certificate Transparency logs for new certificates.

```typescript
// Get all certificates for a domain
const certs = await ctMonitor.getCertificates("example.com", {
  includeExpired: false,
  daysBack: 365,
});

// Each certificate reveals:
// - Subdomains (in SAN)
// - Issuing CA
// - Expiry dates
// - Certificate chain
```

### Shadow IT Detector (`discovery/shadow-detector.ts`)

Detects unauthorized or unknown assets associated with a project.

**Detection methods:**
- Compare discovered assets against known inventory
- Flag assets not in the project's asset list
- Check for orphaned subdomains
- Detect third-party services using project domain

```typescript
const shadowAssets = await shadowDetector.detect("example.com", projectId, {
  knownAssets: projectAssets,
  externalServices: ["cloudflare", "aws", "vercel"],
  alertThreshold: "medium",
});
```

### DNS History (`history/dns-history.ts`)

Tracks DNS record changes over time.

```typescript
// Records a snapshot of DNS records
await dnsHistory.snapshot("example.com", {
  records: await dnsResolver.resolveAll("example.com"),
});

// Detects changes since last snapshot
const changes = await dnsHistory.detectChanges("example.com");
// Returns: { added: [...], removed: [...], modified: [...] }
```

### WHOIS History (`history/whois-history.ts`)

Tracks WHOIS record changes over time.

```typescript
const changes = await whoisHistory.detectChanges("example.com");
// Returns changes in:
// - Registrar
// - Registrant contact
// - Nameservers
// - Domain status
// - Expiry date
```

### Drift Analysis (`core/drift-analyzer.ts`)

Compares current state against expected state:

```typescript
const drift = await driftAnalyzer.analyze("example.com", {
  expected: {
    nameservers: ["ns1.example.com", "ns2.example.com"],
    mxRecords: ["mail.example.com"],
    ips: ["1.2.3.4"],
  },
  current: await dnsResolver.resolveAll("example.com"),
});

// Returns drift score and specific differences
```

## Asset Types

| Type | Description | Source |
|------|-------------|--------|
| `subdomain` | Discovered subdomain | DNS brute, CT logs |
| `ip` | IP address | DNS resolution |
| `certificate` | SSL certificate | CT monitor |
| `shadow` | Unauthorized asset | Shadow detector |
| `technology` | Detected technology | Web fingerprinting |

## Intelligence Investigation Flow

```
1. User creates investigation with target
2. Discovery engine runs all sub-engines
3. Assets stored in intelligenceAssets
4. Findings generated for security issues
5. Results streamed to dashboard via SSE
6. AI analyst summarizes findings
7. Investigation marked as completed
```

## Sharp Edges

### DNS rate limiting
**Problem:** DNS providers rate-limit brute-force queries.
**Fix:** Use respectful concurrency (10-20 parallel queries). Implement backoff on rate limit errors.

### CT log completeness
**Problem:** CT logs don't include all certificates (e.g., internal CAs).
**Fix:** Combine CT monitoring with DNS brute-force for complete coverage.

### Shadow false positives
**Problem:** Legitimate third-party services flagged as shadow IT.
**Fix:** Maintain an allowlist of known third-party services per project.

### Stale DNS data
**Problem:** Cached DNS results don't reflect current state.
**Fix:** Use fresh DNS resolution (bypass cache) for security-critical checks.

## Validation Checklist

Before modifying intelligence discovery code:

- [ ] All DNS queries use proper timeout and error handling
- [ ] CT monitor handles API rate limits
- [ ] Shadow detector has an allowlist for false positive reduction
- [ ] Assets are stored with proper deduplication
- [ ] History snapshots are created for change detection
- [ ] Tests cover both success and failure scenarios
- [ ] Discovery results are streamed to the UI

## Related Skills
- `intelligence-engine` (core pipeline patterns)
- `adversary-simulation` (attack simulation)
- `siem-monitoring` (change alerting)
- `007` (comprehensive security audit)

## When to Use
- User mentions OSINT, discovery, or reconnaissance
- User mentions DNS analysis, subdomain enumeration, or CT logs
- User mentions shadow IT, unknown assets, or asset discovery
- User mentions WHOIS history, DNS history, or drift analysis

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

---
name: real-time-data
description: "Expert in real-time data patterns in SCAUDIT: polling, live metrics, Server-Sent Events (SSE), and realtime subscriptions. Use when building or modifying live-updating features."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - realtime
  - polling
  - sse
  - live-metrics
  - streaming
  - websocket
  - subscriptions
---

# Real-Time Data Expert

Expert in real-time data patterns for SCAUDIT. Covers polling, live metrics, Server-Sent Events, and streaming intelligence results.

## When to Use This Skill

- When building or modifying the LiveMetricsBar
- When working with `useRealtimeMetrics` hook
- When implementing SSE endpoints (e.g., PDF progress, intelligence runs)
- When building live monitoring dashboards
- When streaming intelligence investigation results
- When implementing polling for async operations

## Real-Time Patterns in SCAUDIT

### 1. Polling (Primary Pattern)

Used for most live-updating features. Simple, reliable, works everywhere.

```typescript
// useRealtimeMetrics hook
export function useRealtimeMetrics(projectId: string, intervalMs = 5000) {
  const [metrics, setMetrics] = useState(null);
  
  useEffect(() => {
    const fetch = async () => {
      const data = await fetch(`/api/monitoring?projectId=${projectId}`);
      setMetrics(await data.json());
    };
    
    fetch();
    const interval = setInterval(fetch, intervalMs);
    return () => clearInterval(interval);
  }, [projectId, intervalMs]);
  
  return metrics;
}
```

**When to use:** Dashboard metrics, monitoring data, status updates.

### 2. Server-Sent Events (SSE)

Used for one-way streaming from server to client.

```typescript
// Server endpoint
export async function GET(request: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      
      // Stream progress updates
      const interval = setInterval(() => {
        send("progress", { percent: getProgress() });
      }, 1000);
      
      // Cleanup
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// Client consumption
const eventSource = new EventSource("/api/reports/pdf/progress?jobId=123");
eventSource.addEventListener("progress", (event) => {
  const { percent } = JSON.parse(event.data);
  setProgress(percent);
});
```

**When to use:** PDF generation progress, long-running scans, intelligence investigations.

### 3. Intelligence Run Streaming

For streaming intelligence investigation results in real-time:

```typescript
// API Route: /api/intelligence/runs
// Streams tool execution results as they complete

// Client: Tab with live investigation progress
useEffect(() => {
  const eventSource = new EventSource(
    `/api/intelligence/live?investigationId=${id}`
  );
  
  eventSource.addEventListener("tool_complete", (e) => {
    const result = JSON.parse(e.data);
    setResults(prev => [...prev, result]);
  });
  
  eventSource.addEventListener("investigation_complete", () => {
    eventSource.close();
    refetchInvestigation();
  });
  
  return () => eventSource.close();
}, [id]);
```

### 4. LiveMetricsBar Pattern

Real-time metrics displayed in the dashboard header:

```typescript
// src/features/dashboard/LiveMetricsBar.tsx
// Shows: uptime %, active findings, last scan time
// Updates via polling every 10 seconds
```

## Implementation Guidelines

### Polling Best Practices

- **Debounce rapid updates:** Don't poll faster than the UI can render
- **Exponential backoff on errors:** If polling fails, increase interval
- **Cleanup on unmount:** Always clear intervals
- **Stale data handling:** Show "last updated" timestamp

### SSE Best Practices

- **Handle connection drops:** Reconnect with backoff
- **Send keepalive:** Prevent proxy timeouts (every 30s)
- **Use abort controller:** Clean up server resources on disconnect
- **Event naming:** Use descriptive event names

### Error Handling

```typescript
// Robust polling with error handling
useEffect(() => {
  let retryCount = 0;
  const maxRetries = 5;
  
  const fetch = async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      retryCount = 0; // Reset on success
    } catch (error) {
      retryCount++;
      if (retryCount > maxRetries) {
        setError("Connection lost");
        return;
      }
      // Exponential backoff
      const delay = Math.min(1000 * 2 ** retryCount, 30000);
      setTimeout(fetch, delay);
    }
  };
  
  fetch();
  const interval = setInterval(fetch, baseInterval);
  return () => clearInterval(interval);
}, [url]);
```

## Sharp Edges

### Memory leaks from uncleared intervals
**Problem:** Polling intervals not cleaned up on component unmount.
**Fix:** Always return cleanup function from useEffect. Use AbortController for SSE.

### SSE connection limits
**Problem:** Browser limits SSE connections per domain (6 in Chrome).
**Fix:** Use a single SSE connection multiplexed with event types, or fall back to polling.

### Race conditions
**Problem:** Slow poll response arrives after a newer one, showing stale data.
**Fix:** Use request timestamps. Discard responses older than the latest received.

## Related Skills
- `trigger-dev` (background task patterns)
- `tanstack-query-expert` (data fetching patterns)
- `zustand-store-ts` (state management)

## When to Use
- User mentions real-time, live, polling, or streaming
- User mentions SSE, EventSource, or server-sent events
- User needs to display live-updating metrics or progress

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

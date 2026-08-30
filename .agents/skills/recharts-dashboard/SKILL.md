---
name: recharts-dashboard
description: "Expert in Recharts for dashboard charts, ScoreGauge, LiveMetricsBar, and data visualization in SCAUDIT. Use when building or modifying chart-based visualizations."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - recharts
  - charts
  - dashboard
  - visualization
  - metrics
  - gauge
  - data-viz
---

# Recharts Dashboard Expert

Expert in Recharts for building dashboard charts, gauges, and data visualizations in SCAUDIT.

## When to Use This Skill

- When building or modifying dashboard charts
- When working with the ScoreGauge component
- When building the LiveMetricsBar
- When creating the BenchmarkingSection
- When visualizing audit results, keyword rankings, or performance metrics
- When building custom chart components

## Core Chart Types in SCAUDIT

### ScoreGauge (`src/features/dashboard/ScoreGauge.tsx`)
Circular gauge showing overall score (0-100).

### LiveMetricsBar (`src/features/dashboard/LiveMetricsBar.tsx`)
Real-time updating bar showing key metrics.

### BenchmarkingSection (`src/features/dashboard/BenchmarkingSection.tsx`)
Comparison charts showing project metrics vs. industry benchmarks.

## Common Patterns

### Area Chart (Trend over time)
```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <defs>
      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
      </linearGradient>
    </defs>
    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
    <YAxis domain={[0, 100]} />
    <Tooltip />
    <Area type="monotone" dataKey="score" stroke="#8b5cf6" fill="url(#colorScore)" />
  </AreaChart>
</ResponsiveContainer>
```

### Bar Chart (Comparisons)
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

<BarChart data={findingsByCategory}>
  <XAxis dataKey="category" />
  <YAxis />
  <Tooltip />
  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
    {data.map((entry, index) => (
      <Cell key={index} fill={severityColors[entry.severity]} />
    ))}
  </Bar>
</BarChart>
```

### Radar Chart (Multi-dimensional)
```tsx
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={300}>
  <RadarChart data={securityDimensions}>
    <PolarGrid />
    <PolarAngleAxis dataKey="dimension" />
    <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
  </RadarChart>
</ResponsiveContainer>
```

### Line Chart (Time series)
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

<LineChart data={rankHistory}>
  <XAxis dataKey="date" />
  <YAxis reversed domain={[1, 100]} />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="position" stroke="#8b5cf6" dot={false} />
</LineChart>
```

## Design System Colors

SCAUDIT uses these chart colors consistently:

```typescript
export const chartColors = {
  primary: "#8b5cf6",      // Purple (brand)
  success: "#22c55e",      // Green
  warning: "#eab308",      // Yellow
  danger: "#ef4444",       // Red
  info: "#3b82f6",         // Blue
  muted: "#6b7280",        // Gray
  
  severity: {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#22c55e",
    info: "#3b82f6",
  },
  
  // Theme-aware gradients
  gradients: {
    purple: ["#8b5cf6", "#a78bfa"],
    blue: ["#3b82f6", "#60a5fa"],
    green: ["#22c55e", "#4ade80"],
  },
};
```

## ResponsiveContainer Pattern

Always wrap charts in ResponsiveContainer for responsive behavior:

```tsx
<div className="w-full h-[300px]">
  <ResponsiveContainer width="100%" height="100%">
    <YourChart data={data} />
  </ResponsiveContainer>
</div>
```

## Theme Support

Charts respect the active theme via CSS variables:

```typescript
// Access theme colors from CSS variables
const textColor = "hsl(var(--foreground))";
const mutedColor = "hsl(var(--muted-foreground))";
const gridColor = "hsl(var(--border))";
```

## Sharp Edges

### Empty data crash
**Problem:** Charts crash when data array is empty.
**Fix:** Always check `data.length > 0` before rendering. Show an empty state component when no data.

### ResponsiveContainer height
**Problem:** Chart has zero height because ResponsiveContainer has no explicit height.
**Fix:** Always provide a parent container with explicit height, or set `height` on ResponsiveContainer.

### Animation jank on updates
**Problem:** Chart re-renders cause visible layout shifts.
**Fix:** Use `isAnimationActive={false}` for real-time data. Use `key={dataKey}` to force remount on data change.

## Validation Checklist

Before modifying chart components:

- [ ] ResponsiveContainer wraps the chart
- [ ] Empty data is handled gracefully
- [ ] Colors use the theme system (CSS variables)
- [ ] Charts are accessible (aria labels)
- [ ] Performance is acceptable with expected data volume
- [ ] Tooltip shows relevant information
- [ ] Responsive on mobile and desktop

## Related Skills
- `react-flow-graphs` (graph visualizations)
- `shadcn` (UI component patterns)
- `tailwind-patterns` (styling)

## When to Use
- User mentions charts, graphs, or data visualization
- User mentions Recharts, gauge, metrics, or dashboard
- User needs to display time-series, comparisons, or score data

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

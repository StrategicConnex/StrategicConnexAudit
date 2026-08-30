---
name: react-flow-graphs
description: "Expert in ReactFlow for attack surface graphs, asset relationship visualization, and interactive network topology in SCAUDIT. Use when building or modifying graph-based visualizations."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - reactflow
  - graphs
  - visualization
  - attack-surface
  - network-topology
  - assets
---

# ReactFlow Graphs Expert

Expert in ReactFlow for building interactive attack surface graphs and asset relationship visualizations in SCAUDIT.

## When to Use This Skill

- When building or modifying the attack surface graph (`src/features/dashboard/AttackSurfaceGraph.tsx`)
- When creating asset relationship visualizations
- When building network topology views
- When working with the intelligence graph API (`src/app/api/intelligence/graph/route.ts`)
- When visualizing adversary attack paths
- When displaying asset dependency graphs

## Core Concepts

### ReactFlow in SCAUDIT

ReactFlow renders interactive, zoomable node-and-edge graphs. Used for:

1. **Attack Surface Graph** — Shows discovered assets and their relationships
2. **Asset Graph** — Shows asset dependencies and connections
3. **Attack Path** — Shows adversary traversal paths

### Data Flow

```
API Route (/api/intelligence/graph)
    → Fetch assets + relationships from DB
    → Transform to ReactFlow nodes/edges
    → Pass to AttackSurfaceGraph component
    → Render with custom node types
```

### Custom Node Types

| Node Type | Component | Represents |
|-----------|-----------|------------|
| `domain` | DomainNode | Root domain or subdomain |
| `ip` | IPNode | IP address |
| `service` | ServiceNode | Running service/port |
| `vulnerability` | VulnNode | Security finding |
| `technology` | TechNode | Detected technology |

### Node Styling by Severity

```typescript
const severityColors = {
  critical: "#ef4444",  // red
  high: "#f97316",      // orange
  medium: "#eab308",    // yellow
  low: "#22c55e",       // green
  info: "#3b82f6",      // blue
};
```

## Graph Transformation Pattern

```typescript
// Transform intelligence assets to ReactFlow format
function transformToGraph(assets: IntelligenceAsset[], findings: IntelligenceFinding[]) {
  const nodes: Node[] = assets.map(asset => ({
    id: asset.id,
    type: getNodeType(asset.assetType),
    position: { x: 0, y: 0 },  // Layout engine will position
    data: {
      label: asset.value,
      type: asset.assetType,
      ip: asset.ip,
      severity: getHighestSeverity(findings, asset.id),
      metadata: asset.metadata,
    },
  }));

  const edges: Edge[] = buildEdgesFromAssets(assets);

  return { nodes, edges };
}
```

## Layout Algorithms

### Hierarchical Layout (Default)
Best for domain → subdomain → IP → service trees.

### Force-Directed Layout
Best for complex networks with many cross-connections.

### Radial Layout
Best for showing a single asset and its relationships.

```typescript
import dagre from "dagre";

function hierarchicalLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });

  nodes.forEach(node => g.setNode(node.id, { width: 200, height: 60 }));
  edges.forEach(edge => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - 100, y: pos.y - 30 } };
  });
}
```

## Interactive Features

### Click Handlers
```typescript
const onNodeClick = useCallback((event, node) => {
  setSelectedAsset(node.data);
  // Show details panel
}, []);
```

### Minimap
```typescript
<MiniMap
  nodeColor={(node) => severityColors[node.data.severity] ?? "#6b7280"}
  maskColor="rgba(0,0,0,0.3)"
/>
```

### Controls
```typescript
<Controls showInteractive={false} />
```

## Sharp Edges

### Performance with many nodes
**Problem:** Graph becomes slow with 500+ nodes.
**Fix:** Implement virtualization (`reactflow` supports it), or paginate/lazy-load nodes. Use `useReactFlow().setNodes()` instead of re-rendering the entire component.

### Layout recalculation
**Problem:** Layout changes on every data update cause jarring repositioning.
**Fix:** Cache layout positions. Only recalculate when the graph structure changes (nodes added/removed), not when node data changes.

### Edge crossing
**Problem:** Edges overlap making the graph unreadable.
**Fix:** Use dagre for hierarchical layout, or implement edge routing with obstacle avoidance.

## Validation Checklist

Before modifying graph components:

- [ ] Custom node types are registered
- [ ] Layout algorithm handles the data structure
- [ ] Performance is acceptable for expected node count
- [ ] Click handlers have proper TypeScript types
- [ ] Minimap and controls are configured
- [ ] Edge labels are readable
- [ ] Color coding matches severity levels
- [ ] Tests cover graph transformation logic

## Related Skills
- `recharts-dashboard` (chart-based visualizations)
- `intelligence-engine` (data source)
- `cyber-intelligence` (asset discovery)

## When to Use
- User mentions attack surface graph, network topology, or asset visualization
- User mentions ReactFlow, nodes, edges, or graph layout
- User needs to display relationships between intelligence assets

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

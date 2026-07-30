'use client';

import { useState, useMemo, useCallback } from 'react';

interface AttackSurfaceNode {
  id: string;
  label: string;
  sublabel?: string;
  type: 'domain' | 'ip' | 'mx' | 'ns' | 'cdn' | 'asn';
  severity?: 'safe' | 'warning' | 'critical';
  x: number;
  y: number;
}

interface AttackSurfaceEdge {
  from: string;
  to: string;
  animated?: boolean;
}

interface AttackSurfaceGraphProps {
  target: string;
  metadata?: {
    asnGeo?: {
      ipAddress?: string | null;
      asn?: string | null;
      asName?: string | null;
      cityName?: string | null;
      countryCode?: string | null;
    } | null;
    whois?: {
      nameservers?: string[];
    } | null;
    cdnWaf?: {
      detected?: boolean;
      name?: string | null;
    } | null;
    spfParsed?: { isWeak?: boolean } | null;
    dmarcParsed?: { policy?: string } | null;
    reverseDns?: string[] | null;
  } | null;
  score?: number | null;
}

const NODE_COLORS: Record<string, { stroke: string; fill: string; glow: string; label: string }> = {
  domain:  { stroke: '#6271C4', fill: 'rgba(98,113,196,0.12)',   glow: 'rgba(98,113,196,0.6)',   label: 'Dominio' },
  ip:      { stroke: '#6271C4', fill: 'rgba(98,113,196,0.12)', glow: 'rgba(98,113,196,0.6)', label: 'IP' },
  mx:      { stroke: '#EBA52D', fill: 'rgba(235,165,45,0.12)',  glow: 'rgba(235,165,45,0.6)',  label: 'MX' },
  ns:      { stroke: '#6271C4', fill: 'rgba(98,113,196,0.12)',  glow: 'rgba(98,113,196,0.6)',  label: 'NS' },
  cdn:     { stroke: '#8BC34A', fill: 'rgba(140,200,80,0.12)',  glow: 'rgba(140,200,80,0.6)',  label: 'CDN/WAF' },
  asn:     { stroke: '#D4373C', fill: 'rgba(212,55,60,0.12)',  glow: 'rgba(212,55,60,0.6)',  label: 'ASN' },
};

const SEVERITY_OVERLAY: Record<string, string> = {
  critical: 'rgba(212,55,60,0.3)',
  warning: 'rgba(235,165,45,0.2)',
  safe: 'transparent',
};

export function AttackSurfaceGraph({ target, metadata, score }: AttackSurfaceGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: AttackSurfaceNode } | null>(null);
  const [dynamicNodes, setDynamicNodes] = useState<AttackSurfaceNode[]>([]);
  const [dynamicEdges, setDynamicEdges] = useState<AttackSurfaceEdge[]>([]);
  const [loadingNode, setLoadingNode] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const ns: AttackSurfaceNode[] = [];
    const es: AttackSurfaceEdge[] = [];

    // Central domain node
    const domainSeverity = score != null ? (score >= 70 ? 'safe' : score >= 45 ? 'warning' : 'critical') : 'safe';
    ns.push({ id: 'domain', label: target, sublabel: 'Dominio Principal', type: 'domain', severity: domainSeverity, x: 200, y: 155 });

    // IP / ASN node
    const ip = metadata?.asnGeo?.ipAddress;
    if (ip) {
      ns.push({
        id: 'ip',
        label: ip,
        sublabel: metadata?.asnGeo?.cityName || 'IP',
        type: 'ip',
        severity: 'safe',
        x: 340, y: 90,
      });
      es.push({ from: 'domain', to: 'ip', animated: true });
    }

    // ASN node
    const asn = metadata?.asnGeo?.asn;
    if (asn) {
      ns.push({
        id: 'asn',
        label: asn,
        sublabel: (metadata?.asnGeo?.asName || 'ASN').substring(0, 20),
        type: 'asn',
        severity: 'safe',
        x: 355, y: 230,
      });
      es.push({ from: 'ip' in ns.map(n=>n.id) ? 'ip' : 'domain', to: 'asn', animated: false });
    }

    // Nameservers
    const nameservers = metadata?.whois?.nameservers?.slice(0, 2) || [];
    nameservers.forEach((nsv, i) => {
      const id = `ns_${i}`;
      ns.push({
        id,
        label: nsv.length > 22 ? nsv.substring(0, 22) + '…' : nsv,
        sublabel: 'Nameserver',
        type: 'ns',
        severity: 'safe',
        x: 65 + i * 15,
        y: 75 + i * 80,
      });
      es.push({ from: 'domain', to: id, animated: true });
    });

    // CDN / WAF node
    if (metadata?.cdnWaf?.detected) {
      ns.push({
        id: 'cdn',
        label: metadata.cdnWaf.name || 'CDN/WAF',
        sublabel: 'Protección perimetral',
        type: 'cdn',
        severity: 'safe',
        x: 200, y: 50,
      });
      es.push({ from: 'domain', to: 'cdn', animated: true });
    }

    // MX synthetic node (if SPF exists it implies mail servers)
    if (metadata?.spfParsed) {
      const mxSeverity = metadata.spfParsed.isWeak ? 'warning' : 'safe';
      ns.push({
        id: 'mx',
        label: metadata.dmarcParsed?.policy === 'reject' ? 'MX Protegido' : 'MX Expuesto',
        sublabel: `DMARC: ${metadata.dmarcParsed?.policy || 'none'}`,
        type: 'mx',
        severity: mxSeverity,
        x: 110, y: 255,
      });
      es.push({ from: 'domain', to: 'mx', animated: false });
    }

    return { nodes: [...ns, ...dynamicNodes], edges: [...es, ...dynamicEdges] };
  }, [target, metadata, score, dynamicNodes, dynamicEdges]);

  const handleNodeClick = useCallback(async (node: AttackSurfaceNode) => {
    if (loadingNode === node.id) return;
    setLoadingNode(node.id);
    try {
      const res = await fetch(`/api/intelligence/graph?nodeId=${encodeURIComponent(node.id)}`);
      const data = await res.json();
      if (data.success) {
        setDynamicNodes(prev => {
          const newNodes = data.nodes.filter((n: any) => !prev.some(p => p.id === n.id) && !nodes.some((base: any) => base.id === n.id));
          return [...prev, ...newNodes];
        });
        setDynamicEdges(prev => {
          const newEdges = data.edges.filter((e: any) => !prev.some(p => p.from === e.from && p.to === e.to) && !edges.some((base: any) => base.from === e.from && base.to === e.to));
          return [...prev, ...newEdges];
        });
      }
    } catch (err) {
      console.error("Failed to load adjacent nodes", err);
    } finally {
      setLoadingNode(null);
    }
  }, [loadingNode, target, metadata, score]);

  const handleMouseEnter = (node: AttackSurfaceNode, e: React.MouseEvent) => {
    const svgEl = e.currentTarget.closest('svg') as SVGSVGElement;
    const pt = svgEl.createSVGPoint();
    pt.x = node.x;
    pt.y = node.y;
    setHoveredNode(node.id);
    setTooltip({ x: node.x, y: node.y, node });
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    setTooltip(null);
  };

  return (
    <div className="relative w-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(NODE_COLORS).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.stroke }} />
            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">{cfg.label}</span>
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-[#050508] border border-white/[0.04]">
        <svg
          viewBox="0 0 410 310"
          className="w-full"
          style={{ minHeight: '200px', maxHeight: '280px' }}
        >
          <defs>
            {/* Animated dash flow marker */}
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.2)" />
            </marker>

            {/* Grid background */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.018)" strokeWidth="0.5" />
            </pattern>

            {/* Glow filters for each node type */}
            {Object.entries(NODE_COLORS).map(([type, cfg]) => (
              <filter key={type} id={`glow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor={cfg.stroke} floodOpacity="0.4" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Background grid */}
          <rect width="410" height="310" fill="url(#grid)" />

          {/* Subtle radial gradient center */}
          <radialGradient id="center-glow" cx="49%" cy="50%" r="40%">
            <stop offset="0%" stopColor="rgba(98,113,196,0.05)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <rect width="410" height="310" fill="url(#center-glow)" />

          {/* Edges */}
          {edges.map((edge, i) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            const isHovered = hoveredNode === edge.from || hoveredNode === edge.to;
            return (
              <g key={i}>
                <line
                  x1={fromNode.x} y1={fromNode.y}
                  x2={toNode.x} y2={toNode.y}
                  stroke={isHovered ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isHovered ? 1.5 : 1}
                  strokeDasharray={edge.animated ? '5 5' : undefined}
                  style={edge.animated ? {
                    animation: `dash-flow 2.5s linear infinite`,
                  } : undefined}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const cfg = NODE_COLORS[node.type];
            const isHovered = hoveredNode === node.id;
            const isMain = node.type === 'domain';
            const r = isMain ? 26 : 18;
            const severityOverlay = node.severity ? SEVERITY_OVERLAY[node.severity] : 'transparent';

            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer', opacity: loadingNode === node.id ? 0.6 : 1 }}
                onMouseEnter={(e) => handleMouseEnter(node, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleNodeClick(node)}
              >
                {/* Severity pulse ring */}
                {node.severity === 'critical' && (
                  <circle
                    cx={node.x} cy={node.y} r={r + 8}
                    fill="none"
                    stroke="rgba(212,55,60,0.3)"
                    strokeWidth="1"
                    style={{ animation: 'pulse-ring 2s ease-in-out infinite' }}
                  />
                )}
                {node.severity === 'warning' && (
                  <circle
                    cx={node.x} cy={node.y} r={r + 6}
                    fill="none"
                    stroke="rgba(235,165,45,0.25)"
                    strokeWidth="1"
                    style={{ animation: 'pulse-ring 3s ease-in-out infinite' }}
                  />
                )}

                {/* Main node background */}
                <circle
                  cx={node.x} cy={node.y} r={r}
                  fill={cfg.fill}
                  stroke={cfg.stroke}
                  strokeWidth={isHovered ? 2.5 : isMain ? 2 : 1.5}
                  filter={isHovered ? `url(#glow-${node.type})` : undefined}
                  style={{ transition: 'stroke-width 0.2s, r 0.2s' }}
                />

                {/* Severity overlay tint */}
                {severityOverlay !== 'transparent' && (
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={severityOverlay}
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Node type label inside */}
                <text
                  x={node.x} y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isMain ? 7 : 6}
                  fontWeight="800"
                  fill={cfg.stroke}
                  letterSpacing="0.08em"
                  style={{ userSelect: 'none', pointerEvents: 'none', textTransform: 'uppercase' }}
                >
                  {NODE_COLORS[node.type].label}
                </text>

                {/* Node label below */}
                <text
                  x={node.x}
                  y={node.y + r + 10}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="600"
                  fill="rgba(255,255,255,0.7)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {node.label.length > 20 ? node.label.substring(0, 20) + '…' : node.label}
                </text>
              </g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect
                x={Math.min(tooltip.x + 15, 280)}
                y={tooltip.y - 28}
                width="125"
                height="50"
                rx="6"
                fill="#0a0a10"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="0.8"
              />
              <text
                x={Math.min(tooltip.x + 23, 288)}
                y={tooltip.y - 12}
                fontSize="7.5"
                fontWeight="700"
                fill="rgba(255,255,255,0.9)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {NODE_COLORS[tooltip.node.type].label}
              </text>
              <text
                x={Math.min(tooltip.x + 23, 288)}
                y={tooltip.y + 2}
                fontSize="6.5"
                fill="rgba(255,255,255,0.55)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {tooltip.node.label.length > 22 ? tooltip.node.label.substring(0, 22) + '…' : tooltip.node.label}
              </text>
              {tooltip.node.sublabel && (
                <text
                  x={Math.min(tooltip.x + 23, 288)}
                  y={tooltip.y + 14}
                  fontSize="6"
                  fill="rgba(255,255,255,0.35)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {tooltip.node.sublabel}
                </text>
              )}
            </g>
          )}

          {/* CSS animations injected */}
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -20; }
            }
            @keyframes pulse-ring {
              0%, 100% { opacity: 0.3; transform-origin: center; transform: scale(1); }
              50% { opacity: 0.8; transform: scale(1.08); }
            }
          `}</style>
        </svg>

        {/* Empty state */}
        {nodes.length <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-fg font-bold">Datos de red insuficientes para visualizar</p>
          </div>
        )}
      </div>

      {/* Node count summary */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">
          {nodes.length} nodos · {edges.length} conexiones
        </span>
        {nodes.some(n => n.severity === 'critical') && (
          <span className="text-[9px] font-extrabold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded uppercase tracking-wider">
            ⚠ Riesgo Crítico Detectado
          </span>
        )}
      </div>
    </div>
  );
}

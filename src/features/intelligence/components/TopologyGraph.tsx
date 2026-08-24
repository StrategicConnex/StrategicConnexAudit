"use client";

import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge
} from "reactflow";
import "reactflow/dist/style.css";

interface TopologyGraphProps {
  projectId: string;
}

export function TopologyGraph({ projectId }: TopologyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/intelligence/assets/graph?projectId=${projectId}`);
        const json = await res.json();
        if (json.success && json.data && !cancelled) {
          setNodes(json.data.nodes || []);
          setEdges(json.data.edges || []);
        }
      } catch (error) {
        if (!cancelled) console.error("Failed to load graph data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: { source: string | null; target: string | null; sourceHandle: string | null; targetHandle: string | null }) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-[500px] bg-gray-900 border border-border rounded text-primary font-mono">
        <span className="animate-pulse">Loading Topology...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] bg-card border border-border rounded overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="react-flow-dark-theme"
      >
        <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
        <MiniMap 
          nodeColor={(node) => {
            if (node.data?.isVulnerable) return '#D4373C';
            if (node.data?.type === 'root') return '#6271C4';
            return '#8BC34A';
          }}
          className="bg-gray-900 border-gray-800"
        />
        <Background color="#374151" gap={16} />
      </ReactFlow>
      
      {/* Estilos inline para forzar tema oscuro en ReactFlow base */}
      <style dangerouslySetInnerHTML={{__html: `
        .react-flow-dark-theme .react-flow__node {
          background: #1f2937;
          color: #f3f4f6;
          border: 1px solid #374151;
          border-radius: 4px;
          padding: 10px;
          font-family: monospace;
          font-size: 12px;
        }
        .react-flow-dark-theme .react-flow__node[data-is-vulnerable="true"] {
          border-color: #ef4444;
          box-shadow: 0 0 10px rgba(239,68,68,0.2);
        }
        .react-flow-dark-theme .react-flow__handle {
          background: #10b981;
        }
      `}} />
    </div>
  );
}

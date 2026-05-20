"use client";

import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge
} from "reactflow";
import "reactflow/dist/style.css";

interface AttackSurfaceGraphProps {
  projectId: string;
}

export function AttackSurfaceGraph({ projectId }: AttackSurfaceGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/intelligence/assets/graph?projectId=${projectId}`);
      const json = await res.json();
      
      if (json.success && json.data) {
        setNodes(json.data.nodes || []);
        setEdges(json.data.edges || []);
      }
    } catch (error) {
      console.error("Failed to load graph data:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, setNodes, setEdges]);

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-[500px] bg-gray-900 border border-gray-800 rounded text-emerald-500 font-mono">
        <span className="animate-pulse">Loading Topology...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] bg-gray-950 border border-gray-800 rounded overflow-hidden">
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
            if (node.data?.isVulnerable) return '#ef4444';
            if (node.data?.type === 'root') return '#8b5cf6';
            return '#10b981';
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

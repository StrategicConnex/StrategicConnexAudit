import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { withRLS } from "@/shared/db/rls";
import { intelligenceAssets, intelligenceFindings } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";

/**
 * Genera un grafo topológico (nodos y aristas compatibles con React Flow)
 * a partir de los assets y hallazgos descubiertos en las investigaciones de un proyecto.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // 1. Cargar Assets y Hallazgos del Proyecto bajo el contexto RLS del usuario
    // (aísla multi-tenant: el usuario solo puede leer proyectos que le pertenecen)
    const { assets, findings } = await withRLS(user.id, async (tx) => {
      const assets = await tx.query.intelligenceAssets.findMany({
        where: eq(intelligenceAssets.projectId, projectId)
      });

      const findings = await tx.query.intelligenceFindings.findMany({
        where: eq(intelligenceFindings.projectId, projectId)
      });

      return { assets, findings };
    });

    type GraphNode = {
      id: string;
      type: string;
      data: Record<string, unknown>;
      position: { x: number; y: number };
    };
    type GraphEdge = {
      id: string;
      source: string;
      target: string;
      animated?: boolean;
      style?: { stroke: string };
    };

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Nodo Raíz Central (El Proyecto)
    nodes.push({
      id: `project-${projectId}`,
      type: "input",
      data: { label: "Project Target", type: "root", isVulnerable: false },
      position: { x: 250, y: 0 }
    });

    // Para evitar posiciones superpuestas en React Flow, calculamos una grilla simple
    const yOffset = 150;

    assets.forEach((asset, index) => {
      const isVulnerable = findings.some(f => f.affectedAsset === asset.value && (f.severity === "high" || f.severity === "critical"));
      
      const nodeId = `asset-${asset.id}`;
      
      // Mapear tipos a etiquetas más legibles
      let label = asset.value;
      if (asset.assetType === "ip") label = `IP: ${asset.value}`;
      if (asset.assetType === "asn") label = `ASN: ${asset.value}`;
      if (asset.assetType === "mx") label = `MX: ${asset.value}`;

      nodes.push({
        id: nodeId,
        type: "default",
        data: { 
          label, 
          type: asset.assetType, 
          isVulnerable,
          metadata: asset.metadata 
        },
        position: { x: (index % 4) * 200, y: yOffset + Math.floor(index / 4) * 100 }
      });

      // Si el asset está relacionado a una IP en metadata, lo conectamos
      // Si el asset está relacionado a una IP en metadata, lo conectamos
      const meta = asset.metadata as { relatedIp?: string } | null;
      if (meta && meta.relatedIp) {
        const relatedNode = assets.find(a => a.value === meta.relatedIp && a.assetType === "ip");
        if (relatedNode) {
          edges.push({
            id: `edge-${asset.id}-${relatedNode.id}`,
            source: nodeId,
            target: `asset-${relatedNode.id}`,
            animated: true,
            style: { stroke: isVulnerable ? "#ef4444" : "#10b981" }
          });
        }
      }

      // Conectamos todo a la raíz por defecto si no hay relaciones jerárquicas descubiertas
      if (!meta?.relatedIp) {
        edges.push({
          id: `edge-root-${asset.id}`,
          source: `project-${projectId}`,
          target: nodeId,
          animated: false,
          style: { stroke: "#4b5563" }
        });
      }
    });

    return NextResponse.json({ success: true, data: { nodes, edges } });

  } catch (error: unknown) {
    console.error("Graph API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

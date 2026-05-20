import { NextRequest, NextResponse } from "next/server";
import { db } from "@/shared/db";
import { intelligenceAssets, intelligenceFindings } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";

/**
 * Genera un grafo topológico (nodos y aristas compatibles con React Flow)
 * a partir de los assets y hallazgos descubiertos en las investigaciones de un proyecto.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // 1. Cargar Assets del Proyecto
    const assets = await db.query.intelligenceAssets.findMany({
      where: eq(intelligenceAssets.projectId, projectId)
    });

    // 2. Cargar Hallazgos del Proyecto (para colorear nodos o crear aristas de riesgo)
    const findings = await db.query.intelligenceFindings.findMany({
      where: eq(intelligenceFindings.projectId, projectId)
    });

    const nodes: any[] = [];
    const edges: any[] = [];

    // Nodo Raíz Central (El Proyecto)
    nodes.push({
      id: `project-${projectId}`,
      type: "input",
      data: { label: "Project Target", type: "root", isVulnerable: false },
      position: { x: 250, y: 0 }
    });

    // Para evitar posiciones superpuestas en React Flow, calculamos una grilla simple
    let xOffset = 0;
    let yOffset = 150;

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
      const meta = asset.metadata as any;
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

  } catch (error: any) {
    console.error("Graph API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("nodeId");

  if (!nodeId) {
    return NextResponse.json({ success: false, error: "nodeId required" }, { status: 400 });
  }

  // Mock traversal logic - in a real scenario this would query a graph DB
  // or a relational DB representing connections between assets.
  const adjacentNodes = [];
  const newEdges = [];
  const baseOffset = Math.random() * 50;

  if (nodeId.includes("domain") || nodeId.includes("ns")) {
    adjacentNodes.push({
      id: `cert_${Date.now()}`,
      label: "SSL/TLS Cert",
      sublabel: "Let's Encrypt",
      type: "cdn",
      severity: "safe",
      x: 100 + baseOffset,
      y: 200 + baseOffset,
    });
    newEdges.push({ from: nodeId, to: `cert_${Date.now()}`, animated: true });
  }

  if (nodeId.includes("ip") || nodeId.includes("mx")) {
    adjacentNodes.push({
      id: `domain_${Date.now()}`,
      label: "mail.target.local",
      sublabel: "Subdomain",
      type: "domain",
      severity: "warning",
      x: 300 + baseOffset,
      y: 100 + baseOffset,
    });
    newEdges.push({ from: nodeId, to: `domain_${Date.now()}`, animated: false });
  }

  return NextResponse.json({
    success: true,
    nodes: adjacentNodes,
    edges: newEdges,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { withRLS } from "@/shared/db/rls";
import { intelligenceInvestigations } from "@/shared/db/schemas";
import { eq, and, lt, desc } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

interface DriftChange {
  field: string;
  label: string;
  previous: string | null;
  current: string | null;
  severity: "critical" | "warning" | "info";
}

function detectDriftChanges(
  previous: Record<string, any>,
  current: Record<string, any>,
  prevScore: number | null,
  currScore: number | null
): DriftChange[] {
  const changes: DriftChange[] = [];

  // Score delta
  if (prevScore !== null && currScore !== null) {
    const delta = currScore - prevScore;
    if (Math.abs(delta) >= 10) {
      changes.push({
        field: "score",
        label: "Score de Seguridad",
        previous: `${prevScore}/100`,
        current: `${currScore}/100 (${delta > 0 ? "+" : ""}${delta})`,
        severity: delta < -15 ? "critical" : delta < 0 ? "warning" : "info",
      });
    }
  }

  // IP address change
  const prevIp = previous?.asnGeo?.ipAddress;
  const currIp = current?.asnGeo?.ipAddress;
  if (prevIp && currIp && prevIp !== currIp) {
    changes.push({
      field: "ip_address",
      label: "Dirección IP Principal",
      previous: prevIp,
      current: currIp,
      severity: "critical",
    });
  }

  // ASN change
  const prevAsn = previous?.asnGeo?.asn;
  const currAsn = current?.asnGeo?.asn;
  if (prevAsn && currAsn && prevAsn !== currAsn) {
    changes.push({
      field: "asn",
      label: "Proveedor de Red (ASN)",
      previous: `${prevAsn} — ${previous?.asnGeo?.asName || ""}`,
      current: `${currAsn} — ${current?.asnGeo?.asName || ""}`,
      severity: "critical",
    });
  }

  // Nameserver change
  const prevNs = (previous?.whois?.nameservers || []).sort().join(",");
  const currNs = (current?.whois?.nameservers || []).sort().join(",");
  if (prevNs && currNs && prevNs !== currNs) {
    changes.push({
      field: "nameservers",
      label: "Nameservers DNS",
      previous: prevNs.replace(/,/g, ", "),
      current: currNs.replace(/,/g, ", "),
      severity: "critical",
    });
  }

  // DMARC policy downgrade
  const prevDmarc = previous?.dmarcParsed?.policy;
  const currDmarc = current?.dmarcParsed?.policy;
  if (prevDmarc && currDmarc && prevDmarc !== currDmarc) {
    const policyOrder: Record<string, number> = { reject: 3, quarantine: 2, none: 1, invalid: 0 };
    const prevRank = policyOrder[prevDmarc] ?? 0;
    const currRank = policyOrder[currDmarc] ?? 0;
    if (currRank < prevRank) {
      changes.push({
        field: "dmarc_policy",
        label: "Política DMARC",
        previous: prevDmarc.toUpperCase(),
        current: currDmarc.toUpperCase(),
        severity: "critical",
      });
    }
  }

  // SPF weakness appeared
  const prevSpfWeak = previous?.spfParsed?.isWeak;
  const currSpfWeak = current?.spfParsed?.isWeak;
  if (!prevSpfWeak && currSpfWeak) {
    changes.push({
      field: "spf_weakness",
      label: "Debilidad SPF",
      previous: "Configuración fuerte",
      current: "Directiva débil detectada (~all o ?all)",
      severity: "warning",
    });
  }

  // SSL certificate expiry
  const certExpiry = current?.sslCertificate?.validTo;
  if (certExpiry) {
    const daysLeft = Math.floor((new Date(certExpiry).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 30 && daysLeft >= 0) {
      changes.push({
        field: "ssl_expiry",
        label: "Certificado SSL",
        previous: null,
        current: `Vence en ${daysLeft} día${daysLeft !== 1 ? "s" : ""}`,
        severity: daysLeft <= 7 ? "critical" : "warning",
      });
    }
  }

  // CDN/WAF removed
  const prevCdn = previous?.cdnWaf?.detected;
  const currCdn = current?.cdnWaf?.detected;
  if (prevCdn === true && currCdn === false) {
    changes.push({
      field: "cdn_waf",
      label: "Protección CDN/WAF",
      previous: previous?.cdnWaf?.name || "Activa",
      current: "No detectada",
      severity: "warning",
    });
  }

  return changes;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const investigationId = searchParams.get("investigationId");

    if (!investigationId) {
      return NextResponse.json({ success: false, error: "Falta investigationId" }, { status: 400 });
    }

    const result = await withRLS(user.id, async (tx) => {
      // Get the current investigation
      const current = await tx.query.intelligenceInvestigations.findFirst({
        where: eq(intelligenceInvestigations.id, investigationId),
      });

      if (!current || !current.createdAt) return null;

      // Find the most recent PREVIOUS investigation for the same target
      const previous = await tx.query.intelligenceInvestigations.findFirst({
        where: and(
          eq(intelligenceInvestigations.normalizedTarget, current.normalizedTarget),
          eq(intelligenceInvestigations.projectId, current.projectId),
          lt(intelligenceInvestigations.createdAt, current.createdAt)
        ),
        orderBy: [desc(intelligenceInvestigations.createdAt)],
      });

      return { current, previous };
    });

    if (!result) {
      return NextResponse.json({ success: false, error: "Investigación no encontrada" }, { status: 404 });
    }

    const { current, previous } = result;

    if (!previous) {
      return NextResponse.json({
        success: true,
        hasDrift: false,
        changes: [],
        deltaScore: null,
        message: "Primera investigación para este objetivo. No hay línea base de comparación.",
      });
    }

    const prevMeta = (previous.metadata as Record<string, any>) || {};
    const currMeta = (current.metadata as Record<string, any>) || {};
    const changes = detectDriftChanges(prevMeta, currMeta, previous.score, current.score);
    const deltaScore = (current.score !== null && previous.score !== null)
      ? current.score - previous.score
      : null;

    return NextResponse.json({
      success: true,
      hasDrift: changes.length > 0,
      changes,
      deltaScore,
      previousInvestigationId: previous.id,
      previousScore: previous.score,
      previousCreatedAt: previous.createdAt,
    });    } catch (error: unknown) {
    console.error("Drift detection error:", error);
    return NextResponse.json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}

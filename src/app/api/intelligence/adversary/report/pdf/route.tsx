import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { Readable } from 'stream';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { createClient } from '@/shared/lib/supabase/server';
import { directDb } from '@/shared/db';
import {
  projects,
  adversaryAssessments,
  adversaryVulnerabilities,
} from '@/shared/db/schemas';
import { and, desc, eq } from 'drizzle-orm';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/intelligence/adversary/report/pdf?projectId=…&assessmentId=?
 *
 * Informe completo de la Evaluación Real de Adversarios:
 * carátula, resumen ejecutivo (agente AI), vulnerabilidades con evidencia y
 * remediación, y anexo de checks ejecutados sin hallazgos.
 * SECURITY: ownership obligatorio del proyecto.
 */

const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
const sevRank = (s: string | null) => Math.max(0, SEV_ORDER.indexOf((s ?? 'info') as typeof SEV_ORDER[number]));

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#1a1a2e' },
  cover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  brand: { fontSize: 10, letterSpacing: 4, color: '#6b7280', marginBottom: 12 },
  title: { fontSize: 26, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 11, color: '#4b5563', textAlign: 'center' },
  meta: { marginTop: 30, fontSize: 9, color: '#374151', textAlign: 'center' },
  h1: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 12, marginTop: 20 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  p: { fontSize: 9, lineHeight: 1.5, marginBottom: 6 },
  badge: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start' },
  vulnCard: { border: '1pt solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  chip: { fontSize: 8, color: '#374151', backgroundColor: '#f3f4f6', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  stepRow: { flexDirection: 'row', marginBottom: 2 },
  stepNum: { width: 16, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#9ca3af' },
});

function sevBadgeStyle(sev: string): { backgroundColor: string; color: string } {
  switch (sev) {
    case 'critical': return { backgroundColor: '#dc2626', color: '#ffffff' };
    case 'high': return { backgroundColor: '#ea580c', color: '#ffffff' };
    case 'medium': return { backgroundColor: '#d97706', color: '#ffffff' };
    case 'low': return { backgroundColor: '#2563eb', color: '#ffffff' };
    default: return { backgroundColor: '#6b7280', color: '#ffffff' };
  }
}

interface Vuln {
  title: string; severity: string; cvssScore: string | null; cweId: string | null;
  owaspCategory: string | null; description: string; evidence: Record<string, unknown> | null;
  remediation: string[]; references: string[]; confidence: string;
}

function AdversaryReportDoc(props: {
  projectName: string; domain: string; generatedAt: string;
  assessment: { target: string; riskScore: number | null; summary: string | null; modelUsed: string | null; checksTotal: number; checksPassed: number; analysisFailed: boolean };
  vulnerabilities: Vuln[];
}) {
  const { projectName, domain, generatedAt, assessment, vulnerabilities } = props;
  const sorted = [...vulnerabilities].sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const counts = Object.fromEntries(SEV_ORDER.map((s) => [s, sorted.filter((v) => v.severity === s).length]));

  return (
    <Document
      title={`Evaluación Real de Seguridad — ${domain}`}
      author="StrategicAudit Pro"
    >
      {/* Carátula */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.brand}>SCAUDIT PRO</Text>
          <Text style={styles.title}>Evaluación Real de Seguridad</Text>
          <Text style={styles.subtitle}>Pruebas activas no destructivas · Metodología propia basada en OWASP / MITRE ATT&CK</Text>
          <Text style={styles.meta}>
            Proyecto: {projectName}{'\n'}
            Dominio: {domain}{'\n'}
            Generado: {generatedAt}
            {'\n\n'}Riesgo global: {assessment.riskScore !== null ? `${assessment.riskScore}/100` : 'N/D'}
            {'\n'}Hallazgos: {sorted.length} ({counts.critical} críticas · {counts.high} altas · {counts.medium} medias)
          </Text>
        </View>
        <Text style={styles.footer}>
          Este informe se generó mediante pruebas NO destructivas autorizadas por el propietario del proyecto.
          No incluye explotación intrusiva ni denegación de servicio.
        </Text>
      </Page>

      {/* Resumen ejecutivo */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>1. Resumen Ejecutivo</Text>
        {assessment.summary ? (
          <Text style={styles.p}>{assessment.summary}</Text>
        ) : (
          <Text style={styles.p}>{assessment.analysisFailed ? 'El análisis automatizado por IA no estuvo disponible para esta evaluación.' : 'Sin resumen disponible.'}</Text>
        )}

        <Text style={styles.h1}>2. Alcance y Metodología</Text>
        <Text style={styles.p}>
          Objetivo: {assessment.target}. Se ejecutaron {assessment.checksTotal} verificaciones reales no
          destructivas organizadas en cinco categorías: TLS, cabeceras de seguridad HTTP, exposición de
          archivos sensibles, configuración web (métodos HTTP, CORS, redirecciones, SQLi/XSS con payload
          único y detección por reflexión) y contenido (fingerprinting con CVEs conocidas, mixed content,
          SRI). Cada prueba produce evidencia objetiva registrada en el sistema. Un agente de IA
          (modelo: {assessment.modelUsed ?? 'no disponible'}) clasificó los hallazgos con CVSS, CWE/OWASP
          y plan de remediación.
        </Text>

        <Text style={styles.h1}>3. Hallazgos</Text>
        {sorted.length === 0 ? (
          <Text style={styles.p}>No se confirmaron vulnerabilidades en esta evaluación.</Text>
        ) : (
          sorted.map((v, i) => (
            <View key={i} style={styles.vulnCard} wrap={false}>
              <View style={styles.row}>
                <Text style={[styles.badge, sevBadgeStyle(v.severity)]}>
                  {v.severity.toUpperCase()}{v.cvssScore ? ` · CVSS ${v.cvssScore}` : ''}
                </Text>
              </View>
              <Text style={styles.h2}>{i + 1}. {v.title}</Text>
              {(v.cweId || v.owaspCategory) && (
                <View style={styles.row}>
                  {v.cweId ? <Text style={styles.chip}>{v.cweId}</Text> : null}
                  {v.owaspCategory ? <Text style={styles.chip}>{v.owaspCategory}</Text> : null}
                </View>
              )}
              <Text style={styles.p}>{v.description}</Text>
              {v.evidence && typeof v.evidence.summary === 'string' && (
                <Text style={styles.p}>Evidencia: {v.evidence.summary}</Text>
              )}
              <Text style={{ ...styles.h2, marginTop: 6 }}>Remediación</Text>
              {v.remediation.map((step, j) => (
                <View key={j} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{j + 1}.</Text>
                  <Text style={styles.p}>{step}</Text>
                </View>
              ))}
              {v.references.length > 0 && (
                <Text style={{ ...styles.p, color: '#6b7280' }}>Referencias: {v.references.join(' · ')}</Text>
              )}
            </View>
          ))
        )}
        <Text style={styles.footer}>StrategicAudit Pro — Evaluación Real de Seguridad · Página 2</Text>
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const assessmentId = searchParams.get('assessmentId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId requerido' }, { status: 400 });
    }

    const [project] = await directDb
      .select({ id: projects.id, name: projects.name, domain: projects.domain })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ success: false, error: 'Proyecto no encontrado' }, { status: 404 });
    }

    const where = assessmentId
      ? and(eq(adversaryAssessments.projectId, projectId), eq(adversaryAssessments.status, 'completed'))
      : and(eq(adversaryAssessments.projectId, projectId), eq(adversaryAssessments.status, 'completed'));

    const [assessment] = await directDb
      .select()
      .from(adversaryAssessments)
      .where(where)
      .orderBy(desc(adversaryAssessments.createdAt))
      .limit(1);

    if (!assessment) {
      return NextResponse.json(
        { success: false, error: 'Sin evaluaciones completadas para este proyecto' },
        { status: 404 }
      );
    }

    const vulns = await directDb
      .select()
      .from(adversaryVulnerabilities)
      .where(eq(adversaryVulnerabilities.assessmentId, assessment.id));

    const stream = await renderToStream(
      <AdversaryReportDoc
        projectName={project.name}
        domain={project.domain}
        generatedAt={new Date().toLocaleString('es-AR')}
        assessment={{
          target: assessment.target,
          riskScore: assessment.riskScore,
          summary: assessment.summary,
          modelUsed: assessment.modelUsed,
          checksTotal: assessment.checksTotal,
          checksPassed: assessment.checksPassed,
          analysisFailed: assessment.analysisFailed,
        }}
        vulnerabilities={vulns.map((v) => ({
          title: v.title,
          severity: v.severity,
          cvssScore: v.cvssScore,
          cweId: v.cweId,
          owaspCategory: v.owaspCategory,
          description: v.description,
          evidence: v.evidence,
          remediation: v.remediation,
          references: v.references,
          confidence: String(v.confidence),
        }))}
      />
    );

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="adversary-real-${project.domain}-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    logger.error('Error generando PDF de adversario:', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

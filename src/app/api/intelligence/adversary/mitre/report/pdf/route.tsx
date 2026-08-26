import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { createClient } from '@/shared/lib/supabase/server';
import { directDb } from '@/shared/db';
import {
  projects,
  mitreEvaluations,
  mitreTechniqueResults,
} from '@/shared/db/schemas';
import { and, desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/intelligence/adversary/mitre/report/pdf?projectId=…&evaluationId=?
 *
 * Informe de Cobertura MITRE Real: matriz por táctica, veredicto/evidencia/
 * remediación por técnica y playbook AI para técnicas internas.
 */

const VERDICT_LABEL: Record<string, string> = {
  exposed: 'EXPUESTA',
  not_exposed: 'PROTEGIDA',
  not_externally_testable: 'VALIDACIÓN MANUAL',
  error: 'SIN DATOS',
};

const TACTIC_ORDER = ['TA0001', 'TA0002', 'TA0003', 'TA0006', 'TA0007', 'TA0008', 'TA0009', 'TA0040'];

function verdictColor(v: string): { backgroundColor: string; color: string } {
  switch (v) {
    case 'exposed': return { backgroundColor: '#dc2626', color: '#ffffff' };
    case 'not_exposed': return { backgroundColor: '#16a34a', color: '#ffffff' };
    case 'not_externally_testable': return { backgroundColor: '#2563eb', color: '#ffffff' };
    default: return { backgroundColor: '#6b7280', color: '#ffffff' };
  }
}

interface TechResult {
  mitreId: string; tactic: string; techniqueName: string; verdict: string;
  summary: string | null; remediation: string[]; playbook: string[]; confidence: string;
}

function MitreReportDoc(props: {
  projectName: string; domain: string; generatedAt: string;
  evaluation: { target: string; riskScore: number | null; summary: string | null; modelUsed: string | null; exposedCount: number; protectedCount: number; manualOnlyCount: number };
  results: TechResult[];
}) {
  const { projectName, domain, generatedAt, evaluation, results } = props;
  const grouped = new Map<string, TechResult[]>();
  for (const r of results) {
    if (!grouped.has(r.tactic)) grouped.set(r.tactic, []);
    grouped.get(r.tactic)!.push(r);
  }
  const tactics = [...grouped.keys()].sort(
    (a, b) => (TACTIC_ORDER.indexOf(a) + 100) % 100 - ((TACTIC_ORDER.indexOf(b) + 100) % 100)
  );

  return (
    <Document title={`Cobertura MITRE Real — ${domain}`} author="StrategicAudit Pro">
      {/* Carátula */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.brand}>SCAUDIT PRO</Text>
          <Text style={s.title}>Informe de Cobertura MITRE Real</Text>
          <Text style={s.subtitle}>Pruebas automatizadas no destructivas por técnica · Clasificación con IA</Text>
          <Text style={s.meta}>
            Proyecto: {projectName}{'\n'}
            Dominio: {domain}{'\n'}
            Generado: {generatedAt}
            {'\n\n'}Técnicas expuestas: {evaluation.exposedCount}
            {'\n'}Técnicas protegidas: {evaluation.protectedCount}
            {'\n'}Solo validación interna: {evaluation.manualOnlyCount}
            {'\n\n'}Riesgo global: {evaluation.riskScore !== null ? `${evaluation.riskScore}/100` : 'N/D'}
          </Text>
        </View>
        <Text style={s.footer}>
          Evaluación NO destructiva autorizada por el propietario. Las técnicas internas incluyen un
          playbook generado por IA ({evaluation.modelUsed ?? 'modelo no registrado'}) para validación en el SIEM/EDR del cliente.
        </Text>
      </Page>

      {/* Resumen ejecutivo */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>1. Resumen Ejecutivo</Text>
        <Text style={s.p}>{evaluation.summary ?? 'Sin resumen disponible.'}</Text>
        <Text style={s.h1}>2. Matriz por Táctica</Text>
        {tactics.map((tactic) => (
          <View key={tactic} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={s.h2}>{tactic}</Text>
            {grouped.get(tactic)!.map((r) => (
              <View key={r.mitreId} style={s.matrixRow}>
                <View style={[s.badge, verdictColor(r.verdict)]}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</Text>
                </View>
                <Text style={s.matrixCell}>{`${r.mitreId}  ${r.techniqueName}`}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={s.footer}>StrategicAudit Pro — Cobertura MITRE Real · Página 2</Text>
      </Page>

      {/* Detalle por técnica */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>3. Detalle, Soluciones y Playbooks</Text>
        {results.map((r, i) => (
          <View key={i} style={s.vulnCard} wrap={false}>
            <View style={[s.badge, verdictColor(r.verdict)]}>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff' }}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</Text>
            </View>
            <Text style={s.h2}>{`${r.mitreId} — ${r.techniqueName}`}</Text>
            {r.summary && <Text style={s.p}>{r.summary}</Text>}
            {r.remediation.length > 0 && (
              <>
                <Text style={{ ...s.h2, marginTop: 4 }}>Soluciones</Text>
                {r.remediation.map((step, j) => (
                  <View key={j} style={s.stepRow}>
                    <Text style={s.stepNum}>{j + 1}.</Text>
                    <Text style={s.p}>{step}</Text>
                  </View>
                ))}
              </>
            )}
            {r.playbook.length > 0 && (
              <>
                <Text style={{ ...s.h2, marginTop: 4 }}>Playbook de validación interna</Text>
                {r.playbook.map((step, j) => (
                  <View key={j} style={s.stepRow}>
                    <Text style={s.stepNum}>{j + 1}.</Text>
                    <Text style={s.p}>{step}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ))}
        <Text style={s.footer}>StrategicAudit Pro — Cobertura MITRE Real · Página 3</Text>
      </Page>
    </Document>
  );
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#1a1a2e' },
  cover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  brand: { fontSize: 10, letterSpacing: 4, color: '#6b7280', marginBottom: 12 },
  title: { fontSize: 24, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 10, color: '#4b5563', textAlign: 'center' },
  meta: { marginTop: 28, fontSize: 9, color: '#374151', textAlign: 'center', lineHeight: 1.6 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 10, marginTop: 16 },
  h2: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  p: { fontSize: 9, lineHeight: 1.5, marginBottom: 5 },
  badge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, alignSelf: 'flex-start', marginRight: 8 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  matrixCell: { fontSize: 9, flex: 1 },
  vulnCard: { border: '1pt solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8 },
  stepRow: { flexDirection: 'row', marginBottom: 2 },
  stepNum: { width: 14, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#9ca3af' },
});


export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const evaluationId = searchParams.get('evaluationId');

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId requerido' }, { status: 400 });
    }

    const [project] = await directDb
      .select({ id: projects.id, name: projects.name, domain: projects.domain })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)))
      .limit(1);
    if (!project) return NextResponse.json({ success: false, error: 'Proyecto no encontrado' }, { status: 404 });

    const [evaluation] = await directDb
      .select()
      .from(mitreEvaluations)
      .where(
        evaluationId
          ? and(eq(mitreEvaluations.id, evaluationId), eq(mitreEvaluations.projectId, projectId))
          : and(eq(mitreEvaluations.projectId, projectId), eq(mitreEvaluations.status, 'completed'))
      )
      .orderBy(desc(mitreEvaluations.createdAt))
      .limit(1);

    if (!evaluation || evaluation.status !== 'completed') {
      return NextResponse.json({ success: false, error: 'Sin evaluaciones MITRE completadas' }, { status: 404 });
    }

    const results = await directDb
      .select()
      .from(mitreTechniqueResults)
      .where(eq(mitreTechniqueResults.evaluationId, evaluation.id));

    const stream = await renderToStream(
      <MitreReportDoc
        projectName={project.name}
        domain={project.domain}
        generatedAt={new Date().toLocaleString('es-AR')}
        evaluation={{
          target: evaluation.target,
          riskScore: evaluation.riskScore,
          summary: evaluation.summary,
          modelUsed: evaluation.modelUsed,
          exposedCount: evaluation.exposedCount,
          protectedCount: evaluation.protectedCount,
          manualOnlyCount: evaluation.manualOnlyCount,
        }}
        results={results.map((r) => ({
          mitreId: r.mitreId,
          tactic: r.tactic,
          techniqueName: r.techniqueName,
          verdict: r.verdict,
          summary: r.summary,
          remediation: r.remediation,
          playbook: r.playbook,
          confidence: String(r.confidence),
        }))}
      />
    );

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="mitre-real-${project.domain}-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('Error generando PDF MITRE:', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

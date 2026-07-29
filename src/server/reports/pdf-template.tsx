import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet,
  Svg, Circle, Path,
} from '@react-pdf/renderer';

// ─── Theme ───────────────────────────────────────────────────────────────────

const THEME = {
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  chartreuse: '#A3E635',
  chartreuseDark: '#65A30D',
  destructive: '#EF4444',
  warning: '#F59E0B',
  info: '#06B6D4',
  bg: '#0A0E17',
  bgCard: '#131722',
  border: '#1E293B',
  fg: '#F1F5F9',
  fgMuted: '#94A3B8',
  fgDim: '#64748B',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WhiteLabelBranding {
  agencyName?: string;
  primaryColor?: string;
  logoUrl?: string;
}

export interface PdfFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  recommendation?: string | null;
  affectedAsset?: string | null;
  mitreTechnique?: string | null;
}

export interface PdfAsset {
  assetType: string;
  value: string;
  ip?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
}

export interface PdfSection {
  id: string;
  title: string;
  score?: number | null;
  summary?: string | null;
  findings: PdfFinding[];
  assets?: PdfAsset[];
  totalFindings?: number;
  severeCount?: number;
}

export interface PdfReportData {
  projectName: string;
  projectDomain: string;
  target: string;
  targetType: string;
  date: string;
  overallScore: number | null;
  branding?: WhiteLabelBranding;
  sections: PdfSection[];
}

// ─── Severity Helpers ────────────────────────────────────────────────────────

function severityColor(s: string): string {
  switch (s) {
    case 'critical': return THEME.destructive;
    case 'high': return '#F97316';
    case 'medium': return THEME.warning;
    case 'low': return THEME.info;
    default: return THEME.fgMuted;
  }
}

function severityLabel(s: string): string {
  return s.toUpperCase();
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: THEME.bg,
    fontFamily: 'Helvetica',
    color: THEME.fg,
  },
  // Cover
  coverPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 60,
    backgroundColor: THEME.bg,
  },
  coverLogo: {
    width: 80,
    height: 80,
    marginBottom: 32,
    objectFit: 'contain',
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: THEME.fg,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1,
  },
  coverDomain: {
    fontSize: 18,
    color: THEME.primaryLight,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Courier',
  },
  coverType: {
    fontSize: 11,
    color: THEME.fgMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 4,
    marginBottom: 40,
  },
  coverScore: {
    fontSize: 64,
    fontWeight: 'bold',
    color: THEME.chartreuse,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverScoreLabel: {
    fontSize: 10,
    color: THEME.fgDim,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 32,
  },
  coverDate: {
    fontSize: 10,
    color: THEME.fgDim,
    textAlign: 'center',
    marginBottom: 4,
  },
  coverAgency: {
    fontSize: 9,
    color: THEME.fgMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  coverLine: {
    width: 100,
    height: 2,
    backgroundColor: THEME.primary,
    marginVertical: 24,
  },
  // Content
  contentPage: {
    padding: 40,
    backgroundColor: THEME.bg,
  },
  // Section header
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.primaryLight,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: THEME.border,
    marginBottom: 16,
    marginTop: 4,
  },
  sectionScore: {
    fontSize: 10,
    color: THEME.fgMuted,
    marginBottom: 12,
  },
  sectionSummary: {
    fontSize: 9,
    color: THEME.fgMuted,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  // Finding cards
  findingCard: {
    backgroundColor: THEME.bgCard,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  findingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000',
    textTransform: 'uppercase',
  },
  findingTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME.fg,
    flex: 1,
  },
  findingAsset: {
    fontSize: 8,
    color: THEME.fgDim,
    fontFamily: 'Courier',
    marginBottom: 2,
  },
  findingDesc: {
    fontSize: 8,
    color: THEME.fgMuted,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  findingRec: {
    fontSize: 8,
    color: THEME.chartreuse,
    lineHeight: 1.4,
  },
  mitreBadge: {
    fontSize: 7,
    color: THEME.primaryLight,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    fontFamily: 'Courier',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  // Summary metrics
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    backgroundColor: THEME.bgCard,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.fg,
  },
  metricLabel: {
    fontSize: 7,
    color: THEME.fgDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  // Table
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomColor: THEME.border,
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: THEME.fgDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomColor: THEME.border,
    borderBottomWidth: 0.5,
  },
  tableCell: {
    fontSize: 8,
    color: THEME.fgMuted,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: THEME.fgDim,
  },
  // Score gauge dots
  dotRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// ─── Cover Page ──────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: PdfReportData }) {
  const score = data.overallScore ?? 0;
  const dots = 10;
  const filled = Math.round(score / 10);
  const scoreClass = score >= 70 ? THEME.chartreuse : score >= 40 ? THEME.warning : THEME.destructive;

  return (
    <Page size="A4" style={styles.coverPage}>
      {data.branding?.logoUrl ? (
        <Image style={styles.coverLogo} src={data.branding.logoUrl} />
      ) : null}

      <Text style={styles.coverTitle}>{data.projectName}</Text>
      <Text style={styles.coverDomain}>{data.projectDomain}</Text>
      <Text style={styles.coverType}>{data.targetType.toUpperCase()} · {data.target}</Text>

      <View style={styles.coverLine} />

      <Text style={{ ...styles.coverScore, color: scoreClass }}>{score}</Text>
      <Text style={styles.coverScoreLabel}>Security Score /100</Text>

      {/* Dots gauge */}
      <View style={styles.dotRow}>
        {Array.from({ length: dots }).map((_, i) => (
          <View
            key={i}
            style={{
              ...styles.dot,
              backgroundColor: i < filled ? scoreClass : THEME.fgDim,
              opacity: i < filled ? 1 : 0.3,
            }}
          />
        ))}
      </View>

      <Text style={styles.coverDate}>Generated: {data.date}</Text>

      {data.branding?.agencyName ? (
        <Text style={styles.coverAgency}>Powered by {data.branding.agencyName}</Text>
      ) : (
        <Text style={styles.coverAgency}>SCAUDIT · Enterprise Cyber Intelligence</Text>
      )}
    </Page>
  );
}

// ─── Section Page ────────────────────────────────────────────────────────────

function SectionPage({ section }: { section: PdfSection }) {
  return (
    <Page size="A4" style={styles.contentPage}>
      {/* Section header */}
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionDivider} />

      {section.score != null && (
        <Text style={styles.sectionScore}>Score: {section.score}/100  ·  {section.totalFindings ?? section.findings.length} findings ({section.severeCount ?? 0} severe)</Text>
      )}

      {section.summary && (
        <Text style={styles.sectionSummary}>{section.summary}</Text>
      )}

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{section.totalFindings ?? section.findings.length}</Text>
          <Text style={styles.metricLabel}>Findings</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={{ ...styles.metricValue, color: THEME.destructive }}>{section.severeCount ?? 0}</Text>
          <Text style={styles.metricLabel}>Critical/High</Text>
        </View>
        {section.score != null && (
          <View style={styles.metricCard}>
            <Text style={{
              ...styles.metricValue,
              color: section.score >= 70 ? THEME.chartreuse : section.score >= 40 ? THEME.warning : THEME.destructive,
            }}>
              {section.score}
            </Text>
            <Text style={styles.metricLabel}>Score</Text>
          </View>
        )}
      </View>

      {/* Findings */}
      {(section.findings ?? []).length > 0 ? (
        <>
          <Text style={{ ...styles.sectionTitle, fontSize: 12, marginTop: 8 }}>Detailed Findings</Text>
          <View style={{ height: 1, backgroundColor: THEME.border, marginBottom: 10 }} />

          {section.findings.slice(0, 50).map((f, i) => (
            <View key={i} style={styles.findingCard} wrap={false}>
              <View style={styles.findingHeader}>
                <View style={{ ...styles.severityBadge, backgroundColor: severityColor(f.severity) }}>
                  <Text>{severityLabel(f.severity)}</Text>
                </View>
                <Text style={styles.findingTitle}>{f.title}</Text>
              </View>

              {f.affectedAsset && (
                <Text style={styles.findingAsset}>{f.affectedAsset}</Text>
              )}

              <Text style={styles.findingDesc}>{f.description}</Text>

              {f.recommendation && (
                <Text style={styles.findingRec}>→ {f.recommendation}</Text>
              )}

              {f.mitreTechnique && (
                <Text style={styles.mitreBadge}>MITRE: {f.mitreTechnique}</Text>
              )}
            </View>
          ))}
        </>
      ) : (
        <Text style={{ fontSize: 9, color: THEME.fgDim, textAlign: 'center', marginTop: 20 }}>
          No findings were detected for this target.
        </Text>
      )}
    </Page>
  );
}

// ─── Assets Page ───────────────────────────────────────────────────────────────

function AssetsPage({ section }: { section: PdfSection }) {
  const assets = section.assets ?? [];
  if (assets.length === 0) return null;

  // Group by assetType
  const groups: Record<string, PdfAsset[]> = {};
  for (const a of assets) {
    const type = a.assetType || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(a);
  }

  const typeColors: Record<string, string> = {
    subdomain: '#6366F1',
    ip_address: '#A3E635',
    certificate: '#06B6D4',
    email: '#F59E0B',
    cdn: '#A78BFA',
  };

  return (
    <Page size="A4" style={styles.contentPage}>
      <Text style={styles.sectionTitle}>Discovered Assets — {section.title}</Text>
      <View style={styles.sectionDivider} />
      <Text style={{ fontSize: 8, color: THEME.fgMuted, marginBottom: 14 }}>
        {assets.length} assets discovered across {Object.keys(groups).length} categories.
      </Text>

      {Object.entries(groups).map(([type, items]) => (
        <View key={type} wrap={false} style={{ marginBottom: 14 }}>
          {/* Group header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            marginBottom: 6, paddingBottom: 4,
            borderBottomWidth: 1, borderBottomColor: THEME.border,
          }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: typeColors[type] || THEME.fgMuted,
            }} />
            <Text style={{ fontSize: 10, fontWeight: 'bold', color: THEME.primaryLight, textTransform: 'uppercase' }}>
              {type.replace(/_/g, ' ')}
            </Text>
            <Text style={{ fontSize: 8, color: THEME.fgDim }}>({items.length})</Text>
          </View>

          {/* Asset rows */}
          {items.slice(0, 30).map((asset, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: 8, color: THEME.fg, fontFamily: 'Courier' }}>{asset.value}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 7, color: THEME.fgDim, fontFamily: 'Courier' }}>{asset.ip || '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 7, color: THEME.fgDim }}>
                  {asset.firstSeenAt ? new Date(asset.firstSeenAt).toLocaleDateString() : '-'}
                </Text>
              </View>
            </View>
          ))}

          {items.length > 30 && (
            <Text style={{ fontSize: 7, color: THEME.fgDim, textAlign: 'center', marginTop: 2 }}>
              … and {items.length - 30} more {type.replace(/_/g, ' ')} assets
            </Text>
          )}
        </View>
      ))}
    </Page>
  );
}

// ─── Summary Table Page ──────────────────────────────────────────────────────

function SummaryTablePage({ sections }: { sections: PdfSection[] }) {
  const allFindings = sections.flatMap(s => (s.findings ?? []).map(f => ({
    ...f,
    section: s.title,
  })));

  return (
    <Page size="A4" style={styles.contentPage}>
      <Text style={styles.sectionTitle}>Consolidated Findings</Text>
      <View style={styles.sectionDivider} />
      <Text style={{ fontSize: 8, color: THEME.fgMuted, marginBottom: 12 }}>
        All {allFindings.length} findings across {sections.length} categories.
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <View style={{ flex: 0.5 }}><Text style={styles.tableHeaderCell}>Sev</Text></View>
          <View style={{ flex: 2 }}><Text style={styles.tableHeaderCell}>Title</Text></View>
          <View style={{ flex: 1.5 }}><Text style={styles.tableHeaderCell}>Asset</Text></View>
          <View style={{ flex: 1.2 }}><Text style={styles.tableHeaderCell}>Section</Text></View>
        </View>

        {allFindings.slice(0, 100).map((f, i) => (
          <View key={i} style={styles.tableRow}>
            <View style={{ flex: 0.5 }}>
              <Text style={{ ...styles.tableCell, color: severityColor(f.severity), fontWeight: 'bold' }}>
                {f.severity.toUpperCase().slice(0, 3)}
              </Text>
            </View>
            <Text style={{ ...styles.tableCell, flex: 2 }}>{f.title}</Text>
            <Text style={{ ...styles.tableCell, flex: 1.5, fontFamily: 'Courier' }}>
              {f.affectedAsset ?? '-'}
            </Text>
            <Text style={{ ...styles.tableCell, flex: 1.2 }}>{f.section}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

// ─── Severity Donut Chart ─────────────────────────────────────────────────────

function SeverityDonutChart({ findings }: { findings: PdfFinding[] }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const colors = ['#EF4444', '#F97316', '#F59E0B', '#06B6D4', '#64748B'];
  const labels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const order: (keyof typeof counts)[] = ['critical', 'high', 'medium', 'low', 'info'];

  const cx = 100, cy = 100, r = 70, innerR = 42;

  // Build arc segments
  let currentAngle = -Math.PI / 2; // start from top
  const segments: { path: string; color: string; label: string; count: number; pct: string }[] = [];

  for (const sev of order) {
    const count = counts[sev];
    if (count === 0) continue;
    const pct = count / total;
    const angle = pct * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    // Outer arc points
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    // Inner arc points
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    // Path: outer arc → inner arc → close
    const path = [
      `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      `L ${ix1.toFixed(1)} ${iy1.toFixed(1)}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2.toFixed(1)} ${iy2.toFixed(1)}`,
      'Z',
    ].join(' ');

    segments.push({
      path,
      color: colors[order.indexOf(sev)],
      label: labels[order.indexOf(sev)],
      count,
      pct: (pct * 100).toFixed(1) + '%',
    });

    currentAngle = endAngle;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 }}>
      {/* SVG Donut */}
      <Svg width={200} height={200} viewBox="0 0 200 200">
        {segments.map((seg, i) => (
          <Path key={i} d={seg.path} fill={seg.color} stroke={THEME.bg} strokeWidth={1} />
        ))}
        {/* Center text background */}
        <Circle cx={100} cy={100} r={30} fill={THEME.bgCard} />
      </Svg>

      {/* Legend */}
      <View style={{ flex: 1 }}>
        {segments.map((seg, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 6 }}>
            <View style={{ width: 10, height: 10, backgroundColor: seg.color, borderRadius: 2 }} />
            <Text style={{ fontSize: 8, color: THEME.fgMuted, fontFamily: 'Courier', width: 60 }}>{seg.label}</Text>
            <Text style={{ fontSize: 8, color: THEME.fg, fontWeight: 'bold', width: 24 }}>{seg.count}</Text>
            <Text style={{ fontSize: 7, color: THEME.fgDim }}>{seg.pct}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
          <View style={{ width: 10, height: 10, backgroundColor: 'transparent' }} />
          <Text style={{ fontSize: 8, color: THEME.fgMuted, fontFamily: 'Courier', width: 60 }}>TOTAL</Text>
          <Text style={{ fontSize: 8, color: THEME.chartreuse, fontWeight: 'bold', width: 24 }}>{total}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Overview Page (Charts Summary) ──────────────────────────────────────────

function OverviewPage({ data }: { data: PdfReportData }) {
  const allFindings = data.sections.flatMap(s => s.findings ?? []);
  const scoredSections = data.sections.filter(s => s.score != null);

  if (allFindings.length === 0 && scoredSections.length === 0) return null;

  const maxBarWidth = 220;
  const labelWidth = 110;

  return (
    <Page size="A4" style={styles.contentPage}>
      <Text style={styles.sectionTitle}>Executive Overview</Text>
      <View style={styles.sectionDivider} />
      <Text style={{ fontSize: 9, color: THEME.fgMuted, marginBottom: 16, lineHeight: 1.5 }}>
        Summary of {data.sections.length} investigations covering {allFindings.length} total findings.
      </Text>

      {/* Donut Chart Row */}
      {allFindings.length > 0 && (
        <View wrap={false} style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: THEME.primaryLight, marginBottom: 10 }}>
            Severity Distribution
          </Text>
          <SeverityDonutChart findings={allFindings} />
        </View>
      )}

      {/* Bar Chart */}
      {scoredSections.length > 0 && (
        <View wrap={false}>
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: THEME.primaryLight, marginBottom: 10 }}>
            Scores by Investigation
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {/* Labels column */}
            <View style={{ width: labelWidth, paddingTop: 0 }}>
              {scoredSections.map((s, i) => (
                <Text key={s.id} style={{
                  fontSize: 7,
                  color: THEME.fgMuted,
                  height: 24,
                  lineHeight: 24,
                  paddingRight: 6,
                  textAlign: 'right',
                  fontFamily: 'Courier',
                  overflow: 'hidden',
                }}>
                  {s.title.length > 22 ? s.title.slice(0, 20) + '..' : s.title}
                </Text>
              ))}
            </View>

            {/* Bars column */}
            <View style={{ flex: 1 }}>
              {scoredSections.map((s) => {
                const score = s.score ?? 0;
                const barW = (score / 100) * maxBarWidth;
                const barColor = score >= 70 ? THEME.chartreuse : score >= 40 ? THEME.warning : THEME.destructive;

                return (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', height: 24, marginBottom: 0 }}>
                    {/* Bar background */}
                    <View style={{
                      width: maxBarWidth,
                      height: 14,
                      backgroundColor: THEME.bgCard,
                      borderRadius: 3,
                      position: 'relative',
                    }}>
                      {/* Filled bar */}
                      <View style={{
                        width: barW,
                        height: 14,
                        backgroundColor: barColor,
                        borderRadius: 3,
                        opacity: 0.85,
                      }} />
                    </View>
                    {/* Score label */}
                    <Text style={{
                      fontSize: 8,
                      fontWeight: 'bold',
                      color: barColor,
                      marginLeft: 6,
                      width: 24,
                    }}>
                      {score}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Score classification legend */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 20, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, backgroundColor: THEME.destructive, borderRadius: 2 }} />
          <Text style={{ fontSize: 7, color: THEME.fgDim }}>0-39 Weak</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, backgroundColor: THEME.warning, borderRadius: 2 }} />
          <Text style={{ fontSize: 7, color: THEME.fgDim }}>40-69 Fair</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, backgroundColor: THEME.chartreuse, borderRadius: 2 }} />
          <Text style={{ fontSize: 7, color: THEME.fgDim }}>70-100 Good</Text>
        </View>
      </View>
    </Page>
  );
}

// ─── Main Document ───────────────────────────────────────────────────────────

export function PdfReport({ data }: { data: PdfReportData }) {
  const pages: React.ReactNode[] = [];

  // 1. Cover
  pages.push(<CoverPage key="cover" data={data} />);

  // 2. Overview page with charts
  const allFindings = data.sections.flatMap(s => s.findings ?? []);
  const scoredSections = data.sections.filter(s => s.score != null);
  if (allFindings.length > 0 || scoredSections.length > 0) {
    pages.push(<OverviewPage key="overview" data={data} />);
  }

  // 3. Per-section detail pages
  for (const section of data.sections) {
    pages.push(<SectionPage key={`section-${section.id}`} section={section} />);
    // Add assets page for each section that has assets
    if (section.assets && section.assets.length > 0) {
      pages.push(<AssetsPage key={`assets-${section.id}`} section={section} />);
    }
  }

  // 4. Consolidated table (if multiple sections or many findings)
  const totalFindings = data.sections.reduce((sum, s) => sum + (s.findings ?? []).length, 0);
  if (totalFindings > 0) {
    pages.push(<SummaryTablePage key="summary-table" sections={data.sections} />);
  }

  return (
    <Document
      title={`Security Report - ${data.projectName}`}
      author={data.branding?.agencyName || 'SCAUDIT'}
      subject={`Infrastructure Security Assessment for ${data.projectDomain}`}
    >
      {pages}
    </Document>
  );
}

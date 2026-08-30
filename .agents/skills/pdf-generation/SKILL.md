---
name: pdf-generation
description: "Expert in PDF report generation using @react-pdf/renderer, jsPDF, and HTML2Canvas in SCAUDIT. Use when building or modifying report export, PDF templates, or document generation."
risk: safe
source: strategicaudit-pro-custom
date_added: "2026-08-29"
tags:
  - pdf
  - react-pdf
  - jspdf
  - html2canvas
  - reports
  - export
  - document-generation
---

# PDF Generation Expert

Expert in PDF report generation for SCAUDIT. Covers @react-pdf/renderer for structured reports, jsPDF for dynamic generation, and HTML2Canvas for screenshot-based reports.

## When to Use This Skill

- When building or modifying the PDF report template (`src/server/reports/pdf-template.tsx`)
- When working with the PDF generation API route (`src/app/api/reports/pdf/route.tsx`)
- When building PDF progress tracking (`src/app/api/reports/pdf/progress/route.ts`)
- When working with ExportPdfButton or DownloadPdfButton
- When modifying PDF report styles or layouts
- When building adversary or MITRE evaluation PDF reports

## Architecture

```
┌──────────────────────────────────────────────┐
│           PDF Generation Pipeline            │
├──────────────────────────────────────────────┤
│                                              │
│  Trigger: User clicks "Export PDF"           │
│       ↓                                      │
│  API Route (/api/reports/pdf)                │
│       ↓                                      │
│  Fetch project data (audits, findings, etc.) │
│       ↓                                      │
│  Render React-PDF template                   │
│       ↓                                      │
│  Stream PDF to client                        │
│       ↓                                      │
│  Progress tracking (SSE)                     │
│                                              │
│  Libraries:                                  │
│  ├─ @react-pdf/renderer (primary)           │
│  ├─ jspdf (dynamic content)                 │
│  └─ html2canvas (screenshot capture)        │
└──────────────────────────────────────────────┘
```

## @react-pdf/renderer (Primary)

Used for structured, template-based PDF reports.

### Basic Template Structure

```tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  section: { marginBottom: 16 },
  heading: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  text: { fontSize: 10, lineHeight: 1.5, color: "#333" },
});

export function AuditReport({ audit, findings }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.title}>Security Audit Report</Text>
          <Text style={styles.text}>Project: {audit.projectName}</Text>
          <Text style={styles.text}>Date: {audit.createdAt}</Text>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.heading}>Findings Summary</Text>
          {findings.map(f => (
            <View key={f.id} style={styles.finding}>
              <Text style={styles.text}>{f.title}</Text>
              <Text style={styles.severity}>{f.severity}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
```

### Important Notes
- @react-pdf/renderer uses its own styling (NOT Tailwind/CSS)
- All styles must use `StyleSheet.create()`
- No HTML elements — use `<View>`, `<Text>`, `<Image>`, `<Link>`
- Limited layout support (no flexbox gap, use margin/padding)
- Fonts must be registered if not using built-in

## jsPDF (Secondary)

Used for dynamic PDF generation and simple documents.

```typescript
import jsPDF from "jspdf";

const doc = new jsPDF();

// Add content
doc.setFontSize(24);
doc.text("Security Report", 20, 20);
doc.setFontSize(12);
doc.text(`Project: ${project.name}`, 20, 40);

// Add tables
doc.autoTable({
  head: [["Finding", "Severity", "Status"]],
  body: findings.map(f => [f.title, f.severity, f.fixed ? "Fixed" : "Open"]),
  startY: 60,
});

// Save
doc.save("report.pdf");
```

## HTML2Canvas (Screenshot-based)

Captures rendered HTML as images for PDF inclusion.

```typescript
import html2canvas from "html2canvas";

const element = document.getElementById("chart-container");
const canvas = await html2canvas(element);
const imgData = canvas.toDataURL("image/png");

// Add to jsPDF
doc.addImage(imgData, "PNG", 10, 10, 190, 100);
```

## Report Template Structure

The main PDF template (`src/server/reports/pdf-template.tsx`) follows this layout:

```
Page 1: Cover page
  ├─ Logo
  ├─ Report title
  ├─ Project name
  ├─ Date range
  └─ Executive summary

Page 2-N: Content sections
  ├─ Findings by category
  ├─ Risk score breakdown
  ├─ Charts (as images)
  ├─ Detailed findings
  └─ Recommendations

Last page: Appendix
  ├─ Methodology
  ├─ Tool versions
  └─ Glossary
```

## Progress Tracking

PDF generation can take time. The progress API provides SSE updates:

```typescript
// Client-side
const eventSource = new EventSource(`/api/reports/pdf/progress?jobId=${jobId}`);
eventSource.onmessage = (event) => {
  const { progress, stage } = JSON.parse(event.data);
  setProgress(progress); // 0-100
};
```

**Stages:**
1. Fetching data (0-30%)
2. Processing findings (30-60%)
3. Rendering template (60-90%)
4. Finalizing PDF (90-100%)

## Sharp Edges

### Memory limit on large reports
**Problem:** Reports with 1000+ findings cause out-of-memory errors.
**Fix:** Paginate findings, use streaming rendering, or implement pagination in the template.

### Font rendering issues
**Problem:** Custom fonts don't render correctly or cause layout breaks.
**Fix:** Register fonts with `Font.register()` before document creation. Use standard fonts for reliability.

### Chart images in PDF
**Problem:** Charts rendered in React don't appear in PDF.
**Fix:** Pre-render charts as images (PNG/SVG) using html2canvas or server-side rendering, then embed in the PDF.

### SSE connection drops
**Problem:** Progress tracking stops mid-generation.
**Fix:** Implement reconnection logic. Store progress in DB as fallback.

## Validation Checklist

Before modifying PDF generation:

- [ ] Template renders correctly at A4 size
- [ ] All fonts are registered or use built-in
- [ ] Charts/images are pre-rendered as PNG
- [ ] Progress tracking covers all stages
- [ ] Memory usage is acceptable for expected data volume
- [ ] PDF file size is reasonable (< 10MB)
- [ ] Template handles missing/empty data gracefully
- [ ] Text doesn't overflow containers

## Related Skills
- `recharts-dashboard` (chart generation for PDFs)
- `react-flow-graphs` (graph images for PDFs)
- `trigger-dev` (background PDF generation)

## When to Use
- User mentions PDF, report generation, or document export
- User mentions @react-pdf, jsPDF, or html2canvas
- User needs to modify report templates or export functionality

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.

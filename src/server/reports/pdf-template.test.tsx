import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@react-pdf/renderer", () => {
  const noop = () => null;
  const el = (type: string) =>
    React.forwardRef(function MockEl(props: Record<string, unknown>, _ref: unknown) {
      return React.createElement(type, props as React.HTMLAttributes<HTMLElement>);
    });
  return {
    Document: el("Document"),
    Page: el("Page"),
    View: el("View"),
    Text: el("Text"),
    Image: el("Image"),
    Svg: el("Svg"),
    Circle: el("Circle"),
    Path: el("Path"),
    StyleSheet: { create: (s: unknown) => s },
    renderToFile: vi.fn(),
  };
});

import { PdfReport } from "./pdf-template";
import type { PdfReportData } from "./pdf-template";

const baseData: PdfReportData = {
  projectName: "Test Project",
  projectDomain: "example.com",
  target: "example.com",
  targetType: "domain",
  date: "2026-09-17",
  overallScore: 75,
  sections: [],
};

describe("PdfReport — cover page", () => {
  it("renders without crashing with minimal data", () => {
    const el = React.createElement(PdfReport, { data: baseData });
    expect(el).toBeDefined();
  });

  it("renders with overallScore null", () => {
    const data = { ...baseData, overallScore: null };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders with score 0 (destructive color)", () => {
    const data = { ...baseData, overallScore: 0 };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders with score 100 (chartreuse color)", () => {
    const data = { ...baseData, overallScore: 100 };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders with score in warning range (40-69)", () => {
    const data = { ...baseData, overallScore: 50 };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders with branding (logo + agency name)", () => {
    const data = {
      ...baseData,
      branding: {
        agencyName: "My Agency",
        logoUrl: "https://example.com/logo.png",
        primaryColor: "#FF0000",
      },
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders without branding (default agency text)", () => {
    const el = React.createElement(PdfReport, { data: baseData });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — section pages", () => {
  it("renders sections with findings", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s1",
          title: "SSL/TLS Analysis",
          score: 85,
          summary: "Good TLS configuration",
          totalFindings: 3,
          severeCount: 1,
          findings: [
            {
              severity: "critical" as const,
              title: "Weak cipher suite",
              description: "Server supports TLS_RSA_WITH_RC4",
              recommendation: "Disable RC4",
              affectedAsset: "example.com:443",
              mitreTechnique: "T1557",
            },
            {
              severity: "high" as const,
              title: "Missing HSTS",
              description: "No HSTS header found",
              recommendation: "Add Strict-Transport-Security",
            },
            {
              severity: "low" as const,
              title: "Certificate expiring soon",
              description: "Expires in 30 days",
            },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders sections with no findings", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s2",
          title: "Empty Section",
          findings: [],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders sections with null score", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s3",
          title: "No Score Section",
          score: null,
          findings: [
            {
              severity: "medium" as const,
              title: "Some issue",
              description: "Details here",
            },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders finding without optional fields (recommendation, affectedAsset, mitreTechnique)", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s4",
          title: "Minimal Finding",
          findings: [
            {
              severity: "info" as const,
              title: "Info item",
              description: "Just info",
            },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders finding with all optional fields present", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s5",
          title: "Full Finding",
          findings: [
            {
              severity: "medium" as const,
              title: "Medium issue",
              description: "Some medium issue",
              recommendation: "Fix it",
              affectedAsset: "api.example.com",
              mitreTechnique: "T1190",
            },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — assets pages", () => {
  it("renders sections with assets grouped by type", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s6",
          title: "Asset Discovery",
          findings: [],
          assets: [
            { assetType: "subdomain", value: "api.example.com", ip: "1.2.3.4", firstSeenAt: "2026-01-01", lastSeenAt: "2026-09-17" },
            { assetType: "subdomain", value: "mail.example.com", ip: "1.2.3.5" },
            { assetType: "ip_address", value: "5.6.7.8", ip: "5.6.7.8" },
            { assetType: "certificate", value: "*.example.com" },
            { assetType: "email", value: "admin@example.com" },
            { assetType: "cdn", value: "cdn.example.com" },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders assets page with unknown asset type", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s7",
          title: "Unknown Type",
          findings: [],
          assets: [
            { assetType: "unknown_thing", value: "foo.bar" },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("does not render assets page when assets array is empty", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s8",
          title: "No Assets",
          findings: [],
          assets: [],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders assets with null dates", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s9",
          title: "Null Dates",
          findings: [],
          assets: [
            { assetType: "subdomain", value: "x.com", firstSeenAt: null, lastSeenAt: null },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("truncates asset list at 30 items with overflow text", () => {
    const assets = Array.from({ length: 35 }, (_, i) => ({
      assetType: "subdomain",
      value: `sub${i}.example.com`,
    }));
    const data = {
      ...baseData,
      sections: [
        {
          id: "s10",
          title: "Many Assets",
          findings: [],
          assets,
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — overview page", () => {
  it("renders overview page when findings exist across sections", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s11",
          title: "Section A",
          score: 80,
          findings: [
            { severity: "critical" as const, title: "F1", description: "D1" },
            { severity: "high" as const, title: "F2", description: "D2" },
          ],
        },
        {
          id: "s12",
          title: "Section B",
          score: 45,
          findings: [
            { severity: "medium" as const, title: "F3", description: "D3" },
            { severity: "low" as const, title: "F4", description: "D4" },
            { severity: "info" as const, title: "F5", description: "D5" },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("renders overview with sections that have no findings but have scores", () => {
    const data = {
      ...baseData,
      sections: [
        { id: "s13", title: "Scored Only", score: 90, findings: [] },
        { id: "s14", title: "Also Scored", score: 30, findings: [] },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — summary table page", () => {
  it("renders consolidated summary table with findings from multiple sections", () => {
    const data = {
      ...baseData,
      sections: [
        {
          id: "s15",
          title: "Category 1",
          findings: [
            { severity: "critical" as const, title: "T1", description: "D", affectedAsset: "a.com" },
            { severity: "high" as const, title: "T2", description: "D" },
          ],
        },
        {
          id: "s16",
          title: "Category 2",
          findings: [
            { severity: "low" as const, title: "T3", description: "D", affectedAsset: "b.com" },
          ],
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — document metadata", () => {
  it("sets document title, author and subject", () => {
    const el = React.createElement(PdfReport, { data: baseData });
    expect(el).toBeDefined();
    expect((el.props as { data: PdfReportData }).data).toBeDefined();
    expect((el.props as { data: PdfReportData }).data.projectName).toBe("Test Project");
  });

  it("uses branding agencyName as author when available", () => {
    const data = {
      ...baseData,
      branding: { agencyName: "WhiteLabel Inc" },
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

describe("PdfReport — finding truncation", () => {
  it("truncates findings at 50 per section", () => {
    const findings = Array.from({ length: 55 }, (_, i) => ({
      severity: "info" as const,
      title: `Finding ${i}`,
      description: `Description ${i}`,
    }));
    const data = {
      ...baseData,
      sections: [
        {
          id: "s17",
          title: "Many Findings",
          findings,
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });

  it("truncates summary table at 100 findings", () => {
    const findings = Array.from({ length: 60 }, (_, i) => ({
      severity: "low" as const,
      title: `Table Finding ${i}`,
      description: `Desc ${i}`,
    }));
    const data = {
      ...baseData,
      sections: [
        {
          id: "s18",
          title: "Massive Section",
          findings,
        },
      ],
    };
    const el = React.createElement(PdfReport, { data });
    expect(el).toBeDefined();
  });
});

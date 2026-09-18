import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import { directDb } from "@/shared/db/direct";
import { reports } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { logger } from "@/shared/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserOrThrow();
    const { id } = await params;

    const report = await withRLS(user.id, async (tx) => {
      const result = await tx
        .select()
        .from(reports)
        .where(eq(reports.id, id))
        .limit(1);
      return result[0] ?? null;
    });

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Generate PDF (placeholder for now)
    const pdfContent = Buffer.from(
      JSON.stringify({ reportId: report.id, title: report.title }),
      "utf-8"
    );

    return new NextResponse(pdfContent, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${id}.pdf"`,
      },
    });
  } catch (error) {
    logger.error("PDF generation error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { keywordTargets, rankHistory } from '@/shared/db/schemas';
import { eq, desc } from 'drizzle-orm';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const projectId = resolvedParams.id;

  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Fetch data using withRLS
    const data = await withRLS(user.id, async (tx) => {
      // Get all keyword targets for this project
      const targets = await tx.select().from(keywordTargets)
        .where(eq(keywordTargets.projectId, projectId));

      const results = [];

      for (const target of targets) {
        // Get latest rank for each
        const latestRank = await tx.select().from(rankHistory)
          .where(eq(rankHistory.keywordId, target.id))
          .orderBy(desc(rankHistory.checkedAt))
          .limit(1);

        const rank = latestRank[0];
        results.push({
          Keyword: target.keyword,
          Location: target.location || 'N/A',
          Device: target.device || 'desktop',
          Position: rank?.position || 'N/A',
          'Search Volume': rank?.searchVolume || 0,
          'Last Checked': rank?.checkedAt || 'N/A',
          'Target URL': target.targetUrl || 'N/A'
        });
      }

      return results;
    });

    if (!data || data.length === 0) {
      // Fallback: headers only
      const csv = 'Keyword,Location,Device,Position,Search Volume,Last Checked,Target URL\n';
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="keywords-${projectId}.csv"`,
        },
      });
    }

    // 3. Generate CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const val = row[header as keyof typeof row];
          // Escape commas
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="keywords-ranking-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Export CSV Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

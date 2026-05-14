import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schemas/index';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  });

  const db = drizzle(pool, { schema });

  console.log('🌱 Starting database seed...');

  try {
    // Level 1: Core Definitions (No foreign keys)
    console.log('Seeding Users...');
    const userIds = [
      'd4e8c1fa-8a5f-4a3e-b2d9-1c9f2a0b3e1a',
      'f5a7e2b1-9c6d-4b8a-a3e2-0d8c1b9a2f3b',
    ];
    const insertedUsers = await db.insert(schema.users).values([
      { id: userIds[0], email: 'admin@strategicaudit.pro', fullName: 'Admin User', role: 'admin' },
      { id: userIds[1], email: 'client@company.com', fullName: 'Client User', role: 'client' },
    ]).returning();

    console.log('Seeding Subscription Plans...');
    const insertedPlans = await db.insert(schema.subscriptionPlans).values([
      {
        name: 'Pro',
        maxProjects: 10,
        maxKeywords: 5000,
        maxBacklinkChecks: 10000,
        crawlLimitMonthly: 500000,
        features: { whiteLabel: true, apiAccess: false },
        priceMonthly: '99.00',
        priceYearly: '990.00',
      },
    ]).returning();

    console.log('Seeding Audit Rules...');
    const insertedRules = await db.insert(schema.auditRules).values([
      {
        code: 'SEO_META_001',
        title: 'Missing Title Tag',
        description: 'Page is missing a <title> tag.',
        category: 'meta',
        severity: 'critical',
        recommendation: 'Add a descriptive <title> tag to the document <head>.',
      },
      {
        code: 'PERF_LCP_001',
        title: 'LCP Exceeds 2.5s',
        description: 'Largest Contentful Paint is too slow.',
        category: 'performance',
        severity: 'critical',
        recommendation: 'Optimize hero images and remove render-blocking resources.',
      },
    ]).returning();

    // Level 2
    console.log('Seeding Projects...');
    const insertedProjects = await db.insert(schema.projects).values([
      { ownerId: insertedUsers[0].id, name: 'Main E-commerce', domain: 'https://ecommerce.example.com' },
      { ownerId: insertedUsers[1].id, name: 'SaaS Landing', domain: 'https://saas.example.com' },
    ]).returning();

    console.log('Seeding Subscriptions...');
    await db.insert(schema.subscriptions).values([
      {
        projectId: insertedProjects[0].id,
        planId: insertedPlans[0].id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      },
    ]);

    // Level 3
    console.log('Seeding Integrations & Data...');
    const insertedIntegrations = await db.insert(schema.integrations).values([
      { projectId: insertedProjects[0].id, type: 'gsc', status: 'active' },
      { projectId: insertedProjects[0].id, type: 'ga4', status: 'active' },
    ]).returning();

    await db.insert(schema.integrationDataGsc).values([
      { projectId: insertedProjects[0].id, date: new Date().toISOString(), url: 'https://ecommerce.example.com/', clicks: 150, impressions: 2000, ctr: '0.075', position: '3.2' },
    ]);
    
    await db.insert(schema.integrationDataGa4).values([
      { projectId: insertedProjects[0].id, date: new Date().toISOString(), pagePath: '/', activeUsers: 300, conversions: 12, engagementRate: '0.65' },
    ]);

    await db.insert(schema.integrationDataBing).values([
      { projectId: insertedProjects[0].id, date: new Date().toISOString(), url: 'https://ecommerce.example.com/', clicks: 20, impressions: 300, ctr: '0.066', position: '5.1' },
    ]);

    console.log('Seeding Audits...');
    const insertedAudits = await db.insert(schema.audits).values([
      { projectId: insertedProjects[0].id, type: 'crawl', status: 'completed', createdBy: insertedUsers[0].id },
      { projectId: insertedProjects[1].id, type: 'performance', status: 'completed', createdBy: insertedUsers[1].id },
    ]).returning();

    console.log('Seeding Project Audit Rules...');
    await db.insert(schema.projectAuditRules).values([
      { projectId: insertedProjects[0].id, ruleId: insertedRules[0].id, enabled: true },
      { projectId: insertedProjects[0].id, ruleId: insertedRules[1].id, enabled: true },
    ]);

    console.log('Seeding Keyword Targets...');
    const insertedKeywords = await db.insert(schema.keywordTargets).values([
      { projectId: insertedProjects[0].id, keyword: 'buy shoes online', location: 'US', device: 'mobile' },
      { projectId: insertedProjects[1].id, keyword: 'crm software', location: 'UK', device: 'desktop' },
    ]).returning();

    console.log('Seeding Competitors...');
    const insertedCompetitors = await db.insert(schema.competitors).values([
      { projectId: insertedProjects[0].id, domain: 'https://competitor1.com', name: 'Competitor 1', daScore: 45 },
    ]).returning();

    console.log('Seeding Backlinks...');
    const insertedBacklinks = await db.insert(schema.backlinks).values([
      { projectId: insertedProjects[0].id, sourceUrl: 'https://blog.example.com/shoes', targetUrl: 'https://ecommerce.example.com/', firstDetectedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), domainAuthority: 60 },
    ]).returning();

    console.log('Seeding A/B Tests...');
    const insertedAbTests = await db.insert(schema.abTests).values([
      { projectId: insertedProjects[0].id, name: 'Hero CTA Color', url: 'https://ecommerce.example.com/', variants: { A: 'Red', B: 'Blue' }, goalMetric: 'clicks', status: 'running' },
    ]).returning();

    console.log('Seeding Heatmap Sessions...');
    await db.insert(schema.heatmapSessions).values([
      { projectId: insertedProjects[0].id, url: 'https://ecommerce.example.com/', sessionData: { clicks: [{ x: 100, y: 200 }] } },
    ]);

    console.log('Seeding Schema Validations...');
    await db.insert(schema.schemaValidations).values([
      { projectId: insertedProjects[0].id, url: 'https://ecommerce.example.com/product/1', isValid: true, jsonLd: { "@context": "https://schema.org", "@type": "Product" } },
    ]);

    console.log('Seeding Reports...');
    const insertedReports = await db.insert(schema.reports).values([
      { projectId: insertedProjects[0].id, name: 'Monthly SEO Report', configuration: { widgets: ['traffic', 'rankings'] }, createdBy: insertedUsers[0].id },
    ]).returning();

    // Level 4
    console.log('Seeding Integration Sync Logs...');
    await db.insert(schema.integrationSyncLogs).values([
      { integrationId: insertedIntegrations[0].id, status: 'success', recordsSynced: 150 },
    ]);

    console.log('Seeding Crawl Results...');
    const insertedCrawlResults = await db.insert(schema.crawlResults).values([
      { auditId: insertedAudits[0].id, url: 'https://ecommerce.example.com/', statusCode: 200, title: 'Home', wordCount: 1200 },
      { auditId: insertedAudits[0].id, url: 'https://ecommerce.example.com/about', statusCode: 200, title: 'About Us', wordCount: 800 },
    ]).returning();

    console.log('Seeding Performance Results...');
    await db.insert(schema.performanceResults).values([
      { auditId: insertedAudits[1].id, url: 'https://saas.example.com/', device: 'mobile', lcp: '1.2', ttfb: '0.3', lighthouseScore: 95 },
    ]);

    console.log('Seeding Issues...');
    await db.insert(schema.issues).values([
      { projectId: insertedProjects[0].id, auditId: insertedAudits[0].id, ruleId: insertedRules[0].id, url: 'https://ecommerce.example.com/missing-title', severity: 'critical', category: 'meta', title: 'Missing Title', description: 'No title found.' },
    ]);

    console.log('Seeding Rank History...');
    await db.insert(schema.rankHistory).values([
      { keywordId: insertedKeywords[0].id, position: 5, checkedAt: new Date().toISOString() },
    ]);

    console.log('Seeding Competitor Keywords...');
    await db.insert(schema.competitorKeywords).values([
      { competitorId: insertedCompetitors[0].id, keyword: 'buy shoes online', position: 3, checkedAt: new Date().toISOString() },
    ]);

    console.log('Seeding Backlink History...');
    await db.insert(schema.backlinkHistory).values([
      { backlinkId: insertedBacklinks[0].id, domainAuthority: 60, checkedAt: new Date().toISOString() },
    ]);

    console.log('Seeding A/B Test Results...');
    await db.insert(schema.abTestResults).values([
      { testId: insertedAbTests[0].id, variantName: 'A', visitors: 1000, conversions: 50, date: new Date().toISOString() },
    ]);

    console.log('Seeding Report Exports...');
    await db.insert(schema.reportExports).values([
      { reportId: insertedReports[0].id, format: 'pdf', status: 'completed', fileUrl: 'https://storage.com/report.pdf' },
    ]);

    console.log('Seeding Audit Logs...');
    await db.insert(schema.auditLogs).values([
      { userId: insertedUsers[0].id, projectId: insertedProjects[0].id, action: 'PROJECT_CREATED' },
    ]);

    // Level 5
    console.log('Seeding Internal Links...');
    await db.insert(schema.internalLinks).values([
      { crawlId: insertedCrawlResults[0].id, sourceUrl: 'https://ecommerce.example.com/', targetUrl: 'https://ecommerce.example.com/about', anchorText: 'About' },
    ]);

    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

main();

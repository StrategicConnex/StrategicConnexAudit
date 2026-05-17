import {
  pgTable, uuid, varchar, text, integer, timestamp, pgEnum,
  jsonb, boolean, numeric, date, bigint, unique
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const roleEnum = pgEnum("role", ["admin", "manager", "client"]);
export const subStatusEnum = pgEnum("sub_status", ["active", "canceled", "past_due", "trialing"]);
export const integrationTypeEnum = pgEnum("integration_type", ["gsc", "ga4", "bing", "ahrefs", "semrush"]);
export const integrationStatusEnum = pgEnum("integration_status", ["active", "expired", "revoked"]);
export const syncStatusEnum = pgEnum("sync_status", ["pending", "running", "success", "failed"]);
export const auditTypeEnum = pgEnum("audit_type", ["crawl", "performance", "technical", "full"]);
export const auditStatusEnum = pgEnum("audit_status", ["pending", "running", "completed", "failed", "canceled"]);
export const deviceEnum = pgEnum("device", ["mobile", "desktop"]);
export const ruleCategoryEnum = pgEnum("rule_category", ["meta", "link", "performance", "accessibility", "security", "seo"]);
export const severityEnum = pgEnum("severity", ["critical", "warning", "info"]);
export const abTestStatusEnum = pgEnum("ab_test_status", ["draft", "running", "paused", "completed"]);
export const exportFormatEnum = pgEnum("export_format", ["pdf", "csv", "xlsx", "looker_studio"]);
export const exportStatusEnum = pgEnum("export_status", ["pending", "processing", "completed", "failed"]);

// 1. Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // References auth.users
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  role: roleEnum("role").notNull().default("client"),
  planId: uuid("plan_id").references(() => subscriptionPlans.id), // Vinculacin SaaS Estndar
  preferences: jsonb("preferences").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// 2. Projects
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  timezone: text("timezone").default("UTC"),
  crawlDepth: integer("crawl_depth").default(3),
  userAgent: text("user_agent").default("StrategicAuditBot/1.0"),
  respectsRobotsTxt: boolean("respects_robots_txt").default(true),
  dataRetentionDays: integer("data_retention_days").default(365),
  autoDeleteAudits: boolean("auto_delete_audits").default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// 3. Subscription Plans
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  maxProjects: integer("max_projects").notNull(),
  maxKeywords: integer("max_keywords").notNull(),
  maxBacklinkChecks: integer("max_backlink_checks").notNull(),
  crawlLimitMonthly: integer("crawl_limit_monthly").notNull(),
  features: jsonb("features").notNull(),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }),
  priceYearly: numeric("price_yearly", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 4. Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  planId: uuid("plan_id").references(() => subscriptionPlans.id).notNull(),
  status: subStatusEnum("status").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  cancelAt: timestamp("cancel_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 5. Integrations
export const integrations = pgTable("integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  type: integrationTypeEnum("type").notNull(),
  credentialsEncrypted: text("credentials_encrypted"),
  status: integrationStatusEnum("status").default("active").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.type)
]);

// 6. Integration Sync Logs
export const integrationSyncLogs = pgTable("integration_sync_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: 'cascade' }).notNull(),
  status: syncStatusEnum("status"),
  recordsSynced: integer("records_synced"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 7. Integration Data GSC
export const integrationDataGsc = pgTable("integration_data_gsc", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  date: date("date").notNull(),
  url: text("url").notNull(),
  clicks: integer("clicks").default(0),
  impressions: integer("impressions").default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }).default("0"),
  position: numeric("position", { precision: 6, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.date, t.url)
]);

// 8. Integration Data GA4
export const integrationDataGa4 = pgTable("integration_data_ga4", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  date: date("date").notNull(),
  pagePath: text("page_path").notNull(),
  activeUsers: integer("active_users").default(0),
  conversions: integer("conversions").default(0),
  engagementRate: numeric("engagement_rate", { precision: 6, scale: 4 }).default("0"),
  customDimensions: jsonb("custom_dimensions").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.date, t.pagePath)
]);

// 9. Integration Data Bing
export const integrationDataBing = pgTable("integration_data_bing", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  date: date("date").notNull(),
  url: text("url").notNull(),
  clicks: integer("clicks").default(0),
  impressions: integer("impressions").default(0),
  ctr: numeric("ctr", { precision: 8, scale: 4 }).default("0"),
  position: numeric("position", { precision: 6, scale: 2 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.date, t.url)
]);

// 10. Audits
export const audits = pgTable("audits", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  type: auditTypeEnum("type").notNull(),
  status: auditStatusEnum("status").default("pending").notNull(),
  config: jsonb("config").default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 11. Crawl Results
export const crawlResults = pgTable("crawl_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  auditId: uuid("audit_id").references(() => audits.id, { onDelete: 'cascade' }).notNull(),
  url: text("url").notNull(),
  statusCode: integer("status_code"),
  contentType: text("content_type"),
  title: text("title"),
  metaDescription: text("meta_description"),
  h1Tags: text("h1_tags").array(),
  h2Tags: text("h2_tags").array(),
  canonicalUrl: text("canonical_url"),
  robotsMeta: text("robots_meta"),
  robotsTxtAllowed: boolean("robots_txt_allowed").default(true),
  referrer: text("referrer"),
  ogTags: jsonb("og_tags"),
  externalLinks: text("external_links").array(),
  images: jsonb("images"),
  wordCount: integer("word_count"),
  crawlDepth: integer("crawl_depth"),
  isOrphan: boolean("is_orphan").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 12. Internal Links
export const internalLinks = pgTable("internal_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  crawlId: uuid("crawl_id").references(() => crawlResults.id, { onDelete: 'cascade' }).notNull(),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url").notNull(),
  anchorText: text("anchor_text"),
  rel: text("rel"),
  isFollow: boolean("is_follow").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 13. Performance Results
export const performanceResults = pgTable("performance_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  auditId: uuid("audit_id").references(() => audits.id, { onDelete: 'cascade' }).notNull(),
  url: text("url").notNull(),
  device: deviceEnum("device").notNull(),
  region: text("region"),
  lcp: numeric("lcp", { precision: 8, scale: 2 }),
  inp: numeric("inp", { precision: 8, scale: 2 }),
  cls: numeric("cls", { precision: 6, scale: 3 }),
  ttfb: numeric("ttfb", { precision: 8, scale: 2 }),
  fcp: numeric("fcp", { precision: 8, scale: 2 }),
  lighthouseScore: integer("lighthouse_score"),
  cruxData: jsonb("crux_data"),
  rawReport: jsonb("raw_report"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 14. Audit Rules
export const auditRules = pgTable("audit_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: ruleCategoryEnum("category").notNull(),
  severity: severityEnum("severity").notNull(),
  recommendation: text("recommendation"),
  defaultConfig: jsonb("default_config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 15. Project Audit Rules
export const projectAuditRules = pgTable("project_audit_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  ruleId: uuid("rule_id").references(() => auditRules.id, { onDelete: 'cascade' }).notNull(),
  enabled: boolean("enabled").default(true),
  customConfig: jsonb("custom_config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.ruleId)
]);

// 16. Issues
export const issues = pgTable("issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  auditId: uuid("audit_id").references(() => audits.id, { onDelete: 'set null' }),
  ruleId: uuid("rule_id").references(() => auditRules.id, { onDelete: 'set null' }),
  url: text("url"),
  severity: severityEnum("severity").notNull(),
  category: ruleCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation"),
  fixed: boolean("fixed").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 17. Keyword Targets
export const keywordTargets = pgTable("keyword_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  keyword: text("keyword").notNull(),
  location: text("location"),
  device: deviceEnum("device").default("desktop"),
  language: text("language").default("en"),
  targetUrl: text("target_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.keyword, t.location, t.device)
]);

// 18. Rank History
export const rankHistory = pgTable("rank_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  keywordId: uuid("keyword_id").references(() => keywordTargets.id, { onDelete: 'cascade' }).notNull(),
  position: integer("position"),
  serpFeatures: jsonb("serp_features"),
  searchVolume: integer("search_volume"),
  cpc: numeric("cpc", { precision: 10, scale: 6 }),
  competition: numeric("competition", { precision: 4, scale: 2 }),
  checkedAt: date("checked_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.keywordId, t.checkedAt)
]);

// 19. Competitors
export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  domain: text("domain").notNull(),
  name: text("name"),
  daScore: integer("da_score"),
  backlinksCount: bigint("backlinks_count", { mode: 'number' }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.domain)
]);

// 20. Competitor Keywords
export const competitorKeywords = pgTable("competitor_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitorId: uuid("competitor_id").references(() => competitors.id, { onDelete: 'cascade' }).notNull(),
  keyword: text("keyword").notNull(),
  position: integer("position"),
  searchVolume: integer("search_volume"),
  difficulty: integer("difficulty"),
  checkedAt: date("checked_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 21. Backlinks
export const backlinks = pgTable("backlinks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url").notNull(),
  anchorText: text("anchor_text"),
  isNofollow: boolean("is_nofollow").default(false),
  isUgc: boolean("is_ugc").default(false),
  isSponsored: boolean("is_sponsored").default(false),
  domainAuthority: integer("domain_authority"),
  pageAuthority: integer("page_authority"),
  toxicityScore: numeric("toxicity_score", { precision: 5, scale: 2 }),
  firstDetectedAt: date("first_detected_at").notNull(),
  lastSeenAt: date("last_seen_at").notNull(),
  lostAt: date("lost_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.projectId, t.sourceUrl, t.targetUrl)
]);

// 22. Backlink History
export const backlinkHistory = pgTable("backlink_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  backlinkId: uuid("backlink_id").references(() => backlinks.id, { onDelete: 'cascade' }).notNull(),
  domainAuthority: integer("domain_authority"),
  pageAuthority: integer("page_authority"),
  toxicityScore: numeric("toxicity_score", { precision: 5, scale: 2 }),
  checkedAt: date("checked_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 23. AB Tests
export const abTests = pgTable("ab_tests", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  variants: jsonb("variants").notNull(),
  goalMetric: text("goal_metric").notNull(),
  status: abTestStatusEnum("status").default("draft").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  winnerVariant: text("winner_variant"),
  uplift: numeric("uplift", { precision: 8, scale: 4 }),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 24. AB Test Results
export const abTestResults = pgTable("ab_test_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  testId: uuid("test_id").references(() => abTests.id, { onDelete: 'cascade' }).notNull(),
  variantName: text("variant_name").notNull(),
  visitors: integer("visitors").default(0),
  conversions: integer("conversions").default(0),
  conversionRate: numeric("conversion_rate", { precision: 8, scale: 4 }),
  date: date("date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 25. Heatmap Sessions
export const heatmapSessions = pgTable("heatmap_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  url: text("url").notNull(),
  sessionData: jsonb("session_data").notNull(),
  anonymizedIp: text("anonymized_ip"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
});

// 26. Schema Validations
export const schemaValidations = pgTable("schema_validations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  url: text("url").notNull(),
  jsonLd: jsonb("json_ld"),
  isValid: boolean("is_valid"),
  errors: jsonb("errors"),
  validatedAt: timestamp("validated_at", { withTimezone: true }).defaultNow(),
});

// 27. Reports
export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  configuration: jsonb("configuration").notNull(),
  scheduleCron: text("schedule_cron"),
  lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 28. Report Exports
export const reportExports = pgTable("report_exports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: 'cascade' }).notNull(),
  format: exportFormatEnum("format").notNull(),
  fileUrl: text("file_url"),
  status: exportStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 29. Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'set null' }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'set null' }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 30. Uptime Logs (Phase 2)
export const uptimeLogs = pgTable("uptime_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  isUp: boolean("is_up").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage: text("error_message"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// 31. Web Vitals Logs (Phase 2 - Real User Monitoring)
export const webVitalsLogs = pgTable("web_vitals_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  url: text("url").notNull(),
  deviceType: deviceEnum("device_type").notNull().default("desktop"),
  lcp: numeric("lcp", { precision: 8, scale: 2 }), // Largest Contentful Paint (ms)
  inp: numeric("inp", { precision: 8, scale: 2 }), // Interaction to Next Paint (ms)
  cls: numeric("cls", { precision: 8, scale: 4 }), // Cumulative Layout Shift
  ttfb: numeric("ttfb", { precision: 8, scale: 2 }), // Time to First Byte (ms)
  fcp: numeric("fcp", { precision: 8, scale: 2 }), // First Contentful Paint (ms)
  sessionId: text("session_id"),
  path: text("path"),
  browser: text("browser"),
  country: text("country"),
  fid: numeric("fid", { precision: 8, scale: 2 }), // First Input Delay (ms)
  pageViews: integer("page_views").default(1),
  sessionDuration: integer("session_duration"),
  timeOnPage: integer("time_on_page"),
  errors: jsonb("errors"),
  interactions: jsonb("interactions"),
  resources: jsonb("resources"),
  connection: jsonb("connection"),
  memory: jsonb("memory"),
  timing: jsonb("timing"),
  rawPayload: jsonb("raw_payload"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
});

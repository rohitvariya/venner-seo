import { relations } from "drizzle-orm";
import {
  boolean, customType, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
import { createId } from "./id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const roleEnum = pgEnum("role", ["OWNER", "EDITOR", "VIEWER", "CLIENT"]);
export const onboardingStepEnum = pgEnum("onboarding_step", [
  "WEBSITE", "SERVICES", "COMPETITORS", "CONTACT", "AREAS", "FIRST_CONTENT", "DONE",
]);
export const jobStatusEnum = pgEnum("job_status", ["IDLE", "QUEUED", "RUNNING", "DONE", "FAILED"]);
export const keywordStatusEnum = pgEnum("keyword_status", ["SUGGESTED", "PLANNED", "USED", "REJECTED"]);
export const articleStatusEnum = pgEnum("article_status", [
  "IDEA", "WRITING", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED",
]);
export const integrationTypeEnum = pgEnum("integration_type", ["WORDPRESS", "SHOPIFY", "GSC", "CUSTOM", "GBP"]);

/** Everything content is built from. Auto-filled from the website scan, editable on the Business page. */
export type Blueprint = {
  idealCustomer: string;
  differentiators: string[]; // why people choose this business; proof points like numbers and awards
  facts: string[]; // facts every article must get right (prices, hours, qualifications…)
  targetSearches: string[]; // searches the business wants to win
  likedArticles: string[]; // URLs of articles whose style the owner likes
  author: { name: string; jobTitle: string; bio: string; expertise: string[]; aboutUrl: string; linkedin: string } | null;
};

export const emptyBlueprint: Blueprint = {
  idealCustomer: "",
  differentiators: [],
  facts: [],
  targetSearches: [],
  likedArticles: [],
  author: null,
};

export type FactIssue = { claim: string; problem: string; suggestion: string };

export type OnboardingStep = (typeof onboardingStepEnum.enumValues)[number];
export type ArticleStatus = (typeof articleStatusEnum.enumValues)[number];
export type KeywordStatus = (typeof keywordStatusEnum.enumValues)[number];
export type IntegrationType = (typeof integrationTypeEnum.enumValues)[number];

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

// A workspace is an agency or a single business account. Agencies hold many sites.
export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  // Branding on client reports and the client login screens.
  brandName: text("brand_name"),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  reportFooter: text("report_footer"), // e.g. "Questions? Call Rohit on +91 …"
  createdAt: createdAt(),
});

/** Which sites a CLIENT login can see (agency staff see every site in the workspace). */
export const clientSiteAccess = pgTable(
  "client_site_access",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("client_site_access_user_site").on(t.userId, t.siteId)],
);

/** Invite links: the agency sends one to a client, who opens it and sets their own password. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token").on(t.tokenHash)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    role: roleEnum("role").notNull().default("OWNER"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_workspace").on(t.userId, t.workspaceId)],
);

export const sites = pgTable(
  "sites",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    businessName: text("business_name"),
    category: text("category"),
    summary: text("summary"),
    language: text("language").notNull().default("en"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    streetAddress: text("street_address"),
    phone: text("phone"),
    toneOfVoice: text("tone_of_voice"),
    onboardingStep: onboardingStepEnum("onboarding_step").notNull().default("WEBSITE"),
    scanStatus: jobStatusEnum("scan_status").notNull().default("IDLE"),
    scanError: text("scan_error"),
    articlesPerMonth: integer("articles_per_month").notNull().default(8),
    blueprint: jsonb("blueprint").$type<Blueprint>().notNull().default(emptyBlueprint),
    aiStatus: jobStatusEnum("ai_status").notNull().default("IDLE"),
    aiCheckedAt: timestamp("ai_checked_at", { withTimezone: true }),
    // Posting & review settings
    googlePostsPerWeek: integer("google_posts_per_week").notNull().default(2),
    socialChannels: jsonb("social_channels").$type<PostChannel[]>().notNull().default(["google", "facebook", "instagram", "linkedin"]),
    autoReplyPositive: boolean("auto_reply_positive").notNull().default(false),
    photoUsage: text("photo_usage").$type<"always" | "relevant" | "never">().notNull().default("relevant"),
    // Map position of the business (from Google Business Profile or geocoded address), for the geo-grid.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    // Public id for the testimonials widget embedded on the business's website.
    widgetKey: text("widget_key"),
    // Secret for the shareable client report link (/r/{token}); regenerate to revoke.
    reportToken: text("report_token"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sites_workspace_domain").on(t.workspaceId, t.domain)],
);

// Pages crawled from the client's own site: used for grounding and internal links.
export const sitePages = pgTable(
  "site_pages",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    h1: text("h1"),
    text: text("text").notNull(),
    isService: boolean("is_service").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("site_pages_site_url").on(t.siteId, t.url)],
);

export const services = pgTable("services", {
  id: id(),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pageUrl: text("page_url"),
  selected: boolean("selected").notNull().default(true),
});

export const competitors = pgTable("competitors", {
  id: id(),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
});

export const serviceAreas = pgTable("service_areas", {
  id: id(),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const keywords = pgTable(
  "keywords",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    phrase: text("phrase").notNull(),
    intent: text("intent"),
    searchVolume: integer("search_volume"),
    difficulty: integer("difficulty"),
    cpc: doublePrecision("cpc"),
    cluster: text("cluster"),
    status: keywordStatusEnum("status").notNull().default("SUGGESTED"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("keywords_site_phrase").on(t.siteId, t.phrase)],
);

export const articles = pgTable(
  "articles",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id").references(() => keywords.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    brief: jsonb("brief"),
    contentMd: text("content_md"),
    faq: jsonb("faq").$type<{ question: string; answer: string }[]>(),
    seoScore: integer("seo_score"),
    seoChecks: jsonb("seo_checks").$type<{ id: string; label: string; passed: boolean; weight: number }[]>(),
    factIssues: jsonb("fact_issues").$type<FactIssue[]>(),
    clientNote: text("client_note"), // change request from the client login
    heroImageUrl: text("hero_image_url"),
    status: articleStatusEnum("status").notNull().default("IDEA"),
    plannedFor: timestamp("planned_for", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedUrl: text("published_url"),
    externalId: text("external_id"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("articles_site_status").on(t.siteId, t.status)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    type: integrationTypeEnum("type").notNull(),
    // Encrypted JSON blob (AES-256-GCM) with credentials / tokens.
    secret: text("secret").notNull(),
    config: jsonb("config").$type<Record<string, string>>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_site_type").on(t.siteId, t.type)],
);

export const gscDailyMetrics = pgTable(
  "gsc_daily_metrics",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: doublePrecision("ctr").notNull(),
    position: doublePrecision("position").notNull(),
  },
  (t) => [uniqueIndex("gsc_daily_site_date").on(t.siteId, t.date)],
);

export const gscQueryMetrics = pgTable(
  "gsc_query_metrics",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    periodEnd: date("period_end").notNull(),
    query: text("query").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: doublePrecision("ctr").notNull(),
    position: doublePrecision("position").notNull(),
  },
  (t) => [index("gsc_query_site_period").on(t.siteId, t.periodEnd)],
);

// ---- AI visibility ----

export type AiEngine = "claude" | "perplexity" | "openai";

/** Questions buyers ask AI assistants about the site's services; checked regularly in each engine. */
export const aiQuestions = pgTable(
  "ai_questions",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    topic: text("topic"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ai_questions_site_question").on(t.siteId, t.question)],
);

/** One engine's answer to one question at one point in time. */
export const aiChecks = pgTable(
  "ai_checks",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => aiQuestions.id, { onDelete: "cascade" }),
    engine: text("engine").$type<AiEngine>().notNull(),
    mentioned: boolean("mentioned").notNull(), // business name or domain appears in the answer
    cited: boolean("cited").notNull(), // the site's domain is among the cited sources
    competitorsMentioned: jsonb("competitors_mentioned").$type<string[]>().notNull().default([]),
    citations: jsonb("citations").$type<string[]>().notNull().default([]),
    answerExcerpt: text("answer_excerpt"),
    error: text("error"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_checks_site_checked").on(t.siteId, t.checkedAt), index("ai_checks_question").on(t.questionId, t.engine)],
);

export type QuoteCheck = { id: string; label: string; passed: boolean; tip: string };

/** "How likely is AI to quote this?" scores for the site's own existing blog posts (fetched from the site). */
export const postScores = pgTable(
  "post_scores",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    score: integer("score").notNull(),
    checks: jsonb("checks").$type<QuoteCheck[]>().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("post_scores_site_url").on(t.siteId, t.url)],
);

// ---- Google Business Profile + social posts, reviews ----

export type PostChannel = "google" | "facebook" | "instagram" | "linkedin" | "x";
export const postStatusEnum = pgEnum("post_status", ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"]);
export type PostStatus = (typeof postStatusEnum.enumValues)[number];

/** Short posts for Google Business Profile and social channels. Google posts publish automatically. */
export const socialPosts = pgTable(
  "social_posts",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    articleId: text("article_id").references(() => articles.id, { onDelete: "set null" }),
    channel: text("channel").$type<PostChannel>().notNull(),
    text: text("text").notNull(),
    link: text("link"),
    imageUrl: text("image_url"),
    cta: text("cta"), // Google CTA: LEARN_MORE | CALL | BOOK | ORDER | SHOP | SIGN_UP
    status: postStatusEnum("status").notNull().default("DRAFT"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("social_posts_site_status").on(t.siteId, t.status)],
);

/** Google reviews synced from the Business Profile, with AI reply drafts. */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    externalName: text("external_name").notNull(), // accounts/{a}/locations/{l}/reviews/{r}
    reviewer: text("reviewer"),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    replyText: text("reply_text"), // the live reply on Google
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    draftReply: text("draft_reply"), // AI draft waiting for approval
    isTestimonial: boolean("is_testimonial").notNull().default(false), // shown in the website widget
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reviews_site_external").on(t.siteId, t.externalName)],
);

/** The business's own photos (work, team, products), used as featured images before stock photos. */
export const photos = pgTable(
  "photos",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    bytes: integer("bytes").notNull(),
    filename: text("filename"),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    usedCount: integer("used_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("photos_site").on(t.siteId)],
);

// ---- Results & Grow (phase B) ----

export type AuditSeverity = "critical" | "warning" | "notice";
export type AuditIssue = {
  id: string; // stable check id, e.g. "missing-meta-description"
  severity: AuditSeverity;
  title: string; // "7 pages have no meta description"
  why: string; // why it matters, in plain words
  fix: string; // how to fix it
  pages: string[]; // affected URLs (capped)
  count: number; // number of affected pages/items
};
export type AuditStats = {
  pagesChecked: number;
  avgResponseMs: number | null;
  https: boolean;
  sitemap: boolean;
  robots: boolean;
  mobileScore?: number | null; // PageSpeed Insights performance, 0-100
  lcpMs?: number | null;
  cls?: number | null;
  passed: string[]; // titles of checks that passed
};

/** Website health audits: score out of 100 and the problems found. */
export const siteAudits = pgTable(
  "site_audits",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    status: jobStatusEnum("status").notNull().default("QUEUED"),
    score: integer("score"),
    issues: jsonb("issues").$type<AuditIssue[]>().notNull().default([]),
    stats: jsonb("stats").$type<AuditStats | null>(),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("site_audits_site").on(t.siteId, t.createdAt)],
);

/** Daily Google Maps / Business Profile performance (Business Profile Performance API). */
export const gbpDailyMetrics = pgTable(
  "gbp_daily_metrics",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    searchViews: integer("search_views").notNull().default(0), // profile shown on Google Search
    mapsViews: integer("maps_views").notNull().default(0), // profile shown on Google Maps
    calls: integer("calls").notNull().default(0),
    directions: integer("directions").notNull().default(0),
    websiteClicks: integer("website_clicks").notNull().default(0),
    messages: integer("messages").notNull().default(0),
  },
  (t) => [uniqueIndex("gbp_daily_site_date").on(t.siteId, t.date)],
);

export type GridPoint = { lat: number; lng: number; rank: number | null; top: string[] };

/** Geo-grid scans: where the business ranks in the Google Maps results across its area. */
export const geoGridScans = pgTable(
  "geo_grid_scans",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLng: doublePrecision("center_lng").notNull(),
    radiusKm: doublePrecision("radius_km").notNull(),
    size: integer("size").notNull(), // grid is size x size
    points: jsonb("points").$type<GridPoint[]>().notNull().default([]),
    avgRank: doublePrecision("avg_rank"), // average over points where found (not found counts as 21)
    top3Share: doublePrecision("top3_share"), // share of points where the business is in the top 3
    status: jobStatusEnum("status").notNull().default("QUEUED"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("geo_grid_site").on(t.siteId, t.createdAt)],
);

export type InsightKind = "plan" | "report" | "conversations" | "directories" | "events" | "maps-keywords" | "profile";

/** AI-made Grow outputs (30-day plan, growth report, conversations, directories, upcoming events). Latest per kind wins. */
export const siteInsights = pgTable(
  "site_insights",
  {
    id: id(),
    siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InsightKind>().notNull(),
    status: jobStatusEnum("status").notNull().default("QUEUED"),
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("site_insights_site_kind").on(t.siteId, t.kind, t.createdAt)],
);

// ---- Relations (for db.query.* with `with`) ----

export const usersRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
export const workspacesRelations = relations(workspaces, ({ many }) => ({ memberships: many(memberships), sites: many(sites) }));
export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [memberships.workspaceId], references: [workspaces.id] }),
}));
export const sitesRelations = relations(sites, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [sites.workspaceId], references: [workspaces.id] }),
  pages: many(sitePages),
  services: many(services),
  competitors: many(competitors),
  areas: many(serviceAreas),
  keywords: many(keywords),
  articles: many(articles),
  integrations: many(integrations),
  aiQuestions: many(aiQuestions),
}));
export const aiQuestionsRelations = relations(aiQuestions, ({ one, many }) => ({
  site: one(sites, { fields: [aiQuestions.siteId], references: [sites.id] }),
  checks: many(aiChecks),
}));
export const aiChecksRelations = relations(aiChecks, ({ one }) => ({
  question: one(aiQuestions, { fields: [aiChecks.questionId], references: [aiQuestions.id] }),
}));
export const sitePagesRelations = relations(sitePages, ({ one }) => ({ site: one(sites, { fields: [sitePages.siteId], references: [sites.id] }) }));
export const servicesRelations = relations(services, ({ one }) => ({ site: one(sites, { fields: [services.siteId], references: [sites.id] }) }));
export const competitorsRelations = relations(competitors, ({ one }) => ({ site: one(sites, { fields: [competitors.siteId], references: [sites.id] }) }));
export const serviceAreasRelations = relations(serviceAreas, ({ one }) => ({ site: one(sites, { fields: [serviceAreas.siteId], references: [sites.id] }) }));
export const keywordsRelations = relations(keywords, ({ one, many }) => ({
  site: one(sites, { fields: [keywords.siteId], references: [sites.id] }),
  articles: many(articles),
}));
export const articlesRelations = relations(articles, ({ one }) => ({
  site: one(sites, { fields: [articles.siteId], references: [sites.id] }),
  keyword: one(keywords, { fields: [articles.keywordId], references: [keywords.id] }),
}));
export const integrationsRelations = relations(integrations, ({ one }) => ({ site: one(sites, { fields: [integrations.siteId], references: [sites.id] }) }));

export type Site = typeof sites.$inferSelect;
export type SiteAudit = typeof siteAudits.$inferSelect;
export type GeoGridScan = typeof geoGridScans.$inferSelect;
export type SiteInsight = typeof siteInsights.$inferSelect;
export type SocialPost = typeof socialPosts.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ServiceArea = typeof serviceAreas.$inferSelect;
export type SitePage = typeof sitePages.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;

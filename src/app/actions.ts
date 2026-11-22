"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createSession, destroySession, hashPassword, requireSite, requireUser, verifyPassword } from "@/lib/auth";
import { enqueue } from "@/lib/queue";
import { normalizeDomain } from "@/lib/crawl";
import { encryptJson } from "@/lib/crypto";
import { scoreArticle } from "@/lib/seo/score";
import { testWordPress } from "@/lib/publish/wordpress";
import { listBlogs } from "@/lib/publish/shopify";
import type { IntegrationType, OnboardingStep } from "@/lib/schema";

const { users, workspaces, memberships, sites, services, competitors, serviceAreas, articles, keywords, integrations } = schema;

export type FormState = { error?: string; ok?: string } | undefined;

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505";

// ---------- Auth ----------

const credentials = z.object({
  email: z.string().email("Enter a valid email").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials
    .extend({ name: z.string().min(1, "Enter your name"), company: z.string().min(1, "Enter a company or agency name") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, name, company } = parsed.data;
  if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
    return { error: "An account with this email already exists." };
  }
  const passwordHash = await hashPassword(password);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, name, passwordHash }).returning({ id: users.id });
    const [ws] = await tx.insert(workspaces).values({ name: company }).returning({ id: workspaces.id });
    await tx.insert(memberships).values({ userId: user.id, workspaceId: ws.id, role: "OWNER" });
    return user.id;
  });
  await createSession(userId);
  redirect("/sites");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Wrong email or password." };
  }
  await createSession(user.id);
  redirect("/sites");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ---------- Sites & onboarding ----------

export async function addSite(_: FormState, form: FormData): Promise<FormState> {
  const { workspace } = await requireUser();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  const phone = String(form.get("phone") ?? "").trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: "Enter a website like yourbusiness.com" };
  if (!/^\+\d[\d\s-]{6,}$/.test(phone)) return { error: "Add a phone number with the country code, like +91 98765 43210." };
  let siteId: string;
  try {
    const [site] = await db
      .insert(sites)
      .values({ workspaceId: workspace.id, domain, phone, onboardingStep: "SERVICES", scanStatus: "QUEUED" })
      .returning({ id: sites.id });
    siteId = site.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "This website is already in your workspace." };
    throw e;
  }
  try {
    await enqueue("scan-site", { siteId });
  } catch (e) {
    console.error("Could not queue the site scan:", e);
    await db.delete(sites).where(eq(sites.id, siteId));
    return { error: "The background queue isn't reachable. Check REDIS_URL in .env (it should start with redis:// or rediss://) and that `npm run worker` is running." };
  }
  redirect(`/sites/${siteId}/onboarding`);
}

export async function rescanSite(siteId: string) {
  await requireSite(siteId);
  await db.update(sites).set({ scanStatus: "QUEUED", scanError: null }).where(eq(sites.id, siteId));
  await enqueue("scan-site", { siteId });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function setStep(siteId: string, step: Exclude<OnboardingStep, "WEBSITE" | "DONE">) {
  await requireSite(siteId);
  await db.update(sites).set({ onboardingStep: step }).where(eq(sites.id, siteId));
  revalidatePath(`/sites/${siteId}/onboarding`);
}

export async function toggleService(siteId: string, serviceId: string) {
  await requireSite(siteId);
  const s = await db.query.services.findFirst({ where: and(eq(services.id, serviceId), eq(services.siteId, siteId)) });
  if (s) await db.update(services).set({ selected: !s.selected }).where(eq(services.id, s.id));
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function addService(siteId: string, form: FormData) {
  await requireSite(siteId);
  const name = String(form.get("name") ?? "").trim();
  if (name) await db.insert(services).values({ siteId, name });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function addCompetitor(siteId: string, form: FormData) {
  await requireSite(siteId);
  const name = String(form.get("name") ?? "").trim();
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (name && domain) await db.insert(competitors).values({ siteId, name, domain });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function removeCompetitor(siteId: string, id: string) {
  await requireSite(siteId);
  await db.delete(competitors).where(and(eq(competitors.id, id), eq(competitors.siteId, siteId)));
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function saveContact(siteId: string, form: FormData) {
  const { site } = await requireSite(siteId);
  const get = (k: string) => String(form.get(k) ?? "").trim() || null;
  await db
    .update(sites)
    .set({
      businessName: get("businessName"),
      country: get("country"),
      state: get("state"),
      city: get("city"),
      streetAddress: get("streetAddress"),
      phone: get("phone"),
      ...(site.onboardingStep === "CONTACT" ? { onboardingStep: "AREAS" as const } : {}),
    })
    .where(eq(sites.id, siteId));
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function addArea(siteId: string, form: FormData) {
  await requireSite(siteId);
  const name = String(form.get("name") ?? "").trim();
  if (name) await db.insert(serviceAreas).values({ siteId, name });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function removeArea(siteId: string, id: string) {
  await requireSite(siteId);
  await db.delete(serviceAreas).where(and(eq(serviceAreas.id, id), eq(serviceAreas.siteId, siteId)));
  revalidatePath(`/sites/${siteId}`, "layout");
}

/** Final onboarding step: builds the keyword plan and starts writing the first articles. */
export async function finishOnboarding(siteId: string) {
  await requireSite(siteId);
  await db.update(sites).set({ onboardingStep: "FIRST_CONTENT" }).where(eq(sites.id, siteId));
  await enqueue("plan-keywords", { siteId });
  redirect(`/sites/${siteId}/onboarding`);
}

export async function completeOnboarding(siteId: string) {
  await requireSite(siteId);
  await db.update(sites).set({ onboardingStep: "DONE" }).where(eq(sites.id, siteId));
  redirect(`/sites/${siteId}`);
}

export async function planMore(siteId: string) {
  await requireSite(siteId);
  await enqueue("plan-keywords", { siteId });
  revalidatePath(`/sites/${siteId}/content`);
}

export async function saveSettings(siteId: string, form: FormData) {
  await requireSite(siteId);
  const n = Math.min(60, Math.max(1, Number(form.get("articlesPerMonth") ?? 8) || 8));
  await db
    .update(sites)
    .set({
      articlesPerMonth: n,
      language: String(form.get("language") ?? "en").trim() || "en",
    })
    .where(eq(sites.id, siteId));
  revalidatePath(`/sites/${siteId}`, "layout");
}

// ---------- Articles ----------

async function requireArticle(siteId: string, articleId: string) {
  const { site } = await requireSite(siteId);
  const article = await db.query.articles.findFirst({
    where: and(eq(articles.id, articleId), eq(articles.siteId, siteId)),
    with: { keyword: true },
  });
  if (!article) redirect(`/sites/${siteId}/content`);
  return { site, article };
}

export async function saveArticle(siteId: string, articleId: string, _: FormState, form: FormData): Promise<FormState> {
  const { site, article } = await requireArticle(siteId, articleId);
  const title = String(form.get("title") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const metaTitle = String(form.get("metaTitle") ?? "").trim();
  const metaDescription = String(form.get("metaDescription") ?? "").trim();
  const contentMd = String(form.get("contentMd") ?? "");
  const heroRaw = String(form.get("heroImageUrl") ?? "").trim();
  if (!title) return { error: "Title is required." };
  if (heroRaw && !/^https:\/\/\S+$/.test(heroRaw)) return { error: "Hero image must be an https:// link." };
  const { score, checks } = scoreArticle({
    keyword: article.keyword?.phrase ?? null, title, metaTitle, metaDescription, slug, contentMd, siteDomain: site.domain,
  });
  await db
    .update(articles)
    .set({ title, slug, metaTitle, metaDescription, contentMd, heroImageUrl: heroRaw || null, seoScore: score, seoChecks: checks })
    .where(eq(articles.id, articleId));
  revalidatePath(`/sites/${siteId}/content/${articleId}`);
  return { ok: "Saved" };
}

export async function approveArticle(siteId: string, articleId: string, form: FormData) {
  const { article } = await requireArticle(siteId, articleId);
  if (!article.contentMd) return;
  const when = String(form.get("when") ?? "now");
  const date = String(form.get("scheduledAt") ?? "");
  if (when === "schedule" && date) {
    await db.update(articles).set({ status: "SCHEDULED", scheduledAt: new Date(date) }).where(eq(articles.id, articleId));
  } else if (when === "draft") {
    await db.update(articles).set({ status: "PUBLISHING" }).where(eq(articles.id, articleId));
    await enqueue("publish-article", { articleId, draft: true });
  } else {
    await db.update(articles).set({ status: "PUBLISHING", scheduledAt: new Date() }).where(eq(articles.id, articleId));
    await enqueue("publish-article", { articleId });
  }
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function unscheduleArticle(siteId: string, articleId: string) {
  await requireArticle(siteId, articleId);
  await db.update(articles).set({ status: "REVIEW", scheduledAt: null }).where(eq(articles.id, articleId));
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function regenerateArticle(siteId: string, articleId: string) {
  await requireArticle(siteId, articleId);
  await db.update(articles).set({ status: "IDEA", error: null }).where(eq(articles.id, articleId));
  await enqueue("write-article", { articleId });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function deleteArticle(siteId: string, articleId: string) {
  const { article } = await requireArticle(siteId, articleId);
  await db.delete(articles).where(eq(articles.id, articleId));
  if (article.keywordId) await db.update(keywords).set({ status: "REJECTED" }).where(eq(keywords.id, article.keywordId));
  redirect(`/sites/${siteId}/content`);
}

export async function writeFromKeyword(siteId: string, keywordId: string) {
  await requireSite(siteId);
  const k = await db.query.keywords.findFirst({ where: and(eq(keywords.id, keywordId), eq(keywords.siteId, siteId)) });
  if (!k) return;
  const [article] = await db
    .insert(articles)
    .values({ siteId, keywordId: k.id, title: k.phrase, status: "IDEA", plannedFor: new Date() })
    .returning({ id: articles.id });
  await db.update(keywords).set({ status: "PLANNED" }).where(eq(keywords.id, k.id));
  await enqueue("write-article", { articleId: article.id });
  revalidatePath(`/sites/${siteId}`, "layout");
}

export async function rejectKeyword(siteId: string, keywordId: string) {
  await requireSite(siteId);
  await db.update(keywords).set({ status: "REJECTED" }).where(and(eq(keywords.id, keywordId), eq(keywords.siteId, siteId)));
  revalidatePath(`/sites/${siteId}/keywords`);
}

// ---------- Integrations ----------

async function upsertIntegration(siteId: string, type: IntegrationType, secret: unknown, config: Record<string, string>) {
  const enc = encryptJson(secret);
  await db
    .insert(integrations)
    .values({ siteId, type, secret: enc, config })
    .onConflictDoUpdate({ target: [integrations.siteId, integrations.type], set: { secret: enc, config } });
}

export async function connectWordPress(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireSite(siteId);
  const secret = {
    siteUrl: String(form.get("siteUrl") ?? "").trim().replace(/\/$/, ""),
    username: String(form.get("username") ?? "").trim(),
    appPassword: String(form.get("appPassword") ?? "").trim(),
  };
  if (!/^https?:\/\//.test(secret.siteUrl) || !secret.username || !secret.appPassword) {
    return { error: "Fill in the site URL (with https://), username and application password." };
  }
  try {
    const name = await testWordPress(secret);
    await upsertIntegration(siteId, "WORDPRESS", secret, { siteUrl: secret.siteUrl, user: name });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not connect." };
  }
  revalidatePath(`/sites/${siteId}/integrations`);
  return { ok: "WordPress connected" };
}

export async function connectShopify(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireSite(siteId);
  const secret = {
    shopDomain: String(form.get("shopDomain") ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
    accessToken: String(form.get("accessToken") ?? "").trim(),
  };
  if (!/\.myshopify\.com$/.test(secret.shopDomain) || !secret.accessToken) {
    return { error: "Use the store's .myshopify.com domain and an Admin API access token." };
  }
  try {
    const blogs = await listBlogs(secret);
    if (blogs.length === 0) return { error: "This store has no blog yet. Create one under Online Store → Blog posts." };
    await upsertIntegration(siteId, "SHOPIFY", { ...secret, blogId: String(blogs[0].id) }, { shopDomain: secret.shopDomain, blog: blogs[0].title });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not connect." };
  }
  revalidatePath(`/sites/${siteId}/integrations`);
  return { ok: "Shopify connected" };
}

export async function disconnect(siteId: string, type: IntegrationType) {
  await requireSite(siteId);
  await db.delete(integrations).where(and(eq(integrations.siteId, siteId), eq(integrations.type, type)));
  revalidatePath(`/sites/${siteId}/integrations`);
}

export async function syncGscNow(siteId: string) {
  await requireSite(siteId);
  await enqueue("sync-gsc", { siteId });
  revalidatePath(`/sites/${siteId}`);
}

// ---------- Business Blueprint ----------

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

/** Saves whichever Blueprint fields are present in the form (each tab posts its own subset). */
export async function saveBlueprint(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { site } = await requireSite(siteId);
  const bp = { ...site.blueprint };
  const has = (k: string) => form.has(k);
  if (has("idealCustomer")) bp.idealCustomer = String(form.get("idealCustomer")).trim();
  if (has("differentiators")) bp.differentiators = lines(form.get("differentiators")).slice(0, 30);
  if (has("facts")) bp.facts = lines(form.get("facts")).slice(0, 50);
  if (has("targetSearches")) bp.targetSearches = [...new Set(lines(form.get("targetSearches")).map((l) => l.toLowerCase()))].slice(0, 60);
  if (has("likedArticles")) {
    bp.likedArticles = lines(form.get("likedArticles")).filter((u) => /^https?:\/\//.test(u)).slice(0, 5);
  }
  if (has("authorName")) {
    const name = String(form.get("authorName")).trim();
    bp.author = name
      ? {
          name,
          jobTitle: String(form.get("authorJobTitle") ?? "").trim(),
          bio: String(form.get("authorBio") ?? "").trim(),
          expertise: lines(form.get("authorExpertise")).slice(0, 10),
          aboutUrl: String(form.get("authorAboutUrl") ?? "").trim(),
          linkedin: String(form.get("authorLinkedin") ?? "").trim(),
        }
      : null;
  }
  const tone = has("toneOfVoice") ? String(form.get("toneOfVoice")).trim() || null : site.toneOfVoice;
  await db.update(sites).set({ blueprint: bp, toneOfVoice: tone }).where(eq(sites.id, siteId));
  revalidatePath(`/sites/${siteId}`, "layout");
  return { ok: "Saved" };
}

// ---------- Custom site (Content API + webhook) ----------

export type CustomState = { error?: string; ok?: string; apiKey?: string; webhookSecret?: string } | undefined;

/**
 * Creates or updates the custom-site connection. A new API key (and webhook secret) is generated on
 * first connect or when "regenerate" is ticked; they're returned once and only their hash is stored.
 */
export async function saveCustomSite(siteId: string, _: CustomState, form: FormData): Promise<CustomState> {
  const { site } = await requireSite(siteId);
  const urlPattern = String(form.get("urlPattern") ?? "").trim();
  const webhookUrl = String(form.get("webhookUrl") ?? "").trim();
  const regenerate = form.get("regenerate") === "on";
  if (!/^https?:\/\/\S+\{slug\}/.test(urlPattern)) {
    return { error: "Article URL pattern must start with https:// and contain {slug}, e.g. https://example.com/blog/{slug}" };
  }
  if (webhookUrl && !/^https?:\/\/\S+$/.test(webhookUrl)) return { error: "Webhook URL must start with https://" };

  const { newApiKey, newWebhookSecret, sha256 } = await import("@/lib/publish/custom");
  const existing = await db.query.integrations.findFirst({
    where: and(eq(integrations.siteId, site.id), eq(integrations.type, "CUSTOM")),
  });
  let apiKey: string | undefined;
  let webhookSecret: string | undefined;
  let config = existing?.config as { apiKeyHash: string; apiKeyPrefix: string } | undefined;
  let secret = existing?.secret;
  if (!existing || regenerate) {
    apiKey = newApiKey();
    webhookSecret = newWebhookSecret();
    config = { apiKeyHash: sha256(apiKey), apiKeyPrefix: apiKey.slice(0, 10) };
    secret = encryptJson({ webhookSecret });
  }
  const fullConfig = { ...config!, urlPattern, webhookUrl };
  await db
    .insert(integrations)
    .values({ siteId, type: "CUSTOM", secret: secret!, config: fullConfig })
    .onConflictDoUpdate({ target: [integrations.siteId, integrations.type], set: { secret: secret!, config: fullConfig } });
  revalidatePath(`/sites/${siteId}/integrations`);
  return { ok: apiKey ? "Connected. Copy the keys below now: they won't be shown again." : "Saved", apiKey, webhookSecret };
}

// ---------- Grow: AI visibility ----------

export async function findAiQuestions(siteId: string) {
  await requireSite(siteId);
  await db.update(sites).set({ aiStatus: "QUEUED" }).where(eq(sites.id, siteId));
  await enqueue("find-questions", { siteId });
  revalidatePath(`/sites/${siteId}/grow`);
}

export async function runAiCheck(siteId: string) {
  await requireSite(siteId);
  await db.update(sites).set({ aiStatus: "QUEUED" }).where(eq(sites.id, siteId));
  await enqueue("check-visibility", { siteId });
  revalidatePath(`/sites/${siteId}/grow`);
}

export async function addAiQuestion(siteId: string, form: FormData) {
  await requireSite(siteId);
  const question = String(form.get("question") ?? "").trim();
  if (question.length > 8) {
    await db.insert(schema.aiQuestions).values({ siteId, question, topic: "Added by you" }).onConflictDoNothing();
  }
  revalidatePath(`/sites/${siteId}/grow`);
}

export async function hideAiQuestion(siteId: string, questionId: string) {
  await requireSite(siteId);
  await db
    .update(schema.aiQuestions)
    .set({ hidden: true })
    .where(and(eq(schema.aiQuestions.id, questionId), eq(schema.aiQuestions.siteId, siteId)));
  revalidatePath(`/sites/${siteId}/grow`);
}

/** Quick win: plan and write an article that answers a question AI currently answers without you. */
export async function writeForQuestion(siteId: string, questionId: string) {
  await requireSite(siteId);
  const q = await db.query.aiQuestions.findFirst({
    where: and(eq(schema.aiQuestions.id, questionId), eq(schema.aiQuestions.siteId, siteId)),
  });
  if (!q) return;
  const phrase = q.question.toLowerCase().replace(/[?!.]+$/, "").trim();
  const [kw] = await db
    .insert(keywords)
    .values({ siteId, phrase, intent: "commercial", cluster: q.topic, status: "PLANNED" })
    .onConflictDoUpdate({ target: [keywords.siteId, keywords.phrase], set: { status: "PLANNED" } })
    .returning({ id: keywords.id });
  const [article] = await db
    .insert(articles)
    .values({ siteId, keywordId: kw.id, title: q.question, status: "IDEA", plannedFor: new Date() })
    .returning({ id: articles.id });
  await enqueue("write-article", { articleId: article.id });
  redirect(`/sites/${siteId}/content/${article.id}`);
}

export async function scoreSitePosts(siteId: string) {
  await requireSite(siteId);
  await enqueue("score-posts", { siteId });
  revalidatePath(`/sites/${siteId}/grow`);
}

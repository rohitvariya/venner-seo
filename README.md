# Venner SEO

AI SEO platform for local businesses and agencies. Add a website and it:

1. **Scans the site** and pulls out the business profile, services, location and service pages, and pre-fills the **Business Blueprint** (ideal customer, proof points, facts, target searches) (Claude).
2. **Finds local competitors** from Google results (DataForSEO, optional).
3. **Builds a keyword plan** grouped by service, with search volume and competition (Claude + DataForSEO).
4. **Fills a content calendar** (default 8 articles/month) and **writes each article** (2,500–3,500 words) from a brief: "At a glance" summary, comparison table, step-by-step list, checklist, FAQs and key takeaways. Each article uses the Blueprint's real proof points, links to service pages and to the site's own published articles (topic clusters), and ends with a call to action using real contact details.
5. **Fact-checks every draft** against the Blueprint and flags invented numbers or claims. **Scores every article** with a 15-point on-page SEO checklist, and shows a Google preview, search details and a status pipeline.
6. Lets you **edit, approve, schedule and publish** to **WordPress** or **Shopify**. Posts include an author byline and bio box, plus BlogPosting and FAQPage schema.
7. **Tracks results** from **Google Search Console**: clicks, impressions, average position and top searches.

8. **Grow / AI visibility:** finds the questions buyers ask AI assistants about the services, asks them in Claude (live web search) and optionally Perplexity and ChatGPT, and shows how often the business is mentioned or cited, which competitors AI recommends instead, and **quick wins** (questions where AI names competitors but not you) with one-click "Write an article for this". Re-checked weekly.
9. **Articles to improve:** a 0–10 "how likely AI is to quote this" score for every article and for the website's existing blog posts (structured data, FAQ, sources, clear opening, freshness), with what to fix.

10. **Posts:** writes 2 weeks of Google Business Profile updates and Facebook / Instagram / LinkedIn / X posts from published articles and services. Google posts publish automatically on schedule (with a Learn more / Call button); other channels are copy-and-post for now. Every newly published article gets a Google post drafted automatically.
11. **Reviews:** syncs Google reviews every ~6 hours, drafts a reply for each in the brand's voice (apologetic and offline-oriented for 1–3 stars), and posts it in one click. Optional auto-reply for 4–5 star reviews.

12. **Website health:** checks up to 40 pages each week (HTTPS, sitemap, robots.txt, broken pages and links, titles, meta descriptions, headings, thin content, alt text, canonical, noindex, mobile viewport, mixed content, schema, social tags, mobile PageSpeed) and gives a score out of 100 with plain-language "why it matters / how to fix" for each problem.
13. **Google Maps:** profile views, calls, direction requests and website clicks per day, the searches that showed the profile, and a **geo-grid** (3×3 to 7×7 points around the business) showing where it ranks in Google Maps for any search, on a map, re-checked weekly (DataForSEO).
14. **Google profile:** profile strength checklist (description, categories, hours, photos, reviews, reply rate, weekly posts, phone matching the website), the review link to share, and an AI-written description you can update on Google in one click.
15. **Testimonials:** pick your best Google reviews and show them on your website with one embed code.
16. **Grow extras:** a 30-day action plan (tick tasks off), content ideas from Search Console, Maps searches, AI questions and keyword research, online conversations worth joining with a suggested reply, directories to list on (checks where you're already listed), upcoming holidays/events with one-click Google post drafts, and a monthly growth report.

Nothing is published without approval. One login can manage many client websites (workspaces).

## Stack

- **Next.js 15** (App Router, server actions) + Tailwind CSS 4
- **PostgreSQL** with **Drizzle ORM** (migrations in `drizzle/`)
- **BullMQ + Redis** background worker (`src/worker`) for scanning, writing, publishing and syncing
- **Claude API** (`@anthropic-ai/sdk`) for analysis, briefs and writing
- **DataForSEO** (optional) for keyword volumes and competitor discovery
- **Google Search Console API** (OAuth)

```
src/
  app/                      pages + server actions (actions.ts)
    sites/[siteId]/onboarding   6-step setup wizard
    sites/[siteId]/(app)/       dashboard: overview, content, keywords, integrations, settings
    api/integrations/gsc/       Google OAuth start + callback
  lib/
    schema.ts               database schema
    jobs.ts                 background job logic (scan, plan, write, publish, GSC sync, tick)
    seo/                    profile extraction, keywords, brief + article writer, SEO score
    publish/                WordPress, Shopify, HTML + FAQ schema
    crawl.ts  ai.ts  dataforseo.ts  gsc.ts  auth.ts  crypto.ts  queue.ts
  worker/index.ts           BullMQ worker entry
```

## Run locally

```bash
docker compose up -d                # Postgres + Redis
cp .env.example .env                # then fill in the values (see below)
npm install
npm run db:migrate                  # create tables
npm run dev                         # web app on http://localhost:3000
npm run worker                      # in a second terminal: background jobs
```

Open http://localhost:3000/signup and create your account.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis for the job queue |
| `APP_URL` | yes | Public URL, e.g. `https://seo.vennerinfotech.com` (used for Google OAuth redirect) |
| `SESSION_SECRET` | yes | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | yes | `openssl rand -hex 32`. Encrypts WordPress/Shopify/Google credentials. **Never change it after go-live** or saved connections stop working. |
| `ANTHROPIC_API_KEY` | yes | From console.anthropic.com |
| `ANTHROPIC_MODEL` | no | Default `claude-sonnet-5-5` |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | recommended | Without them keywords have no volume and competitors aren't auto-found |
| `PERPLEXITY_API_KEY` / `OPENAI_API_KEY` | optional | Adds Perplexity and ChatGPT to the AI visibility checks (Claude is always checked) |
| `UNSPLASH_ACCESS_KEY` | optional | Free key from unsplash.com/developers. Auto-picks a featured image per article (photographer credited in the caption) |
| `PAGESPEED_API_KEY` | optional | Google PageSpeed Insights key for the mobile speed check. Works without one at low volume |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for GSC | Google Cloud → APIs & Services → enable *Google Search Console API* → OAuth client (Web). Redirect URI: `${APP_URL}/api/integrations/gsc/callback` |

## Connecting a client site

- **WordPress:** in wp-admin go to Users → Profile → *Application Passwords*, create one, and paste it with the username and site URL on the Integrations page. Posts get a matching category (falling back to "Blog"), tags, a featured image, and Rank Math SEO title/description/focus keyword. Articles can be sent as drafts first.
- **Shopify:** in Shopify admin go to Settings → Apps → *Develop apps*. Create an app with the `read_content` and `write_content` Admin API scopes, install it, and paste the Admin API access token plus the `.myshopify.com` domain.
- **Custom-built site (Next.js, Laravel, anything):** on the Integrations page enter the article URL pattern (e.g. `https://example.com/blog/{slug}`) and, optionally, a webhook URL, then copy the Content API key and webhook secret (shown once). The site reads published articles from `GET /api/public/v1/articles` and `GET /api/public/v1/articles/{slug}` with `Authorization: Bearer vsk_…`. The webhook gets a signed `article.published` / `article.draft` POST (`X-Venner-Signature: t=…,v1=HMAC-SHA256("t.body")`); reply with `{"url": "…"}` to set the live URL. Ready-to-paste Next.js and Laravel code is on the Integrations page.
- **Google Business Profile:** (1) in Google Cloud enable *My Business Account Management API*, *My Business Business Information API*, *Google My Business API* and *Business Profile Performance API* (for Maps insights); (2) request API access for the project at https://developers.google.com/my-business/content/prereqs (Google approves within a few days; until then calls fail with a clear message); (3) add `${APP_URL}/api/integrations/gbp/callback` as an authorised redirect URI on the same OAuth client used for Search Console; (4) click *Connect with Google* on the Integrations page and sign in with the account that manages the listing.
- **Search Console:** click *Connect with Google* and sign in with an account that has access to the site's property.

## Deploying

Any Node 20+ host works: a VPS with PM2, Railway, Render, or Docker.

```bash
npm ci && npm run db:migrate && npm run build
npm start          # web
npm run worker     # worker (must run as a separate, always-on process)
```

The worker also runs a 5-minute "tick" that publishes scheduled posts and refreshes Search Console data once a day.

## Cost per article (rough)

One article is one brief call plus one writing call, about 15–20k tokens in total. With Claude Sonnet that's typically a few US cents per article. DataForSEO keyword volume costs about $0.05 per 1,000 keywords.

## Roadmap (not built yet)

- Automatic posting to Facebook / Instagram / LinkedIn (needs Meta and LinkedIn app review); carousels
- AI hero images for articles
- Ask AI chat, Stripe billing and plans (phase C)
- Webflow / Wix / Framer publishing (custom sites are supported via the Content API + webhook)
- Team invites, white-label for agencies

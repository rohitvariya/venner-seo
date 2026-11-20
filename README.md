# Venner SEO

AI SEO platform for local businesses and agencies. Add a website and it:

1. **Scans the site** and pulls out the business profile, services, location and service pages (Claude).
2. **Finds local competitors** from Google results (DataForSEO, optional).
3. **Builds a keyword plan** grouped by service, with search volume and competition (Claude + DataForSEO).
4. **Fills a content calendar** (default 8 articles/month) and **writes each article** from a brief: grounded in the business's real services, internal links to its own pages, FAQs, and a call to action with real contact details.
5. **Scores every article** with a 12-point on-page SEO checklist.
6. Lets you **edit, approve, schedule and publish** to **WordPress** or **Shopify**. Posts include FAQPage schema.
7. **Tracks results** from **Google Search Console**: clicks, impressions, average position and top searches.

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for GSC | Google Cloud → APIs & Services → enable *Google Search Console API* → OAuth client (Web). Redirect URI: `${APP_URL}/api/integrations/gsc/callback` |

## Connecting a client site

- **WordPress:** in wp-admin go to Users → Profile → *Application Passwords*, create one, and paste it with the username and site URL on the Integrations page.
- **Shopify:** in Shopify admin go to Settings → Apps → *Develop apps*. Create an app with the `read_content` and `write_content` Admin API scopes, install it, and paste the Admin API access token plus the `.myshopify.com` domain.
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

- Google Business Profile posts and review replies
- Social posts (Instagram, Facebook, LinkedIn, X) and carousels
- AI visibility tracking (brand mentions in ChatGPT, Gemini, Perplexity)
- AI hero images for articles
- Webflow / Wix / Framer publishing
- Stripe billing and plans, team invites, white-label for agencies

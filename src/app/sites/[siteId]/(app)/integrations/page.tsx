import { requireSitePageForAgency } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chooseGbpLocation, disconnect, syncGscNow } from "@/app/actions";
import { CustomSiteForm, ShopifyForm, WordPressForm } from "@/components/integration-forms";
import { CustomSiteDocs } from "@/components/custom-site-docs";
import { SubmitButton } from "@/components/ui";

export default async function IntegrationsPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ gsc?: string; gbp?: string }>;
}) {
  const { siteId } = await params;
  const { gsc: gscResult, gbp: gbpResult } = await searchParams;
  const { site } = await requireSitePageForAgency(siteId);
  const integrations = await db.query.integrations.findMany({ where: eq(schema.integrations.siteId, siteId) });
  const get = (t: string) => integrations.find((i) => i.type === t);
  const wp = get("WORDPRESS");
  const shop = get("SHOPIFY");
  const gsc = get("GSC");
  const custom = get("CUSTOM");
  const gbp = get("GBP");
  const gbpChoices = gbp?.config?.choices ? (JSON.parse(gbp.config.choices) as { title: string; address: string }[]) : [];
  const apiBase = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/public/v1`;
  const cfg = (i: typeof wp) => i?.config ?? {};
  const gscReady = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Google Search Console</h2>
            <p className="text-sm text-slate-500">Clicks, impressions, rankings and top searches.</p>
          </div>
          {gsc && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Connected</span>}
        </div>
        {gscResult === "no-property" && (
          <p className="text-sm text-red-600">That Google account has no Search Console property for {site.domain}. Add and verify the site in Search Console, then try again.</p>
        )}
        {gscResult === "error" && <p className="text-sm text-red-600">Google sign-in failed. Please try again.</p>}
        {gsc ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">Property: {cfg(gsc).property}</span>
            <form action={syncGscNow.bind(null, siteId)}><SubmitButton className="btn-secondary" pending="Queued">Sync now</SubmitButton></form>
            <form action={disconnect.bind(null, siteId, "GSC")}><button className="btn-danger">Disconnect</button></form>
          </div>
        ) : gscReady ? (
          <a href={`/api/integrations/gsc/start?siteId=${siteId}`} className="btn-primary">Connect with Google</a>
        ) : (
          <p className="text-sm text-amber-700">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable this.</p>
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Google Business Profile</h2>
            <p className="text-sm text-slate-500">Publish Google posts automatically and reply to reviews.</p>
          </div>
          {gbp?.config?.location && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Connected</span>}
        </div>
        {gbpResult === "no-location" && <p className="text-sm text-red-600">That Google account doesn&apos;t manage any Business Profile. Sign in with the account that owns the listing.</p>}
        {gbpResult === "no-api" && (
          <p className="text-sm text-red-600">
            Google hasn&apos;t enabled the Business Profile APIs for this app yet. Request access for your Google Cloud project (see README), then try again.
          </p>
        )}
        {gbpResult === "error" && <p className="text-sm text-red-600">Google sign-in failed. Please try again.</p>}
        {gbp?.config?.location ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{gbp.config.title}{gbp.config.address ? ` · ${gbp.config.address}` : ""}</span>
            <form action={disconnect.bind(null, siteId, "GBP")}><button className="btn-danger">Disconnect</button></form>
          </div>
        ) : gbpChoices.length > 0 ? (
          <form action={chooseGbpLocation.bind(null, siteId)} className="flex items-center gap-2">
            <select name="index" className="input">
              {gbpChoices.map((c, i) => <option key={i} value={i}>{c.title}{c.address ? ` · ${c.address}` : ""}</option>)}
            </select>
            <button className="btn-primary whitespace-nowrap">Use this listing</button>
          </form>
        ) : gscReady ? (
          <a href={`/api/integrations/gbp/start?siteId=${siteId}`} className="btn-primary">Connect with Google</a>
        ) : (
          <p className="text-sm text-amber-700">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable this.</p>
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">WordPress</h2>
            <p className="text-sm text-slate-500">Publish approved articles as blog posts.</p>
          </div>
          {wp && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Connected</span>}
        </div>
        {wp ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{cfg(wp).siteUrl} as {cfg(wp).user}</span>
            <form action={disconnect.bind(null, siteId, "WORDPRESS")}><button className="btn-danger">Disconnect</button></form>
          </div>
        ) : (
          <WordPressForm siteId={siteId} defaultUrl={`https://${site.domain}`} />
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Shopify</h2>
            <p className="text-sm text-slate-500">Publish approved articles to the store&apos;s blog.</p>
          </div>
          {shop && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Connected</span>}
        </div>
        {shop ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{cfg(shop).shopDomain} · blog “{cfg(shop).blog}”</span>
            <form action={disconnect.bind(null, siteId, "SHOPIFY")}><button className="btn-danger">Disconnect</button></form>
          </div>
        ) : (
          <ShopifyForm siteId={siteId} />
        )}
      </section>
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Custom-built site (Next.js, Laravel, any framework)</h2>
            <p className="text-sm text-slate-500">
              The site reads published articles from our Content API with a key, and can get a signed webhook the moment one is published.
            </p>
          </div>
          {custom && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Connected</span>}
        </div>
        {(wp || shop) && (
          <p className="text-xs text-amber-700">WordPress/Shopify is also connected, so articles are published there. Disconnect it to publish to the custom site.</p>
        )}
        {custom && <p className="text-sm text-slate-600">API key in use: <code className="rounded bg-slate-100 px-1">{cfg(custom).apiKeyPrefix}…</code></p>}
        <CustomSiteForm siteId={siteId} connected={!!custom}
          defaults={{ urlPattern: cfg(custom).urlPattern ?? `https://${site.domain}/blog/{slug}`, webhookUrl: cfg(custom).webhookUrl ?? "" }} />
        {custom && <form action={disconnect.bind(null, siteId, "CUSTOM")}><button className="btn-danger">Disconnect</button></form>}
        <CustomSiteDocs apiBase={apiBase} />
      </section>
    </div>
  );
}

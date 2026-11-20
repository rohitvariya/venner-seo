import { requireSite } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { disconnect, syncGscNow } from "@/app/actions";
import { ShopifyForm, WordPressForm } from "@/components/integration-forms";
import { SubmitButton } from "@/components/ui";

export default async function IntegrationsPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ gsc?: string }>;
}) {
  const { siteId } = await params;
  const { gsc: gscResult } = await searchParams;
  const { site } = await requireSite(siteId);
  const integrations = await db.query.integrations.findMany({ where: eq(schema.integrations.siteId, siteId) });
  const get = (t: string) => integrations.find((i) => i.type === t);
  const wp = get("WORDPRESS");
  const shop = get("SHOPIFY");
  const gsc = get("GSC");
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
    </div>
  );
}

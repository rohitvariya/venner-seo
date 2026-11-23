import { requireSitePageForAgency } from "@/lib/auth";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { addArea, removeArea, rescanSite, saveContact, saveSettings, toggleService, addService, cancelInvite, createClientInvite, revokeClientAccess } from "@/app/actions";
import { InviteForm } from "@/components/client/invite-form";
import { SubmitButton } from "@/components/ui";

export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSitePageForAgency(siteId);
  const [services, areas, clients, pending] = await Promise.all([
    db.query.services.findMany({ where: eq(schema.services.siteId, siteId), orderBy: asc(schema.services.name) }),
    db.query.serviceAreas.findMany({ where: eq(schema.serviceAreas.siteId, siteId) }),
    db.select({ userId: schema.users.id, email: schema.users.email, name: schema.users.name, since: schema.clientSiteAccess.createdAt })
      .from(schema.clientSiteAccess).innerJoin(schema.users, eq(schema.users.id, schema.clientSiteAccess.userId))
      .where(eq(schema.clientSiteAccess.siteId, siteId)),
    db.query.invites.findMany({ where: and(eq(schema.invites.siteId, siteId), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())) }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section id="clients" className="card space-y-3">
        <div>
          <h2 className="font-semibold">Client logins</h2>
          <p className="text-sm text-slate-500">
            Give your client their own login. They see only this website: results, the monthly report and new articles, which they can approve or send back with changes. They can&apos;t change settings or connections.
          </p>
        </div>
        <InviteForm action={createClientInvite.bind(null, siteId)} />
        {(clients.length > 0 || pending.length > 0) && (
          <ul className="divide-y rounded-lg border text-sm">
            {clients.map((c) => (
              <li key={c.userId} className="flex items-center justify-between px-3 py-2">
                <span><span className="font-medium">{c.name ?? c.email}</span> <span className="text-slate-500">{c.name ? c.email : ""}</span></span>
                <form action={revokeClientAccess.bind(null, siteId, c.userId)}><button className="text-xs text-red-600 hover:underline">Remove access</button></form>
              </li>
            ))}
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-3 py-2 text-slate-500">
                <span>{i.email} · invited, not joined yet</span>
                <form action={cancelInvite.bind(null, siteId, i.id)}><button className="text-xs hover:underline">Cancel invite</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={saveSettings.bind(null, siteId)} className="card space-y-4">
        <h2 className="font-semibold">Content</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="articlesPerMonth">Articles per month</label>
            <input id="articlesPerMonth" name="articlesPerMonth" type="number" min={1} max={60} className="input" defaultValue={site.articlesPerMonth} />
          </div>
          <div>
            <label className="label" htmlFor="language">Language code</label>
            <input id="language" name="language" className="input" defaultValue={site.language} placeholder="en, hi, gu…" />
          </div>
        </div>
        <SubmitButton>Save</SubmitButton>
      </form>

      <form action={saveContact.bind(null, siteId)} className="card space-y-4">
        <h2 className="font-semibold">Business details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["businessName", "Business name", site.businessName],
            ["phone", "Phone", site.phone],
            ["streetAddress", "Street address", site.streetAddress],
            ["city", "City", site.city],
            ["state", "State", site.state],
            ["country", "Country", site.country],
          ] as const).map(([name, label, value]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <input className="input" id={name} name={name} defaultValue={value ?? ""} />
            </div>
          ))}
        </div>
        <SubmitButton>Save</SubmitButton>
      </form>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Services</h2>
          <form action={rescanSite.bind(null, siteId)}><SubmitButton className="btn-secondary" pending="Queued">Re-scan website</SubmitButton></form>
        </div>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <form key={s.id} action={toggleService.bind(null, siteId, s.id)}>
              <button className={`rounded-lg px-3 py-1 text-sm ${s.selected ? "bg-brand-50 text-brand-600" : "bg-slate-50 text-slate-400 line-through"}`}>{s.name}</button>
            </form>
          ))}
        </div>
        <form action={addService.bind(null, siteId)} className="flex gap-2">
          <input name="name" className="input" placeholder="Add a service" />
          <button className="btn-secondary">Add</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Service areas</h2>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <form key={a.id} action={removeArea.bind(null, siteId, a.id)}>
              <button className="rounded-lg bg-brand-50 px-3 py-1 text-sm text-brand-600">{a.name} ✕</button>
            </form>
          ))}
        </div>
        <form action={addArea.bind(null, siteId)} className="flex gap-2">
          <input name="name" className="input" placeholder="Add a city or area" />
          <button className="btn-secondary">Add</button>
        </form>
      </section>

    </div>
  );
}

import Link from "next/link";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { acceptInvite } from "@/app/actions";
import { AcceptInviteForm } from "@/components/client/accept-invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.query.invites.findFirst({ where: eq(schema.invites.tokenHash, createHash("sha256").update(token).digest("hex")) });
  const valid = inv && !inv.acceptedAt && inv.expiresAt > new Date();
  const [ws, site, existing] = inv
    ? await Promise.all([
        db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, inv.workspaceId) }),
        db.query.sites.findFirst({ where: eq(schema.sites.id, inv.siteId), columns: { businessName: true, domain: true } }),
        db.query.users.findFirst({ where: eq(schema.users.email, inv.email), columns: { id: true } }),
      ])
    : [null, null, null];
  const agency = ws?.brandName ?? ws?.name ?? "Your agency";
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md space-y-4">
        {ws?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ws.logoUrl} alt={agency} className="h-9 max-w-[180px] object-contain" />
        ) : (
          <div className="text-lg font-bold" style={{ color: ws?.brandColor ?? undefined }}>{agency}</div>
        )}
        {!valid ? (
          <>
            <h1 className="text-xl font-semibold">This invite link has expired</h1>
            <p className="text-sm text-slate-500">It may have been used already. Ask {agency} to send you a new one, or <Link href="/login" className="text-brand-600">sign in</Link>.</p>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">Your SEO dashboard for {site?.businessName ?? site?.domain}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {agency} invited you to see your results, read new articles before they go live, and approve them.
              </p>
            </div>
            <AcceptInviteForm action={acceptInvite.bind(null, token)} email={inv!.email} name={inv!.name ?? ""} existing={!!existing} />
          </>
        )}
      </div>
    </div>
  );
}

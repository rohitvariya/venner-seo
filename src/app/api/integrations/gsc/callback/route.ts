import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSiteManage } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { listProperties, matchProperty, oauthClient } from "@/lib/gsc";
import { enqueue } from "@/lib/queue";

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const jar = await cookies();
  const expected = jar.get("gsc_oauth")?.value;
  jar.delete("gsc_oauth");
  const siteId = state.split(".")[0];
  const back = (q: string) => NextResponse.redirect(new URL(`/sites/${siteId}/integrations?gsc=${q}`, process.env.APP_URL));

  if (!code || !expected || expected !== state) return back("error");
  const { site } = await requireSiteManage(siteId);

  try {
    const { tokens } = await oauthClient().getToken(code);
    if (!tokens.refresh_token) return back("error");
    const secret = { refreshToken: tokens.refresh_token };
    const property = matchProperty(await listProperties(secret), site.domain);
    if (!property) return back("no-property");
    const enc = encryptJson(secret);
    await db
      .insert(schema.integrations)
      .values({ siteId, type: "GSC", secret: enc, config: { property } })
      .onConflictDoUpdate({
        target: [schema.integrations.siteId, schema.integrations.type],
        set: { secret: enc, config: { property }, lastSyncedAt: null },
      });
    await enqueue("sync-gsc", { siteId });
    return back("connected");
  } catch (err) {
    console.error("GSC callback failed", err);
    return back("error");
  }
}

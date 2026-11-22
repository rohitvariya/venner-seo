import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { gbpOAuthClient, listLocations, matchLocation } from "@/lib/gbp";
import { enqueue } from "@/lib/queue";

/** Stores the refresh token and picks the location matching the site (or lets the user choose). */
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  const jar = await cookies();
  const expected = jar.get("gbp_oauth")?.value;
  jar.delete("gbp_oauth");
  const siteId = state.split(".")[0];
  const back = (q: string) => NextResponse.redirect(new URL(`/sites/${siteId}/integrations?gbp=${q}`, process.env.APP_URL));
  if (!code || !expected || expected !== state) return back("error");
  const { site } = await requireSite(siteId);

  try {
    const { tokens } = await gbpOAuthClient().getToken(code);
    if (!tokens.refresh_token) return back("error");
    const secret = { refreshToken: tokens.refresh_token };
    const locations = await listLocations(secret);
    if (locations.length === 0) return back("no-location");
    const match = matchLocation(locations, site.domain) ?? (locations.length === 1 ? locations[0] : null);
    const config: Record<string, string> = match
      ? { account: match.account, location: match.location, title: match.title, address: match.address }
      : { choices: JSON.stringify(locations.slice(0, 50)) };
    const enc = encryptJson(secret);
    await db
      .insert(schema.integrations)
      .values({ siteId, type: "GBP", secret: enc, config })
      .onConflictDoUpdate({ target: [schema.integrations.siteId, schema.integrations.type], set: { secret: enc, config } });
    if (match) await enqueue("sync-reviews", { siteId });
    return back(match ? "connected" : "choose");
  } catch (err) {
    console.error("GBP callback failed", err);
    return back(err instanceof Error && /refused access/.test(err.message) ? "no-api" : "error");
  }
}

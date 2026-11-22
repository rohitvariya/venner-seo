import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireSite } from "@/lib/auth";
import { gbpAuthUrl } from "@/lib/gbp";

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId") ?? "";
  await requireSite(siteId);
  const state = `${siteId}.${crypto.randomBytes(16).toString("hex")}`;
  const jar = await cookies();
  jar.set("gbp_oauth", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(gbpAuthUrl(state));
}

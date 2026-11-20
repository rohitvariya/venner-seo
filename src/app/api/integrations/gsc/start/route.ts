import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireSite } from "@/lib/auth";
import { gscAuthUrl } from "@/lib/gsc";

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId") ?? "";
  await requireSite(siteId);
  const nonce = crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("gsc_oauth", `${siteId}.${nonce}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(gscAuthUrl(`${siteId}.${nonce}`));
}

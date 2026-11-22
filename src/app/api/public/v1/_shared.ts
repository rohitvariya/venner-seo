import { NextResponse, type NextRequest } from "next/server";
import { siteForApiKey } from "@/lib/publish/custom";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...CORS, ...extra } });
}

/** Reads the key from "Authorization: Bearer vsk_…" (or ?key= for quick browser testing). */
export async function authSite(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const key = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : req.nextUrl.searchParams.get("key");
  return siteForApiKey(key);
}

export const unauthorized = () =>
  json({ error: "Invalid or missing API key. Send it as: Authorization: Bearer vsk_…" }, 401);

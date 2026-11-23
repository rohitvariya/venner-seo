// Google Maps: profile performance sync, profile details, and geo-grid rank scans.
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { enqueue } from "../queue";
import { googleLocation } from "../social/jobs";
import { fetchDailyMetrics, fetchSearchKeywords, getProfile, type GbpProfile } from "../gbp";
import { dataForSeoEnabled, mapsResults } from "../dataforseo";
import type { GridPoint, InsightKind } from "../schema";

export async function saveInsight(siteId: string, kind: InsightKind, data: Record<string, unknown>) {
  await db.insert(schema.siteInsights).values({ siteId, kind, status: "DONE", data });
}

/** Pulls the last 90 days of Maps metrics, the search terms and the profile details. */
export async function syncGbpMetrics(siteId: string) {
  const g = await googleLocation(siteId);
  if (!g) return;
  const rows = await fetchDailyMetrics(g.secret, g.loc.location);
  for (const r of rows) {
    await db
      .insert(schema.gbpDailyMetrics)
      .values({ siteId, ...r })
      .onConflictDoUpdate({
        target: [schema.gbpDailyMetrics.siteId, schema.gbpDailyMetrics.date],
        set: { searchViews: r.searchViews, mapsViews: r.mapsViews, calls: r.calls, directions: r.directions, websiteClicks: r.websiteClicks, messages: r.messages },
      });
  }
  try {
    await saveInsight(siteId, "maps-keywords", { keywords: await fetchSearchKeywords(g.secret, g.loc.location) });
  } catch (err) {
    console.error("Search keywords failed:", err);
  }
  try {
    const profile = await getProfile(g.secret, g.loc);
    await saveInsight(siteId, "profile", profile as unknown as Record<string, unknown>);
    if (profile.lat != null && profile.lng != null) {
      await db.update(schema.sites).set({ lat: profile.lat, lng: profile.lng }).where(eq(schema.sites.id, siteId));
    }
  } catch (err) {
    console.error("Profile details failed:", err);
  }
}

export async function latestInsight<T>(siteId: string, kind: InsightKind) {
  const row = await db.query.siteInsights.findFirst({
    where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, kind)),
    orderBy: desc(schema.siteInsights.createdAt),
  });
  return row ? { ...row, data: row.data as T | null } : null;
}

export type { GbpProfile };

/** Finds the business on the map: Google profile first, then the address via OpenStreetMap. */
export async function locateSite(siteId: string): Promise<{ lat: number; lng: number } | null> {
  const site = await db.query.sites.findFirst({ where: eq(schema.sites.id, siteId) });
  if (!site) return null;
  if (site.lat != null && site.lng != null) return { lat: site.lat, lng: site.lng };
  const q = [site.streetAddress, site.city, site.state, site.country].filter(Boolean).join(", ") || site.businessName;
  if (!q) return null;
  try {
    const base = process.env.NOMINATIM_API ?? "https://nominatim.openstreetmap.org";
    const res = await fetch(`${base}/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "VennerSEO/1.0 (geo-grid)" },
      signal: AbortSignal.timeout(20_000),
    });
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    if (!hit) return null;
    const pos = { lat: Number(hit.lat), lng: Number(hit.lon) };
    await db.update(schema.sites).set(pos).where(eq(schema.sites.id, siteId));
    return pos;
  } catch {
    return null;
  }
}

/** size x size points spread evenly over a square of ±radiusKm around the centre. */
export function gridPoints(lat: number, lng: number, size: number, radiusKm: number) {
  const half = (size - 1) / 2;
  const step = half ? radiusKm / half : 0;
  const pts: { lat: number; lng: number }[] = [];
  for (let r = half; r >= -half; r--) {
    for (let c = -half; c <= half; c++) {
      pts.push({ lat: lat + (r * step) / 111.32, lng: lng + (c * step) / (111.32 * Math.cos((lat * Math.PI) / 180)) });
    }
  }
  return pts;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** True when a Maps result is this business (same website domain, or same name). */
export function isOurs(item: { title: string; domain: string | null }, domain: string, name: string | null) {
  const d = domain.replace(/^www\./, "");
  if (item.domain && item.domain.replace(/^www\./, "") === d) return true;
  if (!name) return false;
  const a = norm(item.title);
  const b = norm(name);
  return a === b || (b.length > 5 && (a.startsWith(b) || b.startsWith(a)));
}

export async function startGeoGrid(siteId: string, keyword: string, size: number, radiusKm: number) {
  if (!dataForSeoEnabled()) throw new Error("Geo-grid needs DataForSEO. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to .env.");
  const pos = await locateSite(siteId);
  if (!pos) throw new Error("We couldn't find your business on the map. Connect Google Business Profile or add your address in Settings.");
  const [row] = await db
    .insert(schema.geoGridScans)
    .values({ siteId, keyword: keyword.trim().toLowerCase(), centerLat: pos.lat, centerLng: pos.lng, radiusKm, size, status: "QUEUED" })
    .returning({ id: schema.geoGridScans.id });
  await enqueue("geo-grid", { siteId, scanId: row.id });
  return row.id;
}

export async function runGeoGrid(scanId: string) {
  const scan = await db.query.geoGridScans.findFirst({ where: eq(schema.geoGridScans.id, scanId) });
  if (!scan) return;
  const site = await db.query.sites.findFirst({ where: eq(schema.sites.id, scan.siteId) });
  if (!site) return;
  await db.update(schema.geoGridScans).set({ status: "RUNNING", error: null }).where(eq(schema.geoGridScans.id, scanId));
  try {
    const pts = gridPoints(scan.centerLat, scan.centerLng, scan.size, scan.radiusKm);
    const out: GridPoint[] = new Array(pts.length);
    let failures = 0;
    // A few points at a time to stay friendly with the API.
    for (let i = 0; i < pts.length; i += 4) {
      await Promise.all(
        pts.slice(i, i + 4).map(async (p, k) => {
          try {
            const items = await mapsResults(scan.keyword, p.lat, p.lng, site.language);
            const hit = items.find((it) => isOurs(it, site.domain, site.businessName));
            out[i + k] = { ...p, rank: hit ? hit.rank : null, top: items.slice(0, 3).map((it) => it.title) };
          } catch (err) {
            failures++;
            console.error("Geo-grid point failed:", err);
            out[i + k] = { ...p, rank: null, top: [] };
          }
        }),
      );
    }
    if (failures === pts.length) throw new Error("Every map lookup failed. Check your DataForSEO account and balance.");
    const ranks = out.map((p) => p.rank ?? 21);
    await db
      .update(schema.geoGridScans)
      .set({
        status: "DONE",
        points: out,
        avgRank: Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10,
        top3Share: out.filter((p) => p.rank !== null && p.rank <= 3).length / out.length,
      })
      .where(eq(schema.geoGridScans.id, scanId));
  } catch (err) {
    await db
      .update(schema.geoGridScans)
      .set({ status: "FAILED", error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.geoGridScans.id, scanId));
    throw err;
  }
}

/** Re-runs each site's most recent geo-grid keyword once a week, so the trend builds up. */
export async function queueWeeklyGeoGrids() {
  if (!dataForSeoEnabled()) return;
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const latest = await db.query.geoGridScans.findMany({ orderBy: desc(schema.geoGridScans.createdAt), limit: 500 });
  const seen = new Set<string>();
  for (const s of latest) {
    if (seen.has(s.siteId)) continue;
    seen.add(s.siteId);
    if (s.createdAt >= weekAgo) continue;
    const recent = await db.query.geoGridScans.findFirst({
      where: and(eq(schema.geoGridScans.siteId, s.siteId), gte(schema.geoGridScans.createdAt, weekAgo)),
    });
    if (!recent) await startGeoGrid(s.siteId, s.keyword, s.size, s.radiusKm).catch((e) => console.error("Weekly geo-grid:", e));
  }
}

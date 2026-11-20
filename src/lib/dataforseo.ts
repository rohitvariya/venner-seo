// Minimal DataForSEO client (https://docs.dataforseo.com). Optional: if credentials
// are missing, callers fall back to AI-only keyword ideas without volumes.

export function dataForSeoEnabled() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
  ).toString("base64");
  const res = await fetch(`https://api.dataforseo.com/v3${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} failed: ${res.status}`);
  const json = (await res.json()) as { tasks?: { status_code: number; status_message: string; result: T }[] };
  const task = json.tasks?.[0];
  if (!task || task.status_code >= 40000) throw new Error(`DataForSEO: ${task?.status_message ?? "no task"}`);
  return task.result;
}

export type KeywordMetrics = {
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  cpc: number | null;
};

/** Search volume + CPC for up to 1000 keywords (Google Ads data). */
export async function keywordMetrics(
  keywords: string[],
  locationName: string,
  languageCode = "en",
): Promise<KeywordMetrics[]> {
  type Row = { keyword: string; search_volume: number | null; cpc: number | null; competition_index: number | null };
  const rows = await post<Row[]>("/keywords_data/google_ads/search_volume/live", [
    { keywords: keywords.slice(0, 1000), location_name: locationName, language_code: languageCode },
  ]);
  return (rows ?? []).map((r) => ({
    keyword: r.keyword,
    searchVolume: r.search_volume,
    cpc: r.cpc,
    difficulty: r.competition_index,
  }));
}

/** Organic Google results for a query, used to discover local competitors. */
export async function organicResults(query: string, locationName: string, languageCode = "en") {
  type Item = { type: string; domain?: string; title?: string; url?: string };
  type Result = { items?: Item[] }[];
  const result = await post<Result>("/serp/google/organic/live/regular", [
    { keyword: query, location_name: locationName, language_code: languageCode, depth: 20 },
  ]);
  return (result?.[0]?.items ?? []).filter((i) => i.type === "organic" && i.domain);
}

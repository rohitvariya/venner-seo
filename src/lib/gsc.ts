import { google } from "googleapis";

// Google Search Console via OAuth (scope: webmasters.readonly).
// Create an OAuth client (Web application) in Google Cloud Console and add
// `${APP_URL}/api/integrations/gsc/callback` as an authorised redirect URI.

export type GscSecret = { refreshToken: string };

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/integrations/gsc/callback`,
  );
}

export function gscAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/webmasters.readonly"],
    state,
  });
}

function client(secret: GscSecret) {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: secret.refreshToken });
  return google.searchconsole({ version: "v1", auth });
}

export async function listProperties(secret: GscSecret) {
  const res = await client(secret).sites.list();
  return (res.data.siteEntry ?? []).map((s) => s.siteUrl!).filter(Boolean);
}

/** Picks the GSC property matching a domain (domain property preferred). */
export function matchProperty(properties: string[], domain: string) {
  const d = domain.replace(/^www\./, "");
  return (
    properties.find((p) => p === `sc-domain:${d}`) ??
    properties.find((p) => p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") === d) ??
    null
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function fetchDaily(secret: GscSecret, property: string, days = 90) {
  const end = new Date(Date.now() - 2 * 86400_000); // GSC data lags ~2 days
  const start = new Date(end.getTime() - days * 86400_000);
  const res = await client(secret).searchanalytics.query({
    siteUrl: property,
    requestBody: { startDate: iso(start), endDate: iso(end), dimensions: ["date"], rowLimit: 1000 },
  });
  return (res.data.rows ?? []).map((r) => ({
    date: r.keys![0],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

export async function fetchTopQueries(secret: GscSecret, property: string, days = 28) {
  const end = new Date(Date.now() - 2 * 86400_000);
  const start = new Date(end.getTime() - days * 86400_000);
  const res = await client(secret).searchanalytics.query({
    siteUrl: property,
    requestBody: { startDate: iso(start), endDate: iso(end), dimensions: ["query"], rowLimit: 250 },
  });
  return {
    periodEnd: iso(end),
    rows: (res.data.rows ?? []).map((r) => ({
      query: r.keys![0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    })),
  };
}

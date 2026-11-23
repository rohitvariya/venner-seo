// Google Business Profile: OAuth (scope business.manage), locations, local posts and reviews.
// API access must be approved by Google for your Cloud project first:
// https://developers.google.com/my-business/content/prereqs  (request form linked there).
// Uses the same OAuth client as Search Console (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), with
// `${APP_URL}/api/integrations/gbp/callback` added as an authorised redirect URI.

import { google } from "googleapis";

export type GbpSecret = { refreshToken: string };
export type GbpLocation = { account: string; location: string; title: string; address: string; website: string | null };

// Overridable for local tests with a mock server.
const ACCOUNTS_API = process.env.GBP_ACCOUNTS_API || "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = process.env.GBP_INFO_API || "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4_API = process.env.GBP_V4_API || "https://mybusiness.googleapis.com/v4";
const PERF_API = process.env.GBP_PERF_API || "https://businessprofileperformance.googleapis.com/v1";

export function gbpOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/integrations/gbp/callback`,
  );
}

export function gbpAuthUrl(state: string) {
  return gbpOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/business.manage"],
    state,
  });
}

async function token(secret: GbpSecret) {
  if (process.env.GBP_TEST_TOKEN) return process.env.GBP_TEST_TOKEN; // local tests only
  const auth = gbpOAuthClient();
  auth.setCredentials({ refresh_token: secret.refreshToken });
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error("Google did not return an access token. Reconnect Google Business Profile.");
  return token;
}

async function call<T>(secret: GbpSecret, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await token(secret)}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /has not been used|disabled|PERMISSION_DENIED/.test(body)) {
      throw new Error("Google refused access. Make sure the Business Profile APIs are enabled and approved for your Google Cloud project.");
    }
    throw new Error(`Google Business Profile ${res.status}: ${body.slice(0, 300)}`);
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** All locations the signed-in Google account manages. */
export async function listLocations(secret: GbpSecret): Promise<GbpLocation[]> {
  const { accounts = [] } = await call<{ accounts?: { name: string }[] }>(secret, `${ACCOUNTS_API}/accounts`);
  const out: GbpLocation[] = [];
  for (const acc of accounts) {
    type Loc = { name: string; title: string; websiteUri?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } };
    const { locations = [] } = await call<{ locations?: Loc[] }>(
      secret,
      `${INFO_API}/${acc.name}/locations?readMask=name,title,websiteUri,storefrontAddress&pageSize=100`,
    );
    for (const l of locations) {
      out.push({
        account: acc.name,
        location: l.name,
        title: l.title,
        address: [...(l.storefrontAddress?.addressLines ?? []), l.storefrontAddress?.locality].filter(Boolean).join(", "),
        website: l.websiteUri ?? null,
      });
    }
  }
  return out;
}

/** Picks the location whose website matches the site's domain. */
export function matchLocation(locations: GbpLocation[], domain: string) {
  const d = domain.replace(/^www\./, "");
  return locations.find((l) => (l.website ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") === d) ?? null;
}

const v4Path = (account: string, location: string) => `${V4_API}/${account}/${location}`; // accounts/1/locations/2

export async function createLocalPost(
  secret: GbpSecret,
  loc: { account: string; location: string },
  post: { text: string; link: string | null; cta: string | null; imageUrl: string | null },
) {
  const actionType = post.cta || (post.link ? "LEARN_MORE" : null);
  const body = {
    languageCode: "en",
    summary: post.text.slice(0, 1500),
    topicType: "STANDARD",
    ...(actionType ? { callToAction: actionType === "CALL" ? { actionType } : { actionType, url: post.link ?? undefined } } : {}),
    ...(post.imageUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: post.imageUrl }] } : {}),
  };
  const res = await call<{ name: string; searchUrl?: string }>(secret, `${v4Path(loc.account, loc.location)}/localPosts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { externalId: res.name, url: res.searchUrl ?? null };
}

export type GbpReview = {
  name: string;
  reviewer?: { displayName?: string };
  starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime?: string;
  reviewReply?: { comment: string; updateTime?: string };
};

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, STAR_RATING_UNSPECIFIED: 0 } as const;
export const starsOf = (r: GbpReview) => STARS[r.starRating] ?? 0;

export async function listReviews(secret: GbpSecret, loc: { account: string; location: string }, maxPages = 5) {
  const all: GbpReview[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const url = `${v4Path(loc.account, loc.location)}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await call<{ reviews?: GbpReview[]; nextPageToken?: string }>(secret, url);
    all.push(...(res.reviews ?? []));
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return all;
}

export async function replyToReview(secret: GbpSecret, reviewName: string, comment: string) {
  await call(secret, `${V4_API}/${reviewName}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
}

// ---- Performance (Google Maps insights) ----

export type DailyMetrics = {
  date: string; // YYYY-MM-DD
  searchViews: number;
  mapsViews: number;
  calls: number;
  directions: number;
  websiteClicks: number;
  messages: number;
};

const METRICS: Record<string, keyof Omit<DailyMetrics, "date">> = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "searchViews",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "mapsViews",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "mapsViews",
  CALL_CLICKS: "calls",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_CONVERSATIONS: "messages",
};

const ymd = (d: Date) => ({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() });

/** Daily views, calls, direction requests and website clicks for a location. */
export async function fetchDailyMetrics(secret: GbpSecret, location: string, days = 90): Promise<DailyMetrics[]> {
  const end = new Date(Date.now() - 86400_000); // Google's data lags a few days; yesterday is the latest possible
  const start = new Date(end.getTime() - (days - 1) * 86400_000);
  const s = ymd(start);
  const e = ymd(end);
  const qs = [
    ...Object.keys(METRICS).map((m) => `dailyMetrics=${m}`),
    `dailyRange.start_date.year=${s.y}`, `dailyRange.start_date.month=${s.m}`, `dailyRange.start_date.day=${s.d}`,
    `dailyRange.end_date.year=${e.y}`, `dailyRange.end_date.month=${e.m}`, `dailyRange.end_date.day=${e.d}`,
  ].join("&");
  type Res = {
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: {
        dailyMetric: string;
        timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] };
      }[];
    }[];
  };
  const res = await call<Res>(secret, `${PERF_API}/${location}:fetchMultiDailyMetricsTimeSeries?${qs}`);
  const byDate = new Map<string, DailyMetrics>();
  for (const group of res.multiDailyMetricTimeSeries ?? []) {
    for (const series of group.dailyMetricTimeSeries ?? []) {
      const field = METRICS[series.dailyMetric];
      if (!field) continue;
      for (const v of series.timeSeries?.datedValues ?? []) {
        const key = `${v.date.year}-${String(v.date.month).padStart(2, "0")}-${String(v.date.day).padStart(2, "0")}`;
        const row = byDate.get(key) ?? { date: key, searchViews: 0, mapsViews: 0, calls: 0, directions: 0, websiteClicks: 0, messages: 0 };
        row[field] += Number(v.value ?? 0);
        byDate.set(key, row);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type SearchKeyword = { keyword: string; count: number | null; below: number | null };

/** Searches people used to find the profile last month (Google hides small numbers as "< N"). */
export async function fetchSearchKeywords(secret: GbpSecret, location: string): Promise<SearchKeyword[]> {
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const qs = [
    `monthlyRange.start_month.year=${first.getUTCFullYear()}`, `monthlyRange.start_month.month=${first.getUTCMonth() + 1}`,
    `monthlyRange.end_month.year=${last.getUTCFullYear()}`, `monthlyRange.end_month.month=${last.getUTCMonth() + 1}`,
    "pageSize=50",
  ].join("&");
  type Res = { searchKeywordsCounts?: { searchKeyword: string; insightsValue?: { value?: string; threshold?: string } }[] };
  const res = await call<Res>(secret, `${PERF_API}/${location}/searchkeywords/impressions/monthly?${qs}`);
  return (res.searchKeywordsCounts ?? []).map((k) => ({
    keyword: k.searchKeyword,
    count: k.insightsValue?.value ? Number(k.insightsValue.value) : null,
    below: k.insightsValue?.threshold ? Number(k.insightsValue.threshold) : null,
  }));
}

// ---- Profile details ----

export type GbpProfile = {
  title: string;
  description: string | null;
  primaryCategory: string | null;
  additionalCategories: string[];
  phone: string | null;
  website: string | null;
  address: string | null;
  hours: { day: string; open: string; close: string }[];
  lat: number | null;
  lng: number | null;
  mapsUri: string | null;
  reviewUri: string | null;
  photoCount: number | null;
};

const pad2 = (n?: number) => String(n ?? 0).padStart(2, "0");

export async function getProfile(secret: GbpSecret, loc: { account: string; location: string }): Promise<GbpProfile> {
  type Loc = {
    title: string;
    phoneNumbers?: { primaryPhone?: string };
    categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: { displayName?: string }[] };
    storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
    websiteUri?: string;
    regularHours?: { periods?: { openDay: string; openTime?: { hours?: number; minutes?: number }; closeTime?: { hours?: number; minutes?: number } }[] };
    profile?: { description?: string };
    latlng?: { latitude?: number; longitude?: number };
    metadata?: { mapsUri?: string; newReviewUri?: string };
  };
  const mask = "title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,profile,latlng,metadata";
  const l = await call<Loc>(secret, `${INFO_API}/${loc.location}?readMask=${mask}`);
  let photoCount: number | null = null;
  try {
    const media = await call<{ totalMediaItemCount?: number; mediaItems?: unknown[] }>(secret, `${v4Path(loc.account, loc.location)}/media?pageSize=1`);
    photoCount = media.totalMediaItemCount ?? media.mediaItems?.length ?? 0;
  } catch {
    /* media listing is optional */
  }
  const a = l.storefrontAddress;
  return {
    title: l.title,
    description: l.profile?.description ?? null,
    primaryCategory: l.categories?.primaryCategory?.displayName ?? null,
    additionalCategories: (l.categories?.additionalCategories ?? []).map((c) => c.displayName ?? "").filter(Boolean),
    phone: l.phoneNumbers?.primaryPhone ?? null,
    website: l.websiteUri ?? null,
    address: a ? [...(a.addressLines ?? []), a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(", ") : null,
    hours: (l.regularHours?.periods ?? []).map((p) => ({
      day: p.openDay,
      open: `${pad2(p.openTime?.hours)}:${pad2(p.openTime?.minutes)}`,
      close: `${pad2(p.closeTime?.hours)}:${pad2(p.closeTime?.minutes)}`,
    })),
    lat: l.latlng?.latitude ?? null,
    lng: l.latlng?.longitude ?? null,
    mapsUri: l.metadata?.mapsUri ?? null,
    reviewUri: l.metadata?.newReviewUri ?? null,
    photoCount,
  };
}

export async function updateDescription(secret: GbpSecret, location: string, description: string) {
  await call(secret, `${INFO_API}/${location}?updateMask=profile.description`, {
    method: "PATCH",
    body: JSON.stringify({ profile: { description: description.slice(0, 750) } }),
  });
}

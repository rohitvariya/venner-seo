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

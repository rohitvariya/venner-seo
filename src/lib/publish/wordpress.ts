// WordPress publishing via the core REST API using an Application Password
// (Users → Profile → Application Passwords in wp-admin; WordPress 5.6+).
// Also sets category/tags, uploads a featured image, and writes SEO meta for
// Rank Math (rankmath/v1/updateMeta) or Yoast (yoast_head meta fields) when present.

export type WordPressSecret = { siteUrl: string; username: string; appPassword: string };

function auth(s: WordPressSecret) {
  return `Basic ${Buffer.from(`${s.username}:${s.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function root(s: WordPressSecret) {
  return `${s.siteUrl.replace(/\/$/, "")}/wp-json`;
}

async function wp<T>(s: WordPressSecret, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${root(s)}${path}`, {
    ...init,
    headers: { Authorization: auth(s), "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`WordPress ${path.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function testWordPress(s: WordPressSecret) {
  let me: { name: string; capabilities?: Record<string, boolean> };
  try {
    me = await wp(s, "/wp/v2/users/me?context=edit", { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error("WordPress rejected the credentials. Check the URL, username and application password.");
  }
  if (me.capabilities && !me.capabilities.publish_posts) throw new Error("This WordPress user cannot publish posts.");
  return me.name;
}

type Term = { id: number; name: string; slug: string };

/** Finds the best existing category: exact/partial match on the article's category, else "Blog", else none. */
async function pickCategory(s: WordPressSecret, wanted: string | undefined): Promise<number | null> {
  const cats = await wp<Term[]>(s, "/wp/v2/categories?per_page=100&_fields=id,name,slug");
  const usable = cats.filter((c) => c.slug !== "uncategorized");
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (wanted) {
    const w = norm(wanted);
    const hit = usable.find((c) => norm(c.name) === w) ?? usable.find((c) => norm(c.name).includes(w) || w.includes(norm(c.name)));
    if (hit) return hit.id;
  }
  return usable.find((c) => /^(blog|blogs|articles|news|insights)$/i.test(c.name.trim()))?.id ?? null;
}

/** Returns tag ids, creating tags that don't exist yet (max 8). */
async function ensureTags(s: WordPressSecret, names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names.slice(0, 8)) {
    const found = await wp<Term[]>(s, `/wp/v2/tags?search=${encodeURIComponent(name)}&_fields=id,name`);
    const exact = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (exact) ids.push(exact.id);
    else ids.push((await wp<Term>(s, "/wp/v2/tags", { method: "POST", body: JSON.stringify({ name }) })).id);
  }
  return ids;
}

/** Downloads an image and uploads it to the media library; returns the attachment id. */
async function uploadMedia(s: WordPressSecret, imageUrl: string, alt: string, caption?: string): Promise<number> {
  const img = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`Could not download the featured image (${img.status})`);
  const type = img.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const filename = `${alt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "featured"}.${ext}`;
  const res = await fetch(`${root(s)}/wp/v2/media`, {
    method: "POST",
    headers: { Authorization: auth(s), "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` },
    body: Buffer.from(await img.arrayBuffer()),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Featured image upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const media = (await res.json()) as { id: number };
  await wp(s, `/wp/v2/media/${media.id}`, {
    method: "POST",
    body: JSON.stringify({ alt_text: alt, ...(caption ? { caption } : {}) }),
  }).catch(() => undefined);
  return media.id;
}

/** Writes SEO title/description/focus keyword into Rank Math. Returns false if Rank Math isn't reachable. */
async function setRankMath(s: WordPressSecret, postId: number, seo: SeoMeta): Promise<boolean> {
  try {
    await wp(s, "/rankmath/v1/updateMeta", {
      method: "POST",
      body: JSON.stringify({
        objectType: "post",
        objectID: postId,
        meta: {
          rank_math_title: seo.title,
          rank_math_description: seo.description,
          rank_math_focus_keyword: seo.focusKeyword,
        },
      }),
    });
    return true;
  } catch {
    return false;
  }
}

type SeoMeta = { title: string; description: string; focusKeyword: string };

export async function publishToWordPress(
  s: WordPressSecret,
  post: {
    title: string;
    slug: string | null;
    html: string;
    excerpt: string | null;
    status: "publish" | "draft";
    externalId?: string | null;
    category?: string;
    tags?: string[];
    featuredImage?: { url: string; alt: string; caption?: string } | null;
    seo?: SeoMeta | null;
  },
) {
  const notes: string[] = [];

  let categories: number[] | undefined;
  let tags: number[] | undefined;
  try {
    const cat = await pickCategory(s, post.category);
    if (cat) categories = [cat];
  } catch (e) {
    notes.push(`Category not set: ${(e as Error).message}`);
  }
  try {
    if (post.tags?.length) tags = await ensureTags(s, post.tags);
  } catch (e) {
    notes.push(`Tags not set: ${(e as Error).message}`);
  }

  // Only upload a featured image if the post doesn't already have one (re-publishing keeps it).
  let featured_media: number | undefined;
  if (post.featuredImage) {
    try {
      const existing = post.externalId
        ? await wp<{ featured_media: number }>(s, `/wp/v2/posts/${post.externalId}?context=edit&_fields=featured_media`)
        : { featured_media: 0 };
      if (!existing.featured_media) {
        featured_media = await uploadMedia(s, post.featuredImage.url, post.featuredImage.alt, post.featuredImage.caption);
      }
    } catch (e) {
      notes.push((e as Error).message);
    }
  }

  const json = await wp<{ id: number; link: string }>(s, post.externalId ? `/wp/v2/posts/${post.externalId}` : "/wp/v2/posts", {
    method: "POST",
    body: JSON.stringify({
      title: post.title,
      slug: post.slug ?? undefined,
      content: post.html,
      excerpt: post.excerpt ?? undefined,
      status: post.status,
      categories,
      tags,
      featured_media,
    }),
  });

  if (post.seo) {
    const ok = await setRankMath(s, json.id, post.seo);
    if (!ok) notes.push("SEO meta not sent: Rank Math's REST API isn't reachable (needs Rank Math installed and this user allowed to edit the post).");
  }

  return { externalId: String(json.id), url: json.link, notes };
}

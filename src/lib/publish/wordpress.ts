// WordPress publishing via the core REST API using an Application Password
// (Users → Profile → Application Passwords in wp-admin; WordPress 5.6+).

export type WordPressSecret = { siteUrl: string; username: string; appPassword: string };

function headers(s: WordPressSecret) {
  const token = Buffer.from(`${s.username}:${s.appPassword.replace(/\s+/g, "")}`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

function api(s: WordPressSecret, path: string) {
  return `${s.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2${path}`;
}

export async function testWordPress(s: WordPressSecret) {
  const res = await fetch(api(s, "/users/me?context=edit"), { headers: headers(s), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`WordPress rejected the credentials (${res.status}). Check the URL, username and application password.`);
  const me = (await res.json()) as { name: string; capabilities?: Record<string, boolean> };
  if (me.capabilities && !me.capabilities.publish_posts) throw new Error("This WordPress user cannot publish posts.");
  return me.name;
}

export async function publishToWordPress(
  s: WordPressSecret,
  post: { title: string; slug: string | null; html: string; excerpt: string | null; status: "publish" | "draft"; externalId?: string | null },
) {
  const body = JSON.stringify({
    title: post.title,
    slug: post.slug ?? undefined,
    content: post.html,
    excerpt: post.excerpt ?? undefined,
    status: post.status,
  });
  const url = post.externalId ? api(s, `/posts/${post.externalId}`) : api(s, "/posts");
  const res = await fetch(url, { method: "POST", headers: headers(s), body, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`WordPress publish failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { id: number; link: string };
  return { externalId: String(json.id), url: json.link };
}

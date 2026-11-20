// Shopify blog publishing via the Admin REST API. Uses a custom-app Admin API access
// token with the write_content scope (Settings → Apps → Develop apps in Shopify admin).

export type ShopifySecret = { shopDomain: string; accessToken: string; blogId?: string };

const VERSION = "2025-07";

function base(s: ShopifySecret) {
  const shop = s.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${shop}/admin/api/${VERSION}`;
}

function headers(s: ShopifySecret) {
  return { "X-Shopify-Access-Token": s.accessToken, "Content-Type": "application/json" };
}

export async function listBlogs(s: ShopifySecret) {
  const res = await fetch(`${base(s)}/blogs.json`, { headers: headers(s), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Shopify rejected the token (${res.status}). It needs the read_content and write_content scopes.`);
  const json = (await res.json()) as { blogs: { id: number; title: string; handle: string }[] };
  return json.blogs;
}

export async function publishToShopify(
  s: ShopifySecret,
  post: { title: string; slug: string | null; html: string; excerpt: string | null; author: string; published: boolean; externalId?: string | null },
) {
  let blogId = s.blogId;
  if (!blogId) {
    const blogs = await listBlogs(s);
    if (blogs.length === 0) throw new Error("This Shopify store has no blog. Create one under Online Store → Blog posts.");
    blogId = String(blogs[0].id);
  }
  const article = {
    title: post.title,
    handle: post.slug ?? undefined,
    body_html: post.html,
    summary_html: post.excerpt ?? undefined,
    author: post.author,
    published: post.published,
  };
  const url = post.externalId
    ? `${base(s)}/blogs/${blogId}/articles/${post.externalId}.json`
    : `${base(s)}/blogs/${blogId}/articles.json`;
  const res = await fetch(url, {
    method: post.externalId ? "PUT" : "POST",
    headers: headers(s),
    body: JSON.stringify({ article }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Shopify publish failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { article: { id: number; handle: string } };
  const blogs = await listBlogs(s);
  const blog = blogs.find((b) => String(b.id) === String(blogId));
  const shop = s.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return {
    externalId: String(json.article.id),
    url: `https://${shop}/blogs/${blog?.handle ?? "news"}/${json.article.handle}`,
  };
}

// Copy-paste integration guides for developers, shown on the Integrations page.

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{children}</pre>;
}

export function CustomSiteDocs({ apiBase }: { apiBase: string }) {
  const next = `// .env.local
VENNER_API_URL=${apiBase}
VENNER_API_KEY=vsk_...

// lib/venner.ts
const base = process.env.VENNER_API_URL!;
const headers = { Authorization: \`Bearer \${process.env.VENNER_API_KEY}\` };

export async function getArticles(page = 1) {
  const res = await fetch(\`\${base}/articles?page=\${page}\`, { headers, next: { revalidate: 300, tags: ["venner"] } });
  return res.json(); // { articles, total, totalPages, ... }
}
export async function getArticle(slug: string) {
  const res = await fetch(\`\${base}/articles/\${slug}\`, { headers, next: { revalidate: 300, tags: ["venner"] } });
  return res.ok ? res.json() : null;
}

// app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";
import { getArticle } from "@/lib/venner";

export async function generateMetadata({ params }) {
  const a = await getArticle((await params).slug);
  return a ? { title: a.seo.title, description: a.seo.description, alternates: { canonical: a.url } } : {};
}
export default async function Post({ params }) {
  const a = await getArticle((await params).slug);
  if (!a) notFound();
  return (
    <article>
      <h1>{a.title}</h1>
      {a.featuredImage && <img src={a.featuredImage.url} alt={a.featuredImage.alt} />}
      <div dangerouslySetInnerHTML={{ __html: a.contentHtml }} />
    </article>
  );
}`;

  const nextWebhook = `// app/api/venner-webhook/route.ts — instant updates (optional)
import crypto from "node:crypto";
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("x-venner-signature") ?? "";      // "t=...,v1=..."
  const t = sig.match(/t=(\\d+)/)?.[1], v1 = sig.match(/v1=([a-f0-9]+)/)?.[1];
  const expected = crypto.createHmac("sha256", process.env.VENNER_WEBHOOK_SECRET!).update(\`\${t}.\${body}\`).digest("hex");
  if (!t || !v1 || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) return new Response("bad signature", { status: 401 });
  const { event, article } = JSON.parse(body);
  revalidateTag("venner");
  return Response.json({ url: article.url }); // optional: tell Venner SEO the live URL
}`;

  const laravel = `// .env
VENNER_API_URL=${apiBase}
VENNER_API_KEY=vsk_...
VENNER_WEBHOOK_SECRET=whsec_...

// routes/web.php
Route::get('/blog', [BlogController::class, 'index']);
Route::get('/blog/{slug}', [BlogController::class, 'show']);

// app/Http/Controllers/BlogController.php
use Illuminate\\Support\\Facades\\{Http, Cache};

class BlogController extends Controller {
    private function api(string $path) {
        return Http::withToken(env('VENNER_API_KEY'))->get(env('VENNER_API_URL') . $path);
    }
    public function index(Request $r) {
        $data = Cache::remember('venner.list.' . $r->query('page', 1), 300,
            fn () => $this->api('/articles?page=' . $r->query('page', 1))->json());
        return view('blog.index', ['data' => $data]);
    }
    public function show(string $slug) {
        $a = Cache::remember("venner.article.$slug", 300, fn () => $this->api("/articles/$slug")->json());
        abort_if(!$a || isset($a['error']), 404);
        return view('blog.show', ['a' => $a]); // {!! $a['contentHtml'] !!}, $a['seo']['title'], ...
    }
}`;

  const laravelWebhook = `// routes/api.php — clears the cache instantly when an article is published (optional)
Route::post('/venner-webhook', function (Request $r) {
    $body = $r->getContent();
    preg_match('/t=(\\d+),v1=([a-f0-9]+)/', $r->header('X-Venner-Signature', ''), $m);
    $expected = hash_hmac('sha256', ($m[1] ?? '') . '.' . $body, env('VENNER_WEBHOOK_SECRET'));
    abort_unless(isset($m[2]) && hash_equals($expected, $m[2]), 401);
    $article = $r->json('article');
    Cache::forget('venner.article.' . $article['slug']);
    Cache::forget('venner.list.1');
    return ['url' => $article['url']];
});`;

  return (
    <details className="rounded-lg border border-slate-200 p-3 text-sm">
      <summary className="cursor-pointer font-medium">For your web developer: Next.js and Laravel setup</summary>
      <div className="mt-3 space-y-4">
        <p className="text-slate-600">
          API base: <code className="rounded bg-slate-100 px-1">{apiBase}</code>. Send the key as{" "}
          <code className="rounded bg-slate-100 px-1">Authorization: Bearer vsk_…</code>. Endpoints:{" "}
          <code className="rounded bg-slate-100 px-1">GET /articles?page=1&amp;limit=20</code> and{" "}
          <code className="rounded bg-slate-100 px-1">GET /articles/{"{slug}"}</code>. Only published articles are returned.
          <code className="rounded bg-slate-100 px-1">contentHtml</code> already includes Article and FAQ schema.
        </p>
        <div><h3 className="mb-1 font-semibold">Next.js (App Router)</h3><Code>{next}</Code></div>
        <div><h3 className="mb-1 font-semibold">Next.js webhook</h3><Code>{nextWebhook}</Code></div>
        <div><h3 className="mb-1 font-semibold">Laravel</h3><Code>{laravel}</Code></div>
        <div><h3 className="mb-1 font-semibold">Laravel webhook</h3><Code>{laravelWebhook}</Code></div>
        <p className="text-xs text-slate-500">
          Webhook body: <code>{`{ event: "article.published" | "article.draft", sentAt, article }`}</code>. Signature header{" "}
          <code>X-Venner-Signature: t=&lt;unix&gt;,v1=&lt;HMAC-SHA256 of &quot;t.body&quot;&gt;</code>. Reply with{" "}
          <code>{`{"url": "..."}`}</code> to set the live URL.
        </p>
      </div>
    </details>
  );
}

// Deterministic on-page SEO checks, shown as a 0-100 score with a checklist in the editor.

export type SeoCheck = { id: string; label: string; passed: boolean; weight: number };

export function scoreArticle(input: {
  keyword: string | null;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  contentMd: string;
  siteDomain: string;
}): { score: number; checks: SeoCheck[] } {
  const kw = (input.keyword ?? "").toLowerCase().trim();
  const body = input.contentMd;
  const lower = body.toLowerCase();
  const words = body.replace(/[#*_`>\[\]()-]/g, " ").split(/\s+/).filter(Boolean).length;
  const first100 = lower.replace(/[#*_`>]/g, " ").split(/\s+/).slice(0, 100).join(" ");
  const h2s = body.match(/^##\s+.+$/gm) ?? [];
  const links = [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1]);
  const internal = links.filter((l) => l.includes(input.siteDomain) || l.startsWith("/"));
  const kwTokens = kw.split(/\s+/).filter((t) => t.length > 2);
  const hasKw = (s: string | null) =>
    !!s && kwTokens.length > 0 && kwTokens.every((t) => s.toLowerCase().includes(t));

  const checks: SeoCheck[] = [
    { id: "kw-title", label: "Keyword in title", passed: hasKw(input.title), weight: 12 },
    { id: "kw-intro", label: "Keyword in first 100 words", passed: hasKw(first100), weight: 10 },
    { id: "kw-h2", label: "Keyword in a subheading", passed: h2s.some((h) => hasKw(h)), weight: 8 },
    { id: "kw-slug", label: "Keyword in URL slug", passed: hasKw((input.slug ?? "").replace(/-/g, " ")), weight: 6 },
    { id: "meta-title", label: "Meta title under 60 characters", passed: !!input.metaTitle && input.metaTitle.length <= 60, weight: 8 },
    {
      id: "meta-desc",
      label: "Meta description 120-160 characters",
      passed: !!input.metaDescription && input.metaDescription.length >= 120 && input.metaDescription.length <= 160,
      weight: 8,
    },
    { id: "length", label: "At least 1,500 words", passed: words >= 1500, weight: 10 },
    { id: "structure", label: "At least 6 subheadings", passed: h2s.length >= 6, weight: 6 },
    { id: "summary", label: "'At a glance' summary up top", passed: /^##\s+at a glance/im.test(body), weight: 5 },
    { id: "table", label: "Has a comparison table", passed: /^\|.+\|\s*$/m.test(body) && /^\|\s*:?-{3,}/m.test(body), weight: 5 },
    { id: "takeaways", label: "Key takeaways section", passed: /^##\s+key takeaways/im.test(body), weight: 4 },
    { id: "internal", label: "2+ internal links", passed: internal.length >= 2, weight: 12 },
    { id: "faq", label: "FAQ section for AI answers", passed: /frequently asked questions|faq/i.test(body), weight: 8 },
    { id: "lists", label: "Uses lists for scannability", passed: /^\s*[-*]\s+/m.test(body), weight: 4 },
    { id: "no-h1", label: "No duplicate H1 in body", passed: !/^#\s+/m.test(body), weight: 4 },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  return { score: Math.round((got / total) * 100), checks };
}

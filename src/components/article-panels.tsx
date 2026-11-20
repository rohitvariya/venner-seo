import type { ArticleStatus, FactIssue } from "@/lib/schema";
import type { Brief } from "@/lib/seo/writer";

const STAGES = [
  { label: "Planned", reached: () => true },
  { label: "Written", reached: (s: ArticleStatus) => !["IDEA", "WRITING"].includes(s) },
  { label: "Your OK", reached: (s: ArticleStatus) => ["APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISHED"].includes(s) },
  { label: "Scheduled", reached: (s: ArticleStatus) => ["SCHEDULED", "PUBLISHING", "PUBLISHED"].includes(s) },
  { label: "Live", reached: (s: ArticleStatus) => s === "PUBLISHED" },
];

export function Pipeline({ status }: { status: ArticleStatus }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Where it&apos;s at</h2>
      <ol className="space-y-2 text-sm">
        {STAGES.map((st, i) => {
          const done = st.reached(status);
          return (
            <li key={st.label} className="flex items-center gap-2">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={done ? "text-slate-800" : "text-slate-400"}>{st.label}</span>
            </li>
          );
        })}
      </ol>
      {status === "FAILED" && <p className="mt-2 text-xs text-red-600">The last step failed. See the error above.</p>}
    </div>
  );
}

export function GooglePreview({ domain, slug, metaTitle, metaDescription, siteName }: {
  domain: string; slug: string | null; metaTitle: string | null; metaDescription: string | null; siteName: string;
}) {
  return (
    <div className="card">
      <h2 className="font-semibold">Google preview</h2>
      <p className="mb-3 text-xs text-slate-500">What people see in search results.</p>
      <div className="rounded-lg border border-slate-100 p-3">
        <div className="text-xs text-slate-600">{siteName}</div>
        <div className="truncate text-xs text-slate-500">{domain} › blog › {slug ?? "…"}</div>
        <div className="mt-1 text-[17px] leading-snug text-[#1a0dab]">{metaTitle || "Add a Google title"}</div>
        <div className="mt-1 line-clamp-2 text-xs text-slate-600">{metaDescription || "Add a Google description"}</div>
      </div>
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-500">Google title</dt>
          <dd className={(metaTitle?.length ?? 0) > 60 ? "text-red-600" : "text-slate-600"}>{metaTitle?.length ?? 0} of 60</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Google description</dt>
          <dd className={(metaDescription?.length ?? 0) > 160 ? "text-red-600" : "text-slate-600"}>{metaDescription?.length ?? 0} of 160</dd>
        </div>
      </dl>
    </div>
  );
}

export function SearchDetails({ keyword, searchVolume, brief, words }: {
  keyword: string | null; searchVolume: number | null; brief: Brief | null; words: number;
}) {
  const rows: [string, React.ReactNode][] = [
    ["Main search", keyword ?? "—"],
    ["Searches a month", searchVolume != null ? searchVolume.toLocaleString() : "—"],
    ["Also helps with", brief?.secondaryKeywords?.length ? brief.secondaryKeywords.join(", ") : "—"],
    ["Category", brief?.category ?? "—"],
    ["Tags", brief?.tags?.length ? brief.tags.join(", ") : "—"],
    ["Length", `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 220))} min read`],
  ];
  return (
    <div className="card">
      <h2 className="mb-2 font-semibold">Search details</h2>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="text-slate-700">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FactIssues({ issues }: { issues: FactIssue[] | null }) {
  if (!issues) return null;
  return (
    <div className={`card ${issues.length ? "border-amber-300" : ""}`}>
      <h2 className="mb-2 font-semibold">Fact check</h2>
      {issues.length === 0 ? (
        <p className="text-sm text-emerald-700">✓ No unsupported claims found against your Business Blueprint.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {issues.map((i, n) => (
            <li key={n}>
              <p className="italic text-slate-700">“{i.claim}”</p>
              <p className="text-amber-700">{i.problem}</p>
              <p className="text-slate-500">Fix: {i.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

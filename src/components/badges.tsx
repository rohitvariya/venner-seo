import type { ArticleStatus } from "@/lib/schema";

const STATUS: Record<ArticleStatus, { label: string; cls: string }> = {
  IDEA: { label: "Queued", cls: "bg-slate-100 text-slate-600" },
  WRITING: { label: "Writing…", cls: "bg-amber-50 text-amber-700" },
  REVIEW: { label: "Needs review", cls: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  SCHEDULED: { label: "Scheduled", cls: "bg-violet-50 text-violet-700" },
  PUBLISHING: { label: "Publishing…", cls: "bg-amber-50 text-amber-700" },
  PUBLISHED: { label: "Published", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700" },
};

export function StatusBadge({ status }: { status: ArticleStatus }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const cls = score >= 80 ? "bg-emerald-50 text-emerald-700" : score >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>SEO {score}</span>;
}

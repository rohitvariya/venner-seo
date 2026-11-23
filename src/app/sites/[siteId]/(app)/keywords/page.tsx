import { requireSitePageForAgency } from "@/lib/auth";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { rejectKeyword, writeFromKeyword } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { dataForSeoEnabled } from "@/lib/dataforseo";

const STATUS_LABEL = { SUGGESTED: "Idea", PLANNED: "Planned", USED: "Written", REJECTED: "Hidden" } as const;

export default async function KeywordsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  await requireSitePageForAgency(siteId);
  const K = schema.keywords;
  const keywords = await db.query.keywords.findMany({
    where: and(eq(K.siteId, siteId), ne(K.status, "REJECTED")),
    orderBy: [asc(K.cluster), sql`${K.searchVolume} desc nulls last`],
  });
  const clusters = new Map<string, typeof keywords>();
  for (const k of keywords) clusters.set(k.cluster ?? "Other", [...(clusters.get(k.cluster ?? "Other") ?? []), k]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Keywords</h1>
        <p className="text-sm text-slate-500">
          Topics we write about, grouped by service.
          {!dataForSeoEnabled() && " Add DataForSEO credentials to see search volume and competition."}
        </p>
      </div>
      {keywords.length === 0 && <p className="card text-sm text-slate-500">No keywords yet. They appear after your content plan is built.</p>}
      {[...clusters.entries()].map(([cluster, list]) => (
        <section key={cluster} className="card p-0">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">{cluster}</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="px-5 py-2">Keyword</th><th className="py-2">Intent</th>
                <th className="py-2 text-right">Volume</th><th className="py-2 text-right">Competition</th>
                <th className="py-2 pl-4">Status</th><th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="px-5 py-2">{k.phrase}</td>
                  <td className="py-2 capitalize text-slate-500">{k.intent}</td>
                  <td className="py-2 text-right">{k.searchVolume?.toLocaleString() ?? "—"}</td>
                  <td className="py-2 text-right">{k.difficulty ?? "—"}</td>
                  <td className="py-2 pl-4 text-slate-500">{STATUS_LABEL[k.status]}</td>
                  <td className="px-5 py-2 text-right">
                    {k.status === "SUGGESTED" && (
                      <div className="flex justify-end gap-2">
                        <form action={writeFromKeyword.bind(null, siteId, k.id)}>
                          <SubmitButton className="btn-secondary px-2 py-1 text-xs" pending="…">Write article</SubmitButton>
                        </form>
                        <form action={rejectKeyword.bind(null, siteId, k.id)}>
                          <button className="px-2 py-1 text-xs text-slate-400 hover:text-red-500">Hide</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

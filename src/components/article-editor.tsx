"use client";

import { useActionState, useMemo, useState } from "react";
import { marked } from "marked";
import type { Article } from "@/lib/schema";
import { saveArticle } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function ArticleEditor({ siteId, article }: { siteId: string; article: Article }) {
  const [state, action] = useActionState(saveArticle.bind(null, siteId, article.id), undefined);
  const [content, setContent] = useState(article.contentMd ?? "");
  const [metaDesc, setMetaDesc] = useState(article.metaDescription ?? "");
  const [tab, setTab] = useState<"edit" | "preview">("preview");
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  const words = content.split(/\s+/).filter(Boolean).length;

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input text-lg font-semibold" defaultValue={article.title} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="metaTitle">Meta title</label>
          <input id="metaTitle" name="metaTitle" className="input" defaultValue={article.metaTitle ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="slug">URL slug</label>
          <input id="slug" name="slug" className="input" defaultValue={article.slug ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="metaDescription">Meta description <span className="font-normal text-slate-400">({metaDesc.length}/160)</span></label>
        <textarea id="metaDescription" name="metaDescription" rows={2} className="input" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(["preview", "edit"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 capitalize ${tab === t ? "bg-white shadow-sm" : "text-slate-500"}`}>
                {t}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">{words.toLocaleString()} words</span>
        </div>
        <textarea name="contentMd" value={content} onChange={(e) => setContent(e.target.value)} rows={30}
          className={`input font-mono text-sm ${tab === "edit" ? "" : "hidden"}`} />
        {tab === "preview" && <article className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} />
        <SubmitButton pending="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

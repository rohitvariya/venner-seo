"use client";

import { useState } from "react";
import type { SocialPost } from "@/lib/schema";
import { deletePost, markPosted, savePost } from "@/app/actions";

const LABEL: Record<SocialPost["channel"], string> = {
  google: "Google", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X",
};
const LIMIT: Record<SocialPost["channel"], number> = { google: 1500, facebook: 2000, instagram: 2200, linkedin: 3000, x: 280 };

function toLocalInput(d: Date | null) {
  if (!d) return "";
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function PostCard({ siteId, post, googleConnected }: { siteId: string; post: SocialPost; googleConnected: boolean }) {
  const [text, setText] = useState(post.text);
  const [copied, setCopied] = useState(false);
  const auto = post.channel === "google";
  const done = post.status === "PUBLISHED";
  const len = post.channel === "x" ? text.length + (post.link ? 24 : 0) : text.length;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{LABEL[post.channel]}</span>
        <span className={done ? "text-emerald-700" : post.status === "FAILED" ? "text-red-600" : post.status === "SCHEDULED" ? "text-violet-700" : "text-slate-500"}>
          {done ? `Posted ${post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}`
            : post.status === "SCHEDULED" ? (auto ? "Scheduled · posts automatically" : "Approved · post it yourself")
            : post.status === "PUBLISHING" ? "Posting…"
            : post.status === "FAILED" ? "Failed" : "Draft"}
        </span>
      </div>
      <form action={savePost.bind(null, siteId, post.id)} className="space-y-2">
        <textarea name="text" rows={post.channel === "x" ? 3 : 7} className="input text-sm" value={text} onChange={(e) => setText(e.target.value)} disabled={done} />
        <div className="flex justify-between text-xs text-slate-400">
          <span>{post.link ? <>Link: <a className="text-brand-500" href={post.link} target="_blank" rel="noreferrer">{post.link.replace(/^https?:\/\//, "").slice(0, 50)}</a></> : "No link"}{auto && post.cta ? ` · Button: ${post.cta.replace("_", " ").toLowerCase()}` : ""}</span>
          <span className={len > LIMIT[post.channel] ? "text-red-600" : ""}>{len}/{LIMIT[post.channel]}</span>
        </div>
        {post.error && <p className="text-xs text-red-600">{post.error}</p>}
        {!done && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" name="scheduledAt" className="input w-auto text-xs" defaultValue={toLocalInput(post.scheduledAt)} />
            {post.status === "SCHEDULED" ? (
              <button name="intent" value="unschedule" className="btn-secondary text-xs">Unschedule</button>
            ) : (
              <button name="intent" value="schedule" className="btn-primary text-xs" disabled={auto && !googleConnected}>
                {auto ? "Approve & schedule" : "Approve"}
              </button>
            )}
            {auto && googleConnected && <button name="intent" value="now" className="btn-secondary text-xs">Post now</button>}
            <button name="intent" value="save" className="btn-secondary text-xs">Save</button>
          </div>
        )}
      </form>
      {!done && (
        <div className="flex gap-2">
          {!auto && (
            <>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  navigator.clipboard?.writeText(post.link && post.channel !== "instagram" ? `${text}\n\n${post.link}` : text);
                  setCopied(true);
                }}
              >
                {copied ? "Copied ✓" : "Copy text"}
              </button>
              <form action={markPosted.bind(null, siteId, post.id)}><button className="btn-secondary text-xs">Mark as posted</button></form>
            </>
          )}
          <form action={deletePost.bind(null, siteId, post.id)} className="ml-auto"><button className="text-xs text-slate-400 hover:text-red-500">Delete</button></form>
        </div>
      )}
      {done && post.externalUrl && <a href={post.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-500">View on Google ↗</a>}
    </div>
  );
}

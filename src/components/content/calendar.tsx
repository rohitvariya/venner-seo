"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Clock, FileText, Globe, MoreHorizontal, Search } from "lucide-react";
import { removeFromPlan, rescheduleItem } from "@/app/actions";

export type CalItem = {
  id: string;
  kind: "article" | "post";
  channel: string | null; // for posts
  title: string;
  status: string;
  at: string; // ISO datetime
  searches: number | null;
  image: string | null;
  href: string;
  locked: boolean; // published items can't be dragged
};

const STATUS: Record<string, { label: string; cls: string }> = {
  IDEA: { label: "Planned", cls: "bg-slate-100 text-slate-600" },
  WRITING: { label: "Writing…", cls: "bg-amber-50 text-amber-700" },
  REVIEW: { label: "Needs your OK", cls: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  SCHEDULED: { label: "Scheduled", cls: "bg-violet-50 text-violet-700" },
  PUBLISHING: { label: "Publishing…", cls: "bg-amber-50 text-amber-700" },
  PUBLISHED: { label: "Live", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700" },
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600" },
};
const CHANNEL: Record<string, string> = { google: "Google post", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function Calendar({ siteId, items, view, anchor, filter }: {
  siteId: string;
  items: CalItem[];
  view: "week" | "month";
  anchor: string; // ISO date the view is built around
  filter: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [optimistic, move] = useOptimistic(items, (state, m: { id: string; day: string }) =>
    state.map((i) => (i.id === m.id ? { ...i, at: `${m.day}T${i.at.slice(11)}` } : i)),
  );

  const a = new Date(`${anchor}T00:00:00`);
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  let days: Date[];
  if (view === "week") {
    const s = startOfWeek(a);
    days = Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  } else {
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    const weeks = Math.ceil(((last.getTime() - s.getTime()) / 86400_000 + 1) / 7);
    days = Array.from({ length: weeks * 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  }
  const shift = (n: number) => {
    const d = view === "week" ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1);
    router.push(`?tab=calendar&view=${view}&date=${iso(d)}&type=${filter}`);
  };
  const title = view === "week"
    ? `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : a.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const inRange = optimistic.filter((i) => days.some((d) => iso(d) === i.at.slice(0, 10)));
  const todayIso = iso(new Date());

  const drop = (day: string, id: string) => {
    const item = optimistic.find((i) => i.id === id);
    if (!item || item.locked || item.at.slice(0, 10) === day) return;
    setError(null);
    start(async () => {
      move({ id, day });
      const res = await rescheduleItem(siteId, item.kind, id, day);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="btn-secondary p-2" aria-label="Previous"><ChevronLeft size={16} /></button>
          <button onClick={() => shift(1)} className="btn-secondary p-2" aria-label="Next"><ChevronRight size={16} /></button>
          <button onClick={() => router.push(`?tab=calendar&view=${view}&type=${filter}`)} className="btn-secondary ml-1 px-3 py-2">Today</button>
        </div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-slate-500">{inRange.length} going out{pending ? " · saving…" : ""}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={filter} onChange={(e) => router.push(`?tab=calendar&view=${view}&date=${anchor}&type=${e.target.value}`)} className="input w-auto py-1.5">
            <option value="all">All content</option>
            <option value="article">Articles</option>
            <option value="social">Social posts</option>
            <option value="google">Google posts</option>
          </select>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(["week", "month"] as const).map((v) => (
              <button key={v} onClick={() => router.push(`?tab=calendar&view=${v}&date=${anchor}&type=${filter}`)}
                className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-white font-medium text-brand-600 shadow-sm" : "text-slate-500"}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-3 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = iso(d);
            const list = optimistic.filter((i) => i.at.slice(0, 10) === key).sort((x, y) => x.at.localeCompare(y.at));
            const outside = view === "month" && d.getMonth() !== a.getMonth();
            return (
              <div key={key}
                onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); drop(key, e.dataTransfer.getData("text/plain")); }}
                className={`border-b border-r border-slate-100 p-1.5 ${view === "week" ? "min-h-[420px]" : "min-h-[150px]"} ${outside ? "bg-slate-50/60" : ""} ${dragOver === key ? "bg-brand-50" : ""}`}>
                <div className={`mb-1 px-1 text-xs ${key === todayIso ? "inline-block rounded-full bg-brand-500 px-2 font-semibold text-white" : outside ? "text-slate-300" : "text-slate-500"}`}>{d.getDate()}</div>
                <div className="space-y-1.5">
                  {list.map((i) => {
                    const st = STATUS[i.status] ?? STATUS.IDEA;
                    return (
                      <div key={i.id} draggable={!i.locked}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                        className={`group relative overflow-hidden rounded-lg border bg-white text-xs shadow-sm ${i.locked ? "" : "cursor-grab active:cursor-grabbing"} ${i.status === "FAILED" ? "border-red-200" : i.status === "REVIEW" ? "border-blue-200" : "border-slate-200"}`}>
                        {view === "week" && i.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image} alt="" className="h-20 w-full object-cover" />
                        )}
                        <div className="p-2">
                          <div className="mb-1 flex items-center justify-between gap-1 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              {i.kind === "article" ? <Globe size={11} /> : <FileText size={11} />}
                              {i.kind === "article" ? "Article" : CHANNEL[i.channel ?? ""] ?? "Post"}
                            </span>
                            <button onClick={() => setMenu(menu === i.id ? null : i.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100" aria-label="More">
                              <MoreHorizontal size={13} />
                            </button>
                          </div>
                          <Link href={i.href} className="line-clamp-2 font-medium text-slate-800 hover:text-brand-600">{i.title}</Link>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-0.5"><Clock size={10} />{new Date(i.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                            {i.searches != null && <span className="flex items-center gap-0.5"><Search size={10} />{i.searches}/mo</span>}
                          </div>
                          <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        {menu === i.id && (
                          <div className="absolute right-1 top-7 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                            <Link href={i.href} className="block rounded px-2 py-1.5 hover:bg-slate-50">Open</Link>
                            {i.locked ? (
                              <span className="block px-2 py-1.5 text-slate-400">Can&apos;t move this one</span>
                            ) : (
                              <button onClick={() => { setMenu(null); start(async () => { await removeFromPlan(siteId, i.kind, i.id); router.refresh(); }); }}
                                className="block w-full rounded px-2 py-1.5 text-left text-red-600 hover:bg-red-50">Remove from plan</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">Drag a card to another day to reschedule it. Live items stay where they are.</p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Briefcase, ChevronsUpDown, FileText, Globe, HelpCircle, Home, LogOut, Plug, Search, Settings,
  Sparkles, Star, TrendingUp, UserCircle2,
} from "lucide-react";
import { logout } from "@/app/actions";

type SiteLite = { id: string; domain: string; businessName: string | null };

type NavItem = { href: string; label: string; icon: React.ElementType; match: string[]; badge?: number };

export function AppShell(props: {
  siteId: string;
  site: SiteLite;
  sites: SiteLite[];
  user: { name: string | null; email: string };
  counts: { todo: number; review: number; reviews: number };
  searchItems: { label: string; href: string; kind: string }[];
  isClient?: boolean;
  brand?: { name: string; logoUrl: string | null };
  children: React.ReactNode;
}) {
  const { siteId, site, sites, user, counts, isClient = false } = props;
  const path = usePathname();
  const sp = useSearchParams();
  const matchesQuery = (href: string) => {
    if (!href.includes("?")) return !sp.get("tab");
    const want = new URLSearchParams(href.split("?")[1]);
    return [...want.entries()].every(([k, v]) => (sp.get(k) ?? defaultTab(path, k)) === v);
  };
  const base = `/sites/${siteId}`;

  const allRail: NavItem[] = [
    { href: base, label: "Home", icon: Home, match: [base + "$"], badge: counts.todo },
    { href: `${base}/content`, label: "Content", icon: FileText, match: ["/content", "/keywords", "/posts"], badge: counts.review },
    { href: `${base}/reviews`, label: "Reviews", icon: Star, match: ["/reviews", "/profile"], badge: counts.reviews },
    { href: `${base}/results`, label: "Results", icon: BarChart3, match: ["/results"] },
    { href: `${base}/grow`, label: "Grow", icon: TrendingUp, match: ["/grow"] },
    { href: `${base}/integrations`, label: "Connect", icon: Plug, match: ["/integrations"] },
    { href: `${base}/settings`, label: "Settings", icon: Settings, match: ["/settings"] },
  ];
  // Client logins see their results and approvals only.
  const rail = isClient ? allRail.filter((i) => ["Home", "Content", "Reviews", "Results"].includes(i.label)) : allRail;
  const bottom: NavItem[] = isClient
    ? [{ href: "/sites", label: "Account", icon: UserCircle2, match: [] }]
    : [
        { href: `${base}/business`, label: "Business", icon: Briefcase, match: ["/business"] },
        { href: "/sites", label: "Clients", icon: UserCircle2, match: [] },
      ];
  const isActive = (i: NavItem) =>
    i.match.some((m) => (m.endsWith("$") ? path === m.slice(0, -1) : path.startsWith(base + m) || path.startsWith(m)));
  const active = [...rail, ...bottom].find(isActive) ?? rail[0];

  const sub = useMemo(() => subNav(base, active.label, isClient), [base, active.label, isClient]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Icon rail */}
      <nav className="flex w-[68px] shrink-0 print:hidden flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
        {rail.map((i) => <RailLink key={i.label} item={i} active={active.label === i.label} />)}
        <div className="flex-1" />
        {bottom.map((i) => <RailLink key={i.label} item={i} active={active.label === i.label} />)}
        <RailLink item={{ href: "mailto:hello@vennerinfotech.com", label: "Help", icon: HelpCircle, match: [] }} active={false} />
      </nav>

      {/* Section sub-nav */}
      <aside className="flex w-56 shrink-0 print:hidden flex-col border-r border-slate-200 bg-white">
        <div className="px-4 pb-2 pt-4">
          <Link href="/sites" className="text-lg font-bold tracking-tight text-brand-600">
            {props.brand?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.brand.logoUrl} alt={props.brand.name} className="h-7 max-w-[160px] object-contain" />
            ) : isClient && props.brand ? (
              <span className="text-slate-900">{props.brand.name}</span>
            ) : (
              <>venner<span className="text-slate-900">SEO</span></>
            )}
          </Link>
        </div>
        <div className="relative px-3">
          <button
            onClick={() => setSwitcherOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-left hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Globe size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{site.businessName ?? site.domain}</span>
              <span className="block truncate text-xs text-slate-500">{site.domain}</span>
            </span>
            <ChevronsUpDown size={14} className="text-slate-400" />
          </button>
          {switcherOpen && (
            <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {sites.map((s) => (
                <Link key={s.id} href={`/sites/${s.id}`} onClick={() => setSwitcherOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 ${s.id === siteId ? "font-semibold text-brand-600" : ""}`}>
                  {s.businessName ?? s.domain}
                  <span className="block text-xs font-normal text-slate-500">{s.domain}</span>
                </Link>
              ))}
              {!isClient && <Link href="/sites" className="block rounded-lg px-3 py-2 text-sm text-brand-600 hover:bg-slate-50">All clients · + Add</Link>}
            </div>
          )}
        </div>
        <div className="mt-5 px-3">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{active.label}</div>
          <ul className="space-y-0.5">
            {sub.map((s) => {
              const on = s.exact ? path === s.href.split("?")[0] && matchesQuery(s.href) : path.startsWith(s.href.split("?")[0]) && matchesQuery(s.href);
              return (
                <li key={s.href}>
                  <Link href={s.href} className={`block rounded-lg px-2 py-1.5 text-sm ${on ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex-1" />
        <div className="m-3 flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-500 text-sm font-semibold text-white">
            {(user.name ?? user.email)[0].toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name ?? "You"}</span>
            <span className="block truncate text-xs text-slate-500">{user.email}</span>
          </span>
          <form action={logout}><button title="Sign out" className="text-slate-400 hover:text-red-500"><LogOut size={15} /></button></form>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 print:hidden items-center justify-between border-b border-slate-200 bg-white px-6">
          <h1 className="text-base font-semibold">{active.label}</h1>
          <button onClick={() => setPaletteOpen(true)}
            className="flex w-64 items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-300">
            <Search size={14} /> Search dashboard <kbd className="ml-auto rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">⌘K</kbd>
          </button>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8 print:overflow-visible print:p-0">{props.children}</main>
      </div>

      {paletteOpen && <CommandPalette base={base} items={props.searchItems} isClient={isClient} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function defaultTab(path: string, k: string) {
  if (k !== "tab") return null;
  if (path.endsWith("/content")) return "calendar";
  if (path.endsWith("/reviews")) return "todo";
  if (path.endsWith("/business")) return "customers";
  return null;
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} title={item.label}
      className={`relative flex w-14 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] ${active ? "bg-brand-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      {item.label}
      {!!item.badge && !active && (
        <span className="absolute right-1.5 top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white">{item.badge > 99 ? "99+" : item.badge}</span>
      )}
    </Link>
  );
}

function subNav(base: string, section: string, isClient = false): { href: string; label: string; exact?: boolean }[] {
  if (isClient) {
    if (section === "Content")
      return [
        { href: `${base}/content?tab=calendar`, label: "Calendar" },
        { href: `${base}/content?tab=articles`, label: "Articles" },
        { href: `${base}/content?tab=google`, label: "Google posts" },
        { href: `${base}/content?tab=social`, label: "Social" },
      ];
    if (section === "Reviews") return [{ href: `${base}/reviews?tab=all`, label: "Google reviews", exact: true }];
    if (section === "Results")
      return [
        { href: `${base}/results/report`, label: "Monthly report" },
        { href: `${base}/results`, label: "Google Search", exact: true },
        { href: `${base}/results/health`, label: "Website health" },
        { href: `${base}/results/maps`, label: "Google Maps" },
      ];
    return [{ href: base, label: "Overview", exact: true }];
  }
  switch (section) {
    case "Home":
      return [{ href: base, label: "Overview", exact: true }, { href: `${base}?tab=todo`, label: "To-do", exact: true }];
    case "Content":
      return [
        { href: `${base}/content?tab=calendar`, label: "Calendar" },
        { href: `${base}/content?tab=articles`, label: "Articles" },
        { href: `${base}/content?tab=social`, label: "Social" },
        { href: `${base}/content?tab=google`, label: "Google posts" },
        { href: `${base}/content?tab=photos`, label: "Photos" },
        { href: `${base}/keywords`, label: "Keywords" },
      ];
    case "Reviews":
      return [
        { href: `${base}/reviews?tab=todo`, label: "Google reviews", exact: true },
        { href: `${base}/reviews?tab=testimonials`, label: "Testimonials", exact: true },
        { href: `${base}/profile`, label: "Google profile" },
      ];
    case "Results":
      return [
        { href: `${base}/results`, label: "Google Search", exact: true },
        { href: `${base}/results/health`, label: "Website health" },
        { href: `${base}/results/maps`, label: "Google Maps" },
        { href: `${base}/grow`, label: "AI answers" },
        { href: `${base}/results/report`, label: "Client report" },
      ];
    case "Grow":
      return [
        { href: `${base}/grow`, label: "AI visibility", exact: true },
        { href: `${base}/grow/plan`, label: "30-day plan" },
        { href: `${base}/grow/ideas`, label: "Ideas" },
        { href: `${base}/grow/conversations`, label: "Conversations" },
        { href: `${base}/grow/directories`, label: "Directories" },
        { href: `${base}/grow/events`, label: "Events & holidays" },
        { href: `${base}/grow/report`, label: "Growth report" },
      ];
    case "Connect":
      return [{ href: `${base}/integrations`, label: "Connections" }];
    case "Business":
      return [
        { href: `${base}/business?tab=customers`, label: "Your customers" },
        { href: `${base}/business?tab=facts`, label: "Facts" },
        { href: `${base}/business?tab=searches`, label: "Searches" },
        { href: `${base}/business?tab=voice`, label: "Voice & author" },
      ];
    default:
      return [{ href: `${base}/settings`, label: "Content & posting" }, { href: `${base}/business`, label: "Business Blueprint" }];
  }
}

function CommandPalette({ base, items, isClient, onClose }: { base: string; items: { label: string; href: string; kind: string }[]; isClient: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const clientPages = [
    ["Home", base], ["Content calendar", `${base}/content`], ["Articles", `${base}/content?tab=articles`], ["Google posts", `${base}/content?tab=google`],
    ["Reviews", `${base}/reviews?tab=all`], ["Monthly report", `${base}/results/report`], ["Google Search", `${base}/results`],
    ["Website health", `${base}/results/health`], ["Google Maps", `${base}/results/maps`],
  ];
  const agencyPages = [
    ["Home", base], ["Content calendar", `${base}/content`], ["Articles", `${base}/content?tab=articles`],
    ["Social posts", `${base}/content?tab=social`], ["Google posts", `${base}/content?tab=google`], ["Photos", `${base}/content?tab=photos`],
    ["Keywords", `${base}/keywords`], ["Reviews", `${base}/reviews`], ["Testimonials", `${base}/reviews?tab=testimonials`], ["Google profile", `${base}/profile`], ["Results", `${base}/results`], ["Website health", `${base}/results/health`], ["Google Maps insights", `${base}/results/maps`], ["Grow: AI visibility", `${base}/grow`], ["30-day plan", `${base}/grow/plan`], ["Content ideas", `${base}/grow/ideas`], ["Conversations", `${base}/grow/conversations`], ["Directories", `${base}/grow/directories`], ["Events & holidays", `${base}/grow/events`], ["Growth report", `${base}/grow/report`],
    ["Connections", `${base}/integrations`], ["Settings", `${base}/settings`], ["Business Blueprint", `${base}/business`],
    ["Client report", `${base}/results/report`], ["All clients", "/sites"], ["Agency branding", "/sites/branding"],
  ];
  const pages = (isClient ? clientPages : agencyPages).map(([label, href]) => ({ label, href, kind: "Page" }));
  const all = [...pages, ...items];
  const results = (q ? all.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : pages).slice(0, 12);
  useEffect(() => input.current?.focus(), []);
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search size={16} className="text-slate-400" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, results.length - 1));
              if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
              if (e.key === "Enter" && results[sel]) go(results[sel].href);
            }}
            placeholder="Jump to a page or find an article…" className="h-12 flex-1 text-sm outline-none" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.map((r, i) => (
            <li key={r.href + r.label}>
              <button onClick={() => go(r.href)} onMouseEnter={() => setSel(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${i === sel ? "bg-brand-50 text-brand-700" : ""}`}>
                <span className="truncate">{r.label}</span>
                <span className="ml-3 shrink-0 text-xs text-slate-400">{r.kind}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No matches</li>}
        </ul>
        <div className="flex items-center gap-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-400"><Sparkles size={12} /> Tip: press ⌘K / Ctrl+K anywhere</div>
      </div>
    </div>
  );
}

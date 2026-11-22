"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ siteId, toReview }: { siteId: string; toReview: number }) {
  const path = usePathname();
  const base = `/sites/${siteId}`;
  const items = [
    { href: base, label: "Overview" },
    { href: `${base}/content`, label: "Content", badge: toReview },
    { href: `${base}/posts`, label: "Posts" },
    { href: `${base}/reviews`, label: "Reviews" },
    { href: `${base}/grow`, label: "Grow" },
    { href: `${base}/keywords`, label: "Keywords" },
    { href: `${base}/business`, label: "Business" },
    { href: `${base}/integrations`, label: "Integrations" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav className="space-y-1">
      {items.map((i) => {
        const active = i.href === base ? path === base : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-50 font-medium text-brand-600" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {i.label}
            {!!i.badge && <span className="rounded-full bg-brand-500 px-1.5 text-xs text-white">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

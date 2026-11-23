import Link from "next/link";
import { recentMonths } from "@/lib/report";

export function MonthPicker({ current, base }: { current: string; base: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 print:hidden">
      {recentMonths().map((m) => (
        <Link key={m.key} href={`${base}?month=${m.key}`}
          className={`rounded-full px-3 py-1 text-xs ${m.key === current ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{m.label}</Link>
      ))}
    </div>
  );
}

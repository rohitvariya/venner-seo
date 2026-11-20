"use client";

import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SubmitButton({
  children,
  pending,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={isPending}>
      {isPending ? pending ?? "Working…" : children}
    </button>
  );
}

/** Refreshes server data every few seconds while background jobs are running. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-600">{state.ok}</p>;
  return null;
}

"use client";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { dismissAlert } from "@/app/actions/shell";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/EmptyState";

export interface AlertRow { id: string; priority: string; title: string; body: string | null; link: string | null; type: string; due_date: string | null; read_at: string | null }

const DOT: Record<string, string> = { critical: "bg-neg", high: "bg-warn", normal: "bg-info", low: "bg-ink-4" };

/** Actionable, priority-based, dismissible, linked alerts (spec §80). */
export function AlertList({ alerts, compact }: { alerts: AlertRow[]; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!alerts.length) return <EmptyState title="No open alerts" body="Everything that needs attention will show up here." />;
  return (
    <ul className={cn("divide-y divide-line", pending && "opacity-60")}>
      {alerts.map((a) => (
        <li key={a.id} className="group flex items-start gap-3 px-5 py-3">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[a.priority] ?? "bg-ink-4")} />
          <Link href={a.link ?? "#"} className="min-w-0 flex-1" onClick={() => start(async () => { await dismissAlert(a.id, true); })}>
            <p className={cn("text-[13.5px] leading-snug", !a.read_at && "font-medium")}>{a.title}</p>
            {a.body && !compact && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{a.body}</p>}
          </Link>
          <button title="Dismiss" onClick={() => start(async () => { await dismissAlert(a.id); router.refresh(); })}
            className="rounded p-1 text-ink-4 opacity-0 transition-opacity hover:bg-muted hover:text-ink group-hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

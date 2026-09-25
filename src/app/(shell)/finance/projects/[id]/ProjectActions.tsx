"use client";
import { useState } from "react";
import { ChevronDown, HandCoins, Receipt } from "lucide-react";
import { setProjectStatus } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { ExpenseDialog } from "@/components/finance/ExpenseForm";
import { CollectionDialog } from "@/components/finance/forms";
import { humanize } from "@/lib/format";
import type { Lookups } from "@/services/queries";

export function ProjectActions({ projectId, project, lookups, milestones, can, closed }: {
  projectId: string; project: { code: string; operational_status: string; financial_status: string }; lookups: Lookups;
  milestones: { milestone_id: string; label: string; outstanding: number; due_date: string | null }[];
  can: { finance: boolean; projects: boolean; reopen: boolean }; closed: boolean;
}) {
  const [open, setOpen] = useState<"expense" | "collection" | null>(null);
  const [menu, setMenu] = useState(false);
  const status = useAction(setProjectStatus, { success: "Status updated" });
  return (
    <>
      {can.projects && (
        <div className="relative">
          <Button variant="secondary" onClick={() => setMenu((m) => !m)}>{humanize(project.operational_status)} <ChevronDown className="size-3.5" /></Button>
          {menu && (
            <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]" onMouseLeave={() => setMenu(false)}>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">Operational status</p>
              {["lead", "confirmed", "preparation", "live", "completed", "cancelled"].map((s) => (
                <button key={s} disabled={s === project.operational_status || status.pending}
                  onClick={() => { setMenu(false); status.run(projectId, s, null, null); }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted disabled:text-ink-4">{humanize(s)}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {can.finance && !closed && (
        <>
          <Button onClick={() => setOpen("expense")}><Receipt className="size-4" />Add expense</Button>
          <Button variant="primary" onClick={() => setOpen("collection")}><HandCoins className="size-4" />Record payment</Button>
        </>
      )}
      {open === "expense" && <ExpenseDialog open onClose={() => setOpen(null)} lookups={lookups} projectId={projectId} />}
      {open === "collection" && <CollectionDialog open onClose={() => setOpen(null)} lookups={lookups} projectId={projectId} milestones={milestones} />}
    </>
  );
}

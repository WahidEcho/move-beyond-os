"use client";
import { useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { AllocateCtoDialog, TechnologyDialog } from "@/components/finance/forms";
import { humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CtoActions({ lookups, canManage, canRecover }: { lookups: Lookups; canManage: boolean; canRecover: boolean }) {
  const [open, setOpen] = useState<"tech" | "alloc" | null>(null);
  return (
    <>
      {canRecover && <Button onClick={() => setOpen("alloc")}><Banknote className="size-4" />Allocate recovery</Button>}
      {canManage && <Button variant="primary" onClick={() => setOpen("tech")}><Plus className="size-4" />Add CTO development</Button>}
      {open === "tech" && <TechnologyDialog open onClose={() => setOpen(null)} lookups={lookups} />}
      {open === "alloc" && <AllocateCtoDialog open onClose={() => setOpen(null)} lookups={lookups} />}
    </>
  );
}

export function CtoTable({ rows }: { rows: any[] }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.technology_id} rowHref={(r) => `/finance/cto/${r.technology_id}`} exportName="cto-recovery" footer
      filters={[{ key: "s", label: "Status", options: ["recovery_pending", "partially_recovered", "fully_recovered", "cancelled", "archived"].map((v) => ({ value: v, label: humanize(v) })), match: (r, v) => r.recovery_status === v }]}
      columns={[
        { key: "name", header: "Technology", cell: (r) => <div><p className="font-medium">{r.name}</p><p className="text-[12px] text-ink-3">{r.category_name ?? "—"} · {r.developer_name}</p></div> },
        { key: "approved_value", header: "Value", align: "right", cell: (r) => <Money value={r.approved_value} />, total: true, value: (r) => toNum(r.approved_value) },
        { key: "recovered", header: "Recovered", align: "right", cell: (r) => <Money value={r.recovered} />, total: true, value: (r) => toNum(r.recovered) },
        { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <b><Money value={r.outstanding} /></b>, total: true, value: (r) => toNum(r.outstanding) },
        { key: "progress", header: "Recovery", sortable: false, cell: (r) => {
          const p = toNum(r.approved_value) ? Math.min(100, (toNum(r.recovered) / toNum(r.approved_value)) * 100) : 0;
          return <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-pos" style={{ width: `${p}%` }} /></div>;
        } },
        { key: "projects_used", header: "Projects used", align: "right", value: (r) => toNum(r.projects_used) },
        { key: "recovery_status", header: "Status", cell: (r) => <StatusBadge status={r.recovery_status} /> },
      ]} />
  );
}

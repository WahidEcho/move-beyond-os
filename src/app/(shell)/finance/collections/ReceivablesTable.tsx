"use client";
import { useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Button } from "@/components/ui/Button";
import { CollectionDialog } from "@/components/finance/forms";
import { date, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ReceivablesTable({ rows, lookups }: { rows: any[]; lookups: Lookups }) {
  const [collect, setCollect] = useState<any>(null);
  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.milestone_id} exportName="receivables" footer initialSort={{ key: "due_date", dir: "asc" }}
        filters={[
          { key: "b", label: "Ageing", options: [["current", "Current"], ["1_30", "1–30"], ["31_60", "31–60"], ["61_90", "61–90"], ["90_plus", "90+"]].map(([v, l]) => ({ value: v, label: l })), match: (r, v) => r.ageing_bucket === v },
          { key: "k", label: "Kind", options: [{ value: "sub", label: "Subscriptions" }, { value: "proj", label: "Projects" }], match: (r, v) => (v === "sub" ? !!r.subscription_id : !r.subscription_id) },
        ]}
        columns={[
          { key: "client_name", header: "Client", cell: (r) => <span className="font-medium">{r.client_name ?? "—"}</span> },
          { key: "project", header: "Project", cell: (r) => <Link href={`/finance/projects/${r.project_id}?tab=revenue`} className="hover:underline"><span className="num text-ink-3">{r.project_code}</span> {r.project_name}</Link>, value: (r) => `${r.project_code} ${r.project_name}` },
          { key: "label", header: "Milestone" },
          { key: "due_date", header: "Due", cell: (r) => date(r.due_date) },
          { key: "outstanding", header: "Outstanding", align: "right", cell: (r) => <b><Money value={toNum(r.outstanding) * toNum(r.fx_rate)} /></b>, value: (r) => toNum(r.outstanding) * toNum(r.fx_rate), total: true },
          { key: "ageing_bucket", header: "Ageing", cell: (r) => (r.days_overdue > 0 ? <Badge tone={r.days_overdue > 60 ? "neg" : "warn"}>{r.days_overdue}d overdue</Badge> : <StatusBadge status="current" />) },
          { key: "act", header: "", sortable: false, cell: (r) => <Button size="sm" onClick={() => setCollect(r)}>Record payment</Button> },
        ]} />
      {collect && <CollectionDialog open onClose={() => setCollect(null)} lookups={lookups} projectId={collect.project_id} milestones={[collect]} />}
    </>
  );
}

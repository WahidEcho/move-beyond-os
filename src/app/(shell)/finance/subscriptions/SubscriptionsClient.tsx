"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { billSubscription, setSubscriptionStatus } from "@/app/actions/finance";
import { useAction } from "@/components/ui/useAction";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { SubscriptionDialog } from "@/components/finance/forms";
import { date, humanize, toNum } from "@/lib/format";
import type { Lookups } from "@/services/queries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function NewSubscriptionButton({ lookups }: { lookups: Lookups }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" />Create subscription</Button>{open && <SubscriptionDialog open onClose={() => setOpen(false)} lookups={lookups} />}</>;
}

export function SubscriptionsTable({ rows, canManage }: { rows: any[]; canManage: boolean }) {
  const bill = useAction(billSubscription, { success: "Next period invoiced" });
  const status = useAction(setSubscriptionStatus, { success: "Status updated" });
  return (
    <DataTable rows={rows} rowKey={(r) => r.subscription_id} exportName="subscriptions" footer
      filters={[{ key: "s", label: "Status", options: ["trial", "active", "paused", "cancelled", "expired"].map((v) => ({ value: v, label: humanize(v) })), match: (r, v) => r.status === v }]}
      columns={[
        { key: "client_name", header: "Client", cell: (r) => <Link className="font-medium hover:underline" href={`/finance/projects/${r.project_id}`}>{r.client_name}</Link> },
        { key: "plan", header: "Plan", cell: (r) => <div><p>{r.plan_name}</p><p className="text-[12px] text-ink-3">{r.service_name ?? "—"} · {humanize(r.billing_cycle)}</p></div>, value: (r) => r.plan_name },
        { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { key: "cycle_total", header: "Per cycle", align: "right", cell: (r) => <Money value={toNum(r.cycle_total) * toNum(r.fx_rate)} />, value: (r) => toNum(r.cycle_total) },
        { key: "mrr", header: "MRR", align: "right", cell: (r) => <Money value={r.mrr} />, value: (r) => toNum(r.mrr), total: true },
        { key: "invoiced", header: "Invoiced", align: "right", cell: (r) => <Money value={r.invoiced} />, value: (r) => toNum(r.invoiced), total: true },
        { key: "collected", header: "Collected", align: "right", cell: (r) => <Money value={r.collected} />, value: (r) => toNum(r.collected), total: true },
        { key: "next_billing_date", header: "Next billing", cell: (r) => date(r.status === "trial" ? r.trial_end_date : r.next_billing_date) },
        { key: "act", header: "", sortable: false, cell: (r) => canManage && (
          <div className="flex justify-end gap-1">
            {r.status === "active" && <Button size="sm" loading={bill.pending} onClick={() => bill.run(r.subscription_id)}>Invoice next</Button>}
            {r.status === "trial" && <Button size="sm" onClick={() => status.run(r.subscription_id, "active", "Trial converted")}>Activate</Button>}
            {r.status === "active" && <Button size="sm" variant="ghost" onClick={() => status.run(r.subscription_id, "paused", null)}>Pause</Button>}
            {r.status === "paused" && <Button size="sm" variant="ghost" onClick={() => status.run(r.subscription_id, "active", null)}>Resume</Button>}
            {["active", "paused", "trial"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancel this subscription?")) status.run(r.subscription_id, "cancelled", "Cancelled by user"); }}>Cancel</Button>}
          </div>) },
      ]} />
  );
}

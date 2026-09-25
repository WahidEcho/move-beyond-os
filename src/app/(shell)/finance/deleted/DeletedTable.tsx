"use client";
import Link from "next/link";
import { DataTable } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { dateTime, humanize } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function DeletedTable({ rows }: { rows: any[] }) {
  return <DataTable rows={rows} rowKey={(r) => `${r.record_type}-${r.id}`} exportName="deleted-records"
    filters={[{ key: "t", label: "Type", options: Array.from(new Set(rows.map((r) => r.record_type))).map((t) => ({ value: t, label: humanize(t) })), match: (r, v) => r.record_type === v }]}
    columns={[
      { key: "deleted_at", header: "Deleted", cell: (r) => dateTime(r.deleted_at) },
      { key: "record_type", header: "Type", cell: (r) => <Badge>{humanize(r.record_type)}</Badge> },
      { key: "label", header: "Record", cell: (r) => r.project_id && r.record_type !== "project" ? <Link className="hover:underline" href={`/finance/projects/${r.project_id}?tab=activity`}>{r.label}</Link> : r.label },
      { key: "amount", header: "Amount", align: "right", cell: (r) => (r.amount !== null ? <Money value={r.amount} /> : "—") },
      { key: "deleted_reason", header: "Reason" },
    ]} />;
}
